import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const startIso = process.argv[3] || '2026-01-07';
const endIso = process.argv[4] || '2026-04-07';

async function main() {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T23:59:59.999Z`);

  const [salesRows, orderRows, orderAny] = await Promise.all([
    prisma.customerSalesSnapshot.count({
      where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    }),
    prisma.customerOrderLineSnapshot.count({
      where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    }),
    prisma.customerOrderLineSnapshot.findFirst({
      where: { companyId, frequency: 'daily' },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        companyId,
        startIso,
        endIso,
        customerSalesSnapshotRows: salesRows,
        customerOrderLineSnapshotRowsInWindow: orderRows,
        latestOrderLineSnapshotDate: orderAny?.snapshotDate?.toISOString() || null,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

