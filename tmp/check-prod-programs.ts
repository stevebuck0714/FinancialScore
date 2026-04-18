import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  const programs = await prisma.$queryRawUnsafe(`
    SELECT "module", "miProgram", COUNT(*)::int as cnt,
           MIN("businessDate")::date as earliest,
           MAX("businessDate")::date as latest
    FROM "InforRawRecord"
    WHERE "companyId" = $1
    GROUP BY "module", "miProgram" ORDER BY cnt DESC LIMIT 30
  `, cid);
  console.log('=== Prod Module/Program combos ===');
  console.table(programs);

  const total = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as total FROM "InforRawRecord" WHERE "companyId" = $1
  `, cid);
  console.log('\n=== Total raw records ===');
  console.table(total);
}
main().catch(console.error).finally(() => prisma.$disconnect());
