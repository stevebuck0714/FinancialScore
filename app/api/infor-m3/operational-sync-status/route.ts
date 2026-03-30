import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';
import { requireSiteAdmin } from '@/lib/tenant-security';
import { getRunStateFromMetadata } from '@/lib/infor-m3/async-run-state';
import { getQueueRunById, isInforSyncQueueEnabled, mapQueueRunToLegacy } from '@/lib/infor-m3/sync-queue';

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
};

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
      COALESCE("errorDetails"->'syncWindow'->>'endDate', '') AS "syncWindowEnd"
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
          const module = String(row.module || '').trim();
          const program = String(row.miProgram || '').trim();
          const tx = String(row.transaction || '').trim();
          const descriptor = `${module}/${program || tx}`.replace(/^\/|\/$/g, '');
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

  return {
    failedChunks: failedRows.length,
    skippedChunks: skippedRows.length,
    failedPrograms,
    suggestedRerunWindows: Array.from(windows.values()).slice(0, 8),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireSiteAdmin();
    const companyId = getRequestedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });
    }
    const syncRunId = String(request.nextUrl.searchParams.get('syncRunId') || '').trim();
    if (!syncRunId) {
      return NextResponse.json({ error: 'syncRunId is required.' }, { status: 400 });
    }

    if (isInforSyncQueueEnabled()) {
      const queueRun = await getQueueRunById(companyId, syncRunId);
      if (queueRun) {
        const mapped = mapQueueRunToLegacy(queueRun);
        const diagnostics = await buildRunDiagnostics(companyId, syncRunId);
        const recentlyActive =
          mapped.status === 'running' &&
          (Date.now() - new Date(mapped.updatedAt).getTime() <= 15 * 60 * 1000 ||
            (mapped.lastChunkAt ? Date.now() - new Date(mapped.lastChunkAt).getTime() <= 3 * 60 * 1000 : false));
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
        connectionMetadata: true,
      },
    });
    const activeRun = getRunStateFromMetadata(connection?.connectionMetadata);
    const runMatches = activeRun && activeRun.syncRunId === syncRunId ? activeRun : null;

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
    const lastRow = rows[0];
    const lastChunkAt =
      runMatches?.lastChunkAt ||
      (lastRow?.createdAt ? new Date(lastRow.createdAt).toISOString() : null);
    const lastStatusText =
      (runMatches?.status ? String(runMatches.status) : null) ||
      (lastRow?.status ? String(lastRow.status) : null);
    const recentlyActive =
      (runMatches?.status === 'running' && Date.now() - new Date(runMatches.updatedAt).getTime() <= 15 * 60 * 1000) ||
      (typeof lastChunkAt === 'string' && Date.now() - new Date(lastChunkAt).getTime() <= 3 * 60 * 1000);
    const diagnostics = await buildRunDiagnostics(companyId, syncRunId);

    return NextResponse.json({
      ok: true,
      companyId,
      syncRunId,
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
