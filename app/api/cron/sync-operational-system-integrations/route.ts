import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildAndSaveBambooHrWorkforceReportSnapshot } from '@/lib/operations/bamboohr-workforce-reports';
import { sendSyncFailureNotification } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const OPERATIONAL_SYNC_TIME_ZONE = 'America/New_York';

type OperationalConnectionRow = {
  id: string;
  companyId: string;
  provider: string;
  sourceCode: string;
  status: string;
  autoSync: boolean;
  syncFrequency: string;
  connectionMetadata: unknown;
  company?: { name?: string | null } | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizePullTime(value: unknown): string {
  if (typeof value !== 'string') return '08:00';
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '08:00';
}

function getTimeZoneNowParts(timeZone: string): {
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = String(map.weekday || '').slice(0, 3);
  const weekdayToNumber: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    hour: Number.parseInt(String(map.hour || '0'), 10) || 0,
    minute: Number.parseInt(String(map.minute || '0'), 10) || 0,
    dayOfWeek: weekdayToNumber[weekday] ?? 0,
    dayOfMonth: Number.parseInt(String(map.day || '1'), 10) || 1,
  };
}

function shouldRunForFrequency(frequency: string, pullTime: string): boolean {
  const normalized = String(frequency || 'daily').toLowerCase();
  const [scheduledHour, scheduledMinute] = normalizePullTime(pullTime).split(':').map((value) => Number(value));
  const now = getTimeZoneNowParts(OPERATIONAL_SYNC_TIME_ZONE);
  if (now.hour !== scheduledHour || now.minute !== scheduledMinute) return false;
  if (normalized === 'daily') return true;
  if (normalized === 'weekly') return now.dayOfWeek === 0;
  if (normalized === 'monthly') return now.dayOfMonth === 1;
  return false;
}

function readSourcePullTime(row: OperationalConnectionRow): string {
  const metadata = asRecord(row.connectionMetadata);
  const direct = normalizePullTime(metadata.operationalPullTime);
  if (direct !== '08:00' || metadata.operationalPullTime === '08:00') return direct;

  const sourceSettingsKeys = [
    'bambooHrSettings',
    'platosClosetSettings',
  ];
  for (const key of sourceSettingsKeys) {
    const settings = asRecord(metadata[key]);
    const time = normalizePullTime(settings.syncTime);
    if (time !== '08:00' || settings.syncTime === '08:00') return time;
  }
  return '08:00';
}

async function notifyOperationalSourceFailure(row: OperationalConnectionRow, errorSummary: string, errorDetails: string): Promise<void> {
  try {
    const [company, admins] = await Promise.all([
      prisma.company.findUnique({ where: { id: row.companyId }, select: { name: true } }),
      prisma.user.findMany({ where: { role: 'SITEADMIN' }, select: { email: true } }),
    ]);
    const recipients = Array.from(new Set([
      'support@corelytics.com',
      ...admins.map((admin) => admin.email).filter(Boolean),
    ] as string[]));
    await sendSyncFailureNotification({
      recipients,
      companyName: company?.name || row.company?.name || row.companyId,
      companyId: row.companyId,
      platform: `${row.provider}:${row.sourceCode}`,
      syncType: 'operational_system_integration_auto_sync',
      errorSummary,
      errorDetails,
      actionUrl: process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || undefined,
    });
  } catch (error) {
    console.error('Failed to send operational source sync alert:', error);
  }
}

async function runOperationalSource(row: OperationalConnectionRow): Promise<{
  ok: boolean;
  recordsCreated: number;
  message: string;
}> {
  if (row.provider === 'BAMBOOHR' && row.sourceCode === 'BAMBOOHR_STANDARD') {
    const snapshot = await buildAndSaveBambooHrWorkforceReportSnapshot(row.companyId);
    return {
      ok: true,
      recordsCreated: Number(snapshot.employeesSampled || 0),
      message: `BambooHR workforce report synced (${snapshot.employeesSampled || 0} employee sample rows).`,
    };
  }

  return {
    ok: true,
    recordsCreated: 0,
    message: `${row.provider}:${row.sourceCode} is not an API-pull source; skipped by scheduled API sync.`,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const delegate = (prisma as any).operationalSystemConnection;
    if (!delegate) {
      return NextResponse.json(
        { success: false, error: 'OperationalSystemConnection delegate is unavailable. Run Prisma generate/migrations.' },
        { status: 500 }
      );
    }

    const connections = (await delegate.findMany({
      where: {
        status: 'ACTIVE',
        autoSync: true,
        provider: 'BAMBOOHR',
      },
      select: {
        id: true,
        companyId: true,
        provider: true,
        sourceCode: true,
        status: true,
        autoSync: true,
        syncFrequency: true,
        connectionMetadata: true,
        company: { select: { name: true } },
      },
      orderBy: { companyId: 'asc' },
    })) as OperationalConnectionRow[];

    const runnableConnections = connections.filter((connection) =>
      shouldRunForFrequency(connection.syncFrequency || 'daily', readSourcePullTime(connection))
    );

    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let totalRecords = 0;

    for (const connection of runnableConnections) {
      const syncStartedAt = Date.now();
      const metadata = asRecord(connection.connectionMetadata);
      try {
        const result = await runOperationalSource(connection);
        const now = new Date();
        totalRecords += result.recordsCreated;
        successCount += 1;
        await delegate.update({
          where: { id: connection.id },
          data: {
            status: 'ACTIVE',
            lastSyncAt: now,
            errorMessage: null,
            connectionMetadata: {
              ...metadata,
              lastSyncSummary: {
                mode: 'scheduled',
                provider: connection.provider,
                sourceCode: connection.sourceCode,
                startedAt: new Date(syncStartedAt).toISOString(),
                finishedAt: now.toISOString(),
                durationMs: Date.now() - syncStartedAt,
                recordsCreated: result.recordsCreated,
                message: result.message,
              },
              lastUpdatedAt: now.toISOString(),
            },
          },
        });
        results.push({
          companyId: connection.companyId,
          provider: connection.provider,
          sourceCode: connection.sourceCode,
          ok: true,
          recordsCreated: result.recordsCreated,
          message: result.message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown operational source sync error';
        errorCount += 1;
        await delegate.update({
          where: { id: connection.id },
          data: {
            status: 'ERROR',
            errorMessage: message.slice(0, 900),
            connectionMetadata: {
              ...metadata,
              lastSyncSummary: {
                mode: 'scheduled',
                provider: connection.provider,
                sourceCode: connection.sourceCode,
                startedAt: new Date(syncStartedAt).toISOString(),
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - syncStartedAt,
                error: message,
              },
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        });
        await notifyOperationalSourceFailure(
          connection,
          `Operational source sync failed for ${connection.provider}:${connection.sourceCode}`,
          message.slice(0, 500)
        );
        results.push({
          companyId: connection.companyId,
          provider: connection.provider,
          sourceCode: connection.sourceCode,
          ok: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      success: errorCount === 0,
      message: `Synced ${successCount} of ${runnableConnections.length} due operational source connection(s)`,
      totalConnections: connections.length,
      runnableConnections: runnableConnections.length,
      sourcesSynced: successCount,
      sourcesWithErrors: errorCount,
      totalRecords,
      duration: Date.now() - startedAt,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cron error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Manual sync only available in development' }, { status: 403 });
  }
  return GET(request);
}
