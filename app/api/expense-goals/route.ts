import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    // Upsert: Create or update expense goals
    const expenseGoal = await prisma.expenseGoal.upsert({
      where: { companyId },
      update: {
        goals,
        updatedAt: new Date()
      },
      create: {
        companyId,
        goals
      }
    });

    return NextResponse.json({ 
      success: true, 
      expenseGoal 
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

    const expenseGoal = await prisma.expenseGoal.findUnique({
      where: { companyId }
    });

    return NextResponse.json({ 
      success: true, 
      goals: expenseGoal?.goals || {} 
    });
  } catch (error) {
    console.error('Error fetching expense goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense goals' },
      { status: 500 }
    );
  }
}

