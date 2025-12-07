// Check companies and their associations
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCompanies() {
  try {
    console.log('DATABASE:', process.env.DATABASE_URL?.includes('cold-frost') ? 'DEV (cold-frost)' : 'PROD (orange-poetry)');

    const companies = await prisma.company.findMany({
      include: {
        consultant: {
          select: { id: true, fullName: true, user: { select: { email: true } } }
        },
        users: {
          select: { id: true, email: true, name: true }
        },
        _count: {
          select: { users: true, financialRecords: true }
        }
      }
    });

    console.log('\nCompanies in database:');
    companies.forEach(company => {
      console.log(`- "${company.name}" (ID: ${company.id})`);
      console.log(`  Consultant: ${company.consultant?.fullName || 'None'} (${company.consultant?.user?.email || 'N/A'})`);
      console.log(`  Users: ${company.users.length}`);
      console.log(`  Financial Records: ${company._count.financialRecords}`);
      console.log('');
    });

    // Also check consultants
    const consultants = await prisma.consultant.findMany({
      select: {
        id: true,
        fullName: true,
        user: { select: { email: true } }
      }
    });

    console.log('Consultants:');
    consultants.forEach(consultant => {
      console.log(`- ${consultant.fullName} (${consultant.user?.email}) - ID: ${consultant.id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCompanies();