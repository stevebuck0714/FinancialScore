import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
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
    if (!connection) {
      return NextResponse.json({ ok: false, error: 'INFOR_M3 connection not found for company.' }, { status: 404 });
    }

    const queueEnabled = isInforSyncQueueEnabled();
    const existingRun = queueEnabled ? null : getRunStateFromMetadata(connection.connectionMetadata);
    if (action === 'cancel') {
      if (queueEnabled) {
        const syncRunId = String(body.syncRunId || '').trim() || undefined;
        const cancelled = await cancelQueueRun(companyId, syncRunId);
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
    const startDate = normalizeIsoDate(body.startDate);
    const endDate = normalizeIsoDate(body.endDate);
    const salesOnly = body.salesOnly === true || String(body.scope || '').trim().toLowerCase() === 'sales';

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    if (inforSystem === 'INFOR_CSI' && !site) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Site is required for CSI operational sync.',
        },
        { status: 400 }
      );
    }

    // Large CSI backfills can exceed per-request limits if run as broad windows.
    // Force resilient business-day chunking for daily CSI history runs.
    let effectiveBackfillMonths = backfillMonths;
    if (inforSystem === 'INFOR_CSI' && frequency === 'daily') {
      const requestedMode = mode;
      const looksLikeLargeManualWindow =
        requestedMode === 'manual' &&
        Boolean(startDate && endDate) &&
        monthsBetweenInclusive(startDate as string, endDate as string) >= 2;
      const isLargeBackfillMode = requestedMode === 'backfill';
      const isImplicitHistory = !requestedMode && typeof backfillMonths === 'number' && backfillMonths >= 2;
      if (isLargeBackfillMode || looksLikeLargeManualWindow || isImplicitHistory) {
        mode = 'business_day_backfill';
        if (!effectiveBackfillMonths) {
          effectiveBackfillMonths =
            startDate && endDate
              ? monthsBetweenInclusive(startDate, endDate)
              : 36;
        }
      }
    }

    if (queueEnabled) {
      const started = await startQueueRun({
        companyId,
        frequency,
        site,
        mode,
        backfillMonths: effectiveBackfillMonths,
        lookbackDays,
        startDate,
        endDate,
        salesOnly,
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

