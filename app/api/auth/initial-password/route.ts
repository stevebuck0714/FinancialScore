import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { auditLog } from '@/lib/audit-logger';

export const runtime = 'nodejs';

/**
 * First sign-in with an administrator-issued temporary password.
 * Without newPassword: reports whether the credentials are a temporary password.
 * With newPassword: replaces the temporary password so normal sign-in can proceed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').toLowerCase().trim();
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!email || !currentPassword) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, mustChangePassword: true },
    });
    const validCredentials = Boolean(
      user?.passwordHash && (await verifyPassword(currentPassword, user.passwordHash)),
    );
    if (!user || !validCredentials) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (!newPassword) {
      return NextResponse.json({ passwordChangeRequired: user.mustChangePassword });
    }

    if (!user.mustChangePassword) {
      return NextResponse.json(
        { error: 'This account does not have a temporary password to replace' },
        { status: 400 },
      );
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Password does not meet requirements', details: validation.errors },
        { status: 400 },
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'Choose a new password that is different from your temporary password' },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
    await auditLog({
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: user.id,
      changes: { reason: 'temporary_password_replaced' },
      success: true,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Initial password change failed:', error);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }
}
