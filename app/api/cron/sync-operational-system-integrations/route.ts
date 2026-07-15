import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildAndSaveBambooHrWorkforceReportSnapshot } from '@/lib/operations/bamboohr-workforce-reports';
import { sendSyncFailureNotification } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const OPERATIONAL_SYNC_TIME_ZONE = 'America/New_York';
const DUE_LOOKBACK_HOURS = 36;

type OperationalConnectionRow = {
  id: string;
  companyId: string;
  provider: string;
  sourceCode: string;
  status: string;
  autoSync: boolean;
  syncFrequency: string;
  lastSyncAt: Date | null;
  createdAt: Date;
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

function getTimeZoneNowParts(timeZone: string, date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
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
    year: Number.parseInt(String(map.year || '0'), 10) || 0,
    month: Number.parseInt(String(map.month || '0'), 10) || 0,
    day: Number.parseInt(String(map.day || '0'), 10) || 0,
    hour: Number.parseInt(String(map.hour || '0'), 10) || 0,
    minute: Number.parseInt(String(map.minute || '0'), 10) || 0,
    dayOfWeek: weekdayToNumber[weekday] ?? 0,
  };
}

function addLocalDays(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedLocalTimeToUtc(local: { year: number; month: number; day: number; hour: number; minute: number }): Date {
  const desiredWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  const guess = new Date(desiredWallClockMs);
  const actualAtGuess = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_SYNC_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const actualMap = Object.fromEntries(actualAtGuess.map((part) => [part.type, part.value]));
  const actualWallClockMs = Date.UTC(
    Number(actualMap.year),
    Number(actualMap.month) - 1,
    Number(actualMap.day),
    Number(actualMap.hour),
    Number(actualMap.minute),
    0
  );
  return new Date(guess.getTime() - (actualWallClockMs - desiredWallClockMs));
}

function latestExpectedRunAt(frequency: string, pullTime: string, now = new Date()): Date | null {
  const normalized = String(frequency || 'daily').toLowerCase();
  const [scheduledHour, scheduledMinute] = normalizePullTime(pullTime).split(':').map((value) => Number(value));
  const nowParts = getTimeZoneNowParts(OPERATIONAL_SYNC_TIME_ZONE, now);
  let localDate = { year: nowParts.year, month: nowParts.month, day: nowParts.day };

  if (normalized === 'weekly') {
    localDate = addLocalDays(localDate, -nowParts.dayOfWeek);
  } else if (normalized === 'monthly') {
    localDate = { ...localDate, day: 1 };
  } else if (normalized !== 'daily') {
    return null;
  }

  let expected = zonedLocalTimeToUtc({
    ...localDate,
    hour: scheduledHour,
    minute: scheduledMinute,
  });

  if (expected.getTime() > now.getTime()) {
    if (normalized === 'daily') {
      localDate = addLocalDays(localDate, -1);
    } else if (normalized === 'weekly') {
      localDate = addLocalDays(localDate, -7);
    } else {
      const previousMonth = new Date(Date.UTC(localDate.year, localDate.month - 2, 1));
      localDate = {
        year: previousMonth.getUTCFullYear(),
        month: previousMonth.getUTCMonth() + 1,
        day: 1,
      };
    }
    expected = zonedLocalTimeToUtc({
      ...localDate,
      hour: scheduledHour,
      minute: scheduledMinute,
    });
  }

  return expected;
}

function isConnectionDue(connection: OperationalConnectionRow, now = new Date()): boolean {
  const expected = latestExpectedRunAt(connection.syncFrequency || 'daily', readSourcePullTime(connection), now);
  if (!expected) return false;
  if (now.getTime() - expected.getTime() > DUE_LOOKBACK_HOURS * 60 * 60 * 1000) return false;
  if (!connection.lastSyncAt) {
    return connection.createdAt.getTime() < expected.getTime();
  }
  return connection.lastSyncAt.getTime() < expected.getTime();
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
        status: { in: ['ACTIVE', 'ERROR'] },
        autoSync: true,
        provider: 'BAMBOOHR',
        syncFrequency: { not: 'manual' },
      },
      select: {
        id: true,
        companyId: true,
        provider: true,
        sourceCode: true,
        status: true,
        autoSync: true,
        syncFrequency: true,
        lastSyncAt: true,
        createdAt: true,
        connectionMetadata: true,
        company: { select: { name: true } },
      },
      orderBy: { companyId: 'asc' },
    })) as OperationalConnectionRow[];

    const now = new Date();
    const runnableConnections = connections.filter((connection) => isConnectionDue(connection, now));

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
        const latestConnection = await delegate.findUnique({
          where: { id: connection.id },
          select: { connectionMetadata: true },
        });
        const latestMetadata = asRecord(latestConnection?.connectionMetadata);
        totalRecords += result.recordsCreated;
        successCount += 1;
        await delegate.update({
          where: { id: connection.id },
          data: {
            status: 'ACTIVE',
            lastSyncAt: now,
            errorMessage: null,
            connectionMetadata: {
              ...latestMetadata,
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
