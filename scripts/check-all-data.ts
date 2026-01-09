import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmk05mu380000l804b4v9j6g1';

async function checkAllData() {
  console.log('🔍 Checking all operational data for company:', companyId);
  console.log('');

  const counts = {
    customerSales: await prisma.customerSalesSnapshot.count({ where: { companyId } }),
    productSales: await prisma.productSalesSnapshot.count({ where: { companyId } }),
    arAging: await prisma.aRAgingSnapshot.count({ where: { companyId } }),
    apAging: await prisma.aPAgingSnapshot.count({ where: { companyId } }),
    inventory: await prisma.inventorySnapshot.count({ where: { companyId } }),
    cash: await prisma.cashSnapshot.count({ where: { companyId } })
  };

  console.log('Record counts:');
  console.log('  Customer Sales:', counts.customerSales);
  console.log('  Product Sales:', counts.productSales);
  console.log('  AR Aging:', counts.arAging);
  console.log('  AP Aging:', counts.apAging);
  console.log('  Inventory:', counts.inventory);
  console.log('  Cash:', counts.cash);
  console.log('');

  if (counts.productSales > 0) {
    console.log('Sample product sales records:');
    const samples = await prisma.productSalesSnapshot.findMany({
      where: { companyId },
      orderBy: { snapshotDate: 'desc' },
      take: 5
    });
    samples.forEach((s, i) => {
      console.log(`  ${i+1}. ${s.itemName} - ${s.snapshotDate.toISOString().split('T')[0]} - ${s.frequency} - $${s.revenue.toFixed(2)}`);
    });
  }

  await prisma.$disconnect();
}

checkAllData();

