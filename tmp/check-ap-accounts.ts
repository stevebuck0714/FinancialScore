import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // All accounts hit by APP/APA ref entries
  const appAccounts = await prisma.$queryRawUnsafe(`
    SELECT "accountId", "accountName", LEFT("ref", 3) as ref_prefix,
           COUNT(*)::int as cnt,
           SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1
      AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
    GROUP BY "accountId", "accountName", ref_prefix
    ORDER BY cnt DESC
  `, cid);
  console.log('=== All accounts touched by APP/APA entries ===');
  console.table(appAccounts);

  // All accounts hit by APV ref entries
  const apvAccounts = await prisma.$queryRawUnsafe(`
    SELECT "accountId", "accountName", 
           COUNT(*)::int as cnt,
           SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1
      AND "ref" LIKE 'APV%'
    GROUP BY "accountId", "accountName"
    ORDER BY cnt DESC
  `, cid);
  console.log('\n=== All accounts touched by APV entries ===');
  console.table(apvAccounts);

  // All ref prefixes that touch account 30100
  const refs30100 = await prisma.$queryRawUnsafe(`
    SELECT LEFT("ref", 3) as ref_prefix,
           COUNT(*)::int as cnt,
           SUM("signedAmount") as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
    GROUP BY ref_prefix ORDER BY cnt DESC
  `, cid);
  console.log('\n=== All ref prefixes on account 30100 ===');
  console.table(refs30100);
}
main().catch(console.error).finally(() => prisma.$disconnect());
