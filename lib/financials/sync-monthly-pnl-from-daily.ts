import prisma from '@/lib/prisma';
import {
  buildAccountIdToTargetForMonthlySync,
  computeMonthlyPnlBreakdownsFromGL,
} from '@/lib/financial/monthly-pnl-from-gl';

/**
 * Syncs MonthlyFinancial income-statement columns + revenue/cogs/expense
 * breakdown JSON for a single company by re-aggregating GLTransactionFact
 * (joined with AccountMapping) for each month present on the company's most
 * recent FinancialRecord.
 *
 * Companion to `syncMonthlyFinancialBsFromDailySnapshot`:
 *   - That helper updates BS columns from DFS end-of-month rows.
 *   - This helper updates P&L columns + breakdown JSON from GL truth.
 *
 * Together they keep the legacy `MonthlyFinancial` table — which `Data
 * Review`, `Goals`, `LOB Reporting`, `Cash Flow`, `Ratios`, `Projections`,
 * `Aggregated Financials`, and `Trend Analysis` all read through
 * `useMasterData` / `/api/master-data` — fully aligned with the GL truth
 * that powers the Daily Financials and Working Capital tabs.
 *
 * Designed to be called immediately after a DailyFinancialSnapshot rebuild
 * (mapping save, admin corrective rebuild, or scheduled sync). Idempotent.
 *
 * Only updates rows attached to the company's MOST RECENT FinancialRecord,
 * since `/api/master-data` reads from that record. Older FRs are left alone.
 */

const PNL_SCALAR_FIELDS = [
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

export type SyncMonthlyPnlFromDailyOutcome = {
  ok: boolean;
  companyId: string;
  financialRecordId: string | null;
  monthlyRowsConsidered: number;
  monthsUpdated: number;
  monthsSkippedNoMappings: number;
  errors: number;
  reason?: string;
};

function monthBoundsUtc(monthDate: Date): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const monthEnd = new Date(
    Date.UTC(
      monthDate.getUTCFullYear(),
      monthDate.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
  return { monthStart, monthEnd };
}

export async function syncMonthlyFinancialPnlFromDailySnapshot(
  companyId: string,
): Promise<SyncMonthlyPnlFromDailyOutcome> {
  const outcome: SyncMonthlyPnlFromDailyOutcome = {
    ok: true,
    companyId,
    financialRecordId: null,
    monthlyRowsConsidered: 0,
    monthsUpdated: 0,
    monthsSkippedNoMappings: 0,
    errors: 0,
  };

  const financialRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: { monthlyData: { orderBy: { monthDate: 'asc' } } },
  });
  if (!financialRecord) {
    outcome.ok = false;
    outcome.reason = 'no_financial_record';
    return outcome;
  }
  outcome.financialRecordId = financialRecord.id;

  const monthlyRows: any[] = financialRecord.monthlyData as any[];
  outcome.monthlyRowsConsidered = monthlyRows.length;
  if (monthlyRows.length === 0) {
    outcome.reason = 'no_monthly_rows';
    return outcome;
  }

  // Load mappings once — they're company-wide and don't change per month.
  // If the company has no usable mappings, P&L can't be derived from GL;
  // skip without overwriting whatever's already in MonthlyFinancial.
  const accountIdToTarget = await buildAccountIdToTargetForMonthlySync(companyId);
  if (accountIdToTarget.size === 0) {
    outcome.reason = 'no_account_mappings';
    return outcome;
  }

  for (const row of monthlyRows) {
    const monthDate = new Date(row.monthDate);
    if (Number.isNaN(monthDate.getTime())) {
      outcome.monthsSkippedNoMappings += 1;
      continue;
    }
    const { monthStart, monthEnd } = monthBoundsUtc(monthDate);

    try {
      const { scalars, revenueBreakdown, cogsBreakdown, expenseBreakdown } =
        await computeMonthlyPnlBreakdownsFromGL(
          companyId,
          monthStart,
          monthEnd,
          accountIdToTarget,
        );

      // Whitelist the P&L scalars we own — we never touch BS columns from
      // here (those are owned by `syncMonthlyFinancialBsFromDailySnapshot`).
      const updates: Record<string, unknown> = {};
      for (const field of PNL_SCALAR_FIELDS) {
        updates[field] = Number(scalars[field] || 0);
      }
      // Always overwrite breakdown JSON so a removed account / re-classified
      // mapping doesn't leave stale buckets behind.
      updates.revenueBreakdown = revenueBreakdown;
      updates.cogsBreakdown = cogsBreakdown;
      updates.expenseBreakdown = expenseBreakdown;

      await prisma.monthlyFinancial.update({
        where: { id: row.id },
        data: updates,
      });
      outcome.monthsUpdated += 1;
    } catch (err) {
      // Log + continue so one bad month doesn't block the rest.
      console.error(
        `syncMonthlyFinancialPnlFromDailySnapshot: failed for company ${companyId} month ${monthDate.toISOString().slice(0, 7)}`,
        err,
      );
      outcome.errors += 1;
    }
  }

  if (outcome.errors > 0) outcome.ok = false;
  return outcome;
}
