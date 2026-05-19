// @ts-nocheck
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import type { AccountingPlatform } from '@prisma/client';
import type { InforOperationalAsyncRun } from '@/lib/infor-m3/async-run-state';
import { processPendingInforRawTransforms, transformInforM3RawRun } from '@/lib/infor-m3/operational-sync';
import {
  isInforSyncInProcessWorkerEnabled,
  runOperationalSyncRequest,
} from '@/lib/infor-m3/operational-sync-handler';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';
import { orchestrateQuickBooksOnlineOperationalSync } from '@/lib/quickbooks-online/operational-orchestrator';
import { syncErpDailyFinancialsFromGL } from '@/lib/financial/sync-erp-daily-financials';

const LEASE_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 6;
const MAX_LEASE_ROUNDS_PER_TICK = 12;
const TICK_TIME_BUDGET_MS = 55_000;
const DEFAULT_DAILY_OVERLAP_PROGRAM_BATCH_SIZE = 2;
const DEFAULT_BACKFILL_PROGRAM_BATCH_SIZE = 4;
const DEFAULT_TICK_CONCURRENCY = 2;
const DEFAULT_MAX_TASKS_PER_TICK = 12;
const MAX_TASKS_PER_TICK_LIMIT = 50;
const DEFAULT_MAX_INFLIGHT_PER_SCOPE = 2;
const MAX_RETAINED_TICK_RESULTS = 25;
const DEFAULT_RUN_STALE_MINUTES = 30;
const DEFAULT_RUN_MAX_AGE_HOURS = 8;
const DEFAULT_TASK_FETCH_TIMEOUT_MS = 240_000;
const DEFAULT_TASK_EXECUTION_TIMEOUT_MS = 270_000;
const PENDING_TRANSFORM_REPLAY_MODE = 'pending_transform_replay';

type QueueRunRecord = {
  id: string;
  companyId: string;
  platform: string;
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
  return prisma;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function normalizeWorkerBaseUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function describeTaskPayload(payload: Record<string, unknown>): string {
  const mode = String(payload.mode || '').trim() || 'unknown';
  const businessDateIso = String(payload.businessDateIso || '').trim() || 'n/a';
  const programOffset = Math.max(0, Math.floor(Number(payload.programOffset || 0)));
  const programEndOffset = Number.isFinite(Number(payload.programEndOffset))
    ? Math.max(programOffset, Math.floor(Number(payload.programEndOffset || 0)))
    : null;
  const requestOffset = Math.max(0, Math.floor(Number(payload.requestOffset || 0)));
  return `mode=${mode} businessDate=${businessDateIso} programOffset=${programOffset}` +
    `${programEndOffset !== null ? `..${programEndOffset}` : ''} requestOffset=${requestOffset}`;
}

function compactTaskResponse(value: Record<string, unknown>): Record<string, unknown> {
  const errors = Array.isArray(value.errors)
    ? value.errors.map((entry) => String(entry || '').slice(0, 500)).slice(0, 10)
    : undefined;
  return {
    ok: value.ok === true,
    hasMore: value.hasMore === true,
    cursor: value.cursor || null,
    recordsCreated: Number(value.recordsCreated || 0),
    errors,
    error: typeof value.error === 'string' ? value.error.slice(0, 1200) : undefined,
    details: typeof value.details === 'string' ? value.details.slice(0, 1200) : undefined,
    warningOnly: value.warningOnly === true,
    credentialSource: typeof value.credentialSource === 'string' ? value.credentialSource : undefined,
    noForwardProgressCount: value.noForwardProgressCount,
    glMaxBefore: value.glMaxBefore,
    glMaxAfter: value.glMaxAfter,
  };
}

function responseSnippetFromData(value: Record<string, unknown>, status: number): string {
  const compact = compactTaskResponse(value);
  return `HTTP ${status}: ${JSON.stringify(compact)}`.replace(/\s+/g, ' ').trim().slice(0, 280);
}

async function getGlRawMaxBusinessDate(companyId: string): Promise<Date | null> {
  const rows = await db().$queryRaw<Array<{ maxDate: Date | null }>>`
    SELECT MAX("businessDate") AS "maxDate"
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND UPPER(COALESCE("miProgram", '')) IN ('GLACCTPERIODBALANCES', 'SLGLTRANS')
  `;
  const value = rows?.[0]?.maxDate || null;
  return value ? new Date(value) : null;
}

function atUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildUsFederalHolidaySet(fromDate: Date, toDate: Date): Set<string> {
  const fromYear = fromDate.getUTCFullYear();
  const toYear = toDate.getUTCFullYear();
  const keys = new Set<string>();

  const key = (d: Date): string => d.toISOString().slice(0, 10);
  const add = (d: Date) => keys.add(key(d));

  const nthWeekdayOfMonthUtc = (year: number, monthZeroBased: number, weekday: number, n: number): Date => {
    const first = new Date(Date.UTC(year, monthZeroBased, 1));
    const dayOffset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, monthZeroBased, 1 + dayOffset + (n - 1) * 7));
  };

  const lastWeekdayOfMonthUtc = (year: number, monthZeroBased: number, weekday: number): Date => {
    const lastDay = new Date(Date.UTC(year, monthZeroBased + 1, 0));
    const dayOffset = (lastDay.getUTCDay() - weekday + 7) % 7;
    return new Date(Date.UTC(year, monthZeroBased, lastDay.getUTCDate() - dayOffset));
  };

  const observed = (year: number, monthZeroBased: number, dayOfMonth: number): Date => {
    const actual = new Date(Date.UTC(year, monthZeroBased, dayOfMonth));
    const dow = actual.getUTCDay();
    if (dow === 0) return new Date(Date.UTC(year, monthZeroBased, dayOfMonth + 1));
    if (dow === 6) return new Date(Date.UTC(year, monthZeroBased, dayOfMonth - 1));
    return actual;
  };

  for (let year = fromYear - 1; year <= toYear + 1; year += 1) {
    add(observed(year, 0, 1));
    add(nthWeekdayOfMonthUtc(year, 0, 1, 3));
    add(nthWeekdayOfMonthUtc(year, 1, 1, 3));
    add(lastWeekdayOfMonthUtc(year, 4, 1));
    add(observed(year, 5, 19));
    add(observed(year, 6, 4));
    add(nthWeekdayOfMonthUtc(year, 8, 1, 1));
    add(nthWeekdayOfMonthUtc(year, 9, 1, 2));
    add(observed(year, 10, 11));
    add(nthWeekdayOfMonthUtc(year, 10, 4, 4));
    add(observed(year, 11, 25));
  }

  return keys;
}

