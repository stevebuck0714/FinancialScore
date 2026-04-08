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
      contractValue: true,
      invoicedAmount: true,
      remainingAmount: true,
    },
    take: 300000,
    orderBy: [{ snapshotDate: 'desc' }],
  });

  const dedup = new Map<string, { orderDate: Date | null; wip: number }>();
  for (const r of rows) {
    const key = `${r.orderId}|${r.lineId}`;
    if (dedup.has(key)) continue;
    const contract = Number(r.contractValue || 0);
    const invoiced = Number(r.invoicedAmount || 0);
    const rem = Number(r.remainingAmount || 0);
    const wip = rem > 0 ? rem : Math.max(contract - invoiced, 0);
    dedup.set(key, { orderDate: r.orderDate ?? null, wip });
  }

  const byYear: Record<string, { lines: number; wip: number }> = {};
  for (const v of dedup.values()) {
    if (v.wip <= 0) continue;
    const year = v.orderDate ? String(v.orderDate.getUTCFullYear()) : 'UNKNOWN';
    if (!byYear[year]) byYear[year] = { lines: 0, wip: 0 };
    byYear[year].lines += 1;
    byYear[year].wip += v.wip;
  }

  console.log(
    JSON.stringify(
      {
        companyId,
        latestSnapshotDate: start.toISOString().slice(0, 10),
        openWipLines: Object.values(byYear).reduce((s, x) => s + x.lines, 0),
        byYear,
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

