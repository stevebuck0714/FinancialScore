import prisma from '../lib/prisma';

async function addSubscriptionPricing() {
  try {
    // Update all companies with default subscription pricing
    const result = await prisma.company.updateMany({
      where: {
        subscriptionMonthlyPrice: null
      },
      data: {
        subscriptionMonthlyPrice: 99.00,
        subscriptionQuarterlyPrice: 267.00,  // 10% savings
        subscriptionAnnualPrice: 950.00      // 20% savings
      }
    });

    console.log(`✅ Updated ${result.count} companies with subscription pricing`);
    
    // Show all companies
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true
      }
    });
    
    console.log('\n📋 Current Companies:');
    companies.forEach(company => {
      console.log(`\n${company.name} (${company.id})`);
      console.log(`  Monthly: $${company.subscriptionMonthlyPrice}`);
      console.log(`  Quarterly: $${company.subscriptionQuarterlyPrice}`);
      console.log(`  Annual: $${company.subscriptionAnnualPrice}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addSubscriptionPricing();