function enumerateBusinessDates(startDate: Date, endDate: Date): Date[] {
  const start = atUtcMidnight(startDate);
  const end = atUtcMidnight(endDate);
  if (end < start) return [];
  const federalHolidays = buildUsFederalHolidaySet(start, end);
  const dates: Date[] = [];
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const k = cursor.toISOString().slice(0, 10);
    if (federalHolidays.has(k)) continue;
    dates.push(new Date(cursor));
  }
  return dates;
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
  return Math.min(64, Math.max(1, Math.floor(raw)));
}

function resolveMaxTasksPerTick(): number {
  const raw = Number(process.env.INFOR_SYNC_MAX_TASKS_PER_TICK || DEFAULT_MAX_TASKS_PER_TICK);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_TASKS_PER_TICK;
  return Math.min(MAX_TASKS_PER_TICK_LIMIT, Math.max(1, Math.floor(raw)));
}

function resolveMaxInflightPerScope(): number {
  const raw = Number(process.env.INFOR_SYNC_MAX_INFLIGHT_PER_SCOPE || DEFAULT_MAX_INFLIGHT_PER_SCOPE);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_INFLIGHT_PER_SCOPE;
  return Math.min(12, Math.max(1, Math.floor(raw)));
}

function resolveRunStaleMinutes(): number {
  const raw = Number(process.env.INFOR_SYNC_RUN_STALE_MINUTES || DEFAULT_RUN_STALE_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RUN_STALE_MINUTES;
  return Math.min(240, Math.max(5, Math.floor(raw)));
}

function resolveRunMaxAgeHours(): number {
  const raw = Number(process.env.INFOR_SYNC_RUN_MAX_AGE_HOURS || DEFAULT_RUN_MAX_AGE_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RUN_MAX_AGE_HOURS;
  return Math.min(72, Math.max(1, Math.floor(raw)));
}

function resolveTaskFetchTimeoutMs(): number {
  const raw = Number(process.env.INFOR_SYNC_TASK_FETCH_TIMEOUT_MS || DEFAULT_TASK_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TASK_FETCH_TIMEOUT_MS;
  return Math.min(300_000, Math.max(10_000, Math.floor(raw)));
}

function resolveTaskExecutionTimeoutMs(): number {
  const raw = Number(process.env.INFOR_SYNC_TASK_EXECUTION_TIMEOUT_MS || DEFAULT_TASK_EXECUTION_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TASK_EXECUTION_TIMEOUT_MS;
  return Math.min(600_000, Math.max(30_000, Math.floor(raw)));
}

function resolveFanoutDayProgramShardSize(): number {
  const raw = Number(process.env.INFOR_SYNC_FANOUT_DAY_PROGRAM_SHARD_SIZE || 8);
  if (!Number.isFinite(raw) || raw <= 0) return 8;
  return Math.min(12, Math.max(1, Math.floor(raw)));
}

function resolveAdaptiveFanoutDayProgramShardSize(businessDayCount: number): number {
  const configured = resolveFanoutDayProgramShardSize();
  // When the in-process worker is enabled (Render-hosted long-running process),
  // we are no longer bound by Vercel's 300s maxDuration wall-time per task.
  // The historical reason for shrinking shards on long windows was to keep one
  // task within a single Vercel function invocation; that constraint goes away
  // in-process, so we honor the configured shard size directly. This is the
  // primary throughput win of Phase 2 — fewer queue tasks and far less HTTP /
  // cold-start overhead per business day.
  if (isInforSyncInProcessWorkerEnabled()) {
    return configured;
  }
  // Long explicit historical windows can exceed route wall-time when one task
  // pulls too many programs for a day. Split large windows into smaller shards
  // so each leased task can complete within one queue tick.
  if (businessDayCount >= 500) return Math.min(configured, 1);
  if (businessDayCount >= 180) return Math.min(configured, 2);
  if (businessDayCount >= 90) return Math.min(configured, 4);
  return configured;
}

function resolveFanoutProgramHint(): number {
  const raw = Number(process.env.INFOR_SYNC_FANOUT_PROGRAM_HINT || 120);
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  return Math.min(240, Math.max(8, Math.floor(raw)));
}

// Count only programs where `enabled` is not explicitly false. Disabled rows
// are no-ops at the worker layer (operational-sync `parsePrograms` filters them
// out), so including them in the fan-out only inflates the queue with tasks
// that exit early. Treat missing `enabled` as enabled (legacy default).
function countEnabledProgramRows(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let count = 0;
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const enabled = (row as Record<string, unknown>).enabled;
    if (enabled === false) continue;
    count += 1;
  }
  return count;
}

async function resolveFanoutProgramUpperBound(
  companyId: string,
  platform: AccountingPlatform
): Promise<number> {
  const envHint = resolveFanoutProgramHint();
  if (platform !== 'INFOR_M3') return envHint;
  try {
    const connection = await db().accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
      },
    });
    const metadata = asRecord(connection?.connectionMetadata);
    const globalEnabled = countEnabledProgramRows(metadata.accountingPrograms);
    const programsBySystem = asRecord(metadata.accountingProgramsBySystem);
    const bySystemMax = Object.values(programsBySystem).reduce(
      (maxCount, value) => Math.max(maxCount, countEnabledProgramRows(value)),
      0
    );
    const configuredCount = Math.max(globalEnabled, bySystemMax);
    // When metadata has explicit enabled programs, scope fan-out to exactly
    // those — the worker filters disabled rows anyway, so anything beyond the
    // enabled count is pure no-op overhead. Fall back to the env hint only when
    // no enabled programs are configured (worker will use DEFAULT_CSI rows).
    if (configuredCount > 0) return configuredCount;
    return envHint;
  } catch {
    return envHint;
  }
}

