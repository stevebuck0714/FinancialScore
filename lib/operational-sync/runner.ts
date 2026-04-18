import prisma from '@/lib/prisma';
import { AdapterFactory } from '@/lib/accounting-adapters';
import { orchestrateQuickBooksOnlineOperationalSync } from '@/lib/quickbooks-online/operational-orchestrator';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';
import { isInforSyncQueueEnabled, startQueueRun } from '@/lib/infor-m3/sync-queue';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import { syncQuickBooksDesktopOperationalPayload, type QbDesktopOperationalPayload } from '@/lib/quickbooks-desktop/operational-sync';
import type { AccountingConnection, AccountingPlatform } from '@prisma/client';

export type SyncFrequency = 'daily' | 'weekly' | 'monthly';

export type OperationalSyncResult = {
  success: boolean;
  recordsCreated: number;
  moduleCounts?: {
    cash: number;
    arAging: number;
    apAging: number;
    customers: number;
    products: number;
    inventory: number;
  };
  errors: string[];
};

type InforSyncWindow = {
  startDate: Date;
  endDate: Date;
  mode: 'manual';
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown, fallback = 'Connection test failed'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 1 ? normalized : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function defaultAutoSyncWindowDays(frequency: SyncFrequency): number {
  if (frequency === 'weekly') return 7;
  if (frequency === 'monthly') return 31;
  return 1;
}

function readConfiguredAutoSyncWindowDays(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const source = asRecord(metadata);
  return parsePositiveInt(source.operationalAutoSyncWindowDays);
}

function buildBoundedAutoSyncWindow(
  frequency: SyncFrequency,
  metadata: unknown
): InforSyncWindow {
  // Nightly automation should use a deterministic bounded window, not an unbounded pull.
  // Allow per-company override to support wider overlap (ex: 3-day or 7-day pulls).
  // Use the prior fully-complete UTC day as the end bound.
  const priorDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endDate = endOfUtcDay(priorDay);
  const startDate = startOfUtcDay(endDate);
  const configuredDays = readConfiguredAutoSyncWindowDays(metadata);
  const windowDays = configuredDays ?? defaultAutoSyncWindowDays(frequency);
  const inclusiveBackstep = Math.max(0, windowDays - 1);
  if (inclusiveBackstep > 0) {
    startDate.setUTCDate(startDate.getUTCDate() - inclusiveBackstep);
  }

  return { startDate, endDate, mode: 'manual' };
}

function readInforSiteFromMetadata(metadata: unknown): string | undefined {
  // Mirror the resolution used by app/api/operational-data/route.ts (md['site'] ?? md['inforSite'] ?? md['defaultSite']).
  // INFOR_CSI tenants store their default site on the AccountingConnection.connectionMetadata so that
  // background workers (which have no UI input) can scope IDO calls correctly.
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const md = metadata as Record<string, unknown>;
  const raw = md['site'] ?? md['inforSite'] ?? md['defaultSite'];
  const value = String(raw ?? '').trim();
  return value.length > 0 ? value : undefined;
}

function normalizeFrequency(value: unknown): SyncFrequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function normalizeErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

async function pruneCompanyOperationalData(companyId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);

  await Promise.all([
    prisma.cashSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aRAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aPAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.customerSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.productSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.inventorySnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
  ]);
}

function notImplementedResult(platform: AccountingPlatform): OperationalSyncResult {
  const message = `${platform} operational sync is not implemented yet for live API pulls.`;
  return { success: false, recordsCreated: 0, errors: [message] };
}

