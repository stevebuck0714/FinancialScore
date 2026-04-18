import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmnwyofv000fqhp4z8lebbny';
  const adjs = await prisma.$queryRawUnsafe(`
    SELECT "transType", COUNT(*)::int as cnt,
           SUM("invoiceAmount") as total_inv,
           SUM("normalizedAmount") as total_norm,
           MIN("invoiceAmount") as min_inv,
           MAX("invoiceAmount") as max_inv
    FROM "APTransactionFact"
    WHERE "companyId" = $1
    GROUP BY "transType"
  `, cid);
  console.table(adjs);
}
main().catch(console.error).finally(() => prisma.$disconnect());
