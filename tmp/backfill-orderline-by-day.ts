import { PrismaClient } from '@prisma/client';
import { syncInforM3OperationalData } from '../lib/infor-m3/operational-sync';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const BACKFILL_START = '2026-03-29';
const BACKFILL_END = '2026-04-14';

function dateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function main() {
  // Clean up any garbage rows outside March 25-28 range
  const cleanup = await prisma.$executeRaw`
    DELETE FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" > '2026-03-28'::date
  `;
  console.log(`Cleaned up ${cleanup} stale rows\n`);

  const dates = dateRange(BACKFILL_START, BACKFILL_END);
  console.log(`Backfilling SLCOITEMS for ${dates.length} days: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log(`Using mode=manual with 1-day window (matching daily auto sync)\n`);

  for (const dateIso of dates) {
    const dayStart = new Date(`${dateIso}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateIso}T23:59:59.999Z`);
    const syncWindow = { startDate: dayStart, endDate: dayEnd, mode: 'manual' as const };

    console.log(`--- ${dateIso} ---`);
    let batch = 0;
    let dayRecords = 0;

    let result = await syncInforM3OperationalData(companyId, 'daily', undefined, syncWindow, {
      salesOnly: true,
    });
    batch++;
    dayRecords += result.recordsCreated;
    console.log(`  [${batch}] records=${result.recordsCreated} hasMore=${result.hasMore}`);
    if (result.errors?.length) {
      for (const e of result.errors) {
        if (!e.includes('saveCustomerSales')) console.log(`  error: ${e}`);
      }
    }

    while (result.hasMore && result.continuation) {
      batch++;
      result = await syncInforM3OperationalData(companyId, 'daily', undefined, syncWindow, {
        salesOnly: true,
        programOffset: result.continuation.programOffset,
        requestOffset: result.continuation.requestOffset,
        bookmark: result.continuation.bookmark,
      });
      dayRecords += result.recordsCreated;
      console.log(`  [${batch}] records=${result.recordsCreated} hasMore=${result.hasMore}`);
      if (result.errors?.length) {
        for (const e of result.errors) {
          if (!e.includes('saveCustomerSales')) console.log(`  error: ${e}`);
        }
      }
      if (batch > 50) {
        console.log('  Safety limit. Moving to next day.');
        break;
      }
    }
    console.log(`  Total: ${dayRecords} records in ${batch} batches\n`);
  }

  // Final coverage check
  const summary = await prisma.$queryRaw<Array<{ snapshotDate: Date; rowCount: number }>>`
    SELECT "snapshotDate", COUNT(*)::int AS "rowCount"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" >= '2026-03-25'::date
    GROUP BY "snapshotDate"
    ORDER BY "snapshotDate"
  `;
  console.log('Final snapshot coverage:');
  for (const row of summary) {
    console.log(`  ${new Date(row.snapshotDate).toISOString().slice(0, 10)}: ${row.rowCount} lines`);
  }

  console.log('\nDone.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Fatal error:', err); process.exit(1); });