export async function runOperationalSyncForConnection(
  connection: Pick<AccountingConnection, 'id' | 'companyId' | 'platform' | 'accessToken' | 'connectionMetadata'>,
  frequencyInput: unknown
): Promise<OperationalSyncResult> {
  const frequency = normalizeFrequency(frequencyInput);

  if (connection.platform === 'INFOR_M3') {
    const syncWindow = buildBoundedAutoSyncWindow(frequency, connection.connectionMetadata);
    const inforSite = readInforSiteFromMetadata(connection.connectionMetadata);
    const company = await prisma.company.findUnique({
      where: { id: connection.companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);

    // INFOR_CSI requires an explicit `site` on every operational-sync chunk. Without one
    // every queued chunk 400s with "CSI operational sync requires site." and the run
    // chews through retries with chunkCount=0 / records=0. Refuse to enqueue here so the
    // failure is surfaced as a single actionable sync alert instead of a stuck run.
    if (inforSystem === 'INFOR_CSI' && !inforSite) {
      const message =
        'INFOR_CSI auto-sync requires a configured site on the connection metadata (set `site`, `inforSite`, or `defaultSite`). Skipping enqueue.';
      return {
        success: false,
        recordsCreated: 0,
        errors: [message],
      };
    }

    // Preferred path: enqueue a business_day_backfill so the rolling auto-sync window
    // fans out one snapshot per business day (with snapshotDateOverride applied per
    // day inside the worker). The old inline path used mode='manual' over a multi-day
    // window which (a) only writes a single snapshot for "today" regardless of the
    // window, and (b) can drop data if the cursor drain doesn't complete within the
    // 300s cron budget. The queue worker (process-infor-sync-runs cron) handles
    // chunking and retries reliably.
    if (isInforSyncQueueEnabled()) {
      try {
        const startedRun = await startQueueRun({
          companyId: connection.companyId,
          platform: 'INFOR_M3',
          frequency,
          site: inforSite,
          mode: 'business_day_backfill',
          startDate: syncWindow.startDate.toISOString(),
          endDate: syncWindow.endDate.toISOString(),
        });
        await pruneCompanyOperationalData(connection.companyId);
        return {
          success: true,
          recordsCreated: 0, // queued; record counts are aggregated by the queue worker
          errors: startedRun.alreadyRunning
            ? ['Infor auto-sync queued behind an already-running backfill; will start when the prior run completes.']
            : [],
        };
      } catch (queueError) {
        // Fall through to legacy inline path if the queue handoff itself failed,
        // so we still attempt today's data.
        console.error(
          '[operational-sync] Failed to enqueue Infor auto-sync; falling back to inline single-shot.',
          queueError
        );
      }
    }

    // Legacy inline single-shot fallback (queue disabled or enqueue threw).
    const aggregatedErrors: string[] = [];
    let aggregatedRecordsCreated = 0;
    const maxContinuationBatches = 250;
    let continuationBatches = 0;

    let result = await syncInforM3OperationalData(connection.companyId, frequency, inforSite, syncWindow);
    aggregatedRecordsCreated += result.recordsCreated;
    aggregatedErrors.push(...normalizeErrors(result.errors));

    while (result.hasMore && result.continuation) {
      continuationBatches += 1;
      if (continuationBatches > maxContinuationBatches) {
        aggregatedErrors.push(
          `Infor operational sync exceeded ${maxContinuationBatches} continuation batches; stopping early to avoid runaway processing.`
        );
        break;
      }

      result = await syncInforM3OperationalData(connection.companyId, frequency, inforSite, syncWindow, {
        programOffset: result.continuation.programOffset,
        requestOffset: result.continuation.requestOffset,
        bookmark: result.continuation.bookmark,
      });
      aggregatedRecordsCreated += result.recordsCreated;
      aggregatedErrors.push(...normalizeErrors(result.errors));
    }

    if (result.hasMore) {
      aggregatedErrors.push('Infor operational sync ended before cursor drain completed (hasMore remained true).');
    }

    await pruneCompanyOperationalData(connection.companyId);
    return {
      success: aggregatedErrors.length === 0 && !result.hasMore,
      recordsCreated: aggregatedRecordsCreated,
      moduleCounts: result.moduleCounts,
      errors: Array.from(new Set(aggregatedErrors)),
    };
  }

  if (connection.platform === 'QUICKBOOKS') {
    if (!connection.accessToken) {
      const metadata =
        asRecord(connection.connectionMetadata);
      const payload =
        metadata.quickbooksDesktopOperationalPayload && typeof metadata.quickbooksDesktopOperationalPayload === 'object'
          ? (metadata.quickbooksDesktopOperationalPayload as QbDesktopOperationalPayload)
          : null;
      if (!payload) {
        return {
          success: false,
          recordsCreated: 0,
          errors: [
            'No token-based QuickBooks connection or QB Desktop operational payload is available yet.',
          ],
        };
      }
      return syncQuickBooksDesktopOperationalPayload(connection.companyId, frequency, payload);
    }
    const op = await orchestrateQuickBooksOnlineOperationalSync(connection.companyId);
    if (op.kind === 'rolling_complete') {
      await pruneCompanyOperationalData(connection.companyId);
      return {
        success: op.errors.length === 0,
        recordsCreated: op.recordsCreated,
        errors: normalizeErrors(op.errors),
        moduleCounts: op.moduleCounts,
      };
    }
    if (op.kind === 'backfill_started' || op.kind === 'backfill_in_progress') {
      return {
        success: true,
        recordsCreated: 0,
        errors: [],
      };
    }
    return {
      success: false,
      recordsCreated: 0,
      errors: ['QuickBooks Online connection is not available for operational sync.'],
    };
  }

  // Dynamics 365, Acumatica, Odoo, and Sage Intacct currently have no live
  // API-pull implementation. Their old "push payload" routes were removed when
  // we migrated these systems onto the plugin framework. They fall through to
  // notImplementedResult below so the caller gets a clear, truthful message.

  return notImplementedResult(connection.platform);
}

export async function runOperationalSyncForCompany(
  companyId: string,
  platform: AccountingPlatform,
  frequencyInput: unknown
): Promise<OperationalSyncResult> {
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform,
      },
    },
    select: {
      id: true,
      companyId: true,
      platform: true,
      accessToken: true,
      connectionMetadata: true,
    },
  });

  if (!connection) {
    return {
      success: false,
      recordsCreated: 0,
      errors: [`No ${platform} connection found for this company.`],
    };
  }

  return runOperationalSyncForConnection(connection, frequencyInput);
}
