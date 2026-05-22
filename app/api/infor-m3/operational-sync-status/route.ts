import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';
import { requireSiteAdmin } from '@/lib/tenant-security';
import { getRunStateFromMetadata, withRunStateMetadata } from '@/lib/infor-m3/async-run-state';
import { getQueueRunById, isInforSyncQueueEnabled, mapQueueRunToLegacy, processQueueTick } from '@/lib/infor-m3/sync-queue';

export const dynamic = 'force-dynamic';

type StatusRow = {
  status: string | null;
  recordsImported: number | null;
  errorCount: number | null;
  createdAt: Date;
};

type DiagnosticRow = {
  createdAt: Date;
  status: string | null;
  module: string | null;
  miProgram: string | null;
  transaction: string | null;
  errorMessage: string | null;
  responseMessage: string | null;
  syncWindowStart: string | null;
  syncWindowEnd: string | null;
  targetSnapshotDate: string | null;
  staleSourcesJson: string | null;
  sourceDatesJson: string | null;
};

type QueueTaskPreview = {
  id: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  updatedAt: Date;
  payload: unknown;
};

type QueueRunSignals = {
  staleThresholdMinutes: number;
  secondsSinceLastChunk: number | null;
  secondsSinceLastTaskAttempt: number | null;
  watchdogState: 'healthy' | 'at_risk' | 'stale';
  queueTaskCounts: {
    pending: number;
    leased: number;
    done: number;
    failed: number;
    cancelled: number;
  };
};

type RunTimelineEntry = {
  id: string;
  status: string;
  chunkCount: number;
  recordsCreated: number;
  warningCount: number;
  retryCount: number;
  lastChunkAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  secondsSinceProgress: number | null;
  isStalled: boolean;
  isActive: boolean;
};

const DEFAULT_RUN_STALE_MINUTES = 30;
const DEFAULT_RUN_MAX_AGE_HOURS = 8;

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

async function buildRunTimeline(companyId: string, nowMs: number): Promise<RunTimelineEntry[]> {
  const staleThresholdSeconds = resolveRunStaleMinutes() * 60;
  const rows = await prisma.inforSyncRun.findMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      status: true,
      chunkCount: true,
      recordsCreated: true,
      warningCount: true,
      retryCount: true,
      lastChunkAt: true,
      updatedAt: true,
      finishedAt: true,
      createdAt: true,
    },
  });
  return rows.map((row) => {
    const status = String(row.status || '').trim().toLowerCase();
    const isActive = status === 'running' || status === 'queued';
    const progressAt = row.lastChunkAt || row.updatedAt || row.createdAt;
    const progressMs = progressAt ? new Date(progressAt).getTime() : NaN;
    const secondsSinceProgress = Number.isFinite(progressMs) ? Math.max(0, Math.floor((nowMs - progressMs) / 1000)) : null;
    const isStalled = isActive && Number.isFinite(Number(secondsSinceProgress)) && Number(secondsSinceProgress) >= staleThresholdSeconds;
    return {
      id: row.id,
      status: String(row.status || '').trim() || 'unknown',
      chunkCount: Math.max(0, Number(row.chunkCount || 0)),
      recordsCreated: Math.max(0, Number(row.recordsCreated || 0)),
      warningCount: Math.max(0, Number(row.warningCount || 0)),
      retryCount: Math.max(0, Number(row.retryCount || 0)),
      lastChunkAt: row.lastChunkAt ? new Date(row.lastChunkAt).toISOString() : null,
      updatedAt: new Date(row.updatedAt).toISOString(),
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      secondsSinceProgress,
      isStalled,
      isActive,
    };
  });
}

