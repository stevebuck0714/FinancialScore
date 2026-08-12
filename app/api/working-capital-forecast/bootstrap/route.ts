import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type BasisMode = 'cash' | 'accrual';
type Frequency = 'daily' | 'weekly' | 'monthly';

// 13-week forecast + default 12-week sales lookback; keep a small buffer only.
const DAILY_FINANCIALS_LIMIT = 98; // ~14 weeks
const AGING_LIMIT = 5; // latest as-of Friday only needs a few snapshots
const HISTORY_LIMIT = 98;

let ensureTableOnce: Promise<void> | null = null;

function asBasisMode(value: unknown): BasisMode {
  return value === 'accrual' ? 'accrual' : 'cash';
}

function extractBasisPayload(raw: unknown, basisMode: BasisMode): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  const hasBasisKeys =
    Object.prototype.hasOwnProperty.call(obj, 'cash') ||
    Object.prototype.hasOwnProperty.call(obj, 'accrual');
  if (!hasBasisKeys) return obj;
  return obj[basisMode] ?? {};
}

async function ensureWorkingCapitalForecastSettingsTable() {
  if (ensureTableOnce) return ensureTableOnce;
  ensureTableOnce = (async () => {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "WorkingCapitalForecastSettings" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "inputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "weeklyDrivers" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "historicalAverages" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "startingBalances" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "WorkingCapitalForecastSettings"
        ADD COLUMN IF NOT EXISTS "startingBalances" JSONB NOT NULL DEFAULT '{}'::jsonb
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "WorkingCapitalForecastSettings_companyId_key"
        ON "WorkingCapitalForecastSettings"("companyId")
      `);
    } catch (error: any) {
      if (!String(error?.message || '').includes('already exists')) {
        console.warn('WorkingCapitalForecastSettings table ensure warning:', error?.message || error);
      }
    }
  })();
  return ensureTableOnce;
}

async function loadSavedSettings(companyId: string, basisMode: BasisMode) {
  const readOnce = async () =>
    prisma.$queryRawUnsafe<
      Array<{
        inputs: unknown;
        weeklyDrivers: unknown;
        historicalAverages: unknown;
        startingBalances: unknown;
        updatedAt: Date;
      }>
    >(
      `SELECT "inputs", "weeklyDrivers", "historicalAverages", "startingBalances", "updatedAt"
       FROM "WorkingCapitalForecastSettings"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    );

  let rows: Awaited<ReturnType<typeof readOnce>>;
  try {
    // Prefer a plain SELECT. DDL ensure is only for first-time installs and adds
    // multi-second Neon latency when run on every cold bootstrap request.
    rows = await readOnce();
  } catch {
    await ensureWorkingCapitalForecastSettingsTable();
    rows = await readOnce();
  }
  const row = rows[0] || null;
  if (!row) return { settings: null };
  return {
    settings: {
      inputs: extractBasisPayload(row.inputs, basisMode),
      weeklyDrivers: extractBasisPayload(row.weeklyDrivers, basisMode),
      historicalAverages: extractBasisPayload(row.historicalAverages, basisMode),
      startingBalances: extractBasisPayload(row.startingBalances, basisMode),
      updatedAt: row.updatedAt,
    },
  };
}

async function loadFinancialForecastInputs(companyId: string, basisMode: BasisMode) {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        revenueGrowthByRow: unknown;
        cogsPctByRow: unknown;
        opexPctByRow: unknown;
        updatedAt: Date;
      }>
    >(
      `SELECT "revenueGrowthByRow", "cogsPctByRow", "opexPctByRow", "updatedAt"
       FROM "FinancialForecastInputSettings"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    );
    const row = rows[0] || null;
    if (!row) return { settings: null };
    return {
      settings: {
        revenueGrowthByRow: extractBasisPayload(row.revenueGrowthByRow, basisMode),
        cogsPctByRow: extractBasisPayload(row.cogsPctByRow, basisMode),
        opexPctByRow: extractBasisPayload(row.opexPctByRow, basisMode),
        updatedAt: row.updatedAt,
      },
    };
  } catch {
    return { settings: null };
  }
}

async function loadLoans(companyId: string) {
  try {
    const loans = await prisma.loan.findMany({
      where: { companyId },
      select: {
        loanType: true,
        status: true,
        loanAmount: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { loans };
  } catch {
    return { loans: [] };
  }
}

async function loadDailyFinancials(companyId: string) {
  const delegate = (prisma as any).dailyFinancialSnapshot;
  if (!delegate?.findMany) {
    return { records: [], summary: { latestCash: 0 } };
  }
  const records = await delegate.findMany({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    take: DAILY_FINANCIALS_LIMIT,
    select: {
      snapshotDate: true,
      cash: true,
      ar: true,
      ap: true,
      inventory: true,
      loc: true,
      revenue: true,
      expense: true,
      cogsTotal: true,
    },
  });
  const latestCash = Number(records[0]?.cash || 0);
  return {
    records,
    summary: { latestCash },
  };
}

async function loadOpenInvoiceAgingFallback(
  companyId: string,
  kind: 'ar' | 'ap',
): Promise<{ frequency: Frequency; data: { records: any[] } } | null> {
  try {
    if (kind === 'ar') {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          snapshotDate: Date;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
          totalAR: number;
        }>
      >(
        `WITH latest AS (
           SELECT MAX("snapshotDate") AS d
           FROM "AROpenInvoiceSnapshot"
           WHERE "companyId" = $1
         )
         SELECT
           latest.d AS "snapshotDate",
           COALESCE(SUM(s."current"), 0)::float AS current,
           COALESCE(SUM(s."days1to30"), 0)::float AS "days1to30",
           COALESCE(SUM(s."days31to60"), 0)::float AS "days31to60",
           COALESCE(SUM(s."days61to90"), 0)::float AS "days61to90",
           COALESCE(SUM(s."days90plus"), 0)::float AS "days90plus",
           COALESCE(SUM(s."amountDueHome"), 0)::float AS "totalAR"
         FROM "AROpenInvoiceSnapshot" s
         CROSS JOIN latest
         WHERE s."companyId" = $1
           AND latest.d IS NOT NULL
           AND s."snapshotDate" = latest.d
         GROUP BY latest.d`,
        companyId,
      );
      if (!rows[0]?.snapshotDate) return null;
      return { frequency: 'daily', data: { records: rows } };
    }

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        snapshotDate: Date;
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        days90plus: number;
        totalAP: number;
      }>
    >(
      `WITH latest AS (
         SELECT MAX("snapshotDate") AS d
         FROM "APOpenBillSnapshot"
         WHERE "companyId" = $1
       )
       SELECT
         latest.d AS "snapshotDate",
         COALESCE(SUM(s."current"), 0)::float AS current,
         COALESCE(SUM(s."days1to30"), 0)::float AS "days1to30",
         COALESCE(SUM(s."days31to60"), 0)::float AS "days31to60",
         COALESCE(SUM(s."days61to90"), 0)::float AS "days61to90",
         COALESCE(SUM(s."days90plus"), 0)::float AS "days90plus",
         COALESCE(SUM(s."amountDueHome"), 0)::float AS "totalAP"
       FROM "APOpenBillSnapshot" s
       CROSS JOIN latest
       WHERE s."companyId" = $1
         AND latest.d IS NOT NULL
         AND s."snapshotDate" = latest.d
       GROUP BY latest.d`,
      companyId,
    );
    if (!rows[0]?.snapshotDate) return null;
    return { frequency: 'daily', data: { records: rows } };
  } catch {
    return null;
  }
}

async function pickAgingSnapshots(
  companyId: string,
  kind: 'ar' | 'ap',
  order: Frequency[],
): Promise<{ frequency: Frequency; data: { records: any[] } } | null> {
  // Probe frequencies in parallel — sequential daily→weekly→monthly added
  // unnecessary round-trips when daily is empty.
  const attempts = await Promise.all(
    order.map(async (frequency) => {
      try {
        const records =
          kind === 'ar'
            ? await prisma.aRAgingSnapshot.findMany({
                where: { companyId, frequency },
                orderBy: { snapshotDate: 'desc' },
                take: AGING_LIMIT,
                select: {
                  snapshotDate: true,
                  totalAR: true,
                  current: true,
                  days1to30: true,
                  days31to60: true,
                  days61to90: true,
                  days90plus: true,
                },
              })
            : await prisma.aPAgingSnapshot.findMany({
                where: { companyId, frequency },
                orderBy: { snapshotDate: 'desc' },
                take: AGING_LIMIT,
                select: {
                  snapshotDate: true,
                  totalAP: true,
                  current: true,
                  days1to30: true,
                  days31to60: true,
                  days61to90: true,
                  days90plus: true,
                },
              });
        return records.length > 0 ? { frequency, data: { records } } : null;
      } catch {
        return null;
      }
    }),
  );
  for (const frequency of order) {
    const hit = attempts.find((row) => row?.frequency === frequency);
    if (hit) return hit;
  }
  return loadOpenInvoiceAgingFallback(companyId, kind);
}

function synthesizeHistoryFromDaily(
  dailyRecords: any[],
): {
  inventoryHistory: { frequency: Frequency; data: { records: any[] } } | null;
  productHistory: { frequency: Frequency; data: { records: any[] } } | null;
  productMarginHistory: { frequency: Frequency; data: { records: any[] } } | null;
} {
  if (!Array.isArray(dailyRecords) || dailyRecords.length === 0) {
    return { inventoryHistory: null, productHistory: null, productMarginHistory: null };
  }

  const inventoryRecords = dailyRecords
    .map((row) => ({
      snapshotDate: row.snapshotDate,
      assetValue: Number(row.inventory || 0),
    }))
    .filter((row) => Number.isFinite(row.assetValue));

  const productRecords = dailyRecords.map((row) => ({
    snapshotDate: row.snapshotDate,
    revenue: Number(row.revenue || 0),
    cogs: Number(row.cogsTotal || 0),
  }));

  const hasInventory = inventoryRecords.some((row) => row.assetValue > 0);
  const hasCogsOrRevenue = productRecords.some((row) => row.revenue > 0 || row.cogs > 0);

  return {
    inventoryHistory: hasInventory
      ? { frequency: 'daily', data: { records: inventoryRecords } }
      : null,
    productHistory: hasCogsOrRevenue
      ? { frequency: 'daily', data: { records: productRecords } }
      : null,
    productMarginHistory: hasCogsOrRevenue
      ? { frequency: 'daily', data: { records: productRecords } }
      : null,
  };
}

async function loadAggregatedProductHistory(
  companyId: string,
  order: Frequency[],
): Promise<{ frequency: Frequency; data: { records: any[] } } | null> {
  for (const frequency of order) {
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ snapshotDate: Date; revenue: number; cogs: number }>
      >(
        `SELECT date_trunc('day', "snapshotDate") AS "snapshotDate",
                COALESCE(SUM("revenue"), 0)::float AS revenue,
                COALESCE(SUM("cogs"), 0)::float AS cogs
         FROM "ProductSalesSnapshot"
         WHERE "companyId" = $1 AND frequency = $2
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT ${HISTORY_LIMIT}`,
        companyId,
        frequency,
      );
      if (rows.length > 0) {
        return {
          frequency,
          data: {
            records: rows.map((row) => ({
              snapshotDate: row.snapshotDate,
              revenue: Number(row.revenue || 0),
              cogs: Number(row.cogs || 0),
            })),
          },
        };
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function loadAggregatedInventoryHistory(
  companyId: string,
  order: Frequency[],
): Promise<{ frequency: Frequency; data: { records: any[] } } | null> {
  for (const frequency of order) {
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ snapshotDate: Date; assetValue: number }>
      >(
        `SELECT date_trunc('day', "snapshotDate") AS "snapshotDate",
                COALESCE(SUM("assetValue"), 0)::float AS "assetValue"
         FROM "InventorySnapshot"
         WHERE "companyId" = $1 AND frequency = $2
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT ${HISTORY_LIMIT}`,
        companyId,
        frequency,
      );
      if (rows.length > 0) {
        return {
          frequency,
          data: {
            records: rows.map((row) => ({
              snapshotDate: row.snapshotDate,
              assetValue: Number(row.assetValue || 0),
            })),
          },
        };
      }
    } catch {
      // continue
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    const basisMode = asBasisMode(searchParams.get('basisMode'));
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const latestOrder: Frequency[] = ['daily', 'weekly', 'monthly'];
    const historyOrder: Frequency[] = ['monthly', 'weekly', 'daily'];

    const [savedSettings, financialForecastInputs, loans, dailyFinancials, arAgingResult, apAgingResult] =
      await Promise.all([
        loadSavedSettings(companyId, basisMode),
        loadFinancialForecastInputs(companyId, basisMode),
        loadLoans(companyId),
        loadDailyFinancials(companyId),
        pickAgingSnapshots(companyId, 'ar', latestOrder),
        pickAgingSnapshots(companyId, 'ap', latestOrder),
      ]);

    let synthesized = synthesizeHistoryFromDaily(dailyFinancials.records);
    let inventoryHistory = synthesized.inventoryHistory;
    let productHistory = synthesized.productHistory;
    let productMarginHistory = synthesized.productMarginHistory;

    // Only hit heavy product/inventory aggregates when daily financials have no
    // usable series at all. Forecast defaults cover missing turns/margin.
    const needsHistoryFallback =
      dailyFinancials.records.length === 0 || (!inventoryHistory && !productHistory);
    if (needsHistoryFallback && (!inventoryHistory || !productHistory)) {
      const [invFallback, prodFallback] = await Promise.all([
        inventoryHistory ? Promise.resolve(null) : loadAggregatedInventoryHistory(companyId, historyOrder),
        productHistory ? Promise.resolve(null) : loadAggregatedProductHistory(companyId, historyOrder),
      ]);
      if (!inventoryHistory && invFallback) inventoryHistory = invFallback;
      if (!productHistory && prodFallback) {
        productHistory = prodFallback;
        productMarginHistory = prodFallback;
      }
    }

    const latestCash = Number(dailyFinancials.summary?.latestCash || 0);
    const cashResult =
      latestCash !== 0 || (Array.isArray(dailyFinancials.records) && dailyFinancials.records.length > 0)
        ? {
            frequency: 'daily' as Frequency,
            data: {
              records: dailyFinancials.records,
              summary: { totalCash: latestCash },
            },
          }
        : null;

    return NextResponse.json({
      ok: true,
      companyId,
      basisMode,
      savedSettings,
      financialForecastInputs,
      loans,
      operational: {
        dailyFinancials,
        cashResult,
        arAgingResult,
        apAgingResult,
        inventoryHistory,
        productHistory,
        productMarginHistory,
      },
    });
  } catch (error: any) {
    const message = String(error?.message || 'Unknown error');
    if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('authentication')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('working-capital-forecast bootstrap failed:', error);
    return NextResponse.json(
      { error: 'Unable to load cash forecast inputs', details: message },
      { status: 500 },
    );
  }
}
