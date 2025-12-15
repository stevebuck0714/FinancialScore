const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCompanies() {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true
      }
    });

    console.log('Companies in database:');
    companies.forEach(company => {
      console.log(`- ${company.name} (ID: ${company.id}) - Created: ${company.createdAt}`);
    });

    // Check if any company name contains 'test' or 'free' or 'code'
    const matchingCompanies = companies.filter(c =>
      c.name.toLowerCase().includes('test') ||
      c.name.toLowerCase().includes('free') ||
      c.name.toLowerCase().includes('code')
    );

    if (matchingCompanies.length > 0) {
      console.log('\nMatching companies:');
      matchingCompanies.forEach(company => {
        console.log(`- ${company.name} (ID: ${company.id})`);
      });
    } else {
      console.log('\nNo companies found with "test", "free", or "code" in the name.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCompanies();