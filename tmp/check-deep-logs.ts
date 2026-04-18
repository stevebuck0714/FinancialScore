import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Find ALL SLCoitems log entries in last 2 hours
  const logs = await prisma.$queryRaw<Array<{
    status: string;
    recordsImported: number;
    errorDetails: unknown;
    createdAt: Date;
  }>>`
    SELECT status, "recordsImported", "errorDetails", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND "createdAt" > NOW() - INTERVAL '2 hours'
      AND "errorDetails"::text LIKE '%SLCoitems%'
    ORDER BY "createdAt" DESC
    LIMIT 10
  `;

  console.log('SLCoitems logs (last 2 hours):');
  for (const log of logs) {
    const d = log.errorDetails as Record<string, unknown>;
    console.log(`\n  ${log.createdAt.toISOString().slice(0, 19)} status=${log.status} records=${log.recordsImported}`);
    console.log(`    syncRunId=${String(d?.syncRunId || '').slice(0, 16)}`);
    console.log(`    rawIngestEnabled=${d?.rawIngestEnabled} rawIngestOnly=${d?.rawIngestOnly}`);
    console.log(`    sourceRecordCount=${d?.sourceRecordCount} storedRawRecordCount=${d?.storedRawRecordCount}`);
    console.log(`    postWindowRecordCount=${d?.postWindowRecordCount} persistedRecordCount=${d?.persistedRecordCount}`);
    const sw = d?.syncWindow as Record<string, unknown> | undefined;
    console.log(`    syncWindow.mode=${sw?.mode}`);
  }
  if (logs.length === 0) console.log('  (none)');

  // Also check: any log entry referencing the backfill run ID
  const backfillRunId = '0d6bc294-b69e-41ef-bd87-49549a8cbd2e';
  const backfillLogs = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND "errorDetails"::text LIKE ${'%' + backfillRunId.slice(0, 8) + '%'}
  `;
  console.log(`\nTotal ApiSyncLog entries referencing backfill run: ${backfillLogs[0]?.cnt || 0}`);

  // Check recent daily cron runs
  const cronLogs = await prisma.$queryRaw<Array<{
    status: string;
    recordsImported: number;
    errorDetails: unknown;
    createdAt: Date;
  }>>`
    SELECT status, "recordsImported", "errorDetails", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND "createdAt" > NOW() - INTERVAL '2 hours'
    ORDER BY "createdAt" DESC
    LIMIT 3
  `;

  console.log('\nMost recent 3 ApiSyncLog entries:');
  for (const log of cronLogs) {
    const d = log.errorDetails as Record<string, unknown>;
    console.log(`\n  ${log.createdAt.toISOString().slice(0, 19)} status=${log.status} records=${log.recordsImported}`);
    console.log(`    syncRunId=${String(d?.syncRunId || '').slice(0, 16)}`);
    console.log(`    program=${d?.miProgram || d?.resolvedProgramId}`);
    console.log(`    rawIngestEnabled=${d?.rawIngestEnabled} rawIngestOnly=${d?.rawIngestOnly}`);
    const ri = d?.rawIngest as Record<string, unknown> | undefined;
    if (ri) console.log(`    rawIngest detail: enabled=${ri?.enabled} ingestOnly=${ri?.ingestOnly}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
