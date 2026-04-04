import prisma from '@/lib/prisma';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const rangeStart = new Date('2026-01-01T00:00:00.000Z');
const rangeEnd = new Date('2026-03-31T00:00:00.000Z');
const resumeFrom = process.env.REBUILD_START_DAY ? new Date(`${process.env.REBUILD_START_DAY}T00:00:00.000Z`) : rangeStart;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function collectDays(): Date[] {
  const start = resumeFrom.getTime() > rangeStart.getTime() ? resumeFrom : rangeStart;
  const days: Date[] = [];
  for (let d = new Date(start); d.getTime() <= rangeEnd.getTime(); d = addDays(d, 1)) {
    days.push(new Date(d));
  }
  return days;
}

async function rebuildDay(d: Date): Promise<{ loops: number; errors: number; completed: boolean }> {
  await prisma.aROpenInvoiceSnapshot.deleteMany({
    where: { companyId, frequency: 'daily', snapshotDate: d },
  });
  await prisma.aRInvoiceDetail.deleteMany({
    where: { companyId, snapshotFrequency: 'daily', asOfDate: d },
  });
  await prisma.aRAgingSnapshot.deleteMany({
    where: { companyId, frequency: 'daily', snapshotDate: d },
  });

  let loops = 0;
  let errors = 0;
  let completed = false;
  let options: {
    snapshotDateOverride: Date;
    skipPrune: true;
    programOffset?: number;
    requestOffset?: number;
    bookmark?: string | null;
  } = {
    snapshotDateOverride: d,
    skipPrune: true,
  };

  while (true) {
    loops += 1;
    const res = await syncInforM3OperationalData(
      companyId,
      'daily',
      undefined,
      { startDate: d, endDate: d, mode: 'manual' },
      options
    );
    errors += res.errors.length;
    if (loops % 20 === 0 || !res.hasMore) {
      console.log(
        JSON.stringify({
          event: 'day_progress',
          day: dayKey(d),
          loops,
          errors,
          hasMore: res.hasMore,
          hasContinuation: Boolean(res.continuation),
        })
      );
    }
    if (!res.hasMore || !res.continuation) {
      completed = true;
      break;
    }
    options = {
      snapshotDateOverride: d,
      skipPrune: true,
      programOffset: res.continuation.programOffset,
      requestOffset: res.continuation.requestOffset,
      bookmark: res.continuation.bookmark,
    };
    if (loops > 260) break;
  }

  return { loops, errors, completed };
}

async function main(): Promise<void> {
  const days = collectDays();
  console.log(
    JSON.stringify({
      event: 'start',
      range: { start: dayKey(rangeStart), end: dayKey(rangeEnd) },
      resumeFrom: dayKey(days[0] || rangeStart),
      totalDays: days.length,
    })
  );

  let done = 0;
  let failed = 0;
  let totalLoops = 0;
  for (const d of days) {
    const result = await rebuildDay(d);
    totalLoops += result.loops;
    if (!result.completed || result.errors > 0) failed += 1;
    done += 1;
    console.log(
      JSON.stringify({
        event: 'day_done',
        day: dayKey(d),
        done,
        total: days.length,
        loops: result.loops,
        errors: result.errors,
        completed: result.completed,
      })
    );
  }

  console.log(
    JSON.stringify({
      event: 'finish',
      processedDays: days.length,
      failedDays: failed,
      totalLoops,
    })
  );
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: 'fatal', error: String(error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
