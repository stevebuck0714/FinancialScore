import crypto from 'crypto';

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

