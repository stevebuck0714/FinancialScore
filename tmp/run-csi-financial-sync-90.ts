import { randomUUID } from 'node:crypto';
import { syncInforM3OperationalData } from '../lib/infor-m3/operational-sync';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const site = process.argv[3] || 'MAIN';

const endDate = new Date();
endDate.setUTCHours(23, 59, 59, 999);
const startDate = new Date(endDate);
startDate.setUTCDate(startDate.getUTCDate() - 89);
startDate.setUTCHours(0, 0, 0, 0);

const syncRunId = randomUUID();

async function main() {
  let continuation: { programOffset: number; requestOffset: number; bookmark: string | null } | null = null;
  let totalRecords = 0;
  let loop = 0;

  while (true) {
    loop += 1;
    if (loop > 200) throw new Error('Aborting after 200 continuation loops');

    const result = await syncInforM3OperationalData(
      companyId,
      'daily',
      site,
      { startDate, endDate, mode: 'backfill' },
      {
        syncRunId,
        arOnlyBackfill: false,
        skipDailySnapshotHydration: false,
        // Financial-focused run: process only the first program slice
        // (current config places CSI financial programs in this range).
        programOffset: 0,
        programLimit: 4,
        ...(continuation
          ? {
              programOffset: continuation.programOffset,
              requestOffset: continuation.requestOffset,
              bookmark: continuation.bookmark,
            }
          : {}),
      }
    );

    totalRecords += Number(result.recordsCreated || 0);

    console.log(
      JSON.stringify(
        {
          loop,
          success: result.success,
          recordsCreatedThisLoop: result.recordsCreated,
          totalRecords,
          errors: result.errors,
          hasMore: result.hasMore,
          nextProgramOffset: result.nextProgramOffset,
          continuation: result.continuation,
          totalProgramRows: result.totalProgramRows,
        },
        null,
        2
      )
    );

    const reachedNonFinancialPrograms =
      (result.continuation?.programOffset ?? Number.POSITIVE_INFINITY) >= 4 ||
      (result.nextProgramOffset ?? Number.POSITIVE_INFINITY) >= 4;

    if (!result.hasMore || !result.continuation || reachedNonFinancialPrograms) {
      console.log(
        JSON.stringify(
          {
            done: true,
            doneFinancialSlice: reachedNonFinancialPrograms,
            companyId,
            site,
            syncRunId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            loops: loop,
            totalRecords,
            finalSuccess: result.success,
            finalErrors: result.errors,
          },
          null,
          2
        )
      );
      break;
    }

    continuation = result.continuation;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
