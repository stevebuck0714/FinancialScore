import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Sync runs in Feb-Apr
  const runs = await prisma.$queryRawUnsafe<Array<{
    id: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    chunkCount: number;
    recordsCreated: number;
    warningCount: number;
    lastError: string | null;
  }>>(`
    SELECT id, status, "startedAt", "finishedAt", "chunkCount",
           "recordsCreated", "warningCount", "lastError"
    FROM "InforSyncRun"
    WHERE "companyId" = $1
      AND "createdAt" >= '2026-02-15'::date
      AND "createdAt" <= '2026-04-16'::date
    ORDER BY "createdAt" DESC
    LIMIT 60
  `, CID);

  console.log(`=== Sync Runs (Feb 15 - Apr 16) — ${runs.length} found ===\n`);
  let failedRuns = 0;
  for (const r of runs) {
    const start = r.startedAt?.toISOString().slice(0, 16) || '?';
    const isFail = r.status === 'failed' || r.status === 'cancelled';
    if (isFail) failedRuns++;
    const marker = r.status === 'done' ? '✅' : isFail ? '❌' : '⏳';
    const err = r.lastError ? `  err: ${r.lastError.slice(0, 80)}` : '';
    console.log(`  ${marker} ${start}  ${r.status.padEnd(10)}  chunks=${r.chunkCount}  records=${r.recordsCreated}  warns=${r.warningCount}${err}`);
  }
  console.log(`\nFailed/cancelled runs: ${failedRuns}/${runs.length}`);

  // Failed tasks with errors
  const failedTasks = await prisma.$queryRawUnsafe<Array<{
    status: string;
    payload: any;
    lastError: string | null;
    createdAt: Date;
    attemptCount: number;
  }>>(`
    SELECT status, payload, "lastError", "createdAt", "attemptCount"
    FROM "InforSyncTask"
    WHERE "companyId" = $1
      AND status IN ('failed', 'cancelled')
      AND "createdAt" >= '2026-02-15'::date
      AND "createdAt" <= '2026-04-16'::date
    ORDER BY "createdAt" DESC
    LIMIT 30
  `, CID);

  console.log(`\n=== Failed/Cancelled Tasks — ${failedTasks.length} found ===\n`);
  for (const t of failedTasks) {
    const date = t.createdAt?.toISOString().slice(0, 16) || '?';
    const prog = t.payload?.miProgram || t.payload?.program || '?';
    const err = t.lastError ? t.lastError.slice(0, 100) : '(no error msg)';
    console.log(`  ❌ ${date}  program=${prog}  attempts=${t.attemptCount}  status=${t.status}`);
    console.log(`     ${err}`);
  }

  // GL on 30100 by week
  console.log('\n=== GL entries on 30100 by week (Feb-Mar) ===');
  const weekly = await prisma.$queryRawUnsafe<Array<{ week: string; cnt: bigint; net: number }>>(`
    SELECT date_trunc('week', "transDate")::date::text as week,
           COUNT(*) as cnt, COALESCE(SUM("signedAmount"), 0) as net
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" >= '2026-02-01' AND "transDate" <= '2026-03-31'
    GROUP BY 1 ORDER BY 1
  `, CID);
  console.log(`${'Week'.padEnd(14)} ${'Count'.padStart(6)} ${'GL Net'.padStart(16)} ${'AP Change'.padStart(16)}`);
  for (const w of weekly) {
    const net = Number(w.net);
    console.log(`${w.week.padEnd(14)} ${String(w.cnt).padStart(6)} ${net.toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${(-net).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }

  // Raw SLGLTRANS records by week
  console.log('\n=== InforRawRecord for SLGLTRANS by week ===');
  const rawWeekly = await prisma.$queryRawUnsafe<Array<{ week: string; cnt: bigint }>>(`
    SELECT date_trunc('week', "createdAt")::date::text as week, COUNT(*) as cnt
    FROM "InforRawRecord"
    WHERE "companyId" = $1 AND "miProgram" ILIKE '%gltrans%'
      AND "createdAt" >= '2026-02-01' AND "createdAt" <= '2026-04-16'
    GROUP BY 1 ORDER BY 1
  `, CID);
  for (const w of rawWeekly) {
    console.log(`  ${w.week}: ${String(w.cnt).padStart(6)} raw records`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
