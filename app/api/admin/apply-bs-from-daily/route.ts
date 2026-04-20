import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/admin/apply-bs-from-daily?companyId=...&dryRun=true|false
 *   (auth via `x-cron-secret` header, optional `?secret=` query fallback)
 *
 * Phase-2 APPLY: for the most recent FinancialRecord on a single company,
 * sets MonthlyFinancial balance-sheet columns from the corresponding
 * DailyFinancialSnapshot end-of-month row. Income-statement columns are NOT
 * touched. This makes Data Review's BS render the same values that Daily
 * Financials/Ops shows, by construction.
 *
 * Default mode is dryRun=true. Pass dryRun=false to actually write.
 *
 * Pre-flight requirement (operator-managed):
 *   A backup table must exist for the target company before dryRun=false:
 *     CREATE TABLE "MonthlyFinancial_backup_phase2_<YYYYMMDD>" AS
 *     SELECT m.* FROM "MonthlyFinancial" m WHERE m."companyId" = '<id>';
 *
 *   The endpoint does not enforce this — it's the operator's responsibility.
 *
 * Rollback (one statement):
 *   UPDATE "MonthlyFinancial" m
 *      SET cash = b.cash, ar = b.ar, inventory = b.inventory, "otherCA" = b."otherCA",
 *          tca = b.tca, "fixedAssets" = b."fixedAssets", "otherAssets" = b."otherAssets",
 *          "totalAssets" = b."totalAssets", ap = b.ap, loc = b.loc, "otherCL" = b."otherCL",
 *          tcl = b.tcl, ltd = b.ltd, "totalLiab" = b."totalLiab",
 *          "ownersCapital" = b."ownersCapital", "ownersDraw" = b."ownersDraw",
 *          "commonStock" = b."commonStock", "preferredStock" = b."preferredStock",
 *          "retainedEarnings" = b."retainedEarnings",
 *          "additionalPaidInCapital" = b."additionalPaidInCapital",
 *          "treasuryStock" = b."treasuryStock", "totalEquity" = b."totalEquity",
 *          "totalLAndE" = b."totalLAndE"
 *     FROM "MonthlyFinancial_backup_phase2_<YYYYMMDD>" b
 *    WHERE m.id = b.id;
 *
 * Delete this file once Phase 2 has rolled out to all CSI tenants.
 */

// BS columns copied from DailyFinancialSnapshot to MonthlyFinancial.
// Order matters only for human-readable output; the actual update writes them
// all atomically via Prisma `update`.
const BS_FIELDS = [
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalLAndE',
] as const;

type BsField = (typeof BS_FIELDS)[number];

function checkSecret(request: NextRequest, querySecret: string | null): boolean {
  const expected = process.env.CRON_SECRET || 'dev-secret-change-me';
  const header = String(request.headers.get('x-cron-secret') || '').trim();
  const provided = (querySecret && String(querySecret).trim()) || header;
  return Boolean(provided && provided === expected);
}

function monthKeyFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const stage = { current: 'init' };
  try {
    return await runApply(request, stage);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        stage: stage.current,
        error: 'route_threw',
        message: err?.message || String(err),
        stack: err?.stack ? String(err.stack).split('\n').slice(0, 8) : undefined,
      },
      { status: 500 },
    );
  }
}

// Allow GET as a convenience for dry-run only. GET is ALWAYS forced to dryRun.
// Real writes require POST + explicit dryRun=false.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const stage = { current: 'init' };
  try {
    return await runApply(request, stage, { forceDryRun: true });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        stage: stage.current,
        error: 'route_threw',
        message: err?.message || String(err),
      },
      { status: 500 },
    );
  }
}

