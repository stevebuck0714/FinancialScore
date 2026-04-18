import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  // Check the very latest ApiSyncLog entries
  const logs = await prisma.$queryRaw<Array<{
    status: string;
    recordsImported: number;
    errorDetails: unknown;
    createdAt: Date;
  }>>`
    SELECT status, "recordsImported", "errorDetails", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  console.log('Latest ApiSyncLog entries:');
  for (const log of logs) {
    const d = log.errorDetails as Record<string, unknown>;
    const ri = d?.rawIngest as Record<string, unknown> | undefined;
    console.log(`\n  ${log.createdAt.toISOString()} status=${log.status} records=${log.recordsImported}`);
    console.log(`    program=${d?.miProgram || d?.resolvedProgramId}`);
    console.log(`    syncRunId=${String(d?.syncRunId || '').slice(0, 16)}`);
    console.log(`    rawIngestEnabled=${d?.rawIngestEnabled} rawIngestOnly=${d?.rawIngestOnly}`);
    console.log(`    sourceRecordCount=${d?.sourceRecordCount} storedRawRecordCount=${d?.storedRawRecordCount}`);
    console.log(`    postWindowRecordCount=${d?.postWindowRecordCount} persistedRecordCount=${d?.persistedRecordCount}`);
    if (ri) console.log(`    rawIngest.enabled=${ri?.enabled} rawIngest.ingestOnly=${ri?.ingestOnly}`);
    const sw = d?.syncWindow as Record<string, unknown> | undefined;
    if (sw) console.log(`    syncWindow.mode=${sw?.mode}`);
  }

  // Also check if there are ANY raw batches created after our fix deployment
  const recentRaw = await prisma.$queryRaw<Array<{
    module: string;
    miProgram: string;
    createdAt: Date;
    recordCount: number;
  }>>`
    SELECT module, "miProgram", "createdAt", "recordCount"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND "createdAt" > NOW() - INTERVAL '2 hours'
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;
  console.log('\n\nRaw batches in last 2 hours:');
  for (const r of recentRaw) {
    console.log(`  ${r.createdAt.toISOString()} ${r.module}/${r.miProgram}: ${r.recordCount} records`);
  }
  if (recentRaw.length === 0) console.log('  (none)');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
