require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function checkConsultantData() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking consultant and company data...\n');

    // Check consultant
    const consultant = await prisma.consultant.findUnique({
      where: { id: 'cmix30pr40002l80411fzzb77' }
    });
    console.log('👤 Consultant exists:', !!consultant);
    if (consultant) {
      console.log('   ID:', consultant.id);
      console.log('   Name:', consultant.fullName);
      console.log('   User ID:', consultant.userId);
    } else {
      console.log('❌ Consultant not found!');
    }

    // Check companies for this consultant
    const companies = await prisma.company.findMany({
      where: { consultantId: 'cmix30pr40002l80411fzzb77' }
    });
    console.log('\n🏢 Companies for consultant:', companies.length);
    companies.forEach(company => {
      console.log(`   - ${company.name} (${company.id})`);
    });

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: 'corelyticstest5@yahoo.com' }
    });
    console.log('\n👨‍💻 User exists:', !!user);
    if (user) {
      console.log('   Name:', user.name);
      console.log('   Role:', user.role);
      console.log('   Company ID:', user.companyId);
      console.log('   Consultant ID:', user.consultantId);
    } else {
      console.log('❌ User not found!');
    }

  } catch (error) {
    console.error('❌ Error checking data:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkConsultantData();



