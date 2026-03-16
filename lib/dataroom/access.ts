import prisma from '@/lib/prisma';
import { getDataRoomState } from '@/lib/dataroom/state';

export type DataRoomCapability = 'view' | 'download' | 'upload' | 'share' | 'manage';

export type DataRoomCapabilities = Record<DataRoomCapability, boolean>;

const FULL_ACCESS: DataRoomCapabilities = {
  view: true,
  download: true,
  upload: true,
  share: true,
  manage: true,
};

const NO_ACCESS: DataRoomCapabilities = {
  view: false,
  download: false,
  upload: false,
  share: false,
  manage: false,
};

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function applyBooleanOverrides(base: DataRoomCapabilities, source: Record<string, any>) {
  const next = { ...base };
  const keys: DataRoomCapability[] = ['view', 'download', 'upload', 'share', 'manage'];
  for (const key of keys) {
    if (typeof source[key] === 'boolean') next[key] = source[key];
  }
  return next;
}

export async function isCompanyAdminForDataRoom(userId: string, companyId: string) {
  const membership = await (prisma as any).userCompanyAccess?.findUnique?.({
    where: { userId_companyId: { userId, companyId } },
    select: { companyRole: true },
  });
  if (String(membership?.companyRole || '').toLowerCase() === 'admin') return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, companyRole: true },
  });
  return user?.companyId === companyId && String(user?.companyRole || '').toLowerCase() === 'admin';
}

export async function resolveDataRoomCapabilities(params: {
  userId: string;
  role: 'SITEADMIN' | 'CONSULTANT' | 'USER';
  companyId: string;
  userDefinedAllocations: unknown;
  folderId?: string | null;
  documentId?: string | null;
  isCompanyAdmin?: boolean;
}) {
  const { userId, role, companyId, userDefinedAllocations, folderId, documentId, isCompanyAdmin } = params;

  if (role === 'SITEADMIN' || role === 'CONSULTANT') return FULL_ACCESS;
  if (isCompanyAdmin === true) return FULL_ACCESS;
  if (isCompanyAdmin === undefined && (await isCompanyAdminForDataRoom(userId, companyId))) return FULL_ACCESS;

  const state = getDataRoomState(userDefinedAllocations);
  const dataRoom = asObject(state.dataRoom);
  const permissionsRoot = asObject(dataRoom.permissions);
  const users = Array.isArray(permissionsRoot.users) ? permissionsRoot.users : [];

  // Backward-compatible behavior: if no permissions are configured, allow full access.
  if (users.length === 0) return FULL_ACCESS;

  const userRule = users.find((u: any) => String(u?.userId || '') === userId);
  if (!userRule) return NO_ACCESS;

  let effective = applyBooleanOverrides(NO_ACCESS, asObject(userRule.default));

  if (folderId) {
    const folderRules = asObject(userRule.folders);
    effective = applyBooleanOverrides(effective, asObject(folderRules[String(folderId)]));
  }

  if (documentId) {
    const docRules = asObject(userRule.documents);
    effective = applyBooleanOverrides(effective, asObject(docRules[String(documentId)]));
  }

  return effective;
}

export function applyDocumentPolicyOverrides(
  base: DataRoomCapabilities,
  documentIndexEntry: unknown,
) {
  const entry = asObject(documentIndexEntry);
  let next = applyBooleanOverrides(base, entry);
  if (typeof entry.downloadDisabled === 'boolean' && entry.downloadDisabled) {
    next = { ...next, download: false };
  }
  return next;
}