async function buildRunDiagnostics(companyId: string, syncRunId: string) {
  const rows = await prisma.$queryRaw<DiagnosticRow[]>`
    SELECT
      "createdAt",
      status,
      COALESCE("errorDetails"->>'module', '') AS module,
      COALESCE("errorDetails"->>'miProgram', '') AS "miProgram",
      COALESCE("errorDetails"->>'transaction', '') AS transaction,
      COALESCE("errorDetails"->>'error', '') AS "errorMessage",
      COALESCE("errorDetails"->>'responseMessage', '') AS "responseMessage",
      COALESCE("errorDetails"->'syncWindow'->>'startDate', '') AS "syncWindowStart",
      COALESCE("errorDetails"->'syncWindow'->>'endDate', '') AS "syncWindowEnd",
      COALESCE("errorDetails"->>'targetSnapshotDate', '') AS "targetSnapshotDate",
      COALESCE("errorDetails"->>'staleSources', '') AS "staleSourcesJson",
      COALESCE("errorDetails"->>'sourceDates', '') AS "sourceDatesJson"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND ("errorDetails"->>'syncRunId') = ${syncRunId}
    ORDER BY "createdAt" DESC
    LIMIT 1000
  `;

  const failedRows = rows.filter((row) => String(row.status || '').toLowerCase() === 'error');
  const failedPrograms = Array.from(
    new Set(
      failedRows
        .map((row) => {
          const sourceModule = String(row.module || '').trim();
          const program = String(row.miProgram || '').trim();
          const tx = String(row.transaction || '').trim();
          const descriptor = `${sourceModule}/${program || tx}`.replace(/^\/|\/$/g, '');
          return descriptor || null;
        })
        .filter(Boolean) as string[]
    )
  ).slice(0, 12);

  const windows = new Map<string, { startDate: string; endDate: string; reason: string }>();
  for (const row of failedRows) {
    const startDate = String(row.syncWindowStart || '').trim();
    const endDate = String(row.syncWindowEnd || '').trim();
    if (!startDate || !endDate) continue;
    const reasonSource = String(row.responseMessage || row.errorMessage || 'Failed chunk').trim();
    const reason = reasonSource.slice(0, 180);
    const key = `${startDate}__${endDate}`;
    if (!windows.has(key)) windows.set(key, { startDate, endDate, reason });
  }

  const skippedRows = rows.filter((row) => {
    const text = `${String(row.responseMessage || '')} ${String(row.errorMessage || '')}`.toLowerCase();
    return text.includes('skipped stuck chunk') || text.includes('bookmark did not advance');
  });

  const staleSourceWarnings = rows
    .filter((row) => String(row.module || '').trim().toUpperCase() === 'DAILY_FINANCIAL')
    .map((row) => {
      const message = String(row.responseMessage || row.errorMessage || '').trim();
      const targetSnapshotDate = String(row.targetSnapshotDate || '').trim() || null;
      const staleSources = (() => {
        const raw = String(row.staleSourcesJson || '').trim();
        if (!raw) return [] as string[];
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return [] as string[];
          return parsed
            .map((entry) => String(entry || '').trim())
            .filter((entry) => entry.length > 0)
            .slice(0, 10);
        } catch {
          return [] as string[];
        }
      })();
      const sourceDates = (() => {
        const raw = String(row.sourceDatesJson || '').trim();
        if (!raw) return {} as Record<string, string | null>;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const out: Record<string, string | null> = {};
          for (const [key, value] of Object.entries(parsed || {})) {
            const token = String(value || '').trim();
            out[key] = token || null;
          }
          return out;
        } catch {
          return {} as Record<string, string | null>;
        }
      })();
      return {
        createdAt: new Date(row.createdAt).toISOString(),
        targetSnapshotDate,
        message: message.slice(0, 220),
        staleSources,
        sourceDates,
      };
    })
    .filter((entry) => entry.message.length > 0)
    .slice(0, 6);

  return {
    failedChunks: failedRows.length,
    skippedChunks: skippedRows.length,
    failedPrograms,
    suggestedRerunWindows: Array.from(windows.values()).slice(0, 8),
    staleSourceWarnings,
  };
}

