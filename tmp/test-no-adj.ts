import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  const anchor = 697_929.58;

  // Voucher events — V only (no adjustments)
  const vOnly = await prisma.$queryRawUnsafe(`
    SELECT SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "transType" = 'V'
      AND "eventDate" > '2023-12-31' AND "eventDate" <= '2026-03-31'
  `, cid);
  const vTotal = Number((vOnly as any[])[0]?.total || 0);

  // APP+APA payments
  const payments = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  const pTotal = Number((payments as any[])[0]?.total || 0);

  console.log(`V-only vouchers: $${vTotal.toLocaleString()}`);
  console.log(`APP+APA payments: $${pTotal.toLocaleString()}`);
  const computed = anchor + vTotal - pTotal;
  console.log(`Computed: $${computed.toLocaleString()}`);
  console.log(`Expected: $815,260.86`);
  console.log(`Gap: $${(computed - 815260.86).toLocaleString()}`);

  // Check negative normalizedAmount in type A
  const negAdj = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt, SUM("normalizedAmount") as total,
           MIN("normalizedAmount") as min_amt, MAX("normalizedAmount") as max_amt
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "transType" = 'A'
      AND "eventDate" > '2023-12-31' AND "eventDate" <= '2026-03-31'
  `, cid);
  console.log('\n=== Type A adjustment stats ===');
  console.table(negAdj);
}
main().catch(console.error).finally(() => prisma.$disconnect());
