import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Check for any Sales raw batches
  const salesBatches = await prisma.$queryRaw<Array<{
    syncRunId: string;
    module: string;
    miProgram: string;
    batchCount: number;
    totalRecords: number;
    latestCreated: Date;
  }>>`
    SELECT "syncRunId", module, "miProgram",
           COUNT(*)::int AS "batchCount",
           SUM("recordCount")::int AS "totalRecords",
           MAX("createdAt") AS "latestCreated"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND module = 'Sales'
    GROUP BY "syncRunId", module, "miProgram"
    ORDER BY MAX("createdAt") DESC
    LIMIT 10
  `;

  console.log('Sales raw batches:');
  for (const b of salesBatches) {
    console.log(`  ${b.latestCreated.toISOString().slice(0, 19)} run=${b.syncRunId.slice(0, 12)} ${b.module}/${b.miProgram}: ${b.batchCount} batches, ${b.totalRecords} records`);
  }
  if (salesBatches.length === 0) console.log('  (none)');

  // Check most recent raw batches of any type
  const recentBatches = await prisma.$queryRaw<Array<{
    syncRunId: string;
    module: string;
    miProgram: string;
    recordCount: number;
    createdAt: Date;
    businessDate: Date;
  }>>`
    SELECT "syncRunId", module, "miProgram", "recordCount", "createdAt", "businessDate"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" DESC
    LIMIT 15
  `;

  console.log('\nMost recent raw batches (any module):');
  for (const b of recentBatches) {
    const biz = b.businessDate ? new Date(b.businessDate).toISOString().slice(0, 10) : 'null';
    console.log(`  ${b.createdAt.toISOString().slice(0, 19)} run=${b.syncRunId.slice(0, 12)} ${b.module}/${b.miProgram}: ${b.recordCount} records, bizDate=${biz}`);
  }

  // Check InforSyncRun for most recent runs
  const runs = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    mode: string;
    createdAt: Date;
    recordsProcessed: number;
  }>>`
    SELECT id, status, mode, "createdAt", COALESCE("recordsProcessed", 0)::int AS "recordsProcessed"
    FROM "InforSyncRun"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  console.log('\nRecent sync runs:');
  for (const r of runs) {
    console.log(`  ${r.createdAt.toISOString().slice(0, 19)} id=${r.id.slice(0, 12)} status=${r.status} mode=${r.mode} records=${r.recordsProcessed}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
