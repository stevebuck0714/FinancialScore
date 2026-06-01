import prisma from '@/lib/prisma';
import { BS_LAST_DAY_FIELDS } from '@/lib/financial/month-publish';

/**
 * Syncs MonthlyFinancial balance-sheet columns from DailyFinancialSnapshot
 * end-of-month rows for a single company. Income-statement columns are NOT
 * touched. This keeps the Data Review BS aligned with what Daily Financials
 * (Ops) shows, by construction.
 *
 * Designed to be called automatically at the end of an operational-sync run
 * (after DailyFinancialSnapshot rows have been refreshed). Idempotent: re-running
 * with the same DFS rows produces the same writes.
 *
 * Only updates rows attached to the company's MOST RECENT FinancialRecord, since
 * Data Review reads from that record. Older FRs (historical versions) are left
 * alone.
 *
 * Returns a small summary so callers can log it.
 */

type BsField = (typeof BS_LAST_DAY_FIELDS)[number];

export type SyncMonthlyBsFromDailyOutcome = {
  ok: boolean;
  companyId: string;
  financialRecordId: string | null;
  monthlyRowsConsidered: number;
  dailySnapshotsConsidered: number;
  monthsUpdated: number;
  monthsSkippedNoDfs: number;
  errors: number;
  reason?: string;
};

function monthKeyFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function syncMonthlyFinancialBsFromDailySnapshot(
  companyId: string,
): Promise<SyncMonthlyBsFromDailyOutcome> {
  const outcome: SyncMonthlyBsFromDailyOutcome = {
    ok: true,
    companyId,
    financialRecordId: null,
    monthlyRowsConsidered: 0,
    dailySnapshotsConsidered: 0,
    monthsUpdated: 0,
    monthsSkippedNoDfs: 0,
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

  const firstMonth = new Date(monthlyRows[0].monthDate);
  const lastMonth = new Date(monthlyRows[monthlyRows.length - 1].monthDate);
  const windowStart = new Date(
    Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth(), 1, 0, 0, 0),
  );
  const windowEnd = new Date(
    Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  const dailySnapshots: any[] = await prisma.dailyFinancialSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { snapshotDate: 'asc' },
  });
  outcome.dailySnapshotsConsidered = dailySnapshots.length;

  // Pick the LATEST snapshotDate per month — this is the true EOM business day,
  // since the daily pipeline only writes on business days.
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

  for (const row of monthlyRows) {
    const d = new Date(row.monthDate);
    if (Number.isNaN(d.getTime())) {
      outcome.monthsSkippedNoDfs += 1;
      continue;
    }
    const dfs = dailyEomByMonth.get(monthKeyFromDate(d));
    if (!dfs) {
      outcome.monthsSkippedNoDfs += 1;
      continue;
    }

    const updates: Partial<Record<BsField, number>> = {};
    for (const f of BS_LAST_DAY_FIELDS) {
      updates[f] = Number((dfs as any)[f] || 0);
    }
    try {
      await prisma.monthlyFinancial.update({
        where: { id: row.id },
        data: updates,
      });
      outcome.monthsUpdated += 1;
    } catch {
      outcome.errors += 1;
    }
  }

  if (outcome.errors > 0) outcome.ok = false;
  return outcome;
}