function resolveInitialProgramBatchSize(run: QueueRunRecord): number {
  if (String(run.platform) !== 'INFOR_M3') return 1;
  const mode = String(run.mode || '');
  const retryCount = Math.max(0, Number(run.retryCount || 0));
  const adjustment = retryCount >= 4 ? -2 : retryCount >= 2 ? -1 : retryCount === 0 ? 1 : 0;
  if (mode === 'business_day_backfill' || mode === 'backfill') {
    const base = resolveBackfillProgramBatchSize();
    return Math.min(8, Math.max(1, base + adjustment));
  }
  if (mode === 'daily_overlap') {
    const base = resolveDailyOverlapProgramBatchSize();
    return Math.min(6, Math.max(1, base + adjustment));
  }
  return 1;
}

export function isInforSyncQueueEnabled(): boolean {
  const raw = String(process.env.INFOR_SYNC_QUEUE_ENABLED || '')
    .trim()
    .toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  // In local/staging development, default to queue mode so async runs cannot
  // get stuck in metadata-only "running" state without a cron worker.
  return String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production';
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

function errorToMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function joinErrorDetails(errors: unknown, fallback: string): string {
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((entry) => String(entry || '').trim()).filter(Boolean).join(' | ') || fallback;
  }
  return fallback;
}

