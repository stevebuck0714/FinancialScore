import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  ensurePulseAlertTables,
  type PulseAlertInput,
  type PulseAlertRow,
  type PulseAlertStatus,
  syncPulseAlertsForCompany,
} from '@/lib/pulse-alerts';

const PULSE_ALERTS_API_ENABLED = String(process.env.COMPANY_PULSE_ENABLED || 'true').toLowerCase() !== 'false';
const PULSE_ALERTS_DISABLED_RESPONSE = {
  error: 'Company Pulse alerts are disabled. Use Daily Briefing instead.',
};

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
  const explainability =
    alert?.explainability && typeof alert.explainability === 'object'
      ? {
          triggerName: String(alert.explainability.triggerName || '').trim() || title,
          formula: String(alert.explainability.formula || '').trim() || 'Derived from Company Pulse rule set for this alert source',
          threshold: String(alert.explainability.threshold || '').trim() || 'See policy settings and source-specific trigger thresholds',
          reasonNow: String(alert.explainability.reasonNow || '').trim() || detail,
          policySource:
            String(alert.explainability.policySource || '').trim() ||
            'Company Pulse policy (company override + sector default fallback)',
          dataRefs: Array.isArray(alert.explainability.dataRefs)
            ? alert.explainability.dataRefs.map((v: any) => String(v || '').trim()).filter(Boolean)
            : [],
          sourceTimestamp:
            typeof alert.explainability.sourceTimestamp === 'string'
              ? alert.explainability.sourceTimestamp
              : undefined,
        }
      : undefined;
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
    explainability,
  };
}

export async function GET(request: NextRequest) {
  if (!PULSE_ALERTS_API_ENABLED) {
    return NextResponse.json(PULSE_ALERTS_DISABLED_RESPONSE, { status: 410 });
  }
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
  if (!PULSE_ALERTS_API_ENABLED) {
    return NextResponse.json(PULSE_ALERTS_DISABLED_RESPONSE, { status: 410 });
  }
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
    const rows = await syncPulseAlertsForCompany({
      companyId,
      alerts: normalized,
      actorUserId: context.userId,
      actorEmail: context.email,
    });

    return NextResponse.json({ alerts: rows });
  } catch (error: any) {
    console.error('Pulse alerts POST error:', error);
    return NextResponse.json({ error: 'Failed to sync pulse alerts', details: String(error?.message || error) }, { status: 500 });
  }
}
