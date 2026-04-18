import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const runId = '0d6bc294-b69e-41ef-bd87-49549a8cbd2e';

async function main() {
  // Check ApiSyncLog entries for this sync run
  const logs = await prisma.$queryRaw<Array<{
    status: string;
    recordsImported: number;
    errorDetails: unknown;
    createdAt: Date;
  }>>`
    SELECT status, "recordsImported", "errorDetails", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND "errorDetails"::text LIKE ${'%' + runId.slice(0, 12) + '%'}
    ORDER BY "createdAt" DESC
    LIMIT 10
  `;

  console.log(`ApiSyncLog entries referencing run ${runId.slice(0, 12)}:`);
  for (const log of logs) {
    const d = log.errorDetails as Record<string, unknown>;
    console.log(`\n  ${log.createdAt.toISOString().slice(0, 19)} status=${log.status} records=${log.recordsImported}`);
    console.log(`    program=${d?.miProgram || d?.resolvedProgramId}`);
    console.log(`    rawIngestEnabled=${d?.rawIngestEnabled} rawIngestOnly=${d?.rawIngestOnly}`);
    console.log(`    sourceRecordCount=${d?.sourceRecordCount} storedRawRecordCount=${d?.storedRawRecordCount}`);
    console.log(`    postWindowRecordCount=${d?.postWindowRecordCount} persistedRecordCount=${d?.persistedRecordCount}`);
  }
  if (logs.length === 0) {
    console.log('  (none found for this run)');
    // Try broader search
    const recent = await prisma.$queryRaw<Array<{
      status: string;
      recordsImported: number;
      errorDetails: unknown;
      createdAt: Date;
    }>>`
      SELECT status, "recordsImported", "errorDetails", "createdAt"
      FROM "ApiSyncLog"
      WHERE "companyId" = ${companyId}
        AND "createdAt" > NOW() - INTERVAL '60 minutes'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;
    console.log(`\nRecent ApiSyncLog entries (last 60 min):`);
    for (const log of recent) {
      const d = log.errorDetails as Record<string, unknown>;
      console.log(`\n  ${log.createdAt.toISOString().slice(0, 19)} status=${log.status} records=${log.recordsImported}`);
      console.log(`    program=${d?.miProgram || d?.resolvedProgramId}`);
      console.log(`    syncRunId=${String(d?.syncRunId || '').slice(0, 12)}`);
      console.log(`    rawIngestEnabled=${d?.rawIngestEnabled} rawIngestOnly=${d?.rawIngestOnly}`);
      console.log(`    sourceRecordCount=${d?.sourceRecordCount} storedRawRecordCount=${d?.storedRawRecordCount}`);
    }
    if (recent.length === 0) console.log('  (none found in last 60 min)');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
