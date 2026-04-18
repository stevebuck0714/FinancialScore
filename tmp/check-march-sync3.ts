import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Check InforSyncRun for March
  const runs = await prisma.$queryRawUnsafe<Array<{
    id: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    taskCount: number | null;
    errorCount: number | null;
  }>>(`
    SELECT id, status, "startedAt", "finishedAt", "taskCount", "errorCount"
    FROM "InforSyncRun"
    WHERE "companyId" = $1
      AND "createdAt" >= '2026-02-15'::date
      AND "createdAt" <= '2026-04-16'::date
    ORDER BY "createdAt" DESC
    LIMIT 50
  `, CID);

  console.log(`=== Sync Runs (Feb 15 - Apr 16) ===`);
  console.log(`Found: ${runs.length}\n`);
  for (const r of runs) {
    const start = r.startedAt?.toISOString().slice(0, 16) || '?';
    const marker = r.status === 'done' ? '✅' : r.status === 'failed' ? '❌' : '⏳';
    console.log(`  ${marker} ${start}  status=${r.status}  tasks=${r.taskCount ?? '?'}  errors=${r.errorCount ?? '?'}  id=${r.id.slice(0,12)}`);
  }

  // Check for failed tasks with GL-related payloads
  const failedTasks = await prisma.$queryRawUnsafe<Array<{
    id: string;
    status: string;
    payload: any;
    lastError: string | null;
    createdAt: Date;
  }>>(`
    SELECT id, status, payload, "lastError", "createdAt"
    FROM "InforSyncTask"
    WHERE "companyId" = $1
      AND status IN ('failed', 'cancelled')
      AND "createdAt" >= '2026-02-15'::date
      AND "createdAt" <= '2026-04-16'::date
    ORDER BY "createdAt" DESC
    LIMIT 50
  `, CID);

  console.log(`\n=== Failed/Cancelled Tasks (Feb 15 - Apr 16) ===`);
  console.log(`Found: ${failedTasks.length}\n`);
  for (const t of failedTasks) {
    const date = t.createdAt?.toISOString().slice(0, 16) || '?';
    const prog = t.payload?.miProgram || t.payload?.program || JSON.stringify(t.payload).slice(0, 60);
    const err = t.lastError ? t.lastError.slice(0, 80) : '';
    console.log(`  ❌ ${date}  program=${prog}  status=${t.status}`);
    if (err) console.log(`     error: ${err}`);
  }

  // GL entries on 30100 by week
  console.log('\n=== GL entries on 30100 by week (Feb-Mar) ===');
  const weekly = await prisma.$queryRawUnsafe<Array<{ week: string; cnt: bigint; net: number }>>(`
    SELECT date_trunc('week', "transDate")::date::text as week,
           COUNT(*) as cnt,
           COALESCE(SUM("signedAmount"), 0) as net
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" >= '2026-02-01'::date
      AND "transDate" <= '2026-03-31'::date
    GROUP BY 1
    ORDER BY 1
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
    WHERE "companyId" = $1
      AND "miProgram" ILIKE '%gltrans%'
      AND "createdAt" >= '2026-02-01'::date
      AND "createdAt" <= '2026-04-16'::date
    GROUP BY 1 ORDER BY 1
  `, CID);
  for (const w of rawWeekly) {
    console.log(`  ${w.week}: ${String(w.cnt).padStart(6)} raw records`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
