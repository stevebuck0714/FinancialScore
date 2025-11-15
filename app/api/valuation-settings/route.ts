import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Try to find existing settings
    const settings = await prisma.valuationSettings.findUnique({
      where: { companyId },
    });

    if (!settings) {
      // Return default values
      return NextResponse.json({
        sdeMultiplier: 2.5,
        ebitdaMultiplier: 5.0,
        dcfDiscountRate: 10.0,
        dcfTerminalGrowth: 2.0,
      });
    }

    return NextResponse.json({
      sdeMultiplier: settings.sdeMultiplier,
      ebitdaMultiplier: settings.ebitdaMultiplier,
      dcfDiscountRate: settings.dcfDiscountRate,
      dcfTerminalGrowth: settings.dcfTerminalGrowth,
    });
  } catch (error) {
    console.error('Error fetching valuation settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
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

    // Upsert the settings
    const settings = await prisma.valuationSettings.upsert({
      where: { companyId },
      update: {
        sdeMultiplier,
        ebitdaMultiplier,
        dcfDiscountRate,
        dcfTerminalGrowth,
        updatedAt: new Date(),
      },
      create: {
        companyId,
        sdeMultiplier,
        ebitdaMultiplier,
        dcfDiscountRate,
        dcfTerminalGrowth,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Valuation settings saved successfully',
      settings,
    });
  } catch (error) {
    console.error('Error saving valuation settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

