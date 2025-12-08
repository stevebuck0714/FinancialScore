import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all companies (optionally filtered by consultant or company ID)
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Companies API called');
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('consultantId');
    const companyId = searchParams.get('companyId');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    let where: any = {};

    if (consultantId) {
      where.consultantId = consultantId;
    }

    if (companyId) {
      where.id = companyId;
    }

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        consultantId: true,
        addressStreet: true,
        addressCity: true,
        addressState: true,
        addressZip: true,
        addressCountry: true,
        industrySector: true,
        linesOfBusiness: true,
        createdAt: true
        // subscriptionMonthlyPrice: true, // These fields may not exist in production DB
        // subscriptionQuarterlyPrice: true,
        // subscriptionAnnualPrice: true,
        // affiliateCode: true,
        // affiliateId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    console.log(`Retrieved ${companies.length} companies`);
    if (companies.length > 0) {
      console.log('First company:', companies[0]);
    }

    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch companies', details: error.message },
      { status: 500 }
    );
  }
}

// POST create new company
export async function POST(request: NextRequest) {
  console.log('🔍 ===== API COMPANIES POST REQUEST RECEIVED =====');
  try {
    console.log('🔍 ===== STARTING COMPANY CREATION =====');

    const { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode, linesOfBusiness } = await request.json();

    console.log('🔍 Received data:', { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode });

    if (!name || !consultantId) {
      console.error('❌ Missing required fields:', { name: !!name, consultantId: !!consultantId });
      return NextResponse.json(
        { error: 'Company name and consultant ID required' },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Function temporarily disabled due to syntax errors' }, { status: 500 });
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE company
export async function DELETE(request: NextRequest) {
  return NextResponse.json({ error: 'DELETE function temporarily disabled' }, { status: 500 });
}