import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - List consultant payables
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('consultantId');
    const status = searchParams.get('status');

    const where: any = {};

    if (consultantId) {
      where.consultantId = consultantId;
    }
    if (status) {
      where.status = status;
    }

    const payables = await prisma.consultantPayable.findMany({
      where,
      include: {
        consultant: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            revenueSharePercentage: true,
            paymentMethod: true
          }
        }
      },
      orderBy: {
        periodStart: 'desc'
      }
    });

    return NextResponse.json({ payables });
  } catch (error) {
    console.error('Error fetching consultant payables:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Generate payables for a period
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { periodStart, periodEnd, consultantId } = body;

    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'Period start and end dates are required' },
        { status: 400 }
      );
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // Build where clause for consultants
    const consultantWhere: any = {};
    if (consultantId) {
      consultantWhere.id = consultantId;
    }

    // Get all consultants (or specific one)
    const consultants = await prisma.consultant.findMany({
      where: consultantWhere,
      select: {
        id: true,
        fullName: true,
        revenueSharePercentage: true
      }
    });

    const createdPayables = [];
    const errors = [];

    for (const consultant of consultants) {
      try {
        // Get all revenue from this consultant's companies for the period
        const revenueRecords = await prisma.revenueRecord.findMany({
          where: {
            consultantId: consultant.id,
            paymentStatus: 'received',
            paymentDate: {
              gte: start,
              lte: end
            }
          }
        });

        if (revenueRecords.length === 0) {
          continue; // No revenue for this consultant in this period
        }

        const totalRevenue = revenueRecords.reduce((sum, r) => sum + r.amount, 0);
        const sharePercentage = consultant.revenueSharePercentage;
        const payableAmount = (totalRevenue * sharePercentage) / 100;
        const platformAmount = totalRevenue - payableAmount;

        // Create payable record
        const payable = await prisma.consultantPayable.create({
          data: {
            consultantId: consultant.id,
            periodStart: start,
            periodEnd: end,
            totalCompanyRevenue: totalRevenue,
            revenueSharePercentage: sharePercentage,
            payableAmount,
            platformAmount,
            status: 'pending'
          },
          include: {
            consultant: {
              select: {
                id: true,
                fullName: true,
                revenueSharePercentage: true
              }
            }
          }
        });

        createdPayables.push(payable);
      } catch (error: any) {
        errors.push({
          consultantId: consultant.id,
          consultantName: consultant.fullName,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      payablesCreated: createdPayables.length,
      payables: createdPayables,
      errors
    }, { status: 201 });
  } catch (error) {
    console.error('Error generating consultant payables:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

