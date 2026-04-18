import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const runs = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, status, "chunkCount", "recordsCreated", "warningCount",
           COALESCE("lastError", '') AS "lastError"
    FROM "InforSyncRun"
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;
  console.log('Latest runs:');
  for (const r of runs) {
    console.log(`  id=${String(r.id).slice(0, 16)} status=${r.status} chunks=${r.chunkCount} records=${r.recordsCreated} warnings=${r.warningCount}`);
    const err = String(r.lastError || '').trim();
    if (err) console.log(`    lastError: ${err.slice(0, 300)}`);
  }

  // Check task attempts for the run 8d60f30d
  const runId = '8d60f30d-ba16-49a7-bf8c-e5f3e3f87506';
  const attempts = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT a.id, a."taskId", a."attemptNo", a.status, a."httpStatus",
           COALESCE(a."errorMessage", '') AS "errorMessage",
           COALESCE(LEFT(a."responseSnippet", 400), '') AS snippet,
           a."recordsCreated", a."warningCount"
    FROM "InforSyncTaskAttempt" a
    JOIN "InforSyncTask" t ON t.id = a."taskId"
    WHERE t."runId" = ${runId}
    ORDER BY a."startedAt" DESC
    LIMIT 3
  `;
  console.log(`\nAttempts for run ${runId.slice(0, 12)}:`);
  for (const a of attempts) {
    console.log(`  attempt=${a.attemptNo} status=${a.status} http=${a.httpStatus} records=${a.recordsCreated} warnings=${a.warningCount}`);
    const err = String(a.errorMessage || '').trim();
    if (err) console.log(`    error: ${err.slice(0, 200)}`);
    try {
      const data = JSON.parse(String(a.snippet || '{}'));
      if (data.errors?.length > 0) console.log(`    RESPONSE ERRORS: ${JSON.stringify(data.errors).slice(0, 400)}`);
    } catch {}
  }
  if (attempts.length === 0) console.log('  (none)');
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
