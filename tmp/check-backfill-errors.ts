import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const runId = '8d60f30d-ba16-49a7-bf8c-e5f3e3f87506';

async function main() {
  // Check task attempts for errors in the response
  const attempts = await prisma.$queryRaw<Array<{
    taskId: string;
    attemptNo: number;
    httpStatus: number;
    durationMs: number;
    snippet: string;
  }>>`
    SELECT a."taskId",
           COALESCE(a."attemptNo", 0)::int AS "attemptNo",
           COALESCE(a."httpStatus", 0)::int AS "httpStatus",
           COALESCE(a."durationMs", 0)::int AS "durationMs",
           COALESCE(LEFT(a."responseSnippet", 500), '') AS snippet
    FROM "InforSyncTaskAttempt" a
    JOIN "InforSyncTask" t ON t.id = a."taskId"
    WHERE t."runId" = ${runId}
    ORDER BY a."startedAt" DESC
    LIMIT 5
  `;

  console.log('Recent task attempts:');
  for (const a of attempts) {
    console.log(`\n  task=${a.taskId.slice(0, 12)} attempt=${a.attemptNo} http=${a.httpStatus} dur=${a.durationMs}ms`);
    try {
      const data = JSON.parse(a.snippet || '{}');
      if (data.errors && data.errors.length > 0) {
        console.log(`  ERRORS: ${JSON.stringify(data.errors).slice(0, 500)}`);
      }
      console.log(`  ok=${data.ok} recordsCreated=${data.recordsCreated} rawIngest=${JSON.stringify(data.rawIngest || {})}`);
    } catch {
      console.log(`  snippet: ${a.snippet.slice(0, 300)}`);
    }
  }
  if (attempts.length === 0) console.log('  (none)');

  // Check the run itself
  const run = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, status, "chunkCount", "recordsCreated", "warningCount",
           COALESCE("lastError", '') AS "lastError",
           COALESCE(message, '') AS message
    FROM "InforSyncRun"
    WHERE id = ${runId}
  `;
  console.log('\nRun status:');
  for (const r of run) {
    console.log(`  status=${r.status} chunks=${r.chunkCount} records=${r.recordsCreated} warnings=${r.warningCount}`);
    if (r.lastError) console.log(`  lastError: ${String(r.lastError).slice(0, 300)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
