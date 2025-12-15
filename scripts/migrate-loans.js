require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

async function migrate() {
  console.log('📊 Database URL:', process.env.DATABASE_URL ? 'Found' : 'Not found');
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Creating Loan and Covenant tables...');
    
    // Create Loan table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Loan" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "loanName" TEXT NOT NULL,
        "loanIdNumber" TEXT,
        "lenderName" TEXT NOT NULL,
        "loanAmount" DOUBLE PRECISION NOT NULL,
        "interestRate" DOUBLE PRECISION,
        "termMonths" INTEGER,
        "startDate" TIMESTAMP(3) NOT NULL,
        "endDate" TIMESTAMP(3),
        "loanType" TEXT NOT NULL DEFAULT 'TERM',
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Loan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    
    console.log('✅ Loan table created');
    
    // Create indexes for Loan
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Loan_companyId_idx" ON "Loan"("companyId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Loan_status_idx" ON "Loan"("status");
    `);
    
    console.log('✅ Loan indexes created');
    
    // Create Covenant table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Covenant" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "loanId" TEXT NOT NULL,
        "covenantName" TEXT NOT NULL,
        "covenantType" TEXT NOT NULL DEFAULT 'MINIMUM',
        "threshold" DOUBLE PRECISION,
        "currentValue" DOUBLE PRECISION,
        "status" TEXT NOT NULL DEFAULT 'COMPLIANT',
        "description" TEXT,
        "isApplicable" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Covenant_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    
    console.log('✅ Covenant table created');
    
    // Create indexes for Covenant
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Covenant_loanId_idx" ON "Covenant"("loanId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Covenant_status_idx" ON "Covenant"("status");
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

