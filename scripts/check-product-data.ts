import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmk05mu380000l804b4v9j6g1';

async function checkData() {
  console.log('🔍 Checking product sales data...\n');
  
  const products = await prisma.productSalesSnapshot.findMany({
    where: { companyId },
    orderBy: { snapshotDate: 'desc' },
    take: 10
  });
  
  console.log(`Found ${products.length} product sales records\n`);
  
  if (products.length > 0) {
    console.log('Sample records:');
    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.itemName} - ${p.snapshotDate.toISOString().split('T')[0]} - ${p.frequency} - $${p.revenue.toFixed(2)}`);
    });
  }
  
  await prisma.$disconnect();
}

checkData();

