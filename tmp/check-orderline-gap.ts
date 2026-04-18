import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // 1. Latest sync run tasks
  const latestRun = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "InforSyncRun"
    WHERE "companyId" = ${companyId} AND status = 'done'
    ORDER BY "createdAt" DESC LIMIT 1`;
  if (!latestRun.length) { console.log('No runs'); return; }
  const runId = latestRun[0].id;
  console.log(`Latest done run: ${runId}`);

  const tasks = await prisma.$queryRaw<Array<{ id: string; status: string; attempts: number; payload: string }>>`
    SELECT id, status, "attemptCount"::int AS attempts, LEFT(payload::text, 300) AS payload
    FROM "InforSyncTask"
    WHERE "runId" = ${runId}
    ORDER BY id
    LIMIT 30`;
  console.log(`\nTasks for this run: ${tasks.length}`);
  for (const t of tasks) {
    console.log(`  ${t.id.slice(0,8)} status=${t.status} attempts=${t.attempts}`);
    console.log(`    ${t.payload}`);
  }

  // 2. Count tasks by status for recent runs
  const taskStats = await prisma.$queryRaw<Array<{ runId: string; status: string; cnt: number }>>`
    SELECT t."runId", t.status, COUNT(*)::int AS cnt
    FROM "InforSyncTask" t
    INNER JOIN "InforSyncRun" r ON r.id = t."runId"
    WHERE r."companyId" = ${companyId}
      AND r."createdAt" >= NOW() - INTERVAL '7 days'
    GROUP BY t."runId", t.status
    ORDER BY t."runId" DESC, t.status
    LIMIT 30`;
  console.log('\n=== Task status counts for recent runs ===');
  for (const r of taskStats) {
    console.log(`  run=${r.runId.slice(0,8)} ${r.status}: ${r.cnt}`);
  }

  // 3. Completeness entries for recent runs
  const comp = await prisma.$queryRaw<Array<{ runId: string; sk: string; bd: Date; complete: boolean; msg: string | null }>>`
    SELECT "syncRunId" AS "runId", "sourceKey" AS sk, "businessDate" AS bd, "isComplete" AS complete, LEFT("statusMessage", 80) AS msg
    FROM "InforRawCompleteness"
    WHERE "companyId" = ${companyId}
    ORDER BY "updatedAt" DESC
    LIMIT 20`;
  console.log('\n=== Recent InforRawCompleteness ===');
  for (const r of comp) {
    console.log(`  run=${r.runId?.slice(0,8) || '?'} ${new Date(r.bd).toISOString().slice(0,10)} key=${r.sk} complete=${r.complete} ${r.msg || ''}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
