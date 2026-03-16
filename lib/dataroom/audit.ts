import { headers } from 'next/headers';

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export type DataRoomAuditEvent = {
  id: string;
  at: string;
  action:
    | 'document_assigned'
    | 'document_moved'
    | 'document_removed'
    | 'document_opened'
    | 'document_open_blocked'
    | 'scan_completed'
    | 'scan_blocked'
    | 'overview_viewed'
    | 'permissions_updated';
  companyId: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  folderId?: string | null;
  documentId?: string | null;
  details?: Record<string, any>;
};

export function buildDataRoomAuditEvent(input: Omit<DataRoomAuditEvent, 'id' | 'at' | 'ipAddress' | 'userAgent'>): DataRoomAuditEvent {
  const h = headers();
  const ipAddress =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown';
  const userAgent = h.get('user-agent') || 'unknown';

  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ipAddress,
    userAgent,
    ...input,
  };
}

export function appendDataRoomAuditEvents(
  userDefinedAllocations: unknown,
  events: DataRoomAuditEvent[],
) {
  const root = asObject(userDefinedAllocations);
  const dataRoom = asObject(root.dataRoom);
  const existing = Array.isArray(dataRoom.auditLog) ? dataRoom.auditLog : [];
  const nextAudit = [...existing, ...events].slice(-5000);

  return {
    ...root,
    dataRoom: {
      ...dataRoom,
      auditLog: nextAudit,
    },
  };
}

