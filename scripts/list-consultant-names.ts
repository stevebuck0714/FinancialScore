import prisma from '../lib/prisma';

async function listConsultantNames() {
  console.log('📋 Current consultant company names:\n');

  try {
    const consultants = await prisma.consultant.findMany({
      include: {
        user: true
      },
      orderBy: {
        fullName: 'asc'
      }
    });

    console.log(`Total: ${consultants.length} consultants\n`);
    console.log('='.repeat(80));

    for (const consultant of consultants) {
      console.log(`${consultant.fullName}`);
      console.log(`  Email: ${consultant.user.email}`);
      console.log(`  Company Name: "${consultant.companyName || 'NULL'}"`);
      console.log('');
    }

    console.log('='.repeat(80));
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listConsultantNames()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

