import prisma from '@/lib/prisma';
import {
  type AccountMappingRow,
  type AccountTarget,
  buildAccountIdToTarget,
  resolveDfsColumnsForTargetField,
  signForDfsColumn,
  sumGLByAccount,
} from '@/lib/financial/daily-bs-from-gl';

/**
 * Monthly P&L aggregation from GL truth, used to backfill the legacy
 * `MonthlyFinancial` table that powers `Data Review`, `Goals`, `Cash Flow`,
 * `Ratios`, `Projections`, `LOB Reporting`, and other consumers of
 * `useMasterData` / `/api/master-data`.
 *
 * This is the monthly counterpart to `computeDailyPnlMovementsFromGL` in
 * `daily-bs-from-gl.ts`. The daily helper aggregates per-day deltas; this
 * helper aggregates the entire month and additionally returns
 * revenue/cogs/expense breakdowns keyed by the original `targetField` slug
 * (e.g. `rev_finished_goods_sales`, `cogs_other_cogs`, `payroll`,
 * `otherExpense`) so the breakdown JSON columns on `MonthlyFinancial`
 * match what the legacy CSI builder used to produce.
 */

const COGS_SUBCATEGORY_COLUMNS = new Set<string>([
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
]);

const OPEX_SUBCATEGORY_COLUMNS = new Set<string>([
  'payroll',
  'ownerBasePay',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'taxLicense',
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
]);

const ALLOWED_SCALAR_COLUMNS = new Set<string>([
  'revenue',
  'expense',
  'cogsTotal',
  'nonOperatingIncome',
  'nonOperatingExpense',
  'extraordinaryItems',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
  ...Array.from(COGS_SUBCATEGORY_COLUMNS),
  ...Array.from(OPEX_SUBCATEGORY_COLUMNS),
]);

export async function buildAccountIdToTargetForMonthlySync(
  companyId: string,
): Promise<Map<string, AccountTarget>> {
  const mappings = (await prisma.accountMapping.findMany({
    where: { companyId },
    select: {
      accountId: true,
      accountCode: true,
      accountName: true,
      accountClassification: true,
      targetField: true,
    },
  })) as AccountMappingRow[];
  return buildAccountIdToTarget(mappings);
}

/**
 * Pick the breakdown bucket key for an account's contribution.
 *
 * Mirrors the legacy `csi-monthly-financial-builder` behavior so the
 * resulting JSON shape stays compatible with every UI consumer:
 *   - revenue → `rev_*` slug if present, else `rev_other_revenue`
 *   - cogs    → `cogs_*` slug if present, else `cogs_other_cogs`
 *   - opex    → bare opex slug (e.g. `payroll`, `otherExpense`)
 *
 * Returns null when the account doesn't belong to a P&L breakdown bucket
 * (e.g. BS lines, taxes, non-operating items handled as scalars only).
 */
function pickBreakdownKey(
  rawTargetField: string,
  resolvedColumn: string,
): { bucket: 'revenue' | 'cogs' | 'expense'; key: string } | null {
  const trimmed = String(rawTargetField || '').trim();
  const lower = trimmed.toLowerCase();

  if (resolvedColumn === 'revenue') {
    const key = lower.startsWith('rev_') ? trimmed : 'rev_other_revenue';
    return { bucket: 'revenue', key };
  }
  if (resolvedColumn === 'cogsTotal' || COGS_SUBCATEGORY_COLUMNS.has(resolvedColumn)) {
    const key = lower.startsWith('cogs_') ? trimmed : 'cogs_other_cogs';
    return { bucket: 'cogs', key };
  }
  if (resolvedColumn === 'expense' || OPEX_SUBCATEGORY_COLUMNS.has(resolvedColumn)) {
    // For the `expense` rollup column we need the *subcategory* slug for
    // the breakdown, not the literal string "expense" — that key is
    // useless to the UI. Use the original targetField if it's a
    // recognized opex slug, otherwise fall back to `otherExpense` so
    // the row is still attributable.
    if (resolvedColumn === 'expense') {
      const candidate = OPEX_SUBCATEGORY_COLUMNS.has(trimmed) ? trimmed : 'otherExpense';
      return { bucket: 'expense', key: candidate };
    }
    return { bucket: 'expense', key: resolvedColumn };
  }
  return null;
}

export type MonthlyPnlFromGlResult = {
  scalars: Record<string, number>;
  revenueBreakdown: Record<string, number>;
  cogsBreakdown: Record<string, number>;
  expenseBreakdown: Record<string, number>;
};

