import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, goals } = body;

    console.log('💾 API: Saving operational goals for company:', companyId);
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
        CREATE TABLE IF NOT EXISTS "OperationalGoal" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "goals" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);
      
      // Create indexes if they don't exist
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "OperationalGoal_companyId_key" ON "OperationalGoal"("companyId")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "OperationalGoal_companyId_idx" ON "OperationalGoal"("companyId")
      `);
    } catch (tableError: any) {
      // Ignore errors if table/indexes already exist
      if (!tableError.message?.includes('already exists') && !tableError.message?.includes('duplicate')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    // Use raw SQL to bypass Prisma schema validation issues
    const goalsJson = JSON.stringify(goals);
    const now = new Date().toISOString();
    
    // Check if record exists
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "OperationalGoal" WHERE "companyId" = ${companyId}
    `;
    
    console.log('💾 API: Existing record check:', existing);
    
    if (existing.length > 0) {
      // Update existing
      console.log('💾 API: Updating existing record');
      await prisma.$executeRawUnsafe(
        `UPDATE "OperationalGoal" 
         SET goals = $1::jsonb, "updatedAt" = $2::timestamp
         WHERE "companyId" = $3`,
        goalsJson,
        now,
        companyId
      );
    } else {
      // Create new
      console.log('💾 API: Creating new record');
      const id = `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "OperationalGoal" (id, "companyId", goals, "createdAt", "updatedAt")
         VALUES ($1, $2, $3::jsonb, $4::timestamp, $5::timestamp)`,
        id,
        companyId,
        goalsJson,
        now,
        now
      );
    }

    console.log('✅ API: Operational goals saved successfully');
    return NextResponse.json({ 
      success: true,
      message: 'Operational goals saved successfully'
    });
  } catch (error) {
    console.error('❌ API Error saving operational goals:', error);
    return NextResponse.json(
      { error: 'Failed to save operational goals', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    console.log('📊 API: Loading operational goals for company:', companyId);

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Ensure table exists - create if it doesn't
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "OperationalGoal" (
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
    const result = await prisma.$queryRaw<Array<{ goals: any }>>`
      SELECT goals FROM "OperationalGoal" WHERE "companyId" = ${companyId}
    `;

    console.log('📊 API: Query result:', result);

    // PostgreSQL returns JSON as an already-parsed object, no need to JSON.parse
    const goals = result.length > 0 ? result[0].goals : {};

    console.log('📊 API: Returning operational goals:', goals);

    return NextResponse.json({ 
      success: true, 
      goals 
    });
  } catch (error) {
    console.error('❌ API Error fetching operational goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch operational goals', details: String(error) },
      { status: 500 }
    );
  }
}

