import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Get single payable with detail
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payable = await prisma.consultantPayable.findUnique({
      where: { id: params.id },
      include: {
        consultant: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            revenueSharePercentage: true,
            paymentMethod: true,
            taxId: true
          }
        }
      }
    });

    if (!payable) {
      return NextResponse.json(
        { error: 'Payable not found' },
        { status: 404 }
      );
    }

    // Get the revenue records that contributed to this payable
    const revenueRecords = await prisma.revenueRecord.findMany({
      where: {
        consultantId: payable.consultantId,
        paymentStatus: 'received',
        paymentDate: {
          gte: payable.periodStart,
          lte: payable.periodEnd
        }
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    return NextResponse.json({ 
      payable,
      revenueRecords 
    });
  } catch (error) {
    console.error('Error fetching payable:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update payable (mark as paid, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status, paidDate, paymentMethod, paymentReference, notes } = body;

    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === 'paid' && !paidDate) {
        updateData.paidDate = new Date();
      }
    }

    if (paidDate) {
      updateData.paidDate = new Date(paidDate);
    }

    if (paymentMethod) {
      updateData.paymentMethod = paymentMethod;
    }

    if (paymentReference) {
      updateData.paymentReference = paymentReference;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const payable = await prisma.consultantPayable.update({
      where: { id: params.id },
      data: updateData,
      include: {
        consultant: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            revenueSharePercentage: true
          }
        }
      }
    });

    return NextResponse.json({ payable });
  } catch (error) {
    console.error('Error updating payable:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete payable
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.consultantPayable.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting payable:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

