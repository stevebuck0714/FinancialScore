import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

const QBD_AUTO_QUEUE_TIME_ZONE = 'America/New_York';
const QBD_AUTO_QUEUE_DUE_LOOKBACK_HOURS = 4;

const QBD_AGING_SNAPSHOT_REQUESTS = new Set([
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
]);

const DEFAULT_STATIC_REQUESTS = [
  'AccountQuery',
  'ItemQuery',
  'BalanceSheetStandardReportQuery',
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
  'CheckQuery',
  'SalesReceiptQuery',
  'DepositQuery',
  'JournalEntryQuery',
  'VendorCreditQuery',
  'BillPaymentCheckQuery',
  'BillPaymentCreditCardQuery',
  'ReceivePaymentQuery',
];

const DEFAULT_MONTHLY_REQUESTS = [
  'GeneralDetailReportQuery',
];

type QbdAutoQueueResult = {
  companyId: string;
  companyName?: string | null;
  queued: boolean;
  skippedReason?: string;
  startDate?: string;
  endDate?: string;
  batchId?: string;
  jobCount?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasQuickBooksDesktopRequiredSetup(metadata: Record<string, unknown>): boolean {
  const settings = asRecord(metadata.quickbooksDesktopSettings);
  const credentials = asRecord(metadata.quickbooksDesktopCredentials);
  const requiredKeys = [
    'integrationType',
    'applicationName',
    'ownerId',
    'fileId',
    'webConnectorUsername',
    'desktopEditionYear',
    'countryVersion',
    'companyFilePath',
    'hostMachineName',
  ];
  if (requiredKeys.some((key) => !asString(settings[key]))) return false;
  if (asString(settings.integrationType) === 'WEB_CONNECTOR' && !asString(settings.soapEndpointUrl)) return false;
  return Boolean(asString(credentials.webConnectorPasswordEncrypted));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getLocalDateParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number.parseInt(String(map.year || '0'), 10),
    month: Number.parseInt(String(map.month || '0'), 10),
    day: Number.parseInt(String(map.day || '0'), 10),
    hour: Number.parseInt(String(map.hour || '0'), 10),
    minute: Number.parseInt(String(map.minute || '0'), 10),
  };
}

function normalizePullTime(value: unknown): string {
  if (typeof value !== 'string') return '08:00';
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '08:00';
}

function readQuickBooksDesktopPullTime(metadata: Record<string, unknown>): string {
  const direct = normalizePullTime(metadata.operationalPullTime);
  if (direct !== '08:00' || metadata.operationalPullTime === '08:00') return direct;

  const settings = asRecord(metadata.quickbooksDesktopSettings);
  const settingsTime = normalizePullTime(settings.syncTime);
  if (settingsTime !== '08:00' || settings.syncTime === '08:00') return settingsTime;

  return '08:00';
}

