import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  const anchor = 697_929.58;

  // All GL entries on 30100 by ref prefix
  const byRef = await prisma.$queryRawUnsafe(`
    SELECT LEFT("ref", 3) as ref_prefix,
           COUNT(*)::int as cnt,
           SUM("signedAmount") as total_signed
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
    GROUP BY ref_prefix ORDER BY total_signed DESC
  `, cid);
  console.log('=== GL 30100 entries by ref prefix (post-anchor to 3/31) ===');
  console.table(byRef);

  // Total ALL debits (positive signedAmount) on 30100
  const allDebits = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "signedAmount" > 0
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  console.log('\n=== ALL positive signedAmount (debits) on 30100 ===');
  console.table(allDebits);

  // Total ALL credits (negative signedAmount) on 30100
  const allCredits = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "signedAmount" < 0
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  console.log('\n=== ALL negative signedAmount (credits) on 30100 ===');
  console.table(allCredits);

  // Net GL on 30100
  const netGL = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as net
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" > '2023-12-31' AND "transDate" <= '2026-03-31'
  `, cid);
  console.log('\n=== Net GL on 30100 ===');
  console.table(netGL);
  const netGLVal = (netGL as any[])[0]?.net || 0;
  console.log(`  Anchor + net GL = ${anchor + netGLVal} (should be ~815,261 if GL is complete)`);

  // Compare: use ALL positive GL entries as "payments" instead of just APP
  const allPositive = (allDebits as any[])[0]?.total || 0;
  const vouchers = 28516301.96;
  const computed = anchor + vouchers - allPositive;
  console.log(`\n=== If we use ALL debits as payments ===`);
  console.log(`  Anchor + vouchers - all_debits = ${computed.toLocaleString()}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