async function markRunPostProcessingFailure(
  task: QueueTaskRecord & { run: QueueRunRecord },
  stage: string,
  details: string
): Promise<void> {
  const now = new Date();
  const message = `Post-sync ${stage} failed: ${String(details || 'Unknown failure').slice(0, 1000)}`;
  const truncated = message.slice(0, 1200);
  const platform = String(task.run.platform || 'INFOR_M3') as AccountingPlatform;
  const updated = await db().$transaction(async (tx) => {
    const runUpdated = await tx.inforSyncRun.updateMany({
      where: {
        id: task.runId,
        status: { in: ['running', 'done'] },
      },
      data: {
        status: 'failed',
        updatedAt: now,
        finishedAt: now,
        lastError: truncated,
        message: 'Background sync post-processing failed.',
      },
    });
    await tx.inforSyncTask.updateMany({
      where: {
        runId: task.runId,
        status: { in: ['pending', 'leased'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: now,
        updatedAt: now,
        lastError: truncated,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await tx.inforSyncTask.updateMany({
      where: { id: task.id },
      data: {
        lastError: truncated,
        updatedAt: now,
      },
    });
    return Number(runUpdated?.count || 0) > 0;
  });

  if (updated) {
    await notifyQueueRunFailure(
      task.companyId,
      platform,
      `Infor async queue post-processing failed: ${stage}`,
      truncated
    );
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
    deferDailySnapshotHydration: String(run.platform || '') === 'INFOR_M3',
    forceIngestOnly: String(run.platform || '') === 'INFOR_M3',
    runIntent: {
      mode: run.mode || null,
      frequency: run.frequency,
      site: run.site || null,
      salesOnly: run.salesOnly === true,
      startDate: asIso(run.startDate),
      endDate: asIso(run.endDate),
      backfillMonths: run.backfillMonths ?? null,
      lookbackDays: run.lookbackDays ?? null,
      createdAt: asIso(run.createdAt) || null,
    },
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
  const workerBaseUrl = normalizeWorkerBaseUrl(payload.workerBaseUrl);
  if (workerBaseUrl) {
    payload.workerBaseUrl = workerBaseUrl;
  } else {
    delete payload.workerBaseUrl;
  }
  return payload;
}

function isOperationalInforFrequency(run: QueueRunRecord): boolean {
  const f = String(run.frequency || '').toLowerCase();
  return f === 'daily' || f === 'weekly' || f === 'monthly';
}

function resolveTransformFrequency(run: QueueRunRecord): 'daily' | 'weekly' | 'monthly' {
  const f = String(run.frequency || '').toLowerCase();
  if (f === 'weekly') return 'weekly';
  if (f === 'monthly') return 'monthly';
  return 'daily';
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
  if (Number.isFinite(Number(payload.programEndOffset))) {
    cursor.programEndOffset = Math.max(0, Math.floor(Number(payload.programEndOffset)));
  }
  if (payload.businessDayFanout === true) {
    cursor.businessDayFanout = true;
  }
  const businessDateIso = String(payload.businessDateIso || '').trim();
  if (businessDateIso) {
    cursor.businessDateIso = businessDateIso;
  }
  const workerBaseUrl = normalizeWorkerBaseUrl(payload.workerBaseUrl);
  if (workerBaseUrl) {
    cursor.workerBaseUrl = workerBaseUrl;
  }
  return cursor;
}

async function getRunningQueueRun(companyId: string, platform: AccountingPlatform): Promise<QueueRunRecord | null> {
  const staleMs = resolveRunStaleMinutes() * 60 * 1000;
  const maxAgeMs = resolveRunMaxAgeHours() * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const run = (await db().inforSyncRun.findFirst({
      where: {
        companyId,
        platform,
        status: 'running',
      },
      orderBy: { createdAt: 'desc' },
    })) as QueueRunRecord | null;
    if (!run) return null;

    const now = new Date();
    const nowMs = now.getTime();
    const progressAt = run.lastChunkAt || run.updatedAt || run.createdAt;
    const ageMs = nowMs - new Date(run.createdAt).getTime();
    const idleMs = nowMs - new Date(progressAt).getTime();
    const stale = Number.isFinite(idleMs) && idleMs > staleMs;
    const tooOld = Number.isFinite(ageMs) && ageMs > maxAgeMs;
    if (!stale && !tooOld) return run;

    const reason = stale
      ? `Auto-failed stale queue run after ${Math.floor(idleMs / 60000)} minutes without progress.`
      : `Auto-failed queue run after ${Math.floor(ageMs / 3600000)} hours runtime cap.`;
    await db().$transaction([
      db().inforSyncRun.updateMany({
        where: { id: run.id, status: 'running' },
        data: {
          status: 'failed',
          finishedAt: now,
          updatedAt: now,
          lastError: reason,
          message: reason,
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
          lastError: reason,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }),
    ]);
    await notifyQueueRunFailure(
      run.companyId,
      (String(run.platform || 'INFOR_M3') as AccountingPlatform),
      'Infor async queue run auto-failed by start admission guard',
      reason
    );
  }
  return null;
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
  workerBaseUrl?: string;
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
  const isBusinessDayFanout =
    input.platform === 'INFOR_M3' &&
    input.mode === 'business_day_backfill' &&
    typeof input.startDate === 'string' &&
    typeof input.endDate === 'string';

  if (isBusinessDayFanout) {
    const startDate = new Date(String(input.startDate));
    const endDate = new Date(String(input.endDate));
    const businessDates = enumerateBusinessDates(startDate, endDate);
    const shardSize = resolveAdaptiveFanoutDayProgramShardSize(businessDates.length);
    const programHint = await resolveFanoutProgramUpperBound(input.companyId, input.platform);
    if (businessDates.length > 0) {
      const shardRanges: Array<{ start: number; end: number }> = [];
      for (let offset = 0; offset < programHint; offset += shardSize) {
        shardRanges.push({ start: offset, end: Math.min(programHint, offset + shardSize) });
      }
      const rows = businessDates.flatMap((businessDate, index) =>
        shardRanges.map((range) => ({
          runId: id,
          companyId: input.companyId,
          status: 'pending' as const,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          payload: buildTaskPayload(runRecord, {
            businessDayFanout: true,
            businessDateIso: businessDate.toISOString().slice(0, 10),
            businessDateIndex: index,
            programOffset: range.start,
            programEndOffset: range.end,
            programBatchSize: shardSize,
            requestOffset: 0,
            bookmark: null,
            stagnantCursorCount: 0,
            workerBaseUrl: normalizeWorkerBaseUrl(input.workerBaseUrl),
          }),
        }))
      );
      await db().inforSyncTask.createMany({ data: rows });
      if (!running) {
        await db().inforSyncRun.update({
          where: { id },
          data: {
            message: `Queued ${businessDates.length} business-day slices across ${shardRanges.length} program shards.`,
          },
        });
      }
    } else {
      await db().inforSyncTask.create({
        data: {
          runId: id,
          companyId: input.companyId,
          status: 'pending',
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          payload: buildTaskPayload(runRecord, {
            workerBaseUrl: normalizeWorkerBaseUrl(input.workerBaseUrl),
          }),
        },
      });
    }
  } else {
    await db().inforSyncTask.create({
      data: {
        runId: id,
        companyId: input.companyId,
        status: 'pending',
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        payload: buildTaskPayload(runRecord, {
          workerBaseUrl: normalizeWorkerBaseUrl(input.workerBaseUrl),
        }),
      },
    });
  }
  return {
    alreadyRunning: Boolean(running),
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
      run: {
        status: 'running',
        mode: { not: PENDING_TRANSFORM_REPLAY_MODE },
      },
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

async function requeueExpiredLeasedTasks(): Promise<number> {
  const now = new Date();
  const updated = await db().inforSyncTask.updateMany({
    where: {
      status: 'leased',
      leaseExpiresAt: { lt: now },
      run: {
        status: 'running',
        mode: { not: PENDING_TRANSFORM_REPLAY_MODE },
      },
    },
    data: {
      status: 'pending',
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: now,
      updatedAt: now,
      lastError: 'Auto-requeued expired lease.',
    },
  });
  return Number(updated?.count || 0);
}

async function promoteQueuedRunsForIdleCompanies(): Promise<number> {
  const runningRuns = (await db().inforSyncRun.findMany({
    where: {
      status: 'running',
      mode: { not: PENDING_TRANSFORM_REPLAY_MODE },
    },
    select: { companyId: true, platform: true },
  })) as Array<{ companyId: string; platform: string }>;
  const runningByKey = new Set(runningRuns.map((row) => `${String(row.companyId)}:${String(row.platform)}`));

  const queuedRuns = (await db().inforSyncRun.findMany({
    where: {
      status: 'queued',
      mode: { not: PENDING_TRANSFORM_REPLAY_MODE },
    },
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
  const taskWorkerBaseUrl = normalizeWorkerBaseUrl(taskPayload.workerBaseUrl);
  const currentWorkerBaseUrl = normalizeWorkerBaseUrl(baseUrl);
  if (taskWorkerBaseUrl && currentWorkerBaseUrl && taskWorkerBaseUrl !== currentWorkerBaseUrl) {
    const now = new Date();
    await db().inforSyncTask.updateMany({
      where: { id: task.id, status: 'leased' },
      data: {
        status: 'pending',
        updatedAt: now,
        availableAt: new Date(now.getTime() + 5_000),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return {
      runId: task.runId,
      taskId: task.id,
      status: 'deferred',
      details: `Pinned to worker ${taskWorkerBaseUrl}; current worker ${currentWorkerBaseUrl} released task.`,
    };
  }
  const start = Date.now();
  const isBusinessDayFanoutTask = taskPayload.businessDayFanout === true;
  const isGlBackfillGuardEnabled =
    String(task.run.platform || '') === 'INFOR_M3' &&
    String(task.run.mode || '') === 'business_day_backfill' &&
    taskPayload.salesOnly !== true &&
    !isBusinessDayFanoutTask;
  const glMaxBefore = isGlBackfillGuardEnabled ? await getGlRawMaxBusinessDate(task.companyId) : null;
  let data: Record<string, unknown> = {};
  let rawText = '';
  let responseStatus = 200;
  if (String(task.run.platform) === 'INFOR_M3') {
    if (isInforSyncInProcessWorkerEnabled()) {
      // Phase 2 in-process path: bypass HTTP/Vercel entirely and call the same
      // handler the route would have called. Auth is satisfied by the queue's
      // worker secret + the trusted companyId on the task row (the route's
      // requireSiteAdminAuthorizedInforCompany is intentionally skipped here).
      try {
        const result = await runOperationalSyncRequest(taskPayload, task.companyId);
        responseStatus = result.status;
        data = result.body;
        rawText = responseSnippetFromData(data, responseStatus);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'In-process worker failed';
        responseStatus = 500;
        rawText = message;
        data = { ok: false, error: `In-process worker failed: ${message}` };
      }
    } else {
      const url = new URL('/api/infor-m3/operational-sync', baseUrl);
      const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
      const timeoutMs = resolveTaskFetchTimeoutMs();
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-infor-sync-worker-secret': workerSecret,
            ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
          },
          body: JSON.stringify(taskPayload),
          cache: 'no-store',
          signal: controller.signal,
        });
        responseStatus = response.status;
        rawText = await response.text().catch(() => '');
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          data = {};
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Worker fetch failed while processing queue task';
        responseStatus = 504;
        rawText = message;
        data = {
          ok: false,
          error: `Queue worker request failed or timed out after ${timeoutMs}ms: ${message}`,
        };
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
  } else if (String(task.run.platform) === 'QUICKBOOKS') {
    const op = await orchestrateQuickBooksOnlineOperationalSync(task.run.companyId);
    const qbResult =
      op.kind === 'rolling_complete'
        ? {
            success: op.errors.length === 0,
            recordsCreated: op.recordsCreated,
            errors: op.errors,
          }
        : op.kind === 'idle'
          ? {
              success: false,
              recordsCreated: 0,
              errors: ['QuickBooks Online connection not available'],
            }
          : {
              success: true,
              recordsCreated: 0,
              errors: [] as string[],
            };
    data = {
      ok: qbResult.success,
      hasMore: false,
      cursor: null,
      recordsCreated: qbResult.recordsCreated,
      errors: qbResult.errors,
      details: qbResult.errors.join(' | '),
      operationalKind: op.kind,
    };
    responseStatus = qbResult.success ? 200 : 500;
    rawText = responseSnippetFromData(data, responseStatus);
  } else {
    responseStatus = 400;
    data = {
      ok: false,
      error: `Unsupported queue platform: ${String(task.run.platform || 'unknown')}`,
    };
    rawText = responseSnippetFromData(data, responseStatus);
  }
  const now = new Date();
  const durationMs = Date.now() - start;
  const compactResponse = compactTaskResponse(data);
  const textSnippet = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const details =
    Array.isArray(data?.errors) && data.errors.length > 0
      ? data.errors.join(' | ')
      : (data?.details as string) ||
        (data?.error as string) ||
        (textSnippet ? `HTTP ${responseStatus}: ${textSnippet}` : `HTTP ${responseStatus}: Async sync chunk failed`);

  const attemptNo = Math.max(0, Number(task.attemptCount || 0)) + 1;
  let runCompletedInThisTask = false;

  if (responseStatus >= 400 || !data?.ok) {
    const reachedMax = attemptNo >= Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS));
    const backoffMs = Math.min(5 * 60 * 1000, Math.max(10_000, Math.floor(2 ** attemptNo) * 1000));
    const isBusinessDayBackfill = String(task.run.mode || '') === 'business_day_backfill';
    const shouldSkip = reachedMax && isBusinessDayBackfill;
    let processed = false;
    await db().$transaction(async (tx) => {
      const leaseConsumed = await tx.inforSyncTask.updateMany({
        where: { id: task.id, status: 'leased' },
        data: {
          attemptCount: attemptNo,
          updatedAt: now,
        },
      });
      if (Number(leaseConsumed?.count || 0) !== 1) {
        return;
      }
      processed = true;

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
        await tx.inforSyncTask.updateMany({
          where: { id: task.id },
          data: {
            status: 'done',
            finishedAt: now,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            lastResponse: compactResponse,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        const runUpdated = await tx.inforSyncRun.updateMany({
          where: { id: task.runId, status: 'running' },
          data: {
            warningCount: { increment: 1 },
            retryCount: 0,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            message: `Skipped stuck chunk after ${attemptNo} retries; continuing backfill.`,
          },
        });
        if (Number(runUpdated?.count || 0) === 1) {
          await tx.inforSyncTask.create({
            data: {
              runId: task.runId,
              companyId: task.companyId,
              status: 'pending',
              maxAttempts: Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS)),
              payload: nextPayload,
            },
          });
        }
        return;
      }

      if (reachedMax) {
        await tx.inforSyncTask.updateMany({
          where: { id: task.id },
          data: {
            status: 'failed',
            finishedAt: now,
            updatedAt: now,
            lastError: String(details).slice(0, 1200),
            lastResponse: compactResponse,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        await tx.inforSyncRun.updateMany({
          where: { id: task.runId, status: 'running' },
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

      await tx.inforSyncTask.updateMany({
        where: { id: task.id },
        data: {
          status: 'pending',
          availableAt: new Date(Date.now() + backoffMs),
          updatedAt: now,
          lastError: String(details).slice(0, 1200),
          lastResponse: compactResponse,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await tx.inforSyncRun.updateMany({
        where: { id: task.runId, status: 'running' },
        data: {
          retryCount: { increment: 1 },
          updatedAt: now,
          lastError: String(details).slice(0, 1200),
          message: `Chunk failed (retry ${attemptNo}/${Math.max(1, Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS))}).`,
        },
      });
    });
    if (!processed) {
      return { runId: task.runId, taskId: task.id, status: 'aborted', details: 'Task lease was already released.' };
    }
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
  const glMaxAfter = isGlBackfillGuardEnabled ? await getGlRawMaxBusinessDate(task.companyId) : null;
  const advancedGlCoverage = Boolean(
    glMaxAfter &&
      (!glMaxBefore || glMaxAfter.getTime() > glMaxBefore.getTime())
  );
  const previousNoProgressCount = Math.max(0, Math.floor(Number(payload.glNoForwardProgressCount || 0)));
  const nextNoProgressCount = advancedGlCoverage ? 0 : previousNoProgressCount + 1;
  const noProgressThreshold = 40;
  const noForwardProgressDetected = isGlBackfillGuardEnabled && !advancedGlCoverage && nextNoProgressCount >= noProgressThreshold;

  if (noForwardProgressDetected) {
    const now = new Date();
    const details = `No GL forward-date progress after ${nextNoProgressCount} chunks (${describeTaskPayload(taskPayload)}).`;
    await db().$transaction(async (tx) => {
      await tx.inforSyncTask.updateMany({
        where: { id: task.id, status: 'leased' },
        data: {
          status: 'failed',
          attemptCount: attemptNo,
          finishedAt: now,
          updatedAt: now,
          lastError: details,
          lastResponse: {
            ...compactResponse,
            noForwardProgressCount: nextNoProgressCount,
            glMaxBefore: glMaxBefore ? glMaxBefore.toISOString() : null,
            glMaxAfter: glMaxAfter ? glMaxAfter.toISOString() : null,
          },
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await tx.inforSyncRun.updateMany({
        where: { id: task.runId, status: 'running' },
        data: {
          status: 'failed',
          updatedAt: now,
          finishedAt: now,
          lastError: details,
          message: 'Guardrail: halted run due to no GL date-range progress.',
        },
      });
      await tx.inforSyncTaskAttempt.create({
        data: {
          taskId: task.id,
          runId: task.runId,
          companyId: task.companyId,
          attemptNo,
          status: 'failed',
          httpStatus: responseStatus || null,
          errorMessage: details,
          responseSnippet: describeTaskPayload(taskPayload).slice(0, 280),
          recordsCreated,
          warningCount: warnings,
          durationMs,
          finishedAt: now,
        },
      });
    });
    await notifyQueueRunFailure(
      task.companyId,
      (String(task.run.platform || 'INFOR_M3') as AccountingPlatform),
      'Infor async queue run failed guardrail: no GL forward-date progress',
      details
    );
    return { runId: task.runId, taskId: task.id, status: 'failed', details };
  }

  let processed = false;
  await db().$transaction(async (tx) => {
    const leaseConsumed = await tx.inforSyncTask.updateMany({
      where: { id: task.id, status: 'leased' },
      data: {
        status: 'done',
        attemptCount: attemptNo,
        finishedAt: now,
        updatedAt: now,
        lastError: null,
        lastResponse: compactResponse,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (Number(leaseConsumed?.count || 0) !== 1) {
      return;
    }
    processed = true;
    await tx.inforSyncTaskAttempt.create({
      data: {
        taskId: task.id,
        runId: task.runId,
        companyId: task.companyId,
        attemptNo,
        status: 'success',
        httpStatus: responseStatus || null,
        errorMessage: null,
        responseSnippet: describeTaskPayload(taskPayload).slice(0, 280),
        recordsCreated,
        warningCount: warnings,
        durationMs,
        finishedAt: now,
      },
    });

    const runUpdated = await tx.inforSyncRun.updateMany({
      where: { id: task.runId, status: 'running' },
      data: {
        status: 'running',
        chunkCount: { increment: 1 },
        recordsCreated: { increment: recordsCreated },
        warningCount: { increment: warnings },
        retryCount: 0,
        updatedAt: now,
        lastChunkAt: now,
        lastError: null,
        // Completion message is written only by terminal transition when no tasks remain.
        message: null,
      },
    });

    if (Number(runUpdated?.count || 0) === 1 && hasMore && cursor) {
      const nextPayload = buildTaskPayload(task.run, {
        ...cursor,
        glNoForwardProgressCount: nextNoProgressCount,
        glLastObservedMaxBusinessDate: glMaxAfter ? glMaxAfter.toISOString() : (glMaxBefore ? glMaxBefore.toISOString() : null),
        workerBaseUrl: taskWorkerBaseUrl,
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
    }

    if (Number(runUpdated?.count || 0) === 1 && !hasMore) {
      const remaining = await tx.inforSyncTask.count({
        where: {
          runId: task.runId,
          status: { in: ['pending', 'leased'] },
        },
      });
      if (remaining === 0) {
        const completed = await tx.inforSyncRun.updateMany({
          where: { id: task.runId, status: 'running' },
          data: {
            status: 'done',
            finishedAt: now,
            updatedAt: now,
            message: 'Background sync completed.',
          },
        });
        runCompletedInThisTask = Number(completed?.count || 0) === 1;
      }
    }
  });

  if (!processed) {
    return { runId: task.runId, taskId: task.id, status: 'aborted', details: 'Task lease was already released.' };
  }

  const shouldHydrateDeferredSnapshot =
    String(task.run.platform || '') === 'INFOR_M3' &&
    isOperationalInforFrequency(task.run) &&
    taskPayload.forceIngestOnly === true &&
    taskPayload.deferDailySnapshotHydration === true &&
    !hasMore;
  if (shouldHydrateDeferredSnapshot) {
    const businessDateIsoRaw =
      String(taskPayload.businessDateIso || '').trim() ||
      String(taskPayload.endDate || '').trim().slice(0, 10) ||
      '';
    const businessDateIso =
      /^\d{4}-\d{2}-\d{2}$/.test(businessDateIsoRaw) ? businessDateIsoRaw : null;
    if (businessDateIso) {
      try {
        const isBusinessDayFanoutTask = taskPayload.businessDayFanout === true;
        if (isBusinessDayFanoutTask) {
          const dayStatusRows = await db().$queryRaw<Array<{ pendingOrLeased: bigint; failed: bigint }>>`
            SELECT
              COUNT(*) FILTER (WHERE status IN ('pending', 'leased')) AS "pendingOrLeased",
              COUNT(*) FILTER (WHERE status = 'failed') AS failed
            FROM "InforSyncTask"
            WHERE "runId" = ${task.runId}
              AND COALESCE(payload->>'businessDateIso', '') = ${businessDateIso}
          `;
          const row = dayStatusRows?.[0];
          const pendingOrLeased = Number(row?.pendingOrLeased || 0);
          const failed = Number(row?.failed || 0);
          if (pendingOrLeased === 0 && failed === 0) {
            const transformed = await transformInforM3RawRun({
              companyId: task.companyId,
              syncRunId: task.runId,
              frequency: resolveTransformFrequency(task.run),
              businessDateIso,
              maxBusinessDates: 1,
            });
            if (!transformed.success) {
              const details = joinErrorDetails(
                transformed.errors,
                `Transform failed for business date ${businessDateIso}`
              );
              await markRunPostProcessingFailure(task, `snapshot hydration ${businessDateIso}`, details);
              return { runId: task.runId, taskId: task.id, status: 'failed', details };
            }
          }
        } else {
          const runStatusRows = await db().$queryRaw<Array<{ pendingOrLeased: bigint; failed: bigint }>>`
            SELECT
              COUNT(*) FILTER (WHERE status IN ('pending', 'leased')) AS "pendingOrLeased",
              COUNT(*) FILTER (WHERE status = 'failed') AS failed
            FROM "InforSyncTask"
            WHERE "runId" = ${task.runId}
          `;
          const row = runStatusRows?.[0];
          const pendingOrLeased = Number(row?.pendingOrLeased || 0);
          const failed = Number(row?.failed || 0);
          if (pendingOrLeased === 0 && failed === 0) {
            const pending = await processPendingInforRawTransforms({ companyId: task.companyId, maxDaysPerTick: 1 });
            if (pending.failedDays > 0) {
              const details = joinErrorDetails(
                pending.results.flatMap((result) => result.errors),
                `Pending raw transform failed for ${pending.failedDays} day(s)`
              );
              await markRunPostProcessingFailure(task, 'pending snapshot hydration', details);
              return { runId: task.runId, taskId: task.id, status: 'failed', details };
            }
          }
        }
      } catch (error) {
        const details = errorToMessage(error, 'Snapshot hydration failed');
        await markRunPostProcessingFailure(task, `snapshot hydration ${businessDateIso}`, details);
        return { runId: task.runId, taskId: task.id, status: 'failed', details };
      }
    } else {
      // Ingest finished this chunk but no single businessDateIso on the task (e.g. multi-day window).
      // Drain pending transform rows for this company so snapshots still materialize without manual replay.
      try {
        const pending = await processPendingInforRawTransforms({ companyId: task.companyId, maxDaysPerTick: 2 });
        if (pending.failedDays > 0) {
          const details = joinErrorDetails(
            pending.results.flatMap((result) => result.errors),
            `Pending raw transform failed for ${pending.failedDays} day(s)`
          );
          await markRunPostProcessingFailure(task, 'pending snapshot hydration', details);
          return { runId: task.runId, taskId: task.id, status: 'failed', details };
        }
      } catch (error) {
        const details = errorToMessage(error, 'Pending snapshot hydration failed');
        await markRunPostProcessingFailure(task, 'pending snapshot hydration', details);
        return { runId: task.runId, taskId: task.id, status: 'failed', details };
      }
    }
  }

  // Final safety pass: when the run transitions to done, automatically hydrate any
  // remaining incomplete business dates for this run so users never need manual intervention.
  const shouldRunCompletionHydrationPass =
    runCompletedInThisTask &&
    String(task.run.platform || '') === 'INFOR_M3' &&
    isOperationalInforFrequency(task.run) &&
    taskPayload.forceIngestOnly === true &&
    taskPayload.deferDailySnapshotHydration === true;
  if (shouldRunCompletionHydrationPass) {
    try {
      const incompleteRows = await db().$queryRaw<Array<{ businessDate: Date }>>`
        SELECT DISTINCT "businessDate"
        FROM "InforRawCompleteness"
        WHERE "companyId" = ${task.companyId}
          AND "syncRunId" = ${task.runId}
          AND platform = 'INFOR_M3'
          AND "isComplete" = false
        ORDER BY "businessDate" ASC
        LIMIT 31
      `;
      const tf = resolveTransformFrequency(task.run);
      for (const row of incompleteRows) {
        const businessDateIso = new Date(row.businessDate).toISOString().slice(0, 10);
        const transformed = await transformInforM3RawRun({
          companyId: task.companyId,
          syncRunId: task.runId,
          frequency: tf,
          businessDateIso,
          maxBusinessDates: 1,
        });
        if (!transformed.success) {
          const details = joinErrorDetails(
            transformed.errors,
            `Completion hydration failed for business date ${businessDateIso}`
          );
          await markRunPostProcessingFailure(task, `completion hydration ${businessDateIso}`, details);
          return { runId: task.runId, taskId: task.id, status: 'failed', details };
        }
      }
    } catch (error) {
      const details = errorToMessage(error, 'Completion hydration failed');
      await markRunPostProcessingFailure(task, 'completion hydration', details);
      return { runId: task.runId, taskId: task.id, status: 'failed', details };
    }
  }

  // Catch-all: after any completed INFOR_M3 ingest run, process remaining pending transforms for this company.
  if (
    runCompletedInThisTask &&
    String(task.run.platform || '') === 'INFOR_M3' &&
    taskPayload.forceIngestOnly === true &&
    taskPayload.deferDailySnapshotHydration === true
  ) {
    try {
      const pending = await processPendingInforRawTransforms({ companyId: task.companyId, maxDaysPerTick: 3 });
      if (pending.failedDays > 0) {
        const details = joinErrorDetails(
          pending.results.flatMap((result) => result.errors),
          `Catch-all pending raw transform failed for ${pending.failedDays} day(s)`
        );
        await markRunPostProcessingFailure(task, 'catch-all snapshot hydration', details);
        return { runId: task.runId, taskId: task.id, status: 'failed', details };
      }
    } catch (error) {
      const details = errorToMessage(error, 'Catch-all snapshot hydration failed');
      await markRunPostProcessingFailure(task, 'catch-all snapshot hydration', details);
      return { runId: task.runId, taskId: task.id, status: 'failed', details };
    }
  }

  // Phase 2 sync: after any completed INFOR_M3 run, propagate the freshly-built
  // DailyFinancialSnapshot end-of-month rows into MonthlyFinancial.bs* columns
  // and re-derive MonthlyFinancial P&L from GL truth. This is part of sync
  // completion; failures must surface instead of leaving reports stale.
  if (
    runCompletedInThisTask &&
    String(task.run.platform || '') === 'INFOR_M3'
  ) {
    try {
      const finalizer = await syncErpDailyFinancialsFromGL({
        companyId: task.companyId,
        rebuildDailySnapshots: false,
        syncMonthly: true,
      });
      if (!finalizer.ok) {
        const details = JSON.stringify({
          bsSync: finalizer.bsSync || null,
          pnlSync: finalizer.pnlSync || null,
        });
        await markRunPostProcessingFailure(task, 'monthly financial report sync', details);
        return { runId: task.runId, taskId: task.id, status: 'failed', details };
      }
    } catch (error) {
      const details = errorToMessage(error, 'Monthly financial report sync failed');
      await markRunPostProcessingFailure(task, 'monthly financial report sync', details);
      return { runId: task.runId, taskId: task.id, status: 'failed', details };
    }
  }

  return { runId: task.runId, taskId: task.id, status: 'success' };
}

async function markTaskExecutionFailure(
  task: QueueTaskRecord & { run: QueueRunRecord },
  message: string
): Promise<Record<string, unknown>> {
  const now = new Date();
  let processed = false;
  await db().$transaction(async (tx) => {
    const leaseConsumed = await tx.inforSyncTask.updateMany({
      where: { id: task.id, status: 'leased' },
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
    if (Number(leaseConsumed?.count || 0) !== 1) {
      return;
    }
    processed = true;
    await tx.inforSyncRun.updateMany({
      where: { id: task.runId, status: 'running' },
      data: {
        status: 'failed',
        updatedAt: now,
        finishedAt: now,
        lastError: message,
        message: 'Background queue worker failed on task execution.',
      },
    });
  });
  if (!processed) {
    return { runId: task.runId, taskId: task.id, status: 'aborted', details: 'Task lease was already released.' };
  }
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
  let reclaimedExpiredLeases = 0;
  let timedOutRuns = 0;
  const maxTasksPerTick = resolveMaxTasksPerTick();
  const tickConcurrency = Math.min(maxTasksPerTick, resolveTickConcurrency());
  const taskExecutionTimeoutMs = resolveTaskExecutionTimeoutMs();
  let activeTickConcurrency = tickConcurrency;
  let cleanBatchStreak = 0;
  const results: Array<Record<string, unknown>> = [];
  const resultStatusCounts = new Map<string, number>();

  const recordResult = (result: { runId: string; taskId: string; status: string; details?: string }): void => {
    const status = String(result.status || 'unknown');
    resultStatusCounts.set(status, (resultStatusCounts.get(status) || 0) + 1);
    if (results.length < MAX_RETAINED_TICK_RESULTS || status !== 'success') {
      results.push({
        runId: result.runId,
        taskId: result.taskId,
        status,
        details: result.details ? String(result.details).slice(0, 500) : undefined,
      });
    }
    while (results.length > MAX_RETAINED_TICK_RESULTS) results.shift();
  };

  const failTimedOutRuns = async (): Promise<number> => {
    const staleMs = resolveRunStaleMinutes() * 60 * 1000;
    const maxAgeMs = resolveRunMaxAgeHours() * 60 * 60 * 1000;
    const now = new Date();
    const nowMs = now.getTime();
    const running = (await db().inforSyncRun.findMany({
      where: {
        status: 'running',
        mode: { not: PENDING_TRANSFORM_REPLAY_MODE },
      },
      orderBy: { updatedAt: 'asc' },
      take: 200,
      select: {
        id: true,
        companyId: true,
        platform: true,
        mode: true,
        createdAt: true,
        updatedAt: true,
        lastChunkAt: true,
      },
    })) as Array<{
      id: string;
      companyId: string;
      platform: string;
      mode: string | null;
      createdAt: Date;
      updatedAt: Date;
      lastChunkAt: Date | null;
    }>;

    let failed = 0;
    for (const run of running) {
      const createdAtMs = new Date(run.createdAt).getTime();
      const progressAt = run.lastChunkAt || run.updatedAt || run.createdAt;
      const progressAtMs = new Date(progressAt).getTime();
      const ageMs = nowMs - createdAtMs;
      const idleMs = nowMs - progressAtMs;

      const stale = Number.isFinite(idleMs) && idleMs > staleMs;
      const tooOld = Number.isFinite(ageMs) && ageMs > maxAgeMs;
      if (!stale && !tooOld) continue;

      const reason = stale
        ? `Auto-failed stale queue run after ${Math.floor(idleMs / 60000)} minutes without progress.`
        : `Auto-failed queue run after ${Math.floor(ageMs / 3600000)} hours runtime cap.`;

      await db().$transaction([
        db().inforSyncRun.updateMany({
          where: { id: run.id, status: 'running' },
          data: {
            status: 'failed',
            finishedAt: now,
            updatedAt: now,
            lastError: reason,
            message: reason,
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
            lastError: reason,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        }),
      ]);

      failed += 1;
      await notifyQueueRunFailure(
        run.companyId,
        (String(run.platform || 'INFOR_M3') as AccountingPlatform),
        'Infor async queue run auto-failed by timeout guard',
        reason
      );
    }
    return failed;
  };

  while (
    leaseRounds < MAX_LEASE_ROUNDS_PER_TICK &&
    Date.now() - tickStartedAt < TICK_TIME_BUDGET_MS
  ) {
    leaseRounds += 1;
    reclaimedExpiredLeases += await requeueExpiredLeasedTasks();
    if (leaseRounds === 1 || leaseRounds % 3 === 0) {
      timedOutRuns += await failTimedOutRuns();
    }
    promotedRuns += await promoteQueuedRunsForIdleCompanies();
    const leased = await leasePendingTasks(maxTasksPerTick);
    if (leased.length === 0) break;
    leasedTasks += leased.length;
    for (let index = 0; index < leased.length; index += activeTickConcurrency) {
      const batch = leased.slice(index, index + activeTickConcurrency);
      const settled = await Promise.allSettled(
        batch.map((task) => {
          const taskPromise = processTask(requestUrl, task, workerSecret);
          // Avoid unhandled rejection if the timeout wins the race.
          taskPromise.catch(() => undefined);
          return Promise.race([
            taskPromise,
            new Promise<{ runId: string; taskId: string; status: string; details?: string }>((resolve) => {
              setTimeout(() => {
                resolve({
                  runId: task.runId,
                  taskId: task.id,
                  status: 'timeout',
                  details: `Queue task exceeded ${taskExecutionTimeoutMs}ms and was left for lease recovery.`,
                });
              }, taskExecutionTimeoutMs);
            }),
          ]);
        })
      );
      let pressureSignals = 0;
      for (let resultIndex = 0; resultIndex < settled.length; resultIndex += 1) {
        const settledResult = settled[resultIndex];
        const task = batch[resultIndex];
        if (settledResult.status === 'fulfilled') {
          recordResult(settledResult.value);
          if (
            settledResult.value.status === 'retry' ||
            settledResult.value.status === 'failed' ||
            settledResult.value.status === 'timeout'
          ) {
            pressureSignals += 1;
          }
        } else {
          const message =
            settledResult.reason instanceof Error
              ? settledResult.reason.message
              : 'Unknown queue task error';
          recordResult(await markTaskExecutionFailure(task, message));
          pressureSignals += 1;
        }
      }
      if (pressureSignals > 0) {
        cleanBatchStreak = 0;
        activeTickConcurrency = Math.max(1, activeTickConcurrency - 1);
      } else {
        cleanBatchStreak += 1;
        if (cleanBatchStreak >= 2 && activeTickConcurrency < tickConcurrency) {
          activeTickConcurrency += 1;
          cleanBatchStreak = 0;
        }
      }
    }
  }
  return {
    ok: true,
    queueEnabled: true,
    promotedRuns,
    reclaimedExpiredLeases,
    leasedTasks,
    timedOutRuns,
    leaseRounds,
    tickConcurrency,
    maxTasksPerTick,
    activeTickConcurrency,
    elapsedMs: Date.now() - tickStartedAt,
    resultStatusCounts: Object.fromEntries(resultStatusCounts.entries()),
    results,
  };
}
