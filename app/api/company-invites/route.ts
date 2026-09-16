import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess, isCompanyAdminForCompany } from '@/lib/tenant-security';
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
import { generateSecureToken, hashPassword } from '@/lib/auth';

const INVITE_EXPIRY_DAYS = Number(process.env.COMPANY_INVITE_EXPIRY_DAYS || 7);

function normalizeUserType(value: unknown): 'COMPANY' | 'ASSESSMENT' | null {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'COMPANY' || v === 'ASSESSMENT') return v;
  return null;
}

const invitedUserSelect = {
  id: true,
  name: true,
  title: true,
  phone: true,
  email: true,
  userType: true,
  role: true,
  companyId: true,
  consultantId: true,
  companyRole: true,
  sidebarAccess: true,
  operationalDashboardAccess: true,
  createdAt: true,
} as const;

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const employerCompanyName = String(body?.employerCompanyName || '').trim();
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
      if (!(await isCompanyAdminForCompany(context.userId, companyId))) {
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
      const linkedUser = await prisma.user.findUnique({
        where: { id: existingUser.id },
        select: invitedUserSelect,
      });
      return NextResponse.json({
        linkedExistingUser: true,
        user: linkedUser
          ? {
              ...linkedUser,
              homeCompanyId: linkedUser.companyId,
              companyId,
              isExternalCompanyUser:
                Boolean(linkedUser.companyId) && String(linkedUser.companyId) !== String(companyId),
              invitePending: false,
              employerCompanyName: employerCompanyName || undefined,
            }
          : existingUser,
      });
    }

    // New invitee: create a stub User + company access immediately so Manage Users
    // can assign rights before they accept the invite and set a password.
    const stubPasswordHash = await hashPassword(generateSecureToken());
    const pendingUser = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: stubPasswordHash,
        role: 'USER',
        userType,
        companyId,
        consultantId: company.consultantId || null,
        companyRole: userType === 'COMPANY' ? 'user' : null,
        // Marker so accept-invite can safely set the first real password.
        passwordResetToken: `invite-pending:${crypto.randomUUID()}`,
        passwordResetExpires: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
      select: invitedUserSelect,
    });
    await grantUserCompanyAccess({
      userId: pendingUser.id,
      companyId,
      companyRole: userType === 'COMPANY' ? 'user' : undefined,
    });

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
      pendingUserId: pendingUser.id,
      ...(employerCompanyName ? { employerCompanyName } : {}),
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

    await auditUserOperation('USER_CREATED', pendingUser.id, {
      action: 'company_user_invite_created',
      companyId,
      email,
      userType,
      pendingInvite: true,
    });

    return NextResponse.json({
      inviteSent: true,
      email,
      expiresAt,
      pendingInvite: true,
      user: {
        ...pendingUser,
        homeCompanyId: pendingUser.companyId,
        companyId,
        isExternalCompanyUser: true,
        invitePending: true,
        employerCompanyName: employerCompanyName || undefined,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create invite' },
      { status: 500 },
    );
  }
}

/** Update employer company name for an external invitee already on the company. */
export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const userId = String(body?.userId || '').trim();
    const employerCompanyName = String(body?.employerCompanyName || '').trim();

    if (!companyId || !userId || !employerCompanyName) {
      return NextResponse.json(
        { error: 'companyId, userId, and employerCompanyName are required' },
        { status: 400 },
      );
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (context.role === 'USER') {
      if (!(await isCompanyAdminForCompany(context.userId, companyId))) {
        return NextResponse.json(
          { error: 'Forbidden: Only company admins can update invitee company names' },
          { status: 403 },
        );
      }
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const membership = await prisma.userCompanyAccess.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json(
        { error: 'User does not have access to this company' },
        { status: 404 },
      );
    }

    const invites = getCompanyInvites(company.userDefinedAllocations);
    let matched = false;
    const nextInvites = invites.map((invite) => {
      const matchesUser =
        String(invite?.pendingUserId || '') === userId ||
        String(invite?.acceptedByUserId || '') === userId ||
        String(invite?.email || '').toLowerCase() ===
          String(user.email || '').toLowerCase();
      if (!matchesUser) return invite;
      matched = true;
      return { ...invite, employerCompanyName };
    });

    if (!matched) {
      // No invite record (e.g. linked existing account) — store a lightweight marker invite.
      nextInvites.push({
        id: crypto.randomUUID(),
        email: String(user.email || '').toLowerCase(),
        name: '',
        userType: 'COMPANY',
        tokenHash: '',
        status: 'accepted',
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdByUserId: context.userId,
        createdByEmail: context.email,
        pendingUserId: userId,
        acceptedByUserId: userId,
        acceptedAt: new Date().toISOString(),
        employerCompanyName,
      });
    }

    const updatedUDA = upsertCompanyInvites(company.userDefinedAllocations, nextInvites);
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA as any },
    });

    return NextResponse.json({
      ok: true,
      userId,
      employerCompanyName,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update employer company name' },
      { status: 500 },
    );
  }
}
