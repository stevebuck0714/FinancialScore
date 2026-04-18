import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  const anchor = 697_929.58;

  // Voucher events
  const vouchers = await prisma.$queryRawUnsafe(`
    SELECT SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1
      AND "eventDate" > '2023-12-31' AND "eventDate" <= '2026-03-31'
  `, cid);
  const voucherTotal = Number((vouchers as any[])[0]?.total || 0);

  // Broader payments: APP + APA + non-APV debits
  const payments = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "ref" NOT LIKE 'APV%'
      AND "signedAmount" > 0
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  const paymentTotal = Number((payments as any[])[0]?.total || 0);

  const computed = anchor + voucherTotal - paymentTotal;
  console.log(`Anchor:          $${anchor.toLocaleString()}`);
  console.log(`+ Vouchers:      $${voucherTotal.toLocaleString()}`);
  console.log(`- Non-APV debits: $${paymentTotal.toLocaleString()}`);
  console.log(`= Computed AP:   $${computed.toLocaleString()}`);
  console.log(`Expected:        $815,260.86`);
  console.log(`Difference:      $${(computed - 815260.86).toLocaleString()}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
