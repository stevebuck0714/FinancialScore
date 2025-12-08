const { PrismaClient } = require('@prisma/client');

async function checkCompanies() {
  const prisma = new PrismaClient();

  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        affiliateCode: true,
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
        selectedSubscriptionPlan: true
      }
    });

    console.log('=== COMPANIES AND AFFILIATE CODES ===');
    console.log(`Found ${companies.length} companies:\n`);

    companies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.name}`);
      console.log(`   ID: ${company.id}`);
      console.log(`   Affiliate Code: ${company.affiliateCode || 'NONE'}`);
      console.log(`   Prices (M/Q/A): ${company.subscriptionMonthlyPrice}/${company.subscriptionQuarterlyPrice}/${company.subscriptionAnnualPrice}`);
      console.log(`   Selected Plan: ${company.selectedSubscriptionPlan || 'NONE'}`);
      console.log('');
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error checking companies:', error);
    process.exit(1);
  }
}

checkCompanies();