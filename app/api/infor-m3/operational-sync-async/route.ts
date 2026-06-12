import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import type { AccountingPlatform } from '@prisma/client';
import {
  getRunStateFromMetadata,
  withRunStateMetadata,
  type InforOperationalAsyncRun,
} from '@/lib/infor-m3/async-run-state';
import {
  isInforSyncQueueEnabled,
  startQueueRun,
  cancelQueueRun,
  mapQueueRunToLegacy,
} from '@/lib/infor-m3/sync-queue';
import { isInforSyncInProcessWorkerEnabled } from '@/lib/infor-m3/operational-sync-handler';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

function normalizeFrequency(value: unknown): 'daily' | 'weekly' | 'monthly' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function normalizeMode(value: unknown): InforOperationalAsyncRun['mode'] {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'backfill') return 'backfill';
  if (normalized === 'manual') return 'manual';
  if (normalized === 'business_day_backfill') return 'business_day_backfill';
  if (normalized === 'daily_overlap') return 'daily_overlap';
  return undefined;
}

function normalizeQueuePlatform(value: unknown): AccountingPlatform {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'QUICKBOOKS' || isQuickBooksDesktopFamily(normalized)) return 'QUICKBOOKS';
  return 'INFOR_M3';
}

function normalizePositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function normalizeIsoDate(value: unknown): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function monthsBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  const years = end.getUTCFullYear() - start.getUTCFullYear();
  const months = end.getUTCMonth() - start.getUTCMonth();
  return Math.max(1, years * 12 + months + 1);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const action = String(body.action || 'start').trim().toLowerCase();
    const rawIngestOnlyMode =
      String(process.env.INFOR_RAW_INGEST_ENABLED || '').trim().toLowerCase() === 'true' &&
      String(process.env.INFOR_RAW_INGEST_ONLY || '').trim().toLowerCase() === 'true';
    const allowRawIngestOnly = body.allowRawIngestOnly === true;
    const queuePlatform = normalizeQueuePlatform(body.platform);

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: queuePlatform,
        },
      },
      select: {
        id: true,
        connectionMetadata: true,
      },
    });
    if (!connection) {
      return NextResponse.json({ ok: false, error: `${queuePlatform} connection not found for company.` }, { status: 404 });
    }

    const queueEnabled = isInforSyncQueueEnabled();
    const existingRun = queueEnabled ? null : getRunStateFromMetadata(connection.connectionMetadata);
    if (action === 'cancel') {
      if (queueEnabled) {
        const syncRunId = String(body.syncRunId || '').trim() || undefined;
        const cancelled = await cancelQueueRun(companyId, queuePlatform, syncRunId);
        if (!cancelled.cancelled || !cancelled.run) {
          return NextResponse.json({ ok: true, companyId, cancelled: false, reason: 'No running async sync found.' });
        }
        return NextResponse.json({
          ok: true,
          companyId,
          cancelled: true,
          run: mapQueueRunToLegacy(cancelled.run),
        });
      }
      if (!existingRun || existingRun.status !== 'running') {
        return NextResponse.json({ ok: true, companyId, cancelled: false, reason: 'No running async sync found.' });
      }
      const cancelledRun: InforOperationalAsyncRun = {
        ...existingRun,
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
        message: 'Cancelled by user.',
      };
      await prisma.accountingConnection.update({
        where: { id: connection.id },
        data: {
          connectionMetadata: withRunStateMetadata(connection.connectionMetadata, cancelledRun),
        },
      });
      return NextResponse.json({ ok: true, companyId, cancelled: true, run: cancelledRun });
    }

    if (action === 'reset') {
      const now = new Date();
      let cancelledRuns = 0;
      if (queueEnabled) {
        const activeRuns = await (prisma as any).inforSyncRun.findMany({
          where: {
            companyId,
            platform: queuePlatform,
            status: { in: ['queued', 'running'] },
          },
          select: { id: true },
        });
        const runIds = Array.isArray(activeRuns)
          ? activeRuns
              .map((row: any) => String(row?.id || '').trim())
              .filter((value: string) => value.length > 0)
          : [];
        cancelledRuns = runIds.length;
        if (runIds.length > 0) {
          await (prisma as any).$transaction([
            (prisma as any).inforSyncRun.updateMany({
              where: {
                id: { in: runIds },
                status: { in: ['queued', 'running'] },
              },
              data: {
                status: 'cancelled',
                message: 'Reset by user.',
                finishedAt: now,
                updatedAt: now,
              },
            }),
            (prisma as any).inforSyncTask.updateMany({
              where: {
                runId: { in: runIds },
                status: { in: ['pending', 'leased'] },
              },
              data: {
                status: 'cancelled',
                finishedAt: now,
                updatedAt: now,
              },
            }),
          ]);
        }
      }

      await prisma.accountingConnection.update({
        where: { id: connection.id },
        data: {
          connectionMetadata: withRunStateMetadata(connection.connectionMetadata, null),
        },
      });

      return NextResponse.json({
        ok: true,
        companyId,
        reset: true,
        cancelledRuns,
      });
    }

    if (existingRun && existingRun.status === 'running') {
      return NextResponse.json({
        ok: true,
        companyId,
        alreadyRunning: true,
        run: existingRun,
      });
    }

    const frequency = normalizeFrequency(body.frequency);
    const site = String(body.site || '').trim() || undefined;
    let mode = normalizeMode(body.mode);
    const backfillMonths = normalizePositiveInt(body.backfillMonths);
    const lookbackDays = normalizePositiveInt(body.lookbackDays);
    let startDate = normalizeIsoDate(body.startDate);
    let endDate = normalizeIsoDate(body.endDate);
    const salesOnly = body.salesOnly === true || String(body.scope || '').trim().toLowerCase() === 'sales';

    if (rawIngestOnlyMode && !allowRawIngestOnly) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Sync start blocked: INFOR_RAW_INGEST_ONLY is enabled. Disable raw-ingest-only for ingest+transform runs, or pass allowRawIngestOnly=true to acknowledge ingest-only behavior.',
        },
        { status: 409 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    if (queuePlatform === 'INFOR_M3' && inforSystem === 'INFOR_CSI' && !site) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Site is required for CSI operational sync.',
        },
        { status: 400 }
      );
    }

    // Large CSI backfills can exceed per-request limits if run as broad windows.
    // Force resilient business-day chunking for daily CSI history runs — UNLESS
    // the in-process Render worker is enabled. Phase 2 (in-process) has no 300s
    // Vercel maxDuration cap, so a single-shot 'backfill' over a multi-year
    // window is the fastest path: each enabled IDO is fetched once with full
    // pagination, instead of fanning out per business day and re-fetching the
    // entire (non-date-filtered) IDO every day.
    //
    // Caller can also explicitly bypass the override with allowSingleShotBackfill=true
    // even when in-process is off, e.g. for manual one-off recoveries.
    const hasCustomWindow = Boolean(startDate && endDate);
    let effectiveBackfillMonths = hasCustomWindow
      ? monthsBetweenInclusive(startDate as string, endDate as string)
      : backfillMonths;
    const allowSingleShotBackfill =
      body.allowSingleShotBackfill === true || isInforSyncInProcessWorkerEnabled();
    if (queuePlatform === 'INFOR_M3' && inforSystem === 'INFOR_CSI' && frequency === 'daily') {
      const requestedMode = mode;
      const looksLikeLargeManualWindow =
        requestedMode === 'manual' &&
        Boolean(startDate && endDate) &&
        monthsBetweenInclusive(startDate as string, endDate as string) >= 2;
      const isLargeBackfillMode = requestedMode === 'backfill';
      const isCustomWindowHistory =
        hasCustomWindow && monthsBetweenInclusive(startDate as string, endDate as string) >= 2;
      const isImplicitHistory = !requestedMode && typeof backfillMonths === 'number' && backfillMonths >= 2;
      // When in-process worker is on, an explicit mode='backfill' is honored as
      // single-shot (no per-day fanout). Implicit history (no requested mode)
      // and 'manual' over big windows still get rewritten to business_day_backfill
      // to preserve daily snapshot rollup semantics.
      const shouldForceBusinessDayChunking = allowSingleShotBackfill
        ? looksLikeLargeManualWindow || isImplicitHistory
        : isLargeBackfillMode || looksLikeLargeManualWindow || isImplicitHistory;
      if (shouldForceBusinessDayChunking) {
        mode = 'business_day_backfill';
        if (!effectiveBackfillMonths) {
          effectiveBackfillMonths =
            startDate && endDate
              ? monthsBetweenInclusive(startDate, endDate)
              : 36;
        }
      }
      if (isCustomWindowHistory && !allowSingleShotBackfill) {
        mode = 'business_day_backfill';
      }
      // For an explicit single-shot backfill with no custom window, derive a
      // window from backfillMonths so syncInforM3OperationalData has dates to
      // page over (otherwise it falls through to a 30-day daily_overlap window).
      if (allowSingleShotBackfill && mode === 'backfill' && !hasCustomWindow) {
        const months =
          typeof backfillMonths === 'number' && Number.isFinite(backfillMonths) && backfillMonths > 0
            ? Math.floor(backfillMonths)
            : 36;
        const end = new Date();
        const start = new Date(end);
        start.setMonth(start.getMonth() - months);
        startDate = start.toISOString();
        endDate = end.toISOString();
        effectiveBackfillMonths = months;
      }
    }

    if (mode === 'business_day_backfill' && (!startDate || !endDate)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Historical Daily Backfill requires explicit startDate and endDate (day-level).',
        },
        { status: 400 }
      );
    }

    if (queueEnabled) {
      const started = await startQueueRun({
        companyId,
        platform: queuePlatform,
        frequency,
        site,
        mode,
        backfillMonths: effectiveBackfillMonths,
        lookbackDays,
        startDate,
        endDate,
        salesOnly,
        workerBaseUrl: request.nextUrl.origin,
      });
      return NextResponse.json({
        ok: true,
        companyId,
        alreadyRunning: started.alreadyRunning,
        queued: started.queued,
        run: mapQueueRunToLegacy(started.run),
        message: started.queued
          ? 'Async operational sync queued behind active run.'
          : started.alreadyRunning
            ? 'Async operational sync already running.'
            : 'Async operational sync started.',
      });
    }

    const nowIso = new Date().toISOString();
    const run: InforOperationalAsyncRun = {
      syncRunId: randomUUID(),
      status: 'running',
      companyId,
      frequency,
      site,
      mode,
      backfillMonths: effectiveBackfillMonths,
      lookbackDays,
      startDate,
      endDate,
      salesOnly,
      cursor: null,
      chunkCount: 0,
      recordsCreated: 0,
      warningCount: 0,
      retryCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastChunkAt: null,
      lastError: null,
      message: 'Queued for background processing.',
    };

    await prisma.accountingConnection.update({
      where: { id: connection.id },
      data: {
        connectionMetadata: withRunStateMetadata(connection.connectionMetadata, run),
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      run,
      message: 'Async operational sync started.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to start async Infor M3 operational sync',
        details: message,
      },
      { status }
    );
  }
}

