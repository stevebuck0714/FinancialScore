import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const customerName = process.argv[3] || 'Daikin Comfort Technologies Mfg., Inc.';

async function main() {
  const [orderLine, salesSnapshot] = await Promise.all([
    prisma.customerOrderLineSnapshot.findMany({
      where: { companyId, customerName },
      select: { customerId: true, customerName: true },
      distinct: ['customerId'],
      take: 20,
    }),
    prisma.customerSalesSnapshot.findMany({
      where: { companyId, customerName },
      select: { customerId: true, customerName: true },
      distinct: ['customerId'],
      take: 20,
    }),
  ]);
  console.log(JSON.stringify({ companyId, customerName, orderLine, salesSnapshot }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

