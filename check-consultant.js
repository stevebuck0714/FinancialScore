const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConsultant() {
  try {
    console.log('Checking consultant: Corelytics addcompamytest');

    const consultant = await prisma.consultant.findFirst({
      where: {
        OR: [
          { fullName: 'Corelytics addcompamytest' },
          { user: { email: { contains: 'Corelytics' } } }
        ]
      },
      include: {
        user: true,
        companies: true
      }
    });

    if (consultant) {
      console.log('Found consultant:', {
        id: consultant.id,
        name: consultant.fullName,
        userId: consultant.userId,
        userEmail: consultant.user?.email,
        companyCount: consultant.companies?.length || 0
      });

      if (consultant.companies && consultant.companies.length > 0) {
        console.log('Companies:');
        consultant.companies.forEach(company => {
          console.log('  -', company.name, '(ID:', company.id + ')');
        });
      }
    } else {
      console.log('Consultant not found in local database');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkConsultant();
