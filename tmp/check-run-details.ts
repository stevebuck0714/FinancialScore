import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const runId = '0d6bc294-b69e-41ef-bd87-49549a8cbd2e';

async function main() {
  // Check the sync run details
  const run = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, platform, mode, frequency, status, "createdAt", "updatedAt"
    FROM "InforSyncRun"
    WHERE id = ${runId}
  `;
  console.log('Sync run:');
  for (const r of run) {
    console.log(`  platform=${r.platform} mode=${r.mode} freq=${r.frequency} status=${r.status}`);
  }

  // Check task payloads to see forceIngestOnly
  const tasks = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    payload: Record<string, unknown>;
  }>>`
    SELECT id, status, payload
    FROM "InforSyncTask"
    WHERE "runId" = ${runId}
    ORDER BY "createdAt" ASC
    LIMIT 3
  `;
  console.log('\nFirst 3 task payloads:');
  for (const t of tasks) {
    const p = t.payload as Record<string, unknown>;
    console.log(`  task=${String(t.id).slice(0, 12)} status=${t.status}`);
    console.log(`    forceIngestOnly=${p.forceIngestOnly}`);
    console.log(`    deferDailySnapshotHydration=${p.deferDailySnapshotHydration}`);
    console.log(`    businessDateIso=${p.businessDateIso}`);
    console.log(`    programOffset=${p.programOffset} programBatchSize=${p.programBatchSize}`);
    console.log(`    mode=${(p.runIntent as any)?.mode || p.mode}`);
  }

  // Check raw batches for this run
  const rawBatches = await prisma.$queryRaw<Array<{
    module: string;
    miProgram: string;
    cnt: number;
    totalRecords: number;
  }>>`
    SELECT module, "miProgram", COUNT(*)::int AS cnt, SUM("recordCount")::int AS "totalRecords"
    FROM "InforRawBatch"
    WHERE "syncRunId" = ${runId}
    GROUP BY module, "miProgram"
  `;
  console.log('\nRaw batches for this run:');
  for (const b of rawBatches) {
    console.log(`  ${b.module}/${b.miProgram}: ${b.cnt} batches, ${b.totalRecords} records`);
  }
  if (rawBatches.length === 0) console.log('  (none)');

  // Check ApiSyncLog errors for this run
  const errors = await prisma.$queryRaw<Array<{
    status: string;
    errorDetails: unknown;
    createdAt: Date;
  }>>`
    SELECT status, "errorDetails", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = 'cmmnwyofv000fqhp4z8lebbny'
      AND "createdAt" > NOW() - INTERVAL '30 minutes'
      AND status = 'error'
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;
  console.log('\nRecent error logs:');
  for (const e of errors) {
    const details = e.errorDetails as Record<string, unknown>;
    console.log(`  ${e.createdAt.toISOString().slice(0, 19)} ${details?.miProgram || 'unknown'}: ${details?.errorMessage || JSON.stringify(details).slice(0, 200)}`);
  }
  if (errors.length === 0) console.log('  (none)');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
