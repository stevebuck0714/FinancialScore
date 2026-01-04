import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Setting up ML Learning database...');
    
    // Create the LearnedMapping table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LearnedMapping" (
        "id" TEXT NOT NULL,
        "accountName" TEXT NOT NULL,
        "accountClassification" TEXT,
        "targetField" TEXT NOT NULL,
        "useCount" INTEGER NOT NULL DEFAULT 1,
        "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "LearnedMapping_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Create unique index
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "LearnedMapping_accountName_accountClassification_targetFi_key" 
      ON "LearnedMapping"("accountName", "accountClassification", "targetField");
    `);
    
    // Create indexes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LearnedMapping_accountName_idx" 
      ON "LearnedMapping"("accountName");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LearnedMapping_targetField_idx" 
      ON "LearnedMapping"("targetField");
    `);
    
    console.log('✅ LearnedMapping table created successfully!');
    
    return NextResponse.json({ 
      success: true,
      message: 'ML Learning database setup complete!' 
    });
    
  } catch (error: any) {
    console.error('❌ ML Setup error:', error);
    
    // If table already exists, that's fine
    if (error.message?.includes('already exists')) {
      return NextResponse.json({ 
        success: true,
        message: 'ML Learning database already exists - ready to use!' 
      });
    }
    
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}

