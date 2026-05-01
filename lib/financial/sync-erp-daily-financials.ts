import { rebuildDailyFinancialSnapshotsFromGL } from '@/lib/financial/daily-bs-from-gl';
import { syncMonthlyFinancialBsFromDailySnapshot } from '@/lib/financials/sync-monthly-bs-from-daily';
import { syncMonthlyFinancialPnlFromDailySnapshot } from '@/lib/financials/sync-monthly-pnl-from-daily';

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
    };
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
