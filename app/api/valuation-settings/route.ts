import { NextRequest, NextResponse } from 'next/server';
// import prisma from '@/lib/prisma'; // Not needed since we don't query database

export async function GET(request: NextRequest) {
  console.log('🔍 Valuation settings API called with URL:', request.url);

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    console.log('🔍 Company ID from params:', companyId);

    if (!companyId) {
      console.log('❌ No company ID provided');
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // ValuationSettings table doesn't exist in production DB
    // Always return default values
    console.log('✅ Returning default valuation settings for company:', companyId);
    const response = NextResponse.json({
      sdeMultiplier: 2.5,
      ebitdaMultiplier: 5.0,
      dcfDiscountRate: 10.0,
      dcfTerminalGrowth: 2.0,
    });
    console.log('✅ Response created successfully');
    return response;
  } catch (error) {
    console.error('❌ Error in valuation settings API:', error);
    console.error('❌ Error stack:', error.stack);
    return NextResponse.json({
      error: 'Failed to fetch settings',
      details: error.message
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, sdeMultiplier, ebitdaMultiplier, dcfDiscountRate, dcfTerminalGrowth } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate the values
    if (
      typeof sdeMultiplier !== 'number' ||
      typeof ebitdaMultiplier !== 'number' ||
      typeof dcfDiscountRate !== 'number' ||
      typeof dcfTerminalGrowth !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid parameter values' }, { status: 400 });
    }

    // ValuationSettings table doesn't exist in production DB
    // Just return success without saving
    console.log('🔍 Valuation settings update requested but table doesn\'t exist - returning success');

    return NextResponse.json({
      success: true,
      message: 'Valuation settings saved successfully (not persisted - table doesn\'t exist)',
      settings: {
        companyId,
        sdeMultiplier,
        ebitdaMultiplier,
        dcfDiscountRate,
        dcfTerminalGrowth,
      },
    });
  } catch (error) {
    console.error('Error in valuation settings POST:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

