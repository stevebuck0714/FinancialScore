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

    // Use raw SQL to bypass Prisma schema validation issues
    // The ExpenseGoal model is commented out in schema, but table exists in DB
    const goalsJson = JSON.stringify(goals);
    const now = new Date();
    
    // Check if record exists
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ExpenseGoal" WHERE "companyId" = ${companyId}
    `;
    
    console.log('💾 API: Existing record check:', existing);
    
    if (existing.length > 0) {
      // Update existing - use jsonb casting and proper timestamp
      console.log('💾 API: Updating existing record');
      await prisma.$executeRawUnsafe(
        `UPDATE "ExpenseGoal" 
         SET goals = $1::jsonb, "updatedAt" = $2
         WHERE "companyId" = $3`,
        goalsJson,
        now,
        companyId
      );
    } else {
      // Create new - use jsonb casting and proper timestamp
      console.log('💾 API: Creating new record');
      const id = `eg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ExpenseGoal" (id, "companyId", goals, "createdAt", "updatedAt")
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
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

