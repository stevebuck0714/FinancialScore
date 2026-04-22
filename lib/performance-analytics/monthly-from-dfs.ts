import prisma from '@/lib/prisma';

/**
 * Aggregate `DailyFinancialSnapshot` rows into a month-bucketed shape that is
 * structurally compatible with `MonthlyFinancial` rows consumed by the
 * Performance Analytics surface (Trend Explorer, etc.).
 *
 * Why this exists: `MonthlyFinancial` has no unique `(companyId, monthDate)`
 * constraint and accumulates one row per `FinancialRecord`, which makes the
 * Trend Explorer query (ordered ASC, capped at `take: 200`) silently truncate
 * the right edge of the chart for tenants with many imports. DFS has a unique
 * `(companyId, snapshotDate, frequency)` constraint and is the upstream truth
 * that already feeds the Daily Financials and Working Capital tabs, so when
 * DFS coverage exists for a tenant we read from it directly.
 *
 * Aggregation rules:
 *  - P&L flow columns (revenue, cogs*, expense lines, etc.) are SUMMED across
 *    the days within the month.
 *  - Balance-sheet point-in-time columns (cash, ar, inventory, ap, equity,
 *    totals, etc.) take the value from the LAST day of the month present in
 *    DFS. For an in-progress month this is "MTD through latest snapshot".
 *
 * Returns `null` when DFS has no daily rows in the requested window, so
 * callers can fall back to `MonthlyFinancial`.
 */

const PNL_FLOW_FIELDS = [
  'revenue',
  'expense',
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
  'cogsTotal',
  'payroll',
  'ownerBasePay',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'taxLicense',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
  'phoneComm',
  'infrastructure',
  'autoTravel',
  'salesExpense',
  'marketing',
  'trainingCert',
  'mealsEntertainment',
  'interestExpense',
  'depreciationAmortization',
  'otherExpense',
  'nonOperatingIncome',
  'nonOperatingExpense',
  'extraordinaryItems',
] as const;

const BS_POINT_IN_TIME_FIELDS = [
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

export type MonthlyFromDfsRow = {
  companyId: string;
  monthDate: Date;
  financialRecordId: string | null;
  // Marker so consumers can distinguish DFS-derived rows from MonthlyFinancial rows.
  _trendSource: 'dfs';
  // Diagnostics: how many daily rows fed this bucket and which day was used for BS.
  _daysInMonth: number;
  _lastDayInMonth: Date;
} & Record<(typeof PNL_FLOW_FIELDS)[number], number> &
  Record<(typeof BS_POINT_IN_TIME_FIELDS)[number], number>;

export type MonthlyFromDfsResult = {
  rows: MonthlyFromDfsRow[];
  daysCovered: number;
  firstSnapshot: Date;
  lastSnapshot: Date;
};

export async function loadMonthlyFromDfs(
  companyId: string,
  startDate: Date,
  endDate: Date,
): Promise<MonthlyFromDfsResult | null> {
  let dailyRows: Array<Record<string, unknown>>;
  try {
    dailyRows = (await prisma.dailyFinancialSnapshot.findMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: { gte: startDate, lte: endDate },
      },
      orderBy: { snapshotDate: 'asc' },
    })) as unknown as Array<Record<string, unknown>>;
  } catch (error) {
    console.warn('Performance analytics: failed to load DailyFinancialSnapshot', error);
    return null;
  }

  if (!dailyRows.length) return null;

  type Bucket = {
    rows: Array<Record<string, unknown>>;
    lastDayRow: Record<string, unknown>;
    lastDayDate: Date;
  };

  const byMonth = new Map<string, Bucket>();
  for (const row of dailyRows) {
    const snapshotDate = row.snapshotDate as Date | undefined;
    if (!snapshotDate) continue;
    const d = new Date(snapshotDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(key);
    if (!existing) {
      byMonth.set(key, { rows: [row], lastDayRow: row, lastDayDate: d });
      continue;
    }
    existing.rows.push(row);
    if (d.getTime() > existing.lastDayDate.getTime()) {
      existing.lastDayRow = row;
      existing.lastDayDate = d;
    }
  }

  const sortedKeys = Array.from(byMonth.keys()).sort();
  const monthlyRows: MonthlyFromDfsRow[] = sortedKeys.map((key) => {
    const bucket = byMonth.get(key)!;
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const monthDate = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));

    const aggregated: Record<string, unknown> = {
      companyId,
      monthDate,
      financialRecordId: null,
      _trendSource: 'dfs',
      _daysInMonth: bucket.rows.length,
      _lastDayInMonth: bucket.lastDayDate,
    };

    for (const field of PNL_FLOW_FIELDS) {
      let sum = 0;
      for (const r of bucket.rows) {
        const v = Number((r as any)[field]);
        if (Number.isFinite(v)) sum += v;
      }
      aggregated[field] = sum;
    }

    for (const field of BS_POINT_IN_TIME_FIELDS) {
      const v = Number((bucket.lastDayRow as any)[field]);
      aggregated[field] = Number.isFinite(v) ? v : 0;
    }

    return aggregated as MonthlyFromDfsRow;
  });

  const firstSnapshot = new Date(dailyRows[0]!.snapshotDate as Date);
  const lastSnapshot = new Date(dailyRows[dailyRows.length - 1]!.snapshotDate as Date);

  return {
    rows: monthlyRows,
    daysCovered: dailyRows.length,
    firstSnapshot,
    lastSnapshot,
  };
}
