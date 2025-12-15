require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function copyTestDataToProd() {
  const prisma = new PrismaClient();

  try {
    console.log('🔄 Copying test user data to production database...\n');

    // First, let's check what data we need to copy
    console.log('📊 Gathering data from dev database...');

    // Get the user
    const user = await prisma.user.findUnique({
      where: { email: 'corelyticstest5@yahoo.com' }
    });

    if (!user) {
      console.log('❌ User corelyticstest5@yahoo.com not found in dev database');
      return;
    }

    console.log('👤 Found user:', user.name, user.email);

    // Get the consultant
    const consultant = await prisma.consultant.findUnique({
      where: { id: user.consultantId }
    });

    if (!consultant) {
      console.log('❌ Consultant not found for user');
      return;
    }

    console.log('👨‍💼 Found consultant:', consultant.fullName);

    // Get companies for this consultant
    const companies = await prisma.company.findMany({
      where: { consultantId: consultant.id }
    });

    console.log('🏢 Found companies:', companies.length);
    companies.forEach(company => {
      console.log(`   - ${company.name}`);
    });

    // Now create this data in production
    console.log('\n🚀 Creating data in production database...');

    // Create consultant first
    const createdConsultant = await prisma.consultant.create({
      data: {
        id: consultant.id,
        userId: consultant.userId,
        fullName: consultant.fullName,
        type: consultant.type,
        revenueSharePercentage: consultant.revenueSharePercentage,
        createdAt: consultant.createdAt,
        updatedAt: consultant.updatedAt
      }
    });
    console.log('✅ Created consultant:', createdConsultant.fullName);

    // Create user
    const createdUser = await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        name: user.name,
        title: user.title,
        role: user.role,
        userType: user.userType,
        companyId: user.companyId,
        consultantId: user.consultantId,
        isPrimaryContact: user.isPrimaryContact,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        passwordResetExpires: user.passwordResetExpires,
        passwordResetToken: user.passwordResetToken,
        backupCodes: user.backupCodes,
        mfaEnabled: user.mfaEnabled,
        mfaSecret: user.mfaSecret
      }
    });
    console.log('✅ Created user:', createdUser.name);

    // Create companies
    for (const company of companies) {
      const createdCompany = await prisma.company.create({
        data: {
          id: company.id,
          name: company.name,
          consultantId: company.consultantId,
          addressStreet: company.addressStreet,
          addressCity: company.addressCity,
          addressState: company.addressState,
          addressZip: company.addressZip,
          addressCountry: company.addressCountry,
          industrySector: company.industrySector,
          subscriptionMonthlyPrice: company.subscriptionMonthlyPrice,
          subscriptionQuarterlyPrice: company.subscriptionQuarterlyPrice,
          subscriptionAnnualPrice: company.subscriptionAnnualPrice,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          selectedSubscriptionPlan: company.selectedSubscriptionPlan,
          affiliateCode: company.affiliateCode,
          affiliateId: company.affiliateId,
          subscriptionStatus: company.subscriptionStatus,
          subscriptionStartDate: company.subscriptionStartDate,
          nextBillingDate: company.nextBillingDate,
          lastBillingDate: company.lastBillingDate,
          linesOfBusiness: company.linesOfBusiness,
          headcountAllocations: company.headcountAllocations,
          userDefinedAllocations: company.userDefinedAllocations
        }
      });
      console.log('✅ Created company:', createdCompany.name);
    }

    console.log('\n🎉 Successfully copied all test data to production!');
    console.log('📊 Summary:');
    console.log(`   - 1 Consultant: ${createdConsultant.fullName}`);
    console.log(`   - 1 User: ${createdUser.name}`);
    console.log(`   - ${companies.length} Companies`);

  } catch (error) {
    console.error('❌ Error copying data:', error.message);
    if (error.code === 'P2002') {
      console.log('💡 This might mean the data already exists in production');
    }
  } finally {
    await prisma.$disconnect();
  }
}

copyTestDataToProd();








