const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMappings() {
  try {
    const mappings = await prisma.accountMapping.findMany({
      where: { companyId: 'cmgmttbfh0004qhgwm6vd9oa5' }
    });
    
    console.log('Total mappings in DB:', mappings.length);
    
    if (mappings.length > 0) {
      console.log('\nFirst 10 mappings:');
      mappings.slice(0, 10).forEach(m => {
        console.log(`  ${m.qbAccount} -> ${m.targetField}`);
      });
    } else {
      console.log('❌ NO MAPPINGS FOUND IN DATABASE');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMappings();

