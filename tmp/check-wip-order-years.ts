import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const latest = await prisma.customerOrderLineSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest?.snapshotDate) {
    console.log(JSON.stringify({ companyId, message: 'No order line snapshots found' }, null, 2));
    return;
  }
  const start = new Date(latest.snapshotDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);

  const rows = await prisma.customerOrderLineSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: { gte: start, lte: end },
    },
    select: {
      orderId: true,
      lineId: true,
      orderDate: true,
      customerName: true,
      qtyOrdered: true,
      qtyInvoiced: true,
      unitPrice: true,
      contractValue: true,
      invoicedAmount: true,
      remainingAmount: true,
    },
    take: 300000,
    orderBy: [{ snapshotDate: 'desc' }],
  });

  const dedup = new Map<
    string,
    {
      orderDate: Date | null;
      customerName: string;
      orderId: string;
      lineId: string;
      qtyOrdered: number;
      qtyInvoiced: number;
      contract: number;
      invoiced: number;
      remaining: number;
      wipUsed: number;
      wipReason: string;
    }
  >();
  for (const r of rows) {
    const key = `${r.orderId}|${r.lineId}`;
    if (dedup.has(key)) continue;
    const contract = Number(r.contractValue || 0);
    const invoiced = Number(r.invoicedAmount || 0);
    const remaining = Number(r.remainingAmount || 0);
    const qtyOrdered = Number(r.qtyOrdered || 0);
    const qtyInvoiced = Number(r.qtyInvoiced || 0);

    let wipUsed: number;
    let wipReason: string;

    if (qtyOrdered > 0 && qtyInvoiced + 1e-4 >= qtyOrdered) {
      wipUsed = 0;
      wipReason = 'qty_complete';
    } else if (remaining > 0) {
      wipUsed = remaining;
      wipReason = 'stored_remaining';
    } else if (remaining === 0 && contract > 0 && contract > invoiced) {
      wipUsed = contract - invoiced;
      wipReason = 'computed_gap';
    } else {
      wipUsed = 0;
      wipReason = 'zero';
    }

    dedup.set(key, {
      orderDate: r.orderDate ?? null,
      customerName: r.customerName,
      orderId: r.orderId,
      lineId: r.lineId,
      qtyOrdered,
      qtyInvoiced,
      contract,
      invoiced,
      remaining,
      wipUsed,
      wipReason,
    });
  }

  // --- By year: ALL lines ---
  const allByYear: Record<string, { totalLines: number; wipLines: number; wip: number; qtyCompleteLines: number; computedGapLines: number }> = {};
  for (const v of dedup.values()) {
    const year = v.orderDate ? String(v.orderDate.getUTCFullYear()) : 'UNKNOWN';
    if (!allByYear[year]) allByYear[year] = { totalLines: 0, wipLines: 0, wip: 0, qtyCompleteLines: 0, computedGapLines: 0 };
    allByYear[year].totalLines += 1;
    if (v.wipUsed > 0) {
      allByYear[year].wipLines += 1;
      allByYear[year].wip += v.wipUsed;
    }
    if (v.wipReason === 'qty_complete') allByYear[year].qtyCompleteLines += 1;
    if (v.wipReason === 'computed_gap') allByYear[year].computedGapLines += 1;
  }

  // --- Sample of lines from 2024+ ---
  const recentLines = Array.from(dedup.values())
    .filter((v) => v.orderDate && v.orderDate.getUTCFullYear() >= 2024)
    .sort((a, b) => (b.orderDate?.getTime() || 0) - (a.orderDate?.getTime() || 0))
    .slice(0, 20)
    .map((v) => ({
      orderId: v.orderId,
      lineId: v.lineId,
      orderDate: v.orderDate?.toISOString().slice(0, 10) ?? null,
      customer: v.customerName.slice(0, 40),
      qtyOrd: v.qtyOrdered,
      qtyInv: v.qtyInvoiced,
      contract: v.contract,
      invoiced: v.invoiced,
      storedRemaining: v.remaining,
      wipUsed: v.wipUsed,
      wipReason: v.wipReason,
    }));

  // --- Sample of OLD lines that still show WIP ---
  const oldPhantomWip = Array.from(dedup.values())
    .filter((v) => v.wipUsed > 0 && v.orderDate && v.orderDate.getUTCFullYear() <= 2020)
    .sort((a, b) => b.wipUsed - a.wipUsed)
    .slice(0, 15)
    .map((v) => ({
      orderId: v.orderId,
      lineId: v.lineId,
      orderDate: v.orderDate?.toISOString().slice(0, 10) ?? null,
      customer: v.customerName.slice(0, 40),
      qtyOrd: v.qtyOrdered,
      qtyInv: v.qtyInvoiced,
      contract: v.contract,
      invoiced: v.invoiced,
      storedRemaining: v.remaining,
      wipUsed: v.wipUsed,
      wipReason: v.wipReason,
    }));

  console.log(
    JSON.stringify(
      {
        companyId,
        latestSnapshotDate: start.toISOString().slice(0, 10),
        totalUniqueLines: dedup.size,
        byYear: Object.fromEntries(
          Object.entries(allByYear).sort(([a], [b]) => a.localeCompare(b))
        ),
        recentLines_2024plus: recentLines,
        oldPhantomWip_pre2021: oldPhantomWip,
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
