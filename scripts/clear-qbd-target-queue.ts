import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

type JsonRecord = Record<string, any>;

const companyId = process.argv[2] || 'cmq6pjenb0001l5049udok08d';
const targetDate = process.argv[3] || '2026-07-19';
const apply = process.argv.includes('--apply');
const desiredSyncTime = '03:00';

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isTargetDateRange(dateRange: unknown): boolean {
  const range = asRecord(dateRange);
  return asString(range.startDate) === targetDate || asString(range.endDate) === targetDate;
}

function jobTouchesTarget(job: unknown): boolean {
  return isTargetDateRange(asRecord(job).dateRange);
}

function sessionTouchesTarget(session: unknown, jobs: JsonRecord): boolean {
  const row = asRecord(session);
  if (isTargetDateRange(row.dateRange)) return true;

  const sequence = Array.isArray(row.backfillJobSequence) ? row.backfillJobSequence : [];
  if (sequence.some((entry) => isTargetDateRange(asRecord(entry).dateRange))) return true;

  const ids = new Set<string>();
  const jobIds = asRecord(row.backfillJobIds);
  Object.values(jobIds).forEach((value) => {
    const id = asString(value);
    if (id) ids.add(id);
  });
  const singleJobId = asString(row.backfillJobId);
  if (singleJobId) ids.add(singleJobId);

  return Array.from(ids).some((id) => jobTouchesTarget(jobs[id]));
}

function cancelTargetJobs(jobsValue: unknown, now: string) {
  const jobs = asRecord(jobsValue);
  let cancelled = 0;
  const nextJobs = Object.fromEntries(
    Object.entries(jobs).map(([id, value]) => {
      const job = asRecord(value);
      const status = asString(job.status).toLowerCase();
      if (!jobTouchesTarget(job) || (status !== 'queued' && status !== 'running')) {
        return [id, value];
      }
      cancelled += 1;
      const { ticket, completedAt, ...rest } = job;
      return [
        id,
        {
          ...rest,
          status: 'failed',
          failedAt: now,
          updatedAt: now,
          iteratorRemainingCount: null,
          lastError: `Cancelled by admin remediation; ${targetDate} is a weekend QBD target and should not sync.`,
        },
      ];
    }),
  );
  return { nextJobs, cancelled };
}

async function main() {
  const { default: prisma } = await import('../lib/prisma');
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Company not found: ${companyId}`);

  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'QUICKBOOKS',
      },
    },
    select: {
      id: true,
      status: true,
      autoSync: true,
      syncFrequency: true,
      lastSyncAt: true,
      connectionMetadata: true,
    },
  });
  if (!connection) throw new Error(`QuickBooks connection not found for ${companyId}`);

  const metadata = asRecord(connection.connectionMetadata);
  const now = new Date().toISOString();
  const header = cancelTargetJobs(metadata.quickbooksDesktopBackfillJobs, now);
  const detail = cancelTargetJobs(metadata.quickbooksDesktopDetailBackfillJobs, now);
  const sessions = asRecord(metadata.quickbooksDesktopWebConnectorSessions);
  const remainingSessions = Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => !sessionTouchesTarget(session, header.nextJobs)),
  );
  const removedSessionCount = Object.keys(sessions).length - Object.keys(remainingSessions).length;
  const queuedDateRangeCleared = isTargetDateRange(metadata.quickbooksDesktopQueuedDateRange);
  const settings = {
    ...asRecord(metadata.quickbooksDesktopSettings),
    syncTime: desiredSyncTime,
  };

  const nextMetadata = {
    ...metadata,
    operationalPullTime: desiredSyncTime,
    operationalScheduleUpdatedAt: now,
    quickbooksDesktopSettings: settings,
    quickbooksDesktopQueuedDateRange: queuedDateRangeCleared ? null : metadata.quickbooksDesktopQueuedDateRange,
    quickbooksDesktopBackfillJobs: header.nextJobs,
    quickbooksDesktopDetailBackfillJobs: detail.nextJobs,
    quickbooksDesktopWebConnectorSessions: remainingSessions,
    quickbooksDesktopQueueRemediation: {
      targetDate,
      remediatedAt: now,
      headerJobsCancelled: header.cancelled,
      detailJobsCancelled: detail.cancelled,
      sessionsRemoved: removedSessionCount,
      queuedDateRangeCleared,
      syncTimeSetTo: desiredSyncTime,
    },
  };

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    company,
    connection: {
      status: connection.status,
      autoSync: connection.autoSync,
      syncFrequency: connection.syncFrequency,
      lastSyncAt: connection.lastSyncAt,
    },
    targetDate,
    headerJobsCancelled: header.cancelled,
    detailJobsCancelled: detail.cancelled,
    sessionsRemoved: removedSessionCount,
    queuedDateRangeCleared,
    previousSyncTime: asString(asRecord(metadata.quickbooksDesktopSettings).syncTime) || null,
    previousOperationalPullTime: asString(metadata.operationalPullTime) || null,
    nextSyncTime: desiredSyncTime,
  }, null, 2));

  if (!apply) {
    await prisma.$disconnect();
    return;
  }

  await prisma.accountingConnection.update({
    where: { id: connection.id },
    data: {
      connectionMetadata: nextMetadata,
      errorMessage: null,
    },
  });

  console.log(`Applied QBD queue remediation for ${company.name} (${company.id}).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
