require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function checkAllUsers() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking all users in database...\n');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        consultantId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    console.log(`Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - ${user.role} - Created: ${user.createdAt.toISOString().split('T')[0]}`);
      if (user.consultantId) {
        console.log(`   Consultant ID: ${user.consultantId}`);
      }
    });

    // Check consultants
    const consultants = await prisma.consultant.findMany({
      select: {
        id: true,
        fullName: true,
        userId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`\nFound ${consultants.length} consultants:`);
    consultants.forEach((consultant, index) => {
      console.log(`${index + 1}. ${consultant.fullName} (${consultant.userId}) - ID: ${consultant.id}`);
    });

    // Check recent companies
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        consultantId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`\nFound ${companies.length} recent companies:`);
    companies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.name} - ID: ${company.id}`);
      if (company.consultantId) {
        console.log(`   Consultant: ${company.consultantId}`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllUsers();








