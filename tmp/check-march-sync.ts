import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Check sync task logs for March 2026
  const tasks = await prisma.$queryRawUnsafe<Array<{
    id: string;
    status: string;
    miProgram: string;
    startedAt: Date;
    completedAt: Date | null;
    error: string | null;
    recordsSynced: number | null;
    totalRecords: number | null;
  }>>(`
    SELECT id, status, "miProgram", "startedAt", "completedAt", error,
           "recordsSynced", "totalRecords"
    FROM "SyncTask"
    WHERE "companyId" = $1
      AND "miProgram" ILIKE '%gltrans%'
      AND "startedAt" >= '2026-02-15'::date
      AND "startedAt" <= '2026-04-15'::date
    ORDER BY "startedAt" DESC
  `, CID);

  console.log(`=== SLGLTRANS Sync Tasks (Feb 15 - Apr 15, 2026) ===`);
  console.log(`Total tasks found: ${tasks.length}\n`);

  let failCount = 0;
  let successCount = 0;
  for (const t of tasks) {
    const status = String(t.status).toUpperCase();
    const date = t.startedAt?.toISOString().slice(0, 16) || '?';
    const synced = t.recordsSynced ?? '?';
    const total = t.totalRecords ?? '?';
    const err = t.error ? t.error.slice(0, 120) : '';
    if (status !== 'COMPLETED' && status !== 'SUCCESS') failCount++;
    else successCount++;
    const marker = (status !== 'COMPLETED' && status !== 'SUCCESS') ? '❌' : '✅';
    console.log(`  ${marker} ${date}  status=${status}  synced=${synced}/${total}  ${err}`);
  }
  console.log(`\nSummary: ${successCount} succeeded, ${failCount} failed/other\n`);

  // Also check for ANY failed sync tasks in March (all programs)
  const allFailed = await prisma.$queryRawUnsafe<Array<{
    miProgram: string;
    status: string;
    cnt: bigint;
  }>>(`
    SELECT "miProgram", status, COUNT(*) as cnt
    FROM "SyncTask"
    WHERE "companyId" = $1
      AND "startedAt" >= '2026-03-01'::date
      AND "startedAt" <= '2026-03-31'::date
      AND status NOT IN ('COMPLETED', 'SUCCESS', 'completed', 'success')
    GROUP BY "miProgram", status
    ORDER BY cnt DESC
  `, CID);

  if (allFailed.length > 0) {
    console.log('=== All Failed/Non-Complete Sync Tasks in March 2026 ===');
    for (const f of allFailed) {
      console.log(`  ${f.miProgram}: ${f.status} x${f.cnt}`);
    }
  } else {
    console.log('=== No failed sync tasks found in March 2026 ===');
  }

  // Check GL entry date coverage — are there date gaps?
  console.log('\n=== GL entries on 30100 by week in Feb-Mar 2026 ===');
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
  for (const w of weekly) {
    console.log(`  ${w.week}: ${String(w.cnt).padStart(4)} entries  net: $${Number(w.net).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  }

  // Check InforRawRecord coverage for SLGLTRANS in March
  console.log('\n=== InforRawRecord entries for SLGLTRANS by week (March 2026) ===');
  const rawWeekly = await prisma.$queryRawUnsafe<Array<{ week: string; cnt: bigint }>>(`
    SELECT date_trunc('week', "createdAt")::date::text as week,
           COUNT(*) as cnt
    FROM "InforRawRecord"
    WHERE "companyId" = $1
      AND "miProgram" ILIKE '%gltrans%'
      AND "createdAt" >= '2026-02-15'::date
      AND "createdAt" <= '2026-04-15'::date
    GROUP BY 1
    ORDER BY 1
  `, CID);
  for (const w of rawWeekly) {
    console.log(`  ${w.week}: ${String(w.cnt).padStart(6)} raw records`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
