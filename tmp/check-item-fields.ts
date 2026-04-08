import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const [totalRows, rowsWithAnyItem] = await Promise.all([
    prisma.customerOrderLineSnapshot.count({
      where: { companyId, frequency: 'daily' },
    }),
    prisma.customerOrderLineSnapshot.count({
      where: {
        companyId,
        frequency: 'daily',
        OR: [{ itemId: { not: null } }, { sku: { not: null } }, { itemName: { not: null } }],
      },
    }),
  ]);

  const sample = await prisma.customerOrderLineSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      OR: [{ itemId: { not: null } }, { sku: { not: null } }, { itemName: { not: null } }],
    },
    select: {
      snapshotDate: true,
      orderId: true,
      lineId: true,
      itemId: true,
      sku: true,
      itemName: true,
    },
    orderBy: [{ snapshotDate: 'desc' }],
    take: 10,
  });

  console.log(
    JSON.stringify(
      {
        companyId,
        totalRows,
        rowsWithAnyItem,
        sample: sample.map((row) => ({
          ...row,
          snapshotDate: row.snapshotDate.toISOString(),
        })),
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

