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

  // Track which subcategories already received a contribution from a
  // breakdown-keyable account so we don't double-count when the cogs
  // rollup also lands.
  const cogsSubcategorySeen = new Set<string>();

  for (const [accountId, raw] of glSums.entries()) {
    const target = lookup.get(accountId);
    if (!target) continue;
    const dfsColumns = resolveDfsColumnsForTargetField(target.targetField);
    if (dfsColumns.length === 0) continue;

    const rawNum = Number(raw) || 0;
    if (rawNum === 0) continue;

    for (const column of dfsColumns) {
      const sign = signForDfsColumn(column);
      const adjusted = rawNum * sign;

      // Scalars: only accumulate columns we expose in MonthlyFinancial.
      if (ALLOWED_SCALAR_COLUMNS.has(column)) {
        scalars[column] = (scalars[column] || 0) + adjusted;
      }

      // Breakdown JSON: keyed by the original targetField slug so the
      // shape matches the legacy CSI builder. Note we always store
      // POSITIVE amounts (Math.abs) — every breakdown-consuming UI
      // (Data Review, LOB Reporting, etc.) sums these as costs/revenue
      // magnitudes, mirroring the legacy `applyMappedAmount` behavior.
      if (column === 'cogsTotal') {
        // The cogsTotal contribution from a non-subcategory account
        // (e.g. a generic "Cost of Sales" mapping) — record it once.
        const breakdown = pickBreakdownKey(target.targetField, column);
        if (breakdown) {
          (cogsBreakdown as Record<string, number>)[breakdown.key] =
            ((cogsBreakdown as Record<string, number>)[breakdown.key] || 0) + Math.abs(adjusted);
        }
        continue;
      }
      if (COGS_SUBCATEGORY_COLUMNS.has(column)) {
        if (cogsSubcategorySeen.has(`${accountId}|${column}`)) continue;
        cogsSubcategorySeen.add(`${accountId}|${column}`);
        const breakdown = pickBreakdownKey(target.targetField, column);
        if (breakdown) {
          (cogsBreakdown as Record<string, number>)[breakdown.key] =
            ((cogsBreakdown as Record<string, number>)[breakdown.key] || 0) + Math.abs(adjusted);
        }
        continue;
      }
      if (column === 'expense') {
        // Skip — the subcategory column iteration below will record the
        // breakdown entry. The `expense` column is the rollup; recording
        // here would double-count against the subcategory entry.
        continue;
      }
      if (OPEX_SUBCATEGORY_COLUMNS.has(column)) {
        const breakdown = pickBreakdownKey(target.targetField, column);
        if (breakdown) {
          (expenseBreakdown as Record<string, number>)[breakdown.key] =
            ((expenseBreakdown as Record<string, number>)[breakdown.key] || 0) + Math.abs(adjusted);
        }
        continue;
      }
      if (column === 'revenue') {
        const breakdown = pickBreakdownKey(target.targetField, column);
        if (breakdown) {
          (revenueBreakdown as Record<string, number>)[breakdown.key] =
            ((revenueBreakdown as Record<string, number>)[breakdown.key] || 0) + Math.abs(adjusted);
        }
        continue;
      }
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