async function buildQueueRunSignals(
  syncRunId: string,
  lastChunkAt: string | null,
  nowMs: number
): Promise<QueueRunSignals> {
  const staleThresholdMinutes = resolveRunStaleMinutes();
  const staleThresholdMs = staleThresholdMinutes * 60 * 1000;
  const chunkAgeMs = lastChunkAt ? Math.max(0, nowMs - new Date(lastChunkAt).getTime()) : Number.POSITIVE_INFINITY;

  const [attemptRows, taskRows] = await Promise.all([
    prisma.$queryRaw<Array<{ lastTaskFinishedAt: Date | null }>>`
      SELECT MAX("finishedAt") AS "lastTaskFinishedAt"
      FROM "InforSyncTaskAttempt"
      WHERE "taskId" IN (
        SELECT id
        FROM "InforSyncTask"
        WHERE "runId" = ${syncRunId}
      )
    `,
    prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
      SELECT status, COUNT(*)::bigint AS cnt
      FROM "InforSyncTask"
      WHERE "runId" = ${syncRunId}
      GROUP BY status
    `,
  ]);

  const lastTaskFinishedAt = attemptRows?.[0]?.lastTaskFinishedAt || null;
  const taskAgeMs = lastTaskFinishedAt ? Math.max(0, nowMs - new Date(lastTaskFinishedAt).getTime()) : Number.POSITIVE_INFINITY;
  const counts = {
    pending: 0,
    leased: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of taskRows || []) {
    const key = String(row.status || '').trim().toLowerCase();
    const count = Number(row.cnt || 0);
    if (key === 'pending') counts.pending = count;
    else if (key === 'leased') counts.leased = count;
    else if (key === 'done') counts.done = count;
    else if (key === 'failed') counts.failed = count;
    else if (key === 'cancelled') counts.cancelled = count;
  }

  const worstAgeMs = Math.min(chunkAgeMs, taskAgeMs);
  const watchdogState =
    !Number.isFinite(worstAgeMs) || worstAgeMs >= staleThresholdMs
      ? 'stale'
      : worstAgeMs >= Math.floor(staleThresholdMs * 0.6)
        ? 'at_risk'
        : 'healthy';

  return {
    staleThresholdMinutes,
    secondsSinceLastChunk: Number.isFinite(chunkAgeMs) ? Math.floor(chunkAgeMs / 1000) : null,
    secondsSinceLastTaskAttempt: Number.isFinite(taskAgeMs) ? Math.floor(taskAgeMs / 1000) : null,
    watchdogState,
    queueTaskCounts: counts,
  };
}

export async function GET(request: NextRequest) {
  try {
    const nowMs = Date.now();
    const ageMs = (value: string | Date | null | undefined): number => {
      if (!value) return Number.POSITIVE_INFINITY;
      return nowMs - new Date(value).getTime();
    };

    const rawIngestOnlyMode =
      String(process.env.INFOR_RAW_INGEST_ENABLED || '').trim().toLowerCase() === 'true' &&
      String(process.env.INFOR_RAW_INGEST_ONLY || '').trim().toLowerCase() === 'true';

    await requireSiteAdmin();
    const companyId = getRequestedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });
    }
    let syncRunId = String(request.nextUrl.searchParams.get('syncRunId') || '').trim();
    if (!syncRunId && isInforSyncQueueEnabled()) {
      const latestActiveRun = await prisma.inforSyncRun.findFirst({
        where: {
          companyId,
          platform: 'INFOR_M3',
          status: { in: ['running', 'queued'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (latestActiveRun?.id) {
        syncRunId = String(latestActiveRun.id).trim();
      }
    }
    if (!syncRunId) {
      const runTimeline = await buildRunTimeline(companyId, nowMs);
      return NextResponse.json({
        ok: true,
        companyId,
        syncRunId: null,
        runNotFound: true,
        chunkCount: 0,
        recordsCreated: 0,
        warningCount: 0,
        lastChunkAt: null,
        lastStatusText: null,
        recentlyActive: false,
        runStatus: null,
        runMessage: null,
        runLastError: null,
        runMode: null,
        diagnostics: {
          failedChunks: 0,
          skippedChunks: 0,
          failedPrograms: [],
          suggestedRerunWindows: [],
          staleSourceWarnings: [],
        },
        queueTaskPreview: [],
        runTimeline,
        rawIngestOnlyMode,
      });
    }

    if (isInforSyncQueueEnabled()) {
      let queueRun = await getQueueRunById(companyId, syncRunId);
      if (queueRun) {
        const queueStatus = String(queueRun.status || '').trim().toLowerCase();
        const shouldAttemptKick = queueStatus === 'running' || queueStatus === 'queued';
        const lastProgressAt = queueRun.lastChunkAt || queueRun.updatedAt;
        const millisSinceProgress = ageMs(lastProgressAt);
        // Opportunistically advance the queue from status polling when progress
        // has gone quiet for a short interval. This also helps queued runs that
        // are blocked behind stale active runs when cron cadence is degraded.
        if (shouldAttemptKick && Number.isFinite(millisSinceProgress) && millisSinceProgress > 15000) {
          const cronSecret = String(process.env.CRON_SECRET || '').trim();
          const workerSecret = cronSecret || 'dev-worker';
          try {
            await processQueueTick(request.url, workerSecret);
            queueRun = await getQueueRunById(companyId, syncRunId);
          } catch {
            // Best-effort queue kick: status endpoint should still return current run info.
          }
        }
      }
      if (queueRun) {
        const runTimeline = await buildRunTimeline(companyId, nowMs);
        const mapped = mapQueueRunToLegacy(queueRun);
        let diagnostics: {
          failedChunks: number;
          skippedChunks: number;
          failedPrograms: string[];
          suggestedRerunWindows: Array<{ startDate: string; endDate: string; reason: string }>;
          staleSourceWarnings: Array<{
            createdAt: string;
            targetSnapshotDate: string | null;
            message: string;
            staleSources: string[];
            sourceDates: Record<string, string | null>;
          }>;
        } = {
          failedChunks: 0,
          skippedChunks: 0,
          failedPrograms: [],
          suggestedRerunWindows: [],
          staleSourceWarnings: [],
        };
        try {
          diagnostics = await buildRunDiagnostics(companyId, syncRunId);
        } catch {
          // Keep queue status visible even when diagnostics query is unavailable.
          diagnostics = {
            failedChunks: 0,
            skippedChunks: 0,
            failedPrograms: [],
            suggestedRerunWindows: [],
            staleSourceWarnings: [],
          };
        }
        let queueTaskPreview: Array<{
          id: string;
          status: string;
          attemptCount: number;
          maxAttempts: number;
          updatedAt: string;
          mode: string | null;
          businessDateIso: string | null;
          programOffset: number | null;
          programEndOffset: number | null;
          requestOffset: number | null;
          salesOnly: boolean;
          noForwardProgressCount: number;
          glLastObservedMaxBusinessDate: string | null;
        }> = [];
        try {
          const queueTasks = await prisma.inforSyncTask.findMany({
            where: {
              runId: syncRunId,
              status: { in: ['pending', 'leased', 'done', 'failed'] },
            },
            select: {
              id: true,
              status: true,
              attemptCount: true,
              maxAttempts: true,
              updatedAt: true,
              payload: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 30,
          }) as unknown as QueueTaskPreview[];
          queueTaskPreview = queueTasks.map((row) => {
            const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
              ? (row.payload as Record<string, unknown>)
              : {};
            return {
              id: row.id,
              status: row.status,
              attemptCount: row.attemptCount,
              maxAttempts: row.maxAttempts,
              updatedAt: new Date(row.updatedAt).toISOString(),
              mode: String(payload.mode || '').trim() || null,
              businessDateIso: String(payload.businessDateIso || '').trim() || null,
              programOffset: Number.isFinite(Number(payload.programOffset)) ? Number(payload.programOffset) : null,
              programEndOffset: Number.isFinite(Number(payload.programEndOffset)) ? Number(payload.programEndOffset) : null,
              requestOffset: Number.isFinite(Number(payload.requestOffset)) ? Number(payload.requestOffset) : null,
              salesOnly: payload.salesOnly === true,
              noForwardProgressCount: Number.isFinite(Number(payload.glNoForwardProgressCount))
                ? Number(payload.glNoForwardProgressCount)
                : 0,
              glLastObservedMaxBusinessDate: String(payload.glLastObservedMaxBusinessDate || '').trim() || null,
            };
          });
        } catch {
          // Do not fail status endpoint when task preview inspection fails.
          queueTaskPreview = [];
        }
        const recentlyActive =
          mapped.status === 'running' &&
          (ageMs(mapped.updatedAt) <= 15 * 60 * 1000 ||
            (mapped.lastChunkAt ? ageMs(mapped.lastChunkAt) <= 3 * 60 * 1000 : false));
        let queueSignals: QueueRunSignals | null = null;
        try {
          queueSignals = await buildQueueRunSignals(syncRunId, mapped.lastChunkAt || null, nowMs);
        } catch {
          queueSignals = null;
        }
        return NextResponse.json({
          ok: true,
          companyId,
          syncRunId,
          chunkCount: mapped.chunkCount,
          recordsCreated: mapped.recordsCreated,
          warningCount: mapped.warningCount,
          lastChunkAt: mapped.lastChunkAt || null,
          lastStatusText: mapped.status,
          recentlyActive,
          runStatus: mapped.status,
          runMessage: mapped.message || null,
          runLastError: mapped.lastError || null,
          runMode: mapped.mode || null,
          diagnostics,
          queueTaskPreview,
          queueSignals,
          runTimeline,
          rawIngestOnlyMode,
        });
      }
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        id: true,
        connectionMetadata: true,
      },
    });
    const activeRun = getRunStateFromMetadata(connection?.connectionMetadata);
    let runMatches = activeRun && activeRun.syncRunId === syncRunId ? activeRun : null;
    if (runMatches?.status === 'running' && connection?.id) {
      const staleMs = resolveRunStaleMinutes() * 60 * 1000;
      const maxAgeMs = resolveRunMaxAgeHours() * 60 * 60 * 1000;
      const createdAtMs = new Date(runMatches.createdAt || runMatches.updatedAt).getTime();
      const progressAt = runMatches.lastChunkAt || runMatches.updatedAt || runMatches.createdAt;
      const progressAtMs = new Date(progressAt).getTime();
      const idleMs = nowMs - progressAtMs;
      const ageMs = nowMs - createdAtMs;
      const stale = Number.isFinite(idleMs) && idleMs > staleMs;
      const tooOld = Number.isFinite(ageMs) && ageMs > maxAgeMs;
      if (stale || tooOld) {
        const reason = stale
          ? `Auto-failed stale sync run after ${Math.floor(idleMs / 60000)} minutes without progress.`
          : `Auto-failed sync run after ${Math.floor(ageMs / 3600000)} hours runtime cap.`;
        const timedOutRun = {
          ...runMatches,
          status: 'failed' as const,
          updatedAt: new Date().toISOString(),
          lastError: reason,
          message: reason,
        };
        await prisma.accountingConnection.update({
          where: { id: connection.id },
          data: {
            connectionMetadata: withRunStateMetadata(connection.connectionMetadata, timedOutRun),
            errorMessage: reason,
            lastSyncAt: new Date(),
          },
        });
        runMatches = timedOutRun;
      }
    }

    const rows = await prisma.$queryRaw<StatusRow[]>`
      SELECT
        status,
        "recordsImported",
        "errorCount",
        "createdAt"
      FROM "ApiSyncLog"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
        AND ("errorDetails"->>'syncRunId') = ${syncRunId}
      ORDER BY "createdAt" DESC
      LIMIT 500
    `;

    const chunkCount = rows.length;
    const recordsCreated = rows.reduce((sum, row) => sum + Number(row.recordsImported || 0), 0);
    const warningCount = rows.reduce((sum, row) => sum + Number(row.errorCount || 0), 0);
    const runNotFound = !runMatches && rows.length === 0;
    const lastRow = rows[0];
    const lastChunkAt =
      runMatches?.lastChunkAt ||
      (lastRow?.createdAt ? new Date(lastRow.createdAt).toISOString() : null);
    const lastStatusText =
      (runMatches?.status ? String(runMatches.status) : null) ||
      (lastRow?.status ? String(lastRow.status) : null);
    const recentlyActive =
      (runMatches?.status === 'running' && ageMs(runMatches.updatedAt) <= 15 * 60 * 1000) ||
      (typeof lastChunkAt === 'string' && ageMs(lastChunkAt) <= 3 * 60 * 1000);
    const diagnostics = await buildRunDiagnostics(companyId, syncRunId);
    const runTimeline = await buildRunTimeline(companyId, nowMs);

    return NextResponse.json({
      ok: true,
      companyId,
      syncRunId,
      runNotFound,
      chunkCount,
      recordsCreated,
      warningCount,
      lastChunkAt,
      lastStatusText,
      recentlyActive,
      runStatus: runMatches?.status || null,
      runMessage: runMatches?.message || null,
      runLastError: runMatches?.lastError || null,
      runMode: runMatches?.mode || null,
      diagnostics,
      runTimeline,
      queueSignals: null,
      rawIngestOnlyMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to read Infor M3 sync status',
        details: message,
      },
      { status }
    );
  }
}
