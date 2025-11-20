import prisma from '../lib/prisma';

async function fixAllConsultantNames() {
  console.log('🔧 Fixing all consultant names with placeholders...\n');

  try {
    const consultants = await prisma.consultant.findMany({
      include: {
        user: true
      }
    });

    console.log(`Found ${consultants.length} consultants\n`);

    let updatedCount = 0;

    for (const consultant of consultants) {
      const currentName = consultant.companyName || '';
      
      // Check if companyName is null, empty, "CONSULTANT NAME", or ""CONSULTANT NAME""
      const needsUpdate = 
        !currentName || 
        currentName.trim() === '' ||
        currentName.toUpperCase().includes('CONSULTANT NAME') ||
        currentName === '""CONSULTANT NAME""' ||
        currentName === '"CONSULTANT NAME"';

      if (needsUpdate) {
        console.log(`${consultant.fullName} (${consultant.user.email})`);
        console.log(`  Current: "${currentName}"`);
        
        await prisma.consultant.update({
          where: { id: consultant.id },
          data: { companyName: consultant.fullName }
        });
        
        console.log(`  ✅ Updated to: "${consultant.fullName}"\n`);
        updatedCount++;
      }
    }

    console.log('='.repeat(50));
    console.log(`✅ Complete! Updated ${updatedCount} of ${consultants.length} consultants`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixAllConsultantNames()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

