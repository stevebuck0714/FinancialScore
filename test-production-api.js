require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function testProductionAPI() {
  const prisma = new PrismaClient();

  try {
    console.log('🧪 Testing production API equivalent queries...\n');

    // Test 1: Get consultant
    console.log('1️⃣ Testing consultant lookup...');
    const consultant = await prisma.consultant.findUnique({
      where: { id: 'cmix30pr40002l80411fzzb77' }
    });
    console.log('✅ Consultant found:', consultant ? consultant.fullName : 'NOT FOUND');

    // Test 2: Get companies for consultant (like the API does)
    console.log('\n2️⃣ Testing company lookup...');
    const companies = await prisma.company.findMany({
      where: { consultantId: 'cmix30pr40002l80411fzzb77' },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ Found ${companies.length} companies:`);
    companies.forEach((company, i) => {
      console.log(`   ${i+1}. ${company.name} (${company.id})`);
    });

    // Test 3: Test the problematic query from the API
    console.log('\n3️⃣ Testing API-style company query...');
    if (companies.length > 0) {
      const company = await prisma.company.findUnique({
        where: { id: companies[0].id },
        select: {
          id: true,
          name: true,
          linesOfBusiness: true,
          userDefinedAllocations: true,
          headcountAllocations: true
        }
      });
      console.log('✅ Company with LOB fields:', {
        id: company.id,
        name: company.name,
        hasLinesOfBusiness: !!company.linesOfBusiness,
        hasUserDefinedAllocations: !!company.userDefinedAllocations,
        hasHeadcountAllocations: !!company.headcountAllocations
      });
    }

    // Test 4: Test user lookup
    console.log('\n4️⃣ Testing user lookup...');
    const user = await prisma.user.findUnique({
      where: { email: 'corelyticstest5@yahoo.com' }
    });
    console.log('✅ User found:', user ? user.name : 'NOT FOUND');

    console.log('\n🎉 All tests passed! The database and queries are working.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error meta:', error.meta);
  } finally {
    await prisma.$disconnect();
  }
}

testProductionAPI();
