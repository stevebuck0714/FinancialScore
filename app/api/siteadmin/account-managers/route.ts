import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { requireAuth } from '@/lib/tenant-security';
import { auditForbiddenAccess, auditLog, auditUserOperation } from '@/lib/audit-logger';
import { sendWelcomeUserEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a Corelytics Account Manager. Account Managers belong to Corelytics,
 * not to a client company, so the login has no home company; client companies
 * are granted afterward through UserCompanyAccess.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    if (context.role !== 'SITEADMIN') {
      await auditForbiddenAccess('User', 'account-manager', 'CREATE_ACCOUNT_MANAGER');
      return NextResponse.json({ error: 'Forbidden: Site admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const title = String(body.title || '').trim() || 'Account Manager';
    const phone = String(body.phone || '').trim() || null;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'Password does not meet requirements', details: passwordValidation.errors },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json(
        { error: 'A login with this email already exists' },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        title,
        phone,
        passwordHash: await hashPassword(password),
        role: 'USER',
        userType: 'COMPANY',
        companyId: null,
        consultantId: null,
        companyRole: null,
        isAccountManager: true,
      },
      select: { id: true, name: true, email: true, title: true, phone: true, isAccountManager: true, createdAt: true },
    });

    await auditUserOperation('USER_CREATED', user.id, {
      email: user.email,
      role: 'USER',
      isAccountManager: true,
    });

    let welcomeEmailSent = false;
    let welcomeEmailError: string | null = null;
    try {
      const requester = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { name: true, email: true },
      });
      const baseUrl = String(
        process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin,
      ).replace(/\/+$/, '');
      const result = await sendWelcomeUserEmail({
        to: user.email,
        userName: user.name || user.email,
        companyName: 'Corelytics',
        addedByNameOrEmail: requester?.name?.trim() || requester?.email || 'A Corelytics administrator',
        loginLink: baseUrl,
        userType: 'COMPANY',
        roleLabel: 'Corelytics Account Manager',
      });
      if (result.success) {
        welcomeEmailSent = true;
      } else {
        welcomeEmailError = (result as { reason?: string }).reason || 'Email delivery failed';
      }
    } catch (emailError) {
      welcomeEmailError = emailError instanceof Error ? emailError.message : 'Email delivery failed';
    }

    return NextResponse.json({ user, welcomeEmailSent, welcomeEmailError }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error creating Account Manager:', error);
    return NextResponse.json({ error: 'Failed to create Account Manager' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAuth();
    if (context.role !== 'SITEADMIN') {
      await auditForbiddenAccess('User', 'account-manager', 'SET_ACCOUNT_MANAGER');
      return NextResponse.json({ error: 'Forbidden: Site admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      userId?: unknown;
      isAccountManager?: unknown;
    };
    const userId = String(body.userId || '').trim();
    if (!userId || typeof body.isAccountManager !== 'boolean') {
      return NextResponse.json(
        { error: 'userId and isAccountManager (boolean) are required' },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isAccountManager: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (target.role !== 'USER') {
      return NextResponse.json(
        { error: 'Only company users can be Account Managers' },
        { status: 400 },
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isAccountManager: body.isAccountManager },
      select: { id: true, isAccountManager: true },
    });

    await auditLog({
      action: 'USER_ACCOUNT_MANAGER_CHANGED',
      entityType: 'User',
      entityId: userId,
      changes: { isAccountManager: { from: target.isAccountManager, to: updated.isAccountManager } },
      success: true,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error updating Account Manager flag:', error);
    return NextResponse.json({ error: 'Failed to update Account Manager setting' }, { status: 500 });
  }
}
