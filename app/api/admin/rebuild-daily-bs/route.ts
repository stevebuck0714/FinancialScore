import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { rebuildDailyFinancialSnapshotsFromGL } from '@/lib/financial/daily-bs-from-gl';
import { syncMonthlyFinancialBsFromDailySnapshot } from '@/lib/financials/sync-monthly-bs-from-daily';
import { syncMonthlyFinancialPnlFromDailySnapshot } from '@/lib/financials/sync-monthly-pnl-from-daily';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/rebuild-daily-bs
 *
 * Body: {
 *   secret: string                       // CRON_SECRET
 *   companyId: string
 *   startDate: string                    // YYYY-MM-DD (inclusive)
 *   endDate: string                      // YYYY-MM-DD (inclusive)
 *   frequency?: 'daily'|'weekly'|'monthly'   (default 'daily')
 *   fiscalYearStartMonth?: number        // 1-12, default 1 (calendar)
 *   fiscalYearStartDay?: number          // 1-31, default 1
 *   pnlUpdateMode?: 'preserve'|'overwrite' // default 'preserve' — see
 *                                          // RebuildDailyBSOptions docstring.
 *                                          // 'overwrite' is for the one-time
 *                                          // corrective backfill that repairs
 *                                          // rows poisoned by an earlier
 *                                          // YTD-into-daily-slot bug.
 * }
 *
 * Recomputes DailyFinancialSnapshot rows for every date in [startDate, endDate]
 * for the given company by deriving each balance-sheet line and YTD P&L line
 * from GLTransactionFact via AccountMapping.targetField. Retained Earnings is
 * computed as `bookedRE_GL_balance + (YTD revenue - YTD expense)` so the
 * BS always balances day-to-day without needing a year-end close in the GL.
 *
 * Use this after a Window Refresh / historical SLGLTRANS sync, or any time
 * the upstream IDO-fed daily snapshots have drifted from GL.
 *
 * For 1,113-day windows this typically finishes in ~10-30s on Vercel.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      secret?: string;
      companyId?: string;
      startDate?: string;
      endDate?: string;
      frequency?: string;
      fiscalYearStartMonth?: number;
      fiscalYearStartDay?: number;
      pnlUpdateMode?: string;
      // When true (default), after the DFS rebuild also re-derive
      // MonthlyFinancial BS columns + P&L scalars + breakdown JSON from
      // the freshly-rebuilt DFS rows. This is what keeps Data Review and
      // the rest of useMasterData aligned with Daily Financials. Pass
      // false if you only want to rebuild DFS without touching the
      // monthly publish path.
      syncMonthly?: boolean;
    };

    const expectedSecret = process.env.CRON_SECRET || 'dev-secret-change-me';
    const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
    const providedSecret = (body.secret && String(body.secret).trim()) || headerSecret;
    if (!providedSecret || providedSecret !== expectedSecret) {
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

    const fyMonth =
      Number.isFinite(body.fiscalYearStartMonth) && Number(body.fiscalYearStartMonth) >= 1 && Number(body.fiscalYearStartMonth) <= 12
        ? Number(body.fiscalYearStartMonth)
        : 1;
    const fyDay =
      Number.isFinite(body.fiscalYearStartDay) && Number(body.fiscalYearStartDay) >= 1 && Number(body.fiscalYearStartDay) <= 31
        ? Number(body.fiscalYearStartDay)
        : 1;

    const pnlModeRaw = String(body.pnlUpdateMode || 'preserve').trim().toLowerCase();
    const pnlUpdateMode: 'preserve' | 'overwrite' =
      pnlModeRaw === 'overwrite' ? 'overwrite' : 'preserve';

    const syncMonthly = body.syncMonthly !== false;

    const startedAt = Date.now();
    const result = await rebuildDailyFinancialSnapshotsFromGL({
      companyId,
      startDate,
      endDate,
      frequency: frequency as 'daily' | 'weekly' | 'monthly',
      fiscalYearStartMonth: fyMonth,
      fiscalYearStartDay: fyDay,
      pnlUpdateMode,
    });

    let monthlySync:
      | {
          ok: boolean;
          bs?: { monthsUpdated: number; monthsSkippedNoDfs: number; errors: number };
          pnl?: { monthsUpdated: number; monthsSkipped: number; errors: number };
          error?: string;
        }
      | null = null;
    if (syncMonthly) {
      try {
        const bsSync = await syncMonthlyFinancialBsFromDailySnapshot(companyId);
        const pnlSync = await syncMonthlyFinancialPnlFromDailySnapshot(companyId);
        monthlySync = {
          ok: true,
          bs: {
            monthsUpdated: bsSync.monthsUpdated,
            monthsSkippedNoDfs: bsSync.monthsSkippedNoDfs,
            errors: bsSync.errors,
          },
          pnl: {
            monthsUpdated: pnlSync.monthsUpdated,
            monthsSkipped: pnlSync.monthsSkippedNoMappings,
            errors: pnlSync.errors,
          },
        };
      } catch (syncErr) {
        monthlySync = {
          ok: false,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        };
      }
    }

    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      frequency,
      startDate: startStr,
      endDate: endStr,
      fiscalYearStartMonth: fyMonth,
      fiscalYearStartDay: fyDay,
      pnlUpdateMode,
      syncMonthly,
      datesProcessed: result.datesProcessed,
      rowsWritten: result.rowsWritten,
      mappedAccountCount: result.mappedAccountCount,
      unmappedTargetFields: result.unmappedTargetFields,
      monthlySync,
      elapsedMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('rebuild-daily-bs failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
