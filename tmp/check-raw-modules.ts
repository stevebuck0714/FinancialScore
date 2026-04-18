import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmnwyofv000fqhp4z8lebbny';
  const mods = await prisma.$queryRawUnsafe(`
    SELECT "module", "miProgram", COUNT(*)::int as cnt,
           MIN("businessDate")::date as earliest,
           MAX("businessDate")::date as latest
    FROM "InforRawRecord"
    WHERE "companyId" = $1
    GROUP BY "module", "miProgram" ORDER BY cnt DESC LIMIT 30
  `, cid);
  console.log('=== All Module/Program combos ===');
  console.table(mods);
}
main().catch(console.error).finally(() => prisma.$disconnect());
