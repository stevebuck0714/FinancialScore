import prisma from '../lib/prisma';

async function fixStuart() {
  console.log('🔧 Fixing Stuart\'s consultant name...\n');

  try {
    const consultant = await prisma.consultant.findFirst({
      where: {
        user: {
          email: 'stuart@test.com'
        }
      },
      include: {
        user: true
      }
    });

    if (!consultant) {
      console.log('❌ Stuart not found');
      return;
    }

    console.log(`Current companyName: ${consultant.companyName}`);
    
    // Update to use fullName
    await prisma.consultant.update({
      where: { id: consultant.id },
      data: { companyName: consultant.fullName }
    });

    console.log(`✅ Updated to: ${consultant.fullName}`);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixStuart()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

