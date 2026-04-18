import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$queryRawUnsafe(`SELECT current_database(), inet_server_addr()::text, version()`);
  console.table(result);
  
  // Check company count
  const companies = await prisma.$queryRawUnsafe(`SELECT id, name FROM "Company" LIMIT 5`);
  console.log('\nCompanies:');
  console.table(companies);
}
main().catch(console.error).finally(() => prisma.$disconnect());
