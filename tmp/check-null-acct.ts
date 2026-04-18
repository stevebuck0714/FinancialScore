import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmnwyofv000fqhp4z8lebbny';
  
  // Check null-apAcct records by year
  const nullByYear = await prisma.$queryRawUnsafe(`
    SELECT date_trunc('year', "eventDate")::date as year, COUNT(*)::int as cnt,
           SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "apAcct" IS NULL
    GROUP BY year ORDER BY year
  `, cid);
  console.log('=== Records with NULL apAcct by year ===');
  console.table(nullByYear);

  // Combined (30100 + null) monthly for 2024+
  const combined = await prisma.$queryRawUnsafe(`
    SELECT date_trunc('month', "eventDate")::date as month, COUNT(*)::int as cnt,
           SUM("normalizedAmount") as net
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND ("apAcct" = '30100' OR "apAcct" IS NULL)
      AND "eventDate" >= '2024-01-01'
    GROUP BY month ORDER BY month
  `, cid);
  console.log('\n=== Monthly 30100 + NULL for 2024+ ===');
  console.table(combined);

  // Cumulative post-anchor
  const cumul = await prisma.$queryRawUnsafe(`
    SELECT SUM("normalizedAmount") as voucher_delta
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND ("apAcct" = '30100' OR "apAcct" IS NULL)
      AND "eventDate" > '2023-12-31'
  `, cid);
  console.log('\n=== Cumulative voucher delta since anchor ===');
  console.table(cumul);
}
main().catch(console.error).finally(() => prisma.$disconnect());
