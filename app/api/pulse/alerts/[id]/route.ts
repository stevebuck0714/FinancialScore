import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ensurePulseAlertTables, insertPulseEvent, type PulseAlertRow, type PulseAlertStatus } from '@/lib/pulse-alerts';

const PULSE_ALERTS_API_ENABLED = String(process.env.COMPANY_PULSE_ENABLED || 'true').toLowerCase() !== 'false';
const PULSE_ALERTS_DISABLED_RESPONSE = {
  error: 'Company Pulse alerts are disabled. Use Daily Briefing instead.',
};

function normalizeStatus(raw: unknown): PulseAlertStatus | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'new' || value === 'acknowledged' || value === 'snoozed' || value === 'resolved') return value;
  return null;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!PULSE_ALERTS_API_ENABLED) {
    return NextResponse.json(PULSE_ALERTS_DISABLED_RESPONSE, { status: 410 });
  }
  try {
    const context = await requireAuth();
    await ensurePulseAlertTables();

    const alertId = String(params?.id || '').trim();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    const owner = typeof body?.owner === 'string' ? body.owner.trim() : '';
    const dueAt = typeof body?.dueAt === 'string' ? body.dueAt : null;
    const snoozedUntil = typeof body?.snoozedUntil === 'string' ? body.snoozedUntil : null;
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    const explicitStatus = normalizeStatus(body?.status);

    if (!alertId || !companyId) {
      return NextResponse.json({ error: 'Alert ID and companyId are required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_ALERT_UPDATE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const currentRows = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
      `SELECT * FROM "PulseAlert" WHERE "id" = $1 AND "companyId" = $2 LIMIT 1`,
      alertId,
      companyId
    );
    const current = currentRows[0];
    if (!current) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const fromStatus = normalizeStatus(current.status) || 'new';
    let nextStatus: PulseAlertStatus = explicitStatus || fromStatus;
    let nextOwner = current.owner;
    let nextDueAtIso: string | null = current.dueAt ? new Date(current.dueAt).toISOString() : null;
    let nextSnoozedIso: string | null = current.snoozedUntil ? new Date(current.snoozedUntil).toISOString() : null;
    let nextResolvedAtIso: string | null = current.resolvedAt ? new Date(current.resolvedAt).toISOString() : null;
    let isActive = current.isActive;
    let eventType = 'updated';
    const payload: Record<string, unknown> = {};

    if (action === 'acknowledge') {
      nextStatus = 'acknowledged';
      nextSnoozedIso = null;
      eventType = 'status_changed';
    } else if (action === 'snooze') {
      if (!snoozedUntil) {
        return NextResponse.json({ error: 'snoozedUntil is required for snooze action' }, { status: 400 });
      }
      nextStatus = 'snoozed';
      nextSnoozedIso = snoozedUntil;
      eventType = 'status_changed';
      payload.snoozedUntil = snoozedUntil;
    } else if (action === 'resolve') {
      nextStatus = 'resolved';
      nextResolvedAtIso = new Date().toISOString();
      isActive = false;
      nextSnoozedIso = null;
      eventType = 'status_changed';
    } else if (action === 'reopen') {
      nextStatus = 'new';
      nextResolvedAtIso = null;
      isActive = true;
      nextSnoozedIso = null;
      eventType = 'reopened';
    } else if (action === 'assign') {
      if (!owner) {
        return NextResponse.json({ error: 'owner is required for assign action' }, { status: 400 });
      }
      nextOwner = owner;
      eventType = 'owner_changed';
      payload.owner = owner;
    } else if (action === 'set_due') {
      nextDueAtIso = dueAt || null;
      eventType = 'due_changed';
      payload.dueAt = dueAt;
    } else if (action === 'note') {
      if (!note) {
        return NextResponse.json({ error: 'note is required for note action' }, { status: 400 });
      }
      const notes = Array.isArray(current.notes) ? current.notes : [];
      const nextNotes = [...notes, { text: note, createdAt: new Date().toISOString(), author: context.email }];
      await prisma.$executeRawUnsafe(
        `UPDATE "PulseAlert"
         SET "notes" = $1::jsonb, "modifiedAt" = $2::timestamp
         WHERE "id" = $3`,
        JSON.stringify(nextNotes),
        new Date().toISOString(),
        alertId
      );
      await insertPulseEvent({
        alertId,
        companyId,
        eventType: 'note_added',
        fromStatus,
        toStatus: fromStatus,
        actorUserId: context.userId,
        actorEmail: context.email,
        note,
      });
      const updatedRows = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
        `SELECT * FROM "PulseAlert" WHERE "id" = $1 LIMIT 1`,
        alertId
      );
      return NextResponse.json({ alert: updatedRows[0] || null });
    } else if (!explicitStatus) {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "PulseAlert"
       SET "status" = $1,
           "owner" = $2,
           "dueAt" = $3::timestamp,
           "snoozedUntil" = $4::timestamp,
           "resolvedAt" = $5::timestamp,
           "isActive" = $6,
           "modifiedAt" = $7::timestamp
       WHERE "id" = $8`,
      nextStatus,
      nextOwner,
      nextDueAtIso,
      nextSnoozedIso,
      nextResolvedAtIso,
      isActive,
      new Date().toISOString(),
      alertId
    );

    await insertPulseEvent({
      alertId,
      companyId,
      eventType,
      fromStatus,
      toStatus: nextStatus,
      actorUserId: context.userId,
      actorEmail: context.email,
      note: note || null,
      payload,
    });

    const updatedRows = await prisma.$queryRawUnsafe<PulseAlertRow[]>(
      `SELECT * FROM "PulseAlert" WHERE "id" = $1 LIMIT 1`,
      alertId
    );
    return NextResponse.json({ alert: updatedRows[0] || null });
  } catch (error: any) {
    console.error('Pulse alert PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update pulse alert', details: String(error?.message || error) }, { status: 500 });
  }
}
