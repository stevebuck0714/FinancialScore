import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getRunStateFromMetadata,
  withRunStateMetadata,
  type InforOperationalAsyncRun,
} from '@/lib/infor-m3/async-run-state';
import { isInforSyncQueueEnabled, processQueueTick } from '@/lib/infor-m3/sync-queue';
import { processPendingInforRawTransforms } from '@/lib/infor-m3/operational-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_RUNS_PER_TICK = 8;
const MAX_RETRIES_PER_RUN = 6;

function envTrue(name: string): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function resolveRawTransformDaysPerTick(): number {
  const raw = Number(process.env.INFOR_RAW_TRANSFORM_DAYS_PER_TICK || 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(10, Math.max(1, Math.floor(raw)));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function recoverCursorAfterRepeatedChunkFailure(run: InforOperationalAsyncRun): InforOperationalAsyncRun['cursor'] {
  const cursor = asRecord(run.cursor);
  if (Object.keys(cursor).length === 0) {
    // If the run failed before receiving any continuation cursor, seed one that
    // skips the first program slice so the backfill can still progress.
    return {
      mode: run.mode || 'business_day_backfill',
      syncRunId: run.syncRunId,
      salesOnly: run.salesOnly ? true : undefined,
      backfillMonths: typeof run.backfillMonths === 'number' ? Math.max(1, Math.floor(run.backfillMonths)) : 36,
      programOffset: 1,
      programBatchSize: 1,
      requestOffset: 0,
      bookmark: null,
      stagnantCursorCount: 0,
    };
  }
  const programOffset = Math.max(0, Math.floor(Number(cursor.programOffset || 0)));
  const programBatchSize = Math.max(1, Math.floor(Number(cursor.programBatchSize || 1)));
  return {
    ...cursor,
    programOffset: programOffset + programBatchSize,
    requestOffset: 0,
    bookmark: null,
    stagnantCursorCount: 0,
  };
}

function buildChunkPayload(run: InforOperationalAsyncRun): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    companyId: run.companyId,
    frequency: run.frequency,
    programBatchSize: 1,
    syncRunId: run.syncRunId,
  };
  if (run.site) payload.site = run.site;
  if (run.mode) payload.mode = run.mode;
  if (typeof run.backfillMonths === 'number' && Number.isFinite(run.backfillMonths)) {
    payload.backfillMonths = Math.max(1, Math.floor(run.backfillMonths));
  }
  if (typeof run.lookbackDays === 'number' && Number.isFinite(run.lookbackDays)) {
    payload.lookbackDays = Math.max(1, Math.floor(run.lookbackDays));
  }
  if (run.startDate) payload.startDate = run.startDate;
  if (run.endDate) payload.endDate = run.endDate;
  if (run.salesOnly) {
    payload.salesOnly = true;
    payload.scope = 'sales';
  }
  if (run.cursor && typeof run.cursor === 'object') {
    Object.assign(payload, run.cursor);
  }
  return payload;
}

