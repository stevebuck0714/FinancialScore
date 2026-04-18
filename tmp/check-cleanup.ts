import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rows = await prisma.$queryRaw<Array<{
    snapshotDate: Date;
    cnt: number;
  }>>`
    SELECT "snapshotDate", COUNT(*)::int AS cnt
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
    GROUP BY "snapshotDate"
    ORDER BY "snapshotDate" DESC
    LIMIT 30
  `;

  console.log('CustomerOrderLineSnapshot counts by date:');
  for (const r of rows) {
    const dateStr = new Date(r.snapshotDate).toISOString().slice(0, 10);
    const flag = r.cnt < 5000 ? ' <-- PARTIAL' : '';
    console.log(`  ${dateStr}: ${r.cnt} rows${flag}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
