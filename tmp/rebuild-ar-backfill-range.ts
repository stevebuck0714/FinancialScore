import prisma from '@/lib/prisma';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';

const companyId = process.env.AR_COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const startDay = new Date(process.env.AR_START_DAY || '2026-03-26T00:00:00.000Z');
const endDay = new Date(process.env.AR_END_DAY || '2026-03-31T00:00:00.000Z');
const maxLoopsPerDay = Number(process.env.AR_MAX_LOOPS_PER_DAY || 300);

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

async function rebuildDay(day: Date) {
  let loops = 0;
  let continuation:
    | {
        programOffset: number;
        requestOffset: number;
        bookmark?: string | null;
      }
    | null = null;

  let totalCreated = 0;
  let totalErrors = 0;

  while (loops < maxLoopsPerDay) {
    loops += 1;
    const res = await syncInforM3OperationalData(
      companyId,
      'daily',
      undefined,
      { startDate: day, endDate: day, mode: 'backfill' },
      continuation
        ? {
            snapshotDateOverride: day,
            skipPrune: true,
            arOnlyBackfill: true,
            skipDailySnapshotHydration: true,
            programOffset: continuation.programOffset,
            requestOffset: continuation.requestOffset,
            bookmark: continuation.bookmark || null,
          }
        : {
            snapshotDateOverride: day,
            skipPrune: true,
            arOnlyBackfill: true,
            skipDailySnapshotHydration: true,
          }
    );

    totalCreated += Number(res.recordsCreated || 0);
    totalErrors += Array.isArray(res.errors) ? res.errors.length : 0;

    if (!res.hasMore || !res.continuation) {
      continuation = null;
      break;
    }
    continuation = {
      programOffset: res.continuation.programOffset,
      requestOffset: res.continuation.requestOffset,
      bookmark: res.continuation.bookmark || null,
    };
  }

  const [openRows, totals] = await Promise.all([
    prisma.aROpenInvoiceSnapshot.count({ where: { companyId, frequency: 'daily', snapshotDate: day } }),
    prisma.aROpenInvoiceSnapshot.aggregate({
      where: { companyId, frequency: 'daily', snapshotDate: day, amountDueHome: { gt: 0 } },
      _sum: { amountDueHome: true },
    }),
  ]);

  return {
    day: day.toISOString().slice(0, 10),
    loops,
    endedByCap: Boolean(continuation),
    totalCreated,
    totalErrors,
    openRows,
    totalOpen: Number(totals._sum.amountDueHome || 0),
  };
}

async function main() {
  const from = utcDay(startDay);
  const to = utcDay(endDay);
  const results: any[] = [];
  for (let day = from; day <= to; day = nextUtcDay(day)) {
    const result = await rebuildDay(day);
    results.push(result);
    console.log(JSON.stringify({ event: 'day_rebuild', ...result }));
  }
  console.log(JSON.stringify({ event: 'range_done', from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
