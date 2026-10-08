import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { auditForbiddenAccess, auditLog } from '@/lib/audit-logger';

export const dynamic = 'force-dynamic';

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
