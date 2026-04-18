import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const deleted29 = await prisma.$executeRaw`
    DELETE FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" = '2026-03-29'::date
  `;
  console.log(`Deleted ${deleted29} rows for March 29`);

  const deleted15 = await prisma.$executeRaw`
    DELETE FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" >= '2026-04-15'::date
  `;
  console.log(`Deleted ${deleted15} rows for April 15+`);

  const summary = await prisma.$queryRaw<Array<{ snapshotDate: Date; rowCount: number }>>`
    SELECT "snapshotDate", COUNT(*)::int AS "rowCount"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" >= '2026-03-25'::date
    GROUP BY "snapshotDate"
    ORDER BY "snapshotDate"
  `;
  console.log('\nRemaining snapshots:');
  for (const row of summary) {
    console.log(`  ${new Date(row.snapshotDate).toISOString().slice(0, 10)}: ${row.rowCount} lines`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
