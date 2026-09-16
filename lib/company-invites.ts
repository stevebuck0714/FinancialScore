import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { generateSecureToken, hashPassword } from '@/lib/auth';
import { grantUserCompanyAccess } from '@/lib/user-company-access';

export type CompanyUserInvite = {
  id: string;
  email: string;
  name: string;
  userType: 'COMPANY' | 'ASSESSMENT';
  tokenHash: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  createdByUserId: string;
  createdByEmail: string;
  /** Pre-created User row so Manage Users can assign rights before join. */
  pendingUserId?: string;
  /** Employer / affiliation entered when inviting an external user. */
  employerCompanyName?: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export function hashInviteToken(token: string) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function createInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function getCompanyInvites(userDefinedAllocations: unknown): CompanyUserInvite[] {
  const root = asObject(userDefinedAllocations);
  const dataRoom = asObject(root.dataRoom);
  const invites = Array.isArray(dataRoom.companyUserInvites)
    ? dataRoom.companyUserInvites
    : [];
  return invites as CompanyUserInvite[];
}

export function upsertCompanyInvites(
  userDefinedAllocations: unknown,
  invites: CompanyUserInvite[],
) {
  const root = asObject(userDefinedAllocations);
  const dataRoom = asObject(root.dataRoom);
  return {
    ...root,
    dataRoom: {
      ...dataRoom,
      companyUserInvites: invites,
    },
  };
}

/**
 * Ensures every pending invite has a User + UserCompanyAccess row so Manage Users
 * can assign rights before the invitee joins. Backfills invites created before
 * stub users were introduced.
 */
export async function materializePendingCompanyInvites(companyId: string): Promise<{
  createdUsers: number;
  linkedUsers: number;
  updatedInvites: number;
}> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      consultantId: true,
      userDefinedAllocations: true,
    },
  });
  if (!company) {
    return { createdUsers: 0, linkedUsers: 0, updatedInvites: 0 };
  }

  const invites = getCompanyInvites(company.userDefinedAllocations);
  const now = Date.now();
  let createdUsers = 0;
  let linkedUsers = 0;
  let updatedInvites = 0;
  let invitesChanged = false;

  const nextInvites: CompanyUserInvite[] = [];
  for (const invite of invites) {
    const status = String(invite?.status || '');
    const email = String(invite?.email || '').trim().toLowerCase();
    const name = String(invite?.name || '').trim() || email;
    const userType =
      String(invite?.userType || '').toUpperCase() === 'ASSESSMENT' ? 'ASSESSMENT' : 'COMPANY';
    const expired = invite?.expiresAt ? new Date(invite.expiresAt).getTime() < now : false;

    if (status !== 'pending' || !email || expired) {
      nextInvites.push(invite);
      continue;
    }

    let pendingUserId = String(invite.pendingUserId || '').trim();
    let user =
      pendingUserId
        ? await prisma.user.findUnique({
            where: { id: pendingUserId },
            select: { id: true, email: true },
          })
        : null;

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });
    }

    if (!user) {
      const stubPasswordHash = await hashPassword(generateSecureToken());
      const created = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash: stubPasswordHash,
          role: 'USER',
          userType,
          companyId,
          consultantId: company.consultantId || null,
          companyRole: userType === 'COMPANY' ? 'user' : null,
          passwordResetToken: `invite-pending:${crypto.randomUUID()}`,
          passwordResetExpires: invite.expiresAt
            ? new Date(invite.expiresAt)
            : new Date(now + 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true, email: true },
      });
      user = created;
      createdUsers += 1;
      pendingUserId = created.id;
      invitesChanged = true;
      updatedInvites += 1;
    } else if (!pendingUserId || pendingUserId !== user.id) {
      pendingUserId = user.id;
      invitesChanged = true;
      updatedInvites += 1;
    }

    const grant = await grantUserCompanyAccess({
      userId: user.id,
      companyId,
      companyRole: userType === 'COMPANY' ? 'user' : undefined,
    });
    if (grant.created) linkedUsers += 1;

    nextInvites.push({
      ...invite,
      email,
      name,
      userType,
      pendingUserId,
    });
  }

  if (invitesChanged) {
    const updatedUDA = upsertCompanyInvites(company.userDefinedAllocations, nextInvites);
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA as any },
    });
  }

  return { createdUsers, linkedUsers, updatedInvites };
}
