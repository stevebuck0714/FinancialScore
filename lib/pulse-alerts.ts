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
  explainability?: {
    triggerName: string;
    formula: string;
    threshold: string;
    reasonNow: string;
    policySource: string;
    dataRefs: string[];
    sourceTimestamp?: string;
  };
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
  explainability: Record<string, unknown>;
  status: PulseAlertStatus;
  dueAt: Date | null;
  snoozedUntil: Date | null;
  notes: unknown[];
  isActive: boolean;
  resolvedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  modifiedAt: Date;
};

export function createPulseId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePulseStatus(value: unknown): PulseAlertStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'acknowledged' || raw === 'snoozed' || raw === 'resolved') return raw;
  return 'new';
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
      "explainability" JSONB NOT NULL DEFAULT '{}'::jsonb,
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
    ALTER TABLE "PulseAlert"
    ADD COLUMN IF NOT EXISTS "explainability" JSONB NOT NULL DEFAULT '{}'::jsonb
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

export async function syncPulseAlertsForCompany(params: {
  companyId: string;
  alerts: PulseAlertInput[];
  actorUserId?: string | null;
  actorEmail?: string | null;
}): Promise<PulseAlertRow[]> {
  await ensurePulseAlertTables();

  const nowIso = new Date().toISOString();
  const seenFingerprints = new Set<string>();

  for (const alert of params.alerts) {
    const fingerprint = String(alert.fingerprint || '').trim();
    if (!fingerprint || seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);

    const existing = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
      `SELECT * FROM "PulseAlert"
       WHERE "companyId" = $1 AND "fingerprint" = $2
       ORDER BY "isActive" DESC, "modifiedAt" DESC
       LIMIT 1`,
      params.companyId,
      fingerprint
    );
    const current = existing[0];

    if (!current) {
      const id = createPulseId('pa');
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PulseAlert"
          (id, "companyId", "fingerprint", "source", "title", "detail", "owner", "drillView", "deltaText", "updatedAt", "itemLabel", "priorityScore", "bucket", "priorityFocusTerm", "explainability", "status", "isActive", "lastSeenAt", "modifiedAt", "createdAt")
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamp, $11, $12, $13, $14, $15::jsonb, 'new', TRUE, $16::timestamp, $17::timestamp, $18::timestamp)`,
        id,
        params.companyId,
        fingerprint,
        alert.source,
        alert.title,
        alert.detail,
        alert.owner,
        alert.drillView,
        alert.deltaText || null,
        alert.updatedAt || null,
        alert.itemLabel || null,
        alert.priorityScore ?? null,
        alert.bucket || null,
        alert.priorityFocusTerm || null,
        JSON.stringify(alert.explainability || {}),
        nowIso,
        nowIso,
        nowIso
      );
      await insertPulseEvent({
        alertId: id,
        companyId: params.companyId,
        eventType: 'created',
        toStatus: 'new',
        actorUserId: params.actorUserId || null,
        actorEmail: params.actorEmail || null,
        payload: { fingerprint, source: alert.source },
      });
      continue;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "PulseAlert"
       SET "isActive" = FALSE, "modifiedAt" = $1::timestamp
       WHERE "companyId" = $2
         AND "fingerprint" = $3
         AND "id" <> $4
         AND "status" <> 'resolved'`,
      nowIso,
      params.companyId,
      fingerprint,
      current.id
    );

    let nextStatus: PulseAlertStatus = normalizePulseStatus(current.status);
    let resolvedAtIso: string | null = current.resolvedAt ? new Date(current.resolvedAt).toISOString() : null;
    if (nextStatus === 'resolved') {
      nextStatus = 'new';
      resolvedAtIso = null;
      await insertPulseEvent({
        alertId: current.id,
        companyId: params.companyId,
        eventType: 'reopened',
        fromStatus: 'resolved',
        toStatus: 'new',
        actorUserId: params.actorUserId || null,
        actorEmail: params.actorEmail || null,
        payload: { reason: 'detected_again' },
      });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "PulseAlert"
       SET "source" = $1,
           "title" = $2,
           "detail" = $3,
           "owner" = $4,
           "drillView" = $5,
           "deltaText" = $6,
           "updatedAt" = $7::timestamp,
           "itemLabel" = $8,
           "priorityScore" = $9,
           "bucket" = $10,
           "priorityFocusTerm" = $11,
           "explainability" = $12::jsonb,
           "status" = $13,
           "resolvedAt" = $14::timestamp,
           "isActive" = TRUE,
           "lastSeenAt" = $15::timestamp,
           "modifiedAt" = $16::timestamp
       WHERE "id" = $17`,
      alert.source,
      alert.title,
      alert.detail,
      alert.owner,
      alert.drillView,
      alert.deltaText || null,
      alert.updatedAt || null,
      alert.itemLabel || null,
      alert.priorityScore ?? null,
      alert.bucket || null,
      alert.priorityFocusTerm || null,
      JSON.stringify(alert.explainability || {}),
      nextStatus,
      resolvedAtIso,
      nowIso,
      nowIso,
      current.id
    );
  }

  const staleActiveRows = await prisma.$queryRawUnsafe<Array<{ id: string; fingerprint: string; status: string }>>(
    `SELECT "id", "fingerprint", "status"
     FROM "PulseAlert"
     WHERE "companyId" = $1
       AND "isActive" = TRUE
       AND "status" <> 'resolved'`,
    params.companyId
  );

  for (const row of staleActiveRows) {
    if (seenFingerprints.has(row.fingerprint)) continue;
    await prisma.$executeRawUnsafe(
      `UPDATE "PulseAlert"
       SET "isActive" = FALSE,
           "modifiedAt" = $1::timestamp
       WHERE "id" = $2`,
      nowIso,
      row.id
    );
    await insertPulseEvent({
      alertId: row.id,
      companyId: params.companyId,
      eventType: 'cleared',
      fromStatus: row.status,
      toStatus: row.status,
      actorUserId: params.actorUserId || null,
      actorEmail: params.actorEmail || null,
      payload: { reason: 'not_detected_in_latest_generation', fingerprint: row.fingerprint },
    });
  }

  return prisma.$queryRawUnsafe<PulseAlertRow[]>(
    `SELECT * FROM "PulseAlert"
     WHERE "companyId" = $1
       AND ("isActive" = TRUE OR "status" = 'resolved')
     ORDER BY COALESCE("priorityScore", 0) DESC, "modifiedAt" DESC`,
    params.companyId
  );
}
