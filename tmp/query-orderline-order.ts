import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const orderNo = (process.argv[2] || '43149').trim();
const companyIdArg = (process.argv[3] || '').trim();

async function main() {
  const rows = await prisma.customerOrderLineSnapshot.findMany({
    where: {
      ...(companyIdArg ? { companyId: companyIdArg } : {}),
      orderId: { contains: orderNo },
    },
    select: {
      companyId: true,
      snapshotDate: true,
      customerId: true,
      customerName: true,
      orderId: true,
      lineId: true,
      orderDate: true,
      itemId: true,
      itemName: true,
      sku: true,
      qtyOrdered: true,
      qtyInvoiced: true,
      unitPrice: true,
      contractValue: true,
      invoicedAmount: true,
      remainingAmount: true,
      sourceProgram: true,
    },
    orderBy: [{ snapshotDate: 'asc' }, { lineId: 'asc' }],
    take: 200,
  });
  console.log(
    JSON.stringify(
      {
        orderNo,
        companyFilter: companyIdArg || null,
        rowCount: rows.length,
        rows: rows.map((r) => ({
          ...r,
          snapshotDate: r.snapshotDate.toISOString(),
          orderDate: r.orderDate ? r.orderDate.toISOString().slice(0, 10) : null,
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

