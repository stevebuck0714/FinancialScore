import { rebuildDailyFinancialSnapshotsFromGL } from '@/lib/financial/daily-bs-from-gl';
import { syncMonthlyFinancialBsFromDailySnapshot } from '@/lib/financials/sync-monthly-bs-from-daily';
import { syncMonthlyFinancialPnlFromDailySnapshot } from '@/lib/financials/sync-monthly-pnl-from-daily';
import prisma from '@/lib/prisma';

type Frequency = 'daily' | 'weekly' | 'monthly';

export type SyncErpDailyFinancialsFromGLOptions = {
  companyId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  frequency?: Frequency;
  rebuildDailySnapshots?: boolean;
  syncMonthly?: boolean;
};

export type SyncErpDailyFinancialsFromGLOutcome = {
  ok: boolean;
  companyId: string;
  rebuilt?: {
    datesProcessed: number;
    rowsWritten: number;
    mappedAccountCount: number;
    unmappedTargetFields: string[];
    anchorsApplied: number;
    accountAnchorsApplied: number;
    fieldAnchorsApplied: number;
    accountAnchorDatesApplied: string[];
    fieldAnchorDatesApplied: string[];
    accountAnchorCount: number;
  };
  cashSnapshots?: {
    datesProcessed: number;
    rowsWritten: number;
    mappedAccountCount: number;
  };
  bsSync?: {
    monthsUpdated: number;
    monthsSkippedNoDfs: number;
    errors: number;
  };
  pnlSync?: {
    monthsUpdated: number;
    monthsSkipped: number;
    errors: number;
  };
};

const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const ATLANTIC_TRUSTED_DFS_START = new Date('2026-06-30T00:00:00.000Z');

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDayOrNull(value?: Date | null): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return startOfUtcDay(value);
}

/**
 * Atlantic SLLedgers pulls are period-wide, so a one-day sync can land GL on
 * many days in the month. Rebuild the whole month-to-date (floored at the
 * 2026-06-30 trusted DFS start) so daily income statements stay on GL truth.
 * Returns null when the run's month is entirely before that floor.
 */
export function atlanticMonthToDateDailyRebuildWindow(opts: {
  companyId: string;
  runStartDate?: Date | null;
  runEndDate?: Date | null;
  now?: Date;
}): { startDate: Date; endDate: Date } | null {
  if (String(opts.companyId || '').trim() !== ATLANTIC_PRECISION_COMPANY_ID) return null;
  const now = startOfUtcDay(opts.now || new Date());
  const periodRef = utcDayOrNull(opts.runStartDate) || utcDayOrNull(opts.runEndDate) || now;
  const monthStart = new Date(Date.UTC(periodRef.getUTCFullYear(), periodRef.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(periodRef.getUTCFullYear(), periodRef.getUTCMonth() + 1, 0));
  const startDate =
    monthStart.getTime() >= ATLANTIC_TRUSTED_DFS_START.getTime()
      ? monthStart
      : new Date(ATLANTIC_TRUSTED_DFS_START.getTime());
  const endDate = now.getTime() < monthEnd.getTime() ? now : monthEnd;
  if (endDate.getTime() < startDate.getTime()) return null;
  return { startDate, endDate };
}

async function rebuildCashSnapshotsFromGL(params: {
  companyId: string;
  startDate: Date;
  endDate: Date;
  frequency: Frequency;
}): Promise<{ datesProcessed: number; rowsWritten: number; mappedAccountCount: number }> {
  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId: params.companyId,
      targetField: { in: ['cash', 'otherCA'] },
    },
    select: {
      accountId: true,
      accountCode: true,
      accountName: true,
    },
  });

  const accountIds = new Set<string>();
  const mappingNames = new Map<string, string>();
  for (const mapping of mappings) {
    for (const candidate of [mapping.accountId, mapping.accountCode, mapping.accountName]) {
      const accountId = String(candidate || '').trim();
      if (!accountId) continue;
      accountIds.add(accountId);
      const label = String(mapping.accountName || '').trim();
      if (label && !mappingNames.has(accountId)) mappingNames.set(accountId, label);
    }
  }

  const accountIdList = Array.from(accountIds);
  let datesProcessed = 0;
  let rowsWritten = 0;
  const start = startOfUtcDay(params.startDate);
  const end = startOfUtcDay(params.endDate);

  for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    datesProcessed += 1;
    await prisma.cashSnapshot.deleteMany({
      where: {
        companyId: params.companyId,
        frequency: params.frequency,
        snapshotDate: new Date(cursor),
      },
    });
    if (accountIdList.length === 0) continue;

    const balanceRows = await prisma.$queryRaw<Array<{ accountId: string; balance: number | null }>>`
      SELECT
        "accountId",
        SUM(COALESCE("debitAmount", 0) - COALESCE("creditAmount", 0))::float AS balance
      FROM "GLTransactionFact"
      WHERE "companyId" = ${params.companyId}
        AND "accountId" = ANY(${accountIdList}::text[])
        AND "transDate" <= ${new Date(cursor)}
      GROUP BY "accountId"
    `;
    const nameRows = await prisma.$queryRaw<Array<{ accountId: string; accountName: string | null }>>`
      SELECT DISTINCT ON ("accountId") "accountId", "accountName"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${params.companyId}
        AND "accountId" = ANY(${accountIdList}::text[])
      ORDER BY "accountId", "transDate" DESC
    `;
    const balances = new Map(balanceRows.map((row) => [row.accountId, Number(row.balance || 0)]));
    const glNames = new Map(nameRows.map((row) => [row.accountId, row.accountName || null]));
    const rows = accountIdList.map((accountId) => ({
      companyId: params.companyId,
      snapshotDate: new Date(cursor),
      frequency: params.frequency,
      accountId,
      accountName: mappingNames.get(accountId) || glNames.get(accountId) || accountId,
      accountNumber: accountId,
      cashBalance: balances.get(accountId) || 0,
      changeAmount: null as number | null,
      changePercent: null as number | null,
    }));
    if (rows.length > 0) {
      await prisma.cashSnapshot.createMany({ data: rows });
      rowsWritten += rows.length;
    }
  }

  return {
    datesProcessed,
    rowsWritten,
    mappedAccountCount: accountIdList.length,
  };
}

