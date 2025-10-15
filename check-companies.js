const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCompanies() {
  try {
    // Get all companies
    const companies = await prisma.company.findMany({
      select: { id: true, name: true }
    });
    
    console.log('\n=== ALL COMPANIES ===');
    for (const company of companies) {
      const mappingCount = await prisma.accountMapping.count({
        where: { companyId: company.id }
      });
      console.log(`${company.name}: ${mappingCount} mappings (ID: ${company.id})`);
    }
    
    // Look for Blue Sky specifically
    const blueSky = companies.find(c => c.name.toLowerCase().includes('blue sky'));
    if (blueSky) {
      console.log('\n=== BLUE SKY RESOURCES MAPPINGS ===');
      const mappings = await prisma.accountMapping.findMany({
        where: { companyId: blueSky.id },
        take: 5
      });
      
      if (mappings.length > 0) {
        console.log('First 5 mappings:');
        mappings.forEach(m => {
          console.log(`  ${m.qbAccount} -> ${m.targetField}`);
        });
      } else {
        console.log('❌ NO MAPPINGS FOUND FOR BLUE SKY');
      }
    } else {
      console.log('\n⚠️  Could not find Blue Sky Resources in database');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkCompanies();

