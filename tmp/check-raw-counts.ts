import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Check ALL recent raw batches regardless of syncRunId
  const batches = await prisma.$queryRaw<Array<{
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
    GROUP BY "syncRunId", module, "miProgram"
    ORDER BY MAX("createdAt") DESC
    LIMIT 20
  `;

  console.log('All raw batches (most recent first):');
  for (const b of batches) {
    console.log(`  ${b.latestCreated.toISOString().slice(0, 19)} run=${b.syncRunId.slice(0, 12)} ${b.module}/${b.miProgram}: ${b.batchCount} batches, ${b.totalRecords} records`);
  }
  if (batches.length === 0) console.log('  (none in database)');

  // Check ALL raw records count
  const totalRaw = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
  `;
  console.log(`\nTotal raw records for this company: ${totalRaw[0]?.cnt || 0}`);

  // Check completeness entries
  const completeness = await prisma.$queryRaw<Array<{
    businessDate: Date;
    sourceKey: string;
    isComplete: boolean;
    syncRunId: string;
  }>>`
    SELECT "businessDate", "sourceKey", "isComplete", "syncRunId"
    FROM "InforRawCompleteness"
    WHERE "companyId" = ${companyId}
    ORDER BY "businessDate" DESC
    LIMIT 20
  `;
  console.log(`\nCompleteness entries:`);
  for (const c of completeness) {
    console.log(`  ${new Date(c.businessDate).toISOString().slice(0, 10)} ${c.sourceKey}: complete=${c.isComplete} run=${c.syncRunId.slice(0, 12)}`);
  }
  if (completeness.length === 0) console.log('  (none)');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
