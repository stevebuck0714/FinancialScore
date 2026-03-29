import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import type { AccountingPlatform } from '@prisma/client';
import type { InforOperationalAsyncRun } from '@/lib/infor-m3/async-run-state';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';
import { runOperationalSyncForCompany } from '@/lib/operational-sync/runner';

const MAX_TASKS_PER_TICK = 10;
const LEASE_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 6;
const MAX_LEASE_ROUNDS_PER_TICK = 12;
const TICK_TIME_BUDGET_MS = 55_000;
const DEFAULT_DAILY_OVERLAP_PROGRAM_BATCH_SIZE = 2;
const DEFAULT_BACKFILL_PROGRAM_BATCH_SIZE = 4;
const DEFAULT_TICK_CONCURRENCY = 4;
const DEFAULT_MAX_INFLIGHT_PER_SCOPE = 4;

type QueueRunRecord = {
  id: string;
  companyId: string;
  status: string;
  frequency: string;
  site: string | null;
  mode: string | null;
  backfillMonths: number | null;
  lookbackDays: number | null;
  startDate: Date | null;
  endDate: Date | null;
  salesOnly: boolean;
  chunkCount: number;
  recordsCreated: number;
  warningCount: number;
  retryCount: number;
  message: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastChunkAt: Date | null;
};

type QueueTaskRecord = {
  id: string;
  runId: string;
  companyId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  payload: unknown;
};

function db() {
  return prisma as any;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function resolveBackfillProgramBatchSize(): number {
  const raw = Number(process.env.INFOR_SYNC_BACKFILL_PROGRAM_BATCH_SIZE || DEFAULT_BACKFILL_PROGRAM_BATCH_SIZE);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_BACKFILL_PROGRAM_BATCH_SIZE;
  return Math.min(8, Math.max(1, Math.floor(raw)));
}

function resolveDailyOverlapProgramBatchSize(): number {
  const raw = Number(
    process.env.INFOR_SYNC_DAILY_OVERLAP_PROGRAM_BATCH_SIZE || DEFAULT_DAILY_OVERLAP_PROGRAM_BATCH_SIZE
  );
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DAILY_OVERLAP_PROGRAM_BATCH_SIZE;
  return Math.min(6, Math.max(1, Math.floor(raw)));
}

function resolveTickConcurrency(): number {
  const raw = Number(process.env.INFOR_SYNC_TICK_CONCURRENCY || DEFAULT_TICK_CONCURRENCY);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TICK_CONCURRENCY;
  return Math.min(MAX_TASKS_PER_TICK, Math.max(1, Math.floor(raw)));
}

function resolveMaxInflightPerScope(): number {
  const raw = Number(process.env.INFOR_SYNC_MAX_INFLIGHT_PER_SCOPE || DEFAULT_MAX_INFLIGHT_PER_SCOPE);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_INFLIGHT_PER_SCOPE;
  return Math.min(12, Math.max(1, Math.floor(raw)));
}

function resolveInitialProgramBatchSize(run: QueueRunRecord): number {
  if (String(run.platform) !== 'INFOR_M3') return 1;
  const mode = String(run.mode || '');
  if (mode === 'business_day_backfill' || mode === 'backfill') return resolveBackfillProgramBatchSize();
  if (mode === 'daily_overlap') return resolveDailyOverlapProgramBatchSize();
  return 1;
}

export function isInforSyncQueueEnabled(): boolean {
  return String(process.env.INFOR_SYNC_QUEUE_ENABLED || '').trim() === '1';
}

async function notifyQueueRunFailure(
  companyId: string,
  platform: AccountingPlatform,
  errorSummary: string,
  errorDetails?: string
): Promise<void> {
  try {
    await notifyAdminsOfSyncFailure({
      companyId,
      platform,
      syncType: 'infor_async_queue',
      errorSummary,
      errorDetails: String(errorDetails || '').slice(0, 500),
    });
  } catch (error) {
    // Alerts are best-effort and should never block queue execution.
    console.error('❌ Queue sync failure alert dispatch failed:', error);
  }
}

export function mapQueueRunToLegacy(run: QueueRunRecord): InforOperationalAsyncRun {
  return {
    syncRunId: run.id,
    status:
      run.status === 'done' || run.status === 'failed' || run.status === 'cancelled'
        ? (run.status as InforOperationalAsyncRun['status'])
        : 'running',
    companyId: run.companyId,
    frequency: (run.frequency as InforOperationalAsyncRun['frequency']) || 'daily',
    site: run.site || undefined,
    mode: (run.mode as InforOperationalAsyncRun['mode']) || undefined,
    backfillMonths: run.backfillMonths ?? undefined,
    lookbackDays: run.lookbackDays ?? undefined,
    startDate: asIso(run.startDate) || undefined,
    endDate: asIso(run.endDate) || undefined,
    salesOnly: run.salesOnly,
    cursor: null,
    chunkCount: Math.max(0, Number(run.chunkCount || 0)),
    recordsCreated: Math.max(0, Number(run.recordsCreated || 0)),
    warningCount: Math.max(0, Number(run.warningCount || 0)),
    retryCount: Math.max(0, Number(run.retryCount || 0)),
    createdAt: new Date(run.createdAt).toISOString(),
    updatedAt: new Date(run.updatedAt).toISOString(),
    lastChunkAt: asIso(run.lastChunkAt),
    lastError: run.lastError || null,
    message: run.message || null,
  };
}

function buildTaskPayload(run: QueueRunRecord, cursor?: Record<string, unknown> | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    companyId: run.companyId,
    frequency: run.frequency,
    programBatchSize: resolveInitialProgramBatchSize(run),
    syncRunId: run.id,
  };
  if (run.site) payload.site = run.site;
  if (run.mode) payload.mode = run.mode;
  if (typeof run.backfillMonths === 'number' && Number.isFinite(run.backfillMonths)) {
    payload.backfillMonths = Math.max(1, Math.floor(run.backfillMonths));
  }
  if (typeof run.lookbackDays === 'number' && Number.isFinite(run.lookbackDays)) {
    payload.lookbackDays = Math.max(1, Math.floor(run.lookbackDays));
  }
  if (run.startDate) payload.startDate = new Date(run.startDate).toISOString();
  if (run.endDate) payload.endDate = new Date(run.endDate).toISOString();
  if (run.salesOnly) {
    payload.salesOnly = true;
    payload.scope = 'sales';
  }
  if (cursor && typeof cursor === 'object') {
    Object.assign(payload, cursor);
  }
  return payload;
}

function buildSkippedCursorFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const programOffset = Math.max(0, Math.floor(Number(payload.programOffset || 0)));
  const programBatchSize = Math.max(1, Math.floor(Number(payload.programBatchSize || 1)));
  const cursor: Record<string, unknown> = {
    programOffset: programOffset + programBatchSize,
    programBatchSize,
    requestOffset: 0,
    bookmark: null,
    stagnantCursorCount: 0,
  };
  if (Number.isFinite(Number(payload.businessDateIndex))) {
    cursor.businessDateIndex = Math.max(0, Math.floor(Number(payload.businessDateIndex)));
  }
  return cursor;
}

export async function getActiveQueueRun(companyId: string, platform: AccountingPlatform = 'INFOR_M3'): Promise<QueueRunRecord | null> {
  const run = await db().inforSyncRun.findFirst({
    where: {
      companyId,
      platform,
      status: { in: ['queued', 'running'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  return (run as QueueRunRecord | null) || null;
}

async function getRunningQueueRun(companyId: string, platform: AccountingPlatform): Promise<QueueRunRecord | null> {
  const run = await db().inforSyncRun.findFirst({
    where: {
      companyId,
      platform,
      status: 'running',
    },
    orderBy: { createdAt: 'desc' },
  });
  return (run as QueueRunRecord | null) || null;
}

export async function getQueueRunById(companyId: string, runId: string): Promise<QueueRunRecord | null> {
  const run = await db().inforSyncRun.findUnique({
    where: { id: runId },
  });
  if (!run || String(run.companyId) !== companyId) return null;
  return run as QueueRunRecord;
}

export async function startQueueRun(input: {
  companyId: string;
  platform: AccountingPlatform;
  frequency: 'daily' | 'weekly' | 'monthly';
  site?: string;
  mode?: InforOperationalAsyncRun['mode'];
  backfillMonths?: number;
  lookbackDays?: number;
  startDate?: string;
  endDate?: string;
  salesOnly?: boolean;
}): Promise<{ alreadyRunning: boolean; queued: boolean; run: QueueRunRecord }> {
  const running = await getRunningQueueRun(input.companyId, input.platform);
  const initialStatus = running ? 'queued' : 'running';
  const id = randomUUID();
  const run = await db().inforSyncRun.create({
    data: {
      id,
      companyId: input.companyId,
      platform: input.platform,
      status: initialStatus,
      frequency: input.frequency,
      site: input.site || null,
      mode: input.mode || null,
      backfillMonths: input.backfillMonths ?? null,
      lookbackDays: input.lookbackDays ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      salesOnly: input.salesOnly === true,
      message: running ? 'Queued behind active run.' : 'Queued for background processing.',
    },
  });
  const runRecord = run as QueueRunRecord;
  await db().inforSyncTask.create({
    data: {
      runId: id,
      companyId: input.companyId,
      status: 'pending',
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payload: buildTaskPayload(runRecord, null),
    },
  });
  return {
    alreadyRunning: false,
    queued: Boolean(running),
    run: runRecord,
  };
}

export async function cancelQueueRun(
  companyId: string,
  platform: AccountingPlatform = 'INFOR_M3',
  syncRunId?: string
): Promise<{ cancelled: boolean; run?: QueueRunRecord | null }> {
  const where = syncRunId
    ? { id: syncRunId, companyId, platform }
    : { companyId, platform, status: { in: ['queued', 'running'] } };
  const run = syncRunId
    ? await db().inforSyncRun.findUnique({ where: { id: syncRunId } })
    : await db().inforSyncRun.findFirst({ where, orderBy: { createdAt: 'desc' } });
  if (!run || String(run.companyId) !== companyId || !['queued', 'running'].includes(String(run.status))) {
    return { cancelled: false, run: null };
  }
  const now = new Date();
  await db().$transaction([
    db().inforSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'cancelled',
        message: 'Cancelled by user.',
        finishedAt: now,
        updatedAt: now,
      },
    }),
    db().inforSyncTask.updateMany({
      where: {
        runId: run.id,
        status: { in: ['pending', 'leased'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: now,
        updatedAt: now,
      },
    }),
  ]);
  const updated = await db().inforSyncRun.findUnique({ where: { id: run.id } });
  return { cancelled: true, run: (updated as QueueRunRecord) || null };
}

function getRunModePriority(mode: string | null): number {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'daily_overlap') return 0;
  if (normalized === 'manual') return 1;
  if (normalized === 'business_day_backfill' || normalized === 'backfill') return 2;
  return 3;
}

function getScopeKey(companyId: string, platform: string): string {
  return `${companyId}:${platform}`;
}

async function leasePendingTasks(limit: number): Promise<Array<QueueTaskRecord & { run: QueueRunRecord }>> {
  const now = new Date();
  const leaseOwner = `cron-${randomUUID().slice(0, 8)}`;
  const maxInflightPerScope = resolveMaxInflightPerScope();
  const activeLeases = (await db().inforSyncTask.findMany({
    where: {
      status: 'leased',
      leaseExpiresAt: { gt: now },
    },
    include: {
      run: {
        select: { companyId: true, platform: true },
      },
    },
    take: 1000,
  })) as Array<{ run: { companyId: string; platform: string } }>;
  const inflightByScope = new Map<string, number>();
  for (const lease of activeLeases) {
    const key = getScopeKey(String(lease.run.companyId), String(lease.run.platform));
    inflightByScope.set(key, (inflightByScope.get(key) || 0) + 1);
  }

  const candidates = (await db().inforSyncTask.findMany({
    where: {
      status: 'pending',
      availableAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      run: { status: 'running' },
    },
    include: { run: true },
    orderBy: { createdAt: 'asc' },
    take: Math.max(limit * 20, 100),
  })) as Array<QueueTaskRecord & { run: QueueRunRecord }>;
  const prioritized = candidates.sort((a, b) => {
    const pa = getRunModePriority(a.run.mode || null);
    const pb = getRunModePriority(b.run.mode || null);
    if (pa !== pb) return pa - pb;
    return new Date(a.run.createdAt).getTime() - new Date(b.run.createdAt).getTime();
  });

  const leased: Array<QueueTaskRecord & { run: QueueRunRecord }> = [];
  for (const candidate of prioritized) {
    if (leased.length >= limit) break;
    const scopeKey = getScopeKey(String(candidate.run.companyId), String(candidate.run.platform));
    if ((inflightByScope.get(scopeKey) || 0) >= maxInflightPerScope) continue;
    const updated = await db().inforSyncTask.updateMany({
      where: {
        id: candidate.id,
        status: 'pending',
      },
      data: {
        status: 'leased',
        leaseOwner,
        leaseExpiresAt: new Date(Date.now() + LEASE_SECONDS * 1000),
      },
    });
    if (Number(updated?.count || 0) === 1) {
      leased.push(candidate);
      inflightByScope.set(scopeKey, (inflightByScope.get(scopeKey) || 0) + 1);
    }
  }
  return leased;
}

async function promoteQueuedRunsForIdleCompanies(): Promise<number> {
  const runningRuns = (await db().inforSyncRun.findMany({
    where: { status: 'running' },
    select: { companyId: true, platform: true },
  })) as Array<{ companyId: string; platform: string }>;
  const runningByKey = new Set(runningRuns.map((row) => `${String(row.companyId)}:${String(row.platform)}`));

  const queuedRuns = (await db().inforSyncRun.findMany({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })) as QueueRunRecord[];

  let promoted = 0;
  for (const queued of queuedRuns) {
    const companyId = String(queued.companyId);
    const platform = String(queued.platform || 'INFOR_M3');
    const key = `${companyId}:${platform}`;
    if (!companyId || runningByKey.has(key)) continue;
    const now = new Date();
    const updated = await db().inforSyncRun.updateMany({
      where: { id: queued.id, status: 'queued' },
      data: {
        status: 'running',
        message: 'Queued for background processing.',
        updatedAt: now,
      },
    });
    if (Number(updated?.count || 0) === 1) {
      promoted += 1;
      runningByKey.add(key);
    }
  }
  return promoted;
}

async function processTask(
  baseUrl: string,
  task: QueueTaskRecord & { run: QueueRunRecord },
  workerSecret: string
): Promise<{ runId: string; taskId: string; status: string; details?: string }> {
  const payload = asRecord(task.payload);
  const taskPayload = {
    ...buildTaskPayload(task.run, null),
    ...payload,
    syncRunId: task.run.id,
    companyId: task.run.companyId,
  };
  const start = Date.now();
  let data: Record<string, unknown> = {};
  let rawText = '';
  let responseStatus = 200;
  if (String(task.run.platform) === 'INFOR_M3') {
    const url = new URL('/api/infor-m3/operational-sync', baseUrl);
    const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-infor-sync-worker-secret': workerSecret,
        ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
      },
      body: JSON.stringify(taskPayload),
      cache: 'no-store',
    });
    responseStatus = response.status;
    rawText = await response.text().catch(() => '');
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
  } else if (String(task.run.platform) === 'QUICKBOOKS') {
    const qbResult = await runOperationalSyncForCompany(task.run.companyId, 'QUICKBOOKS', task.run.frequency);
    data = {
      ok: qbResult.success,
      hasMore: false,
      cursor: null,
      recordsCreated: qbResult.recordsCreated,
      errors: qbResult.errors,
      details: qbResult.errors.join(' | '),
    };
    rawText = JSON.stringify(data);
    responseStatus = qbResult.success ? 200 : 500;
  } else {
    data = {
      ok: false,
      error: `Unsupported queue platform: ${String(task.run.platform || 'unknown')}`,
    };
    rawText = JSON.stringify(data);
    responseStatus = 400;
  }
  const now = new Date();
  const durationMs = Date.now() - start;
  const textSnippet = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const details =
    Array.isArray(data?.errors) && data.errors.length > 0
      ? data.errors.join(' | ')
      : (data?.details as string) ||
        (data?.error as string) ||
        (textSnippet ? `HTTP ${responseStatus}: ${textSnippet}` : `HTTP ${responseStatus}: Async sync chunk failed`);

  const attemptNo = Math.max(0, Number(task.attemptCount || 0)) + 1;

  if (responseStatus >= 400 || !data?.ok) {
    const reachedMax = attemptNo >= Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS));
    const backoffMs = Math.min(5 * 60 * 1000, Math.max(10_000, Math.floor(2 ** attemptNo) * 1000));
    const isBusinessDayBackfill = String(task.run.mode || '') === 'business_day_backfill';
    const shouldSkip = reachedMax && isBusinessDayBackfill;
    await db().$transaction(async (tx: any) => {
      await tx.inforSyncTaskAttempt.create({
        data: {
          taskId: task.id,
          runId: task.runId,
          companyId: task.companyId,
          attemptNo,
          status: shouldSkip ? 'skipped' : reachedMax ? 'failed' : 'retry',
          httpStatus: responseStatus || null,
          errorMessage: String(details).slice(0, 1200),
          responseSnippet: textSnippet || null,
          recordsCreated: 0,
          warningCount: 0,
          durationMs,
          finishedAt: now,
        },
      });

      if (shouldSkip) {
        const nextPayload = buildTaskPayload(task.run, buildSkippedCursorFromPayload(taskPayload));
        await tx.inforSyncTask.update({
          where: { id: task.id },
          data: {
            status: 'done',
            attemptCount: attemptNo,
            finishedAt: now,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            lastResponse: data,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        await tx.inforSyncTask.create({
          data: {
            runId: task.runId,
            companyId: task.companyId,
            status: 'pending',
            maxAttempts: Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS)),
            payload: nextPayload,
          },
        });
        await tx.inforSyncRun.update({
          where: { id: task.runId },
          data: {
            warningCount: { increment: 1 },
            retryCount: 0,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            message: `Skipped stuck chunk after ${attemptNo} retries; continuing backfill.`,
          },
        });
        return;
      }

      if (reachedMax) {
        await tx.inforSyncTask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            attemptCount: attemptNo,
            finishedAt: now,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            lastResponse: data,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        await tx.inforSyncRun.update({
          where: { id: task.runId },
          data: {
            status: 'failed',
            retryCount: { increment: 1 },
            finishedAt: now,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            message: `Failed after ${attemptNo} retries.`,
          },
        });
        return;
      }

      await tx.inforSyncTask.update({
        where: { id: task.id },
        data: {
          status: 'pending',
          attemptCount: attemptNo,
          availableAt: new Date(Date.now() + backoffMs),
          updatedAt: now,
          lastError: String(details).slice(0, 1200),
          lastResponse: data,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await tx.inforSyncRun.update({
        where: { id: task.runId },
        data: {
          retryCount: { increment: 1 },
          updatedAt: now,
          lastError: String(details).slice(0, 1200),
          message: `Chunk failed (retry ${attemptNo}/${Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS))}).`,
        },
      });
    });
    if (reachedMax && !shouldSkip) {
      await notifyQueueRunFailure(
        task.companyId,
        (String(task.run.platform || 'INFOR_M3') as AccountingPlatform),
        'Infor async queue run failed after max retries',
        String(details).slice(0, 500)
      );
    }
    return { runId: task.runId, taskId: task.id, status: shouldSkip ? 'skipped' : reachedMax ? 'failed' : 'retry', details };
  }

  const warnings = Array.isArray(data?.errors) ? data.errors.length : 0;
  const recordsCreated = Math.max(0, Number(data?.recordsCreated || 0));
  const hasMore = data?.hasMore === true;
  const cursor =
    hasMore && data?.cursor && typeof data.cursor === 'object' && !Array.isArray(data.cursor)
      ? (data.cursor as Record<string, unknown>)
      : null;

  await db().$transaction(async (tx: any) => {
    await tx.inforSyncTask.update({
      where: { id: task.id },
      data: {
        status: 'done',
        attemptCount: attemptNo,
        finishedAt: now,
        updatedAt: now,
        lastError: null,
        lastResponse: data,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await tx.inforSyncTaskAttempt.create({
      data: {
        taskId: task.id,
        runId: task.runId,
        companyId: task.companyId,
        attemptNo,
        status: 'success',
        httpStatus: responseStatus || null,
        errorMessage: null,
        responseSnippet: null,
        recordsCreated,
        warningCount: warnings,
        durationMs,
        finishedAt: now,
      },
    });

    if (hasMore && cursor) {
      await tx.inforSyncTask.create({
        data: {
          runId: task.runId,
          companyId: task.companyId,
          status: 'pending',
          maxAttempts: Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS)),
          payload: buildTaskPayload(task.run, cursor),
        },
      });
    }

    await tx.inforSyncRun.update({
      where: { id: task.runId },
      data: {
        status: 'running',
        chunkCount: { increment: 1 },
        recordsCreated: { increment: recordsCreated },
        warningCount: { increment: warnings },
        retryCount: 0,
        updatedAt: now,
        lastChunkAt: now,
        lastError: null,
        message: hasMore ? null : 'Background sync completed.',
      },
    });

    if (!hasMore) {
      const remaining = await tx.inforSyncTask.count({
        where: {
          runId: task.runId,
          status: { in: ['pending', 'leased'] },
        },
      });
      if (remaining === 0) {
        await tx.inforSyncRun.update({
          where: { id: task.runId },
          data: {
            status: 'done',
            finishedAt: now,
            updatedAt: now,
            message: 'Background sync completed.',
          },
        });
      }
    }
  });

  return { runId: task.runId, taskId: task.id, status: 'success' };
}

async function markTaskExecutionFailure(
  task: QueueTaskRecord & { run: QueueRunRecord },
  message: string
): Promise<Record<string, unknown>> {
  const now = new Date();
  await db().$transaction(async (tx: any) => {
    await tx.inforSyncTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        attemptCount: Math.max(0, Number(task.attemptCount || 0)) + 1,
        finishedAt: now,
        updatedAt: now,
        lastError: message,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await tx.inforSyncRun.update({
      where: { id: task.runId },
      data: {
        status: 'failed',
        updatedAt: now,
        finishedAt: now,
        lastError: message,
        message: 'Background queue worker failed on task execution.',
      },
    });
  });
  await notifyQueueRunFailure(
    task.companyId,
    (String(task.run.platform || 'INFOR_M3') as AccountingPlatform),
    'Infor async queue worker task execution failed',
    String(message).slice(0, 500)
  );
  return { runId: task.runId, taskId: task.id, status: 'failed', details: message };
}

export async function processQueueTick(requestUrl: string, workerSecret: string): Promise<Record<string, unknown>> {
  const tickStartedAt = Date.now();
  let promotedRuns = 0;
  let leasedTasks = 0;
  let leaseRounds = 0;
  const tickConcurrency = resolveTickConcurrency();
  const results: Array<Record<string, unknown>> = [];
  while (
    leaseRounds < MAX_LEASE_ROUNDS_PER_TICK &&
    Date.now() - tickStartedAt < TICK_TIME_BUDGET_MS
  ) {
    leaseRounds += 1;
    promotedRuns += await promoteQueuedRunsForIdleCompanies();
    const leased = await leasePendingTasks(MAX_TASKS_PER_TICK);
    if (leased.length === 0) break;
    leasedTasks += leased.length;
    for (let index = 0; index < leased.length; index += tickConcurrency) {
      const batch = leased.slice(index, index + tickConcurrency);
      const settled = await Promise.allSettled(batch.map((task) => processTask(requestUrl, task, workerSecret)));
      for (let resultIndex = 0; resultIndex < settled.length; resultIndex += 1) {
        const settledResult = settled[resultIndex];
        const task = batch[resultIndex];
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
        } else {
          const message =
            settledResult.reason instanceof Error
              ? settledResult.reason.message
              : 'Unknown queue task error';
          results.push(await markTaskExecutionFailure(task, message));
        }
      }
    }
  }
  return {
    ok: true,
    queueEnabled: true,
    promotedRuns,
    leasedTasks,
    leaseRounds,
    tickConcurrency,
    elapsedMs: Date.now() - tickStartedAt,
    results,
  };
}
