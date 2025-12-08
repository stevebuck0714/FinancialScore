import prisma from '../lib/prisma';

async function fixConsultantRelationships() {
  console.log('🔧 Fixing consultant relationships...\n');

  try {
    // Find all users with role 'consultant'
    const consultantUsers = await prisma.user.findMany({
      where: {
        role: 'consultant'
      },
      include: {
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    console.log(`Found ${consultantUsers.length} consultant users\n`);

    for (const user of consultantUsers) {
      console.log(`Checking user: ${user.email} (${user.name})`);

      let consultantId = user.consultantId;
      let needsUpdate = false;

      // Try to find consultant by matching user name with consultant company name
      if (!consultantId) {
        console.log(`  No consultantId set, trying to find matching consultant...`);

        // Look for consultant where companyName matches user name
        const matchingConsultant = await prisma.consultant.findFirst({
          where: {
            OR: [
              { companyName: user.name },
              { fullName: user.name },
              { user: { email: user.email } }
            ]
          }
        });

        if (matchingConsultant) {
          consultantId = matchingConsultant.id;
          needsUpdate = true;
          console.log(`  ✅ Found matching consultant: ${matchingConsultant.companyName} (${consultantId})`);
        } else {
          console.log(`  ❌ No matching consultant found for user ${user.name}`);
        }
      }

      // Check if relationships are set up
      if (!user.primaryConsultant && !user.consultantFirm && consultantId) {
        console.log(`  Setting up consultant relationship...`);

        // Link the user to the consultant
        await prisma.user.update({
          where: { id: user.id },
          data: {
            consultantId: consultantId,
            primaryConsultant: {
              connect: { id: consultantId }
            }
          }
        });

        console.log(`  ✅ Linked user to consultant`);
      }

      if (needsUpdate) {
        await prisma.user.update({
          where: { id: user.id },
          data: { consultantId: consultantId }
        });
        console.log(`  ✅ Updated consultantId for user`);
      }

      // Verify the consultant has companies
      if (consultantId) {
        const companyCount = await prisma.company.count({
          where: { consultantId: consultantId }
        });
        console.log(`  📊 Consultant has ${companyCount} companies`);
      }

      console.log(`  Current consultantId: ${consultantId || 'NOT SET'}\n`);
    }

    console.log('✅ Consultant relationship fix completed');

  } catch (error) {
    console.error('❌ Error fixing consultant relationships:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixConsultantRelationships()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
