const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBenchmarkData() {
  try {
    const count = await prisma.industryBenchmark.count();
    console.log('Total benchmark records:', count);
    
    if (count > 0) {
      const sample = await prisma.industryBenchmark.findMany({
        take: 5,
        select: {
          industryId: true,
          industryName: true,
          metricName: true,
          fiveYearValue: true
        }
      });
      console.log('Sample records:');
      sample.forEach(record => {
        console.log(`- Industry ${record.industryId} (${record.industryName}): ${record.metricName} = ${record.fiveYearValue}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBenchmarkData();




