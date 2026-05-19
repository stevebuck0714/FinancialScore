/**
 * POST /api/accounting-systems/vista-cloud/sync
 *
 * Body shape:
 *   {
 *     companyId: string;
 *     mode?: 'incremental' | 'backfill'; // defaults to 'incremental'
 *     since?: string;                    // YYYY-MM-DD — incremental override
 *     startDate?: string;                // YYYY-MM-DD — backfill window
 *     endDate?: string;                  // YYYY-MM-DD — backfill window
 *     environment?: 'PROD' | 'TEST';     // override the saved default
 *     resourcePaths?: string[];          // restrict to these resourcePaths;
 *                                        // defaults to every enabled program.
 *   }
 *
 * Behavior mirrors the Sage Intacct sync route, adapted for Vista's REST
 * shape:
 *   - 'incremental' pulls each enabled program with `<modifiedField> >= since`
 *     (or the program's last-synced timestamp, defaulting to the schedule's
 *     initialSyncStartDate, defaulting to 7 days ago). Programs without a
 *     `modifiedField` fall back to a `historyMonths` lookback window with
 *     the resource's own date field as best-effort — for these resources we
 *     simply send no filter and let Trimble's 12-month server default kick
 *     in (and report `truncated:true` if pageSize is exhausted).
 *   - 'backfill' pulls each enabled program with `<modifiedField>` inside
 *     the supplied [startDate, endDate] window. Programs with no
 *     modifiedField are skipped with a warning so we don't accidentally
 *     re-pull the entire 12-month server window during a "backfill".
 *
 * Per-program rows are reported in the response payload (sample row only)
 * and per-program totals are persisted to `connectionMetadata`. Raw row
 * persistence (writing to per-resource tables) is deferred to a follow-up,
 * matching the Sage Intacct route.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import vistaCloud, {
  type VistaCloudProgram,
  type VistaCloudSettings,
} from '@/lib/accounting-systems/vista-cloud';
import {
  buildProgramFilter,
  pageThrough,
  resolveCreds,
  VistaApiError,
  type VistaEnvironment,
} from '@/lib/accounting-systems/vista-cloud/client';

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

function pickEnvOverride(body: Record<string, unknown>): VistaEnvironment | null {
  const raw = asString(body.environment).toUpperCase();
  if (raw === 'PROD' || raw === 'TEST') return raw;
  return null;
}

type ProgramSyncOutcome = {
  module: string;
  resource: string;
  resourcePath: string;
  /** Stable key the UI uses to look up per-program state — `<module>/<resourcePath>`. */
  key: string;
  ok: boolean;
  recordCount: number;
  pages?: number;
  truncated?: boolean;
  warning?: string;
  error?: string;
  syncedAt: string;
  sampleRow?: Record<string, unknown> | null;
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company || String(company.accountingSystem || '').toUpperCase() !== vistaCloud.platform) {
      return NextResponse.json(
        { ok: false, error: `Sync requires the company's accounting system to be ${vistaCloud.platform}.` },
        { status: 400 }
      );
    }

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
      select: { connectionMetadata: true, lastSyncAt: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'No saved Vista Cloud connection. Save credentials and click Connect first.' },
        { status: 400 }
      );
    }

    const metadata = pickMetadata(existing.connectionMetadata);
    const settings = vistaCloud.sanitizeSettings(metadata.settings ?? vistaCloud.defaultSettings) as VistaCloudSettings;
    const programs = vistaCloud.sanitizePrograms(metadata.programs ?? vistaCloud.defaultPrograms) as VistaCloudProgram[];
    const sharedSchedule = pickMetadata(metadata.sharedSchedule);
    const lastSyncedPerObject = pickMetadata(metadata.lastSyncedPerObject);

    const mode = asString(body.mode).toLowerCase() === 'backfill' ? 'backfill' : 'incremental';
    const explicitSince = asString(body.since);
    const startDate = asString(body.startDate);
    const endDate = asString(body.endDate);
    const envOverride = pickEnvOverride(body);
    const resourcesFilter = Array.isArray(body.resourcePaths)
      ? (body.resourcePaths as unknown[]).map(asString).filter(Boolean)
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

    // Per-row override targets honored even if disabled; sweep ops only run
    // currently-enabled programs.
    const targetPrograms = resourcesFilter.length > 0
      ? programs.filter((p) => resourcesFilter.includes(p.resourcePath))
      : programs.filter((p) => p.enabled !== false);
    if (targetPrograms.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: resourcesFilter.length > 0
            ? 'None of the requested resources matched a saved program.'
            : 'No enabled programs to sync — enable at least one program in Accounting Programs / Resources.',
        },
        { status: 400 }
      );
    }

    let creds;
    try {
      creds = resolveCreds(settings, envOverride);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : 'Unknown credential error' },
        { status: 400 }
      );
    }

    const fallbackSince = explicitSince
      || asString(sharedSchedule.initialSyncStartDate)
      || defaultSince();

    const outcomes: ProgramSyncOutcome[] = [];
    let totalRows = 0;
    let totalErrors = 0;

    // Key per-program last-synced state by `<module>/<resourcePath>` so that
    // resources sharing a path across modules (e.g. ar/invoices vs ap/invoices)
    // don't collide.
    const programKey = (p: { module: string; resourcePath: string }) =>
      `${p.module}/${p.resourcePath}`;

    for (const program of targetPrograms) {
      const programLastSyncedRaw = lastSyncedPerObject[programKey(program)];
      const programLastSynced = typeof programLastSyncedRaw === 'string'
        ? programLastSyncedRaw.slice(0, 10)
        : '';
      const since = mode === 'incremental'
        ? (explicitSince || programLastSynced || fallbackSince)
        : startDate;
      const until = mode === 'backfill' ? endDate : null;

      const filter = buildProgramFilter(program, { since, until });
      const syncedAt = new Date().toISOString();

      // Backfill on a program with no modifiedField would silently fall back
      // to Trimble's 12-month default — surface that as a warning instead of
      // pretending to do a backfill.
      if (mode === 'backfill' && !filter) {
        outcomes.push({
          module: program.module,
          resource: program.resource,
          resourcePath: program.resourcePath,
          key: programKey(program),
          ok: true,
          recordCount: 0,
          warning: `No modifiedField configured for ${program.module}/${program.resourcePath}; backfill skipped to avoid pulling Trimble's default 12-month window unintentionally.`,
          syncedAt,
          sampleRow: null,
        });
        continue;
      }

      try {
        const page = await pageThrough(
          {
            creds,
            module: program.module,
            resourcePath: program.resourcePath,
            filter,
          },
          { maxRows: 5000 }
        );

        totalRows += page.rows.length;
        const sample = page.rows[0];
        outcomes.push({
          module: program.module,
          resource: program.resource,
          resourcePath: program.resourcePath,
          key: programKey(program),
          ok: true,
          recordCount: page.rows.length,
          pages: page.pages,
          truncated: page.truncated,
          warning: !filter && mode === 'incremental'
            ? `No modifiedField configured; relying on Trimble's server-side history default (typically 12 months).`
            : undefined,
          syncedAt,
          sampleRow: sample && typeof sample === 'object' && !Array.isArray(sample)
            ? (sample as Record<string, unknown>)
            : null,
        });
        lastSyncedPerObject[programKey(program)] = syncedAt;
      } catch (err) {
        totalErrors += 1;
        const errorMessage = err instanceof VistaApiError
          ? `${err.message} — ${err.body.slice(0, 300)}`
          : err instanceof Error
          ? err.message
          : 'Unknown error';
        outcomes.push({
          module: program.module,
          resource: program.resource,
          resourcePath: program.resourcePath,
          key: programKey(program),
          ok: false,
          recordCount: 0,
          error: errorMessage,
          syncedAt,
          sampleRow: null,
        });
      }
    }

    const now = new Date();
    const updatedMetadata = {
      ...metadata,
      session: {
        environment: creds.environment,
        validatedAt: now.toISOString(),
      },
      lastSyncedPerObject,
      lastSyncSummary: {
        mode,
        environment: creds.environment,
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
      where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
      data: {
        lastSyncAt: now,
        status: totalErrors === 0 ? 'ACTIVE' : 'ERROR',
        errorMessage: totalErrors === 0
          ? null
          : `${totalErrors}/${outcomes.length} program(s) failed during ${mode}.`,
        connectionMetadata: updatedMetadata as any,
      },
    });

    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: vistaCloud.platform,
        syncType: mode === 'backfill' ? 'backfill' : 'incremental',
        status: totalErrors === 0 ? 'success' : 'partial',
        recordsImported: totalRows,
        errorCount: totalErrors,
        errorDetails: totalErrors > 0
          ? outcomes.filter((o) => !o.ok).map(({ key, resourcePath, error }) => ({ key, resourcePath, error }))
          : undefined,
        duration: Date.now() - startedAt,
      },
    });

    return NextResponse.json({
      ok: totalErrors === 0,
      companyId,
      mode,
      environment: creds.environment,
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
