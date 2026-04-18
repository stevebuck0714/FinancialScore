import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const snapshots = await prisma.$queryRaw<Array<{
    snapshotDate: Date;
    rowCount: number;
    distinctOrders: number;
  }>>`
    SELECT "snapshotDate",
           COUNT(*)::int AS "rowCount",
           COUNT(DISTINCT "orderId")::int AS "distinctOrders"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" >= '2026-03-25'::date
    GROUP BY "snapshotDate"
    ORDER BY "snapshotDate" DESC
  `;

  console.log('CustomerOrderLineSnapshot by date (since March 25):');
  for (const row of snapshots) {
    const d = new Date(row.snapshotDate).toISOString().slice(0, 10);
    console.log(`  ${d}: ${row.rowCount} lines, ${row.distinctOrders} orders`);
  }

  if (snapshots.length === 0) {
    console.log('  (none found)');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
