import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  const anchor = 697_929.58;

  const vouchers = await prisma.$queryRawUnsafe(`
    SELECT SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1
      AND "eventDate" > '2023-12-31' AND "eventDate" <= '2026-03-31'
  `, cid);
  const voucherTotal = Number((vouchers as any[])[0]?.total || 0);

  // Test: APP + APA
  const appApa = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  const appApaTotal = Number((appApa as any[])[0]?.total || 0);
  console.log(`APP+APA: $${appApaTotal.toLocaleString()}`);
  console.log(`Computed: $${(anchor + voucherTotal - appApaTotal).toLocaleString()}`);
  console.log(`Gap: $${(anchor + voucherTotal - appApaTotal - 815260.86).toLocaleString()}`);

  // Check voucher types on prod
  const types = await prisma.$queryRawUnsafe(`
    SELECT "transType", COUNT(*)::int as cnt, SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "eventDate" > '2023-12-31' AND "eventDate" <= '2026-03-31'
    GROUP BY "transType"
  `, cid);
  console.log('\n=== Voucher types (post-anchor to 3/31) ===');
  console.table(types);

  // Check 2023 vouchers (pre-anchor, should not be counted)
  const pre = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt, SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "eventDate" >= '2023-01-01' AND "eventDate" <= '2023-12-31'
  `, cid);
  console.log('\n=== 2023 vouchers (pre-anchor, NOT counted) ===');
  console.table(pre);
}
main().catch(console.error).finally(() => prisma.$disconnect());
