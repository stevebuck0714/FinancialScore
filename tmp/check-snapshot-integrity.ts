import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Check all snapshot dates and row counts
  const all = await prisma.$queryRaw<Array<{ sd: string; cnt: number }>>`
    SELECT "snapshotDate"::text AS sd, COUNT(*)::int AS cnt
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
    GROUP BY "snapshotDate"
    ORDER BY "snapshotDate" DESC
    LIMIT 30`;

  console.log('=== All daily snapshots (last 30) ===');
  for (const r of all) console.log(`  ${r.sd}: ${r.cnt} rows`);

  // Specific check for March 25, 26, 27, 28
  const check = ['2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28'];
  for (const d of check) {
    const rows = await prisma.$queryRaw<Array<{ sd: string; cnt: number; unknowns: number }>>`
      SELECT
        "snapshotDate"::text AS sd,
        COUNT(*)::int AS cnt,
        COUNT(*) FILTER (WHERE "customerName" ILIKE '%unknown%')::int AS unknowns
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
        AND "snapshotDate"::date = ${d}::date
      GROUP BY "snapshotDate"`;
    if (rows.length === 0) {
      console.log(`\n${d}: NO SNAPSHOT`);
    } else {
      for (const r of rows) {
        console.log(`\n${r.sd}: ${r.cnt} rows, ${r.unknowns} unknown-customer rows`);
      }
    }
  }

  // Also check sample order from each date to verify customer names are populated
  for (const d of check) {
    const sample = await prisma.$queryRaw<Array<{ oid: string; cn: string; cid: string | null }>>`
      SELECT "orderId" AS oid, "customerName" AS cn, "customerId" AS cid
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
        AND "snapshotDate"::date = ${d}::date
      ORDER BY "contractValue" DESC
      LIMIT 3`;
    if (sample.length > 0) {
      console.log(`  Top orders: ${sample.map(s => `${s.oid} => "${s.cn}" (${s.cid})`).join(', ')}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
