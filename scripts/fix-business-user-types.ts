/**
 * Migration Script: Fix Business User Types
 * 
 * This script updates existing business users (standalone businesses) to set userType = 'COMPANY'
 * Business users are identified as:
 * - role = 'USER'
 * - companyId is set
 * - company.consultantId is null (standalone business, not associated with a consultant)
 * 
 * Run with: npx tsx scripts/fix-business-user-types.ts
 */

import prisma from '../lib/prisma';

async function fixBusinessUserTypes() {
  console.log('🔄 Starting business user type migration...\n');

  try {
    // Find all users who are business users but don't have userType set
    const businessUsers = await prisma.user.findMany({
      where: {
        role: 'USER',
        companyId: { not: null },
        userType: null
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            consultantId: true
          }
        }
      }
    });

    console.log(`📊 Found ${businessUsers.length} potential business users to migrate\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const user of businessUsers) {
      try {
        // Only update if this is a standalone business (no consultant)
        if (user.company && !user.company.consultantId) {
          console.log(`Processing: ${user.name} (${user.email}) - Company: ${user.company.name}`);
          
          await prisma.user.update({
            where: { id: user.id },
            data: { userType: 'COMPANY' }
          });

          console.log(`  ✅ Updated successfully - set userType to COMPANY\n`);
          successCount++;
        } else {
          console.log(`Skipping: ${user.name} (${user.email}) - Company has consultantId\n`);
          skipCount++;
        }
      } catch (error) {
        console.error(`  ❌ Error updating user ${user.name}:`, error);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migration complete!`);
    console.log(`   Successfully updated: ${successCount}`);
    console.log(`   Skipped (has consultant): ${skipCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
fixBusinessUserTypes()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });






