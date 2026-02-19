import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

async function columnExists(columnName: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'SystemSettings'
          AND column_name = ${columnName}
      ) as "exists"
    `;
    return rows[0]?.exists === true;
  } catch (e) {
    // If introspection fails, assume the column doesn't exist to avoid breaking the UI.
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get default pricing settings
    let settings = await prisma.systemSettings.findUnique({
      where: { key: 'default_pricing' }
    });

    // If no settings exist, create with defaults
    if (!settings) {
      const hasBusinessSetupFee = await columnExists('businessSetupFee');
      const hasConsultantSetupFee = await columnExists('consultantSetupFee');
      settings = await prisma.systemSettings.create({
        data: {
          key: 'default_pricing',
          businessMonthlyPrice: 195,
          businessQuarterlyPrice: 500,
          businessAnnualPrice: 1750,
          ...(hasBusinessSetupFee ? { businessSetupFee: 0 } : {}),
          consultantMonthlyPrice: 195,
          consultantQuarterlyPrice: 500,
          consultantAnnualPrice: 1750,
          ...(hasConsultantSetupFee ? { consultantSetupFee: 0 } : {}),
        }
      });
    }

    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: error instanceof Error ? error.message : String(error) },
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
      businessSetupFee,
      consultantMonthlyPrice,
      consultantQuarterlyPrice,
      consultantAnnualPrice,
      consultantSetupFee,
    } = await request.json();

    const hasBusinessSetupFee = await columnExists('businessSetupFee');
    const hasConsultantSetupFee = await columnExists('consultantSetupFee');

    // Upsert settings
    const settings = await prisma.systemSettings.upsert({
      where: { key: 'default_pricing' },
      update: {
        businessMonthlyPrice,
        businessQuarterlyPrice,
        businessAnnualPrice,
        ...(hasBusinessSetupFee ? { businessSetupFee } : {}),
        consultantMonthlyPrice,
        consultantQuarterlyPrice,
        consultantAnnualPrice,
        ...(hasConsultantSetupFee ? { consultantSetupFee } : {}),
      },
      create: {
        key: 'default_pricing',
        businessMonthlyPrice,
        businessQuarterlyPrice,
        businessAnnualPrice,
        ...(hasBusinessSetupFee ? { businessSetupFee } : {}),
        consultantMonthlyPrice,
        consultantQuarterlyPrice,
        consultantAnnualPrice,
        ...(hasConsultantSetupFee ? { consultantSetupFee } : {}),
      }
    });

    return NextResponse.json({ 
      success: true,
      settings 
    }, { status: 200 });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}