async function runApply(
  request: NextRequest,
  stage: { current: string },
  options: { forceDryRun?: boolean } = {},
): Promise<NextResponse> {
  stage.current = 'auth';
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (!checkSecret(request, querySecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  stage.current = 'parse_query';
  const companyId = String(url.searchParams.get('companyId') || '').trim();
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: 'missing_company', message: 'Provide ?companyId=' },
      { status: 400 },
    );
  }
  const dryRunRaw = String(url.searchParams.get('dryRun') || 'true').trim().toLowerCase();
  const dryRun = options.forceDryRun ? true : dryRunRaw !== 'false';

  stage.current = 'load_company';
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, accountingSystem: true },
  });
  if (!company) {
    return NextResponse.json(
      { ok: false, error: 'company_not_found', companyId },
      { status: 404 },
    );
  }

  stage.current = 'load_financial_record';
  const financialRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: {
      monthlyData: { orderBy: { monthDate: 'asc' } },
    },
  });
  if (!financialRecord) {
    return NextResponse.json(
      { ok: false, error: 'no_financial_record', companyId },
      { status: 404 },
    );
  }
  const monthlyRows: any[] = financialRecord.monthlyData as any[];
  if (monthlyRows.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'no_monthly_rows', companyId, financialRecordId: financialRecord.id },
      { status: 404 },
    );
  }

  stage.current = 'window_bounds';
  // Pull DFS rows that span all months covered by the current FinancialRecord.
  // Use the first-of-first-month and last-of-last-month UTC bounds.
  const firstMonth = new Date(monthlyRows[0].monthDate);
  const lastMonth = new Date(monthlyRows[monthlyRows.length - 1].monthDate);
  const windowStart = new Date(
    Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth(), 1, 0, 0, 0),
  );
  const windowEnd = new Date(
    Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  stage.current = 'load_daily_snapshots';
  const dailySnapshots: any[] = await prisma.dailyFinancialSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { snapshotDate: 'asc' },
  });

  // For each month, pick the LATEST snapshotDate in that month — this is the
  // true end-of-month business day, since the daily pipeline only writes on
  // business days.
  const dailyEomByMonth = new Map<string, any>();
  for (const snap of dailySnapshots) {
    const d = new Date(snap.snapshotDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKeyFromDate(d);
    const existing = dailyEomByMonth.get(key);
    if (!existing || new Date(existing.snapshotDate).getTime() < d.getTime()) {
      dailyEomByMonth.set(key, snap);
    }
  }

  stage.current = 'plan_updates';
  // Build the per-row plan: which MonthlyFinancial id gets which DFS BS values?
  // For audit, capture before/after for the three headline totals.
  const plan: Array<{
    monthlyFinancialId: string;
    month: string;
    opsSnapshotDate: string | null;
    skipped?: 'no_eom_dfs';
    before: { totalAssets: number; totalLiab: number; totalEquity: number } | null;
    after: { totalAssets: number; totalLiab: number; totalEquity: number } | null;
    updates: Partial<Record<BsField, number>> | null;
  }> = [];

  let plannedUpdates = 0;
  let skippedNoDfs = 0;

  for (const row of monthlyRows) {
    const d = new Date(row.monthDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKeyFromDate(d);
    const dfs = dailyEomByMonth.get(key);

    if (!dfs) {
      skippedNoDfs += 1;
      plan.push({
        monthlyFinancialId: row.id,
        month: key,
        opsSnapshotDate: null,
        skipped: 'no_eom_dfs',
        before: {
          totalAssets: Number(row.totalAssets || 0),
          totalLiab: Number(row.totalLiab || 0),
          totalEquity: Number(row.totalEquity || 0),
        },
        after: null,
        updates: null,
      });
      continue;
    }

    const updates: Partial<Record<BsField, number>> = {};
    for (const f of BS_FIELDS) {
      updates[f] = Number((dfs as any)[f] || 0);
    }
    plannedUpdates += 1;
    plan.push({
      monthlyFinancialId: row.id,
      month: key,
      opsSnapshotDate: new Date(dfs.snapshotDate).toISOString(),
      before: {
        totalAssets: Number(row.totalAssets || 0),
        totalLiab: Number(row.totalLiab || 0),
        totalEquity: Number(row.totalEquity || 0),
      },
      after: {
        totalAssets: Number(updates.totalAssets || 0),
        totalLiab: Number(updates.totalLiab || 0),
        totalEquity: Number(updates.totalEquity || 0),
      },
      updates,
    });
  }

  stage.current = 'apply_or_dry';
  let appliedCount = 0;
  let applyErrors = 0;
  const applyErrorDetails: Array<{ monthlyFinancialId: string; error: string }> = [];

  if (!dryRun) {
    // Atomic per-row updates. We avoid a single transaction across all months
    // so a failure on one row doesn't block the others; instead we report
    // applyErrors so the operator can see exactly what didn't land.
    for (const entry of plan) {
      if (!entry.updates) continue;
      try {
        await prisma.monthlyFinancial.update({
          where: { id: entry.monthlyFinancialId },
          data: entry.updates,
        });
        appliedCount += 1;
      } catch (err: any) {
        applyErrors += 1;
        applyErrorDetails.push({
          monthlyFinancialId: entry.monthlyFinancialId,
          error: String(err?.message || err),
        });
      }
    }
  }

  stage.current = 'respond';
  return NextResponse.json({
    ok: true,
    mode: dryRun ? 'dry_run' : 'applied',
    company: { id: company.id, name: company.name, accountingSystem: company.accountingSystem },
    financialRecord: { id: financialRecord.id, createdAt: financialRecord.createdAt },
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      monthlyRowCount: monthlyRows.length,
      dailySnapshotCount: dailySnapshots.length,
    },
    plan: {
      plannedUpdates,
      skippedNoDfs,
      ...(dryRun ? {} : { appliedCount, applyErrors, applyErrorDetails }),
    },
    perMonth: plan,
  });
}
