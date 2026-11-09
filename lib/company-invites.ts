import prisma from '@/lib/prisma';

/**
 * External-user records stored on Company.userDefinedAllocations.dataRoom.
 * Accounts and access live on User / UserCompanyAccess; these records only
 * carry per-company details such as the external user's employer name.
 */
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
  pendingUserId?: string;
  /** Employer / affiliation entered when adding an external user. */
  employerCompanyName?: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
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

export function inviteMatchesUser(
  invite: CompanyUserInvite,
  user: { id: string; email: string },
): boolean {
  return (
    String(invite?.pendingUserId || '') === user.id ||
    String(invite?.acceptedByUserId || '') === user.id ||
    String(invite?.email || '').toLowerCase() === String(user.email || '').toLowerCase()
  );
}

/** Stores the external user's record for one company, replacing any earlier one. */
export async function recordExternalUserForCompany(params: {
  companyId: string;
  user: { id: string; email: string; name: string };
  employerCompanyName?: string;
  createdByUserId: string;
  createdByEmail: string;
}): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { userDefinedAllocations: true },
  });
  if (!company) return;

  const invites = getCompanyInvites(company.userDefinedAllocations);
  const previous = invites.find((invite) => inviteMatchesUser(invite, params.user));
  const now = new Date().toISOString();
  const record: CompanyUserInvite = {
    id: previous?.id || crypto.randomUUID(),
    email: params.user.email.toLowerCase(),
    name: params.user.name,
    userType: 'COMPANY',
    tokenHash: '',
    status: 'accepted',
    expiresAt: now,
    createdAt: previous?.createdAt || now,
    createdByUserId: params.createdByUserId,
    createdByEmail: params.createdByEmail,
    pendingUserId: params.user.id,
    acceptedByUserId: params.user.id,
    acceptedAt: previous?.acceptedAt || now,
    ...(params.employerCompanyName || previous?.employerCompanyName
      ? { employerCompanyName: params.employerCompanyName || previous?.employerCompanyName }
      : {}),
  };

  const nextInvites = [
    ...invites.filter((invite) => !inviteMatchesUser(invite, params.user)),
    record,
  ];
  await prisma.company.update({
    where: { id: params.companyId },
    data: { userDefinedAllocations: upsertCompanyInvites(company.userDefinedAllocations, nextInvites) as any },
  });
}

/** Removes every invite record for this user from one company. */
export async function removeCompanyInvitesForUser(
  companyId: string,
  user: { id: string; email: string },
): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { userDefinedAllocations: true },
  });
  if (!company) return;

  const invites = getCompanyInvites(company.userDefinedAllocations);
  const nextInvites = invites.filter((invite) => !inviteMatchesUser(invite, user));
  if (nextInvites.length === invites.length) return;

  await prisma.company.update({
    where: { id: companyId },
    data: { userDefinedAllocations: upsertCompanyInvites(company.userDefinedAllocations, nextInvites) as any },
  });
}
