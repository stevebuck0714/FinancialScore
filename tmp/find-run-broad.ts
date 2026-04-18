import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Direct search for the run ID
  const direct = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "InforSyncRun" WHERE id = '8d60f30d-ba16-49a7-bf8c-e5f3e3f87506'
  `;
  console.log(`Direct search for run: ${direct[0]?.cnt || 0} rows`);

  // Check total run count
  const total = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "InforSyncRun"
  `;
  console.log(`Total InforSyncRun rows: ${total[0]?.cnt || 0}`);

  // Check runs created in last hour  
  const recent = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "InforSyncRun" WHERE "createdAt" > NOW() - INTERVAL '2 hours'
  `;
  console.log(`Runs created in last 2 hours: ${recent[0]?.cnt || 0}`);

  // Check InforSyncTask count
  const tasks = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "InforSyncTask"
  `;
  console.log(`Total InforSyncTask rows: ${tasks[0]?.cnt || 0}`);

  // Tasks in last 2 hours
  const recentTasks = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "InforSyncTask" WHERE "createdAt" > NOW() - INTERVAL '2 hours'
  `;
  console.log(`Tasks created in last 2 hours: ${recentTasks[0]?.cnt || 0}`);

  // Check DATABASE_URL hint
  console.log(`\nDB connection: ${(process.env.DATABASE_URL || '').replace(/:[^@]+@/, ':***@').slice(0, 80)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
