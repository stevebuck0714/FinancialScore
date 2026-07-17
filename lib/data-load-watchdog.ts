import prisma from '@/lib/prisma';
import type { AccountingPlatform, Prisma } from '@prisma/client';
import { sendSyncFailureNotification } from '@/lib/email';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

const WATCHDOG_TIME_ZONE = 'America/New_York';
const DEFAULT_GRACE_MINUTES = 15;
const DEFAULT_DEDUPE_HOURS = 12;

type WatchdogAlertReason = 'error_state' | 'overdue';

type WatchdogAlertResult = {
  companyId: string;
  companyName: string;
  sourceType: 'accounting' | 'operational_system';
  sourceKey: string;
  reason: WatchdogAlertReason;
  notified: boolean;
  deduped: boolean;
  detail: string;
};

type WatchdogRunResult = {
  ok: boolean;
  scannedAccountingConnections: number;
  scannedOperationalConnections: number;
  alerts: WatchdogAlertResult[];
  graceMinutes: number;
};

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
};

type AccountingWatchRow = {
  id: string;
  companyId: string;
  platform: AccountingPlatform;
  status: string;
  lastSyncAt: Date | null;
  autoSync: boolean;
  syncFrequency: string;
  connectionMetadata: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdAt: Date;
  company: {
    name: string | null;
    accountingSystem: string | null;
  };
};

