// Check user and consultant associations
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserAssociation() {
  try {
    console.log('DATABASE:', process.env.DATABASE_URL?.includes('cold-frost') ? 'DEV (cold-frost)' : 'PROD (orange-poetry)');

    // Check the user
    const user = await prisma.user.findUnique({
      where: { email: 'corelyticsdevtest@test.com' },
      include: {
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    console.log('\nUser:', user?.email);
    console.log('Role:', user?.role);
    console.log('consultantId field:', user?.consultantId);
    console.log('primaryConsultant:', user?.primaryConsultant);
    console.log('consultantFirm:', user?.consultantFirm);

    if (user?.primaryConsultant) {
      console.log('Primary consultant ID:', user.primaryConsultant.id);
      console.log('Primary consultant name:', user.primaryConsultant.fullName);
    }

    if (user?.consultantFirm) {
      console.log('Consultant firm ID:', user.consultantFirm.id);
      console.log('Consultant firm name:', user.consultantFirm.fullName);
    }

    // Check what consultantId should be returned by login
    const consultant = user?.primaryConsultant || user?.consultantFirm;
    const consultantId = consultant?.id || user?.consultantId;
    console.log('\nCalculated consultantId for login:', consultantId);

    // Check companies associated with this consultantId
    if (consultantId) {
      const companies = await prisma.company.findMany({
        where: { consultantId: consultantId },
        select: { id: true, name: true }
      });

      console.log('\nCompanies associated with consultantId', consultantId + ':');
      companies.forEach(company => {
        console.log(`- "${company.name}" (ID: ${company.id})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserAssociation();




