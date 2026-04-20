import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/admin/dryrun-bs-from-daily?companyId=...
 *   (auth via `x-cron-secret` header, optional `?secret=` query fallback)
 *
 * READ-ONLY Phase-2 diagnostic. For a given company, projects what the
 * MonthlyFinancial balance-sheet columns WOULD be if they were sourced from
 * DailyFinancialSnapshot end-of-month rows (the same pipeline that powers
 * Daily Financials / Ops). Then diffs the proposed values against the
 * current persisted MonthlyFinancial rows so we can see exactly which lines
 * in Data Review would change, by how much, before any write.
 *
 * Optional query params:
 *   - throughMonth=YYYY-MM   (default: current calendar month, UTC)
 *   - tailMonths=N           (default: 12, max: 60) — how many months back from throughMonth to compare
 *
 * AUDIT INVARIANT: This route MUST NOT mutate any data. It uses only Prisma
 * `findUnique`, `findFirst`, `findMany`, and `$queryRaw` SELECT statements.
 * Greppable check: if you see any of `prisma.*\.(create|update|upsert|delete|
 * createMany|updateMany|deleteMany|executeRaw)` in this file, that is a bug.
 *
 * Delete this file once Phase 2 has shipped and validated on prod.
 */

// Balance-sheet columns that exist on BOTH MonthlyFinancial and
// DailyFinancialSnapshot, in display order. These are the only columns this
// endpoint considers; income-statement columns are intentionally untouched.
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

// Fields the summary uses to decide whether the gap is materially closing.
// totalAssets is the headline number the user is comparing across pages.
const SUMMARY_FIELDS: ReadonlyArray<(typeof BS_FIELDS)[number]> = [
  'totalAssets',
  'totalLiab',
  'totalEquity',
];

function checkSecret(request: NextRequest, querySecret: string | null): boolean {
  const expected = process.env.CRON_SECRET || 'dev-secret-change-me';
  const header = String(request.headers.get('x-cron-secret') || '').trim();
  const provided = (querySecret && String(querySecret).trim()) || header;
  return Boolean(provided && provided === expected);
}

function normalizeTargetMonth(value: unknown): string | null {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function currentMonthUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildMonthWindow(throughMonth: string, tailMonths: number): string[] {
  const [y, m] = throughMonth.split('-').map((x) => Number(x));
  const months: string[] = [];
  for (let i = tailMonths - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(monthKeyFromDate(d));
  }
  return months;
}

function firstOfMonth(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
}

function endOfMonth(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map((x) => Number(x));
  return new Date(Date.UTC(y, m, 0, 23, 59, 59));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const stage = { current: 'init' };
  try {
    return await runDryRun(request, stage);
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

async function runDryRun(request: NextRequest, stage: { current: string }): Promise<NextResponse> {
  stage.current = 'auth';
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (!checkSecret(request, querySecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  stage.current = 'parse_query';
  const companyIdParam = String(url.searchParams.get('companyId') || '').trim();
  const companyNameParam = String(url.searchParams.get('companyName') || '').trim();
  const throughMonthParam = normalizeTargetMonth(url.searchParams.get('throughMonth'));
  const tailMonths = Math.max(1, Math.min(60, Number(url.searchParams.get('tailMonths') || '12')));

  stage.current = 'resolve_company';
  let companyId = companyIdParam;
  if (!companyId && companyNameParam) {
    const matches = await prisma.company.findMany({
      where: { name: { contains: companyNameParam, mode: 'insensitive' } },
      select: { id: true, name: true, accountingSystem: true },
      take: 5,
    });
    if (matches.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'company_not_found', companyName: companyNameParam },
        { status: 404 },
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error: 'company_name_ambiguous',
          matches: matches.map((m) => ({ id: m.id, name: m.name, system: m.accountingSystem })),
        },
        { status: 400 },
      );
    }
    companyId = matches[0].id;
  }
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: 'missing_company', message: 'Provide ?companyId= or ?companyName=' },
      { status: 400 },
    );
  }

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

  stage.current = 'resolve_window';
  const throughMonth = throughMonthParam || currentMonthUtc();
  const months = buildMonthWindow(throughMonth, tailMonths);
  const windowStart = firstOfMonth(months[0]);
  const windowEnd = endOfMonth(months[months.length - 1]);

  stage.current = 'load_current_monthly';
  // We diff against the most recent FinancialRecord — that's what Data Review reads.
  const currentRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: {
      monthlyData: {
        where: {
          monthDate: { gte: windowStart, lte: windowEnd },
        },
        orderBy: { monthDate: 'asc' },
      },
    },
  });
  const currentByMonth = new Map<string, any>();
  if (currentRecord) {
    for (const row of currentRecord.monthlyData as any[]) {
      const d = new Date(row.monthDate);
      if (!Number.isNaN(d.getTime())) {
        currentByMonth.set(monthKeyFromDate(d), row);
      }
    }
  }

  stage.current = 'load_daily_snapshots';
  const dailySnapshots: any[] = await prisma.dailyFinancialSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { snapshotDate: 'asc' },
  });

  // For each month, pick the LATEST snapshotDate in that month (= true EOM
  // business day, since the daily pipeline only writes on business days).
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

  stage.current = 'build_diff';
  const perMonthDiff: Array<{
    month: string;
    hasCurrent: boolean;
    hasOps: boolean;
    opsSnapshotDate: string | null;
    fields: Array<{
      field: string;
      currentValue: number | null;
      proposedValue: number | null;
      delta: number | null; // proposed - current
    }>;
  }> = [];
  let monthsWithBoth = 0;
  let monthsMissingOps = 0;
  let monthsMissingCurrent = 0;

  for (const month of months) {
    const cur = currentByMonth.get(month) || null;
    const ops = dailyEomByMonth.get(month) || null;
    if (cur && ops) monthsWithBoth += 1;
    if (!ops) monthsMissingOps += 1;
    if (!cur) monthsMissingCurrent += 1;

    const fields = BS_FIELDS.map((f) => {
      const curV = cur ? Number((cur as any)[f] || 0) : null;
      const propV = ops ? Number((ops as any)[f] || 0) : null;
      const delta =
        curV !== null && propV !== null ? Number((propV - curV).toFixed(2)) : null;
      return {
        field: f,
        currentValue: curV !== null ? Number(curV.toFixed(2)) : null,
        proposedValue: propV !== null ? Number(propV.toFixed(2)) : null,
        delta,
      };
    });

    perMonthDiff.push({
      month,
      hasCurrent: Boolean(cur),
      hasOps: Boolean(ops),
      opsSnapshotDate: ops?.snapshotDate ? new Date(ops.snapshotDate).toISOString() : null,
      fields,
    });
  }

  stage.current = 'summarize';
  // For each summary field, average the absolute relative gap (|delta|/|current|)
  // across months where we have both current and ops. This tells us how big a
  // move Phase 2 represents on the headline lines.
  const summaryByField: Record<
    string,
    { measuredMonths: number; avgAbsDelta: number; avgAbsRelGap: number }
  > = {};
  for (const f of SUMMARY_FIELDS) {
    let n = 0;
    let sumAbsDelta = 0;
    let sumAbsRel = 0;
    for (const m of perMonthDiff) {
      const row = m.fields.find((x) => x.field === f);
      if (!row || row.currentValue === null || row.proposedValue === null) continue;
      n += 1;
      const absDelta = Math.abs(row.proposedValue - row.currentValue);
      const denom = Math.max(1, Math.abs(row.currentValue));
      sumAbsDelta += absDelta;
      sumAbsRel += absDelta / denom;
    }
    summaryByField[f] = {
      measuredMonths: n,
      avgAbsDelta: n > 0 ? Number((sumAbsDelta / n).toFixed(2)) : 0,
      avgAbsRelGap: n > 0 ? Number((sumAbsRel / n).toFixed(4)) : 0,
    };
  }

  // Verdict: Phase 2 is "ready" when most months in the window have both a
  // current MonthlyFinancial row AND an Ops EOM snapshot. Any gaps mean we'd
  // either skip those months on apply or need to backfill DFS first.
  const totalMonths = months.length;
  const coverageRatio = totalMonths > 0 ? monthsWithBoth / totalMonths : 0;
  let verdict: 'ready' | 'partial_coverage' | 'insufficient_coverage';
  if (coverageRatio >= 0.95) verdict = 'ready';
  else if (coverageRatio >= 0.5) verdict = 'partial_coverage';
  else verdict = 'insufficient_coverage';

  return NextResponse.json({
    ok: true,
    company: { id: company.id, name: company.name, accountingSystem: company.accountingSystem },
    inputs: {
      throughMonth,
      tailMonths,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      financialRecordId: currentRecord?.id ?? null,
    },
    coverage: {
      monthsInWindow: totalMonths,
      monthsWithBoth,
      monthsMissingOps,
      monthsMissingCurrent,
      coverageRatio: Number(coverageRatio.toFixed(3)),
      verdict,
    },
    summary: summaryByField,
    perMonthDiff,
  });
}
