import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  ensurePulseAlertTables,
  insertPulseEvent,
  type PulseAlertInput,
  type PulseAlertRow,
  type PulseAlertStatus,
  createPulseId,
} from '@/lib/pulse-alerts';

function normalizeStatus(value: unknown): PulseAlertStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'acknowledged' || raw === 'snoozed' || raw === 'resolved') return raw;
  return 'new';
}

function normalizeAlertInput(alert: any): PulseAlertInput | null {
  const fingerprint = String(alert?.fingerprint || '').trim();
  const source = String(alert?.source || '').trim();
  const title = String(alert?.title || '').trim();
  const detail = String(alert?.detail || '').trim();
  const owner = String(alert?.owner || '').trim() || 'Ops/Finance Owner';
  const drillView = String(alert?.drillView || '').trim() || 'pa-overview';
  if (!fingerprint || !source || !title || !detail) return null;
  return {
    fingerprint,
    source,
    title,
    detail,
    owner,
    drillView,
    deltaText: typeof alert?.deltaText === 'string' ? alert.deltaText : undefined,
    updatedAt: typeof alert?.updatedAt === 'string' ? alert.updatedAt : undefined,
    itemLabel: typeof alert?.itemLabel === 'string' ? alert.itemLabel : undefined,
    priorityScore: Number.isFinite(Number(alert?.priorityScore)) ? Number(alert.priorityScore) : undefined,
    bucket: alert?.bucket === 'attention' ? 'attention' : 'monitoring',
    priorityFocusTerm: typeof alert?.priorityFocusTerm === 'string' ? alert.priorityFocusTerm : undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await ensurePulseAlertTables();

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');
    const includeResolved = searchParams.get('includeResolved') === 'true';

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_ALERTS_READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const whereParts: string[] = [`"companyId" = $1`];
    const params: any[] = [companyId];

    if (status) {
      params.push(normalizeStatus(status));
      whereParts.push(`"status" = $${params.length}`);
    } else if (!includeResolved) {
      whereParts.push(`("isActive" = TRUE OR "status" = 'resolved')`);
    }

    const rows = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
      `SELECT * FROM "PulseAlert"
       WHERE ${whereParts.join(' AND ')}
       ORDER BY COALESCE("priorityScore", 0) DESC, "modifiedAt" DESC`,
      ...params
    );

    return NextResponse.json({ alerts: rows });
  } catch (error: any) {
    console.error('Pulse alerts GET error:', error);
    return NextResponse.json({ error: 'Failed to load pulse alerts', details: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    await ensurePulseAlertTables();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const alerts = Array.isArray(body?.alerts) ? body.alerts : [];

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_ALERTS_SYNC');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const normalized = alerts.map(normalizeAlertInput).filter(Boolean) as PulseAlertInput[];
    const nowIso = new Date().toISOString();
    const seenFingerprints = new Set<string>();

    for (const alert of normalized) {
      if (seenFingerprints.has(alert.fingerprint)) continue;
      seenFingerprints.add(alert.fingerprint);

      const existing = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
        `SELECT * FROM "PulseAlert" WHERE "companyId" = $1 AND "fingerprint" = $2 LIMIT 1`,
        companyId,
        alert.fingerprint
      );
      const current = existing[0];
      if (!current) {
        const id = createPulseId('pa');
        await prisma.$executeRawUnsafe(
          `INSERT INTO "PulseAlert"
            (id, "companyId", "fingerprint", "source", "title", "detail", "owner", "drillView", "deltaText", "updatedAt", "itemLabel", "priorityScore", "bucket", "priorityFocusTerm", "status", "isActive", "lastSeenAt", "modifiedAt", "createdAt")
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamp, $11, $12, $13, $14, 'new', TRUE, $15::timestamp, $16::timestamp, $17::timestamp)`,
          id,
          companyId,
          alert.fingerprint,
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
          nowIso,
          nowIso,
          nowIso
        );
        await insertPulseEvent({
          alertId: id,
          companyId,
          eventType: 'created',
          toStatus: 'new',
          actorUserId: context.userId,
          actorEmail: context.email,
          payload: { fingerprint: alert.fingerprint, source: alert.source },
        });
        continue;
      }

      let nextStatus: PulseAlertStatus = normalizeStatus(current.status);
      let resolvedAtIso: string | null = current.resolvedAt ? new Date(current.resolvedAt).toISOString() : null;
      if (nextStatus === 'resolved') {
        nextStatus = 'new';
        resolvedAtIso = null;
        await insertPulseEvent({
          alertId: current.id,
          companyId,
          eventType: 'reopened',
          fromStatus: 'resolved',
          toStatus: 'new',
          actorUserId: context.userId,
          actorEmail: context.email,
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
             "status" = $12,
             "resolvedAt" = $13::timestamp,
             "isActive" = TRUE,
             "lastSeenAt" = $14::timestamp,
             "modifiedAt" = $15::timestamp
         WHERE "id" = $16`,
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
        nextStatus,
        resolvedAtIso,
        nowIso,
        nowIso,
        current.id
      );
    }

    if (seenFingerprints.size > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "PulseAlert"
         SET "isActive" = FALSE, "modifiedAt" = $1::timestamp
         WHERE "companyId" = $2
           AND "status" <> 'resolved'
           AND NOT ("fingerprint" = ANY($3::text[]))`,
        nowIso,
        companyId,
        Array.from(seenFingerprints)
      );
    }

    const rows = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
      `SELECT * FROM "PulseAlert"
       WHERE "companyId" = $1
         AND ("isActive" = TRUE OR "status" = 'resolved')
       ORDER BY COALESCE("priorityScore", 0) DESC, "modifiedAt" DESC`,
      companyId
    );

    return NextResponse.json({ alerts: rows });
  } catch (error: any) {
    console.error('Pulse alerts POST error:', error);
    return NextResponse.json({ error: 'Failed to sync pulse alerts', details: String(error?.message || error) }, { status: 500 });
  }
}
