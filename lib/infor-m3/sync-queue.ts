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
const DEFAULT_TICK_CONCURRENCY = 5;
const DEFAULT_MAX_INFLIGHT_PER_SCOPE = 5;
const DEFAULT_RUN_STALE_MINUTES = 30;
const DEFAULT_RUN_MAX_AGE_HOURS = 8;

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
  return Math.min(MAX_TASKS_PER_TICK, Math.max(1, Math.floor(raw)));
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

function resolveFanoutDayProgramShardSize(): number {
  const raw = Number(process.env.INFOR_SYNC_FANOUT_DAY_PROGRAM_SHARD_SIZE || 8);
  if (!Number.isFinite(raw) || raw <= 0) return 8;
  return Math.min(12, Math.max(1, Math.floor(raw)));
}

function resolveFanoutProgramHint(): number {
  const raw = Number(process.env.INFOR_SYNC_FANOUT_PROGRAM_HINT || 8);
  if (!Number.isFinite(raw) || raw <= 0) return 8;
  return Math.min(120, Math.max(4, Math.floor(raw)));
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
  return cursor;
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
  const isBusinessDayFanout =
    input.platform === 'INFOR_M3' &&
    input.mode === 'business_day_backfill' &&
    typeof input.startDate === 'string' &&
    typeof input.endDate === 'string';

  if (isBusinessDayFanout) {
    const startDate = new Date(String(input.startDate));
    const endDate = new Date(String(input.endDate));
    const businessDates = enumerateBusinessDates(startDate, endDate);
    const shardSize = resolveFanoutDayProgramShardSize();
    const programHint = resolveFanoutProgramHint();
    if (businessDates.length > 0) {
      const shardRanges: Array<{ start: number; end: number | null }> = [];
      for (let offset = 0; offset < programHint; offset += shardSize) {
        shardRanges.push({ start: offset, end: Math.min(programHint, offset + shardSize) });
      }
      // Tail shard catches any configured program rows beyond the hint.
      shardRanges.push({ start: programHint, end: null });
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
            ...(range.end !== null ? { programEndOffset: range.end } : {}),
            programBatchSize: shardSize,
            requestOffset: 0,
            bookmark: null,
            stagnantCursorCount: 0,
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
          payload: buildTaskPayload(runRecord, null),
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
        payload: buildTaskPayload(runRecord, null),
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
            lastResponse: data,
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
            lastResponse: data,
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
          lastResponse: data,
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
        lastResponse: data,
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
        responseSnippet: null,
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

    if (Number(runUpdated?.count || 0) === 1 && !hasMore) {
      const remaining = await tx.inforSyncTask.count({
        where: {
          runId: task.runId,
          status: { in: ['pending', 'leased'] },
        },
      });
      if (remaining === 0) {
        await tx.inforSyncRun.updateMany({
          where: { id: task.runId, status: 'running' },
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

  if (!processed) {
    return { runId: task.runId, taskId: task.id, status: 'aborted', details: 'Task lease was already released.' };
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
  let timedOutRuns = 0;
  const tickConcurrency = resolveTickConcurrency();
  let activeTickConcurrency = tickConcurrency;
  let cleanBatchStreak = 0;
  const results: Array<Record<string, unknown>> = [];

  const failTimedOutRuns = async (): Promise<number> => {
    const staleMs = resolveRunStaleMinutes() * 60 * 1000;
    const maxAgeMs = resolveRunMaxAgeHours() * 60 * 60 * 1000;
    const now = new Date();
    const nowMs = now.getTime();
    const running = (await db().inforSyncRun.findMany({
      where: { status: 'running' },
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
    if (leaseRounds === 1 || leaseRounds % 3 === 0) {
      timedOutRuns += await failTimedOutRuns();
    }
    promotedRuns += await promoteQueuedRunsForIdleCompanies();
    const leased = await leasePendingTasks(MAX_TASKS_PER_TICK);
    if (leased.length === 0) break;
    leasedTasks += leased.length;
    for (let index = 0; index < leased.length; index += activeTickConcurrency) {
      const batch = leased.slice(index, index + activeTickConcurrency);
      const settled = await Promise.allSettled(batch.map((task) => processTask(requestUrl, task, workerSecret)));
      let pressureSignals = 0;
      for (let resultIndex = 0; resultIndex < settled.length; resultIndex += 1) {
        const settledResult = settled[resultIndex];
        const task = batch[resultIndex];
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
          if (settledResult.value.status === 'retry' || settledResult.value.status === 'failed') {
            pressureSignals += 1;
          }
        } else {
          const message =
            settledResult.reason instanceof Error
              ? settledResult.reason.message
              : 'Unknown queue task error';
          results.push(await markTaskExecutionFailure(task, message));
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
    leasedTasks,
    timedOutRuns,
    leaseRounds,
    tickConcurrency,
    activeTickConcurrency,
    elapsedMs: Date.now() - tickStartedAt,
    results,
  };
}
