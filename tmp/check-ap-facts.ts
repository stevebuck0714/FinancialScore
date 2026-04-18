import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  
  const summary = await prisma.$queryRawUnsafe(`
    SELECT "apAcct", "transType", COUNT(*)::int as cnt,
           SUM("normalizedAmount") as total_normalized,
           MIN("eventDate")::date as earliest,
           MAX("eventDate")::date as latest
    FROM "APTransactionFact"
    WHERE "companyId" = $1
    GROUP BY "apAcct", "transType"
    ORDER BY "apAcct", "transType"
  `, companyId);
  console.log('=== AP Transaction Facts Summary ===');
  console.table(summary);

  const monthly = await prisma.$queryRawUnsafe(`
    SELECT date_trunc('month', "eventDate")::date as month,
           COUNT(*)::int as cnt,
           SUM("normalizedAmount") as net
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "apAcct" = '30100'
    GROUP BY month ORDER BY month
  `, companyId);
  console.log('\n=== Monthly AP 30100 Events ===');
  console.table(monthly);

  const total30100 = await prisma.$queryRawUnsafe(`
    SELECT SUM("normalizedAmount") as cumulative_voucher_delta
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "apAcct" = '30100'
      AND "eventDate" > '2023-12-31'
  `, companyId);
  console.log('\n=== Cumulative voucher delta since anchor (30100, post-2023-12-31) ===');
  console.table(total30100);

  const glPayments = await prisma.$queryRawUnsafe(`
    SELECT date_trunc('month', "transDate")::date as month,
           COUNT(*)::int as cnt,
           SUM("signedAmount") as net_signed
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "ref" LIKE 'APP%'
      AND "transDate" > '2023-12-31'
    GROUP BY month ORDER BY month
  `, companyId);
  console.log('\n=== Monthly GL Payment Events (APP on 30100) ===');
  console.table(glPayments);

  const totalPayments = await prisma.$queryRawUnsafe(`
    SELECT SUM("signedAmount") as cumulative_payment_signed
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "ref" LIKE 'APP%'
      AND "transDate" > '2023-12-31'
  `, companyId);
  console.log('\n=== Cumulative payment signed amount (APP on 30100, post-2023-12-31) ===');
  console.table(totalPayments);
}

main().catch(console.error).finally(() => prisma.$disconnect());
