const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkData() {
  try {
    // Get all financial records
    const records = await prisma.financialRecord.findMany({
      include: {
        monthlyData: true,
      },
    });

    console.log('\n=== Financial Records ===');
    console.log(`Total records: ${records.length}`);
    
    for (const record of records) {
      console.log(`\nRecord ID: ${record.id}`);
      console.log(`Company ID: ${record.companyId}`);
      console.log(`File Name: ${record.fileName}`);
      console.log(`Monthly records: ${record.monthlyData.length}`);
      
      if (record.monthlyData.length > 0) {
        const sample = record.monthlyData[0];
        console.log(`Sample month: ${sample.monthDate}`);
        console.log(`  Revenue: ${sample.revenue}`);
        console.log(`  Expense: ${sample.expense}`);
        console.log(`  Total Assets: ${sample.totalAssets}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();