export async function computeMonthlyPnlBreakdownsFromGL(
  companyId: string,
  monthStart: Date,
  monthEnd: Date,
  accountIdToTarget?: Map<string, AccountTarget>,
): Promise<MonthlyPnlFromGlResult> {
  const lookup = accountIdToTarget || (await buildAccountIdToTargetForMonthlySync(companyId));
  const accountIds = Array.from(lookup.keys());

  const scalars: Record<string, number> = {};
  const revenueBreakdown: Record<string, number> = {};
  const cogsBreakdown: Record<string, number> = {};
  const expenseBreakdown: Record<string, number> = {};

  if (accountIds.length === 0) {
    return { scalars, revenueBreakdown, cogsBreakdown, expenseBreakdown };
  }

  const glSums = await sumGLByAccount(companyId, accountIds, monthStart, monthEnd);
  if (glSums.size === 0) {
    return { scalars, revenueBreakdown, cogsBreakdown, expenseBreakdown };
  }

  // For each account, pick the SINGLE column we'll use to record the
  // breakdown JSON entry — separate from the scalar accumulation, which
  // legitimately double-records into the rollup AND subcategory columns.
  //
  // Resolution order, mirroring how the legacy CSI builder bucketed an
  // account into a breakdown:
  //   - revenue accounts:     ['revenue']                      → 'revenue'
  //   - cogs-subcategory acct: ['cogsTotal', 'cogsOther', ...] → subcat
  //   - cogs generic acct:     ['cogsTotal']                   → 'cogsTotal'
  //   - opex-subcategory acct: ['expense', 'payroll', ...]     → subcat
  //   - opex generic acct:     ['expense']                     → 'expense'
  //
  // master-data's /api/master-data sums cogsBreakdown / revenueBreakdown
  // values directly into the displayed cogsTotal / revenue numbers via
  // its `hasSectorCogs` / `hasSectorRevenue` branches. Recording into
  // BOTH the rollup AND the subcategory column would double the
  // displayed totals (Atlantic Precision Jan 2026: COGS shown as
  // ~$1.44M = 2× the GL truth $700K).
  const pickBreakdownColumn = (dfsColumns: readonly string[]): string | null => {
    if (dfsColumns.length === 0) return null;
    if (dfsColumns.length === 1) return dfsColumns[0];
    // Multi-column resolution always pairs a rollup with a subcategory.
    // Prefer the subcategory.
    for (const col of dfsColumns) {
      if (col !== 'expense' && col !== 'cogsTotal') return col;
    }
    return dfsColumns[0];
  };

  for (const [accountId, raw] of glSums.entries()) {
    const target = lookup.get(accountId);
    if (!target) continue;
    const dfsColumns = resolveDfsColumnsForTargetField(target.targetField);
    if (dfsColumns.length === 0) continue;

    const rawNum = Number(raw) || 0;
    if (rawNum === 0) continue;

    // Scalars: accumulate into every resolved column with that column's
    // natural sign. This mirrors how `daily-bs-from-gl` populates DFS so
    // the MonthlyFinancial scalar columns stay consistent with DFS
    // (cogsTotal AND each cogs subcategory both get the contribution).
    for (const column of dfsColumns) {
      if (!ALLOWED_SCALAR_COLUMNS.has(column)) continue;
      const adjusted = rawNum * signForDfsColumn(column);
      scalars[column] = (scalars[column] || 0) + adjusted;
    }

    // Breakdown JSON: record EXACTLY ONCE per account, on the chosen
    // breakdown column. Use the SIGNED contribution (rawNum * signForDfs)
    // — NOT Math.abs — so per-account net credits (refunds, period
    // adjustments, return JEs) correctly reduce the breakdown bucket
    // they belong to. Math.abs would flip those into positive
    // contributions and inflate the breakdown total above the rollup
    // scalar (e.g. Atlantic Precision Jan 2026: cogs breakdown sum
    // came in $19,416 above DFS truth $700,057 because a few cogs
    // accounts had net-credit months that abs'd into positive
    // contributions instead of subtracting). For typical
    // debit-balance cogs/opex and credit-balance revenue postings
    // this still yields positive numbers matching the legacy CSI
    // builder convention, since `signForDfsColumn` already inverts
    // revenue.
    const breakdownColumn = pickBreakdownColumn(dfsColumns);
    if (!breakdownColumn) continue;
    const breakdown = pickBreakdownKey(target.targetField, breakdownColumn);
    if (!breakdown) continue;
    const breakdownAmount = rawNum * signForDfsColumn(breakdownColumn);
    if (breakdownAmount === 0) continue;

    if (breakdown.bucket === 'revenue') {
      revenueBreakdown[breakdown.key] = (revenueBreakdown[breakdown.key] || 0) + breakdownAmount;
    } else if (breakdown.bucket === 'cogs') {
      cogsBreakdown[breakdown.key] = (cogsBreakdown[breakdown.key] || 0) + breakdownAmount;
    } else if (breakdown.bucket === 'expense') {
      expenseBreakdown[breakdown.key] = (expenseBreakdown[breakdown.key] || 0) + breakdownAmount;
    }
  }

  // Round to 2 decimals so we don't bleed floating-point noise into the
  // breakdown JSON.
  const roundMap = (m: Record<string, number>): void => {
    for (const k of Object.keys(m)) m[k] = Math.round(m[k] * 100) / 100;
  };
  roundMap(scalars);
  roundMap(revenueBreakdown);
  roundMap(cogsBreakdown);
  roundMap(expenseBreakdown);

  return { scalars, revenueBreakdown, cogsBreakdown, expenseBreakdown };
}
