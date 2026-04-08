import prisma from '@/lib/prisma';
import { randomUUID } from 'node:crypto';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const dayIso = process.argv[3] || '2026-03-31';
const maxLoops = Number(process.argv[4] || 60);
const syncRunId = process.argv[5] || randomUUID();
const day = new Date(`${dayIso}T00:00:00.000Z`);

type Continuation = {
  programOffset: number;
  requestOffset: number;
  bookmark?: string | null;
  programEndOffset?: number;
} | null;

async function main() {
  let loops = 0;
  let continuation: Continuation = null;
  let totalCreated = 0;
  let totalErrors = 0;

  while (loops < maxLoops) {
    loops += 1;
    const result = await syncInforM3OperationalData(
      companyId,
      'daily',
      undefined,
      { startDate: day, endDate: day, mode: 'manual' },
      continuation
        ? {
            syncRunId,
            snapshotDateOverride: day,
            skipPrune: true,
            programOffset: continuation.programOffset,
            requestOffset: continuation.requestOffset,
            bookmark: continuation.bookmark || null,
            programEndOffset: continuation.programEndOffset,
          }
        : {
            syncRunId,
            snapshotDateOverride: day,
            skipPrune: true,
          }
    );

    totalCreated += Number(result.recordsCreated || 0);
    totalErrors += Array.isArray(result.errors) ? result.errors.length : 0;

    console.log(
      JSON.stringify({
        event: 'sync_pass',
        loops,
        hasMore: Boolean(result.hasMore),
        recordsCreated: Number(result.recordsCreated || 0),
        errorCount: Array.isArray(result.errors) ? result.errors.length : 0,
        errors: Array.isArray(result.errors) ? result.errors : [],
        nextProgramOffset: result.nextProgramOffset,
        continuation: result.continuation || null,
      })
    );

    if (!result.hasMore || !result.continuation) break;
    continuation = {
      programOffset: result.continuation.programOffset,
      requestOffset: result.continuation.requestOffset,
      bookmark: result.continuation.bookmark || null,
      programEndOffset: result.continuation.programEndOffset,
    };
  }

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "syncRunId",
      "businessDate",
      "miProgram",
      "endpointPath",
      "pageNo",
      "bookmarkIn",
      "bookmarkOut",
      "recordCount",
      status,
      "createdAt"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND "syncRunId" = ${syncRunId}
      AND UPPER(COALESCE("miProgram", '')) IN ('SLARTRANS', 'SLCUSTDRFTS')
    ORDER BY "miProgram" ASC, "businessDate" ASC, "pageNo" ASC, "createdAt" ASC
  `;

  console.log(
    JSON.stringify(
      {
        event: 'ar_raw_shape_summary',
        syncRunId,
        day: dayIso,
        loops,
        totalCreated,
        totalErrors,
        batchRows: rows,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
