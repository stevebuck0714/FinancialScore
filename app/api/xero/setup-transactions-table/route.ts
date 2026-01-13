import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Setup endpoint to create XeroTransaction table
 * This uses Prisma to directly create the table based on the schema
 * 
 * Call this once to set up the table: GET /api/xero/setup-transactions-table
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔧 Setting up XeroTransaction table...');

    // Test connection and ensure table exists by doing a simple query
    // This will create the table if it doesn't exist (when using prisma.$executeRaw with CREATE TABLE IF NOT EXISTS)
    
    // For Prisma, we need to use $executeRawUnsafe to create the table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "XeroTransaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "transactionId" TEXT NOT NULL,
        "transactionType" TEXT NOT NULL,
        "date" TIMESTAMP(3) NOT NULL,
        "dueDate" TIMESTAMP(3),
        "contact" TEXT,
        "reference" TEXT,
        "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "amountDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "status" TEXT,
        "lineItems" JSONB,
        "rawData" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "XeroTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    // Create unique index
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "XeroTransaction_companyId_transactionId_key" 
      ON "XeroTransaction"("companyId", "transactionId");
    `);

    // Create indexes for faster queries
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "XeroTransaction_companyId_idx" ON "XeroTransaction"("companyId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "XeroTransaction_date_idx" ON "XeroTransaction"("date");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "XeroTransaction_transactionType_idx" ON "XeroTransaction"("transactionType");
    `);

    console.log('✅ XeroTransaction table created successfully');

    // Test the table by counting records
    const count = await prisma.xeroTransaction.count();
    console.log(`📊 Current XeroTransaction records: ${count}`);

    return NextResponse.json({
      success: true,
      message: 'XeroTransaction table created successfully',
      recordCount: count,
    });

  } catch (error: any) {
    console.error('❌ Setup error:', error);
    
    // If table already exists, that's fine
    if (error.message?.includes('already exists')) {
      const count = await prisma.xeroTransaction.count();
      return NextResponse.json({
        success: true,
        message: 'XeroTransaction table already exists',
        recordCount: count,
      });
    }

    return NextResponse.json({
      error: error.message || 'Failed to setup XeroTransaction table',
      details: error.toString(),
    }, { status: 500 });
  }
}

