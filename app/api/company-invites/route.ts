import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess, isCompanyAdminForCompany } from '@/lib/tenant-security';
import {
  getCompanyInvites,
  recordExternalUserForCompany,
  upsertCompanyInvites,
} from '@/lib/company-invites';
import { grantUserCompanyAccess } from '@/lib/user-company-access';
import { auditForbiddenAccess, auditUserOperation } from '@/lib/audit-logger';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { canAddExternalUsers } from '@/lib/external-users';
import {
  sendExternalAccessAddedEmail,
  sendManagedUserWelcomeEmail,
} from '@/lib/managed-user-email';

const externalUserSelect = {
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
  mustChangePassword: true,
  createdAt: true,
} as const;

function passwordError(password: string) {
  if (!password) {
    return NextResponse.json(
      { error: 'A temporary password is required. Share it with the user separately.' },
      { status: 400 },
    );
  }
  const validation = validatePassword(password);
  if (!validation.isValid) {
    return NextResponse.json(
      { error: 'Password does not meet requirements', details: validation.errors },
      { status: 400 },
    );
  }
  return null;
}

/**
 * Add an external user to a company.
 * - New email: create a pending external account with a temporary password.
 * - Existing external account without access: add this company to it.
 * - Pending external account with access: resend with a new temporary password.
 * - Any other existing account: refuse; it is never linked or converted.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const employerCompanyName = String(body?.employerCompanyName || '').trim();
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!companyId || !name || !email) {
      return NextResponse.json(
        { error: 'companyId, name, and email are required' },
        { status: 400 },
      );
    }

    if (!(await validateCompanyAccess(companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, consultantId: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (!(await canAddExternalUsers(context, companyId, company))) {
      await auditForbiddenAccess('User', companyId, 'CREATE');
      return NextResponse.json(
        {
          error:
            'Forbidden: Only the Company Admin, the consultant admin for this company, or a Site Admin can add external users',
        },
        { status: 403 },
      );
    }

    const companyName = company.name || 'your company';
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isExternal: true,
        isAccountManager: true,
        mustChangePassword: true,
        passwordResetToken: true,
      },
    });

    if (existingUser) {
      // Accounts created by the retired invite-link flow never received a password.
      const isLegacyInviteStub =
        existingUser.role === 'USER' &&
        !existingUser.isAccountManager &&
        !existingUser.isExternal &&
        Boolean(existingUser.passwordResetToken?.startsWith('invite-pending:'));

      if (
        !isLegacyInviteStub &&
        (existingUser.role !== 'USER' || existingUser.isAccountManager || !existingUser.isExternal)
      ) {
        return NextResponse.json(
          {
            error: `${email} belongs to an existing Corelytics account that is not an external user. It cannot be added as an external user. Contact a Site Admin if this person needs access.`,
            conflict: 'non_external_account',
          },
          { status: 409 },
        );
      }

      const membership = await prisma.userCompanyAccess.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId } },
        select: { id: true },
      });

      if (membership || isLegacyInviteStub) {
        if (!isLegacyInviteStub && !existingUser.mustChangePassword) {
          return NextResponse.json(
            {
              error: `${email} already has access to this company. If they cannot sign in, they can use Forgot Password on the sign-in page.`,
              conflict: 'already_has_access',
            },
            { status: 409 },
          );
        }

        const invalidPassword = passwordError(password);
        if (invalidPassword) return invalidPassword;

        const resentUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash: await hashPassword(password),
            isExternal: true,
            mustChangePassword: true,
            passwordResetToken: null,
            passwordResetExpires: null,
          },
          select: externalUserSelect,
        });
        if (!membership) {
          await grantUserCompanyAccess({ userId: resentUser.id, companyId, companyRole: 'user' });
        }
        await recordExternalUserForCompany({
          companyId,
          user: resentUser,
          employerCompanyName,
          createdByUserId: context.userId,
          createdByEmail: context.email,
        });
        const delivery = await sendManagedUserWelcomeEmail({
          request,
          actorUserId: context.userId,
          to: resentUser.email,
          userName: resentUser.name,
          companyName,
          userType: 'COMPANY',
          roleLabel: 'External User',
        });
        await auditUserOperation('USER_UPDATED', resentUser.id, {
          action: 'external_user_invite_resent',
          companyId,
          emailDelivered: delivery.emailSent,
          emailError: delivery.emailError,
        });
        return NextResponse.json({
          outcome: 'resent',
          ...delivery,
          user: toCompanyUser(resentUser, companyId, employerCompanyName),
        });
      }

      await grantUserCompanyAccess({ userId: existingUser.id, companyId, companyRole: 'user' });
      await recordExternalUserForCompany({
        companyId,
        user: existingUser,
        employerCompanyName,
        createdByUserId: context.userId,
        createdByEmail: context.email,
      });
      const delivery = await sendExternalAccessAddedEmail({
        request,
        actorUserId: context.userId,
        to: existingUser.email,
        userName: existingUser.name,
        companyName,
      });
      await auditUserOperation('USER_COMPANY_ACCESS_GRANTED', existingUser.id, {
        action: 'external_user_company_added',
        companyId,
        addedBy: context.userId,
        emailDelivered: delivery.emailSent,
        emailError: delivery.emailError,
      });
      const linkedUser = await prisma.user.findUnique({
        where: { id: existingUser.id },
        select: externalUserSelect,
      });
      return NextResponse.json({
        outcome: 'access_added',
        ...delivery,
        user: linkedUser ? toCompanyUser(linkedUser, companyId, employerCompanyName) : null,
      });
    }

    const invalidPassword = passwordError(password);
    if (invalidPassword) return invalidPassword;

    const createdUser = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password),
        role: 'USER',
        userType: 'COMPANY',
        isExternal: true,
        mustChangePassword: true,
        companyId,
        companyRole: 'user',
      },
      select: externalUserSelect,
    });
    await grantUserCompanyAccess({ userId: createdUser.id, companyId, companyRole: 'user' });
    await recordExternalUserForCompany({
      companyId,
      user: createdUser,
      employerCompanyName,
      createdByUserId: context.userId,
      createdByEmail: context.email,
    });
    const delivery = await sendManagedUserWelcomeEmail({
      request,
      actorUserId: context.userId,
      to: createdUser.email,
      userName: createdUser.name,
      companyName,
      userType: 'COMPANY',
      roleLabel: 'External User',
    });
    await auditUserOperation('USER_CREATED', createdUser.id, {
      action: 'external_user_created',
      companyId,
      email,
      emailDelivered: delivery.emailSent,
      emailError: delivery.emailError,
    });

    return NextResponse.json({
      outcome: 'created',
      ...delivery,
      user: toCompanyUser(createdUser, companyId, employerCompanyName),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to add external user' },
      { status: 500 },
    );
  }
}

function toCompanyUser(
  user: { companyId: string | null; mustChangePassword: boolean } & Record<string, unknown>,
  companyId: string,
  employerCompanyName: string,
) {
  return {
    ...user,
    homeCompanyId: user.companyId,
    companyId,
    isExternalCompanyUser: true,
    invitePending: user.mustChangePassword,
    employerCompanyName: employerCompanyName || undefined,
  };
}

/** Update employer company name for an external user already on the company. */
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
