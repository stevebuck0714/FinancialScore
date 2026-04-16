import prisma from '@/lib/prisma';

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Deletes operational snapshot/fact rows for a company in [rangeStart, rangeEnd] (calendar bounds).
 * Used before re-ingesting a rolling window or a single backfill month.
 */
export async function deleteQuickBooksOperationalDataInRange(
  companyId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<void> {
  const start = startOfUtcDay(rangeStart);
  const end = endOfUtcDay(rangeEnd);

  await prisma.$transaction([
    prisma.cashSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.aRAgingSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.aPAgingSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.aROpenInvoiceSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.aRPaymentFact.deleteMany({
      where: { companyId, paymentDate: { gte: start, lte: end } },
    }),
    prisma.aPOpenBillSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.aPPaymentFact.deleteMany({
      where: { companyId, paymentDate: { gte: start, lte: end } },
    }),
    prisma.customerSalesSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.productSalesSnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
    prisma.inventorySnapshot.deleteMany({
      where: { companyId, snapshotDate: { gte: start, lte: end } },
    }),
  ]);
}
