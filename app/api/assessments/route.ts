import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess, validateUserAccess } from '@/lib/tenant-security';
import { auditAssessmentOperation, auditForbiddenAccess } from '@/lib/audit-logger';

// GET assessment records for a company or user
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const context = await requireAuth();
    
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const userId = searchParams.get('userId');

    // SECURITY: Validate access
    if (companyId) {
      const hasAccess = await validateCompanyAccess(companyId);
      if (!hasAccess) {
        await auditForbiddenAccess('AssessmentRecord', companyId, 'READ_BY_COMPANY');
        return NextResponse.json(
          { error: 'Forbidden: Access to this company denied' },
          { status: 403 }
        );
      }
    }

    if (userId) {
      const hasAccess = await validateUserAccess(userId);
      if (!hasAccess) {
        await auditForbiddenAccess('AssessmentRecord', userId, 'READ_BY_USER');
        return NextResponse.json(
          { error: 'Forbidden: Access to this user denied' },
          { status: 403 }
        );
      }
    }

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
    const body = await request.json();
    const { userId, companyId, responses, notes, overallScore, isCompleted } = body;

    if (!userId || !companyId || !responses || overallScore === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // SECURITY: Validate access to company
    try {
      await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('AssessmentRecord', companyId, 'CREATE');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    // SECURITY: Validate access to user
    const hasUserAccess = await validateUserAccess(userId);
    if (!hasUserAccess) {
      await auditForbiddenAccess('AssessmentRecord', userId, 'CREATE');
      return NextResponse.json(
        { error: 'Forbidden: Access to this user denied' },
        { status: 403 }
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

      // AUDIT: Log update
      await auditAssessmentOperation('ASSESSMENT_UPDATED', record.id, companyId, {
        isCompleted,
        overallScore,
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

      // AUDIT: Log creation
      await auditAssessmentOperation('ASSESSMENT_CREATED', record.id, companyId, {
        userId,
        overallScore,
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

    // SECURITY: First, check if record exists and get its companyId
    const record = await prisma.assessmentRecord.findUnique({
      where: { id },
      select: { id: true, companyId: true, userId: true }
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    // SECURITY: Validate access to company
    try {
      await requireCompanyAccess(record.companyId);
    } catch (error) {
      await auditForbiddenAccess('AssessmentRecord', id, 'DELETE');
      return NextResponse.json(
        { error: 'Forbidden: Access to this assessment denied' },
        { status: 403 }
      );
    }

    // Delete the record
    await prisma.assessmentRecord.delete({
      where: { id }
    });

    // AUDIT: Log deletion
    await auditAssessmentOperation('ASSESSMENT_DELETED', id, record.companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


