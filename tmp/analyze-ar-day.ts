import prisma from '@/lib/prisma';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const dayIso = process.argv[3] || '2026-03-31';
const day = new Date(`${dayIso}T00:00:00.000Z`);
const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
const frequency = 'daily';

async function main() {
  const [openTotals, openByProgram, openByStatus, agingRows, paymentTotals] = await Promise.all([
    prisma.aROpenInvoiceSnapshot.aggregate({
      where: { companyId, frequency, snapshotDate: day },
      _count: { _all: true },
      _sum: { amountDueHome: true, amountHome: true },
    }),
    prisma.$queryRaw<Array<{ sourceProgram: string | null; cnt: number; total: number }>>`
      SELECT
        NULLIF(TRIM(COALESCE("sourceProgram", '')), '') AS "sourceProgram",
        COUNT(*)::int AS cnt,
        COALESCE(SUM("amountDueHome"), 0)::float AS total
      FROM "AROpenInvoiceSnapshot"
      WHERE "companyId" = ${companyId}
        AND "frequency" = ${frequency}
        AND "snapshotDate" = ${day}
      GROUP BY "sourceProgram"
      ORDER BY total DESC
    `,
    prisma.$queryRaw<Array<{ status: string | null; cnt: number; total: number }>>`
      SELECT
        NULLIF(TRIM(COALESCE(status, '')), '') AS status,
        COUNT(*)::int AS cnt,
        COALESCE(SUM("amountDueHome"), 0)::float AS total
      FROM "AROpenInvoiceSnapshot"
      WHERE "companyId" = ${companyId}
        AND "frequency" = ${frequency}
        AND "snapshotDate" = ${day}
      GROUP BY status
      ORDER BY total DESC
    `,
    prisma.aRAgingSnapshot.findMany({
      where: { companyId, frequency, snapshotDate: day },
      select: {
        totalAR: true,
        current: true,
        days1to30: true,
        days31to60: true,
        days61to90: true,
        days90plus: true,
      },
    }),
    prisma.aRPaymentFact.aggregate({
      where: { companyId, paymentDate: { gte: day, lt: nextDay } },
      _count: { _all: true },
      _sum: { paidAmountHome: true },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        companyId,
        day: dayIso,
        openTotals: {
          count: openTotals._count._all,
          amountDueHome: Number(openTotals._sum.amountDueHome || 0),
          amountHome: Number(openTotals._sum.amountHome || 0),
        },
        openByProgram: openByProgram.map((row) => ({
          sourceProgram: row.sourceProgram || '(null)',
          count: Number(row.cnt || 0),
          total: Number(row.total || 0),
        })),
        openByStatus: openByStatus.map((row) => ({
          status: row.status || '(null)',
          count: Number(row.cnt || 0),
          total: Number(row.total || 0),
        })),
        agingRows: agingRows.map((row) => ({
          totalAR: Number(row.totalAR || 0),
          current: Number(row.current || 0),
          days1to30: Number(row.days1to30 || 0),
          days31to60: Number(row.days31to60 || 0),
          days61to90: Number(row.days61to90 || 0),
          days90plus: Number(row.days90plus || 0),
        })),
        paymentTotals: {
          count: paymentTotals._count._all,
          paidAmountHome: Number(paymentTotals._sum.paidAmountHome || 0),
        },
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