function localDateToUtc(parts: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function priorBusinessDateKey(localDate: { year: number; month: number; day: number }): string {
  const cursor = addUtcDays(localDateToUtc(localDate), -1);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dateKey(cursor);
}

function zonedLocalTimeToUtc(local: { year: number; month: number; day: number; hour: number; minute: number }): Date {
  const desiredWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  const guess = new Date(desiredWallClockMs);
  const actualAtGuess = new Intl.DateTimeFormat('en-US', {
    timeZone: QBD_AUTO_QUEUE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(guess);
  const actualMap = Object.fromEntries(actualAtGuess.map((part) => [part.type, part.value]));
  const actualWallClockMs = Date.UTC(
    Number(actualMap.year),
    Number(actualMap.month) - 1,
    Number(actualMap.day),
    Number(actualMap.hour),
    Number(actualMap.minute),
    0,
  );
  return new Date(guess.getTime() - (actualWallClockMs - desiredWallClockMs));
}

function resolveQbdAutoQueueTarget(params: {
  now: Date;
  pullTime: string;
  lastSyncAt?: Date | null;
}): { due: boolean; targetDate: string; expectedRunAt: Date; skippedReason?: string } {
  const [scheduledHour, scheduledMinute] = normalizePullTime(params.pullTime).split(':').map((value) => Number(value));
  const nowParts = getLocalDateParts(params.now, QBD_AUTO_QUEUE_TIME_ZONE);
  let scheduledLocalDate = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  let expectedRunAt = zonedLocalTimeToUtc({
    ...scheduledLocalDate,
    hour: scheduledHour,
    minute: scheduledMinute,
  });

  if (expectedRunAt.getTime() > params.now.getTime()) {
    const previousLocalDate = addUtcDays(localDateToUtc(scheduledLocalDate), -1);
    scheduledLocalDate = {
      year: previousLocalDate.getUTCFullYear(),
      month: previousLocalDate.getUTCMonth() + 1,
      day: previousLocalDate.getUTCDate(),
    };
    expectedRunAt = zonedLocalTimeToUtc({
      ...scheduledLocalDate,
      hour: scheduledHour,
      minute: scheduledMinute,
    });
  }

  const targetDate = priorBusinessDateKey(scheduledLocalDate);
  const msSinceExpected = params.now.getTime() - expectedRunAt.getTime();
  if (msSinceExpected > QBD_AUTO_QUEUE_DUE_LOOKBACK_HOURS * 60 * 60 * 1000) {
    return {
      due: false,
      targetDate,
      expectedRunAt,
      skippedReason: `QBD auto-queue window for ${targetDate} has passed.`,
    };
  }
  if (params.lastSyncAt && params.lastSyncAt.getTime() >= expectedRunAt.getTime()) {
    return {
      due: false,
      targetDate,
      expectedRunAt,
      skippedReason: `QBD auto-queue already ran for the scheduled ${expectedRunAt.toISOString()} window.`,
    };
  }

  return { due: true, targetDate, expectedRunAt };
}

function parseRequestName(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*Query$/.test(value.trim())
    ? value.trim()
    : '';
}

function enabledQbdRequestNames(metadata: Record<string, unknown>): string[] {
  const programs = Array.isArray(metadata.quickbooksDesktopPrograms)
    ? metadata.quickbooksDesktopPrograms
    : [];
  const fromPrograms = programs
    .map((program) => asRecord(program))
    .filter((program) => program.enabled !== false)
    .map((program) => parseRequestName(program.qbEntity))
    .filter(Boolean);
  return Array.from(new Set(fromPrograms.length > 0
    ? fromPrograms
    : [...DEFAULT_STATIC_REQUESTS, ...DEFAULT_MONTHLY_REQUESTS]));
}

function hasPendingQbdJobs(metadata: Record<string, unknown>): boolean {
  const headerJobs = asRecord(metadata.quickbooksDesktopBackfillJobs);
  const detailJobs = asRecord(metadata.quickbooksDesktopDetailBackfillJobs);
  return [...Object.values(headerJobs), ...Object.values(detailJobs)]
    .map((job) => asRecord(job))
    .some((job) => job.status === 'queued' || job.status === 'running');
}

function buildBusinessDayDateRanges(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const ranges: Array<{ startDate: string; endDate: string; windowIndex: number }> = [];
  const cursor = new Date(start);
  let windowIndex = 0;

  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const key = dateKey(cursor);
      ranges.push({ startDate: key, endDate: key, windowIndex });
      windowIndex += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return ranges;
}

function buildAutoFinancialJobSpecs(startDate: string, endDate: string, requestNames: string[]) {
  const unique = Array.from(new Set(requestNames));
  const monthlyRequests = unique.filter((requestName) => requestName === 'GeneralDetailReportQuery');
  const agingSnapshotRequests = unique.filter((requestName) => QBD_AGING_SNAPSHOT_REQUESTS.has(requestName));
  const staticRequests = unique.filter((requestName) =>
    requestName !== 'GeneralDetailReportQuery' &&
    !QBD_AGING_SNAPSHOT_REQUESTS.has(requestName)
  );
  const queuedDateRange = {
    mode: 'MANUAL',
    startDate,
    endDate,
    requestedAt: new Date().toISOString(),
  };
  const agingSnapshotDateRanges = buildBusinessDayDateRanges(startDate, endDate);

  return {
    queuedDateRange,
    enabledRequests: unique,
    jobSpecs: [
      ...staticRequests.map((requestName) => ({
        requestName,
        dateRange: queuedDateRange,
        windowIndex: 0,
      })),
      ...monthlyRequests.map((requestName) => ({
        requestName,
        dateRange: queuedDateRange,
        windowIndex: 0,
      })),
      ...agingSnapshotDateRanges.flatMap((range) =>
        agingSnapshotRequests.map((requestName) => ({
          requestName,
          processingMode: 'aging_snapshot' as const,
          dateRange: {
            ...queuedDateRange,
            startDate: range.startDate,
            endDate: range.endDate,
          },
          windowIndex: range.windowIndex,
        }))
      ),
    ],
  };
}

async function queueCompanyQbdFinancialJobs(params: {
  connectionId: string;
  companyId: string;
  companyName?: string | null;
  metadata: Record<string, unknown>;
  targetDate: string;
}): Promise<QbdAutoQueueResult> {
  if (hasPendingQbdJobs(params.metadata)) {
    return {
      companyId: params.companyId,
      companyName: params.companyName,
      queued: false,
      skippedReason: 'QBD Web Connector jobs are already queued or running.',
    };
  }

  const requestNames = enabledQbdRequestNames(params.metadata);
  if (requestNames.length === 0) {
    return {
      companyId: params.companyId,
      companyName: params.companyName,
      queued: false,
      skippedReason: 'No enabled QBD request domains.',
    };
  }

  const batchId = randomUUID();
  const now = new Date().toISOString();
  const { queuedDateRange, enabledRequests, jobSpecs } = buildAutoFinancialJobSpecs(
    params.targetDate,
    params.targetDate,
    requestNames,
  );
  if (jobSpecs.length === 0) {
    return {
      companyId: params.companyId,
      companyName: params.companyName,
      queued: false,
      skippedReason: 'No QBD jobs generated for target date.',
    };
  }

  const backfillJobs = Object.fromEntries(
    jobSpecs.map((job, index) => {
      const id = `${batchId}:${String(index + 1).padStart(3, '0')}:${String(job.windowIndex).padStart(3, '0')}:${job.requestName}`;
      return [
        id,
        {
          id,
          batchId,
          status: 'queued',
          requestName: job.requestName,
          ...(job.processingMode ? { processingMode: job.processingMode } : {}),
          windowIndex: job.windowIndex,
          dateRange: job.dateRange,
          createdAt: now,
          updatedAt: now,
          recordCount: 0,
          pageCount: 0,
          iteratorRemainingCount: null,
          lastError: null,
        },
      ];
    }),
  );

  await prisma.accountingConnection.update({
    where: { id: params.connectionId },
    data: {
      lastSyncAt: new Date(),
      errorMessage: null,
      connectionMetadata: {
        ...params.metadata,
        quickbooksDesktopQueuedDateRange: queuedDateRange,
        quickbooksDesktopBackfillBatchId: batchId,
        quickbooksDesktopBackfillJobs: backfillJobs,
        quickbooksDesktopBackfillResponses: {},
        quickbooksDesktopBackfillRequestNames: enabledRequests,
        quickbooksDesktopBackfillChunkByMonth: true,
        quickbooksDesktopBackfillAgingSnapshotGranularity: 'businessDay',
        quickbooksDesktopAutoQueuedAt: now,
        quickbooksDesktopAutoQueuedDate: params.targetDate,
      } as any,
    },
  });

  return {
    companyId: params.companyId,
    companyName: params.companyName,
    queued: true,
    startDate: params.targetDate,
    endDate: params.targetDate,
    batchId,
    jobCount: jobSpecs.length,
  };
}

export async function autoQueueDueQuickBooksDesktopFinancialJobs(now = new Date()): Promise<{
  targetDate: string;
  scanned: number;
  queued: number;
  skipped: number;
  results: QbdAutoQueueResult[];
}> {
  const fallbackTargetDate = priorBusinessDateKey(getLocalDateParts(now, QBD_AUTO_QUEUE_TIME_ZONE));
  const connections = await prisma.accountingConnection.findMany({
    where: {
      platform: 'QUICKBOOKS',
      status: 'ACTIVE',
      autoSync: true,
      syncFrequency: { not: 'manual' },
      accessToken: null,
    },
    select: {
      id: true,
      companyId: true,
      connectionMetadata: true,
      lastSyncAt: true,
      company: {
        select: {
          name: true,
          accountingSystem: true,
        },
      },
    },
    orderBy: { companyId: 'asc' },
  });

  const results: QbdAutoQueueResult[] = [];
  for (const connection of connections) {
    if (!isQuickBooksDesktopFamily(connection.company?.accountingSystem)) {
      continue;
    }
    const metadata = asRecord(connection.connectionMetadata);
    const queueTarget = resolveQbdAutoQueueTarget({
      now,
      pullTime: readQuickBooksDesktopPullTime(metadata),
      lastSyncAt: connection.lastSyncAt,
    });
    if (!queueTarget.due) {
      results.push({
        companyId: connection.companyId,
        companyName: connection.company?.name,
        queued: false,
        skippedReason: queueTarget.skippedReason,
      });
      continue;
    }
    if (!hasQuickBooksDesktopRequiredSetup(metadata)) {
      results.push({
        companyId: connection.companyId,
        companyName: connection.company?.name,
        queued: false,
        skippedReason: 'QuickBooks Desktop setup is incomplete; auto-queue requires an explicit connected setup.',
      });
      continue;
    }
    const previousAutoQueuedDate = typeof metadata.quickbooksDesktopAutoQueuedDate === 'string'
      ? metadata.quickbooksDesktopAutoQueuedDate
      : '';
    if (previousAutoQueuedDate === queueTarget.targetDate) {
      results.push({
        companyId: connection.companyId,
        companyName: connection.company?.name,
        queued: false,
        skippedReason: `QBD jobs already auto-queued for ${queueTarget.targetDate}.`,
      });
      continue;
    }
    results.push(await queueCompanyQbdFinancialJobs({
      connectionId: connection.id,
      companyId: connection.companyId,
      companyName: connection.company?.name,
      metadata,
      targetDate: queueTarget.targetDate,
    }));
  }

  return {
    targetDate: results.find((result) => result.startDate)?.startDate || fallbackTargetDate,
    scanned: connections.length,
    queued: results.filter((result) => result.queued).length,
    skipped: results.filter((result) => !result.queued).length,
    results,
  };
}
