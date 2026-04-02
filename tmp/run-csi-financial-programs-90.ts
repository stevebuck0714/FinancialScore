import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma';
import { syncInforM3OperationalData } from '../lib/infor-m3/operational-sync';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const site = process.argv[3] || 'MAIN';

const TARGET_PROGRAM_IDS = new Set([
  'SLGLTRANS',
  'SLCHARTS',
  'SLCHARTACCTS',
  'SLCHARTOFACCOUNTS',
  'GLACCTPERIODBALANCES',
]);

type ProgramRow = {
  miProgram?: string | null;
  endpointPath?: string | null;
  enabled?: boolean | null;
};

const endDate = new Date();
endDate.setUTCHours(23, 59, 59, 999);
const startDate = new Date(endDate);
startDate.setUTCDate(startDate.getUTCDate() - 89);
startDate.setUTCHours(0, 0, 0, 0);

function normalizeProgramId(row: ProgramRow): string {
  return String(row.miProgram || row.endpointPath || '')
    .trim()
    .toUpperCase();
}

async function loadTargetProgramOffsets(): Promise<Array<{ offset: number; programId: string }>> {
  const rows = await prisma.$queryRaw<Array<{ accountingProgramsBySystem: unknown; accountingPrograms: unknown }>>`
    SELECT
      "connectionMetadata"->'accountingProgramsBySystem' AS "accountingProgramsBySystem",
      "connectionMetadata"->'accountingPrograms' AS "accountingPrograms"
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;

  const bySystem =
    rows[0]?.accountingProgramsBySystem && typeof rows[0].accountingProgramsBySystem === 'object'
      ? (rows[0].accountingProgramsBySystem as Record<string, unknown>)
      : {};
  const configured = Array.isArray(bySystem.INFOR_CSI)
    ? bySystem.INFOR_CSI
    : Array.isArray(rows[0]?.accountingPrograms)
      ? (rows[0].accountingPrograms as unknown[])
      : [];

  const normalized: ProgramRow[] = configured
    .filter((v) => v && typeof v === 'object' && !Array.isArray(v))
    .map((v) => v as ProgramRow);

  const targets: Array<{ offset: number; programId: string }> = [];
  normalized.forEach((row, idx) => {
    const programId = normalizeProgramId(row);
    const enabled = typeof row.enabled === 'boolean' ? row.enabled : true;
    if (!enabled) return;
    if (TARGET_PROGRAM_IDS.has(programId)) {
      targets.push({ offset: idx, programId });
    }
  });
  return targets;
}

async function runSingleProgramOffset(offset: number, programId: string): Promise<number> {
  const syncRunId = randomUUID();
  let loop = 0;
  let totalRecords = 0;
  let continuation: { requestOffset: number; bookmark: string | null } | null = null;

  while (true) {
    loop += 1;
    if (loop > 300) throw new Error(`Aborting ${programId} after 300 loops`);

    const result = await syncInforM3OperationalData(
      companyId,
      'daily',
      site,
      { startDate, endDate, mode: 'backfill' },
      {
        syncRunId,
        arOnlyBackfill: false,
        skipDailySnapshotHydration: false,
        programOffset: offset,
        programLimit: 1,
        ...(continuation
          ? {
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
          programId,
          offset,
          loop,
          success: result.success,
          recordsCreatedThisLoop: result.recordsCreated,
          totalRecords,
          errors: result.errors,
          hasMore: result.hasMore,
          continuation: result.continuation,
          nextProgramOffset: result.nextProgramOffset,
        },
        null,
        2
      )
    );

    const next = result.continuation;
    const sameProgram = next && next.programOffset === offset;
    if (!sameProgram) {
      console.log(JSON.stringify({ doneProgram: true, programId, offset, loops: loop, totalRecords }, null, 2));
      break;
    }
    continuation = {
      requestOffset: next.requestOffset,
      bookmark: next.bookmark,
    };
  }

  return totalRecords;
}

async function main() {
  const targets = await loadTargetProgramOffsets();
  if (targets.length === 0) {
    throw new Error('No enabled CSI financial programs found in company metadata.');
  }

  console.log(JSON.stringify({ targets, window: { startDate, endDate } }, null, 2));

  let grandTotal = 0;
  for (const target of targets) {
    grandTotal += await runSingleProgramOffset(target.offset, target.programId);
  }

  console.log(JSON.stringify({ done: true, companyId, site, grandTotal }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
