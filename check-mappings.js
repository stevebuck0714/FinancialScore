const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMappings() {
  try {
    const mappings = await prisma.accountMapping.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('Total mappings in DB:', mappings.length);
    
    if (mappings.length > 0) {
      console.log('\nFirst mapping:');
      console.log('  Company ID:', mappings[0].companyId);
      console.log('  QB Account:', mappings[0].qbAccount);
      console.log('  Target Field:', mappings[0].targetField);
      console.log('  Classification:', mappings[0].qbAccountClassification);
      
      // Count by company
      const allMappings = await prisma.accountMapping.findMany();
      const byCompany = {};
      allMappings.forEach(m => {
        byCompany[m.companyId] = (byCompany[m.companyId] || 0) + 1;
      });
      
      console.log('\nMappings per company:');
      Object.entries(byCompany).forEach(([companyId, count]) => {
        console.log(`  ${companyId}: ${count} mappings`);
      });
    } else {
      console.log('❌ No mappings found in database!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMappings();