type OperationalWatchRow = {
  id: string;
  companyId: string;
  provider: string;
  sourceCode: string;
  status: string;
  lastSyncAt: Date | null;
  autoSync: boolean;
  syncFrequency: string;
  connectionMetadata: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdAt: Date;
  company: {
    name: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveGraceMinutes(): number {
  const raw = Number(process.env.DATA_LOAD_WATCHDOG_GRACE_MINUTES || DEFAULT_GRACE_MINUTES);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_GRACE_MINUTES;
  return Math.min(1440, Math.max(0, Math.floor(raw)));
}

function resolveDedupeHours(): number {
  const raw = Number(process.env.DATA_LOAD_WATCHDOG_DEDUPE_HOURS || DEFAULT_DEDUPE_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DEDUPE_HOURS;
  return Math.min(168, Math.max(1, Math.floor(raw)));
}

function normalizeFrequency(value: unknown): 'daily' | 'weekly' | 'monthly' | 'manual' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') return normalized;
  return 'manual';
}

function normalizePullTime(value: unknown): string {
  const trimmed = asString(value);
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '08:00';
}

function readAccountingPullTime(metadataValue: unknown): string {
  const metadata = asRecord(metadataValue);
  const direct = normalizePullTime(metadata.operationalPullTime);
  if (direct !== '08:00' || metadata.operationalPullTime === '08:00') return direct;

  for (const key of [
    'quickbooksOnlineSettings',
    'quickbooksDesktopSettings',
    'dynamicsSettings',
    'acumaticaSettings',
    'odooSettings',
    'sageIntacctSettings',
  ]) {
    const settings = asRecord(metadata[key]);
    const time = normalizePullTime(settings.syncTime);
    if (time !== '08:00' || settings.syncTime === '08:00') return time;
  }

  return '08:00';
}

function readOperationalPullTime(metadataValue: unknown): string {
  const metadata = asRecord(metadataValue);
  const direct = normalizePullTime(metadata.operationalPullTime);
  if (direct !== '08:00' || metadata.operationalPullTime === '08:00') return direct;

  for (const key of ['bambooHrSettings', 'platosClosetSettings']) {
    const settings = asRecord(metadata[key]);
    const time = normalizePullTime(settings.syncTime);
    if (time !== '08:00' || settings.syncTime === '08:00') return time;
  }

  return '08:00';
}

function getTimeZoneParts(date: Date, timeZone = WATCHDOG_TIME_ZONE): TimeZoneParts {
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
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = String(parts.weekday || '').slice(0, 3);
  const dayOfWeekByName: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: dayOfWeekByName[weekday] ?? 0,
  };
}

function addLocalDays(parts: Pick<TimeZoneParts, 'year' | 'month' | 'day'>, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedLocalTimeToUtc(
  local: Pick<TimeZoneParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
  timeZone = WATCHDOG_TIME_ZONE,
): Date {
  const desiredWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  const guess = new Date(desiredWallClockMs);
  const actual = getTimeZoneParts(guess, timeZone);
  const actualWallClockMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
  return new Date(guess.getTime() - (actualWallClockMs - desiredWallClockMs));
}

function latestExpectedRunAt(now: Date, frequencyValue: unknown, pullTime: string): Date | null {
  const frequency = normalizeFrequency(frequencyValue);
  if (frequency === 'manual') return null;

  const [scheduledHour, scheduledMinute] = normalizePullTime(pullTime).split(':').map((value) => Number(value));
  const nowParts = getTimeZoneParts(now);
  let localDate = { year: nowParts.year, month: nowParts.month, day: nowParts.day };

  if (frequency === 'weekly') {
    localDate = addLocalDays(localDate, -nowParts.dayOfWeek);
  } else if (frequency === 'monthly') {
    localDate = { ...localDate, day: 1 };
  }

  let expected = zonedLocalTimeToUtc({
    ...localDate,
    hour: scheduledHour,
    minute: scheduledMinute,
  });

  if (expected.getTime() > now.getTime()) {
    if (frequency === 'daily') {
      localDate = addLocalDays(localDate, -1);
    } else if (frequency === 'weekly') {
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

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestDate(...values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => Boolean(value && !Number.isNaN(value.getTime())));
  if (dates.length === 0) return null;
  return dates.reduce((latest, value) => (value.getTime() > latest.getTime() ? value : latest), dates[0]);
}

function getAccountingLastSuccess(row: AccountingWatchRow): Date | null {
  const metadata = asRecord(row.connectionMetadata);
  if (isQuickBooksDesktopFamily(row.company.accountingSystem)) {
    return latestDate(
      parseDate(metadata.quickbooksDesktopLastWebConnectorSyncAt),
      parseDate(asRecord(metadata.quickbooksDesktopWebConnectorLastRun).completedAt),
      row.lastSyncAt,
    );
  }
  return row.lastSyncAt;
}

function isUserInitiatedAccountingSource(row: AccountingWatchRow): boolean {
  const accountingSystem = String(row.company.accountingSystem || '').trim().toUpperCase();
  const platform = String(row.platform || '').trim().toUpperCase();

  if (accountingSystem === 'CSV_FILE') return true;
  if (platform === 'QUICKBOOKS' && !isQuickBooksDesktopFamily(accountingSystem)) return true;

  return false;
}

function shouldAlertOverdue(params: {
  now: Date;
  lastSuccessAt: Date | null;
  createdAt: Date;
  expectedAt: Date | null;
  graceMinutes: number;
}): boolean {
  if (!params.expectedAt) return false;
  const graceMs = params.graceMinutes * 60 * 1000;
  if (params.now.getTime() < params.expectedAt.getTime() + graceMs) return false;
  if (!params.lastSuccessAt) return params.createdAt.getTime() < params.expectedAt.getTime();
  return params.lastSuccessAt.getTime() < params.expectedAt.getTime();
}

function formatIso(value: Date | null): string {
  return value ? value.toISOString() : 'never';
}

function describeGraceWindow(graceMinutes: number): string {
  return graceMinutes > 0 ? `${graceMinutes} minute grace window applied.` : 'No grace window is applied.';
}

async function notifyOperationalSystemAlert(params: {
  row: OperationalWatchRow;
  reason: WatchdogAlertReason;
  errorSummary: string;
  errorDetails: string;
  alertKey: string;
  dedupeHours: number;
}): Promise<{ notified: boolean; deduped: boolean; detail: string }> {
  const metadata = asRecord(params.row.connectionMetadata);
  const alerts = asRecord(metadata.dataLoadWatchdogAlerts);
  const lastAlertAt = parseDate(alerts[params.alertKey]);
  const cutoff = Date.now() - params.dedupeHours * 60 * 60 * 1000;
  if (lastAlertAt && lastAlertAt.getTime() >= cutoff) {
    return { notified: false, deduped: true, detail: 'Already alerted in dedupe window' };
  }

  const [admins] = await Promise.all([
    prisma.user.findMany({ where: { role: 'SITEADMIN' }, select: { email: true } }),
  ]);
  const recipients = Array.from(new Set([
    'support@corelytics.com',
    ...admins.map((admin) => asString(admin.email).toLowerCase()).filter(Boolean),
  ]));

  const result = await sendSyncFailureNotification({
    recipients,
    companyName: params.row.company.name || params.row.companyId,
    companyId: params.row.companyId,
    platform: `${params.row.provider}:${params.row.sourceCode}`,
    syncType: `data_load_watchdog_${params.reason}`,
    errorSummary: params.errorSummary,
    errorDetails: params.errorDetails,
    actionUrl: process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || undefined,
  });

  await prisma.operationalSystemConnection.update({
    where: { id: params.row.id },
    data: {
      connectionMetadata: {
        ...metadata,
        dataLoadWatchdogAlerts: {
          ...alerts,
          [params.alertKey]: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });

  return {
    notified: Boolean(result.success),
    deduped: false,
    detail: result.success ? 'Notification sent' : asString(asRecord(result).reason) || 'Notification failed',
  };
}

async function evaluateAccountingConnection(
  row: AccountingWatchRow,
  now: Date,
  graceMinutes: number,
  dedupeHours: number,
): Promise<WatchdogAlertResult | null> {
  const frequency = normalizeFrequency(row.syncFrequency);
  if (!row.autoSync || frequency === 'manual') return null;
  if (isUserInitiatedAccountingSource(row)) return null;

  const sourceKey = String(row.platform);
  const companyName = row.company.name || row.companyId;
  const pullTime = readAccountingPullTime(row.connectionMetadata);
  const expectedAt = latestExpectedRunAt(now, frequency, pullTime);
  const lastSuccessAt = getAccountingLastSuccess(row);
  const status = String(row.status || '').toUpperCase();
  const errorMessage = asString(row.errorMessage);
  const isError = status === 'ERROR' || Boolean(errorMessage);
  const isOverdue = shouldAlertOverdue({
    now,
    lastSuccessAt,
    createdAt: row.createdAt,
    expectedAt,
    graceMinutes,
  });

  if (!isError && !isOverdue) return null;

  const reason: WatchdogAlertReason = isError ? 'error_state' : 'overdue';
  const errorSummary =
    reason === 'error_state'
      ? `Data load is in error for ${sourceKey}`
      : `Scheduled data load missed for ${sourceKey}`;
  const errorDetails =
    reason === 'error_state'
      ? errorMessage || `Connection status is ${status || 'unknown'}.`
      : `Expected run: ${formatIso(expectedAt)} (${pullTime} ${WATCHDOG_TIME_ZONE}, ${frequency}). Last successful load: ${formatIso(lastSuccessAt)}. ${describeGraceWindow(graceMinutes)}`;

  const result = await notifyAdminsOfSyncFailure({
    companyId: row.companyId,
    platform: row.platform,
    syncType: `data_load_watchdog_${reason}`,
    errorSummary,
    errorDetails,
    dedupeHours,
  });

  return {
    companyId: row.companyId,
    companyName,
    sourceType: 'accounting',
    sourceKey,
    reason,
    notified: result.notified,
    deduped: result.deduped,
    detail: result.reason || errorDetails,
  };
}

async function evaluateOperationalConnection(
  row: OperationalWatchRow,
  now: Date,
  graceMinutes: number,
  dedupeHours: number,
): Promise<WatchdogAlertResult | null> {
  const frequency = normalizeFrequency(row.syncFrequency);
  if (!row.autoSync || frequency === 'manual') return null;

  const sourceKey = `${row.provider}:${row.sourceCode}`;
  const companyName = row.company.name || row.companyId;
  const pullTime = readOperationalPullTime(row.connectionMetadata);
  const expectedAt = latestExpectedRunAt(now, frequency, pullTime);
  const lastSuccessAt = row.lastSyncAt;
  const status = String(row.status || '').toUpperCase();
  const errorMessage = asString(row.errorMessage);
  const isError = status === 'ERROR' || Boolean(errorMessage);
  const isOverdue = shouldAlertOverdue({
    now,
    lastSuccessAt,
    createdAt: row.createdAt,
    expectedAt,
    graceMinutes,
  });

  if (!isError && !isOverdue) return null;

  const reason: WatchdogAlertReason = isError ? 'error_state' : 'overdue';
  const errorSummary =
    reason === 'error_state'
      ? `Data load is in error for ${sourceKey}`
      : `Scheduled data load missed for ${sourceKey}`;
  const errorDetails =
    reason === 'error_state'
      ? errorMessage || `Connection status is ${status || 'unknown'}.`
      : `Expected run: ${formatIso(expectedAt)} (${pullTime} ${WATCHDOG_TIME_ZONE}, ${frequency}). Last successful load: ${formatIso(lastSuccessAt)}. ${describeGraceWindow(graceMinutes)}`;
  const alertKey = `${row.companyId}|${sourceKey}|${reason}|${errorSummary.toLowerCase()}`;
  const result = await notifyOperationalSystemAlert({
    row,
    reason,
    errorSummary,
    errorDetails,
    alertKey,
    dedupeHours,
  });

  return {
    companyId: row.companyId,
    companyName,
    sourceType: 'operational_system',
    sourceKey,
    reason,
    notified: result.notified,
    deduped: result.deduped,
    detail: result.detail || errorDetails,
  };
}

export async function runDataLoadWatchdog(options: {
  companyId?: string;
  now?: Date;
  limit?: number;
} = {}): Promise<WatchdogRunResult> {
  const now = options.now || new Date();
  const graceMinutes = resolveGraceMinutes();
  const dedupeHours = resolveDedupeHours();
  const companyFilter = options.companyId ? { companyId: options.companyId } : {};
  const take = options.limit && Number.isFinite(options.limit)
    ? Math.min(500, Math.max(1, Math.floor(options.limit)))
    : undefined;

  const [accountingRows, operationalRows] = await Promise.all([
    prisma.accountingConnection.findMany({
      where: {
        ...companyFilter,
        autoSync: true,
        syncFrequency: { not: 'manual' },
      },
      select: {
        id: true,
        companyId: true,
        platform: true,
        status: true,
        lastSyncAt: true,
        autoSync: true,
        syncFrequency: true,
        connectionMetadata: true,
        errorMessage: true,
        createdAt: true,
        company: { select: { name: true, accountingSystem: true } },
      },
      orderBy: { updatedAt: 'asc' },
      ...(take ? { take } : {}),
    }),
    prisma.operationalSystemConnection.findMany({
      where: {
        ...companyFilter,
        autoSync: true,
        syncFrequency: { not: 'manual' },
      },
      select: {
        id: true,
        companyId: true,
        provider: true,
        sourceCode: true,
        status: true,
        lastSyncAt: true,
        autoSync: true,
        syncFrequency: true,
        connectionMetadata: true,
        errorMessage: true,
        createdAt: true,
        company: { select: { name: true } },
      },
      orderBy: { updatedAt: 'asc' },
      ...(take ? { take } : {}),
    }),
  ]);

  const alerts: WatchdogAlertResult[] = [];
  for (const row of accountingRows as AccountingWatchRow[]) {
    const alert = await evaluateAccountingConnection(row, now, graceMinutes, dedupeHours);
    if (alert) alerts.push(alert);
  }
  for (const row of operationalRows as OperationalWatchRow[]) {
    const alert = await evaluateOperationalConnection(row, now, graceMinutes, dedupeHours);
    if (alert) alerts.push(alert);
  }

  return {
    ok: true,
    scannedAccountingConnections: accountingRows.length,
    scannedOperationalConnections: operationalRows.length,
    alerts,
    graceMinutes,
  };
}
