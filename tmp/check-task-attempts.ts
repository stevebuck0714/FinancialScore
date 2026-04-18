import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find the latest backfill run
  const runs = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    mode: string;
    createdAt: Date;
    message: string;
  }>>`
    SELECT id, status, mode, "createdAt", COALESCE(message, '') AS message
    FROM "InforSyncRun"
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  console.log('Recent sync runs:');
  for (const r of runs) {
    console.log(`  ${r.createdAt.toISOString().slice(0, 19)} id=${r.id.slice(0, 16)} status=${r.status} mode=${r.mode}`);
    console.log(`    message: ${r.message.slice(0, 120)}`);
  }

  if (runs.length === 0) {
    console.log('  (none)');
    return;
  }

  // Check task attempts for the most recent run to find errors
  const latestRunId = runs[0].id;
  console.log(`\nChecking task attempts for run: ${latestRunId.slice(0, 16)}`);

  const attempts = await prisma.$queryRaw<Array<{
    taskId: string;
    attemptNo: number;
    httpStatus: number;
    responseSnippet: string;
    durationMs: number;
    createdAt: Date;
  }>>`
    SELECT "taskId", "attemptNo", COALESCE("httpStatus", 0)::int AS "httpStatus",
           COALESCE("responseSnippet", '') AS "responseSnippet",
           COALESCE("durationMs", 0)::int AS "durationMs",
           "createdAt"
    FROM "InforSyncTaskAttempt"
    WHERE "taskId" IN (
      SELECT id FROM "InforSyncTask" WHERE "runId" = ${latestRunId}
    )
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  console.log('\nRecent task attempts:');
  for (const a of attempts) {
    console.log(`\n  task=${a.taskId.slice(0, 12)} attempt=${a.attemptNo} http=${a.httpStatus} dur=${a.durationMs}ms`);
    // Parse the response snippet for errors
    try {
      const data = JSON.parse(a.responseSnippet || '{}');
      if (data.errors && data.errors.length > 0) {
        console.log(`    ERRORS: ${JSON.stringify(data.errors).slice(0, 300)}`);
      }
      console.log(`    ok=${data.ok} recordsCreated=${data.recordsCreated} hasMore=${data.hasMore}`);
    } catch {
      console.log(`    snippet: ${a.responseSnippet.slice(0, 300)}`);
    }
  }
  if (attempts.length === 0) console.log('  (none)');

  // Also check task payloads to see forceIngestOnly
  const tasks = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    payload: unknown;
  }>>`
    SELECT id, status, payload
    FROM "InforSyncTask"
    WHERE "runId" = ${latestRunId}
    ORDER BY "createdAt" ASC
    LIMIT 3
  `;
  console.log('\nFirst 3 task payloads:');
  for (const t of tasks) {
    const p = t.payload as Record<string, unknown>;
    console.log(`  task=${String(t.id).slice(0, 12)} status=${t.status}`);
    console.log(`    forceIngestOnly=${p?.forceIngestOnly} deferDailySnapshotHydration=${p?.deferDailySnapshotHydration}`);
    console.log(`    businessDateIso=${p?.businessDateIso} mode=${p?.mode}`);
    console.log(`    programOffset=${p?.programOffset} programBatchSize=${p?.programBatchSize}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
