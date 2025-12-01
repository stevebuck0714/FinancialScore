import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Get single revenue record
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const record = await prisma.revenueRecord.findUnique({
      where: { id: params.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            addressStreet: true,
            addressCity: true,
            addressState: true,
            addressZip: true
          }
        },
        consultant: {
          select: {
            id: true,
            fullName: true,
            revenueSharePercentage: true,
            companyName: true
          }
        }
      }
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Revenue record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error fetching revenue record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update revenue record
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { paymentStatus, notes } = body;

    const updateData: any = {};

    if (paymentStatus) {
      updateData.paymentStatus = paymentStatus;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const record = await prisma.revenueRecord.update({
      where: { id: params.id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        consultant: {
          select: {
            id: true,
            fullName: true,
            revenueSharePercentage: true
          }
        }
      }
    });

    // Log subscription event if status changed
    if (paymentStatus) {
      await prisma.subscriptionEvent.create({
        data: {
          companyId: record.companyId,
          eventType: 'payment_status_changed',
          newValue: paymentStatus,
          notes: `Payment ${record.transactionId} status changed to ${paymentStatus}`
        }
      });
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error updating revenue record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete revenue record
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const record = await prisma.revenueRecord.findUnique({
      where: { id: params.id }
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Revenue record not found' },
        { status: 404 }
      );
    }

    await prisma.revenueRecord.delete({
      where: { id: params.id }
    });

    // Log subscription event
    await prisma.subscriptionEvent.create({
      data: {
        companyId: record.companyId,
        eventType: 'payment_deleted',
        previousValue: record.transactionId,
        notes: `Revenue record ${record.transactionId} deleted`
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting revenue record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
