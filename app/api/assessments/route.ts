import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET assessment records for a company or user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const userId = searchParams.get('userId');

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (userId) where.userId = userId;

    const records = await prisma.assessmentRecord.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { completedAt: 'desc' }
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create or update assessment record
export async function POST(request: NextRequest) {
  try {
    const { userId, companyId, responses, notes, overallScore, isCompleted } = await request.json();

    if (!userId || !companyId || !responses || overallScore === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if record already exists for this user and company
    const existingRecord = await prisma.assessmentRecord.findFirst({
      where: {
        userId,
        companyId
      }
    });

    let record;
    
    if (existingRecord) {
      // Update existing record
      record = await prisma.assessmentRecord.update({
        where: { id: existingRecord.id },
        data: {
          responses,
          notes: notes || {},
          overallScore,
          isCompleted: isCompleted || false,
          completedAt: isCompleted ? new Date() : null
        },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });
    } else {
      // Create new record
      record = await prisma.assessmentRecord.create({
        data: {
          userId,
          companyId,
          responses,
          notes: notes || {},
          overallScore,
          isCompleted: isCompleted || false,
          completedAt: isCompleted ? new Date() : null
        },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });
    }

    return NextResponse.json({ record }, { status: existingRecord ? 200 : 201 });
  } catch (error) {
    console.error('Error creating/updating assessment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE assessment record
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Record ID required' },
        { status: 400 }
      );
    }

    await prisma.assessmentRecord.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


