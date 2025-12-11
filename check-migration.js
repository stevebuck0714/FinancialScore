require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function checkAndMigrate() {
  const prisma = new PrismaClient();

  try {
    // Check if headcountAllocations column exists
    const result = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Company'
      AND column_name = 'headcountAllocations'
      AND table_schema = 'public'
    `;

    if (result.length === 0) {
      console.log('headcountAllocations column not found, adding it...');
      await prisma.$queryRaw`ALTER TABLE "Company" ADD COLUMN "headcountAllocations" JSONB`;
      console.log('✅ Successfully added headcountAllocations column');
    } else {
      console.log('✅ headcountAllocations column already exists');
    }
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndMigrate();



