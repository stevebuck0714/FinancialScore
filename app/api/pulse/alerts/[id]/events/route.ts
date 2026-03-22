import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ensurePulseAlertTables } from '@/lib/pulse-alerts';

type PulseAlertEventRow = {
  id: string;
  alertId: string;
  companyId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  note: string | null;
  payload: any;
  createdAt: Date;
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
    await ensurePulseAlertTables();

    const alertId = String(params?.id || '').trim();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();

    if (!alertId || !companyId) {
      return NextResponse.json({ error: 'Alert ID and companyId are required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_ALERT_EVENTS_READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const events = await prisma.$queryRawUnsafe<PulseAlertEventRow[]>(
      `SELECT * FROM "PulseAlertEvent"
       WHERE "alertId" = $1 AND "companyId" = $2
       ORDER BY "createdAt" DESC
       LIMIT 200`,
      alertId,
      companyId
    );

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Pulse alert events GET error:', error);
    return NextResponse.json({ error: 'Failed to load pulse alert events', details: String(error?.message || error) }, { status: 500 });
  }
}
