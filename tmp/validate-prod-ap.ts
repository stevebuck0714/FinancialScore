import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  const anchor = 697_929.58;

  // Voucher events post-anchor through March 31
  const vouchers = await prisma.$queryRawUnsafe(`
    SELECT SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1
      AND "eventDate" > '2023-12-31' AND "eventDate" <= '2026-03-31'
  `, cid);
  console.log('=== Voucher delta (2024-01-01 to 2026-03-31) ===');
  console.table(vouchers);

  // GL Payment events (APP on 30100) post-anchor through March 31
  const payments = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "ref" LIKE 'APP%'
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  console.log('\n=== Payment delta (APP on 30100, 2024-01-01 to 2026-03-31) ===');
  console.table(payments);

  const voucherTotal = (vouchers as any[])[0]?.total || 0;
  const paymentTotal = (payments as any[])[0]?.total || 0;
  const computed = anchor + voucherTotal + (-paymentTotal);
  
  console.log(`\n=== AP Balance Reconstruction ===`);
  console.log(`  Anchor (12/31/2023):     $${anchor.toLocaleString()}`);
  console.log(`  + Voucher events:        $${Number(voucherTotal).toLocaleString()}`);
  console.log(`  - Payment events:        $${Number(paymentTotal).toLocaleString()}`);
  console.log(`  = Computed AP (3/31/26): $${computed.toLocaleString()}`);
  console.log(`  Expected AP (3/31/26):   $815,260.86`);
  console.log(`  Difference:              $${(computed - 815260.86).toLocaleString()}`);

  // Monthly breakdown
  const monthly = await prisma.$queryRawUnsafe(`
    SELECT date_trunc('month', "eventDate")::date as month,
           COUNT(*)::int as cnt, SUM("normalizedAmount") as net
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "eventDate" >= '2024-01-01'
    GROUP BY month ORDER BY month
  `, cid);
  console.log('\n=== Monthly voucher events ===');
  console.table(monthly);
}
main().catch(console.error).finally(() => prisma.$disconnect());
