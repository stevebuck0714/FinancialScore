import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Exactly what the API does: find latest snapshot <= endDate, then load that day
  const endDate = new Date('2026-04-15T23:59:59Z');
  const latestSnap = await prisma.$queryRaw<Array<{ sd: Date }>>`
    SELECT "snapshotDate" AS sd
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "frequency" = 'daily' AND "snapshotDate" <= ${endDate}
    ORDER BY "snapshotDate" DESC LIMIT 1`;
  if (!latestSnap.length) { console.log('No snapshot'); return; }
  const latestDate = new Date(latestSnap[0].sd);
  latestDate.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(latestDate.getTime() + 86400000 - 1);
  console.log(`API would use snapshot date: ${latestDate.toISOString().slice(0,10)}`);

  // How many rows in that range?
  const counts = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
      AND "snapshotDate" >= ${latestDate} AND "snapshotDate" <= ${dayEnd}`;
  console.log(`Total rows in that day range: ${counts[0].cnt}`);

  // Check for "Unknown Customer" in that range
  const unknowns = await prisma.$queryRaw<Array<{ cn: string; cnt: number; total_rem: number }>>`
    SELECT "customerName" AS cn, COUNT(*)::int AS cnt, SUM("remainingAmount")::float AS total_rem
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
      AND "snapshotDate" >= ${latestDate} AND "snapshotDate" <= ${dayEnd}
      AND ("customerName" ILIKE '%unknown%' OR "customerName" LIKE 'Customer %' OR TRIM("customerName") = '')
    GROUP BY "customerName" ORDER BY cnt DESC`;
  console.log('\nUnknown/blank customer names in API range:');
  if (unknowns.length === 0) console.log('  NONE');
  for (const u of unknowns) console.log(`  "${u.cn}": ${u.cnt} lines, remaining=$${u.total_rem}`);

  // Check for DUPLICATE snapshotDate timestamps on Mar 28
  const dupes = await prisma.$queryRaw<Array<{ sd: string; cnt: number }>>`
    SELECT "snapshotDate"::text AS sd, COUNT(*)::int AS cnt
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
      AND "snapshotDate" >= ${latestDate} AND "snapshotDate" <= ${dayEnd}
    GROUP BY "snapshotDate" ORDER BY "snapshotDate"`;
  console.log('\nDistinct timestamps in that day:');
  for (const d of dupes) console.log(`  ${d.sd}: ${d.cnt} rows`);

  // Check Mar 26 (19k rows) -- does that range bleed into Mar 28 query?
  const mar26 = await prisma.$queryRaw<Array<{ sd: string; cnt: number }>>`
    SELECT "snapshotDate"::text AS sd, COUNT(*)::int AS cnt
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
      AND "snapshotDate" >= '2026-03-26'::date AND "snapshotDate" < '2026-03-27'::date
    GROUP BY "snapshotDate" ORDER BY "snapshotDate"`;
  console.log('\nMar 26 timestamps:');
  for (const d of mar26) console.log(`  ${d.sd}: ${d.cnt} rows`);

  // Show order 15999 snapshot timestamps
  const o15999 = await prisma.$queryRaw<Array<{ sd: string; cn: string }>>`
    SELECT "snapshotDate"::text AS sd, "customerName" AS cn
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId} AND "orderId" = '15999'
    ORDER BY "snapshotDate" DESC LIMIT 10`;
  console.log('\nOrder 15999 exact timestamps:');
  for (const r of o15999) console.log(`  ${r.sd}: "${r.cn}"`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
