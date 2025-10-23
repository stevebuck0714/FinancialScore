import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, goals } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Use raw SQL to bypass Prisma schema validation issues
    const goalsJson = JSON.stringify(goals);
    const now = new Date().toISOString();
    
    // Check if record exists
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ExpenseGoal WHERE companyId = ${companyId}
    `;
    
    if (existing.length > 0) {
      // Update existing
      await prisma.$executeRaw`
        UPDATE ExpenseGoal 
        SET goals = ${goalsJson}, updatedAt = ${now}
        WHERE companyId = ${companyId}
      `;
    } else {
      // Create new
      const id = `eg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.$executeRaw`
        INSERT INTO ExpenseGoal (id, companyId, goals, createdAt, updatedAt)
        VALUES (${id}, ${companyId}, ${goalsJson}, ${now}, ${now})
      `;
    }

    return NextResponse.json({ 
      success: true,
      message: 'Goals saved successfully'
    });
  } catch (error) {
    console.error('Error saving expense goals:', error);
    return NextResponse.json(
      { error: 'Failed to save expense goals' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Use raw SQL to bypass Prisma schema validation issues
    const result = await prisma.$queryRaw<Array<{ goals: string }>>`
      SELECT goals FROM ExpenseGoal WHERE companyId = ${companyId}
    `;

    const goals = result.length > 0 ? JSON.parse(result[0].goals) : {};

    return NextResponse.json({ 
      success: true, 
      goals 
    });
  } catch (error) {
    console.error('Error fetching expense goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense goals' },
      { status: 500 }
    );
  }
}

