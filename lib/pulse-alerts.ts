import prisma from '@/lib/prisma';

export type PulseAlertStatus = 'new' | 'acknowledged' | 'snoozed' | 'resolved';

export type PulseAlertInput = {
  fingerprint: string;
  source: string;
  title: string;
  detail: string;
  owner: string;
  drillView: string;
  deltaText?: string;
  updatedAt?: string;
  itemLabel?: string;
  priorityScore?: number;
  bucket?: 'attention' | 'monitoring';
  priorityFocusTerm?: string;
};

export type PulseAlertRow = {
  id: string;
  companyId: string;
  fingerprint: string;
  source: string;
  title: string;
  detail: string;
  owner: string;
  drillView: string;
  deltaText: string | null;
  updatedAt: Date | null;
  itemLabel: string | null;
  priorityScore: number | null;
  bucket: string | null;
  priorityFocusTerm: string | null;
  status: PulseAlertStatus;
  dueAt: Date | null;
  snoozedUntil: Date | null;
  notes: any;
  isActive: boolean;
  resolvedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  modifiedAt: Date;
};

export function createPulseId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensurePulseAlertTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PulseAlert" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "fingerprint" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "owner" TEXT NOT NULL,
      "drillView" TEXT NOT NULL,
      "deltaText" TEXT,
      "updatedAt" TIMESTAMP,
      "itemLabel" TEXT,
      "priorityScore" DOUBLE PRECISION,
      "bucket" TEXT,
      "priorityFocusTerm" TEXT,
      "status" TEXT NOT NULL DEFAULT 'new',
      "dueAt" TIMESTAMP,
      "snoozedUntil" TIMESTAMP,
      "notes" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "resolvedAt" TIMESTAMP,
      "lastSeenAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "modifiedAt" TIMESTAMP NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PulseAlertEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "alertId" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "fromStatus" TEXT,
      "toStatus" TEXT,
      "actorUserId" TEXT,
      "actorEmail" TEXT,
      "note" TEXT,
      "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PulseAlert_company_fingerprint_key"
    ON "PulseAlert"("companyId", "fingerprint")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PulseAlert_company_status_idx"
    ON "PulseAlert"("companyId", "status")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PulseAlert_company_active_idx"
    ON "PulseAlert"("companyId", "isActive")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PulseAlertEvent_alert_created_idx"
    ON "PulseAlertEvent"("alertId", "createdAt")
  `);
}

export async function insertPulseEvent(params: {
  alertId: string;
  companyId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  note?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const id = createPulseId('pae');
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PulseAlertEvent"
      (id, "alertId", "companyId", "eventType", "fromStatus", "toStatus", "actorUserId", "actorEmail", "note", "payload", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamp)`,
    id,
    params.alertId,
    params.companyId,
    params.eventType,
    params.fromStatus || null,
    params.toStatus || null,
    params.actorUserId || null,
    params.actorEmail || null,
    params.note || null,
    JSON.stringify(params.payload || {}),
    new Date().toISOString()
  );
}
