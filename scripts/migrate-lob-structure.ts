/**
 * Migration script to convert linesOfBusiness from array of strings
 * to array of objects with name and headcountPercentage fields
 */

import prisma from '../lib/prisma';

async function migrateLOBStructure() {
  console.log('🔄 Starting LOB structure migration...');

  try {
    // Get all companies that have linesOfBusiness
    const companies = await prisma.company.findMany({
      where: {
        linesOfBusiness: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        linesOfBusiness: true
      }
    });

    console.log(`Found ${companies.length} companies with LOB data`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const company of companies) {
      const currentLOBs = company.linesOfBusiness as any;

      // Skip if already in new format (has objects with name/headcountPercentage)
      if (Array.isArray(currentLOBs) && currentLOBs.length > 0 &&
          typeof currentLOBs[0] === 'object' && 'name' in currentLOBs[0]) {
        console.log(`⏭️  Skipping ${company.name} - already migrated`);
        skippedCount++;
        continue;
      }

      // Convert old format (array of strings) to new format
      if (Array.isArray(currentLOBs)) {
        const newLOBs = currentLOBs
          .filter((lob: any) => typeof lob === 'string' && lob.trim() !== '')
          .map((lobName: string) => ({
            name: lobName.trim(),
            headcountPercentage: 0 // Default to 0, user will set later
          }));

        if (newLOBs.length > 0) {
          await prisma.company.update({
            where: { id: company.id },
            data: { linesOfBusiness: newLOBs }
          });

          console.log(`✅ Migrated ${company.name}: ${newLOBs.length} LOBs`);
          migratedCount++;
        }
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Migrated: ${migratedCount} companies`);
    console.log(`   Skipped: ${skippedCount} companies`);
    console.log(`   Total processed: ${migratedCount + skippedCount} companies`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateLOBStructure()
  .then(() => {
    console.log('🎉 LOB structure migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
