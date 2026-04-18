/**
 * WATCH JAN 2024 PROBE BACKFILL
 *
 * Polls the InforSyncRun / InforSyncTask tables every ~5s and prints a
 * compact progress report. Exits when the latest matching run reaches a
 * terminal state (done / cancelled / errored).
 *
 * Match rule for "the run we care about":
 *   - companyId = COMPANY
 *   - mode = 'business_day_backfill'
 *   - startDate within Jan 1–31, 2024 (or no-window if mode is auto)
 *   - createdAt within last 30 minutes
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const POLL_MS = 5000;

function ts(): string { return new Date().toISOString().slice(11, 19); }

async function findActiveProbeRun() {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, mode, frequency, "startDate", "endDate",
            "chunkCount", "startedAt", "finishedAt", "createdAt", message
       FROM "InforSyncRun"
      WHERE "companyId"=$1
        AND "createdAt" > NOW() - INTERVAL '30 minutes'
        AND mode='business_day_backfill'
        AND "startDate" >= '2023-12-01'
        AND "startDate" <  '2024-02-01'
      ORDER BY "createdAt" DESC
      LIMIT 1`,
    COMPANY
  );
  return rows[0] || null;
}

async function getTaskBreakdown(runId: string) {
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT status, COUNT(*)::int AS n
       FROM "InforSyncTask"
      WHERE "runId"=$1
      GROUP BY status
      ORDER BY status`,
    runId
  );
}

async function getRecordCount(runId: string) {
  // Count raw records inserted within this run's window.
  // We use the run's startedAt as a lower bound on InforRawRecord.createdAt.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n
       FROM "InforRawRecord" rr
      WHERE rr."companyId" = (SELECT "companyId" FROM "InforSyncRun" WHERE id=$1)
        AND rr."miProgram" ILIKE 'SLArtrans'
        AND rr."createdAt" >= (SELECT COALESCE("startedAt","createdAt") FROM "InforSyncRun" WHERE id=$1)`,
    runId
  );
  return rows[0]?.n ?? 0;
}

async function getRecentTaskErrors(runId: string) {
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, "attemptCount", "lastError"
       FROM "InforSyncTask"
      WHERE "runId"=$1 AND ("lastError" IS NOT NULL AND "lastError" <> '')
      ORDER BY "updatedAt" DESC
      LIMIT 3`,
    runId
  );
}

async function main() {
  const dburl = process.env.DATABASE_URL || '';
  console.log(`[${ts()}] DB:`, dburl.replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log(`[${ts()}] Watching for Jan 2024 business_day_backfill run on company ${COMPANY}...`);

  let runId: string | null = null;
  let lastChunkCount = -1;
  let lastTaskBreakdown = '';
  const startTimer = Date.now();
  const FIND_TIMEOUT_MS = 5 * 60 * 1000; // 5 min to find the run

  while (true) {
    const run = await findActiveProbeRun();
    if (!run) {
      const waited = ((Date.now() - startTimer) / 1000).toFixed(0);
      if (Date.now() - startTimer > FIND_TIMEOUT_MS) {
        console.log(`[${ts()}] Timed out waiting ${waited}s for the run to appear. Was it actually started?`);
        return;
      }
      console.log(`[${ts()}] (no matching run yet, waited ${waited}s)`);
      await new Promise(r => setTimeout(r, POLL_MS));
      continue;
    }
    if (run.id !== runId) {
      runId = run.id;
      console.log(`[${ts()}] Found run: ${runId}  status=${run.status}  startDate=${run.startDate?.toISOString().slice(0,10)}  endDate=${run.endDate?.toISOString().slice(0,10)}`);
    }

    const tasks = await getTaskBreakdown(runId);
    const taskBreakdown = tasks.map(t => `${t.status}=${t.n}`).join(' ');
    const rawCount = await getRecordCount(runId);

    if (run.chunkCount !== lastChunkCount || taskBreakdown !== lastTaskBreakdown) {
      const elapsedSec = run.startedAt
        ? Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)
        : 0;
      console.log(
        `[${ts()}] status=${run.status}  chunks=${run.chunkCount ?? 0}  tasks{ ${taskBreakdown} }  raw_artrans_records=${rawCount}  elapsed=${elapsedSec}s`
      );
      lastChunkCount = run.chunkCount ?? 0;
      lastTaskBreakdown = taskBreakdown;
    }

    if (run.status === 'done' || run.status === 'cancelled' || run.status === 'errored' || run.status === 'failed') {
      console.log(`\n[${ts()}] === FINAL ===`);
      console.log(`Run ${runId}: ${run.status}`);
      console.log(`Chunks: ${run.chunkCount ?? 0}`);
      console.log(`Total elapsed: ${run.startedAt && run.finishedAt
        ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) + 's'
        : 'n/a'}`);
      const finalTasks = await getTaskBreakdown(runId);
      console.log('Task final breakdown:', finalTasks.map(t => `${t.status}=${t.n}`).join(' '));

      const errors = await getRecentTaskErrors(runId);
      if (errors.length > 0) {
        console.log('\nRecent task errors:');
        for (const e of errors) {
          console.log(`  task ${e.id}  status=${e.status}  attempts=${e.attemptCount}`);
          console.log(`    error: ${(e.lastError || '').slice(0, 240)}`);
        }
      }

      // Snapshot landed?
      const snaps = await prisma.$queryRawUnsafe<any[]>(
        `SELECT date_trunc('day',"snapshotDate")::date AS day,
                COUNT(*) FILTER (WHERE "amountDueHome">0)::int AS rows_open,
                COALESCE(SUM("amountDueHome") FILTER (WHERE "amountDueHome">0),0)::float8 AS open_total
           FROM "AROpenInvoiceSnapshot"
          WHERE "companyId"=$1
            AND frequency='daily'
            AND "snapshotDate" >= '2024-01-01' AND "snapshotDate" < '2024-02-01'
          GROUP BY 1 ORDER BY 1`,
        COMPANY
      );
      console.log('\nAR snapshots written for Jan 2024:');
      for (const s of snaps) {
        console.log(`  ${s.day.toISOString().slice(0,10)}  rows_open=${s.rows_open}  total=$${Number(s.open_total).toLocaleString(undefined,{maximumFractionDigits:0})}`);
      }

      // SLArtrans raw events landed by RecordDate.
      const rawByMonth = await prisma.$queryRawUnsafe<any[]>(
        `SELECT date_trunc('month', (payload->>'RecordDate')::timestamp)::date AS mo,
                COUNT(*)::int AS n
           FROM "InforRawRecord"
          WHERE "companyId"=$1
            AND "miProgram" ILIKE 'SLArtrans'
            AND payload->>'RecordDate' IS NOT NULL
            AND (payload->>'RecordDate')::timestamp >= '2023-12-01'
            AND (payload->>'RecordDate')::timestamp <  '2024-03-01'
          GROUP BY 1 ORDER BY 1`,
        COMPANY
      );
      console.log('\nSLArtrans raw events present (RecordDate, Dec 2023–Feb 2024):');
      for (const r of rawByMonth) {
        console.log(`  ${r.mo.toISOString().slice(0,7)}  events=${r.n}`);
      }
      return;
    }

    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
