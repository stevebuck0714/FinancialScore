import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Check what sourceProgram/sourceTransaction the March snapshots used
  const meta = await prisma.$queryRaw<Array<{
    snapshotDate: Date;
    rowCount: number;
    sourceProgram: string | null;
    sourceTransaction: string | null;
  }>>`
    SELECT "snapshotDate",
           COUNT(*)::int AS "rowCount",
           "sourceProgram",
           "sourceTransaction"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" >= '2026-03-25'::date
    GROUP BY "snapshotDate", "sourceProgram", "sourceTransaction"
    ORDER BY "snapshotDate", "sourceProgram"
  `;
  console.log('Snapshot metadata:');
  for (const row of meta) {
    console.log(`  ${new Date(row.snapshotDate).toISOString().slice(0, 10)}: ${row.rowCount} rows, program=${row.sourceProgram}, tx=${row.sourceTransaction}`);
  }

  // Check InforSyncRun entries around March 28
  const runs = await prisma.$queryRaw<Array<{
    id: string;
    createdAt: Date;
    mode: string | null;
    status: string;
    records: number;
    meta: string;
  }>>`
    SELECT id, "createdAt", mode, status,
           COALESCE(("metadata"->>'recordsCreated')::int, 0) AS records,
           LEFT("metadata"::text, 400) AS meta
    FROM "InforSyncRun"
    WHERE "companyId" = ${companyId}
      AND "createdAt" >= '2026-03-25'::date
      AND "createdAt" < '2026-03-29'::date
    ORDER BY "createdAt" DESC
    LIMIT 10
  `;
  console.log('\nInforSyncRun entries March 25-28:');
  for (const r of runs) {
    console.log(`  ${r.createdAt.toISOString().slice(0, 16)} status=${r.status} mode=${r.mode} records=${r.records}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
