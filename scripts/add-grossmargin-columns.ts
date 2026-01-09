import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addColumns() {
  console.log('Adding grossMargin columns to ProductSalesSnapshot...');
  
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "ProductSalesSnapshot" 
      ADD COLUMN IF NOT EXISTS "grossMargin" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "grossMarginPct" DOUBLE PRECISION
    `);
    
    console.log('✅ Columns added successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addColumns();

