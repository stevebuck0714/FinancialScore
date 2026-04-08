import 'dotenv/config';
import prisma from '../lib/prisma';
import { startQueueRun, processQueueTick, getQueueRunById } from '../lib/infor-m3/sync-queue';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const SITE = process.argv[3] || 'MAIN';
const START_DATE = process.argv[4] || '2026-01-05';
const END_DATE = process.argv[5] || '2026-01-08';
const BASE_URL = process.argv[6] || 'http://localhost:3000';
const WORKER_SECRET = String(process.env.CRON_SECRET || '').trim();

async function cancelActiveRuns(companyId: string) {
  const now = new Date();
  const activeRuns = await prisma.inforSyncRun.findMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
      status: { in: ['queued', 'running'] },
    },
    select: { id: true },
  });
  const runIds = activeRuns.map((row) => row.id);
  if (runIds.length === 0) return [];
  await prisma.$transaction([
    prisma.inforSyncRun.updateMany({
      where: { id: { in: runIds } },
      data: {
        status: 'cancelled',
        message: 'Cancelled by repro script.',
        finishedAt: now,
        updatedAt: now,
      },
    }),
    prisma.inforSyncTask.updateMany({
      where: {
        runId: { in: runIds },
        status: { in: ['pending', 'leased'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    }),
  ]);
  return runIds;
}

async function inspectSlVchHdrs(companyId: string, syncRunId: string) {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "businessDate",
      "endpointPath",
      "pageNo",
      "bookmarkIn",
      "bookmarkOut",
      "recordCount",
      status,
      "createdAt"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND "syncRunId" = ${syncRunId}
      AND UPPER(COALESCE("miProgram", '')) = 'SLVCHHDRS'
    ORDER BY "businessDate" ASC, "pageNo" ASC, "createdAt" ASC
  `;

  const legacyRows = rows.filter((row) => {
    const endpointPath = String(row.endpointPath || '');
    const bookmarkIn = String(row.bookmarkIn || '');
    const bookmarkOut = String(row.bookmarkOut || '');
    return (
      !/RecordDate/i.test(endpointPath) ||
      /Voucher\s*,\s*VendNum/i.test(endpointPath) ||
      /Voucher\s*,\s*VendNum/i.test(bookmarkIn) ||
      /Voucher\s*,\s*VendNum/i.test(bookmarkOut)
    );
  });

  return {
    totalRows: rows.length,
    legacyRowCount: legacyRows.length,
    sample: rows.slice(0, 12),
    legacySample: legacyRows.slice(0, 12),
  };
}

async function main() {
  if (!WORKER_SECRET) {
    throw new Error('CRON_SECRET is required in the environment for queue repro.');
  }

  const cancelledRunIds = await cancelActiveRuns(COMPANY_ID);
  const started = await startQueueRun({
    companyId: COMPANY_ID,
    platform: 'INFOR_M3',
    frequency: 'daily',
    site: SITE,
    mode: 'business_day_backfill',
    startDate: `${START_DATE}T00:00:00.000Z`,
    endDate: `${END_DATE}T00:00:00.000Z`,
    workerBaseUrl: BASE_URL,
  });
  const syncRunId = started.run.id;

  const tickSummaries: Array<Record<string, unknown>> = [];
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const tick = await processQueueTick(`${BASE_URL}/api/cron/process-infor-sync-runs`, WORKER_SECRET);
    const run = await getQueueRunById(COMPANY_ID, syncRunId);
    tickSummaries.push({
      attempt,
      leasedTasks: tick.leasedTasks,
      promotedRuns: tick.promotedRuns,
      elapsedMs: tick.elapsedMs,
      runStatus: run?.status || null,
      chunkCount: run?.chunkCount || 0,
      recordsCreated: run?.recordsCreated || 0,
      message: run?.message || null,
      lastError: run?.lastError || null,
    });
    if (!run || ['done', 'failed', 'cancelled'].includes(String(run.status))) {
      break;
    }
  }

  const finalRun = await getQueueRunById(COMPANY_ID, syncRunId);
  const slvchhdrs = await inspectSlVchHdrs(COMPANY_ID, syncRunId);

  console.log(
    JSON.stringify(
      {
        cancelledRunIds,
        started: {
          alreadyRunning: started.alreadyRunning,
          queued: started.queued,
          syncRunId,
        },
        finalRun,
        tickSummaries,
        slvchhdrs,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
