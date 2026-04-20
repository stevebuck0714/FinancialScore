/**
 * POST /api/accounting-systems/sage-intacct/sync
 *
 * Body shape:
 *   {
 *     companyId: string;
 *     mode?: 'incremental' | 'backfill'; // defaults to 'incremental'
 *     since?: string;                    // YYYY-MM-DD — incremental override
 *     startDate?: string;                // YYYY-MM-DD — backfill window
 *     endDate?: string;                  // YYYY-MM-DD — backfill window
 *     objects?: string[];                // restrict to these Intacct objects;
 *                                        // defaults to every program saved on
 *                                        // the connection.
 *   }
 *
 * Behavior:
 *   - 'incremental' pulls each enabled program with WHENMODIFIED >= since
 *     (or the program's last-synced timestamp, defaulting to the schedule's
 *     initialSyncStartDate, defaulting to 7 days ago).
 *   - 'backfill' pulls each enabled program with WHENMODIFIED inside the
 *     supplied [startDate, endDate] window.
 *
 * For now this endpoint:
 *   - re-uses the cached sessionId (refreshing via getAPISession on miss/stale)
 *   - calls Intacct readByQuery for each program
 *   - persists per-program counts + lastSyncAt back into connectionMetadata
 *   - logs to ApiSyncLog
 *
 * Raw row persistence (writing the actual records to a per-object table) is
 * intentionally deferred — the operator surface needs to work end-to-end and
 * report counts before we lock in a storage shape. Rows are returned in the
 * response payload (truncated) so the operator can spot-check.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import sageIntacct, {
  type SageIntacctProgram,
  type SageIntacctSettings,
} from '@/lib/accounting-systems/sage-intacct';
import {
  getAPISession,
  pageThrough,
  type SageIntacctSession,
} from '@/lib/accounting-systems/sage-intacct/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function pickMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function intacctDate(iso: string): string {
  // Intacct prefers MM/DD/YYYY in WHEREMODIFIED queries.
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function buildIncrementalQuery(since: string): string {
  return `WHENMODIFIED > '${intacctDate(since)}'`;
}

function buildBackfillQuery(startDate: string, endDate: string): string {
  return `WHENMODIFIED BETWEEN '${intacctDate(startDate)}' AND '${intacctDate(endDate)}'`;
}

type ProgramSyncOutcome = {
  module: string;
  objectName: string;
  ok: boolean;
  totalCount?: number;
  recordCount: number;
  truncated?: boolean;
  error?: string;
  syncedAt: string;
  sampleRow?: Record<string, string> | null;
};

async function ensureSession(creds: SageIntacctSettings, cachedSession: { sessionId?: string; endpoint?: string } | null) {
  if (cachedSession?.sessionId && cachedSession?.endpoint) {
    // We don't currently revalidate cached sessions — Intacct sessions
    // expire after ~1 hour of inactivity. If a cached session is stale, the
    // first readByQuery will error with "session is no longer valid"; we
    // fall through to a fresh login on that signal.
    return {
      ok: true as const,
      session: {
        sessionId: cachedSession.sessionId,
        endpoint: cachedSession.endpoint,
        companyId: creds.companyId,
        userId: creds.userId,
      } as SageIntacctSession,
      fresh: false,
    };
  }
  const fresh = await getAPISession(creds);
  if (!fresh.ok) return { ok: false as const, error: fresh.error, status: fresh.status };
  return { ok: true as const, session: fresh.session, fresh: true };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company || String(company.accountingSystem || '').toUpperCase() !== sageIntacct.platform) {
      return NextResponse.json(
        { ok: false, error: `Sync requires the company's accounting system to be ${sageIntacct.platform}.` },
        { status: 400 }
      );
    }

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: sageIntacct.platform } },
      select: { connectionMetadata: true, lastSyncAt: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'No saved Sage Intacct connection. Save credentials and click Connect first.' },
        { status: 400 }
      );
    }

    const metadata = pickMetadata(existing.connectionMetadata);
    const creds = sageIntacct.sanitizeSettings(metadata.settings ?? sageIntacct.defaultSettings) as SageIntacctSettings;
    const programs = sageIntacct.sanitizePrograms(metadata.programs ?? sageIntacct.defaultPrograms) as SageIntacctProgram[];
    const sharedSchedule = pickMetadata(metadata.sharedSchedule);
    const lastSyncedPerObject = pickMetadata(metadata.lastSyncedPerObject);

    const mode = asString(body.mode).toLowerCase() === 'backfill' ? 'backfill' : 'incremental';
    const explicitSince = asString(body.since);
    const startDate = asString(body.startDate);
    const endDate = asString(body.endDate);
    const objectsFilter = Array.isArray(body.objects)
      ? (body.objects as unknown[]).map(asString).filter(Boolean)
      : [];

    if (mode === 'backfill') {
      if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
        return NextResponse.json(
          { ok: false, error: 'Backfill requires startDate and endDate in YYYY-MM-DD format.' },
          { status: 400 }
        );
      }
      if (startDate > endDate) {
        return NextResponse.json(
          { ok: false, error: 'startDate must be on or before endDate.' },
          { status: 400 }
        );
      }
    }

    // Per-row "Sync this" passes an explicit objects filter — that's a manual
    // override, so we honor it even if the program is currently disabled.
    // For sweep operations (Sync Now / Backfill / cron), only enabled
    // programs are pulled.
    const targetPrograms = objectsFilter.length > 0
      ? programs.filter((p) => objectsFilter.includes(p.objectName))
      : programs.filter((p) => p.enabled !== false);
    if (targetPrograms.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: objectsFilter.length > 0
            ? 'None of the requested objects matched a saved program.'
            : 'No enabled programs to sync — enable at least one program in Accounting Programs / Resources.',
        },
        { status: 400 }
      );
    }

    const cachedSession = pickMetadata(metadata.session);
    let sessionAttempt = await ensureSession(creds, {
      sessionId: typeof cachedSession.sessionId === 'string' ? cachedSession.sessionId : undefined,
      endpoint: typeof cachedSession.endpoint === 'string' ? cachedSession.endpoint : undefined,
    });
    if (!sessionAttempt.ok) {
      return NextResponse.json(
        { ok: false, error: `Failed to authenticate with Sage Intacct: ${sessionAttempt.error}` },
        { status: 502 }
      );
    }
    let session = sessionAttempt.session;
    let sessionRefreshed = sessionAttempt.fresh;

    const fallbackSince = explicitSince
      || asString(sharedSchedule.initialSyncStartDate)
      || defaultSince();

    const outcomes: ProgramSyncOutcome[] = [];
    let totalRows = 0;
    let totalErrors = 0;

    for (const program of targetPrograms) {
      const programLastSyncedRaw = lastSyncedPerObject[program.objectName];
      const programLastSynced = typeof programLastSyncedRaw === 'string'
        ? programLastSyncedRaw.slice(0, 10)
        : '';
      const since = mode === 'incremental'
        ? (explicitSince || programLastSynced || fallbackSince)
        : startDate;
      const query = mode === 'incremental'
        ? buildIncrementalQuery(since)
        : buildBackfillQuery(startDate, endDate);

      let page = await pageThrough(
        { session, object: program.objectName, query, fields: '*', pagesize: 200 },
        { maxRows: 5000 }
      );

      // Stale session retry — refresh once and try again.
      if (!page.ok && /session/i.test(page.error || '') && !sessionRefreshed) {
        const fresh = await getAPISession(creds);
        if (fresh.ok) {
          session = fresh.session;
          sessionRefreshed = true;
          page = await pageThrough(
            { session, object: program.objectName, query, fields: '*', pagesize: 200 },
            { maxRows: 5000 }
          );
        }
      }

      const syncedAt = new Date().toISOString();
      if (!page.ok) {
        totalErrors += 1;
        outcomes.push({
          module: program.module,
          objectName: program.objectName,
          ok: false,
          recordCount: 0,
          error: page.error || 'Unknown error',
          syncedAt,
          sampleRow: null,
        });
        continue;
      }

      totalRows += page.rows.length;
      outcomes.push({
        module: program.module,
        objectName: program.objectName,
        ok: true,
        totalCount: page.totalCount,
        recordCount: page.rows.length,
        truncated: page.truncated,
        syncedAt,
        sampleRow: page.rows[0] ?? null,
      });
      lastSyncedPerObject[program.objectName] = syncedAt;
    }

    const now = new Date();
    const updatedMetadata = {
      ...metadata,
      session: {
        sessionId: session.sessionId,
        endpoint: session.endpoint,
        cachedAt: sessionRefreshed ? now.toISOString() : (cachedSession.cachedAt as string | undefined) || now.toISOString(),
      },
      lastSyncedPerObject,
      lastSyncSummary: {
        mode,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: now.toISOString(),
        durationMs: Date.now() - startedAt,
        programsRun: outcomes.length,
        programsFailed: totalErrors,
        totalRows,
        since: mode === 'incremental' ? fallbackSince : undefined,
        startDate: mode === 'backfill' ? startDate : undefined,
        endDate: mode === 'backfill' ? endDate : undefined,
      },
      lastUpdatedAt: now.toISOString(),
    };

    await prisma.accountingConnection.update({
      where: { companyId_platform: { companyId, platform: sageIntacct.platform } },
      data: {
        lastSyncAt: now,
        status: totalErrors === 0 ? 'ACTIVE' : 'ERROR',
        errorMessage: totalErrors === 0
          ? null
          : `${totalErrors}/${outcomes.length} program(s) failed during ${mode}.`,
        connectionMetadata: updatedMetadata,
      },
    });

    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: sageIntacct.platform,
        syncType: mode === 'backfill' ? 'backfill' : 'incremental',
        status: totalErrors === 0 ? 'success' : 'partial',
        recordsImported: totalRows,
        errorCount: totalErrors,
        errorDetails: totalErrors > 0
          ? outcomes.filter((o) => !o.ok).map(({ objectName, error }) => ({ objectName, error }))
          : undefined,
        duration: Date.now() - startedAt,
      },
    });

    return NextResponse.json({
      ok: totalErrors === 0,
      companyId,
      mode,
      since: mode === 'incremental' ? fallbackSince : undefined,
      startDate: mode === 'backfill' ? startDate : undefined,
      endDate: mode === 'backfill' ? endDate : undefined,
      programsRun: outcomes.length,
      programsFailed: totalErrors,
      totalRows,
      durationMs: Date.now() - startedAt,
      outcomes,
      message: totalErrors === 0
        ? `${mode === 'backfill' ? 'Backfill' : 'Sync'} complete: ${totalRows} record(s) across ${outcomes.length} program(s).`
        : `${mode === 'backfill' ? 'Backfill' : 'Sync'} finished with ${totalErrors} program failure(s).`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - startedAt }, { status });
  }
}
