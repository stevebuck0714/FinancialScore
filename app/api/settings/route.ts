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
    // Get default subscription pricing settings
    let settings = await prisma.systemSettings.findUnique({
      where: { key: 'default_pricing' }
    });
    // Get default DataRoom pricing settings
    let dataRoomSettings = await prisma.systemSettings.findUnique({
      where: { key: 'default_dataroom_pricing' }
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
    if (!dataRoomSettings) {
      const hasBusinessSetupFee = await columnExists('businessSetupFee');
      const hasConsultantSetupFee = await columnExists('consultantSetupFee');
      dataRoomSettings = await prisma.systemSettings.create({
        data: {
          key: 'default_dataroom_pricing',
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

    return NextResponse.json({ settings, dataRoomSettings }, { status: 200 });
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
      dataRoomBusinessMonthlyPrice,
      dataRoomBusinessQuarterlyPrice,
      dataRoomBusinessAnnualPrice,
      dataRoomConsultantMonthlyPrice,
      dataRoomConsultantQuarterlyPrice,
      dataRoomConsultantAnnualPrice,
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

    const dataRoomSettings = await prisma.systemSettings.upsert({
      where: { key: 'default_dataroom_pricing' },
      update: {
        businessMonthlyPrice: Number.isFinite(Number(dataRoomBusinessMonthlyPrice))
          ? Number(dataRoomBusinessMonthlyPrice)
          : Number(businessMonthlyPrice ?? 0),
        businessQuarterlyPrice: Number.isFinite(Number(dataRoomBusinessQuarterlyPrice))
          ? Number(dataRoomBusinessQuarterlyPrice)
          : Number(businessQuarterlyPrice ?? 0),
        businessAnnualPrice: Number.isFinite(Number(dataRoomBusinessAnnualPrice))
          ? Number(dataRoomBusinessAnnualPrice)
          : Number(businessAnnualPrice ?? 0),
        ...(hasBusinessSetupFee ? { businessSetupFee: 0 } : {}),
        consultantMonthlyPrice: Number.isFinite(Number(dataRoomConsultantMonthlyPrice))
          ? Number(dataRoomConsultantMonthlyPrice)
          : Number(consultantMonthlyPrice ?? 0),
        consultantQuarterlyPrice: Number.isFinite(Number(dataRoomConsultantQuarterlyPrice))
          ? Number(dataRoomConsultantQuarterlyPrice)
          : Number(consultantQuarterlyPrice ?? 0),
        consultantAnnualPrice: Number.isFinite(Number(dataRoomConsultantAnnualPrice))
          ? Number(dataRoomConsultantAnnualPrice)
          : Number(consultantAnnualPrice ?? 0),
        ...(hasConsultantSetupFee ? { consultantSetupFee: 0 } : {}),
      },
      create: {
        key: 'default_dataroom_pricing',
        businessMonthlyPrice: Number.isFinite(Number(dataRoomBusinessMonthlyPrice))
          ? Number(dataRoomBusinessMonthlyPrice)
          : Number(businessMonthlyPrice ?? 0),
        businessQuarterlyPrice: Number.isFinite(Number(dataRoomBusinessQuarterlyPrice))
          ? Number(dataRoomBusinessQuarterlyPrice)
          : Number(businessQuarterlyPrice ?? 0),
        businessAnnualPrice: Number.isFinite(Number(dataRoomBusinessAnnualPrice))
          ? Number(dataRoomBusinessAnnualPrice)
          : Number(businessAnnualPrice ?? 0),
        ...(hasBusinessSetupFee ? { businessSetupFee: 0 } : {}),
        consultantMonthlyPrice: Number.isFinite(Number(dataRoomConsultantMonthlyPrice))
          ? Number(dataRoomConsultantMonthlyPrice)
          : Number(consultantMonthlyPrice ?? 0),
        consultantQuarterlyPrice: Number.isFinite(Number(dataRoomConsultantQuarterlyPrice))
          ? Number(dataRoomConsultantQuarterlyPrice)
          : Number(consultantQuarterlyPrice ?? 0),
        consultantAnnualPrice: Number.isFinite(Number(dataRoomConsultantAnnualPrice))
          ? Number(dataRoomConsultantAnnualPrice)
          : Number(consultantAnnualPrice ?? 0),
        ...(hasConsultantSetupFee ? { consultantSetupFee: 0 } : {}),
      }
    });

    return NextResponse.json({ 
      success: true,
      settings,
      dataRoomSettings,
    }, { status: 200 });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}


