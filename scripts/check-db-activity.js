const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT
      pid,
      state,
      wait_event_type,
      wait_event,
      (now() - query_start)::text AS query_age,
      LEFT(query, 400) AS query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state <> 'idle'
    ORDER BY query_start ASC
    LIMIT 20
  `;
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
