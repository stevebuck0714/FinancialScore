import prisma from '@/lib/prisma';
import { AdapterFactory } from '@/lib/accounting-adapters';
import { orchestrateQuickBooksOnlineOperationalSync } from '@/lib/quickbooks-online/operational-orchestrator';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';
import { syncQuickBooksDesktopOperationalPayload, type QbDesktopOperationalPayload } from '@/lib/quickbooks-desktop/operational-sync';
import { syncDynamicsOperationalPayload, type DynamicsOperationalPayload } from '@/lib/dynamics-365/operational-sync';
import { syncAcumaticaOperationalPayload, type AcumaticaOperationalPayload } from '@/lib/acumatica/operational-sync';
import { syncOdooOperationalPayload, type OdooOperationalPayload } from '@/lib/odoo/operational-sync';
import { syncSageIntacctOperationalPayload, type SageIntacctOperationalPayload } from '@/lib/sage-intacct/operational-sync';
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
    const aggregatedErrors: string[] = [];
    let aggregatedRecordsCreated = 0;
    const maxContinuationBatches = 250;
    let continuationBatches = 0;

    const syncWindow = buildBoundedAutoSyncWindow(frequency, connection.connectionMetadata);
    let result = await syncInforM3OperationalData(connection.companyId, frequency, undefined, syncWindow);
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

      result = await syncInforM3OperationalData(connection.companyId, frequency, undefined, syncWindow, {
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

  if (connection.platform === 'DYNAMICS365') {
    const metadata =
      asRecord(connection.connectionMetadata);
    const payload =
      metadata.dynamicsOperationalPayload && typeof metadata.dynamicsOperationalPayload === 'object'
        ? (metadata.dynamicsOperationalPayload as DynamicsOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Dynamics operational payload is available yet.'],
      };
    }
    return syncDynamicsOperationalPayload(connection.companyId, frequency, payload);
  }

  if (connection.platform === 'ACUMATICA') {
    const metadata =
      asRecord(connection.connectionMetadata);
    const payload =
      metadata.acumaticaOperationalPayload && typeof metadata.acumaticaOperationalPayload === 'object'
        ? (metadata.acumaticaOperationalPayload as AcumaticaOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Acumatica operational payload is available yet.'],
      };
    }
    return syncAcumaticaOperationalPayload(connection.companyId, frequency, payload);
  }

  if (connection.platform === 'ODOO') {
    const metadata =
      asRecord(connection.connectionMetadata);
    const payload =
      metadata.odooOperationalPayload && typeof metadata.odooOperationalPayload === 'object'
        ? (metadata.odooOperationalPayload as OdooOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Odoo operational payload is available yet.'],
      };
    }
    return syncOdooOperationalPayload(connection.companyId, frequency, payload);
  }

  if (connection.platform === 'SAGE_INTACCT') {
    const metadata =
      asRecord(connection.connectionMetadata);
    const payload =
      metadata.sageIntacctOperationalPayload && typeof metadata.sageIntacctOperationalPayload === 'object'
        ? (metadata.sageIntacctOperationalPayload as SageIntacctOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Sage Intacct operational payload is available yet.'],
      };
    }
    return syncSageIntacctOperationalPayload(connection.companyId, frequency, payload);
  }

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
