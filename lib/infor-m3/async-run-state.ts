import type { Prisma } from '@prisma/client';

export type InforOperationalAsyncRunStatus = 'running' | 'done' | 'failed' | 'cancelled';

export type InforOperationalAsyncRun = {
  syncRunId: string;
  status: InforOperationalAsyncRunStatus;
  companyId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  site?: string;
  mode?: 'daily_overlap' | 'backfill' | 'manual' | 'business_day_backfill';
  backfillMonths?: number;
  lookbackDays?: number;
  startDate?: string;
  endDate?: string;
  salesOnly?: boolean;
  cursor?: Record<string, unknown> | null;
  chunkCount: number;
  recordsCreated: number;
  warningCount: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  lastChunkAt?: string | null;
  lastError?: string | null;
  message?: string | null;
};

const META_KEY = 'inforOperationalAsyncRun';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function getRunStateFromMetadata(metadata: unknown): InforOperationalAsyncRun | null {
  const source = asRecord(metadata);
  const candidate = source[META_KEY];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const run = candidate as Record<string, unknown>;
  const syncRunId = String(run.syncRunId || '').trim();
  const companyId = String(run.companyId || '').trim();
  const frequency = String(run.frequency || '').trim() as InforOperationalAsyncRun['frequency'];
  const status = String(run.status || '').trim() as InforOperationalAsyncRunStatus;
  if (!syncRunId || !companyId || !frequency || !status) return null;
  return {
    syncRunId,
    status,
    companyId,
    frequency,
    site: String(run.site || '').trim() || undefined,
    mode: (String(run.mode || '').trim() || undefined) as InforOperationalAsyncRun['mode'],
    backfillMonths: Number.isFinite(Number(run.backfillMonths)) ? Number(run.backfillMonths) : undefined,
    lookbackDays: Number.isFinite(Number(run.lookbackDays)) ? Number(run.lookbackDays) : undefined,
    startDate: String(run.startDate || '').trim() || undefined,
    endDate: String(run.endDate || '').trim() || undefined,
    salesOnly: run.salesOnly === true,
    cursor:
      run.cursor && typeof run.cursor === 'object' && !Array.isArray(run.cursor)
        ? (run.cursor as Record<string, unknown>)
        : null,
    chunkCount: Math.max(0, Number(run.chunkCount || 0)),
    recordsCreated: Math.max(0, Number(run.recordsCreated || 0)),
    warningCount: Math.max(0, Number(run.warningCount || 0)),
    retryCount: Math.max(0, Number(run.retryCount || 0)),
    createdAt: String(run.createdAt || new Date().toISOString()),
    updatedAt: String(run.updatedAt || new Date().toISOString()),
    lastChunkAt: String(run.lastChunkAt || '').trim() || null,
    lastError: String(run.lastError || '').trim() || null,
    message: String(run.message || '').trim() || null,
  };
}

export function withRunStateMetadata(
  metadata: unknown,
  runState: InforOperationalAsyncRun | null
): Prisma.InputJsonValue {
  const source = asRecord(metadata);
  if (!runState) {
    const { [META_KEY]: _removed, ...rest } = source;
    return rest as Prisma.InputJsonValue;
  }
  return {
    ...source,
    [META_KEY]: runState,
  } as Prisma.InputJsonValue;
}

