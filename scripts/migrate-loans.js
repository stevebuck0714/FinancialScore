require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function migrate() {
  console.log('📊 Database URL:', process.env.DATABASE_URL ? 'Found' : 'Not found');
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Creating enums and tables...');
    
    // Step 1: Create enum types first
    console.log('📝 Creating LoanType enum...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "LoanType" AS ENUM ('TERM', 'REVOLVER', 'BRIDGE', 'LINE_OF_CREDIT', 'MORTGAGE', 'OTHER');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('📝 Creating LoanStatus enum...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'MATURING', 'PAID_OFF', 'DEFAULTED', 'INACTIVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('📝 Creating CovenantType enum...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "CovenantType" AS ENUM ('FINANCIAL', 'AFFIRMATIVE', 'NEGATIVE', 'INCURRENCE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('📝 Creating CovenantStatus enum...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "CovenantStatus" AS ENUM ('COMPLIANT', 'WARNING', 'BREACH', 'WAIVED', 'NOT_APPLICABLE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('✅ All enums created');

    // Step 2: Drop existing tables if they exist (to recreate with proper enum references)
    console.log('🗑️ Dropping existing tables if they exist...');
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Covenant" CASCADE;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Loan" CASCADE;`);

    // Step 3: Create Loan table with proper enum types
    console.log('📝 Creating Loan table with enum types...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Loan" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "loanName" TEXT NOT NULL,
        "loanIdNumber" TEXT,
        "lenderName" TEXT,
        "loanAmount" DOUBLE PRECISION,
        "interestRate" DOUBLE PRECISION,
        "termMonths" INTEGER,
        "startDate" TIMESTAMP(3),
        "endDate" TIMESTAMP(3),
        "loanType" "LoanType",
        "status" "LoanStatus",
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Loan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    
    console.log('✅ Loan table created');
    
    // Create indexes for Loan
    console.log('📝 Creating Loan indexes...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "Loan_companyId_idx" ON "Loan"("companyId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "Loan_status_idx" ON "Loan"("status");
    `);
    
    console.log('✅ Loan indexes created');
    
    // Step 4: Create Covenant table with proper enum types
    console.log('📝 Creating Covenant table with enum types...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Covenant" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "loanId" TEXT NOT NULL,
        "covenantName" TEXT NOT NULL,
        "covenantType" "CovenantType" NOT NULL,
        "threshold" DOUBLE PRECISION,
        "alertLevel" "CovenantStatus" NOT NULL DEFAULT 'COMPLIANT',
        "applicable" BOOLEAN NOT NULL DEFAULT true,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Covenant_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    
    console.log('✅ Covenant table created');
    
    // Create indexes for Covenant
    console.log('📝 Creating Covenant indexes...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "Covenant_loanId_idx" ON "Covenant"("loanId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "Covenant_covenantType_idx" ON "Covenant"("covenantType");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "Covenant_alertLevel_idx" ON "Covenant"("alertLevel");
    `);
    
    console.log('✅ Covenant indexes created');
    console.log('🎉 Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrate().catch(console.error);
