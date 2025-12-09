import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get default pricing settings
    let settings = await prisma.systemSettings.findUnique({
      where: { key: 'default_pricing' }
    });

    // If no settings exist, create with defaults
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          key: 'default_pricing',
          businessMonthlyPrice: 195,
          businessQuarterlyPrice: 500,
          businessAnnualPrice: 1750,
          consultantMonthlyPrice: 195,
          consultantQuarterlyPrice: 500,
          consultantAnnualPrice: 1750
        }
      });

    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      businessMonthlyPrice,
      businessQuarterlyPrice,
      businessAnnualPrice,
      consultantMonthlyPrice,
      consultantQuarterlyPrice,
      consultantAnnualPrice
    } = await request.json();

    // Upsert settings
    const settings = await prisma.systemSettings.upsert({
      where: { key: 'default_pricing' },
      update: {
        businessMonthlyPrice,
        businessQuarterlyPrice,
        businessAnnualPrice,
        consultantMonthlyPrice,
        consultantQuarterlyPrice,
        consultantAnnualPrice
      },
      create: {
        key: 'default_pricing',
        businessMonthlyPrice,
        businessQuarterlyPrice,
        businessAnnualPrice,
        consultantMonthlyPrice,
        consultantQuarterlyPrice,
        consultantAnnualPrice
      }
    });

    return NextResponse.json({ 
      success: true,
      settings 
    }, { status: 200 });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}


