import prisma from '../lib/prisma';

async function fixConsultantNames() {
  console.log('🔍 Checking consultants with placeholder names...\n');

  try {
    // Find consultants with "CONSULTANT NAME" as companyName
    const consultants = await prisma.consultant.findMany({
      include: {
        user: true
      }
    });

    console.log(`Found ${consultants.length} consultants\n`);

    for (const consultant of consultants) {
      console.log(`${consultant.fullName} (${consultant.user.email})`);
      console.log(`  Current companyName: "${consultant.companyName || 'NULL'}"`);
      
      // If companyName is "CONSULTANT NAME" or empty, update it to use fullName
      if (!consultant.companyName || consultant.companyName === 'CONSULTANT NAME') {
        await prisma.consultant.update({
          where: { id: consultant.id },
          data: { companyName: consultant.fullName }
        });
        console.log(`  ✅ Updated to: "${consultant.fullName}"\n`);
      } else {
        console.log(`  ℹ️  No change needed\n`);
      }
    }

    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixConsultantNames()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

