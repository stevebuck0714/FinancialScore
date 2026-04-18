import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Find the latest runs for this company
  const runs = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, status, mode, platform, "createdAt", "updatedAt",
           COALESCE(message, '') AS message,
           COALESCE("chunkCount", 0)::int AS "chunkCount",
           COALESCE("recordsCreated", 0)::int AS "recordsCreated"
    FROM "InforSyncRun"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  console.log('Recent runs for this company:');
  for (const r of runs) {
    console.log(`  ${new Date(r.createdAt as string).toISOString().slice(0, 19)} id=${String(r.id).slice(0, 16)} status=${r.status} mode=${r.mode} platform=${r.platform}`);
    console.log(`    chunks=${r.chunkCount} records=${r.recordsCreated} message: ${String(r.message).slice(0, 100)}`);
  }
  if (runs.length === 0) console.log('  (none)');

  // Search specifically for the run IDs from the user's UI
  for (const rid of ['0d6bc294-b69e-41ef-bd87-49549a8cbd2e']) {
    const match = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, status, mode, platform, "createdAt"
      FROM "InforSyncRun"
      WHERE id = ${rid}
    `;
    console.log(`\nSearch for run ${rid.slice(0, 16)}: ${match.length > 0 ? 'FOUND' : 'NOT FOUND'}`);
    if (match.length > 0) console.log(`  ${JSON.stringify(match[0])}`);
  }

  // Find the most recent run regardless of company
  const allRuns = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, "companyId", status, mode, platform, "createdAt"
    FROM "InforSyncRun"
    ORDER BY "createdAt" DESC
    LIMIT 3
  `;
  console.log('\nMost recent runs (any company):');
  for (const r of allRuns) {
    console.log(`  ${new Date(r.createdAt as string).toISOString().slice(0, 19)} company=${String(r.companyId).slice(0, 16)} status=${r.status} mode=${r.mode} platform=${r.platform}`);
  }

  // Check task details for latest run of this company
  if (runs.length > 0) {
    const latestId = String(runs[0].id);
    const tasks = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, status, payload
      FROM "InforSyncTask"
      WHERE "runId" = ${latestId}
      LIMIT 2
    `;
    console.log(`\nTasks for latest run ${latestId.slice(0, 16)}:`);
    for (const t of tasks) {
      const p = t.payload as Record<string, unknown>;
      console.log(`  task=${String(t.id).slice(0, 12)} status=${t.status}`);
      console.log(`    forceIngestOnly=${p?.forceIngestOnly} mode=${p?.mode}`);
    }
    if (tasks.length === 0) console.log('  (none)');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
