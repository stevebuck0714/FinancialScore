import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const batches = await prisma.$queryRaw<Array<{
    module: string;
    miProgram: string;
    batchCount: number;
    totalRecords: number;
    latestCreated: Date;
  }>>`
    SELECT module, "miProgram",
           COUNT(*)::int AS "batchCount",
           SUM("recordCount")::int AS "totalRecords",
           MAX("createdAt") AS "latestCreated"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND "createdAt" > NOW() - INTERVAL '30 minutes'
    GROUP BY module, "miProgram"
    ORDER BY MAX("createdAt") DESC
  `;

  console.log('Raw batches created in last 30 minutes:');
  for (const b of batches) {
    console.log(`  ${b.module}/${b.miProgram}: ${b.batchCount} batches, ${b.totalRecords} records (latest: ${b.latestCreated.toISOString().slice(11, 19)})`);
  }
  if (batches.length === 0) console.log('  (none)');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
