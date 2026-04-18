import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  const gl = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as total,
           MIN("transDate")::date as earliest,
           MAX("transDate")::date as latest
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
  `, cid);
  console.log('=== Prod GLTransactionFact for 30100 ===');
  console.table(gl);

  const apps = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt,
           SUM("signedAmount") as total_signed,
           MIN("transDate")::date as earliest,
           MAX("transDate")::date as latest
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100' AND "ref" LIKE 'APP%'
  `, cid);
  console.log('\n=== Prod APP payments on 30100 ===');
  console.table(apps);

  // Check if InforRawRecord exists at all or if there's a different table
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  console.log('\n=== Prod tables ===');
  const tableNames = (tables as any[]).map(t => t.tablename);
  console.log(tableNames.filter(t => /raw|batch|infor/i.test(t)));
}
main().catch(console.error).finally(() => prisma.$disconnect());
