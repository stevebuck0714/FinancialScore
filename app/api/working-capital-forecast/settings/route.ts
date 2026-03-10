import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type BasisMode = 'cash' | 'accrual';

function asBasisMode(value: unknown): BasisMode {
  return value === 'accrual' ? 'accrual' : 'cash';
}

function extractBasisPayload(raw: unknown, basisMode: BasisMode): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  const hasBasisKeys = Object.prototype.hasOwnProperty.call(obj, 'cash') || Object.prototype.hasOwnProperty.call(obj, 'accrual');
  if (!hasBasisKeys) return obj;
  return obj[basisMode] ?? {};
}

function mergeBasisPayload(existingRaw: unknown, incoming: unknown, basisMode: BasisMode): Record<string, unknown> {
  if (!existingRaw || typeof existingRaw !== 'object') {
    return { [basisMode]: incoming as unknown };
  }
  const existingObj = existingRaw as Record<string, unknown>;
  const hasBasisKeys = Object.prototype.hasOwnProperty.call(existingObj, 'cash') || Object.prototype.hasOwnProperty.call(existingObj, 'accrual');
  if (hasBasisKeys) {
    return { ...existingObj, [basisMode]: incoming as unknown };
  }
  return basisMode === 'cash'
    ? { cash: incoming as unknown }
    : { cash: existingObj, accrual: incoming as unknown };
}

async function ensureWorkingCapitalForecastSettingsTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WorkingCapitalForecastSettings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "inputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "weeklyDrivers" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "historicalAverages" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "WorkingCapitalForecastSettings_companyId_key"
      ON "WorkingCapitalForecastSettings"("companyId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WorkingCapitalForecastSettings_companyId_idx"
      ON "WorkingCapitalForecastSettings"("companyId")
    `);
  } catch (error: any) {
    if (!String(error?.message || '').includes('already exists')) {
      console.warn('WorkingCapitalForecastSettings table ensure warning:', error?.message || error);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const basisMode = asBasisMode(searchParams.get('basisMode'));
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    await ensureWorkingCapitalForecastSettingsTable();

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        inputs: unknown;
        weeklyDrivers: unknown;
        historicalAverages: unknown;
        updatedAt: Date;
      }>
    >(
      `SELECT "inputs", "weeklyDrivers", "historicalAverages", "updatedAt"
       FROM "WorkingCapitalForecastSettings"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    );

    const row = rows[0] || null;
    const settings = row
      ? {
          inputs: extractBasisPayload(row.inputs, basisMode),
          weeklyDrivers: extractBasisPayload(row.weeklyDrivers, basisMode),
          historicalAverages: extractBasisPayload(row.historicalAverages, basisMode),
          updatedAt: row.updatedAt,
        }
      : null;
    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to load working capital forecast settings', details: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, inputs, weeklyDrivers, historicalAverages } = body || {};
    const basisMode = asBasisMode(body?.basisMode);
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    await ensureWorkingCapitalForecastSettingsTable();
    const now = new Date().toISOString();
    const id = `wcfs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const existingRows = await prisma.$queryRawUnsafe<
      Array<{
        inputs: unknown;
        weeklyDrivers: unknown;
        historicalAverages: unknown;
      }>
    >(
      `SELECT "inputs", "weeklyDrivers", "historicalAverages"
       FROM "WorkingCapitalForecastSettings"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    );
    const existing = existingRows[0] || null;
    const mergedInputs = mergeBasisPayload(existing?.inputs, inputs || {}, basisMode);
    const mergedWeeklyDrivers = mergeBasisPayload(existing?.weeklyDrivers, Array.isArray(weeklyDrivers) ? weeklyDrivers : [], basisMode);
    const mergedHistoricalAverages = mergeBasisPayload(existing?.historicalAverages, historicalAverages || {}, basisMode);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "WorkingCapitalForecastSettings"
       ("id", "companyId", "inputs", "weeklyDrivers", "historicalAverages", "createdAt", "updatedAt")
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::timestamp, $7::timestamp)
       ON CONFLICT ("companyId")
       DO UPDATE SET
         "inputs" = EXCLUDED."inputs",
         "weeklyDrivers" = EXCLUDED."weeklyDrivers",
         "historicalAverages" = EXCLUDED."historicalAverages",
         "updatedAt" = EXCLUDED."updatedAt"`,
      id,
      companyId,
      JSON.stringify(mergedInputs),
      JSON.stringify(mergedWeeklyDrivers),
      JSON.stringify(mergedHistoricalAverages),
      now,
      now,
    );

    return NextResponse.json({ success: true, updatedAt: now });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to save working capital forecast settings', details: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
}
