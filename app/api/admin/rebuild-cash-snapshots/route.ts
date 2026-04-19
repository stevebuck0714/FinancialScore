import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { rebuildAllCashSnapshotsFromGL } from '@/lib/infor-m3/operational-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/rebuild-cash-snapshots
 *
 * Body: {
 *   secret: string                 // CRON_SECRET
 *   companyId: string
 *   startDate: string              // YYYY-MM-DD
 *   endDate: string                // YYYY-MM-DD
 *   frequency?: 'daily'|'weekly'|'monthly' (default 'daily')
 * }
 *
 * Recomputes CashSnapshot rows for every date in [startDate, endDate] for the
 * given company by deriving each cash-mapped account's balance from
 * GLTransactionFact (debit - credit running balance, as-of snapshotDate).
 *
 * Use this after a Window Refresh / historical SLGLTRANS sync when the cash
 * chart is showing stale "current bank balance" values from the SLBankHdrs
 * IDO instead of the true GL balance.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      secret?: string;
      companyId?: string;
      startDate?: string;
      endDate?: string;
      frequency?: string;
    };

    const expectedSecret = process.env.CRON_SECRET || 'dev-secret-change-me';
    if (!body.secret || body.secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const startStr = String(body.startDate || '').trim();
    const endStr = String(body.endDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      return NextResponse.json(
        { error: 'startDate and endDate required as YYYY-MM-DD' },
        { status: 400 }
      );
    }
    const startDate = new Date(`${startStr}T00:00:00.000Z`);
    const endDate = new Date(`${endStr}T00:00:00.000Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'invalid startDate/endDate' }, { status: 400 });
    }
    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        { error: 'startDate must be on or before endDate' },
        { status: 400 }
      );
    }

    const freqRaw = String(body.frequency || 'daily').trim().toLowerCase();
    const frequency =
      freqRaw === 'weekly' || freqRaw === 'monthly' ? freqRaw : 'daily';

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'company not found' }, { status: 404 });
    }

    const startedAt = Date.now();
    const result = await rebuildAllCashSnapshotsFromGL(
      companyId,
      startDate,
      endDate,
      frequency as 'daily' | 'weekly' | 'monthly'
    );
    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      frequency,
      startDate: startStr,
      endDate: endStr,
      datesProcessed: result.datesProcessed,
      rowsWritten: result.rowsWritten,
      elapsedMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('rebuild-cash-snapshots failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
