import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { ensureLegacyCompanyAccess, listAccessibleCompaniesForUser } from '@/lib/user-company-access';
import { isDemoCompany, isDemoExpired } from '@/lib/demo-access';

export const dynamic = 'force-dynamic';
const DEV_DEFAULT_COMPANY_NAME = 'test atlantic precision CSI';

export async function GET(request: NextRequest) {
  try {
    console.log('👤 /api/auth/me called');
    
    // Get session
    const session = await auth();
    
    if (!session?.user?.id) {
      console.error('❌ No session found');
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.log('✅ Session found for user:', session.user.id);

    // Get full user data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        company: true,
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    if (!user) {
      console.error('❌ User not found in database');
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const demoCompany = isDemoCompany(user.company);
    const demoExpired = isDemoExpired(user.company);
    if (demoExpired) {
      return NextResponse.json(
        { error: 'Demo expired', message: 'Your 7-day demo has expired. Please upgrade to continue.' },
        { status: 403 }
      );
    }

    console.log('✅ User data retrieved:', user.email);
    await ensureLegacyCompanyAccess(user.id);
    const accessibleCompanies = await listAccessibleCompaniesForUser(user.id);
    const cookieActiveCompanyId = request.cookies.get('fs_active_company')?.value;
    let cookieCompanyId: string | null = null;
    if (cookieActiveCompanyId) {
      const inAccessibleList = accessibleCompanies.some((c) => c.companyId === cookieActiveCompanyId);
      if (inAccessibleList) {
        cookieCompanyId = cookieActiveCompanyId;
      } else if (user.role === 'SITEADMIN') {
        const companyExists = await prisma.company.findUnique({
          where: { id: cookieActiveCompanyId },
          select: { id: true },
        });
        if (companyExists?.id) {
          cookieCompanyId = companyExists.id;
        }
      }
    }

    const activeCompanyId =
      cookieCompanyId ||
      (process.env.NODE_ENV !== 'production'
        ? accessibleCompanies.find(
            (c) => c.name.toLowerCase() === DEV_DEFAULT_COMPANY_NAME.toLowerCase()
          )?.companyId
        : null) ||
      accessibleCompanies[0]?.companyId ||
      user.companyId ||
      null;

    // Get consultant info
    const consultant = user.primaryConsultant || user.consultantFirm;
    const consultantId = consultant?.id || user.consultantId;

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
        mfaEnabled: user.mfaEnabled,
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

    return response;
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}

