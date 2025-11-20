/**
 * Migration Script: Update Existing Consultants
 * 
 * This script updates existing consultant users to:
 * 1. Set isPrimaryContact = true for all existing consultant users
 * 2. Set consultantId on the user record to link to their consultant firm
 * 
 * Run with: npx tsx scripts/migrate-existing-consultants.ts
 */

import prisma from '../lib/prisma';

async function migrateConsultants() {
  console.log('🔄 Starting consultant migration...\n');

  try {
    // Get all consultants
    const consultants = await prisma.consultant.findMany({
      include: {
        user: true
      }
    });

    console.log(`📊 Found ${consultants.length} consultants to migrate\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const consultant of consultants) {
      try {
        console.log(`Processing: ${consultant.fullName} (${consultant.user.email})`);

        // Update the user record
        await prisma.user.update({
          where: { id: consultant.userId },
          data: {
            isPrimaryContact: true,
            consultantId: consultant.id
          }
        });

        console.log(`  ✅ Updated successfully\n`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Error updating consultant ${consultant.fullName}:`, error);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migration complete!`);
    console.log(`   Successfully updated: ${successCount}`);
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
migrateConsultants()
  .then(() => {
    console.log('\n✨ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });

