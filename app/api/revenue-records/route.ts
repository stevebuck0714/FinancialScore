import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - List revenue records with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const consultantId = searchParams.get('consultantId');
    const companyId = searchParams.get('companyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type'); // 'consultant' or 'direct'

    const where: any = {};

    if (status) {
      where.paymentStatus = status;
    }
    if (consultantId) {
      where.consultantId = consultantId;
    }
    if (companyId) {
      where.companyId = companyId;
    }
    if (type === 'direct') {
      where.consultantId = null; // Direct businesses only
    } else if (type === 'consultant') {
      where.consultantId = { not: null }; // Consultant companies only
    }
    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const records = await prisma.revenueRecord.findMany({
      where,
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
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching revenue records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new revenue record (when payment is received)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      transactionId, 
      companyId, 
      amount, 
      paymentDate,
      subscriptionPlan,
      billingPeriodStart,
      billingPeriodEnd,
      processorFee,
      notes 
    } = body;

    if (!transactionId || !companyId || !amount || !subscriptionPlan) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get company to find consultant (if any)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { consultantId: true }
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    const netAmount = processorFee ? amount - processorFee : amount;

    // Create revenue record
    const record = await prisma.revenueRecord.create({
      data: {
        transactionId,
        companyId,
        consultantId: company.consultantId || null,
        amount,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paymentStatus: 'received',
        subscriptionPlan,
        billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : new Date(),
        billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : new Date(),
        processorFee: processorFee || null,
        netAmount,
        notes: notes || null
      },
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

    // Log subscription event
    await prisma.subscriptionEvent.create({
      data: {
        companyId,
        eventType: 'payment_received',
        newValue: transactionId,
        notes: `Payment received: $${amount} for ${subscriptionPlan} plan`
      }
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating revenue record:', error);
    
    // Handle duplicate transaction ID
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Revenue record with this transaction ID already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
