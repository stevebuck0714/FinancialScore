import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { previousEstCalendarDate } from '@/lib/time/eastern';
import {
  getRunStateFromMetadata,
  withRunStateMetadata,
  type InforOperationalAsyncRun,
} from '@/lib/infor-m3/async-run-state';
import { hasPendingFinancialMappingRebuildRuns, isInforSyncQueueEnabled, processQueueTick } from '@/lib/infor-m3/sync-queue';
import { processPendingInforRawTransforms } from '@/lib/infor-m3/operational-sync';
import { warmDailyExecutiveBriefingCache } from '@/lib/pulse/exec-briefing-warmup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_RUNS_PER_TICK = 2;
const MAX_RETRIES_PER_RUN = 6;
const PRODUCTS_PERFORMANCE_LOOKBACK_DAYS = 90;
type WholesaleProductsReportMode = 'margin' | 'raw' | 'vendor';

function envTrue(name: string): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function resolveRawTransformDaysPerTick(): number {
  const raw = Number(process.env.INFOR_RAW_TRANSFORM_DAYS_PER_TICK || 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(50, Math.max(1, Math.floor(raw)));
}

function yesterdayEstIso(): string {
  return previousEstCalendarDate();
}

function productsStartIsoFromEndDate(endDateIso: string): string {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(endDateIso)
    ? new Date(`${endDateIso}T00:00:00.000Z`)
    : new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - PRODUCTS_PERFORMANCE_LOOKBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

async function latestDailyProductsEndIsoUtc(companyId: string): Promise<string> {
  const fallback = yesterdayEstIso();
  const latest = await prisma.productSalesSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  }).catch(() => null);
  const snapshotDate = latest?.snapshotDate instanceof Date
    ? latest.snapshotDate.toISOString().slice(0, 10)
    : '';
  return snapshotDate && snapshotDate <= fallback ? snapshotDate : fallback;
}

async function hasPendingInforTransformsForCompany(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT rc."id"
    FROM "InforRawCompleteness" rc
    INNER JOIN "InforSyncRun" sr
      ON sr.id = rc."syncRunId"
      AND sr.status IN ('done', 'failed', 'cancelled')
    WHERE rc.platform = 'INFOR_M3'
      AND rc."companyId" = ${companyId}
      AND rc."isComplete" = false
      AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function fetchProductsCacheWarmup(params: {
  origin: string;
  cronSecret: string;
  companyId: string;
  startDate: string;
  endDate: string;
  limit: string;
  sectorCategory?: string | null;
  refreshWholesaleProducts?: boolean;
  reportMode?: WholesaleProductsReportMode;
}): Promise<Record<string, unknown>> {
  const url = new URL('/api/operational-data', params.origin);
  url.searchParams.set('companyId', params.companyId);
  url.searchParams.set('type', 'products');
  url.searchParams.set('frequency', 'daily');
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  url.searchParams.set('limit', params.limit);
  url.searchParams.set('cacheWarmup', '1');
  if (params.sectorCategory) url.searchParams.set('sectorCategory', params.sectorCategory);
  if (params.refreshWholesaleProducts) url.searchParams.set('refreshWholesaleProducts', '1');
  if (params.reportMode) url.searchParams.set('reportMode', params.reportMode);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${params.cronSecret}` },
    cache: 'no-store',
  });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: String(payload?.error || payload?.details || response.statusText || 'Products cache warmup failed').slice(0, 500),
    };
  }
  return {
    ok: true,
    status: response.status,
    records: Array.isArray(payload?.records) ? payload.records.length : null,
    wholesaleOrderLines: Array.isArray(payload?.summary?.wholesaleOrderLines) ? payload.summary.wholesaleOrderLines.length : null,
    wholesaleVendorPricingRows: Array.isArray(payload?.summary?.wholesaleVendorPricingRows) ? payload.summary.wholesaleVendorPricingRows.length : null,
    wholesaleReportMode: payload?.summary?.wholesaleReportMode || params.reportMode || null,
  };
}

async function warmProductCachesAfterCompletedSnapshots(params: {
  origin: string;
  cronSecret: string;
  companyId: string;
}): Promise<Record<string, unknown>> {
  const hasPendingTransforms = await hasPendingInforTransformsForCompany(params.companyId);
  if (hasPendingTransforms) {
    return {
      companyId: params.companyId,
      ok: true,
      skipped: true,
      reason: 'pending_transforms_remaining',
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { industrySectorCategory: true },
  });
  const sectorCategory = String(company?.industrySectorCategory || '').trim() || null;
  const endDate = await latestDailyProductsEndIsoUtc(params.companyId);
  const performanceProducts = await fetchProductsCacheWarmup({
    origin: params.origin,
    cronSecret: params.cronSecret,
    companyId: params.companyId,
    startDate: productsStartIsoFromEndDate(endDate),
    endDate,
    limit: 'all',
    sectorCategory,
  });
  const wholesaleReport = sectorCategory === '42'
    ? Object.fromEntries(await Promise.all((['margin', 'raw', 'vendor'] as const).map(async (reportMode) => [
        reportMode,
        await fetchProductsCacheWarmup({
          origin: params.origin,
          cronSecret: params.cronSecret,
          companyId: params.companyId,
          startDate: productsStartIsoFromEndDate(endDate),
          endDate,
          limit: 'all',
          sectorCategory,
          refreshWholesaleProducts: true,
          reportMode,
        }),
      ])))
    : {
        ok: true,
        skipped: true,
        reason: 'not_wholesale_trade',
      };
  const executiveBriefing = await warmDailyExecutiveBriefingCache({
    companyId: params.companyId,
    baseUrl: params.origin,
    source: 'infor-sync-run-snapshot-complete',
  });

  return {
    companyId: params.companyId,
    ok: Boolean(
      performanceProducts?.ok &&
      executiveBriefing?.ok &&
      (
        sectorCategory === '42'
          ? Object.values(wholesaleReport as Record<string, any>).every((result: any) => result?.ok)
          : (wholesaleReport as any)?.ok
      )
    ),
    performanceProducts,
    wholesaleReport,
    executiveBriefing,
  };
}

async function warmProductCachesForTransformResults(params: {
  origin: string;
  cronSecret: string;
  rawTransforms: Awaited<ReturnType<typeof processPendingInforRawTransforms>>;
}): Promise<Array<Record<string, unknown>>> {
  if (!params.cronSecret) return [];
  const companyIds = Array.from(new Set(
    params.rawTransforms.results
      .filter((result) => result.ok)
      .map((result) => String(result.companyId || '').trim())
      .filter(Boolean)
  ));
  const results: Array<Record<string, unknown>> = [];
  for (const companyId of companyIds) {
    try {
      results.push(await warmProductCachesAfterCompletedSnapshots({
        origin: params.origin,
        cronSecret: params.cronSecret,
        companyId,
      }));
    } catch (error) {
      results.push({
        companyId,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown products cache warmup error',
      });
    }
  }
  return results;
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
    forceIngestOnly: true,
    deferDailySnapshotHydration: true,
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
    const shouldDrainQueue = isInforSyncQueueEnabled() || await hasPendingFinancialMappingRebuildRuns();
    if (shouldDrainQueue) {
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
      const productCacheWarmups = await warmProductCachesForTransformResults({
        origin: request.nextUrl.origin,
        cronSecret,
        rawTransforms,
      });
      return NextResponse.json({
        ...queued,
        rawTransforms,
        productCacheWarmups,
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

