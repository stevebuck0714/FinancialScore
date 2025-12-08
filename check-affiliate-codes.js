const { PrismaClient } = require('@prisma/client');

async function checkAffiliateCodes() {
  const prisma = new PrismaClient();

  try {
    console.log('Checking affiliate codes in database...');

    const codes = await prisma.affiliateCode.findMany({
      select: {
        code: true,
        monthlyPrice: true,
        quarterlyPrice: true,
        annualPrice: true,
        isActive: true,
        affiliate: {
          select: {
            name: true
          }
        }
      }
    });

    console.log('Found affiliate codes:', codes.length);
    codes.forEach(code => {
      console.log(`- ${code.code}: $${code.monthlyPrice}/$${code.quarterlyPrice}/$${code.annualPrice} (${code.isActive ? 'active' : 'inactive'}) - ${code.affiliate.name}`);
    });

    // Check companies with affiliate codes
    const companies = await prisma.company.findMany({
      where: {
        affiliateCode: {
          not: null
        }
      },
      select: {
        name: true,
        affiliateCode: true
      }
    });

    console.log('\nCompanies with affiliate codes:', companies.length);
    companies.forEach(company => {
      console.log(`- ${company.name}: ${company.affiliateCode}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAffiliateCodes();