/**
 * Shared post-GL-sync finalizer for daily ERP ledger connectors.
 *
 * Large ERP connectors should call this after GLTransactionFact and
 * AccountMapping are current. It keeps DailyFinancialSnapshot and the
 * MonthlyFinancial/Data Review surface aligned to the same GL truth.
 */
export async function syncErpDailyFinancialsFromGL(
  opts: SyncErpDailyFinancialsFromGLOptions,
): Promise<SyncErpDailyFinancialsFromGLOutcome> {
  const companyId = String(opts.companyId || '').trim();
  if (!companyId) throw new Error('syncErpDailyFinancialsFromGL: companyId required');

  const shouldRebuildDaily = opts.rebuildDailySnapshots !== false && Boolean(opts.startDate && opts.endDate);
  const shouldSyncMonthly = opts.syncMonthly !== false;
  const outcome: SyncErpDailyFinancialsFromGLOutcome = {
    ok: true,
    companyId,
  };

  if (shouldRebuildDaily) {
    const rebuilt = await rebuildDailyFinancialSnapshotsFromGL({
      companyId,
      startDate: opts.startDate!,
      endDate: opts.endDate!,
      frequency: opts.frequency || 'daily',
      pnlUpdateMode: 'overwrite',
    });
    outcome.rebuilt = {
      datesProcessed: rebuilt.datesProcessed,
      rowsWritten: rebuilt.rowsWritten,
      mappedAccountCount: rebuilt.mappedAccountCount,
      unmappedTargetFields: rebuilt.unmappedTargetFields,
      anchorsApplied: rebuilt.anchorsApplied,
      accountAnchorsApplied: rebuilt.accountAnchorsApplied,
      fieldAnchorsApplied: rebuilt.fieldAnchorsApplied,
      accountAnchorDatesApplied: rebuilt.accountAnchorDatesApplied,
      fieldAnchorDatesApplied: rebuilt.fieldAnchorDatesApplied,
      accountAnchorCount: rebuilt.accountAnchorCount,
    };
    outcome.cashSnapshots = await rebuildCashSnapshotsFromGL({
      companyId,
      startDate: opts.startDate!,
      endDate: opts.endDate!,
      frequency: opts.frequency || 'daily',
    });
  }

  if (shouldSyncMonthly) {
    const bsSync = await syncMonthlyFinancialBsFromDailySnapshot(companyId);
    const pnlSync = await syncMonthlyFinancialPnlFromDailySnapshot(companyId);
    outcome.bsSync = {
      monthsUpdated: bsSync.monthsUpdated,
      monthsSkippedNoDfs: bsSync.monthsSkippedNoDfs,
      errors: bsSync.errors,
    };
    outcome.pnlSync = {
      monthsUpdated: pnlSync.monthsUpdated,
      monthsSkipped: pnlSync.monthsSkippedNoMappings,
      errors: pnlSync.errors,
    };
    outcome.ok = bsSync.ok && pnlSync.ok;
  }

  return outcome;
}
