import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Find ApiSyncLog entries for SLCOITEMS around March 25-28
  const logs = await prisma.$queryRaw<Array<{
    syncType: string;
    status: string;
    recordsImported: number;
    createdAt: Date;
    responseBody: string;
  }>>`
    SELECT "syncType", status, "recordsImported", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND "syncType" LIKE '%sales%'
      AND "createdAt" >= '2026-03-25'::date
      AND "createdAt" < '2026-03-29'::date
      AND "recordsImported" > 0
    ORDER BY "createdAt" DESC
    LIMIT 10
  `;
  console.log('ApiSyncLog entries for sales (March 25-28):');
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString().slice(0, 16)} type=${l.syncType} status=${l.status} records=${l.recordsImported}`);
  }

  // Check if the snapshots were created via the createdAt timestamp
  const snapCreated = await prisma.$queryRaw<Array<{ snapshotDate: Date; minCreated: Date; maxCreated: Date }>>`
    SELECT "snapshotDate",
           MIN("createdAt") AS "minCreated",
           MAX("createdAt") AS "maxCreated"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" >= '2026-03-25'::date
      AND "snapshotDate" <= '2026-03-28'::date
    GROUP BY "snapshotDate"
    ORDER BY "snapshotDate"
  `;
  console.log('\nSnapshot creation timestamps:');
  for (const s of snapCreated) {
    console.log(`  ${new Date(s.snapshotDate).toISOString().slice(0, 10)}: created ${s.minCreated.toISOString().slice(0, 19)} → ${s.maxCreated.toISOString().slice(0, 19)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
