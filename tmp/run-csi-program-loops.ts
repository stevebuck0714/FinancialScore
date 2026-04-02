import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma';
import { syncInforM3OperationalData } from '../lib/infor-m3/operational-sync';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const programId = String(process.argv[3] || 'GLACCTPERIODBALANCES').trim().toUpperCase();
const maxLoops = Math.max(1, Number(process.argv[4] || 8));
const site = process.argv[5] || 'MAIN';

type ProgramRow = { miProgram?: string | null; enabled?: boolean | null };

function normalizeProgramId(row: ProgramRow): string {
  return String(row.miProgram || '').trim().toUpperCase();
}

async function resolveProgramOffset(): Promise<number> {
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
  for (let i = 0; i < configured.length; i += 1) {
    const row = configured[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const normalized = row as ProgramRow;
    const enabled = typeof normalized.enabled === 'boolean' ? normalized.enabled : true;
    if (!enabled) continue;
    if (normalizeProgramId(normalized) === programId) return i;
  }
  throw new Error(`${programId} program not found in enabled CSI metadata.`);
}

async function main() {
  const offset = await resolveProgramOffset();
  const endDate = new Date();
  endDate.setUTCHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 89);
  startDate.setUTCHours(0, 0, 0, 0);
  const syncRunId = randomUUID();

  let continuation: { requestOffset: number; bookmark: string | null } | null = null;
  let loop = 0;
  let totalRecords = 0;
  while (loop < maxLoops) {
    loop += 1;
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
        ...(continuation || {}),
      }
    );
    totalRecords += Number(result.recordsCreated || 0);
    console.log(
      JSON.stringify(
        {
          programId,
          offset,
          loop,
          recordsCreatedThisLoop: result.recordsCreated,
          totalRecords,
          hasMore: result.hasMore,
          continuation: result.continuation,
          errors: result.errors,
        },
        null,
        2
      )
    );
    if (!result.continuation || result.continuation.programOffset !== offset) break;
    continuation = {
      requestOffset: result.continuation.requestOffset,
      bookmark: result.continuation.bookmark,
    };
  }
  console.log(JSON.stringify({ done: true, programId, loops: loop, totalRecords }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
