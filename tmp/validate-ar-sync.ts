import prisma from '@/lib/prisma';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const day = new Date(process.env.AR_VALIDATE_DAY || '2026-03-31T00:00:00.000Z');
const maxLoops = Number(process.env.AR_VALIDATE_MAX_LOOPS || 60);

async function main() {
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

  while (loops < maxLoops) {
    loops += 1;
    const res = await syncInforM3OperationalData(
      companyId,
      'daily',
      undefined,
      { startDate: day, endDate: day, mode: 'manual' },
      continuation
        ? {
            snapshotDateOverride: day,
            skipPrune: true,
            programOffset: continuation.programOffset,
            requestOffset: continuation.requestOffset,
            bookmark: continuation.bookmark || null,
          }
        : {
            snapshotDateOverride: day,
            skipPrune: true,
          }
    );

    totalCreated += Number(res.recordsCreated || 0);
    totalErrors += Array.isArray(res.errors) ? res.errors.length : 0;
    console.log(
      JSON.stringify({
        event: 'sync_pass',
        loops,
        hasMore: Boolean(res.hasMore),
        recordsCreated: Number(res.recordsCreated || 0),
        errors: Array.isArray(res.errors) ? res.errors.length : 0,
      })
    );

    if (!res.hasMore || !res.continuation) break;
    continuation = {
      programOffset: res.continuation.programOffset,
      requestOffset: res.continuation.requestOffset,
      bookmark: res.continuation.bookmark || null,
    };
  }

  const [openCount, agingCount, paymentCount, latestOpen, latestAging] = await Promise.all([
    prisma.aROpenInvoiceSnapshot.count({
      where: { companyId, frequency: 'daily', snapshotDate: day },
    }),
    prisma.aRAgingSnapshot.count({
      where: { companyId, frequency: 'daily', snapshotDate: day },
    }),
    prisma.aRPaymentFact.count({
      where: { companyId, paymentDate: { gte: day, lte: new Date(day.getTime() + 86400000 - 1) } },
    }),
    prisma.aROpenInvoiceSnapshot.findFirst({
      where: { companyId, frequency: 'daily', snapshotDate: day },
      orderBy: { amountDueHome: 'desc' },
      select: { customerName: true, invoiceNo: true, amountDueHome: true, dueDate: true },
    }),
    prisma.aRAgingSnapshot.findFirst({
      where: { companyId, frequency: 'daily', snapshotDate: day },
      orderBy: { totalAR: 'desc' },
      select: { totalAR: true, current: true, days1to30: true, days31to60: true, days61to90: true, days90plus: true },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        event: 'validation_summary',
        day: day.toISOString().slice(0, 10),
        loops,
        endedByCap: Boolean(loops >= maxLoops && continuation),
        maxLoops,
        totalCreated,
        totalErrors,
        openCount,
        agingCount,
        paymentCount,
        latestOpen,
        latestAging,
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
