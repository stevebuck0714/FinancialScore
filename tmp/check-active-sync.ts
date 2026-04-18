import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Check InforSyncRun for recent runs
  const runs = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    mode: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>>`
    SELECT id, status, mode, "createdAt", "updatedAt"
    FROM "InforSyncRun"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;
  console.log('Recent InforSyncRun entries:');
  for (const r of runs) {
    console.log(`  ${r.createdAt.toISOString().slice(0, 19)} status=${r.status} mode=${r.mode} id=${r.id.slice(0, 12)}`);
  }

  // Check InforSyncTask for active tasks
  const tasks = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    runId: string;
    payload: string;
  }>>`
    SELECT t.id, t.status, t."runId", LEFT(t.payload::text, 300) AS payload
    FROM "InforSyncTask" t
    JOIN "InforSyncRun" r ON r.id = t."runId"
    WHERE r."companyId" = ${companyId}
    ORDER BY t."createdAt" DESC
    LIMIT 10
  `;
  console.log('\nRecent InforSyncTask entries:');
  for (const t of tasks) {
    console.log(`  status=${t.status} run=${t.runId.slice(0, 12)} payload=${t.payload.slice(0, 200)}`);
  }

  // Check recent raw batches from last hour
  const batches = await prisma.$queryRaw<Array<{
    module: string;
    miProgram: string;
    batchCount: number;
    totalRecords: number;
    syncRunId: string;
  }>>`
    SELECT module, "miProgram", COUNT(*)::int AS "batchCount",
           SUM("recordCount")::int AS "totalRecords",
           "syncRunId"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND "createdAt" >= NOW() - INTERVAL '1 hour'
    GROUP BY module, "miProgram", "syncRunId"
    ORDER BY MAX("createdAt") DESC
  `;
  console.log('\nRaw batches in last hour:');
  for (const b of batches) {
    console.log(`  ${b.module}/${b.miProgram}: ${b.batchCount} batches, ${b.totalRecords} records (run=${b.syncRunId.slice(0, 12)})`);
  }
  if (batches.length === 0) console.log('  (none)');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
