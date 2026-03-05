import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const DEFAULT_SETTINGS = {
  sdeMultiplier: 2.5,
  ebitdaMultiplier: 5.0,
  dcfDiscountRate: 10.0,
  dcfTerminalGrowth: 2.0,
  sdeManualInputs: {},
  sdeAnalysisTotals: {},
};

async function ensureValuationSettingsTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ValuationSettings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "sdeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
        "ebitdaMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
        "dcfDiscountRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
        "dcfTerminalGrowth" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
        "sdeManualInputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "sdeAnalysisTotals" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ValuationSettings_companyId_key" ON "ValuationSettings"("companyId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ValuationSettings_companyId_idx" ON "ValuationSettings"("companyId")
    `);
  } catch (tableError: any) {
    if (!tableError.message?.includes('already exists') && !tableError.message?.includes('duplicate')) {
      console.warn('⚠️ ValuationSettings table creation warning:', tableError.message);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    await ensureValuationSettingsTable();

    const result = await prisma.$queryRaw<
      Array<{
        sdeMultiplier: number;
        ebitdaMultiplier: number;
        dcfDiscountRate: number;
        dcfTerminalGrowth: number;
        sdeManualInputs: Record<string, number> | null;
        sdeAnalysisTotals: Record<string, number> | null;
      }>
    >`
      SELECT
        "sdeMultiplier",
        "ebitdaMultiplier",
        "dcfDiscountRate",
        "dcfTerminalGrowth",
        "sdeManualInputs",
        "sdeAnalysisTotals"
      FROM "ValuationSettings"
      WHERE "companyId" = ${companyId}
      LIMIT 1
    `;

    if (result.length === 0) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    const settings = result[0];
    return NextResponse.json({
      sdeMultiplier: Number(settings.sdeMultiplier ?? DEFAULT_SETTINGS.sdeMultiplier),
      ebitdaMultiplier: Number(settings.ebitdaMultiplier ?? DEFAULT_SETTINGS.ebitdaMultiplier),
      dcfDiscountRate: Number(settings.dcfDiscountRate ?? DEFAULT_SETTINGS.dcfDiscountRate),
      dcfTerminalGrowth: Number(settings.dcfTerminalGrowth ?? DEFAULT_SETTINGS.dcfTerminalGrowth),
      sdeManualInputs: settings.sdeManualInputs && typeof settings.sdeManualInputs === 'object' ? settings.sdeManualInputs : {},
      sdeAnalysisTotals: settings.sdeAnalysisTotals && typeof settings.sdeAnalysisTotals === 'object' ? settings.sdeAnalysisTotals : {},
    });
  } catch (error) {
    console.error('❌ Error in valuation settings GET:', error);
    return NextResponse.json({
      error: 'Failed to fetch settings',
      details: String(error),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      sdeMultiplier,
      ebitdaMultiplier,
      dcfDiscountRate,
      dcfTerminalGrowth,
      sdeManualInputs = {},
      sdeAnalysisTotals = {},
    } = body;

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

    if (
      typeof sdeManualInputs !== 'object' ||
      sdeManualInputs === null ||
      typeof sdeAnalysisTotals !== 'object' ||
      sdeAnalysisTotals === null
    ) {
      return NextResponse.json({ error: 'Invalid SDE settings payload' }, { status: 400 });
    }

    await ensureValuationSettingsTable();
    const now = new Date().toISOString();
    const manualInputsJson = JSON.stringify(sdeManualInputs);
    const analysisTotalsJson = JSON.stringify(sdeAnalysisTotals);

    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ValuationSettings" WHERE "companyId" = ${companyId}
    `;

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ValuationSettings"
         SET "sdeMultiplier" = $1,
             "ebitdaMultiplier" = $2,
             "dcfDiscountRate" = $3,
             "dcfTerminalGrowth" = $4,
             "sdeManualInputs" = $5::jsonb,
             "sdeAnalysisTotals" = $6::jsonb,
             "updatedAt" = $7::timestamp
         WHERE "companyId" = $8`,
        sdeMultiplier,
        ebitdaMultiplier,
        dcfDiscountRate,
        dcfTerminalGrowth,
        manualInputsJson,
        analysisTotalsJson,
        now,
        companyId,
      );
    } else {
      const id = `vs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ValuationSettings" (
          id, "companyId", "sdeMultiplier", "ebitdaMultiplier", "dcfDiscountRate", "dcfTerminalGrowth", "sdeManualInputs", "sdeAnalysisTotals", "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamp, $10::timestamp)`,
        id,
        companyId,
        sdeMultiplier,
        ebitdaMultiplier,
        dcfDiscountRate,
        dcfTerminalGrowth,
        manualInputsJson,
        analysisTotalsJson,
        now,
        now,
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Valuation settings saved successfully',
      settings: {
        companyId,
        sdeMultiplier,
        ebitdaMultiplier,
        dcfDiscountRate,
        dcfTerminalGrowth,
        sdeManualInputs,
        sdeAnalysisTotals,
      },
    });
  } catch (error) {
    console.error('Error in valuation settings POST:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

