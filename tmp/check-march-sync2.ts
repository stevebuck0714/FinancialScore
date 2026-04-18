import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Check InforSyncTask for SLGLTRANS in Feb-Apr
  const tasks = await prisma.$queryRawUnsafe<Array<{
    id: string;
    status: string;
    miProgram: string;
    createdAt: Date;
    recordCount: number | null;
    errorMessage: string | null;
  }>>(`
    SELECT t.id, t.status, t."miProgram", t."createdAt", t."recordCount", t."errorMessage"
    FROM "InforSyncTask" t
    WHERE t."companyId" = $1
      AND t."miProgram" ILIKE '%gltrans%'
      AND t."createdAt" >= '2026-02-15'::date
      AND t."createdAt" <= '2026-04-16'::date
    ORDER BY t."createdAt" DESC
    LIMIT 100
  `, CID);

  console.log(`=== SLGLTRANS Sync Tasks (Feb 15 - Apr 16) ===`);
  console.log(`Found: ${tasks.length}\n`);

  let failCount = 0;
  for (const t of tasks) {
    const status = String(t.status);
    const date = t.createdAt?.toISOString().slice(0, 16) || '?';
    const records = t.recordCount ?? '?';
    const err = t.errorMessage ? t.errorMessage.slice(0, 100) : '';
    const isFail = !['COMPLETED', 'completed', 'SUCCESS', 'success', 'DONE', 'done'].includes(status);
    if (isFail) failCount++;
    const marker = isFail ? '❌' : '✅';
    console.log(`  ${marker} ${date}  status=${status}  records=${records}  ${err}`);
  }
  console.log(`\nFailed/incomplete: ${failCount}/${tasks.length}\n`);

  // Check ALL failed tasks in March regardless of program
  const marchFailed = await prisma.$queryRawUnsafe<Array<{
    miProgram: string;
    status: string;
    cnt: bigint;
  }>>(`
    SELECT "miProgram", status, COUNT(*) as cnt
    FROM "InforSyncTask"
    WHERE "companyId" = $1
      AND "createdAt" >= '2026-03-01'::date
      AND "createdAt" <= '2026-03-31'::date
      AND status NOT IN ('COMPLETED', 'completed', 'SUCCESS', 'success', 'DONE', 'done')
    GROUP BY "miProgram", status
    ORDER BY cnt DESC
  `, CID);

  if (marchFailed.length > 0) {
    console.log('=== Failed/Non-Complete Tasks in March (all programs) ===');
    for (const f of marchFailed) {
      console.log(`  ${f.miProgram}: ${f.status} x${f.cnt}`);
    }
  } else {
    console.log('No failed tasks in March.');
  }

  // GL entries by week on 30100
  console.log('\n=== GL entries on 30100 by week (Feb-Mar 2026) ===');
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
  console.log(`${'Week'.padEnd(14)} ${'Count'.padStart(6)} ${'Net'.padStart(16)} ${'AP Change'.padStart(16)}`);
  for (const w of weekly) {
    const net = Number(w.net);
    console.log(`${w.week.padEnd(14)} ${String(w.cnt).padStart(6)} ${net.toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${(-net).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }

  // Raw record coverage for SLGLTRANS
  console.log('\n=== InforRawRecord for SLGLTRANS by week (Feb-Apr) ===');
  const rawWeekly = await prisma.$queryRawUnsafe<Array<{ week: string; cnt: bigint }>>(`
    SELECT date_trunc('week', "createdAt")::date::text as week,
           COUNT(*) as cnt
    FROM "InforRawRecord"
    WHERE "companyId" = $1
      AND "miProgram" ILIKE '%gltrans%'
      AND "createdAt" >= '2026-02-01'::date
      AND "createdAt" <= '2026-04-16'::date
    GROUP BY 1
    ORDER BY 1
  `, CID);
  for (const w of rawWeekly) {
    console.log(`  ${w.week}: ${String(w.cnt).padStart(6)} raw records`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
