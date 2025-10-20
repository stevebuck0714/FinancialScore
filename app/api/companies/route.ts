import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all companies (optionally filtered by consultant)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('consultantId');

    // Build where clause - if consultantId provided, filter by it; otherwise return all companies
    const where = consultantId ? { consultantId } : {};

    const companies = await prisma.company.findMany({
      where,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            userType: true
          }
        },
        _count: {
          select: {
            users: true,
            financialRecords: true,
            assessmentRecords: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create new company
export async function POST(request: NextRequest) {
  try {
    const { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector } = await request.json();

    if (!name || !consultantId) {
      return NextResponse.json(
        { error: 'Company name and consultant ID required' },
        { status: 400 }
      );
    }

    const company = await prisma.company.create({
      data: {
        name,
        consultantId,
        addressStreet,
        addressCity,
        addressState,
        addressZip,
        addressCountry,
        industrySector
      }
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error('Error creating company:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE company
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    await prisma.company.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT update company pricing
export async function PUT(request: NextRequest) {
  try {
    const { 
      id, 
      subscriptionMonthly,
      subscriptionQuarterly,
      subscriptionAnnual
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (subscriptionMonthly !== undefined) updateData.subscriptionMonthlyPrice = subscriptionMonthly;
    if (subscriptionQuarterly !== undefined) updateData.subscriptionQuarterlyPrice = subscriptionQuarterly;
    if (subscriptionAnnual !== undefined) updateData.subscriptionAnnualPrice = subscriptionAnnual;

    const company = await prisma.company.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error updating company pricing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH update company
export async function PATCH(request: NextRequest) {
  try {
    const { 
      id, 
      addressStreet, 
      addressCity, 
      addressState, 
      addressZip, 
      addressCountry, 
      industrySector, 
      name,
      subscriptionMonthlyPrice,
      subscriptionQuarterlyPrice,
      subscriptionAnnualPrice
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(addressStreet !== undefined && { addressStreet }),
        ...(addressCity !== undefined && { addressCity }),
        ...(addressState !== undefined && { addressState }),
        ...(addressZip !== undefined && { addressZip }),
        ...(addressCountry !== undefined && { addressCountry }),
        ...(industrySector !== undefined && { industrySector }),
        ...(subscriptionMonthlyPrice !== undefined && { subscriptionMonthlyPrice }),
        ...(subscriptionQuarterlyPrice !== undefined && { subscriptionQuarterlyPrice }),
        ...(subscriptionAnnualPrice !== undefined && { subscriptionAnnualPrice })
      }
    });

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

