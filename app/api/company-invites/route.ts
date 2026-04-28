import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  createInviteToken,
  getCompanyInvites,
  hashInviteToken,
  type CompanyUserInvite,
  upsertCompanyInvites,
} from '@/lib/company-invites';
import { sendCompanyUserInviteEmail } from '@/lib/email';
import { grantUserCompanyAccess } from '@/lib/user-company-access';
import { auditUserOperation } from '@/lib/audit-logger';

const INVITE_EXPIRY_DAYS = Number(process.env.COMPANY_INVITE_EXPIRY_DAYS || 7);

function normalizeUserType(value: unknown): 'COMPANY' | 'ASSESSMENT' | null {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'COMPANY' || v === 'ASSESSMENT') return v;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const userType = normalizeUserType(body?.userType);

    if (!companyId || !name || !email || !userType) {
      return NextResponse.json(
        { error: 'companyId, name, email, and valid userType are required' },
        { status: 400 },
      );
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // USER role requires company-admin membership to invite.
    if (context.role === 'USER') {
      const membership = await (prisma as any).userCompanyAccess?.findUnique?.({
        where: {
          userId_companyId: {
            userId: context.userId,
            companyId,
          },
        },
        select: { companyRole: true },
      });
      const user = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { companyRole: true, companyId: true },
      });
      const role = String(
        membership?.companyRole ||
          (user?.companyId === companyId ? user?.companyRole : ''),
      ).toLowerCase();
      if (role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden: Only company admins can invite users' },
          { status: 403 },
        );
      }
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, consultantId: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true, userType: true, companyId: true },
    });

    // Existing identity: just grant access immediately (no invite token required).
    if (existingUser) {
      const grant = await grantUserCompanyAccess({
        userId: existingUser.id,
        companyId,
        companyRole: userType === 'COMPANY' ? 'user' : undefined,
      });
      if (!grant.created) {
        return NextResponse.json(
          { error: 'User already has access to this company' },
          { status: 409 },
        );
      }
      await auditUserOperation('USER_UPDATED', existingUser.id, {
        action: 'company_access_granted_via_invite_flow',
        companyId,
        invitedBy: context.userId,
      });
      return NextResponse.json({
        linkedExistingUser: true,
        user: existingUser,
      });
    }

    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);
    const now = Date.now();
    const expiresAt = new Date(now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const invites = getCompanyInvites(company.userDefinedAllocations);
    const filtered = invites.filter((i) => {
      const sameTarget =
        String(i?.email || '').toLowerCase() === email &&
        String(i?.userType || '').toUpperCase() === userType &&
        String(i?.status || '') === 'pending';
      return !sameTarget;
    });

    const invite: CompanyUserInvite = {
      id: crypto.randomUUID(),
      email,
      name,
      userType,
      tokenHash,
      status: 'pending',
      expiresAt,
      createdAt: new Date(now).toISOString(),
      createdByUserId: context.userId,
      createdByEmail: context.email,
    };

    const updatedUDA = upsertCompanyInvites(company.userDefinedAllocations, [
      ...filtered,
      invite,
    ]);
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA as any },
    });

    const baseUrl = String(
      process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin || 'http://localhost:3002'
    ).replace(/\/+$/, '');
    const inviteLink = `${baseUrl}/accept-invite/${token}`;
    await sendCompanyUserInviteEmail({
      to: email,
      inviteeName: name,
      companyName: company.name || 'Company',
      inviterNameOrEmail: context.email,
      inviteLink,
      expiresAt,
      userType,
    });

    await auditUserOperation('USER_CREATED', context.userId, {
      action: 'company_user_invite_created',
      companyId,
      email,
      userType,
    });

    return NextResponse.json({
      inviteSent: true,
      email,
      expiresAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create invite' },
      { status: 500 },
    );
  }
}

