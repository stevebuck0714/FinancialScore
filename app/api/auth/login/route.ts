import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { auditLoginSuccess, auditLoginFailed, auditMFAOperation } from '@/lib/audit-logger';
import { getTrustDurationDays, validateTrustedDevice } from '@/lib/trusted-device';
import { getMfaAppScope } from '@/lib/mfa-app-scope';
import { clearMfaDeviceCookie, getMfaDeviceCookieName, getMfaDeviceCookieOptions } from '@/lib/mfa-device-cookie';
import { ensureLegacyCompanyAccess, listAccessibleCompaniesForUser } from '@/lib/user-company-access';
import { isDemoCompany, isDemoExpired, shouldBypassMfaForDemo } from '@/lib/demo-access';

const DEV_DEFAULT_COMPANY_NAME = 'test atlantic precision CSI';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Login attempt starting...');
    console.log('🔗 DATABASE_URL configured:', Boolean(process.env.DATABASE_URL));
    const { email, password } = await request.json();
    console.log('📧 Email:', email);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Normalize email to lowercase for case-insensitive login
    const normalizedEmail = email.toLowerCase().trim();
    console.log('📧 Normalized Email:', normalizedEmail);

    console.log('🔍 Querying database for user...');
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        company: true,
        primaryConsultant: true,
        consultantFirm: true
      }
    });
    console.log('✅ User found:', user ? 'YES' : 'NO');
    if (user) {
      console.log('👤 User details:', {
        id: user.id,
        email: user.email,
        role: user.role,
        hasPasswordHash: !!user.passwordHash
      });
    }

    if (!user) {
      console.log('❌ No user found with email:', email);
      await auditLoginFailed(normalizedEmail, 'User not found');
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    console.log('🔑 Verifying password...');
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    console.log('🔑 Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.log('❌ Invalid password');
      await auditLoginFailed(normalizedEmail, 'Invalid password');
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const demoCompany = isDemoCompany(user.company);
    const demoExpired = isDemoExpired(user.company);
    if (demoExpired) {
      await auditLoginFailed(normalizedEmail, 'Demo period expired');
      return NextResponse.json(
        { error: 'Your 7-day demo has expired. Please upgrade to continue.' },
        { status: 403 }
      );
    }

    // MFA policy:
    // - Production runtime should require MFA.
    // - Dev/staging should allow disabling MFA for simple access/testing.
    const isVercelProd = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';
    const requireMfa =
      isVercelProd &&
      process.env.DISABLE_MFA !== 'true' &&
      process.env.DISABLE_MFA_DEV !== 'true' &&
      !shouldBypassMfaForDemo(user.company);
    const appScope = getMfaAppScope(request);

    let legacyTokenToPromote: string | null = null;

    if (requireMfa) {
      // SECURITY: MFA is mandatory in production runtime.
      // Trusted-device bypass should still work for previously enrolled users.
      if (!user.mfaEnabled || !user.mfaSecret) {
        console.log('🔒 MFA not enabled - enrollment required');
        await auditMFAOperation('MFA_FAILED', user.id, true);
        return NextResponse.json({
          mfaEnrollmentRequired: true,
          userId: user.id,
          email: user.email,
          trustDurationDays: getTrustDurationDays(),
          message: 'MFA enrollment is required for this app',
        });
      }

      // Check for trusted device BEFORE requiring MFA challenge.
      const userScopedCookieName = getMfaDeviceCookieName(user.id);
      const legacyCookieName = getMfaDeviceCookieName();
      const userScopedToken = request.cookies.get(userScopedCookieName)?.value;
      const legacyToken = request.cookies.get(legacyCookieName)?.value;
      const deviceToken = userScopedToken || legacyToken;
      if (deviceToken) {
        console.log('🔍 Checking trusted device token...');
        const validation = await validateTrustedDevice(user.id, deviceToken, request);
        
        if (validation.valid) {
          console.log('✅ Trusted device validated - skipping MFA');
          // Promote legacy/shared cookie into user-scoped cookie to avoid
          // cross-account trust invalidation in the same browser.
          if (!userScopedToken && legacyToken) {
            legacyTokenToPromote = legacyToken;
          }
          // Device is trusted, skip MFA and proceed with login
        } else {
          console.log('⚠️ Trusted device validation failed:', validation.reason);
          // Clear invalid cookie and challenge for MFA.
          const response = NextResponse.json({
            mfaRequired: true,
            userId: user.id,
            trustDurationDays: getTrustDurationDays(),
            message: 'MFA verification required',
          });
          clearMfaDeviceCookie(response, request, user.id);
          if (legacyToken) {
            clearMfaDeviceCookie(response, request);
          }
          return response;
        }
      } else {
        // No trusted device token, require MFA.
        console.log('🔐 No trusted device found, requiring MFA verification');
        return NextResponse.json({
          mfaRequired: true,
          userId: user.id,
          trustDurationDays: getTrustDurationDays(),
          message: 'MFA verification required',
        });
      }
    } else {
      console.log('🔓 MFA check skipped (non-production or disabled).');
    }

    await ensureLegacyCompanyAccess(user.id);
    const accessibleCompanies = await listAccessibleCompaniesForUser(user.id);
    const cookieActiveCompanyId = request.cookies.get('fs_active_company')?.value;
    const activeCompanyId =
      accessibleCompanies.find((c) => c.companyId === cookieActiveCompanyId)?.companyId ||
      (process.env.NODE_ENV !== 'production'
        ? accessibleCompanies.find(
            (c) => c.name.toLowerCase() === DEV_DEFAULT_COMPANY_NAME.toLowerCase()
          )?.companyId
        : null) ||
      accessibleCompanies[0]?.companyId ||
      user.companyId ||
      null;

    console.log('✅ Login successful');
    
    // AUDIT: Log successful login
    await auditLoginSuccess(user.id);
    
    // Auto-fix: Set userType for existing business users who don't have it set
    // Business users are: role='USER', have companyId, and company has no consultantId (standalone business)
    if (user.role === 'USER' && user.companyId && !user.userType) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { consultantId: true }
      });
      
      // If this is a standalone business (no consultant), set userType to COMPANY
      if (company && !company.consultantId) {
        console.log(`🔧 Auto-fixing userType for business user: ${user.email}`);
        await prisma.user.update({
          where: { id: user.id },
          data: { userType: 'COMPANY' }
        });
        user.userType = 'COMPANY';
        console.log(`✅ Set userType to COMPANY for ${user.email}`);
      }
    }
    
    // Auto-fix: Set companyRole to 'admin' for standalone business owners without companyRole.
    // IMPORTANT: Do NOT auto-promote consultant-managed company users.
    console.log('🔍 Checking companyRole auto-fix:', {
      role: user.role,
      companyId: user.companyId,
      userType: user.userType,
      isPrimaryContact: user.isPrimaryContact,
      companyConsultantId: user.company?.consultantId,
      currentCompanyRole: user.companyRole
    });
    
    const isStandaloneBusiness = user.role === 'USER' && user.userType === 'COMPANY' && !!user.companyId && !user.company?.consultantId;
    if (isStandaloneBusiness && user.isPrimaryContact && !user.companyRole) {
      console.log(`🔧 Auto-fixing companyRole for business user: ${user.email}`);
      await prisma.user.update({
        where: { id: user.id },
        data: { companyRole: 'admin' }
      });
      user.companyRole = 'admin';
      console.log(`✅ Set companyRole to admin for ${user.email}`);
    }
    
    // Get consultant info - either from primaryConsultant relation or consultantFirm relation
    const consultant = user.primaryConsultant || user.consultantFirm;
    const consultantId = consultant?.id || user.consultantId;
    
    // Return user data (password hash excluded)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userType: user.userType,
        companyRole:
          accessibleCompanies.find((c) => c.companyId === activeCompanyId)?.companyRole ||
          user.companyRole,
        sidebarAccess:
          (accessibleCompanies.find((c) => c.companyId === activeCompanyId)?.sidebarAccess as any) ??
          user.sidebarAccess,
        operationalDashboardAccess:
          (accessibleCompanies.find((c) => c.companyId === activeCompanyId)?.operationalDashboardAccess as any) ??
          user.operationalDashboardAccess,
        companyId: activeCompanyId,
        consultantId: consultantId,
        isPrimaryContact: user.isPrimaryContact,
        consultantType: consultant?.type,
        consultantCompanyName: consultant?.companyName,
        demoCompany,
        demoExpired,
        demoExpiresAt: user.company?.nextBillingDate?.toISOString() || null,
        accessibleCompanies,
      },
      activeCompanyId,
    });

    if (activeCompanyId) {
      response.cookies.set('fs_active_company', activeCompanyId, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    if (legacyTokenToPromote) {
      response.cookies.set(
        getMfaDeviceCookieName(user.id),
        legacyTokenToPromote,
        getMfaDeviceCookieOptions(request, getTrustDurationDays() * 24 * 60 * 60)
      );
      clearMfaDeviceCookie(response, request);
    }

    return response;
  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


