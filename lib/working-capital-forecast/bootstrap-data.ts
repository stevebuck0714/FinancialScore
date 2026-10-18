import prisma from '@/lib/prisma';
import type { ForecastBasisMode } from '@/lib/working-capital-forecast/engine';

type Frequency = 'daily' | 'weekly' | 'monthly';

// 13-week forecast + default 12-week sales lookback; keep a small buffer only.
const DAILY_FINANCIALS_LIMIT = 98; // ~14 weeks
const AGING_LIMIT = 5; // latest as-of Friday only needs a few snapshots
const HISTORY_LIMIT = 98;

let ensureTableOnce: Promise<void> | null = null;

function extractBasisPayload(raw: unknown, basisMode: ForecastBasisMode): unknown {
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

async function readSavedSettingsRow(companyId: string) {
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
  return rows[0] || null;
}

async function loadSavedSettings(companyId: string, basisMode: ForecastBasisMode) {
  const row = await readSavedSettingsRow(companyId);
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

/** Basis modes the company has saved 13-week forecast inputs for. */
export async function loadSavedForecastBasisModes(companyId: string): Promise<ForecastBasisMode[]> {
  const row = await readSavedSettingsRow(companyId).catch(() => null);
  if (!row || !row.inputs || typeof row.inputs !== 'object') return [];
  const inputs = row.inputs as Record<string, unknown>;
  const hasBasisKeys =
    Object.prototype.hasOwnProperty.call(inputs, 'cash') ||
    Object.prototype.hasOwnProperty.call(inputs, 'accrual');
  if (!hasBasisKeys) return Object.keys(inputs).length > 0 ? ['cash'] : [];
  return (['accrual', 'cash'] as ForecastBasisMode[]).filter((mode) => {
    const value = inputs[mode];
    return Boolean(value && typeof value === 'object' && Object.keys(value as object).length > 0);
  });
}

async function loadFinancialForecastInputs(companyId: string, basisMode: ForecastBasisMode) {
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
    let operationsLocs: Array<{ loanType: string; status: string; loanAmount: number }> = [];
    let hasGlLoanInstruments = false;
    try {
      const instrumentCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS "count" FROM "LoanInstrumentTerm" WHERE "companyId" = $1`,
        companyId,
      );
      hasGlLoanInstruments = Number(instrumentCount?.[0]?.count || 0) > 0;
      const rows = await prisma.$queryRawUnsafe<Array<{ originalBalance: number | null }>>(
        `SELECT "originalBalance"::float8 AS "originalBalance"
         FROM "LoanInstrumentTerm" terms
         LEFT JOIN "AccountMapping" mapping
           ON mapping."companyId" = terms."companyId"
          AND CONCAT('gl:', TRIM(mapping."accountId")) = terms."instrumentKey"
         WHERE terms."companyId" = $1
           AND COALESCE(terms."closed", false) = false
           AND COALESCE(terms."originalBalance", 0) > 0
           AND COALESCE(mapping."targetField", '') <> 'ltd'
           AND (
             COALESCE(mapping."targetField", '') = 'loc'
             OR COALESCE(terms."loanType", '') ~* '^(line[ _-]*of[ _-]*credit|loc|revolver)$'
             OR (
               NULLIF(TRIM(COALESCE(terms."loanType", '')), '') IS NULL
               AND COALESCE(mapping."targetField", '') = ''
               AND COALESCE(terms."displayName", '') ~* '(line[ _-]*of[ _-]*credit|loc|revolver)'
             )
           )
        `,
        companyId,
      );
      operationsLocs = rows.map((row) => ({
        loanType: 'LINE_OF_CREDIT',
        status: 'ACTIVE',
        loanAmount: Math.max(0, Number(row.originalBalance || 0)),
      }));
    } catch {
      operationsLocs = [];
      hasGlLoanInstruments = false;
    }
    // GL loan instruments (Loans page) are the LOC source of truth; covenant
    // Loan rows can carry stale LINE_OF_CREDIT types from older syncs.
    const forecastLoans = hasGlLoanInstruments || operationsLocs.length
      ? loans.filter((loan) => loan.loanType !== 'LINE_OF_CREDIT')
      : loans;
    return { loans: [...forecastLoans, ...operationsLocs], locFromLoanInstruments: hasGlLoanInstruments };
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

const median = (values: number[]): number | null => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function loadHistoricalApPaymentProfile(companyId: string) {
  try {
    const [paymentRows, matchedBillRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ paidAmountHome: number }>>(
        `SELECT "paidAmountHome"::float8 AS "paidAmountHome"
         FROM "APPaymentFact"
         WHERE "companyId" = $1
           AND "paymentDate" >= CURRENT_DATE - INTERVAL '91 days'`,
        companyId,
      ),
      prisma.$queryRawUnsafe<Array<{ paymentDate: Date; billDate: Date | null }>>(
        `SELECT p."paymentDate", bill."billDate"
         FROM "APPaymentFact" p
         JOIN LATERAL (
           SELECT s."billDate"
           FROM "APOpenBillSnapshot" s
           WHERE s."companyId" = p."companyId"
             AND s."billNo" = p."billNo"
             AND LOWER(s."vendorName") = LOWER(p."vendorName")
             AND s."snapshotDate" <= p."paymentDate"
           ORDER BY s."snapshotDate" DESC
           LIMIT 1
         ) bill ON true
         WHERE p."companyId" = $1
           AND p."paymentDate" >= CURRENT_DATE - INTERVAL '365 days'
           AND NULLIF(TRIM(COALESCE(p."billNo", '')), '') IS NOT NULL`,
        companyId,
      ),
    ]);
    const weeklyPaymentAmount = paymentRows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.paidAmountHome || 0)),
      0,
    ) / 13;
    const paymentLagDays = matchedBillRows
      .map((row) => {
        if (!row.billDate || !row.paymentDate) return Number.NaN;
        return Math.max(0, Math.round((new Date(row.paymentDate).getTime() - new Date(row.billDate).getTime()) / 86_400_000));
      })
      .filter((value) => Number.isFinite(value) && value <= 180);
    if (weeklyPaymentAmount <= 0) return null;
    const medianLagDays = median(paymentLagDays);
    return {
      weeklyPaymentAmount: Math.round(weeklyPaymentAmount),
      purchasePaymentLagWeeks: Math.max(1, Math.min(13, Math.round((medianLagDays ?? 28) / 7))),
      matchedPaymentCount: paymentLagDays.length,
    };
  } catch {
    return null;
  }
}

async function loadHistoricalArCollectionProfile(companyId: string) {
  try {
    const [openInvoices, matchedPayments] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{
        invoiceNo: string; customerId: string | null; customerName: string; invoiceDate: Date | null; dueDate: Date | null; amountDueHome: number;
      }>>(
        `WITH latest AS (
           SELECT MAX("snapshotDate") AS d FROM "AROpenInvoiceSnapshot" WHERE "companyId" = $1
         )
         SELECT s."invoiceNo", s."customerId", s."customerName", s."invoiceDate", s."dueDate",
           s."amountDueHome"::float8 AS "amountDueHome"
         FROM "AROpenInvoiceSnapshot" s
         CROSS JOIN latest
         WHERE s."companyId" = $1 AND s."snapshotDate" = latest.d`,
        companyId,
      ),
      prisma.$queryRawUnsafe<Array<{ paymentDate: Date; invoiceDate: Date | null; dueDate: Date | null }>>(
        `SELECT p."paymentDate", invoice."invoiceDate", invoice."dueDate"
         FROM "ARPaymentFact" p
         JOIN LATERAL (
           SELECT s."invoiceDate", s."dueDate"
           FROM "AROpenInvoiceSnapshot" s
           WHERE s."companyId" = p."companyId"
             AND s."invoiceNo" = p."invoiceNo"
             AND LOWER(s."customerName") = LOWER(p."customerName")
             AND s."snapshotDate" <= p."paymentDate"
           ORDER BY s."snapshotDate" DESC
           LIMIT 1
         ) invoice ON true
         WHERE p."companyId" = $1
           AND p."paymentDate" >= CURRENT_DATE - INTERVAL '365 days'
           AND NULLIF(TRIM(COALESCE(p."invoiceNo", '')), '') IS NOT NULL`,
        companyId,
      ),
    ]);
    const daysAfterDue = matchedPayments
      .map((row) => row.dueDate ? Math.round((new Date(row.paymentDate).getTime() - new Date(row.dueDate).getTime()) / 86_400_000) : Number.NaN)
      .filter((value) => Number.isFinite(value) && value >= -90 && value <= 180);
    // Open invoice due dates are still the best available schedule even when
    // the source does not provide payment-to-invoice matches. In that case,
    // assume payment on the due date rather than reverting to a four-week
    // aggregate AR allocation.
    if (!openInvoices.length) return null;
    return {
      paymentDaysAfterDue: Math.round(median(daysAfterDue) || 0),
      matchedPaymentCount: daysAfterDue.length,
      openInvoices,
    };
  } catch {
    return null;
  }
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

/** Data behind `/api/working-capital-forecast/bootstrap`, before currency presentation. */
export async function loadWorkingCapitalForecastBootstrap(companyId: string, basisMode: ForecastBasisMode) {
  const latestOrder: Frequency[] = ['daily', 'weekly', 'monthly'];
  const historyOrder: Frequency[] = ['monthly', 'weekly', 'daily'];

  const [savedSettings, financialForecastInputs, loans, dailyFinancials, arAgingResult, apAgingResult, historicalApPaymentProfile, historicalArCollectionProfile] =
    await Promise.all([
      loadSavedSettings(companyId, basisMode),
      loadFinancialForecastInputs(companyId, basisMode),
      loadLoans(companyId),
      loadDailyFinancials(companyId),
      pickAgingSnapshots(companyId, 'ar', latestOrder),
      pickAgingSnapshots(companyId, 'ap', latestOrder),
      loadHistoricalApPaymentProfile(companyId),
      loadHistoricalArCollectionProfile(companyId),
    ]);

  const synthesized = synthesizeHistoryFromDaily(dailyFinancials.records);
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

  return {
    savedSettings,
    financialForecastInputs,
    loans,
    operational: {
      dailyFinancials,
      cashResult,
      arAgingResult,
      apAgingResult,
      historicalApPaymentProfile,
      historicalArCollectionProfile,
      inventoryHistory,
      productHistory,
      productMarginHistory,
    },
  };
}
