import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, goals } = body;

    console.log('💾 API: Saving expense goals for company:', companyId);
    console.log('💾 API: Goals data:', goals);

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Ensure table exists - create if it doesn't
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ExpenseGoal" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "goals" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);
      
      // Create indexes if they don't exist
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseGoal_companyId_key" ON "ExpenseGoal"("companyId")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ExpenseGoal_companyId_idx" ON "ExpenseGoal"("companyId")
      `);
    } catch (tableError: any) {
      // Ignore errors if table/indexes already exist
      if (!tableError.message?.includes('already exists') && !tableError.message?.includes('duplicate')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    // Use raw SQL to bypass Prisma schema validation issues
    // The ExpenseGoal model is commented out in schema, but table exists in DB
    const goalsJson = JSON.stringify(goals);
    const now = new Date().toISOString();
    
    // Check if record exists
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ExpenseGoal" WHERE "companyId" = ${companyId}
    `;
    
    console.log('💾 API: Existing record check:', existing);
    
    if (existing.length > 0) {
      // Update existing - match the import script pattern exactly
      console.log('💾 API: Updating existing record');
      await prisma.$executeRawUnsafe(
        `UPDATE "ExpenseGoal" 
         SET goals = $1::jsonb, "updatedAt" = $2::timestamp
         WHERE "companyId" = $3`,
        goalsJson,
        now,
        companyId
      );
    } else {
      // Create new - match the import script pattern exactly
      console.log('💾 API: Creating new record');
      const id = `eg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ExpenseGoal" (id, "companyId", goals, "createdAt", "updatedAt")
         VALUES ($1, $2, $3::jsonb, $4::timestamp, $5::timestamp)`,
        id,
        companyId,
        goalsJson,
        now,
        now
      );
    }

    console.log('✅ API: Goals saved successfully');
    return NextResponse.json({ 
      success: true,
      message: 'Goals saved successfully'
    });
  } catch (error) {
    console.error('❌ API Error saving expense goals:', error);
    return NextResponse.json(
      { error: 'Failed to save expense goals', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    console.log('📊 API: Loading expense goals for company:', companyId);

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Ensure table exists - create if it doesn't
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ExpenseGoal" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "goals" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);
    } catch (tableError: any) {
      // Ignore errors if table already exists
      if (!tableError.message?.includes('already exists')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    // Use raw SQL to bypass Prisma schema validation issues
    // Note: PostgreSQL json/jsonb types automatically deserialize, so goals is already an object
    const result = await prisma.$queryRaw<Array<{ goals: any }>>`
      SELECT goals FROM "ExpenseGoal" WHERE "companyId" = ${companyId}
    `;

    console.log('📊 API: Query result:', result);

    // PostgreSQL returns JSON as an already-parsed object, no need to JSON.parse
    const goals = result.length > 0 ? result[0].goals : {};

    console.log('📊 API: Returning goals:', goals);

    return NextResponse.json({ 
      success: true, 
      goals 
    });
  } catch (error) {
    console.error('❌ API Error fetching expense goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense goals', details: String(error) },
      { status: 500 }
    );
  }
}

