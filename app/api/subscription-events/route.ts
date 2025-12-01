import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Get subscription events
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const eventType = searchParams.get('eventType');
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: any = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (eventType) {
      where.eventType = eventType;
    }

    const events = await prisma.subscriptionEvent.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching subscription events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create subscription event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, eventType, previousValue, newValue, notes, createdBy } = body;

    if (!companyId || !eventType) {
      return NextResponse.json(
        { error: 'Company ID and event type are required' },
        { status: 400 }
      );
    }

    const event = await prisma.subscriptionEvent.create({
      data: {
        companyId,
        eventType,
        previousValue: previousValue || null,
        newValue: newValue || null,
        notes: notes || null,
        createdBy: createdBy || null
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error('Error creating subscription event:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

