const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const active = await prisma.$queryRaw`
    SELECT pid, query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'active'
      AND query ILIKE '%FROM "public"."FinancialRecord"%'
      AND pid <> pg_backend_pid()
  `;
  for (const row of active) {
    await prisma.$queryRawUnsafe(`SELECT pg_terminate_backend(${Number(row.pid)})`);
  }
  console.log(`Terminated ${active.length} backend(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