async function processOneRun(
  request: NextRequest,
  connection: { id: string; companyId: string; connectionMetadata: unknown },
  run: InforOperationalAsyncRun,
  workerSecret: string
): Promise<InforOperationalAsyncRun> {
  const payload = buildChunkPayload(run);
  const url = new URL('/api/infor-m3/operational-sync', request.url);
  const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-infor-sync-worker-secret': workerSecret,
      ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const rawText = await response.text().catch(() => '');
  let data: Record<string, unknown> = {};
  try {
    data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  const nowIso = new Date().toISOString();
  if (!response.ok || !data?.ok) {
    const textSnippet = String(rawText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
    const details =
      Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.join(' | ')
        : data?.details ||
          data?.error ||
          (textSnippet ? `HTTP ${response.status}: ${textSnippet}` : `HTTP ${response.status}: Async sync chunk failed`);
    const retries = Math.max(0, Number(run.retryCount || 0)) + 1;
    const failed = retries >= MAX_RETRIES_PER_RUN;
    if (failed && run.mode === 'business_day_backfill') {
      const recoveredCursor = recoverCursorAfterRepeatedChunkFailure(run);
      return {
        ...run,
        status: 'running',
        cursor: recoveredCursor,
        retryCount: 0,
        updatedAt: nowIso,
        lastError: String(details).slice(0, 1200),
        message: `Skipped stuck chunk after ${retries} retries; continuing backfill.`,
      };
    }
    return {
      ...run,
      status: failed ? 'failed' : 'running',
      retryCount: retries,
      updatedAt: nowIso,
      lastError: String(details).slice(0, 1200),
      message: failed
        ? `Failed after ${retries} retries.`
        : `Chunk failed (retry ${retries}/${MAX_RETRIES_PER_RUN}).`,
    };
  }

  const chunkWarnings = Array.isArray(data?.errors) ? data.errors.length : 0;
  const nextRun: InforOperationalAsyncRun = {
    ...run,
    syncRunId: String(data?.syncRunId || run.syncRunId),
    status: data?.hasMore ? 'running' : 'done',
    cursor:
      data?.hasMore && data?.cursor && typeof data.cursor === 'object'
        ? (data.cursor as Record<string, unknown>)
        : null,
    chunkCount: Math.max(0, Number(run.chunkCount || 0)) + 1,
    recordsCreated: Math.max(0, Number(run.recordsCreated || 0)) + Math.max(0, Number(data?.recordsCreated || 0)),
    warningCount: Math.max(0, Number(run.warningCount || 0)) + chunkWarnings,
    retryCount: 0,
    updatedAt: nowIso,
    lastChunkAt: nowIso,
    lastError: null,
    message: data?.hasMore ? null : 'Background sync completed.',
  };
  return nextRun;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workerSecret = cronSecret || 'dev-worker';
    if (isInforSyncQueueEnabled()) {
      const queued = await processQueueTick(request.url, workerSecret);
      const autoRunRawTransform =
        envTrue('INFOR_RAW_TRANSFORM_AUTORUN_ENABLED') ||
        (envTrue('INFOR_RAW_INGEST_ENABLED') && envTrue('INFOR_RAW_INGEST_ONLY'));
      if (!autoRunRawTransform) {
        return NextResponse.json(queued);
      }
      const rawTransforms = await processPendingInforRawTransforms({
        maxDaysPerTick: resolveRawTransformDaysPerTick(),
      });
      return NextResponse.json({
        ...queued,
        rawTransforms,
      });
    }

    const connections = await prisma.accountingConnection.findMany({
      where: { platform: 'INFOR_M3' },
      select: { id: true, companyId: true, connectionMetadata: true },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });

    const running = connections
      .map((connection) => ({ connection, run: getRunStateFromMetadata(connection.connectionMetadata) }))
      .filter((entry) => entry.run && entry.run.status === 'running')
      .slice(0, MAX_RUNS_PER_TICK) as Array<{
      connection: { id: string; companyId: string; connectionMetadata: unknown };
      run: InforOperationalAsyncRun;
    }>;

    const results: Array<Record<string, unknown>> = [];
    for (const entry of running) {
      try {
        const updatedRun = await processOneRun(request, entry.connection, entry.run, workerSecret);
        await prisma.accountingConnection.update({
          where: { id: entry.connection.id },
          data: {
            connectionMetadata: withRunStateMetadata(entry.connection.connectionMetadata, updatedRun),
            lastSyncAt:
              updatedRun.status === 'done' || updatedRun.status === 'failed' || updatedRun.status === 'cancelled'
                ? new Date()
                : undefined,
            errorMessage: updatedRun.status === 'failed' ? updatedRun.lastError || 'Operational sync failed' : undefined,
          },
        });
        results.push({
          companyId: entry.connection.companyId,
          syncRunId: updatedRun.syncRunId,
          status: updatedRun.status,
          chunkCount: updatedRun.chunkCount,
          recordsCreated: updatedRun.recordsCreated,
          warningCount: updatedRun.warningCount,
          lastError: updatedRun.lastError || null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown chunk error';
        const failedRun: InforOperationalAsyncRun = {
          ...entry.run,
          status: 'failed',
          retryCount: MAX_RETRIES_PER_RUN,
          updatedAt: new Date().toISOString(),
          lastError: message,
          message: 'Background worker failed to process this run.',
        };
        await prisma.accountingConnection.update({
          where: { id: entry.connection.id },
          data: {
            connectionMetadata: withRunStateMetadata(entry.connection.connectionMetadata, failedRun),
            errorMessage: message,
          },
        });
        results.push({
          companyId: entry.connection.companyId,
          syncRunId: entry.run.syncRunId,
          status: 'failed',
          error: message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      scannedConnections: connections.length,
      runningProcessed: running.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to process Infor async sync runs',
        details: message,
      },
      { status: 500 }
    );
  }
}

