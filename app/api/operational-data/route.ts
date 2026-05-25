import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { buildOperationalMockResponse, buildOperationalMockSummaryCounts } from '@/lib/operations/sector-mock-data';
import {
  buildJobCostControlMock,
  buildProjectPortfolioMock,
  buildCommitmentsForecastMock,
  buildBillingCashMock,
  buildConstructionArMock,
  buildConstructionApMock,
} from '@/lib/operations/construction-mock-data';
import {
  buildRevenueBillablesMock,
  buildUnitEconomicsMock,
  buildLaborSchedulingMock,
  buildCustomersSitesMock,
} from '@/lib/operations/staffing-mock-data';
import {
  getBambooHrHiringPayload,
  getBambooHrLaborSchedulingPayload,
  getBambooHrRevenueBillablesPayload,
  getBambooHrUnitEconomicsPayload,
  readBambooHrWorkforceReportSnapshot,
} from '@/lib/operations/bamboohr-workforce-reports';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getApBalanceSheetAnchorConfig } from '@/lib/financial/ap-balance-sheet-anchor';
import { getArBalanceSheetAnchorConfig } from '@/lib/financial/ar-balance-sheet-anchor';
import { getCashAccountAllowlistSet, isAllowedCashAccount } from '@/lib/financial/cash-balance-sheet-anchor';
import { computeDsoSeriesFromDaily } from '@/lib/financials/dso-from-daily';
import {
  ensurePlatosClosetMonthlyFacts,
  getPlatosClosetInventoryPayload,
  getPlatosClosetProductsPayload,
  getPlatosClosetSalesPageSummary,
  hasPlatosClosetMonthlyFacts,
} from '@/lib/operational/platos-closet-monthly-facts';
import {
  getRetailSubcategoryHistoryProductsPayload,
  getRetailSubcategoryTurnsSummary,
  hasRetailSubcategoryHistoryFacts,
} from '@/lib/operational/retail-subcategory-history';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import { privateCacheHeaders } from '@/lib/http-cache';

export const dynamic = 'force-dynamic';

const OPERATIONAL_DATA_CACHE_TTL_SECONDS = 120;
const CUSTOMER_CONCENTRATION_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const CUSTOMER_CONCENTRATION_CACHE_VERSION = 'customer-concentration-exposure-v10';
const WHOLESALE_PRODUCTS_REPORT_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const OPERATIONAL_CACHEABLE_TYPES = new Set([
  'customers',
  'ar-aging',
  'ap-aging',
  'products',
  'inventory',
  'cash',
  'ap',
  'daily-financials',
  'labor-scheduling',
  'hiring',
  'revenue-billables',
  'unit-economics',
  'summary',
]);

async function companyHasAnyRealOperationalData(companyId: string): Promise<boolean> {
  const optionalFindFirst = async (delegate: any): Promise<{ id: string } | null> => {
    if (!delegate || typeof delegate.findFirst !== 'function') return null;
    return delegate.findFirst({ where: { companyId }, select: { id: true } });
  };

  const platoFactsPromise = prisma
    .$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${companyId}
      LIMIT 1
    `)
    .catch(() => []);

  const [
    customers,
    arAging,
    apAging,
    products,
    inventory,
    cash,
    arOpenInvoices,
    arPayments,
    apOpenBills,
    apPayments,
    platoFacts,
  ] = await Promise.all([
    prisma.customerSalesSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aRAgingSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aPAgingSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.productSalesSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.inventorySnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.cashSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aROpenInvoiceSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aRPaymentFact.findFirst({ where: { companyId }, select: { id: true } }),
    optionalFindFirst((prisma as any).aPOpenBillSnapshot),
    optionalFindFirst((prisma as any).aPPaymentFact),
    platoFactsPromise,
  ]);
  return Boolean(
    customers ||
      arAging ||
      apAging ||
      products ||
      inventory ||
      cash ||
      arOpenInvoices ||
      arPayments ||
      apOpenBills ||
      apPayments ||
      platoFacts.length > 0
  );
}

async function activateRealOperationalData(companyId: string): Promise<void> {
  await prisma.company.updateMany({
    where: {
      id: companyId,
      hasRealOperationalData: false,
    },
    data: {
      hasRealOperationalData: true,
      realDataActivatedAt: new Date(),
    },
  });
}

async function safeOperationalVersionPart(label: string, sql: string, ...params: unknown[]) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
    return { label, rows };
  } catch (error: any) {
    return { label, unavailable: true, error: String(error?.message || error).slice(0, 120) };
  }
}

async function buildOperationalDataVersion(companyId: string, type: string | null, startDate: Date, endDate: Date): Promise<string> {
  const includeAll = type === 'summary';
  const parts = await Promise.all([
    (includeAll || type === 'customers')
      ? safeOperationalVersionPart(
          'CustomerSalesSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "CustomerSalesSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'CustomerSalesSnapshot', skipped: true }),
    (includeAll || type === 'customers')
      ? safeOperationalVersionPart(
          'InforRawRecordCustomerSales',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("fetchedAt") AS "maxFetchedAt", MAX("businessDate") AS "maxBusinessDate"
           FROM "InforRawRecord"
           WHERE "companyId" = $1
             AND "miProgram" IN ('SLArtrans', 'SLCoitems', 'SLCOITEMS', 'SLCos', 'SLCohdrs')
             AND "businessDate" >= $2
             AND "businessDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'InforRawRecordCustomerSales', skipped: true }),
    (includeAll || type === 'ar-aging')
      ? safeOperationalVersionPart(
          'ARAgingSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "ARAgingSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'ARAgingSnapshot', skipped: true }),
    (includeAll || type === 'ap-aging' || type === 'ap')
      ? safeOperationalVersionPart(
          'APAgingSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "APAgingSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'APAgingSnapshot', skipped: true }),
    (includeAll || type === 'products')
      ? safeOperationalVersionPart(
          'ProductSalesSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "ProductSalesSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'ProductSalesSnapshot', skipped: true }),
    (includeAll || type === 'products')
      ? safeOperationalVersionPart(
          'InforRawRecordProducts',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("fetchedAt") AS "maxFetchedAt", MAX("businessDate") AS "maxBusinessDate"
           FROM "InforRawRecord"
           WHERE "companyId" = $1
             AND "miProgram" IN (
               'SLCoitems',
               'SLCOITEMS',
               'SLItems',
               'SLItemVends',
               'SLItemVendPrices',
               'SLCustomerItems',
               'SLCustItems',
               'SLCustItem',
               'SLItemCusts',
               'SLItemCust',
               'SLCustItemXrefs',
               'SLCustItemCrossRefs',
               'SLCustomerItemCrossRefs'
             )
             AND ("businessDate" IS NULL OR ("businessDate" >= $2 AND "businessDate" <= $3))`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'InforRawRecordProducts', skipped: true }),
    (includeAll || type === 'inventory')
      ? safeOperationalVersionPart(
          'InventorySnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "InventorySnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'InventorySnapshot', skipped: true }),
    (includeAll || type === 'cash')
      ? safeOperationalVersionPart(
          'CashSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "CashSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'CashSnapshot', skipped: true }),
    (includeAll || type === 'daily-financials')
      ? safeOperationalVersionPart(
          'DailyFinancialSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "DailyFinancialSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2 AND "snapshotDate" <= $3`,
          companyId,
          startDate,
          endDate
        )
      : Promise.resolve({ label: 'DailyFinancialSnapshot', skipped: true }),
    (includeAll || type === 'products' || type === 'inventory')
      ? safeOperationalVersionPart(
          'PlatosClosetMonthlyFact',
          `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("monthStart") AS "maxMonthStart"
           FROM "PlatosClosetMonthlyFact"
           WHERE "companyId" = $1`,
          companyId
        )
      : Promise.resolve({ label: 'PlatosClosetMonthlyFact', skipped: true }),
  ]);
  return hashCacheParts(parts);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// UTC start-of-month for `date` shifted by `months`. Local-TZ accessors
// here used to roll a UTC-midnight `date` (eg. 2026-03-01T00:00:00Z) into
// the wrong month on negative-offset laptops. See lib/date-utils.ts.
function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function isWeekendUtc(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

// UTC day boundaries. Daily snapshots are written at UTC midnight by
// lib/financial/daily-bs-from-gl.ts, so day buckets must also be anchored at
// UTC midnight (00:00:00.000Z). This used to anchor at 04:00 UTC ("US Eastern
// midnight") which silently dropped early-morning UTC snapshots into the
// previous day. See lib/date-utils.ts for the broader rule.
function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

function parseInforDateValue(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  const parsed = new Date(raw.replace(/\s+\d{2}:\d{2}:\d{2}\.\d+$/, ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateParamBoundary(value: string | null, boundary: 'start' | 'end', fallback: Date): Date {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  // Date-only params expand to full UTC days so same-day snapshots stored at
  // non-midnight UTC timestamps are still included in the window.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const day = parseIsoDayKey(trimmed);
    return boundary === 'start' ? day : endOfUtcDay(day);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function dateKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseIsoDayKey(dayKey: string): Date {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(`${dayKey}T00:00:00.000Z`);
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function computeDailyCashTotalsByDate(
  rows: Array<{ snapshotDate: Date; cashBalance: number }>
): Array<{ date: string; totalCash: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = dateKeyUtc(new Date(r.snapshotDate));
    map.set(k, (map.get(k) || 0) + Number(r.cashBalance || 0));
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totalCash]) => ({ date, totalCash }));
}

function computeDailyApTotalsByDate(
  rows: Array<{ snapshotDate: Date; apBalance: number }>
): Array<{ date: string; totalAp: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = dateKeyUtc(new Date(r.snapshotDate));
    map.set(k, (map.get(k) || 0) + Number(r.apBalance || 0));
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totalAp]) => ({ date, totalAp }));
}

// UTC-only month/quarter/year bucketing.
//
// History: these used to apply a "business TZ" shift (UTC-4) before bucketing,
// on the theory that daily snapshots stored at midnight UTC actually represent
// the business day in US Eastern. That coupling silently put boundary
// snapshots (eg. a `2026-03-01T00:00:00Z` row, which is "Feb 28 8pm" Eastern)
// in the previous month when this aggregator rolled up to monthly, while the
// publish-month writer (which is the source of `MonthlyFinancial.monthDate`)
// bucketed the same snapshot in March. Result: Daily Financials and Data
// Review disagreed by exactly one day's revenue at the start of every month.
//
// The unification rule for the entire app is: bucket by the row's UTC
// calendar day, period. See lib/date-utils.ts for the broader rule and
// lib/financial/publish-month-service.ts for the writer side.
function shiftToBusinessTz(date: Date): Date {
  return date;
}

function startOfBusinessMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfBusinessQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
}

function startOfBusinessYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function businessMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStartFromBusinessMonthKey(key: string): Date {
  const [yearRaw, monthRaw] = String(key || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return startOfBusinessMonth(new Date());
  }
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

type StatementRollup = 'daily' | 'quarterly' | 'annual';

const DAILY_STATEMENT_INCOME_FIELDS = ['revenue', 'cogsTotal', 'expense'] as const;
const DAILY_STATEMENT_BALANCE_FIELDS = [
  'cash',
  'ar',
  'ap',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'otherAssets',
  'loc',
  'otherCL',
  'tcl',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalAssets',
  'totalLiab',
  'totalEquity',
  'totalLAndE',
] as const;

// UTC quarter/year bucket boundaries used by the aggregator. Same UTC-only
// rule as the helpers above — see comment on shiftToBusinessTz.
function startOfBusinessQuarterByDate(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
}

function endOfBusinessQuarterByDate(date: Date): Date {
  const start = startOfBusinessQuarterByDate(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0, 23, 59, 59, 999));
}

function startOfBusinessYearByDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function endOfBusinessYearByDate(date: Date): Date {
  const start = startOfBusinessYearByDate(date);
  return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 0, 23, 59, 59, 999));
}

function statementRollupKey(date: Date, rollup: StatementRollup): string {
  if (rollup === 'daily') {
    return dateKeyUtc(date);
  }
  if (rollup === 'quarterly') {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${date.getUTCFullYear()}-Q${quarter}`;
  }
  return String(date.getUTCFullYear());
}

function aggregateDailyStatementRows(
  rows: any[],
  rollup: StatementRollup
): Array<{
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  sourceDays: number;
  revenue: number;
  cogsTotal: number;
  expense: number;
  netIncome: number;
  cash: number;
  ar: number;
  ap: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  otherAssets: number;
  loc: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  ownersCapital: number;
  ownersDraw: number;
  commonStock: number;
  preferredStock: number;
  retainedEarnings: number;
  additionalPaidInCapital: number;
  treasuryStock: number;
  totalAssets: number;
  totalLiab: number;
  totalEquity: number;
  totalLAndE: number;
}> {
  const buckets = new Map<
    string,
    {
      periodStart: Date;
      periodEnd: Date;
      sourceDays: Set<string>;
      revenue: number;
      cogsTotal: number;
      expense: number;
      cash: number;
      ar: number;
      ap: number;
      inventory: number;
      otherCA: number;
      tca: number;
      fixedAssets: number;
      otherAssets: number;
      loc: number;
      otherCL: number;
      tcl: number;
      ltd: number;
      ownersCapital: number;
      ownersDraw: number;
      commonStock: number;
      preferredStock: number;
      retainedEarnings: number;
      additionalPaidInCapital: number;
      treasuryStock: number;
      totalAssets: number;
      totalLiab: number;
      totalEquity: number;
      totalLAndE: number;
      lastSnapshotDate: Date | null;
    }
  >();

  const normalizedRows = [...rows]
    .filter((row) => row?.snapshotDate)
    .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());

  for (const row of normalizedRows) {
    const snapshotDate = new Date(row.snapshotDate);
    if (Number.isNaN(snapshotDate.getTime())) continue;
    const key = statementRollupKey(snapshotDate, rollup);
    if (!buckets.has(key)) {
      const periodStart =
        rollup === 'daily'
          ? startOfUtcDay(snapshotDate)
          : rollup === 'quarterly'
            ? startOfBusinessQuarterByDate(snapshotDate)
            : startOfBusinessYearByDate(snapshotDate);
      const periodEnd =
        rollup === 'daily'
          ? endOfUtcDay(snapshotDate)
          : rollup === 'quarterly'
            ? endOfBusinessQuarterByDate(snapshotDate)
            : endOfBusinessYearByDate(snapshotDate);
      buckets.set(key, {
        periodStart,
        periodEnd,
        sourceDays: new Set<string>(),
        revenue: 0,
        cogsTotal: 0,
        expense: 0,
        cash: 0,
        ar: 0,
        ap: 0,
        inventory: 0,
        otherCA: 0,
        tca: 0,
        fixedAssets: 0,
        otherAssets: 0,
        loc: 0,
        otherCL: 0,
        tcl: 0,
        ltd: 0,
        ownersCapital: 0,
        ownersDraw: 0,
        commonStock: 0,
        preferredStock: 0,
        retainedEarnings: 0,
        additionalPaidInCapital: 0,
        treasuryStock: 0,
        totalAssets: 0,
        totalLiab: 0,
        totalEquity: 0,
        totalLAndE: 0,
        lastSnapshotDate: null,
      });
    }

    const bucket = buckets.get(key)!;
    bucket.sourceDays.add(dateKeyUtc(snapshotDate));
    for (const field of DAILY_STATEMENT_INCOME_FIELDS) {
      bucket[field] += Number(row?.[field] || 0);
    }
    if (!bucket.lastSnapshotDate || snapshotDate.getTime() >= bucket.lastSnapshotDate.getTime()) {
      bucket.lastSnapshotDate = snapshotDate;
      for (const field of DAILY_STATEMENT_BALANCE_FIELDS) {
        bucket[field] = Number(row?.[field] || 0);
      }
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[1].periodStart.getTime() - b[1].periodStart.getTime())
    .map(([periodKey, bucket]) => {
      const tca = bucket.tca !== 0 ? bucket.tca : bucket.cash + bucket.ar + bucket.inventory + bucket.otherCA;
      const totalAssets = bucket.totalAssets !== 0 ? bucket.totalAssets : tca + bucket.fixedAssets + bucket.otherAssets;
      const tcl = bucket.tcl !== 0 ? bucket.tcl : bucket.ap + bucket.loc + bucket.otherCL;
      const totalLiab = bucket.totalLiab !== 0 ? bucket.totalLiab : tcl + bucket.ltd;
      const totalEquity =
        bucket.totalEquity !== 0
          ? bucket.totalEquity
          : bucket.ownersCapital +
            bucket.ownersDraw +
            bucket.commonStock +
            bucket.preferredStock +
            bucket.retainedEarnings +
            bucket.additionalPaidInCapital +
            bucket.treasuryStock;
      const totalLAndE = bucket.totalLAndE !== 0 ? bucket.totalLAndE : totalLiab + totalEquity;
      return {
        periodKey,
        periodStart: bucket.periodStart.toISOString(),
        periodEnd: bucket.periodEnd.toISOString(),
        sourceDays: bucket.sourceDays.size,
        revenue: bucket.revenue,
        cogsTotal: bucket.cogsTotal,
        expense: bucket.expense,
        netIncome: bucket.revenue - bucket.cogsTotal - bucket.expense,
        cash: bucket.cash,
        ar: bucket.ar,
        ap: bucket.ap,
        inventory: bucket.inventory,
        otherCA: bucket.otherCA,
        tca,
        fixedAssets: bucket.fixedAssets,
        otherAssets: bucket.otherAssets,
        loc: bucket.loc,
        otherCL: bucket.otherCL,
        tcl,
        ltd: bucket.ltd,
        ownersCapital: bucket.ownersCapital,
        ownersDraw: bucket.ownersDraw,
        commonStock: bucket.commonStock,
        preferredStock: bucket.preferredStock,
        retainedEarnings: bucket.retainedEarnings,
        additionalPaidInCapital: bucket.additionalPaidInCapital,
        treasuryStock: bucket.treasuryStock,
        totalAssets,
        totalLiab,
        totalEquity,
        totalLAndE,
      };
    });
}

async function getHydratedInforBusinessDates(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<Date[]> {
  const startDayKey = dateKeyUtc(startDate);
  const endDayKey = dateKeyUtc(endDate);
  const normalizedStart = new Date(`${startDayKey}T00:00:00.000Z`);
  const normalizedEnd = new Date(`${endDayKey}T23:59:59.999Z`);
  const rows = await prisma.$queryRaw<Array<{ businessDate: Date }>>`
    SELECT DISTINCT "businessDate"
    FROM "InforRawCompleteness"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND "isComplete" = true
      AND "businessDate" >= ${normalizedStart}
      AND "businessDate" <= ${normalizedEnd}
    ORDER BY "businessDate" ASC
  `;
  return rows
    .map((row) => {
      if (!row?.businessDate) return null;
      const dayKey = new Date(row.businessDate).toISOString().slice(0, 10);
      return new Date(`${dayKey}T00:00:00.000Z`);
    })
    .filter((value): value is Date => Boolean(value));
}

let customerOrderLineOrderDateColumnCache: boolean | null = null;
async function customerOrderLineHasOrderDateColumn(): Promise<boolean> {
  if (customerOrderLineOrderDateColumnCache !== null) return customerOrderLineOrderDateColumnCache;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'CustomerOrderLineSnapshot'
           AND column_name = 'orderDate'
       ) AS exists`
    );
    customerOrderLineOrderDateColumnCache = Boolean(rows?.[0]?.exists);
  } catch {
    customerOrderLineOrderDateColumnCache = false;
  }
  return customerOrderLineOrderDateColumnCache;
}

async function deriveCustomerSalesFromOrderLineDeltas(
  companyId: string,
  frequency: 'daily' | 'weekly' | 'monthly',
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    companyId: string;
    snapshotDate: Date;
    frequency: 'daily' | 'weekly' | 'monthly';
    customerId: string | null;
    customerName: string;
    revenue: number;
    invoiceCount: number;
    avgInvoiceSize: number | null;
  }>
> {
  const snapshotStart = new Date(`${dateKeyUtc(startDate)}T00:00:00.000Z`);
  const snapshotEnd = new Date(`${dateKeyUtc(endDate)}T23:59:59.999Z`);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      snapshotDate: Date;
      customerId: string | null;
      customerName: string | null;
      revenue: number;
      invoiceCount: number;
    }>
  >(
    `
      WITH daily_state AS (
        SELECT
          date_trunc('day', "snapshotDate") AS day,
          "customerId",
          "customerName",
          "orderId",
          "lineId",
          GREATEST(COALESCE("invoicedAmount", 0), 0)::double precision AS "invoicedAmount",
          ROW_NUMBER() OVER (
            PARTITION BY "orderId", "lineId", date_trunc('day', "snapshotDate")
            ORDER BY "snapshotDate" DESC
          ) AS rn
        FROM "CustomerOrderLineSnapshot"
        WHERE "companyId" = $1
          AND "frequency" = $2
          AND "snapshotDate" >= $3
          AND "snapshotDate" <= $4
      ),
      deduped AS (
        SELECT day, "customerId", "customerName", "orderId", "lineId", "invoicedAmount"
        FROM daily_state
        WHERE rn = 1
      ),
      line_deltas AS (
        SELECT
          day,
          "customerId",
          "customerName",
          "orderId",
          GREATEST(
            "invoicedAmount" - LAG("invoicedAmount", 1, 0) OVER (
              PARTITION BY "orderId", "lineId"
              ORDER BY day ASC
            ),
            0
          )::double precision AS revenue_delta
        FROM deduped
      )
      SELECT
        day AS "snapshotDate",
        NULLIF(TRIM(COALESCE("customerId", '')), '') AS "customerId",
        NULLIF(TRIM(COALESCE("customerName", '')), '') AS "customerName",
        COALESCE(SUM(revenue_delta), 0)::double precision AS revenue,
        COUNT(DISTINCT "orderId")::int AS "invoiceCount"
      FROM line_deltas
      WHERE revenue_delta > 0.0001
      GROUP BY day, "customerId", "customerName"
      ORDER BY day ASC, "customerName" ASC
    `,
    companyId,
    frequency,
    snapshotStart,
    snapshotEnd
  );

  return rows.map((row) => {
    const customerId = String(row.customerId || '').trim() || null;
    const customerName = String(row.customerName || '').trim() || (customerId ? `Customer ${customerId}` : 'Unknown Customer');
    const revenue = Number(row.revenue || 0);
    const invoiceCount = Math.max(0, Number(row.invoiceCount || 0));
    return {
      companyId,
      snapshotDate: new Date(row.snapshotDate),
      frequency,
      customerId,
      customerName,
      revenue,
      invoiceCount,
      avgInvoiceSize: invoiceCount > 0 ? revenue / invoiceCount : null,
    };
  });
}

async function deriveCustomerSalesFromRawInvoices(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    companyId: string;
    snapshotDate: Date;
    frequency: 'monthly';
    customerId: string | null;
    customerName: string;
    revenue: number;
    invoiceCount: number;
    avgInvoiceSize: number | null;
  }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      month_start: Date;
      customer_id: string | null;
      customer_name: string | null;
      revenue: number;
      invoice_count: number;
    }>
  >(Prisma.sql`
    WITH raw_rows AS (
      SELECT
        "miProgram",
        "payload",
        COALESCE(
          CASE
            WHEN "payload"->>'InvDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'InvDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'InvDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'InvDate', 10)::date
            WHEN "payload"->>'RecordDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'RecordDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'RecordDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'RecordDate', 10)::date
            WHEN "payload"->>'DistDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'DistDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'DistDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'DistDate', 10)::date
            WHEN "payload"->>'DueDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'DueDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'DueDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'DueDate', 10)::date
            ELSE NULL
          END,
          "businessDate"::date
        ) AS invoice_date,
        COALESCE(
          NULLIF("payload"->>'CustNum', ''),
          NULLIF("payload"->>'CorpCust', ''),
          NULLIF("payload"->>'CustNo', ''),
          NULLIF("payload"->>'customerId', '')
        ) AS customer_id,
        COALESCE(
          NULLIF("payload"->>'DerCustName', ''),
          NULLIF("payload"->>'CadName', ''),
          NULLIF("payload"->>'DerCustNoName', ''),
          NULLIF("payload"->>'CustName', ''),
          NULLIF("payload"->>'Name', ''),
          NULLIF("payload"->>'CustNum', '')
        ) AS customer_name,
        COALESCE(
          NULLIF("payload"->>'InvNum', ''),
          NULLIF("payload"->>'DerInvNum', ''),
          NULLIF("payload"->>'ApplyToInvNum', ''),
          NULLIF("payload"->>'DerApplyToInvNum', ''),
          NULLIF("payload"->>'invoiceNo', ''),
          NULLIF("payload"->>'invoiceNumber', '')
        ) AS invoice_no,
        UPPER(NULLIF("payload"->>'Type', '')) AS trans_type,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'Amount', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'DomAmt', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'CUAM', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'ACAM', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'InvAmt', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'invoiceAmount', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'DerOrderBalance', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        )::double precision AS amount
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND "miProgram" = 'SLArtrans'
    )
    SELECT
      date_trunc('month', invoice_date)::date AS month_start,
      NULLIF(TRIM(COALESCE(customer_id, '')), '') AS customer_id,
      NULLIF(TRIM(COALESCE(customer_name, '')), '') AS customer_name,
      SUM(ABS(amount))::double precision AS revenue,
      COUNT(DISTINCT COALESCE(invoice_no, customer_id || ':' || invoice_date::text || ':' || amount::text))::int AS invoice_count
    FROM raw_rows
    WHERE invoice_date >= ${startDate}::date
      AND invoice_date <= ${endDate}::date
      AND amount <> 0
      AND (trans_type IS NULL OR trans_type NOT IN ('P', 'C'))
    GROUP BY 1, 2, 3
    HAVING SUM(ABS(amount)) > 0
    ORDER BY 1 ASC, 3 ASC
  `);

  return rows.map((row) => {
    const customerId = String(row.customer_id || '').trim() || null;
    const customerName = String(row.customer_name || '').trim() || (customerId ? `Customer ${customerId}` : 'Unknown Customer');
    const revenue = Number(row.revenue || 0);
    const invoiceCount = Math.max(0, Number(row.invoice_count || 0));
    return {
      companyId,
      snapshotDate: new Date(row.month_start),
      frequency: 'monthly',
      customerId,
      customerName,
      revenue,
      invoiceCount,
      avgInvoiceSize: invoiceCount > 0 ? revenue / invoiceCount : null,
    };
  });
}

async function deriveCustomerMarginFromRawOrderLineDeltas(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    monthKey: string;
    customerKey: string;
    customerIdKey: string;
    customerName: string;
    revenue: number;
    grossProfit: number;
  }>
> {
  const lineLookbackStart = new Date(startDate);
  lineLookbackStart.setUTCDate(lineLookbackStart.getUTCDate() - 45);
  const rows = await prisma.$queryRaw<
    Array<{
      month_key: string;
      customer_key: string;
      customer_id_key: string | null;
      customer_name: string | null;
      revenue: number;
      cogs: number;
    }>
  >(Prisma.sql`
    WITH headers AS (
      SELECT DISTINCT ON (order_id)
        order_id,
        NULLIF(TRIM(customer_id), '') AS customer_id,
        NULLIF(TRIM(
          CASE
            WHEN POSITION(' - ' IN COALESCE(customer_name, '')) > 0
              THEN SUBSTRING(customer_name FROM POSITION(' - ' IN customer_name) + 3)
            ELSE customer_name
          END
        ), '') AS customer_name
      FROM (
        SELECT
          COALESCE(
            NULLIF("payload"->>'CoNum', ''),
            NULLIF("payload"->>'CONUM', ''),
            NULLIF("payload"->>'coNum', '')
          ) AS order_id,
          COALESCE(
            NULLIF("payload"->>'CustNum', ''),
            NULLIF("payload"->>'CoCustNum', ''),
            NULLIF("payload"->>'CustNo', '')
          ) AS customer_id,
          COALESCE(
            NULLIF("payload"->>'DerCustNoName', ''),
            NULLIF("payload"->>'DerCustName', ''),
            NULLIF("payload"->>'CustName', ''),
            NULLIF("payload"->>'Name', '')
          ) AS customer_name,
          "businessDate",
          "fetchedAt",
          "createdAt"
        FROM "InforRawRecord"
        WHERE "companyId" = ${companyId}
          AND "miProgram" IN ('SLCos', 'SLCohdrs')
          AND "businessDate" <= ${endDate}::date
      ) raw_headers
      WHERE order_id IS NOT NULL AND TRIM(order_id) <> ''
      ORDER BY order_id, "businessDate" DESC NULLS LAST, "fetchedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST
    ),
    invoice_orders AS (
      SELECT
        order_id,
        customer_id,
        customer_name,
        invoice_date
      FROM (
        SELECT
          COALESCE(
            NULLIF("payload"->>'CoNum', ''),
            NULLIF("payload"->>'CONUM', ''),
            NULLIF("payload"->>'coNum', ''),
            NULLIF("payload"->>'OrderNum', ''),
            NULLIF("payload"->>'OrderNo', '')
          ) AS order_id,
          COALESCE(
            NULLIF("payload"->>'CustNum', ''),
            NULLIF("payload"->>'CorpCust', '')
          ) AS customer_id,
          COALESCE(
            NULLIF("payload"->>'DerCustName', ''),
            NULLIF("payload"->>'CadName', ''),
            NULLIF("payload"->>'DerCustNoName', ''),
            NULLIF("payload"->>'CustNum', '')
          ) AS customer_name,
          COALESCE(
            CASE
              WHEN "payload"->>'InvDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'InvDate', 8), 'YYYYMMDD')
              WHEN "payload"->>'InvDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'InvDate', 10)::date
              WHEN "payload"->>'RecordDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'RecordDate', 8), 'YYYYMMDD')
              WHEN "payload"->>'RecordDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'RecordDate', 10)::date
              WHEN "payload"->>'DistDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'DistDate', 8), 'YYYYMMDD')
              WHEN "payload"->>'DistDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'DistDate', 10)::date
              WHEN "payload"->>'DueDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'DueDate', 8), 'YYYYMMDD')
              WHEN "payload"->>'DueDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'DueDate', 10)::date
              ELSE NULL
            END,
            "businessDate"::date
          ) AS invoice_date,
          "fetchedAt",
          "createdAt"
        FROM "InforRawRecord"
        WHERE "companyId" = ${companyId}
          AND "miProgram" = 'SLArtrans'
          AND (UPPER(NULLIF("payload"->>'Type', '')) IS NULL OR UPPER(NULLIF("payload"->>'Type', '')) NOT IN ('P', 'C'))
      ) raw_invoices
      WHERE order_id IS NOT NULL
        AND TRIM(order_id) <> ''
        AND invoice_date >= ${startDate}::date
        AND invoice_date <= ${endDate}::date
    ),
    raw_lines AS (
      SELECT
        "businessDate"::date AS day,
        COALESCE(
          NULLIF("payload"->>'CoNum', ''),
          NULLIF("payload"->>'CONUM', ''),
          NULLIF("payload"->>'coNum', '')
        ) AS order_id,
        COALESCE(NULLIF("payload"->>'CoLine', ''), NULLIF("payload"->>'COLINE', ''), NULLIF("payload"->>'coLine', ''), '0') AS line_id,
        COALESCE(NULLIF("payload"->>'CoRelease', ''), NULLIF("payload"->>'CORELEASE', ''), NULLIF("payload"->>'coRelease', ''), '0') AS release_id,
        COALESCE(
          NULLIF("payload"->>'CustNum', ''),
          NULLIF("payload"->>'CoCustNum', ''),
          NULLIF("payload"->>'CustNo', '')
        ) AS line_customer_id,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'QtyInvoiced', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'qtyInvoiced', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        ) AS qty_invoiced,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'Price', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'price', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'Upri', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'unitPrice', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'UnitPrice', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        ) AS unit_price,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'Cost', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'MatlCost', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'UnitCost', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'unitCost', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        ) AS unit_cost,
        COALESCE(
          CASE
            WHEN "payload"->>'InvDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'InvDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'InvDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'InvDate', 10)::date
            WHEN "payload"->>'InvoiceDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'InvoiceDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'InvoiceDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'InvoiceDate', 10)::date
            ELSE NULL
          END,
          CASE
            WHEN "payload"->>'ShipDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'ShipDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'ShipDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'ShipDate', 10)::date
            ELSE NULL
          END,
          CASE
            WHEN "payload"->>'DueDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'DueDate', 8), 'YYYYMMDD')
            WHEN "payload"->>'DueDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'DueDate', 10)::date
            ELSE NULL
          END
        ) AS line_invoice_date,
        "fetchedAt",
        "createdAt"
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND "miProgram" IN ('SLCoitems', 'SLCOITEMS')
        AND (
          ("businessDate" >= ${lineLookbackStart}::date AND "businessDate" <= ${endDate}::date)
          OR "payload" ? 'InvDate'
          OR "payload" ? 'InvoiceDate'
          OR "payload" ? 'ShipDate'
          OR "payload" ? 'DueDate'
        )
    ),
    daily_state AS (
      SELECT *
      FROM (
        SELECT
          raw_lines.*,
          ROW_NUMBER() OVER (
            PARTITION BY day, order_id, line_id, release_id
            ORDER BY "fetchedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST
          ) AS rn
        FROM raw_lines
        WHERE order_id IS NOT NULL AND TRIM(order_id) <> ''
      ) ranked
      WHERE rn = 1
    ),
    line_deltas AS (
      SELECT
        day,
        COALESCE(NULLIF(TRIM(line_customer_id), ''), headers.customer_id) AS customer_id,
        headers.customer_name,
        GREATEST(
          qty_invoiced - LAG(qty_invoiced, 1, 0) OVER (
            PARTITION BY order_id, line_id, release_id
            ORDER BY day ASC
          ),
          0
        ) AS qty_delta,
        unit_price,
        unit_cost
      FROM daily_state
      LEFT JOIN headers ON headers.order_id = daily_state.order_id
    ),
    delta_margin AS (
      SELECT
        to_char(date_trunc('month', day), 'YYYY-MM') AS month_key,
        LOWER(regexp_replace(TRIM(COALESCE(customer_name, customer_id, 'Unknown Customer')), '\\s+', ' ', 'g')) AS customer_key,
        LOWER(regexp_replace(TRIM(COALESCE(customer_id, '')), '\\s+', ' ', 'g')) AS customer_id_key,
        TRIM(COALESCE(customer_name, customer_id, 'Unknown Customer')) AS customer_name,
        SUM(qty_delta * unit_price)::double precision AS revenue,
        SUM(qty_delta * unit_cost)::double precision AS cogs
      FROM line_deltas
      WHERE day >= ${startDate}::date
        AND day <= ${endDate}::date
        AND qty_delta > 0
        AND unit_price > 0
        AND unit_cost > 0
      GROUP BY 1, 2, 3, 4
      HAVING SUM(qty_delta * unit_price) > 0 AND SUM(qty_delta * unit_cost) > 0
    ),
    invoice_state AS (
      SELECT *
      FROM (
        SELECT
          raw_lines.*,
          COALESCE(raw_lines.line_invoice_date, invoice_orders.invoice_date) AS invoice_date,
          COALESCE(NULLIF(TRIM(raw_lines.line_customer_id), ''), invoice_orders.customer_id, headers.customer_id) AS customer_id,
          COALESCE(invoice_orders.customer_name, headers.customer_name) AS customer_name,
          ROW_NUMBER() OVER (
            PARTITION BY raw_lines.order_id, raw_lines.line_id, raw_lines.release_id
            ORDER BY raw_lines."businessDate" DESC NULLS LAST, raw_lines."fetchedAt" DESC NULLS LAST, raw_lines."createdAt" DESC NULLS LAST
          ) AS rn
        FROM raw_lines
        LEFT JOIN headers ON headers.order_id = raw_lines.order_id
        LEFT JOIN invoice_orders ON invoice_orders.order_id = raw_lines.order_id
        WHERE raw_lines.order_id IS NOT NULL
          AND TRIM(raw_lines.order_id) <> ''
          AND raw_lines.qty_invoiced > 0
          AND raw_lines.unit_price > 0
          AND raw_lines.unit_cost > 0
      ) ranked
      WHERE rn = 1
        AND invoice_date >= ${startDate}::date
        AND invoice_date <= ${endDate}::date
    ),
    invoice_margin AS (
      SELECT
        to_char(date_trunc('month', invoice_date), 'YYYY-MM') AS month_key,
        LOWER(regexp_replace(TRIM(COALESCE(customer_name, customer_id, 'Unknown Customer')), '\\s+', ' ', 'g')) AS customer_key,
        LOWER(regexp_replace(TRIM(COALESCE(customer_id, '')), '\\s+', ' ', 'g')) AS customer_id_key,
        TRIM(COALESCE(customer_name, customer_id, 'Unknown Customer')) AS customer_name,
        SUM(qty_invoiced * unit_price)::double precision AS revenue,
        SUM(qty_invoiced * unit_cost)::double precision AS cogs
      FROM invoice_state
      GROUP BY 1, 2, 3, 4
      HAVING SUM(qty_invoiced * unit_price) > 0 AND SUM(qty_invoiced * unit_cost) > 0
    ),
    combined_margin AS (
      SELECT * FROM delta_margin
      UNION ALL
      SELECT invoice_margin.*
      FROM invoice_margin
      WHERE NOT EXISTS (
        SELECT 1
        FROM delta_margin
        WHERE delta_margin.month_key = invoice_margin.month_key
          AND (
            delta_margin.customer_key = invoice_margin.customer_key
            OR (
              delta_margin.customer_id_key <> ''
              AND delta_margin.customer_id_key = invoice_margin.customer_id_key
            )
          )
      )
    )
    SELECT
      month_key,
      customer_key,
      customer_id_key,
      customer_name,
      SUM(revenue)::double precision AS revenue,
      SUM(cogs)::double precision AS cogs
    FROM combined_margin
    GROUP BY 1, 2, 3, 4
    HAVING SUM(revenue) > 0 AND SUM(cogs) > 0
    ORDER BY 1 ASC, 3 ASC
  `);

  return rows.map((row) => {
    const revenue = Number(row.revenue || 0);
    const cogs = Number(row.cogs || 0);
    return {
      monthKey: String(row.month_key || ''),
      customerKey: String(row.customer_key || '').trim(),
      customerIdKey: String(row.customer_id_key || '').trim(),
      customerName: String(row.customer_name || 'Unknown Customer').trim() || 'Unknown Customer',
      revenue,
      grossProfit: revenue - cogs,
    };
  }).filter((row) => row.monthKey && row.customerKey && row.revenue > 0 && Number.isFinite(row.grossProfit));
}

async function deriveCustomerMarginFromRawOrderLinesByDueDate(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    monthKey: string;
    customerKey: string;
    customerIdKey: string;
    customerName: string;
    revenue: number;
    grossProfit: number;
  }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      month_key: string;
      customer_key: string;
      customer_id_key: string | null;
      customer_name: string | null;
      revenue: number;
      cogs: number;
    }>
  >(Prisma.sql`
    WITH headers AS (
      SELECT DISTINCT ON (order_id)
        order_id,
        NULLIF(TRIM(customer_id), '') AS customer_id,
        NULLIF(TRIM(
          CASE
            WHEN POSITION(' - ' IN COALESCE(customer_name, '')) > 0
              THEN SUBSTRING(customer_name FROM POSITION(' - ' IN customer_name) + 3)
            ELSE customer_name
          END
        ), '') AS customer_name
      FROM (
        SELECT
          COALESCE(
            NULLIF("payload"->>'CoNum', ''),
            NULLIF("payload"->>'CONUM', ''),
            NULLIF("payload"->>'coNum', '')
          ) AS order_id,
          COALESCE(
            NULLIF("payload"->>'CustNum', ''),
            NULLIF("payload"->>'CoCustNum', ''),
            NULLIF("payload"->>'CustNo', '')
          ) AS customer_id,
          COALESCE(
            NULLIF("payload"->>'DerCustNoName', ''),
            NULLIF("payload"->>'DerCustName', ''),
            NULLIF("payload"->>'CustName', ''),
            NULLIF("payload"->>'Name', '')
          ) AS customer_name,
          "businessDate",
          "fetchedAt",
          "createdAt"
        FROM "InforRawRecord"
        WHERE "companyId" = ${companyId}
          AND "miProgram" IN ('SLCos', 'SLCohdrs')
          AND "businessDate" <= ${endDate}::date
      ) raw_headers
      WHERE order_id IS NOT NULL AND TRIM(order_id) <> ''
      ORDER BY order_id, "businessDate" DESC NULLS LAST, "fetchedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST
    ),
    raw_lines AS (
      SELECT
        COALESCE(
          NULLIF("payload"->>'CoNum', ''),
          NULLIF("payload"->>'CONUM', ''),
          NULLIF("payload"->>'coNum', '')
        ) AS order_id,
        COALESCE(
          NULLIF("payload"->>'CustNum', ''),
          NULLIF("payload"->>'CoCustNum', ''),
          NULLIF("payload"->>'CustNo', '')
        ) AS line_customer_id,
        CASE
          WHEN "payload"->>'DueDate' ~ '^\\d{8}' THEN to_date(LEFT("payload"->>'DueDate', 8), 'YYYYMMDD')
          WHEN "payload"->>'DueDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT("payload"->>'DueDate', 10)::date
          ELSE NULL
        END AS due_date,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'QtyInvoiced', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'qtyInvoiced', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        ) AS qty_invoiced,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'Price', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'price', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'Upri', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'unitPrice', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'UnitPrice', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        ) AS unit_price,
        COALESCE(
          NULLIF(regexp_replace("payload"->>'Cost', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'MatlCost', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'UnitCost', '[^0-9.-]', '', 'g'), '')::double precision,
          NULLIF(regexp_replace("payload"->>'unitCost', '[^0-9.-]', '', 'g'), '')::double precision,
          0
        ) AS unit_cost
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND "miProgram" IN ('SLCoitems', 'SLCOITEMS')
    )
    SELECT
      to_char(date_trunc('month', raw_lines.due_date), 'YYYY-MM') AS month_key,
      LOWER(regexp_replace(TRIM(COALESCE(headers.customer_name, raw_lines.line_customer_id, 'Unknown Customer')), '\\s+', ' ', 'g')) AS customer_key,
      LOWER(regexp_replace(TRIM(COALESCE(raw_lines.line_customer_id, headers.customer_id, '')), '\\s+', ' ', 'g')) AS customer_id_key,
      TRIM(COALESCE(headers.customer_name, raw_lines.line_customer_id, 'Unknown Customer')) AS customer_name,
      SUM(raw_lines.qty_invoiced * raw_lines.unit_price)::double precision AS revenue,
      SUM(raw_lines.qty_invoiced * raw_lines.unit_cost)::double precision AS cogs
    FROM raw_lines
    LEFT JOIN headers ON headers.order_id = raw_lines.order_id
    WHERE raw_lines.due_date >= ${startDate}::date
      AND raw_lines.due_date <= ${endDate}::date
      AND raw_lines.qty_invoiced > 0
      AND raw_lines.unit_price > 0
      AND raw_lines.unit_cost > 0
    GROUP BY 1, 2, 3, 4
    HAVING SUM(raw_lines.qty_invoiced * raw_lines.unit_price) > 0
      AND SUM(raw_lines.qty_invoiced * raw_lines.unit_cost) > 0
    ORDER BY 1 ASC, 4 ASC
  `);

  return rows.map((row) => {
    const revenue = Number(row.revenue || 0);
    const cogs = Number(row.cogs || 0);
    return {
      monthKey: String(row.month_key || ''),
      customerKey: String(row.customer_key || '').trim(),
      customerIdKey: String(row.customer_id_key || '').trim(),
      customerName: String(row.customer_name || 'Unknown Customer').trim() || 'Unknown Customer',
      revenue,
      grossProfit: revenue - cogs,
    };
  }).filter((row) => row.monthKey && row.customerKey && row.revenue > 0 && Number.isFinite(row.grossProfit));
}

function normalizeAccountNameForKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^cash\s*-\s*/i, '');
}

function accountKeyFromParts(
  accountId: string | null | undefined,
  accountNumber: string | null | undefined,
  accountName: string | null | undefined
): string {
  const idToken = String(accountId || '').trim().toLowerCase();
  if (idToken) return `id:${idToken}`;
  const numberToken = String(accountNumber || '').trim().toLowerCase();
  if (numberToken) return `num:${numberToken}`;
  const nameToken = normalizeAccountNameForKey(String(accountName || ''));
  return nameToken ? `name:${nameToken}` : '';
}

function normalizeAccountToken(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^cash\s*-\s*/i, '');
}

const EXCLUDED_CASH_CONTROL_ACCOUNT_IDS = new Set(['100000', '200000']);

function extractCsiItems(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items as Array<Record<string, unknown>>;
  if (Array.isArray(b.items)) return b.items as Array<Record<string, unknown>>;
  if (Array.isArray(b.records)) return b.records as Array<Record<string, unknown>>;
  return [];
}

function parseDateTokenToIso(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  const m = compact.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isExcludedCashControlAccount(
  accountId: string | null | undefined,
  accountNumber: string | null | undefined,
  accountName: string | null | undefined
): boolean {
  const idToken = String(accountId || '').trim();
  const numberToken = String(accountNumber || '').trim();
  if (EXCLUDED_CASH_CONTROL_ACCOUNT_IDS.has(idToken) || EXCLUDED_CASH_CONTROL_ACCOUNT_IDS.has(numberToken)) {
    return true;
  }
  const name = String(accountName || '').trim().toLowerCase();
  return name.includes('out-of-balance error') || name.includes('payroll posting error');
}

function toNumeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function deriveArBucketsFromRow(
  row: {
    amountDueHome?: number | null;
    dueDate?: Date | null;
    invoiceDate?: Date | null;
    sourcePlatform?: string | null;
    sourceProgram?: string | null;
    current?: number | null;
    days1to30?: number | null;
    days31to60?: number | null;
    days61to90?: number | null;
    days90plus?: number | null;
  },
  asOfDate: Date
): {
  totalAR: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
} {
  const openAmount = Number(row.amountDueHome || 0);
  if (openAmount <= 0) {
    return {
      totalAR: 0,
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    };
  }

  // Standard 5-bucket AR aging anchored on dueDate (invoiceDate as fallback).
  // Days past due = asOf - dueDate. <0 = Current; 0-30 = 1-30; 31-60 = 31-60;
  // 61-90 = 61-90; >90 (or unknown anchor) = 90+.
  const dueDateRaw = row.dueDate ? new Date(row.dueDate) : null;
  const invoiceDateRaw = row.invoiceDate ? new Date(row.invoiceDate) : null;
  const agingAnchor =
    dueDateRaw && !Number.isNaN(dueDateRaw.getTime())
      ? dueDateRaw
      : invoiceDateRaw && !Number.isNaN(invoiceDateRaw.getTime())
        ? invoiceDateRaw
        : null;
  if (!agingAnchor) {
    return {
      totalAR: openAmount,
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: openAmount,
    };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const invoiceAgeDays = Math.floor((startOfUtcDay(asOfDate).getTime() - startOfUtcDay(agingAnchor).getTime()) / dayMs);
  if (invoiceAgeDays < 0) {
    return { totalAR: openAmount, current: openAmount, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  }
  if (invoiceAgeDays <= 30) {
    return { totalAR: openAmount, current: 0, days1to30: openAmount, days31to60: 0, days61to90: 0, days90plus: 0 };
  }
  if (invoiceAgeDays <= 60) {
    return { totalAR: openAmount, current: 0, days1to30: 0, days31to60: openAmount, days61to90: 0, days90plus: 0 };
  }
  if (invoiceAgeDays <= 90) {
    return { totalAR: openAmount, current: 0, days1to30: 0, days31to60: 0, days61to90: openAmount, days90plus: 0 };
  }
  return {
    totalAR: openAmount,
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: openAmount,
  };
}

function isClosedArStatus(status: string | null | undefined): boolean {
  const token = String(status || '').trim().toLowerCase();
  if (!token) return false;
  return (
    token.includes('closed') ||
    token.includes('paid') ||
    token.includes('void') ||
    token.includes('cancel') ||
    token.includes('settled') ||
    token.includes('history')
  );
}

function isInvoiceLikeArOpenRow(row: { status?: string | null; invoiceNo?: string | null }): boolean {
  const statusToken = String(row.status || '').trim().toUpperCase();
  const invoiceNo = String(row.invoiceNo || '').trim().toUpperCase();
  if (invoiceNo.startsWith('CR')) return false;
  if (statusToken === 'C' || statusToken === 'P') return false;
  if (
    statusToken.includes('CREDIT') ||
    statusToken.includes('PAYMENT') ||
    statusToken.includes('CASH') ||
    statusToken.includes('RECEIPT')
  ) {
    return false;
  }
  // CSI common open AR document type tokens:
  // I = invoice, D = debit memo.
  if (statusToken === 'I' || statusToken === 'D') return true;
  if (statusToken.includes('INVOICE') || statusToken.includes('DEBIT')) return true;
  // If status is missing/unknown but invoice number exists and is not a credit memo,
  // keep it so we don't drop legitimate invoice-like documents.
  return Boolean(invoiceNo);
}

/**
 * Compute a daily AP balance series using the customer's stated business rule:
 * "AP rarely if ever goes over N days; assume any voucher older than N days is paid
 *  or written off."
 *
 * For each day D in [rangeStart, rangeEnd]:
 *   AP(D) = Σ over each voucher V whose creation date is in (D - agingDays, D]
 *           of max(0, Σ events(V) with eventDate ≤ D)
 *
 * This eliminates two longstanding pain points of the prior anchor-roll-forward
 * approach:
 *   1. Orphan post-anchor payments (P events in 2024+ for vouchers we never
 *      had V events for) leaked AP negative — sometimes hundreds of thousands
 *      of dollars below zero.
 *   2. Reliance on a hard-coded TB anchor that goes stale over time.
 *
 * Validated against the customer's 12/31/2023 TB anchor: returns $723K vs TB
 * $698K (drift +3.6%, well within accounting tolerance). The same window across
 * 9 historical quarter-ends shows a stable, plausible $616K-$999K range.
 */
async function buildDailyApSeriesByAgingRule(
  prismaClient: any,
  companyId: string,
  apAcct: string,
  accountName: string,
  accountNumber: string | null,
  rangeStart: Date,
  rangeEnd: Date,
  agingDays: number = 150
): Promise<
  Array<{
    snapshotDate: Date;
    accountName: string;
    apBalance: number;
    accountId: string | null;
    accountNumber: string | null;
    // Per-day 5-bucket aging using the same termsCode cascade as
    // buildOpenVouchersByAgingRule (voucher → vendor → N30 default).
    // current = not-yet-due (daysPastDue < 0). 1-30 includes day 0.
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    // Past-due percentages computed from the buckets above.
    over30Pct: number;
    over90Pct: number;
    // Days Payable Outstanding using actual credit purchases (the
    // rolling 90-day sum of voucher creations on this apAcct) as the
    // denominator. Formula: dpo = apBalance * 90 / purchases_90d.
    // Falls back to 0 when purchases_90d is 0.
    dpo: number;
  }>
> {
  const startKey = dateKeyUtc(startOfUtcDay(rangeStart));
  const endKey = dateKeyUtc(startOfUtcDay(rangeEnd));
  const aging = Number.isFinite(agingDays) && agingDays > 0 ? Math.floor(agingDays) : 150;

  // Inlined termsCode-to-days cascade (voucher → vendor → N30 default).
  // Mirrors TERMS_CODE_DAYS / DEFAULT_TERMS_DAYS so the SQL stays in
  // sync with the JS helpers used by buildOpenVouchersByAgingRule.
  const termsCaseExpr = `CASE
    WHEN vm.voucher_terms_code = 'N5'  THEN 5
    WHEN vm.voucher_terms_code = 'N30' THEN 30
    WHEN vm.voucher_terms_code = 'N45' THEN 45
    WHEN vm.voucher_terms_code = 'N60' THEN 60
    WHEN vm.voucher_terms_code = 'N80' THEN 80
    WHEN vm.voucher_terms_code = 'N90' THEN 90
    WHEN vm.voucher_terms_code = 'DUR' THEN 0
    WHEN vt.vendor_terms_code  = 'N5'  THEN 5
    WHEN vt.vendor_terms_code  = 'N30' THEN 30
    WHEN vt.vendor_terms_code  = 'N45' THEN 45
    WHEN vt.vendor_terms_code  = 'N60' THEN 60
    WHEN vt.vendor_terms_code  = 'N80' THEN 80
    WHEN vt.vendor_terms_code  = 'N90' THEN 90
    WHEN vt.vendor_terms_code  = 'DUR' THEN 0
    ELSE ${DEFAULT_TERMS_DAYS}
  END`;

  const rows: Array<{
    snapshot_date: Date;
    open_ap: any;
    current_amt: any;
    d_1_30: any;
    d_31_60: any;
    d_61_90: any;
    d_90_plus: any;
    purchases_90d: any;
  }> = await prismaClient.$queryRawUnsafe(
    `WITH date_series AS (
       SELECT generate_series($3::date, $4::date, '1 day'::interval)::date AS d
     ),
     voucher_creates AS (
       SELECT voucher, MIN("eventDate")::date AS created_at
       FROM "APTransactionFact"
       WHERE "companyId" = $1 AND "apAcct" = $2 AND "transType" = 'V'
         AND "eventDate" >= ($3::date - INTERVAL '${aging} days')
         AND "eventDate" <= $4::date
       GROUP BY voucher
     ),
     voucher_meta AS (
       SELECT DISTINCT ON (t.voucher)
         t.voucher,
         t."vendorId" AS vendor_id,
         t."invoiceDate"::date AS invoice_date,
         NULLIF(TRIM(t."termsCode"), '') AS voucher_terms_code
       FROM "APTransactionFact" t
       JOIN voucher_creates vc ON vc.voucher = t.voucher
       WHERE t."companyId" = $1 AND t."apAcct" = $2 AND t."transType" = 'V'
       ORDER BY t.voucher, t."eventDate" ASC
     ),
     vendor_terms AS (
       SELECT DISTINCT ON ("vendorId")
         "vendorId",
         NULLIF(TRIM("termsCode"), '') AS vendor_terms_code
       FROM "VendorSnapshot"
       WHERE "companyId" = $1
         AND "vendorId" IS NOT NULL
         AND "termsCode" IS NOT NULL
         AND TRIM("termsCode") <> ''
       ORDER BY "vendorId", "snapshotDate" DESC
     ),
     voucher_due AS (
       SELECT
         vm.voucher,
         COALESCE(vm.invoice_date, vc.created_at) + (${termsCaseExpr} || ' days')::interval AS due_date
       FROM voucher_meta vm
       JOIN voucher_creates vc ON vc.voucher = vm.voucher
       LEFT JOIN vendor_terms vt ON vt."vendorId" = vm.vendor_id
     ),
     events AS (
       SELECT voucher, "eventDate"::date AS dt, "normalizedAmount"
       FROM "APTransactionFact"
       WHERE "companyId" = $1 AND "apAcct" = $2
         AND "eventDate" >= ($3::date - INTERVAL '${aging} days')
         AND "eventDate" <= $4::date
     ),
     daily_voucher AS (
       SELECT
         ds.d AS snapshot_date,
         vc.voucher,
         GREATEST(COALESCE(SUM(CASE WHEN e.dt <= ds.d THEN e."normalizedAmount" ELSE 0 END), 0), 0) AS open_per_voucher,
         (ds.d - vd.due_date::date)::int AS days_past_due
       FROM date_series ds
       JOIN voucher_creates vc
         ON vc.created_at > (ds.d - INTERVAL '${aging} days')
        AND vc.created_at <= ds.d
       JOIN voucher_due vd ON vd.voucher = vc.voucher
       LEFT JOIN events e ON e.voucher = vc.voucher
       GROUP BY ds.d, vc.voucher, vd.due_date
     ),
     daily_buckets AS (
       SELECT
         snapshot_date,
         SUM(open_per_voucher) AS open_ap,
         SUM(CASE WHEN days_past_due <  0                         THEN open_per_voucher ELSE 0 END) AS current_amt,
         SUM(CASE WHEN days_past_due >= 0  AND days_past_due <= 30 THEN open_per_voucher ELSE 0 END) AS d_1_30,
         SUM(CASE WHEN days_past_due >  30 AND days_past_due <= 60 THEN open_per_voucher ELSE 0 END) AS d_31_60,
         SUM(CASE WHEN days_past_due >  60 AND days_past_due <= 90 THEN open_per_voucher ELSE 0 END) AS d_61_90,
         SUM(CASE WHEN days_past_due >  90                         THEN open_per_voucher ELSE 0 END) AS d_90_plus
       FROM daily_voucher
       WHERE open_per_voucher > 0
       GROUP BY snapshot_date
     ),
     daily_purchases AS (
       SELECT
         ds.d AS snapshot_date,
         COALESCE(SUM(t."normalizedAmount"), 0) AS purchases_90d
       FROM date_series ds
       LEFT JOIN "APTransactionFact" t
         ON t."companyId" = $1
        AND t."apAcct"    = $2
        AND t."transType" = 'V'
        AND t."eventDate" >  (ds.d - INTERVAL '90 days')
        AND t."eventDate" <= ds.d
       GROUP BY ds.d
     )
     SELECT
       ds.d AS snapshot_date,
       COALESCE(db.open_ap,     0) AS open_ap,
       COALESCE(db.current_amt, 0) AS current_amt,
       COALESCE(db.d_1_30,      0) AS d_1_30,
       COALESCE(db.d_31_60,     0) AS d_31_60,
       COALESCE(db.d_61_90,     0) AS d_61_90,
       COALESCE(db.d_90_plus,   0) AS d_90_plus,
       COALESCE(dp.purchases_90d, 0) AS purchases_90d
     FROM date_series ds
     LEFT JOIN daily_buckets   db ON db.snapshot_date = ds.d
     LEFT JOIN daily_purchases dp ON dp.snapshot_date = ds.d
     ORDER BY ds.d`,
    companyId, apAcct, startKey, endKey
  );

  type DailyMetrics = {
    apBalance: number;
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    over30Pct: number;
    over90Pct: number;
    dpo: number;
  };

  const metricsByKey = new Map<string, DailyMetrics>();
  for (const r of rows) {
    const k = dateKeyUtc(new Date(r.snapshot_date));
    const apBalance = Number(r.open_ap || 0);
    const current = Number(r.current_amt || 0);
    const days1to30 = Number(r.d_1_30 || 0);
    const days31to60 = Number(r.d_31_60 || 0);
    const days61to90 = Number(r.d_61_90 || 0);
    const days90plus = Number(r.d_90_plus || 0);
    const purchases90d = Number(r.purchases_90d || 0);
    const over30 = days31to60 + days61to90 + days90plus;
    const over30Pct = apBalance > 0 ? (over30 / apBalance) * 100 : 0;
    const over90Pct = apBalance > 0 ? (days90plus / apBalance) * 100 : 0;
    const dpo = apBalance > 0 && purchases90d > 0 ? (apBalance * 90) / purchases90d : 0;
    metricsByKey.set(k, {
      apBalance,
      current,
      days1to30,
      days31to60,
      days61to90,
      days90plus,
      over30Pct,
      over90Pct,
      dpo,
    });
  }

  const out: Array<{
    snapshotDate: Date;
    accountName: string;
    apBalance: number;
    accountId: string | null;
    accountNumber: string | null;
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    over30Pct: number;
    over90Pct: number;
    dpo: number;
  }> = [];

  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = startOfUtcDay(rangeStart);
  const end = startOfUtcDay(rangeEnd);
  let last: DailyMetrics = {
    apBalance: 0,
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
    over30Pct: 0,
    over90Pct: 0,
    dpo: 0,
  };
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const k = dateKeyUtc(cursor);
    const m = metricsByKey.has(k) ? metricsByKey.get(k)! : last;
    last = m;
    out.push({
      snapshotDate: parseIsoDayKey(k),
      accountName,
      apBalance: m.apBalance,
      accountId: apAcct,
      accountNumber: accountNumber || apAcct,
      current: m.current,
      days1to30: m.days1to30,
      days31to60: m.days31to60,
      days61to90: m.days61to90,
      days90plus: m.days90plus,
      over30Pct: m.over30Pct,
      over90Pct: m.over90Pct,
      dpo: m.dpo,
    });
  }
  return out;
}

/**
 * Voucher-level companion to buildDailyApSeriesByAgingRule. For a single
 * as-of date, returns one row per still-open voucher with vendor info,
 * voucher creation date (eventDate of the Type='V' row), invoice date, and
 * remaining open balance. Uses the IDENTICAL aging rule as the daily-total
 * helper (vouchers created within `agingDays` of the as-of date, summing all
 * APTransactionFact events for that voucher through the as-of date, capped
 * at >= 0). Sums for any subset of these rows are guaranteed to roll up to
 * the daily total returned by buildDailyApSeriesByAgingRule for the same
 * as-of date — which is what the AP page trend chart and KPI cards use as
 * ground truth. Per-vendor / per-bill tables that need to tie to that chart
 * total should source from this helper, NOT from APOpenBillSnapshot.
 */
// Atlantic uses a small fixed set of payment-terms codes on Infor M3.
// Maps each code to net days (Days from invoice date until payment is due).
// DUR = "Due Upon Receipt" → 0 days. New codes can be added here without
// any other code changes.
const TERMS_CODE_DAYS: Record<string, number> = {
  N5: 5,
  N30: 30,
  N45: 45,
  N60: 60,
  N80: 80,
  N90: 90,
  DUR: 0,
};

// Final fallback when both voucher.termsCode and vendor.termsCode are
// blank or unrecognized. N30 is the most common B2B default and gives a
// 30-day grace window before vouchers start landing in past-due buckets.
const DEFAULT_TERMS_DAYS = 30;
const DEFAULT_TERMS_LABEL = 'default:N30';

function termsCodeToDays(code: string | null | undefined): number | null {
  if (!code) return null;
  const trimmed = String(code).trim().toUpperCase();
  if (!trimmed) return null;
  return Object.prototype.hasOwnProperty.call(TERMS_CODE_DAYS, trimmed)
    ? TERMS_CODE_DAYS[trimmed]
    : null;
}

/**
 * Derive a due date for an AP voucher using a 3-tier cascade:
 *   1. voucher.termsCode (best — explicit on the voucher)
 *   2. vendor.termsCode  (vendor master default — covers most blanks)
 *   3. DEFAULT_TERMS_DAYS (final safety net — N30)
 *
 * Returns the derived due date plus the source label for transparency
 * ('voucher:N30', 'vendor:N45', or 'default:N30'). When invoiceDate is
 * missing we have no anchor to add days to, so we fall back to the
 * voucher creation date — same imperfect behaviour as before that anchor
 * for that one bucket.
 */
function deriveVoucherDueDate(params: {
  invoiceDate: Date | null;
  voucherCreatedAt: Date;
  voucherTermsCode: string | null | undefined;
  vendorTermsCode: string | null | undefined;
}): { dueDate: Date; termsCodeUsed: string } {
  const anchor = params.invoiceDate ? startOfUtcDay(params.invoiceDate) : startOfUtcDay(params.voucherCreatedAt);

  const voucherDays = termsCodeToDays(params.voucherTermsCode);
  if (voucherDays !== null) {
    return {
      dueDate: new Date(anchor.getTime() + voucherDays * 86400000),
      termsCodeUsed: `voucher:${String(params.voucherTermsCode).trim().toUpperCase()}`,
    };
  }

  const vendorDays = termsCodeToDays(params.vendorTermsCode);
  if (vendorDays !== null) {
    return {
      dueDate: new Date(anchor.getTime() + vendorDays * 86400000),
      termsCodeUsed: `vendor:${String(params.vendorTermsCode).trim().toUpperCase()}`,
    };
  }

  return {
    dueDate: new Date(anchor.getTime() + DEFAULT_TERMS_DAYS * 86400000),
    termsCodeUsed: DEFAULT_TERMS_LABEL,
  };
}

async function buildOpenVouchersByAgingRule(
  prismaClient: any,
  companyId: string,
  apAcct: string,
  asOfDate: Date,
  agingDays: number = 150
): Promise<
  Array<{
    voucher: string;
    invoiceNum: string | null;
    vendorId: string | null;
    vendorName: string;
    voucherCreatedAt: Date;
    invoiceDate: Date | null;
    openBalance: number;
    voucherTermsCode: string | null;
    vendorTermsCode: string | null;
    dueDate: Date;
    termsCodeUsed: string;
  }>
> {
  const asOfKey = dateKeyUtc(startOfUtcDay(asOfDate));
  const aging = Number.isFinite(agingDays) && agingDays > 0 ? Math.floor(agingDays) : 150;

  const rows: Array<{
    voucher: string;
    invoice_num: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
    created_at: Date;
    invoice_date: Date | null;
    open_balance: any;
    voucher_terms_code: string | null;
    vendor_terms_code: string | null;
  }> = await prismaClient.$queryRawUnsafe(
    `WITH voucher_creates AS (
       SELECT
         voucher,
         MIN("eventDate")::date AS created_at
       FROM "APTransactionFact"
       WHERE "companyId" = $1
         AND "apAcct" = $2
         AND "transType" = 'V'
         AND "eventDate" >= ($3::date - INTERVAL '${aging} days')
         AND "eventDate" <= $3::date
       GROUP BY voucher
     ),
     events AS (
       SELECT voucher, "normalizedAmount"
       FROM "APTransactionFact"
       WHERE "companyId" = $1
         AND "apAcct" = $2
         AND "eventDate" <= $3::date
     ),
     voucher_meta AS (
       SELECT DISTINCT ON (t.voucher)
         t.voucher,
         NULLIF(TRIM(t."invoiceNum"), '') AS invoice_num,
         t."vendorId" AS vendor_id,
         t."vendorName" AS vendor_name,
         t."invoiceDate" AS invoice_date,
         NULLIF(TRIM(t."termsCode"), '') AS voucher_terms_code
       FROM "APTransactionFact" t
       JOIN voucher_creates vc ON vc.voucher = t.voucher
       WHERE t."companyId" = $1
         AND t."apAcct" = $2
         AND t."transType" = 'V'
       ORDER BY t.voucher, t."eventDate" ASC
     ),
     vendor_terms AS (
       SELECT DISTINCT ON ("vendorId")
         "vendorId",
         NULLIF(TRIM("termsCode"), '') AS vendor_terms_code
       FROM "VendorSnapshot"
       WHERE "companyId" = $1
         AND "vendorId" IS NOT NULL
         AND "termsCode" IS NOT NULL
         AND TRIM("termsCode") <> ''
       ORDER BY "vendorId", "snapshotDate" DESC
     ),
     open_per_voucher AS (
       SELECT
         vc.voucher,
         vc.created_at,
         GREATEST(COALESCE(SUM(e."normalizedAmount"), 0), 0) AS open_balance
       FROM voucher_creates vc
       LEFT JOIN events e ON e.voucher = vc.voucher
       GROUP BY vc.voucher, vc.created_at
     )
     SELECT
       opv.voucher,
       vm.invoice_num,
       vm.vendor_id,
       COALESCE(NULLIF(TRIM(vm.vendor_name), ''), 'Unknown Vendor') AS vendor_name,
       opv.created_at,
       vm.invoice_date,
       opv.open_balance,
       vm.voucher_terms_code,
       vt.vendor_terms_code
     FROM open_per_voucher opv
     LEFT JOIN voucher_meta vm ON vm.voucher = opv.voucher
     LEFT JOIN vendor_terms vt ON vt."vendorId" = vm.vendor_id
     WHERE opv.open_balance > 0`,
    companyId,
    apAcct,
    asOfKey
  );

  return rows.map((r) => {
    const voucherCreatedAt = new Date(r.created_at);
    const invoiceDate = r.invoice_date ? new Date(r.invoice_date) : null;
    const voucherTermsCode = r.voucher_terms_code ? String(r.voucher_terms_code) : null;
    const vendorTermsCode = r.vendor_terms_code ? String(r.vendor_terms_code) : null;
    const { dueDate, termsCodeUsed } = deriveVoucherDueDate({
      invoiceDate,
      voucherCreatedAt,
      voucherTermsCode,
      vendorTermsCode,
    });
    return {
      voucher: String(r.voucher),
      invoiceNum: r.invoice_num ? String(r.invoice_num) : null,
      vendorId: r.vendor_id ? String(r.vendor_id) : null,
      vendorName: String(r.vendor_name || 'Unknown Vendor'),
      voucherCreatedAt,
      invoiceDate,
      openBalance: Number(r.open_balance || 0),
      voucherTermsCode,
      vendorTermsCode,
      dueDate,
      termsCodeUsed,
    };
  });
}

/**
 * AR equivalent of buildDailyApSeriesByAgingRule. Computes daily open AR
 * directly from ARTransactionFact events, scoped to invoices created within
 * the last `agingDays` days. Per-invoice net is capped at >= 0 so over-payments
 * (sign-quirk credit memos / refund-style P rows) don't push other invoices
 * into negative territory.
 *
 * Sign convention in ARTransactionFact:
 *   I, D -> normalizedAmount > 0   (increases AR)
 *   P, C -> normalizedAmount < 0   (reduces AR)
 *
 * Validated against 4 customer-supplied TB anchors:
 *   12/31/2023: +0.3% drift at 180d
 *   1/31/2026:  -2.6% drift at 180d
 *   2/28/2026:  -8.8% drift at 180d
 *   3/31/2026:  +2.1% drift at 180d
 */
async function buildDailyArSeriesByAgingRule(
  prismaClient: any,
  companyId: string,
  arAcct: string,
  accountName: string,
  accountNumber: string | null,
  rangeStart: Date,
  rangeEnd: Date,
  agingDays: number = 180
): Promise<
  Array<{
    snapshotDate: Date;
    accountName: string;
    arBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }>
> {
  const startKey = dateKeyUtc(startOfUtcDay(rangeStart));
  const endKey = dateKeyUtc(startOfUtcDay(rangeEnd));
  const aging = Number.isFinite(agingDays) && agingDays > 0 ? Math.floor(agingDays) : 180;

  const rows: Array<{ snapshot_date: Date; open_ar: any }> = await prismaClient.$queryRawUnsafe(
    `WITH date_series AS (
       SELECT generate_series($3::date, $4::date, '1 day'::interval)::date AS d
     ),
     -- Composite key (coNum, customerId, invoiceNum) prevents cross-customer
     -- bleed when CSI reuses an InvNum across companies/customers.
     -- IS NOT DISTINCT FROM on coNum/customerId so NULL == NULL.
     invoice_creates AS (
       SELECT "coNum" AS co_num, "customerId" AS cust_num,
              "invoiceNum" AS inv_num,
              MIN("eventDate")::date AS created_at
       FROM "ARTransactionFact"
       WHERE "companyId" = $1 AND "arAcct" = $2 AND "transType" = 'I'
         AND "eventDate" >= ($3::date - INTERVAL '${aging} days')
         AND "eventDate" <= $4::date
       GROUP BY "coNum", "customerId", "invoiceNum"
     ),
     events AS (
       -- Invoices match themselves on invoiceNum; P/C/D match the invoice
       -- they apply to via COALESCE(applyToInvNum, invoiceNum). Both must
       -- also match coNum + customerId to avoid cross-customer over-matching.
       SELECT "coNum" AS co_num, "customerId" AS cust_num,
              COALESCE("applyToInvNum", "invoiceNum") AS inv_num,
              "eventDate"::date AS dt,
              "normalizedAmount"
       FROM "ARTransactionFact"
       WHERE "companyId" = $1 AND "arAcct" = $2
         AND "eventDate" >= ($3::date - INTERVAL '${aging} days')
         AND "eventDate" <= $4::date
     ),
     daily AS (
       SELECT ds.d AS snapshot_date, ic.co_num, ic.cust_num, ic.inv_num,
              SUM(e."normalizedAmount") AS open_per_invoice
       FROM date_series ds
       JOIN invoice_creates ic
         ON ic.created_at > (ds.d - INTERVAL '${aging} days')
        AND ic.created_at <= ds.d
       LEFT JOIN events e
         ON e.inv_num = ic.inv_num
        AND e.co_num   IS NOT DISTINCT FROM ic.co_num
        AND e.cust_num IS NOT DISTINCT FROM ic.cust_num
        AND e.dt <= ds.d
       GROUP BY ds.d, ic.co_num, ic.cust_num, ic.inv_num
     )
     SELECT snapshot_date,
            COALESCE(SUM(GREATEST(open_per_invoice, 0)), 0) AS open_ar
     FROM daily
     GROUP BY snapshot_date
     ORDER BY snapshot_date`,
    companyId, arAcct, startKey, endKey
  );

  const balanceByKey = new Map<string, number>();
  for (const r of rows) {
    const k = dateKeyUtc(new Date(r.snapshot_date));
    balanceByKey.set(k, Number(r.open_ar || 0));
  }

  const out: Array<{
    snapshotDate: Date;
    accountName: string;
    arBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }> = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = startOfUtcDay(rangeStart);
  const end = startOfUtcDay(rangeEnd);
  let lastBalance = 0;
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const k = dateKeyUtc(cursor);
    const bal = balanceByKey.has(k) ? balanceByKey.get(k)! : lastBalance;
    lastBalance = bal;
    out.push({
      snapshotDate: parseIsoDayKey(k),
      accountName,
      arBalance: bal,
      accountId: arAcct,
      accountNumber: accountNumber || arAcct,
    });
  }
  return out;
}

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay(); // 0=Sun, 1=Mon, ...
  const offset = day === 0 ? -6 : 1 - day; // Monday as week start
  return new Date(dayStart.getTime() + offset * 24 * 60 * 60 * 1000);
}

function aggregateApSeriesByFrequency(
  rows: Array<{
    snapshotDate: Date;
    accountName: string;
    apBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }>,
  frequency: 'daily' | 'weekly' | 'monthly'
): Array<{
  snapshotDate: Date;
  accountName: string;
  apBalance: number;
  accountId: string | null;
  accountNumber: string | null;
}> {
  if (frequency === 'daily') return rows;
  const bucketByKey = new Map<
    string,
    Map<
      string,
      {
        snapshotDate: Date;
        accountName: string;
        apBalance: number;
        accountId: string | null;
        accountNumber: string | null;
      }
    >
  >();

  for (const row of rows) {
    const rowDate = startOfUtcDay(new Date(row.snapshotDate));
    const bucketDate = frequency === 'weekly' ? startOfUtcWeek(rowDate) : startOfMonth(rowDate);
    const bucketKey = dateKeyUtc(bucketDate);
    if (!bucketByKey.has(bucketKey)) bucketByKey.set(bucketKey, new Map());
    const perAccount = bucketByKey.get(bucketKey)!;
    const accountKey =
      accountKeyFromParts(row.accountId, row.accountNumber, row.accountName) ||
      `name:${normalizeAccountNameForKey(row.accountName)}`;
    const existing = perAccount.get(accountKey);
    if (!existing || new Date(row.snapshotDate).getTime() >= new Date(existing.snapshotDate).getTime()) {
      perAccount.set(accountKey, row);
    }
  }

  const aggregated: Array<{
    snapshotDate: Date;
    accountName: string;
    apBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }> = [];
  const sortedBucketKeys = Array.from(bucketByKey.keys()).sort((a, b) => a.localeCompare(b));
  for (const bucketKey of sortedBucketKeys) {
    const perAccount = bucketByKey.get(bucketKey)!;
    const rowsInBucket = Array.from(perAccount.values()).sort((a, b) => a.accountName.localeCompare(b.accountName));
    aggregated.push(...rowsInBucket);
  }
  return aggregated;
}

/**
 * GET /api/operational-data
 * 
 * Query parameters:
 * - companyId: string (required)
 * - type: 'customers' | 'customers-sites' | 'ar-aging' | 'ap-aging' | 'products' | 'labor-scheduling' | 'inventory' | 'cash' | 'ap' | 'daily-financials' | 'cash-flow-map' | 'revenue-billables' | 'unit-economics'
 * - startDate: ISO date string (optional) - defaults to 90 days ago
 * - endDate: ISO date string (optional) - defaults to today
 * - frequency: 'daily' | 'weekly' | 'monthly' (optional) - defaults to 'monthly'
 * - limit: number (optional) - max records to return
 * - sectorCategory: NAICS sector code (optional) - falls back to company sector
 */
export async function GET(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    // SECURITY: Require authentication
    await requireAuth();
    
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');
    const type = searchParams.get('type');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const refreshConcentration = ['1', 'true', 'yes'].includes(
      String(searchParams.get('refreshConcentration') || '')
        .trim()
        .toLowerCase()
    );
    const refreshWholesaleProducts = ['1', 'true', 'yes'].includes(
      String(searchParams.get('refreshWholesaleProducts') || '')
        .trim()
        .toLowerCase()
    );
    const skuParam = String(searchParams.get('sku') || '').trim();
    const includeCostHistory = ['1', 'true', 'yes'].includes(
      String(searchParams.get('includeCostHistory') || '')
        .trim()
        .toLowerCase()
    );
    const statementCurrency = String(searchParams.get('currency') || 'USD')
      .trim()
      .toUpperCase();
    const rawStatementRollup = String(searchParams.get('statementRollup') || 'daily')
      .trim()
      .toLowerCase();
    const statementRollup: StatementRollup =
      rawStatementRollup === 'quarterly' || rawStatementRollup === 'annual'
        ? (rawStatementRollup as StatementRollup)
        : 'daily';
    const frequency = (searchParams.get('frequency') || 'monthly') as 'daily' | 'weekly' | 'monthly';
    const limit = parseInt(searchParams.get('limit') || '1000');
    const boundedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 100), 5000) : 1000;
    const dashboardRowCap = Math.min(Math.max(boundedLimit * 5, 5000), 25000);
    const factRowCap = Math.min(Math.max(boundedLimit * 10, 5000), 25000);
    const rawPayloadRowCap = Math.min(Math.max(boundedLimit * 10, 10000), 50000);
    const sectorCategoryParam = searchParams.get('sectorCategory');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // SECURITY: Validate access to company data
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('OperationalData', companyId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    // Default date range: last 90 days
    const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() - 1);
    const defaultStartDate = new Date(defaultEndDate);
    defaultStartDate.setDate(defaultStartDate.getDate() - 90);

    const startDate = parseDateParamBoundary(startDateParam, 'start', defaultStartDate);
    const endDate = parseDateParamBoundary(endDateParam, 'end', defaultEndDate);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        accountingSystem: true,
        industrySectorCategory: true,
        hasRealOperationalData: true,
        forceOperationalMockData: true,
      },
    });
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    const hasAnyRealData = await companyHasAnyRealOperationalData(companyId);
    let hasRealOperationalData = company.hasRealOperationalData;
    if (hasAnyRealData && !hasRealOperationalData) {
      await activateRealOperationalData(companyId);
      hasRealOperationalData = true;
    }
    // Site-admin demo toggle is authoritative per-company:
    // when enabled, always serve mock operational payloads for that company.
    const shouldUseMockData = company.forceOperationalMockData === true;

    const sectorCategory = sectorCategoryParam || company?.industrySectorCategory || '01';
    const normalizedAccountingSystem = String(company.accountingSystem || '').trim().toUpperCase();
    const isQuickBooksCompany =
      normalizedAccountingSystem === 'QUICKBOOKS' || normalizedAccountingSystem === 'QUICKBOOKS_DESKTOP';
    /** GL balance_movement:* + TB anchors — Infor CSI / M3 only (not QuickBooks, not arbitrary ERPs). */
    const isInforGlCompany =
      normalizedAccountingSystem === 'INFOR_M3' || normalizedAccountingSystem === 'INFOR_CSI';

    // Build date filter. For INFOR daily operational reads, gate on business dates
    // that have completed raw->snapshot hydration to avoid stale/partial snapshots.
    const shouldEnforceHydratedInforDailyFilter =
      (normalizedAccountingSystem === 'INFOR_M3' || normalizedAccountingSystem === 'INFOR_CSI') &&
      frequency === 'daily';
    const hydratedInforDates = shouldEnforceHydratedInforDailyFilter
      ? await getHydratedInforBusinessDates(companyId, startDate, endDate)
      : null;
    const shouldApplyHydratedDateFilter =
      Array.isArray(hydratedInforDates) && hydratedInforDates.length > 0;
    const dateFilter =
      shouldApplyHydratedDateFilter
        ? { in: hydratedInforDates! }
        : {
            gte: startDate,
            lte: endDate,
          };

    const cacheType = String(type || '').trim();
    const isWholesaleProductsReportRequest =
      cacheType === 'products' &&
      String(sectorCategory || '').trim() === '42' &&
      frequency === 'daily' &&
      String(startDateParam || '') === '2020-01-01' &&
      boundedLimit >= 5000;
    const operationalCacheTtlSeconds = isWholesaleProductsReportRequest
      ? WHOLESALE_PRODUCTS_REPORT_CACHE_TTL_SECONDS
      : OPERATIONAL_DATA_CACHE_TTL_SECONDS;
    const cacheableRequest =
      OPERATIONAL_CACHEABLE_TYPES.has(cacheType) &&
      !skuParam &&
      !includeCostHistory &&
      !refreshConcentration &&
      !(isWholesaleProductsReportRequest && refreshWholesaleProducts);
    const operationalCache =
      cacheableRequest
        ? {
            namespace: 'operational-data',
            cacheKey: hashCacheParts([
              companyId,
              cacheType,
              frequency,
              startDate.toISOString(),
              endDate.toISOString(),
              sectorCategory,
              statementCurrency,
              statementRollup,
              boundedLimit,
              shouldApplyHydratedDateFilter ? hydratedInforDates : null,
              cacheType === 'customers' ? CUSTOMER_CONCENTRATION_CACHE_VERSION : null,
            ]),
            dataVersion: isWholesaleProductsReportRequest
              ? 'wholesale-products-report-manual-v1'
              : await buildOperationalDataVersion(companyId, cacheType, startDate, endDate),
          }
        : null;

    if (operationalCache) {
      const cachedPayload = await readDerivedApiCache<any>(operationalCache);
      if (cachedPayload) {
        return NextResponse.json(cachedPayload, { headers: privateCacheHeaders(operationalCacheTtlSeconds, 300) });
      }
    }

    const cacheOperationalPayload = async (payload: unknown) => {
      if (operationalCache) {
        await writeDerivedApiCache({
          ...operationalCache,
          payload,
          ttlSeconds: operationalCacheTtlSeconds,
        }).catch((error) => {
          console.warn('Operational data cache write failed:', error);
        });
      }
      return NextResponse.json(payload, { headers: privateCacheHeaders(operationalCacheTtlSeconds, 300) });
    };
    const mockDataDisabledResponse = (dataType: string) => NextResponse.json(
      {
        error: `${dataType} requires live operational data for this company. Mock data is disabled.`,
        code: 'MOCK_DATA_DISABLED',
      },
      { status: 409 }
    );

    const hasPlatosFacts =
      (type === 'products' || type === 'inventory') &&
      ((await ensurePlatosClosetMonthlyFacts(companyId)) || (await hasPlatosClosetMonthlyFacts(companyId)));

    const hasRetailSubcategoryHistory =
      (type === 'products' || type === 'inventory') && (await hasRetailSubcategoryHistoryFacts(companyId));

    if (type === 'products' && hasRetailSubcategoryHistory) {
      const retailPayload = await getRetailSubcategoryHistoryProductsPayload({
        companyId,
        startDate,
        endDate,
      });
      if (retailPayload) {
        return NextResponse.json(retailPayload);
      }
    }

    if (type === 'products' && hasPlatosFacts) {
      const platosPayload = await getPlatosClosetProductsPayload({
        companyId,
        startDate,
        endDate,
        limit: boundedLimit,
      });
      if (platosPayload) {
        return NextResponse.json(platosPayload);
      }
    }

    if (type === 'inventory' && hasPlatosFacts) {
      const platosPayload = await getPlatosClosetInventoryPayload({
        companyId,
        startDate,
        endDate,
      });
      if (platosPayload) {
        const retailTurns = hasRetailSubcategoryHistory
          ? await getRetailSubcategoryTurnsSummary({ companyId, endDate })
          : null;
        return NextResponse.json(
          retailTurns
            ? {
                ...platosPayload,
                summary: {
                  ...(platosPayload.summary || {}),
                  retailTurns,
                },
              }
            : platosPayload,
        );
      }
    }

    if (type === 'inventory' && hasRetailSubcategoryHistory) {
      const retailTurns = await getRetailSubcategoryTurnsSummary({ companyId, endDate });
      if (retailTurns) {
        return NextResponse.json({
          records: [],
          trend: [],
          departmentTrend: [],
          unitCostHistory: [],
          agingReport: [],
          summary: {
            totalValue: 0,
            itemCount: 0,
            topItems: [],
            totalObsolescenceExposure: 0,
            retailTurns,
            source: 'retail-subcategory-history',
          },
        });
      }
    }

    let data;

    switch (type) {
      case 'customers': {
        const normalizedAccountingSystemKey = normalizedAccountingSystem.replace(/[\s-]+/g, '_');
        const isInforCompany =
          normalizedAccountingSystemKey === 'INFOR_M3' ||
          normalizedAccountingSystemKey === 'INFOR_CSI' ||
          normalizedAccountingSystemKey === 'CSI';
        const customerFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          isInforCompany && frequency !== 'daily' ? 'daily' : frequency;
        const orderLineFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          isInforCompany && frequency !== 'daily' ? 'daily' : frequency;

        // --- Track 1: Sales snapshots + bookings aggregation ---
        const fetchSalesAndBookings = async () => {
          let salesData: any[] = await prisma.customerSalesSnapshot.findMany({
            where: {
              companyId,
              frequency: customerFrequencyForQuery,
              snapshotDate: { gte: startDate, lte: endDate },
            },
            orderBy: { snapshotDate: 'asc' },
            take: 50000,
          });
          if (isInforCompany && customerFrequencyForQuery !== 'monthly') {
            const existingMonths = new Set(
              salesData
                .map((row) => {
                  const snapshot = new Date(row?.snapshotDate);
                  return Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
                })
                .filter(Boolean)
            );
            const monthlySalesData = await prisma.customerSalesSnapshot.findMany({
              where: {
                companyId,
                frequency: 'monthly',
                snapshotDate: { gte: startDate, lte: endDate },
              },
              orderBy: { snapshotDate: 'asc' },
              take: 50000,
            });
            salesData = [
              ...monthlySalesData.filter((row) => {
                const snapshot = new Date(row?.snapshotDate);
                const monthKey = Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
                return monthKey && !existingMonths.has(monthKey);
              }),
              ...salesData,
            ].sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());
          }
          let basis: 'orderline_delta' | 'customer_sales_snapshot' = salesData.length > 0 ? 'customer_sales_snapshot' : 'orderline_delta';
          if (isInforCompany) {
            const orderLineSalesData = await deriveCustomerSalesFromOrderLineDeltas(companyId, orderLineFrequencyForQuery, startDate, endDate);
            if (orderLineSalesData.length > 0) {
              const orderLineMonths = new Set(
                orderLineSalesData
                  .map((row) => {
                    const snapshot = new Date(row?.snapshotDate);
                    return Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
                  })
                  .filter(Boolean)
              );
              salesData = [
                ...salesData.filter((row) => {
                  const snapshot = new Date(row?.snapshotDate);
                  const monthKey = Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
                  return !orderLineMonths.has(monthKey);
                }),
                ...orderLineSalesData,
              ].sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());
              basis = 'orderline_delta';
            }
          }
          const concentrationCache = {
            namespace: 'customer-concentration-exposure',
            cacheKey: hashCacheParts([
              companyId,
              frequency,
              startDate.toISOString(),
              endDate.toISOString(),
              sectorCategory,
              'last-12-completed-months',
            ]),
            dataVersion: CUSTOMER_CONCENTRATION_CACHE_VERSION,
          };
          const cachedCustomerConcentration = refreshConcentration
            ? null
            : await readDerivedApiCache<{
                executiveMonthly: any[];
                customerMonthly: any[];
                monthKeys: string[];
                sourceCoverage: Record<string, string>;
                cacheVersion?: string;
              }>(concentrationCache).catch(() => null);
          let customerConcentrationExecutiveMonthly: any[] = Array.isArray(cachedCustomerConcentration?.executiveMonthly)
            ? cachedCustomerConcentration.executiveMonthly
            : [];
          let customerConcentrationMonthlyCustomers: any[] = Array.isArray(cachedCustomerConcentration?.customerMonthly)
            ? cachedCustomerConcentration.customerMonthly
            : [];
          let concentrationMonthKeys: string[] = Array.isArray(cachedCustomerConcentration?.monthKeys)
            ? cachedCustomerConcentration.monthKeys
            : [];
          let customerConcentrationSourceCoverage: Record<string, string> = cachedCustomerConcentration?.sourceCoverage || {};

          const buildCompletedMonthKeys = () => {
            const today = new Date();
            const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
            const effectiveEnd = endDate.getTime() > todayUtc.getTime() ? todayUtc : endDate;
            const year = effectiveEnd.getUTCFullYear();
            const month = effectiveEnd.getUTCMonth();
            const day = effectiveEnd.getUTCDate();
            const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            const endMonth = day >= lastDayOfMonth
              ? new Date(Date.UTC(year, month, 1))
              : new Date(Date.UTC(year, month - 1, 1));
            return Array.from({ length: 12 }, (_, index) => {
              const d = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - index, 1));
              return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            });
          };

          if (!concentrationMonthKeys.length) {
            concentrationMonthKeys = buildCompletedMonthKeys();
          }

          const formatConcentrationMonth = (monthKey: string) => {
            const [year, month] = monthKey.split('-').map(Number);
            return new Date(Date.UTC(year || 2000, (month || 1) - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
          };

          if (!cachedCustomerConcentration && !refreshConcentration) {
            customerConcentrationExecutiveMonthly = concentrationMonthKeys.map((monthKey) => ({
              monthKey,
              month: formatConcentrationMonth(monthKey),
              source: 'not_cached',
              totalRevenue: 0,
              top5Rev: null,
              top10Rev: null,
              largestRev: null,
              top5Gp: null,
              top5Ebitda: null,
              largestEbitda: null,
              top10AvgMargin: null,
              remainingAvgMargin: null,
              retentionRate: null,
              newCustomerRevenue: null,
            }));
            customerConcentrationMonthlyCustomers = [];
            customerConcentrationSourceCoverage = Object.fromEntries(concentrationMonthKeys.map((monthKey) => [monthKey, 'not_cached']));
          }

          if (!cachedCustomerConcentration && refreshConcentration) {
          const concentrationStart = monthStartFromBusinessMonthKey(concentrationMonthKeys[concentrationMonthKeys.length - 1]);
          const concentrationEndKey = concentrationMonthKeys[0];
          const concentrationEnd = new Date(Date.UTC(
            Number(concentrationEndKey.slice(0, 4)),
            Number(concentrationEndKey.slice(5, 7)),
            0,
            23,
            59,
            59,
            999
          ));
          const customerSnapshotRowsForConcentration = await prisma.customerSalesSnapshot.findMany({
            where: {
              companyId,
              snapshotDate: { gte: concentrationStart, lte: concentrationEnd },
            },
            orderBy: { snapshotDate: 'asc' },
            take: 100000,
          });
          const orderLineSalesRowsForConcentration = isInforCompany
            ? await deriveCustomerSalesFromOrderLineDeltas(companyId, orderLineFrequencyForQuery, concentrationStart, concentrationEnd)
            : [];
          const rawOrderLineMarginRowsForConcentration = isInforCompany
            ? await deriveCustomerMarginFromRawOrderLinesByDueDate(companyId, concentrationStart, concentrationEnd)
            : [];
          const marginByMonthCustomer = new Map<string, { grossProfit: number; revenue: number }>();
          for (const row of customerSnapshotRowsForConcentration as any[]) {
            const snapshot = new Date(row?.snapshotDate);
            if (Number.isNaN(snapshot.getTime())) continue;
            const monthKey = businessMonthKey(snapshot);
            const customerName = String(row?.customerName || 'Unknown Customer').trim() || 'Unknown Customer';
            const customerKey = customerName.toLowerCase().replace(/\s+/g, ' ');
            const revenue = Number(row?.revenue || 0);
            const cogs = Number(row?.cogs || 0);
            const rawGrossMargin = Number(row?.grossMargin ?? NaN);
            const hasGrossProfit = cogs > 0 || (Number.isFinite(rawGrossMargin) && Math.abs(rawGrossMargin - revenue) > 0.01);
            if (!hasGrossProfit || !Number.isFinite(revenue) || revenue <= 0) continue;
            const grossProfit = Number.isFinite(rawGrossMargin) && Math.abs(rawGrossMargin - revenue) > 0.01
              ? rawGrossMargin
              : revenue - cogs;
            if (!Number.isFinite(grossProfit)) continue;
            const key = `${monthKey}||${customerKey}`;
            const current = marginByMonthCustomer.get(key) || { grossProfit: 0, revenue: 0 };
            current.grossProfit += grossProfit;
            current.revenue += revenue;
            marginByMonthCustomer.set(key, current);
          }
          for (const row of rawOrderLineMarginRowsForConcentration) {
            const key = `${row.monthKey}||${row.customerKey}`;
            if (!marginByMonthCustomer.has(key)) {
              marginByMonthCustomer.set(key, { grossProfit: row.grossProfit, revenue: row.revenue });
            }
            if (row.customerIdKey) {
              const idKey = `${row.monthKey}||${row.customerIdKey}`;
              if (!marginByMonthCustomer.has(idKey)) {
                marginByMonthCustomer.set(idKey, { grossProfit: row.grossProfit, revenue: row.revenue });
              }
            }
          }
          const newCustomerLookbackStart = new Date(Date.UTC(concentrationStart.getUTCFullYear() - 3, concentrationStart.getUTCMonth(), 1));
          const rawInvoiceRowsForConcentration = isInforCompany
            ? await deriveCustomerSalesFromRawInvoices(companyId, concentrationStart, concentrationEnd)
            : [];
          const rawInvoiceRowsForNewCustomerHistory = isInforCompany
            ? await deriveCustomerSalesFromRawInvoices(companyId, newCustomerLookbackStart, concentrationEnd)
            : [];
          const rawInvoiceMonthsForConcentration = new Set(
            rawInvoiceRowsForConcentration
              .map((row: any) => {
                const snapshot = new Date(row?.snapshotDate);
                return Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              })
              .filter(Boolean)
          );
          const orderLineMonthsForConcentration = new Set(
            orderLineSalesRowsForConcentration
              .map((row: any) => {
                const snapshot = new Date(row?.snapshotDate);
                return Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              })
              .filter(Boolean)
          );
          const concentrationSourceRows = [
            ...rawInvoiceRowsForConcentration,
            ...orderLineSalesRowsForConcentration.filter((row: any) => {
              const snapshot = new Date(row?.snapshotDate);
              const monthKey = Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              return monthKey && !rawInvoiceMonthsForConcentration.has(monthKey);
            }),
            ...(customerSnapshotRowsForConcentration as any[]).filter((row: any) => {
              const snapshot = new Date(row?.snapshotDate);
              const monthKey = Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              return monthKey && !rawInvoiceMonthsForConcentration.has(monthKey) && !orderLineMonthsForConcentration.has(monthKey);
            }),
          ];
          const customerSnapshotRowsForNewCustomerHistory = await prisma.customerSalesSnapshot.findMany({
            where: {
              companyId,
              snapshotDate: { gte: newCustomerLookbackStart, lte: concentrationEnd },
            },
            orderBy: { snapshotDate: 'asc' },
            take: 100000,
          });
          const orderLineSalesRowsForNewCustomerHistory = isInforCompany
            ? await deriveCustomerSalesFromOrderLineDeltas(companyId, orderLineFrequencyForQuery, newCustomerLookbackStart, concentrationEnd)
            : [];
          const rawInvoiceMonthsForNewCustomerHistory = new Set(
            rawInvoiceRowsForNewCustomerHistory
              .map((row: any) => {
                const snapshot = new Date(row?.snapshotDate);
                return Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              })
              .filter(Boolean)
          );
          const concentrationByMonth = new Map<string, Map<string, any>>();
          const firstMonthByCustomerForConcentration = new Map<string, string>();
          const firstMonthByCustomerFromActualSales = new Map<string, string>();
          const firstMonthSourceRows = [
            ...rawInvoiceRowsForNewCustomerHistory,
            ...orderLineSalesRowsForNewCustomerHistory.filter((row: any) => {
              const snapshot = new Date(row?.snapshotDate);
              const monthKey = Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              return monthKey && !rawInvoiceMonthsForNewCustomerHistory.has(monthKey);
            }),
            ...(customerSnapshotRowsForNewCustomerHistory as any[]).filter((row: any) => {
              const snapshot = new Date(row?.snapshotDate);
              const monthKey = Number.isNaN(snapshot.getTime()) ? '' : businessMonthKey(snapshot);
              return monthKey && !rawInvoiceMonthsForNewCustomerHistory.has(monthKey);
            }),
          ];
          for (const row of firstMonthSourceRows as any[]) {
            const snapshot = new Date(row?.snapshotDate);
            if (Number.isNaN(snapshot.getTime())) continue;
            const monthKey = businessMonthKey(snapshot);
            const customerName = String(row?.customerName || 'Unknown Customer').trim() || 'Unknown Customer';
            const customerKey = customerName.toLowerCase().replace(/\s+/g, ' ');
            const revenue = Number(row?.revenue || 0);
            if (!Number.isFinite(revenue) || revenue <= 0) continue;
            const priorFirst = firstMonthByCustomerFromActualSales.get(customerKey);
            if (!priorFirst || monthKey < priorFirst) firstMonthByCustomerFromActualSales.set(customerKey, monthKey);
          }
          for (const row of concentrationSourceRows as any[]) {
            const snapshot = new Date(row?.snapshotDate);
            if (Number.isNaN(snapshot.getTime())) continue;
            const monthKey = businessMonthKey(snapshot);
            if (!concentrationMonthKeys.includes(monthKey)) continue;
            const customerName = String(row?.customerName || 'Unknown Customer').trim() || 'Unknown Customer';
            const customerKey = customerName.toLowerCase().replace(/\s+/g, ' ');
            const customerIdKey = String(row?.customerId || '').trim().toLowerCase().replace(/\s+/g, ' ');
            const revenue = Number(row?.revenue || 0);
            if (!Number.isFinite(revenue) || revenue <= 0) continue;
            const marginKey = `${monthKey}||${customerKey}`;
            const marginRow = marginByMonthCustomer.get(marginKey) || (customerIdKey ? marginByMonthCustomer.get(`${monthKey}||${customerIdKey}`) : undefined);
            const marginRatio = marginRow && marginRow.revenue > 0 ? marginRow.grossProfit / marginRow.revenue : null;
            const hasGrossProfit = marginRatio != null && Number.isFinite(marginRatio) && marginRatio >= -1 && marginRatio <= 1;
            const grossProfit = hasGrossProfit ? revenue * marginRatio : 0;
            const grossProfitRevenue = hasGrossProfit ? revenue : 0;
            if (!concentrationByMonth.has(monthKey)) concentrationByMonth.set(monthKey, new Map());
            const monthMap = concentrationByMonth.get(monthKey)!;
            const current = monthMap.get(customerKey) || {
              customerName,
              revenue: 0,
              grossProfit: 0,
              grossProfitRevenue: 0,
              ebitda: 0,
            };
            current.revenue += revenue;
            if (hasGrossProfit && Number.isFinite(grossProfit)) {
              current.grossProfit += grossProfit;
              current.grossProfitRevenue += grossProfitRevenue;
              current.ebitda += grossProfit;
            }
            monthMap.set(customerKey, current);
            const priorFirst = firstMonthByCustomerForConcentration.get(customerKey);
            if (!priorFirst || monthKey < priorFirst) firstMonthByCustomerForConcentration.set(customerKey, monthKey);
          }
          const sourceCoverageByMonth = new Map<string, string>();
          concentrationMonthKeys.forEach((monthKey) => {
            if (Array.from(concentrationByMonth.get(monthKey)?.values() || []).length > 0) {
              sourceCoverageByMonth.set(
                monthKey,
                rawInvoiceMonthsForConcentration.has(monthKey)
                  ? 'raw_slartrans_invoice'
                  : orderLineMonthsForConcentration.has(monthKey)
                  ? 'customer_order_line_delta'
                  : 'customer_sales_snapshot'
              );
            }
            else sourceCoverageByMonth.set(monthKey, 'none');
          });
          customerConcentrationExecutiveMonthly = concentrationMonthKeys.map((monthKey) => {
            const values = Array.from((concentrationByMonth.get(monthKey) || new Map()).values())
              .sort((a: any, b: any) => Number(b.revenue || 0) - Number(a.revenue || 0));
            const totalRevenue = values.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
            const totalGrossProfit = values.reduce((sum: number, row: any) => sum + Number(row.grossProfit || 0), 0);
            const totalEbitda = values.reduce((sum: number, row: any) => sum + Number(row.ebitda || 0), 0);
            const marginForRows = (rows: any[]) => {
              const marginRevenue = rows.reduce((sum: number, row: any) => sum + Number(row.grossProfitRevenue || 0), 0);
              const marginGrossProfit = rows.reduce((sum: number, row: any) => sum + Number(row.grossProfit || 0), 0);
              return marginRevenue > 0 ? (marginGrossProfit / marginRevenue) * 100 : null;
            };
            const currentCustomerKeys = values.map((row: any) => String(row.customerName || 'Unknown Customer').trim().toLowerCase().replace(/\s+/g, ' '));
            const retainedCustomers = currentCustomerKeys.filter((key) => {
              const firstMonth = firstMonthByCustomerForConcentration.get(key);
              return firstMonth && firstMonth < monthKey;
            });
            const newCustomerRevenue = values
              .filter((row: any) => {
                const name = String(row.customerName || 'Unknown Customer').trim();
                return firstMonthByCustomerFromActualSales.get(name.toLowerCase().replace(/\s+/g, ' ')) === monthKey;
              })
              .reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
            const top5 = values.slice(0, 5);
            const top10 = values.slice(0, 10);
            return {
              monthKey,
              month: formatConcentrationMonth(monthKey),
              source: sourceCoverageByMonth.get(monthKey) || 'none',
              totalRevenue,
              top5Rev: totalRevenue > 0 ? (top5.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0) / totalRevenue) * 100 : null,
              top10Rev: totalRevenue > 0 ? (top10.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0) / totalRevenue) * 100 : null,
              largestRev: totalRevenue > 0 ? (Number(values[0]?.revenue || 0) / totalRevenue) * 100 : null,
              top5Gp: totalGrossProfit !== 0 ? (top5.reduce((sum: number, row: any) => sum + Number(row.grossProfit || 0), 0) / totalGrossProfit) * 100 : null,
              top5Ebitda: totalEbitda !== 0 ? (top5.reduce((sum: number, row: any) => sum + Number(row.ebitda || 0), 0) / totalEbitda) * 100 : null,
              largestEbitda: totalEbitda !== 0 ? (Number(values[0]?.ebitda || 0) / totalEbitda) * 100 : null,
              top10AvgMargin: marginForRows(top10),
              remainingAvgMargin: marginForRows(values.slice(10)),
              retentionRate: currentCustomerKeys.length ? (retainedCustomers.length / currentCustomerKeys.length) * 100 : null,
              newCustomerRevenue: totalRevenue > 0 ? newCustomerRevenue : null,
            };
          });
          customerConcentrationMonthlyCustomers = concentrationMonthKeys.flatMap((monthKey) =>
            Array.from((concentrationByMonth.get(monthKey) || new Map()).values()).map((row: any) => ({
              monthKey,
              month: formatConcentrationMonth(monthKey),
              source: sourceCoverageByMonth.get(monthKey) || 'none',
              customerName: row.customerName,
              revenue: Number(row.revenue || 0),
              grossProfit: Number(row.grossProfit || 0),
              grossProfitRevenue: Number(row.grossProfitRevenue || 0),
              ebitda: Number(row.ebitda || 0),
            }))
          );
          customerConcentrationSourceCoverage = Object.fromEntries(sourceCoverageByMonth.entries());
          const concentrationHasRevenue = customerConcentrationExecutiveMonthly.some((row) => Number(row?.totalRevenue || row?.revenue || 0) > 0);
          if (concentrationHasRevenue) {
            await writeDerivedApiCache({
              ...concentrationCache,
              payload: {
                executiveMonthly: customerConcentrationExecutiveMonthly,
                customerMonthly: customerConcentrationMonthlyCustomers,
                monthKeys: concentrationMonthKeys,
                sourceCoverage: customerConcentrationSourceCoverage,
                cacheVersion: CUSTOMER_CONCENTRATION_CACHE_VERSION,
              },
              ttlSeconds: CUSTOMER_CONCENTRATION_CACHE_TTL_SECONDS,
            }).catch((error) => {
              console.warn('Customer concentration cache write failed:', error);
            });
          }
          }

          const mtdStart = startOfBusinessMonth(endDate);
          const qtdStart = startOfBusinessQuarter(endDate);
          const ytdStart = startOfBusinessYear(endDate);
          const bookingsByCustomer = new Map<
            string,
            { customerId: string | null; customerName: string; mtd: number; qtd: number; ytd: number }
          >();
          const bookingsByMonth = new Map<string, number>();
          for (const row of salesData as any[]) {
            const snapshot = new Date(row.snapshotDate);
            if (Number.isNaN(snapshot.getTime())) continue;
            const rev = Math.max(0, Number(row.revenue || 0));
            if (rev <= 0) continue;
            const customerId = row.customerId ? String(row.customerId) : null;
            const customerName = String(row.customerName || 'Unknown Customer');
            const key = `${customerId || ''}|${customerName.toLowerCase()}`;
            if (!bookingsByCustomer.has(key)) {
              bookingsByCustomer.set(key, { customerId, customerName, mtd: 0, qtd: 0, ytd: 0 });
            }
            const acc = bookingsByCustomer.get(key)!;
            if (snapshot >= mtdStart && snapshot <= endDate) acc.mtd += rev;
            if (snapshot >= qtdStart && snapshot <= endDate) acc.qtd += rev;
            if (snapshot >= ytdStart && snapshot <= endDate) acc.ytd += rev;
            const monthKey = businessMonthKey(snapshot);
            bookingsByMonth.set(monthKey, Number(bookingsByMonth.get(monthKey) || 0) + rev);
          }

          const bookingsCustomers = Array.from(bookingsByCustomer.values())
            .filter((row) => Number(row.mtd || 0) > 0 || Number(row.qtd || 0) > 0 || Number(row.ytd || 0) > 0)
            .sort((a, b) => b.ytd - a.ytd);
          const bookingsTop5 = bookingsCustomers.slice(0, 5).reduce(
            (acc, row) => {
              acc.mtd += row.mtd;
              acc.qtd += row.qtd;
              acc.ytd += row.ytd;
              return acc;
            },
            { mtd: 0, qtd: 0, ytd: 0 }
          );
          const bookingsTotals = bookingsCustomers.reduce(
            (acc, row) => {
              acc.mtd += row.mtd;
              acc.qtd += row.qtd;
              acc.ytd += row.ytd;
              return acc;
            },
            { mtd: 0, qtd: 0, ytd: 0 }
          );

          const revenueByMonth = new Map<string, number>();
          for (const row of salesData as any[]) {
            const snapshot = new Date(row.snapshotDate);
            if (Number.isNaN(snapshot.getTime())) continue;
            const monthKey = businessMonthKey(snapshot);
            revenueByMonth.set(monthKey, Number(revenueByMonth.get(monthKey) || 0) + Number(row.revenue || 0));
          }
          const monthKeys = Array.from(new Set([...Array.from(bookingsByMonth.keys()), ...Array.from(revenueByMonth.keys())])).sort();
          const bookingsMonthly = monthKeys.map((period, idx) => {
            const bookings = Number(bookingsByMonth.get(period) || 0);
            const prevBookings = idx > 0 ? Number(bookingsByMonth.get(monthKeys[idx - 1]) || 0) : 0;
            const growthPct = prevBookings > 0 ? ((bookings - prevBookings) / prevBookings) * 100 : null;
            return {
              period,
              periodStart: monthStartFromBusinessMonthKey(period).toISOString(),
              bookings,
              growthPct,
            };
          });
          const bookingsVsRevenueBridge = monthKeys.map((period) => ({
            period,
            periodStart: monthStartFromBusinessMonthKey(period).toISOString(),
            bookings: Number(bookingsByMonth.get(period) || 0),
            revenue: Number(revenueByMonth.get(period) || 0),
            delta: Number(bookingsByMonth.get(period) || 0) - Number(revenueByMonth.get(period) || 0),
          }));
          let rollingBacklog = 0;
          const backlogSeries = bookingsVsRevenueBridge.map((row) => {
            rollingBacklog = rollingBacklog + Number(row.bookings || 0) - Number(row.revenue || 0);
            return {
              period: row.period,
              periodStart: row.periodStart,
              backlog: rollingBacklog,
            };
          });

          const customerTotals = (salesData as any[]).reduce((acc, record: any) => {
            const customerId = String(record?.customerId || '').trim();
            const customerName = String(record?.customerName || 'Unknown Customer').trim() || 'Unknown Customer';
            const key = customerId ? `id:${customerId}` : `name:${customerName.toLowerCase().replace(/\s+/g, ' ')}`;
            if (!acc[key]) {
              acc[key] = {
                name: customerName,
                totalRevenue: 0,
                totalInvoices: 0,
              };
            }
            acc[key].totalRevenue += Number(record?.revenue || 0);
            acc[key].totalInvoices += Number(record?.invoiceCount || 0);
            return acc;
          }, {} as Record<string, { name: string; totalRevenue: number; totalInvoices: number }>);
          const topCustomersSummary = (Object.values(customerTotals) as Array<{ name: string; totalRevenue: number; totalInvoices: number }>)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);

          return {
            salesData,
            basis,
            bookingsCustomers,
            bookingsTop5,
            bookingsTotals,
            bookingsMonthly,
            bookingsVsRevenueBridge,
            backlogSeries,
            topCustomersSummary,
            customerConcentration: {
              executiveMonthly: customerConcentrationExecutiveMonthly,
              customerMonthly: customerConcentrationMonthlyCustomers,
              monthKeys: concentrationMonthKeys,
              sourceCoverage: customerConcentrationSourceCoverage,
              cacheVersion: CUSTOMER_CONCENTRATION_CACHE_VERSION,
            },
          };
        };

        // --- Track 2: WIP from order line snapshots ---
        const fetchWip = async () => {
        let wipAsOf: string | null = null;
        let wipTopCustomers: Array<{
          customerId: string | null;
          customerName: string;
          contractValue: number;
          invoicedValue: number;
          wipValue: number;
          lineCount: number;
          wipItems: Array<{
            orderId: string;
            lineId: string;
            item: string;
            stat: string | null;
            orderDate: string | null;
            dueDate: string | null;
            qtyOrdered: number;
            qtyShipped: number;
            qtyInvoiced: number;
            contractValue: number;
            invoicedValue: number;
            wipValue: number;
          }>;
        }> = [];
        let wipTotals = {
          totalWip: 0,
          totalContractValue: 0,
          totalInvoicedValue: 0,
          customerCount: 0,
        };
        const bookingsOrderLineDelegate = (prisma as any).customerOrderLineSnapshot;
        if (bookingsOrderLineDelegate?.findFirst && bookingsOrderLineDelegate?.findMany) {
          const latestOrderSnapshot = await bookingsOrderLineDelegate.findFirst({
            where: {
              companyId,
              frequency: orderLineFrequencyForQuery,
              snapshotDate: { lte: endDate },
            },
            select: { snapshotDate: true },
            orderBy: [{ snapshotDate: 'desc' }],
          });
          const latestOrderSnapshotDate = latestOrderSnapshot?.snapshotDate
            ? new Date(latestOrderSnapshot.snapshotDate)
            : null;
          if (latestOrderSnapshotDate) {
            wipAsOf = latestOrderSnapshotDate.toISOString();
            // Query the exact stored timestamp only (no day-range expansion that can pick up rogue batches)
            const snapshotDayEnd = latestOrderSnapshotDate;
            const latestOrderRows = await bookingsOrderLineDelegate.findMany({
              where: {
                companyId,
                frequency: orderLineFrequencyForQuery,
                snapshotDate: {
                  gte: latestOrderSnapshotDate,
                  lte: snapshotDayEnd,
                },
              },
              select: {
                snapshotDate: true,
                customerId: true,
                customerName: true,
                orderId: true,
                lineId: true,
                orderDate: true,
                itemId: true,
                itemName: true,
                sku: true,
                qtyOrdered: true,
                qtyInvoiced: true,
                contractValue: true,
                invoicedAmount: true,
                remainingAmount: true,
              },
              orderBy: [{ remainingAmount: 'desc' }, { contractValue: 'desc' }],
              take: rawPayloadRowCap,
            });
            const orderIdsForRawLookup = Array.from(
              new Set(
                (latestOrderRows as any[])
                  .map((row: any) => String(row?.orderId || '').trim())
                  .filter((value: string) => value.length > 0)
              )
            );
            const orderIdsForRawLookupSet = new Set(orderIdsForRawLookup);
            const rawDetailByOrderLine = new Map<string, { item: string; stat: string | null; dueDate?: string | null; qtyShipped?: number; qtyInvoiced?: number }>();
            const normalizeToken = (value: unknown): string => {
              const raw = String(value ?? '').trim();
              if (!raw) return '';
              const num = Number(raw);
              if (Number.isFinite(num)) return String(num);
              return raw.toUpperCase();
            };
            const parseSnapshotLine = (lineId: unknown): { line: string; release: string } => {
              const raw = String(lineId ?? '').trim();
              if (!raw) return { line: '0', release: '0' };
              const [linePart, releasePart] = raw.split('-');
              return {
                line: normalizeToken(linePart || '0') || '0',
                release: normalizeToken(releasePart || '0') || '0',
              };
            };
            const buildOrderLineKey = (orderIdRaw: unknown, lineRaw: unknown, releaseRaw: unknown): string => {
              const orderId = normalizeToken(orderIdRaw);
              const line = normalizeToken(lineRaw) || '0';
              const release = normalizeToken(releaseRaw) || '0';
              return `${orderId}|${line}-${release}`;
            };
            const hydrateRawDetailFromLiveCsi = async (orderIdsInput: string[]) => {
              try {
                const company = await prisma.company.findUnique({
                  where: { id: companyId },
                  select: { accountingSystem: true },
                });
                const accountingSystem = String(company?.accountingSystem || '').toUpperCase();
                const inforSystem = accountingSystem.includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
                const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
                if (!resolved.credentials) return;
                const connection = await prisma.accountingConnection.findFirst({
                  where: {
                    companyId,
                    platform: { in: ['INFOR_M3', 'INFOR_CSI'] as any },
                  },
                  select: { connectionMetadata: true },
                });
                const md =
                  connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
                    ? (connection.connectionMetadata as Record<string, unknown>)
                    : {};
                const site =
                  String(md['site'] ?? md['inforSite'] ?? md['defaultSite'] ?? '').trim() || undefined;
                const mongooseConfig =
                  String(md['mongooseConfig'] ?? md['inforMongooseConfig'] ?? '').trim() || undefined;
                const headers: Record<string, string> = {};
                if (site) headers['X-Infor-Site'] = site;
                if (mongooseConfig) headers['X-Infor-MongooseConfig'] = mongooseConfig;
                const liveOrderIds = Array.from(
                  new Set(orderIdsInput.map((value) => normalizeToken(value)).filter((value) => value.length > 0))
                ).slice(0, 1200);
                const chunkSize = 12;
                for (let idx = 0; idx < liveOrderIds.length; idx += chunkSize) {
                  const chunk = liveOrderIds.slice(idx, idx + chunkSize);
                  const responses = await Promise.allSettled([
                    (async () => {
                      const filter = chunk
                        .map((id) => `CoNum='${String(id).replace(/'/g, "''")}'`)
                        .join(' OR ');
                      const path =
                        `/APR_PRD/CSI/IDORequestService/ido/load/SLCoitems?recordCap=5000` +
                        `&properties=${encodeURIComponent('CoNum,CoLine,CoRelease,Item,Stat,QtyShipped,QtyInvoiced,DueDate')}` +
                        `&filter=${encodeURIComponent(filter)}`;
                      const response = await callInforIonApi(resolved.credentials, path, {
                        timeoutMs: 8000,
                        headers,
                      });
                      let items = extractCsiItems(response.body);
                      if (items.length === 0 && Object.keys(headers).length > 0) {
                        const retry = await callInforIonApi(resolved.credentials, path, {
                          timeoutMs: 8000,
                        });
                        items = extractCsiItems(retry.body);
                      }
                      return items;
                    })(),
                  ]);
                  for (const settled of responses) {
                    if (settled.status !== 'fulfilled') continue;
                    for (const payload of settled.value) {
                      const rawOrderId = normalizeToken(payload['CoNum'] ?? payload['CONUM'] ?? payload['coNum'] ?? '');
                      if (!rawOrderId || !orderIdsForRawLookupSet.has(rawOrderId)) continue;
                      const rawLine = payload['CoLine'] ?? payload['COLINE'] ?? payload['coLine'] ?? '0';
                      const rawRelease = payload['CoRelease'] ?? payload['CORELEASE'] ?? payload['coRelease'] ?? '0';
                      const rawItem = String(payload['Item'] ?? payload['ITNO'] ?? '').trim();
                      const rawStat = String(payload['Stat'] ?? payload['STAT'] ?? '').trim() || null;
                      const rawDueDateStr2 = String(payload['DueDate'] ?? payload['dueDate'] ?? '').trim();
                      const rawQtyShipped2 = Number(payload['QtyShipped'] ?? payload['qtyShipped'] ?? 0);
                      const rawQtyInvoiced2 = Number(payload['QtyInvoiced'] ?? payload['qtyInvoiced'] ?? 0);
                      if (!rawItem && !rawStat && !rawDueDateStr2) continue;
                      const rawLineKey = buildOrderLineKey(rawOrderId, rawLine, rawRelease);
                      if (!rawDetailByOrderLine.has(rawLineKey)) {
                        rawDetailByOrderLine.set(rawLineKey, { item: rawItem || 'UNKNOWN_ITEM', stat: rawStat, dueDate: rawDueDateStr2 || null, qtyShipped: rawQtyShipped2, qtyInvoiced: rawQtyInvoiced2 });
                      }
                    }
                  }
                }
              } catch {
                // best-effort enrichment only
              }
            };
            if (orderIdsForRawLookup.length > 0 && (prisma as any).inforRawRecord?.findMany) {
              const rawLookupDayStart = startOfUtcDay(latestOrderSnapshotDate);
              const rawLookupDayEnd = endOfUtcDay(latestOrderSnapshotDate);
              const rawRows = await (prisma as any).inforRawRecord.findMany({
                where: {
                  companyId,
                  platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
                  miProgram: { in: ['SLCOITEMS', 'SLCoitems'] },
                  businessDate: { gte: rawLookupDayStart, lte: rawLookupDayEnd },
                },
                select: {
                  payload: true,
                },
                take: rawPayloadRowCap,
              });
              for (const row of rawRows as any[]) {
                const payload =
                  row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
                    ? (row.payload as Record<string, unknown>)
                    : null;
                if (!payload) continue;
                const rawOrderId = normalizeToken(payload['CoNum'] ?? payload['CONUM'] ?? payload['coNum'] ?? '');
                if (!rawOrderId || !orderIdsForRawLookupSet.has(rawOrderId)) continue;
                const rawLine = payload['CoLine'] ?? payload['COLINE'] ?? payload['coLine'] ?? '0';
                const rawRelease = payload['CoRelease'] ?? payload['CORELEASE'] ?? payload['coRelease'] ?? '0';
                const rawItem = String(payload['Item'] ?? payload['ITNO'] ?? '').trim();
                const rawStat = String(payload['Stat'] ?? payload['STAT'] ?? '').trim() || null;
                const rawDueDateStr = String(payload['DueDate'] ?? payload['dueDate'] ?? '').trim();
                const rawQtyShipped = Number(payload['QtyShipped'] ?? payload['qtyShipped'] ?? 0);
                const rawQtyInvoiced = Number(payload['QtyInvoiced'] ?? payload['qtyInvoiced'] ?? 0);
                if (!rawItem && !rawStat && !rawDueDateStr) continue;
                const rawLineKey = buildOrderLineKey(rawOrderId, rawLine, rawRelease);
                if (!rawDetailByOrderLine.has(rawLineKey)) {
                  rawDetailByOrderLine.set(rawLineKey, { item: rawItem || 'UNKNOWN_ITEM', stat: rawStat, dueDate: rawDueDateStr || null, qtyShipped: rawQtyShipped, qtyInvoiced: rawQtyInvoiced });
                }
              }
            }
            const ORDER_LINE_STATUSES_CLOSED_FOR_WIP = new Set(['C', 'F', 'I']);
            const latestLineState = new Map<
              string,
              {
                customerId: string | null;
                customerName: string;
                orderId: string;
                lineId: string;
                item: string;
                stat: string | null;
                orderDate: string | null;
                dueDate: string | null;
                qtyOrdered: number;
                qtyShipped: number;
                qtyInvoiced: number;
                contractValue: number;
                invoicedValue: number;
                remainingValue: number;
              }
            >();
            for (const row of latestOrderRows as any[]) {
              const orderId = String(row?.orderId || '').trim() || 'UNKNOWN_ORDER';
              const lineId = String(row?.lineId || '').trim() || 'UNKNOWN_LINE';
              const lineKey = `${orderId}|${lineId}`;
              const parsedLine = parseSnapshotLine(lineId);
              const normalizedLineKey = buildOrderLineKey(orderId, parsedLine.line, parsedLine.release);
              const customerId = String(row?.customerId || '').trim() || null;
              const customerName = String(row?.customerName || '').trim() || (customerId ? `Customer ${customerId}` : 'Unknown Customer');
              const rawDetail = rawDetailByOrderLine.get(normalizedLineKey) || rawDetailByOrderLine.get(lineKey);
              const snapshotItem = String(row?.itemName || row?.itemId || row?.sku || '').trim();
              const item = rawDetail?.item || snapshotItem || 'UNKNOWN_ITEM';
              const stat = rawDetail?.stat || null;
              const orderDateRaw = row?.orderDate ? new Date(row.orderDate) : null;
              const orderDate =
                orderDateRaw && !Number.isNaN(orderDateRaw.getTime()) ? orderDateRaw.toISOString().slice(0, 10) : null;
              const rawDueDate = parseInforDateValue(rawDetail?.dueDate);
              const dueDate = rawDueDate && !Number.isNaN(rawDueDate.getTime()) ? rawDueDate.toISOString().slice(0, 10) : null;
              const qtyOrdered = Math.max(Number(row?.qtyOrdered || 0), 0);
              const qtyShipped = Math.max(Number(rawDetail?.qtyShipped || 0), 0);
              const qtyInvoiced = Math.max(Number(row?.qtyInvoiced || 0), 0);
              const contractValue = Math.max(Number(row?.contractValue || 0), 0);
              const invoicedValue = Math.max(Number(row?.invoicedAmount || 0), 0);
              const remainingStored = Number(row?.remainingAmount ?? NaN);
              let remainingValue = Number.isFinite(remainingStored)
                ? Math.max(remainingStored, 0)
                : Math.max(contractValue - invoicedValue, 0);
              const statTrim = String(stat || '')
                .trim()
                .toUpperCase();
              if (statTrim && ORDER_LINE_STATUSES_CLOSED_FOR_WIP.has(statTrim)) {
                remainingValue = 0;
              } else if (qtyOrdered > 0 && qtyInvoiced + 1e-4 >= qtyOrdered) {
                remainingValue = 0;
              }
              if (!latestLineState.has(lineKey)) {
                latestLineState.set(lineKey, {
                  customerId,
                  customerName,
                  orderId,
                  lineId,
                  item,
                  stat,
                  orderDate,
                  dueDate,
                  qtyOrdered,
                  qtyShipped,
                  qtyInvoiced,
                  contractValue,
                  invoicedValue,
                  remainingValue,
                });
              }
            }
            // Hydrate stat (and item when missing) from live CSI for any line
            // that still carries WIP and has no status or has an unknown item.
            // Prioritize orders with the largest remaining WIP so the most
            // impactful phantom-WIP lines get resolved first.
            const wipByUnresolvedOrder = new Map<string, number>();
            for (const line of latestLineState.values()) {
              if (Number(line.remainingValue || 0) <= 0) continue;
              const itemUnknown = String(line.item || '').trim() === 'UNKNOWN_ITEM';
              const statMissing = !line.stat || String(line.stat).trim() === '';
              if (!itemUnknown && !statMissing) continue;
              const oid = String(line.orderId || '').trim();
              if (!oid) continue;
              wipByUnresolvedOrder.set(oid, (wipByUnresolvedOrder.get(oid) || 0) + line.remainingValue);
            }
            const unresolvedOrderIds = Array.from(wipByUnresolvedOrder.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([oid]) => oid);
            if (unresolvedOrderIds.length > 0) {
              await hydrateRawDetailFromLiveCsi(unresolvedOrderIds);
              for (const line of latestLineState.values()) {
                if (Number(line.remainingValue || 0) <= 0) continue;
                const parsed = parseSnapshotLine(line.lineId);
                const normalizedLineKey = buildOrderLineKey(line.orderId, parsed.line, parsed.release);
                const rawDetail = rawDetailByOrderLine.get(normalizedLineKey);
                if (!rawDetail) continue;
                if (String(line.item || '').trim() === 'UNKNOWN_ITEM' && rawDetail.item) {
                  line.item = rawDetail.item;
                }
                if (rawDetail.stat) line.stat = rawDetail.stat;
                if (rawDetail.qtyShipped && rawDetail.qtyShipped > line.qtyShipped) {
                  line.qtyShipped = rawDetail.qtyShipped;
                }
                if (rawDetail.qtyInvoiced && rawDetail.qtyInvoiced > line.qtyInvoiced) {
                  line.qtyInvoiced = rawDetail.qtyInvoiced;
                }
              }
            }
            for (const line of latestLineState.values()) {
              const st = String(line.stat || '')
                .trim()
                .toUpperCase();
              if (st && ORDER_LINE_STATUSES_CLOSED_FOR_WIP.has(st)) {
                line.remainingValue = 0;
                continue;
              }
              if (line.qtyOrdered > 0 && line.qtyInvoiced + 1e-4 >= line.qtyOrdered) {
                line.remainingValue = 0;
              }
            }
            const byCustomer = new Map<
              string,
              {
                customerId: string | null;
                customerName: string;
                contractValue: number;
                invoicedValue: number;
                wipValue: number;
                lineCount: number;
                wipItems: Array<{
                  orderId: string;
                  lineId: string;
                  item: string;
                  stat: string | null;
                  orderDate: string | null;
                  dueDate: string | null;
                  qtyOrdered: number;
                  qtyShipped: number;
                  qtyInvoiced: number;
                  contractValue: number;
                  invoicedValue: number;
                  wipValue: number;
                }>;
              }
            >();
            for (const line of latestLineState.values()) {
              if (line.remainingValue <= 0) continue;
              const customerKey = `${line.customerId || ''}|${line.customerName.toLowerCase()}`;
              if (!byCustomer.has(customerKey)) {
                byCustomer.set(customerKey, {
                  customerId: line.customerId,
                  customerName: line.customerName,
                  contractValue: 0,
                  invoicedValue: 0,
                  wipValue: 0,
                  lineCount: 0,
                  wipItems: [],
                });
              }
              const acc = byCustomer.get(customerKey)!;
              acc.contractValue += line.contractValue;
              acc.invoicedValue += line.invoicedValue;
              acc.wipValue += line.remainingValue;
              acc.lineCount += 1;
              acc.wipItems.push({
                orderId: line.orderId,
                lineId: line.lineId,
                item: line.item,
                stat: line.stat,
                orderDate: line.orderDate,
                dueDate: line.dueDate,
                qtyOrdered: line.qtyOrdered,
                qtyShipped: line.qtyShipped,
                qtyInvoiced: line.qtyInvoiced,
                contractValue: line.contractValue,
                invoicedValue: line.invoicedValue,
                wipValue: line.remainingValue,
              });
            }
            const allWipCustomers = Array.from(byCustomer.values())
              .filter((row) => Number(row.wipValue || 0) > 0)
              .sort((a, b) => b.wipValue - a.wipValue);
            wipTopCustomers = allWipCustomers.slice(0, 50).map((row) => ({
              ...row,
              wipItems: (() => {
                const chronological = [...row.wipItems].sort((a, b) => {
                  const aDate = String(a.orderDate || '');
                  const bDate = String(b.orderDate || '');
                  if (aDate !== bDate) return aDate.localeCompare(bDate);
                  const aOrder = String(a.orderId || '');
                  const bOrder = String(b.orderId || '');
                  if (aOrder !== bOrder) return aOrder.localeCompare(bOrder);
                  return String(a.lineId || '').localeCompare(String(b.lineId || ''));
                });
                // Keep chronological display, but show the most recent portion
                // so 2024/2025/2026 lines are visible instead of only oldest rows.
                const recent = chronological.slice(-200);
                return recent;
              })(),
            }));
            wipTotals = allWipCustomers.reduce(
              (acc, row) => {
                acc.totalWip += Number(row.wipValue || 0);
                acc.totalContractValue += Number(row.contractValue || 0);
                acc.totalInvoicedValue += Number(row.invoicedValue || 0);
                acc.customerCount += 1;
                return acc;
              },
              {
                totalWip: 0,
                totalContractValue: 0,
                totalInvoicedValue: 0,
                customerCount: 0,
              }
            );
          }
        }

          return { wipAsOf, wipTopCustomers, wipTotals };
        };

        // --- Track 3: AR overview (invoice details + open invoices) ---
        const fetchArOverview = async () => {
        let customerOverview = {
          asOf: endDate.toISOString(),
          activeCustomers365: 0,
          newCustomers90: 0,
          totalBilled30: 0,
          totalBilled90: 0,
          totalBilled365: 0,
          concentrationTop5Pct: 0,
          customersPastDuePct: 0,
          atRiskCustomers: 0,
          avgRevenuePerCustomer: 0,
          newCustomerNames90: [] as string[],
          concentrationTop5CustomerNames: [] as string[],
          pastDueCustomerNames: [] as string[],
          atRiskCustomerNames: [] as string[],
        };
        const arInvoiceDetailDelegate =
          (prisma as any).aRInvoiceDetail || (prisma as any).arInvoiceDetail;
        if (arInvoiceDetailDelegate?.findFirst && arInvoiceDetailDelegate?.findMany) {
          const latestInvoiceAsOf = await arInvoiceDetailDelegate.findFirst({
            where: { companyId },
            select: { asOfDate: true },
            orderBy: [{ asOfDate: 'desc' }],
          });
          if (latestInvoiceAsOf?.asOfDate) {
            const isPlaceholderCustomerName = (name: unknown): boolean => {
              const normalized = String(name || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ');
              if (!normalized) return true;
              if (normalized === 'unknown customer') return true;
              if (/^unknown customer \d+$/.test(normalized)) return true;
              if (/^customer \d+$/.test(normalized)) return true;
              return false;
            };
            const asOfDate = startOfUtcDay(new Date(latestInvoiceAsOf.asOfDate));
            const start30 = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate() - 29));
            const start90 = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate() - 89));
            const start365 = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate() - 364));
            const staleStart90 = start90;
            const staleEnd60 = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate() - 60));
            const invoiceRows = await arInvoiceDetailDelegate.findMany({
              where: {
                companyId,
                asOfDate: latestInvoiceAsOf.asOfDate,
              },
              select: {
                customerId: true,
                customerName: true,
                invoiceDate: true,
                invoiceAmount: true,
              },
              take: dashboardRowCap,
            });
            const customerByKey = new Map<
              string,
              {
                name: string;
                firstInvoice: Date | null;
                lastInvoice: Date | null;
                billed365: number;
              }
            >();
            const customerNameByKey = new Map<string, string>();
            for (const row of invoiceRows as any[]) {
              const customerId = String(row?.customerId || '').trim();
              const customerName = String(row?.customerName || '').trim();
              const key =
                customerId
                  ? `id:${customerId}`
                  : customerName
                    ? `name:${customerName.toLowerCase()}`
                    : '';
              if (!key) continue;
              if (!customerByKey.has(key)) {
                customerByKey.set(key, {
                  name: customerName,
                  firstInvoice: null,
                  lastInvoice: null,
                  billed365: 0,
                });
              }
              const acc = customerByKey.get(key)!;
              if (!acc.name && customerName && !isPlaceholderCustomerName(customerName)) acc.name = customerName;
              if (!isPlaceholderCustomerName(customerName)) {
                customerNameByKey.set(key, customerName);
              }
              const invoiceDateRaw = row?.invoiceDate ? new Date(row.invoiceDate) : null;
              if (!invoiceDateRaw || Number.isNaN(invoiceDateRaw.getTime())) continue;
              const invoiceDate = startOfUtcDay(invoiceDateRaw);
              const amount = Number(row?.invoiceAmount || 0);
              if (!acc.firstInvoice || invoiceDate.getTime() < acc.firstInvoice.getTime()) acc.firstInvoice = invoiceDate;
              if (!acc.lastInvoice || invoiceDate.getTime() > acc.lastInvoice.getTime()) acc.lastInvoice = invoiceDate;
              if (invoiceDate >= start30 && invoiceDate <= asOfDate) customerOverview.totalBilled30 += amount;
              if (invoiceDate >= start90 && invoiceDate <= asOfDate) customerOverview.totalBilled90 += amount;
              if (invoiceDate >= start365 && invoiceDate <= asOfDate) {
                customerOverview.totalBilled365 += amount;
                acc.billed365 += amount;
              }
            }
            const activeCustomers = Array.from(customerByKey.values()).filter(
              (c) => c.lastInvoice && c.lastInvoice >= start365
            );
            customerOverview.activeCustomers365 = activeCustomers.length;
            const newCustomerRows = Array.from(customerByKey.values()).filter(
              (c) => c.firstInvoice && c.firstInvoice >= start90 && c.firstInvoice <= asOfDate
            );
            customerOverview.newCustomers90 = newCustomerRows.length;
            customerOverview.newCustomerNames90 = newCustomerRows
              .map((c) => String(c.name || '').trim())
              .filter((name) => Boolean(name) && !isPlaceholderCustomerName(name))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 200);
            const top5ActiveCustomers = activeCustomers
              .slice()
              .sort((a, b) => Number(b.billed365 || 0) - Number(a.billed365 || 0))
              .slice(0, 5);
            const top5Billed = top5ActiveCustomers
              .map((c) => Number(c.billed365 || 0))
              .reduce((sum, n) => sum + n, 0);
            customerOverview.concentrationTop5CustomerNames = top5ActiveCustomers
              .map((c) => String(c.name || '').trim())
              .filter((name) => Boolean(name) && !isPlaceholderCustomerName(name));
            customerOverview.concentrationTop5Pct =
              customerOverview.totalBilled365 > 0
                ? (top5Billed / customerOverview.totalBilled365) * 100
                : 0;
            customerOverview.avgRevenuePerCustomer =
              customerOverview.activeCustomers365 > 0
                ? customerOverview.totalBilled365 / customerOverview.activeCustomers365
                : 0;

            const pastDueByCustomer = new Map<string, number>();
            const arOpenDelegate =
              (prisma as any).aROpenInvoiceSnapshot || (prisma as any).arOpenInvoiceSnapshot;
            if (arOpenDelegate?.findFirst && arOpenDelegate?.findMany) {
              const latestOpenAsOf = await arOpenDelegate.findFirst({
                where: { companyId, snapshotDate: { lte: asOfDate } },
                select: { snapshotDate: true },
                orderBy: [{ snapshotDate: 'desc' }],
              });
              if (latestOpenAsOf?.snapshotDate) {
                const openRows = await arOpenDelegate.findMany({
                  where: {
                    companyId,
                    snapshotDate: latestOpenAsOf.snapshotDate,
                  },
                  select: {
                    customerId: true,
                    customerName: true,
                    amountDueHome: true,
                    dueDate: true,
                    days61to90: true,
                    days90plus: true,
                  },
                  take: dashboardRowCap,
                });
                for (const row of openRows as any[]) {
                  const customerId = String(row?.customerId || '').trim();
                  const customerName = String(row?.customerName || '').trim();
                  const key =
                    customerId
                      ? `id:${customerId}`
                      : customerName
                        ? `name:${customerName.toLowerCase()}`
                        : '';
                  if (!key) continue;
                  if (!isPlaceholderCustomerName(customerName)) {
                    customerNameByKey.set(key, customerName);
                    const existingCustomer = customerByKey.get(key);
                    if (existingCustomer && !existingCustomer.name) {
                      existingCustomer.name = customerName;
                    }
                  }
                  const dueDateRaw = row?.dueDate ? new Date(row.dueDate) : null;
                  const dueDate = dueDateRaw && !Number.isNaN(dueDateRaw.getTime()) ? startOfUtcDay(dueDateRaw) : null;
                  const overdueByDate = dueDate ? dueDate.getTime() < asOfDate.getTime() : false;
                  const overdueByBucket = Number(row?.days61to90 || 0) > 0 || Number(row?.days90plus || 0) > 0;
                  const overdueAmount = Number(row?.amountDueHome || 0);
                  if ((overdueByDate || overdueByBucket) && overdueAmount > 0) {
                    pastDueByCustomer.set(key, Number(pastDueByCustomer.get(key) || 0) + overdueAmount);
                  }
                }
              }
            }
            const activeKeys = new Set(
              Array.from(customerByKey.entries())
                .filter(([, c]) => c.lastInvoice && c.lastInvoice >= start365)
                .map(([key]) => key)
            );
            const pastDueCustomers = Array.from(pastDueByCustomer.keys()).filter((key) => activeKeys.has(key)).length;
            customerOverview.pastDueCustomerNames = Array.from(pastDueByCustomer.keys())
              .filter((key) => activeKeys.has(key))
              .map((key) => String(customerNameByKey.get(key) || customerByKey.get(key)?.name || '').trim())
              .filter((name) => Boolean(name) && !isPlaceholderCustomerName(name))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 500);
            customerOverview.customersPastDuePct =
              customerOverview.activeCustomers365 > 0
                ? (pastDueCustomers / customerOverview.activeCustomers365) * 100
                : 0;
            const inactive60to90 = Array.from(customerByKey.entries())
              .filter(([key, c]) => {
                if (!activeKeys.has(key)) return false;
                if (!c.lastInvoice) return false;
                return c.lastInvoice >= staleStart90 && c.lastInvoice <= staleEnd60;
              })
              .map(([key]) => key);
            const atRiskSet = new Set<string>([
              ...inactive60to90,
              ...Array.from(pastDueByCustomer.keys()).filter((key) => activeKeys.has(key)),
            ]);
            customerOverview.atRiskCustomers = atRiskSet.size;
            customerOverview.atRiskCustomerNames = Array.from(atRiskSet.values())
              .map((key) => String(customerNameByKey.get(key) || customerByKey.get(key)?.name || '').trim())
              .filter((name) => Boolean(name) && !isPlaceholderCustomerName(name))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 500);
            customerOverview.asOf = asOfDate.toISOString();
          }
        }

          return { customerOverview };
        };

        if (shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'customers',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        // Run all three tracks in parallel
        const [salesResult, wipResult, arResult, platosSalesPage] = await Promise.all([
          fetchSalesAndBookings(),
          fetchWip(),
          fetchArOverview(),
          getPlatosClosetSalesPageSummary({ companyId, startDate, endDate }),
        ]);

        data = salesResult.salesData;

        return cacheOperationalPayload({
          records: data,
          summary: {
            topCustomers: salesResult.topCustomersSummary,
            customerDataBasis: salesResult.basis,
            customerConcentration: salesResult.customerConcentration,
            revenueLabel: 'Revenue',
            customerOverview: arResult.customerOverview,
            bookings: {
              totals: salesResult.bookingsTotals,
              top5: salesResult.bookingsTop5,
              topCustomers: salesResult.bookingsCustomers.slice(0, 10),
              monthly: salesResult.bookingsMonthly,
              bridge: salesResult.bookingsVsRevenueBridge,
              backlogSeries: salesResult.backlogSeries,
            },
            wip: {
              asOf: wipResult.wipAsOf,
              totals: wipResult.wipTotals,
              topCustomers: wipResult.wipTopCustomers,
            },
            platosSalesPage,
          },
        });
      }

      case 'ar-aging':
        // Get AR aging data
        let arFrequencyForQuery: 'daily' | 'weekly' | 'monthly' = frequency;
        // QBO operational enrichment is month-end keyed. When the UI is not on
        // monthly frequency, prefer monthly snapshots so AR/AP tabs do not appear empty.
        if (isQuickBooksCompany && frequency !== 'monthly') {
          arFrequencyForQuery = 'monthly';
        }
        // Open AR is derived strictly from invoice-level open rows.
        // Do not fall back to pre-aggregated AR aging snapshots here.
        data = [];

        let unpaidByCustomer: Array<{
          customerId: string;
          customerName: string;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
          totalDue: number;
          contractValueTotal?: number;
          remainingToInvoice?: number;
          accruedRevenueUnbilled?: number;
          invoicedRevenue?: number;
          cashCollectedToDate?: number;
          lastPaymentDate?: string | null;
        }> = [];
        let unpaidInvoices: Array<{
          customerName: string;
          customerNumber: string;
          invoiceDate: string | null;
          dueDate: string | null;
          amountDue: number;
        }> = [];
        let customerInvoices: Array<{
          customerId?: string | null;
          customerName: string;
          invoiceNo: string;
          date: string | null;
          dueDate: string | null;
          currency: string;
          amountCurrency: number;
          amountHome: number;
          amountDueHome: number;
          sourceClass?: string;
        }> = [];
        let invoiceClassificationRows: Array<{ invoiceNo: string; customerId: string | null; amountDueHome: number }> = [];
        const normalizeInvoiceNo = (value: unknown): string =>
          String(value || '')
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '');
        let paidInvoices: Array<{
          customerId: string | null;
          customerName: string;
          currentMonth: number;
          lastMonth: number;
          last12Months: number;
          cashCollectedToDate: number;
          lastPaymentDate: string | null;
        }> = [];
        const normalizeCustomerName = (name: unknown, customerId?: unknown): string => {
          const cid = String(customerId || '').trim();
          const raw = String(name || '').trim();
          if (/^unknown customer \d+$/i.test(raw)) return cid ? `Customer ${cid}` : 'Unknown Customer';
          if (raw) return raw;
          return cid ? `Customer ${cid}` : 'Unknown Customer';
        };
        const isPlaceholderCustomerName = (name: unknown): boolean => {
          const normalized = String(name || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
          if (!normalized) return true;
          if (normalized === 'unknown customer') return true;
          if (/^unknown customer \d+$/.test(normalized)) return true;
          if (/^customer \d+$/.test(normalized)) return true;
          return false;
        };
        const chooseCustomerName = (existingName: unknown, candidateName: unknown, customerId?: unknown): string => {
          const existing = normalizeCustomerName(existingName, customerId);
          const candidate = normalizeCustomerName(candidateName, customerId);
          if (!isPlaceholderCustomerName(candidate)) return candidate;
          if (!isPlaceholderCustomerName(existing)) return existing;
          return existing || candidate;
        };
        const buildCustomerGroupKey = (customerId: unknown, customerName: unknown): string => {
          const cid = String(customerId || '').trim();
          if (cid && cid !== '-') return `id:${cid}`;
          return `name:${normalizeCustomerName(customerName, customerId).toLowerCase().replace(/\s+/g, ' ')}`;
        };
        let latestOpenTotals = {
          totalAR: 0,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
          dsoWeightedDaysNumerator: 0,
          dsoWeightedDaysDenominator: 0,
        };
        let arAsOfReferenceDate = endDate;
        const preferOpenInvoiceSnapshotTrend = true;
        // Hoisted out of the snapshot-trend bare block so the latestOpenTotals
        // override below (around derivedTotals/summaryTotals) can see them.
        let arGlAnchorApplied = false;
        let arGlAnchorLatestTotal = 0;

        let arInvoiceTrendRows: Array<{
          snapshotDate: Date;
          snapshotTs: Date;
          totalAR: number;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
          currentPct: number;
          days1to30Pct: number;
          days31to60Pct: number;
          days61to90Pct: number;
          days90plusPct: number;
          over30Pct: number;
          over90Pct: number;
        }> = [];
        if (!preferOpenInvoiceSnapshotTrend) {
          arInvoiceTrendRows = await prisma.$queryRaw<
            Array<{
              snapshotDate: Date;
              snapshotTs: Date;
              totalAR: number;
              current: number;
              days1to30: number;
              days31to60: number;
              days61to90: number;
              days90plus: number;
              currentPct: number;
              days1to30Pct: number;
              days31to60Pct: number;
              days61to90Pct: number;
              days90plusPct: number;
              over30Pct: number;
              over90Pct: number;
            }>
          >`
          WITH day_snapshots AS (
            SELECT
              date_trunc('day', d."asOfDate") AS day,
              d."asOfDate" AS snapshot_ts,
              COUNT(*)::bigint AS row_count
            FROM "ARInvoiceDetail" d
            WHERE d."companyId" = ${companyId}
              AND d."asOfDate" >= ${startDate}
              AND d."asOfDate" <= ${endDate}
              AND EXTRACT(ISODOW FROM d."asOfDate") BETWEEN 1 AND 5
            GROUP BY date_trunc('day', d."asOfDate"), d."asOfDate"
          ),
          canonical_snapshots AS (
            SELECT day, snapshot_ts
            FROM (
              SELECT
                ds.day,
                ds.snapshot_ts,
                ROW_NUMBER() OVER (
                  PARTITION BY ds.day
                  ORDER BY ds.snapshot_ts ASC
                ) AS rn
              FROM day_snapshots ds
              WHERE ds.row_count > 0
            ) ranked
            WHERE ranked.rn = 1
          ),
          raw_rows AS (
            SELECT
              cs.day AS day,
              cs.snapshot_ts AS snapshot_ts,
              COALESCE(
                NULLIF(TRIM(d."invoiceId"), ''),
                CONCAT(
                  'NOINV|',
                  COALESCE(NULLIF(TRIM(d."customerId"), ''), LOWER(TRIM(d."customerName"))),
                  '|',
                  COALESCE(to_char(d."invoiceDate", 'YYYY-MM-DD'), 'na'),
                  '|',
                  COALESCE(to_char(d."dueDate", 'YYYY-MM-DD'), 'na')
                )
              ) AS invoice_key,
              COALESCE(d."remainingBalance", 0)::double precision AS amount_due,
              -- AR aging anchor: dueDate per the standard 5-bucket spec, with
              -- invoiceDate as fallback when dueDate is missing.
              COALESCE(date_trunc('day', d."dueDate"), date_trunc('day', d."invoiceDate")) AS aging_anchor_day
            FROM canonical_snapshots cs
            INNER JOIN "ARInvoiceDetail" d
              ON d."asOfDate" = cs.snapshot_ts
             AND d."companyId" = ${companyId}
          ),
          one_row_per_invoice AS (
            SELECT
              day,
              snapshot_ts,
              invoice_key,
              amount_due,
              aging_anchor_day,
              ROW_NUMBER() OVER (
                PARTITION BY day, snapshot_ts, invoice_key
                ORDER BY invoice_key
              ) AS rn
            FROM raw_rows
          ),
          base AS (
            SELECT
              day,
              snapshot_ts,
              amount_due,
              CASE
                WHEN aging_anchor_day IS NULL THEN NULL
                ELSE FLOOR(
                  EXTRACT(EPOCH FROM (day - aging_anchor_day)) / 86400
                )::double precision
              END AS age_days
            FROM one_row_per_invoice
            WHERE rn = 1
              AND amount_due > 0
          ),
          bucketed AS (
            SELECT
              day AS "snapshotDate",
              MAX(snapshot_ts) AS "snapshotTs",
              SUM(amount_due)::double precision AS "totalAR",
              SUM(CASE WHEN age_days < 0 THEN amount_due ELSE 0 END)::double precision AS "current",
              SUM(CASE WHEN age_days >= 0 AND age_days <= 30 THEN amount_due ELSE 0 END)::double precision AS "days1to30",
              SUM(CASE WHEN age_days > 30 AND age_days <= 60 THEN amount_due ELSE 0 END)::double precision AS "days31to60",
              SUM(CASE WHEN age_days > 60 AND age_days <= 90 THEN amount_due ELSE 0 END)::double precision AS "days61to90",
              -- Truly unknown anchor (no dueDate, no invoiceDate) lands in 90+
              -- as worst-case so it surfaces for cleanup rather than vanishing.
              SUM(CASE WHEN age_days > 90 OR age_days IS NULL THEN amount_due ELSE 0 END)::double precision AS "days90plus"
            FROM base
            GROUP BY day
          )
          SELECT
            b."snapshotDate",
            b."snapshotTs",
            b."totalAR",
            b."current",
            b."days1to30",
            b."days31to60",
            b."days61to90",
            b."days90plus",
            CASE WHEN b."totalAR" > 0 THEN (b."current" / b."totalAR") * 100 ELSE 0 END::double precision AS "currentPct",
            CASE WHEN b."totalAR" > 0 THEN (b."days1to30" / b."totalAR") * 100 ELSE 0 END::double precision AS "days1to30Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days31to60" / b."totalAR") * 100 ELSE 0 END::double precision AS "days31to60Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days61to90" / b."totalAR") * 100 ELSE 0 END::double precision AS "days61to90Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days90plus" / b."totalAR") * 100 ELSE 0 END::double precision AS "days90plusPct",
            CASE WHEN b."totalAR" > 0 THEN ((b."days31to60" + b."days61to90" + b."days90plus") / b."totalAR") * 100 ELSE 0 END::double precision AS "over30Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days90plus" / b."totalAR") * 100 ELSE 0 END::double precision AS "over90Pct"
          FROM bucketed b
          ORDER BY b."snapshotDate" DESC
          LIMIT ${Math.max(limit, 365)}
          `;
        }
        if (!preferOpenInvoiceSnapshotTrend && arInvoiceTrendRows.length > 0) {
          data = arInvoiceTrendRows;
          const latestArInvoiceSnapshotDate = new Date(arInvoiceTrendRows[0].snapshotTs || arInvoiceTrendRows[0].snapshotDate);
          arAsOfReferenceDate = latestArInvoiceSnapshotDate;
          const latestArInvoiceRows = await prisma.aRInvoiceDetail.findMany({
            where: {
              companyId,
              asOfDate: latestArInvoiceSnapshotDate,
            },
            select: {
              customerId: true,
              customerName: true,
              invoiceId: true,
              invoiceDate: true,
              dueDate: true,
              remainingBalance: true,
              invoiceAmount: true,
              amountPaid: true,
            },
            orderBy: [{ remainingBalance: 'desc' }],
            take: 100000,
          });
          const invoiceRowsOpen = (latestArInvoiceRows as any[])
            .map((row: any) => {
              const amountDue = Number(row.remainingBalance || 0);
              return {
                ...row,
                amountDue,
              };
            })
            .filter((row: any) => Number.isFinite(row.amountDue) && row.amountDue > 0);
          const invoiceRowsOpenDeduped: any[] = Array.from(
            invoiceRowsOpen
              .reduce((acc: Map<string, any>, row: any) => {
              const invoiceKey =
                String(row.invoiceId || '').trim() ||
                `NOINV|${String(row.customerId || row.customerName || '').trim()}|${row.invoiceDate ? new Date(row.invoiceDate).toISOString().slice(0, 10) : 'na'}`;
              if (!acc.has(invoiceKey)) acc.set(invoiceKey, row);
              return acc;
              }, new Map<string, any>())
              .values()
          );
          const customerAging = invoiceRowsOpenDeduped.reduce((acc: Record<string, any>, row: any) => {
            const customerId = row.customerId ? String(row.customerId) : null;
            const name = normalizeCustomerName(row.customerName, customerId);
            const customerKey = buildCustomerGroupKey(customerId, name);
            if (!acc[customerKey]) {
              acc[customerKey] = {
                customerId: row.customerId || '-',
                customerName: name,
                current: 0,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
                totalDue: 0,
              };
            }
            if (!acc[customerKey].customerId && row.customerId) acc[customerKey].customerId = row.customerId;
            acc[customerKey].customerName = chooseCustomerName(acc[customerKey].customerName, row.customerName, customerId);
            const buckets = deriveArBucketsFromRow(
              {
                amountDueHome: Number(row.amountDue || 0),
                dueDate: null,
                invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
              },
              latestArInvoiceSnapshotDate
            );
            if (buckets.totalAR <= 0) return acc;
            acc[customerKey].current += buckets.current;
            acc[customerKey].days1to30 += buckets.days1to30;
            acc[customerKey].days31to60 += buckets.days31to60;
            acc[customerKey].days61to90 += buckets.days61to90;
            acc[customerKey].days90plus += buckets.days90plus;
            acc[customerKey].totalDue += buckets.totalAR;
            return acc;
          }, {});
          unpaidByCustomer = Object.values(customerAging)
            .sort((a: any, b: any) => b.totalDue - a.totalDue)
            .slice(0, 500) as any[];
          unpaidInvoices = invoiceRowsOpenDeduped
            .sort((a: any, b: any) => {
              const aDue = a.dueDate ? new Date(a.dueDate).getTime() : -Infinity;
              const bDue = b.dueDate ? new Date(b.dueDate).getTime() : -Infinity;
              if (aDue !== bDue) return bDue - aDue;
              const aInv = a.invoiceDate ? new Date(a.invoiceDate).getTime() : -Infinity;
              const bInv = b.invoiceDate ? new Date(b.invoiceDate).getTime() : -Infinity;
              if (aInv !== bInv) return bInv - aInv;
              return Number(b.amountDue || 0) - Number(a.amountDue || 0);
            })
            .slice(0, 250)
            .map((row: any) => ({
              customerName: normalizeCustomerName(row.customerName, row.customerId),
              customerNumber: row.customerId || '-',
              invoiceDate: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDue || 0),
            }));
          customerInvoices = invoiceRowsOpenDeduped.slice(0, 500).map((row: any) => ({
            customerId: row.customerId ? String(row.customerId) : null,
            customerName: normalizeCustomerName(row.customerName, row.customerId),
            invoiceNo: row.invoiceId || '-',
            date: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
            dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
            currency: 'USD',
            amountCurrency: Number(row.amountDue || 0),
            amountHome: Number(row.amountDue || 0),
            amountDueHome: Number(row.amountDue || 0),
            sourceClass: 'UNKNOWN',
          }));
          invoiceClassificationRows = invoiceRowsOpenDeduped.map((row: any) => ({
            invoiceNo: String(row.invoiceId || ''),
            customerId: row.customerId ? String(row.customerId) : null,
            amountDueHome: Number(row.amountDue || 0),
          }));
          latestOpenTotals = unpaidByCustomer.reduce(
            (acc: any, row: any) => {
              acc.totalAR += Number(row.totalDue || 0);
              acc.current += Number(row.current || 0);
              acc.days1to30 += Number(row.days1to30 || 0);
              acc.days31to60 += Number(row.days31to60 || 0);
              acc.days61to90 += Number(row.days61to90 || 0);
              acc.days90plus += Number(row.days90plus || 0);
              return acc;
            },
            {
              totalAR: 0,
              current: 0,
              days1to30: 0,
              days31to60: 0,
              days61to90: 0,
              days90plus: 0,
              dsoWeightedDaysNumerator: 0,
              dsoWeightedDaysDenominator: 0,
            }
          );
          for (const row of invoiceRowsOpenDeduped) {
            const amountDue = Number(row.amountDue || 0);
            if (amountDue <= 0) continue;
            const anchorDate = row.invoiceDate ? new Date(row.invoiceDate) : row.dueDate ? new Date(row.dueDate) : null;
            if (!anchorDate || Number.isNaN(anchorDate.getTime())) continue;
            const ageDays = Math.max(
              0,
              Math.floor((startOfUtcDay(latestArInvoiceSnapshotDate).getTime() - startOfUtcDay(anchorDate).getTime()) / (24 * 60 * 60 * 1000))
            );
            latestOpenTotals.dsoWeightedDaysNumerator += amountDue * ageDays;
            latestOpenTotals.dsoWeightedDaysDenominator += amountDue;
          }
        }

        {
          const latestOpenSnapshot = await prisma.aROpenInvoiceSnapshot.findFirst({
          where: {
            companyId,
            frequency: arFrequencyForQuery,
            snapshotDate: { lte: endDate },
          },
          select: { snapshotDate: true },
          orderBy: [{ snapshotDate: 'desc' }],
        });
          const latestOpenSnapshotDate = latestOpenSnapshot?.snapshotDate
          ? startOfUtcDay(new Date(latestOpenSnapshot.snapshotDate))
          : null;
          if (latestOpenSnapshotDate) {
            arAsOfReferenceDate = latestOpenSnapshotDate;
          }
          const latestOpenRows = latestOpenSnapshotDate
          ? await prisma.aROpenInvoiceSnapshot.findMany({
              where: {
                companyId,
                frequency: arFrequencyForQuery,
                snapshotDate: {
                  gte: latestOpenSnapshotDate,
                  lte: new Date(latestOpenSnapshotDate.getTime() + 24 * 60 * 60 * 1000 - 1),
                },
              },
              select: {
                snapshotDate: true,
                customerName: true,
                customerId: true,
                invoiceNo: true,
                status: true,
                invoiceDate: true,
                dueDate: true,
                sourcePlatform: true,
                sourceProgram: true,
                amountDueHome: true,
                amountHome: true,
                amountCurrency: true,
                currencyCode: true,
                current: true,
                days1to30: true,
                days31to60: true,
                days61to90: true,
                days90plus: true,
              },
              orderBy: [{ amountDueHome: 'desc' }],
            })
          : [];

          const latestOpenPositiveRows = (latestOpenRows as any[]).filter((row: any) => Number(row.amountDueHome || 0) > 0).length;
          const latestOpenNegativeRows = (latestOpenRows as any[]).filter((row: any) => Number(row.amountDueHome || 0) < 0).length;
          const latestOpenPositiveWithDueRows = (latestOpenRows as any[]).filter(
          (row: any) => Number(row.amountDueHome || 0) > 0 && row.dueDate
        ).length;
        // Treat latest snapshot as anomalous only when it has no positive open rows.
        // Strict mixed-sign/day-shape gates were dropping legitimate historical AR days.
          const latestSnapshotLooksAnomalous = latestOpenPositiveRows === 0;

          const openRowsInvoiceLike = (latestOpenRows as any[]).filter((row: any) => {
          if (latestSnapshotLooksAnomalous) return false;
          const amountDue = Number(row.amountDueHome || 0);
          if (!Number.isFinite(amountDue) || amountDue <= 0) return false;
          if (isClosedArStatus(row.status)) return false;
          const invoiceDate = row.invoiceDate ? new Date(row.invoiceDate) : null;
          if (!invoiceDate || Number.isNaN(invoiceDate.getTime())) return false;
          return isInvoiceLikeArOpenRow(row);
        });
          const arTrendFromOpenRows = await prisma.$queryRaw<
          Array<{
            snapshotDate: Date;
            totalAR: number;
            current: number;
            days1to30: number;
            days31to60: number;
            days61to90: number;
            days90plus: number;
            currentPct: number;
            days1to30Pct: number;
            days31to60Pct: number;
            days61to90Pct: number;
            days90plusPct: number;
            over30Pct: number;
            over90Pct: number;
          }>
        >`
          WITH canonical_snapshots AS (
            SELECT
              date_trunc('day', "snapshotDate") AS day,
              MAX("snapshotDate") AS snapshot_ts
            FROM "AROpenInvoiceSnapshot"
            WHERE "companyId" = ${companyId}
              AND "frequency" = 'daily'
              AND "snapshotDate" >= ${startDate}
              AND "snapshotDate" <= ${endDate}
            GROUP BY date_trunc('day', "snapshotDate")
          ),
          raw_rows AS (
            SELECT
              cs.day AS day,
              COALESCE(s."customerId", s."customerName") AS customer_key,
              NULLIF(TRIM(COALESCE(s."invoiceNo", '')), '') AS invoice_no_norm,
              COALESCE(s."amountDueHome", 0)::double precision AS amount_due,
              date_trunc('day', s."invoiceDate") AS invoice_day,
              date_trunc('day', s."dueDate") AS due_day,
              LOWER(COALESCE(s."sourcePlatform", '')) AS source_platform,
              LOWER(COALESCE(s."sourceProgram", '')) AS source_program,
              UPPER(TRIM(COALESCE(s."status", ''))) AS status_token,
              LOWER(COALESCE(s."status", '')) AS status_text
            FROM "AROpenInvoiceSnapshot" s
            INNER JOIN canonical_snapshots cs
              ON s."snapshotDate" = cs.snapshot_ts
            WHERE s."companyId" = ${companyId}
              AND s."frequency" = 'daily'
              AND NULLIF(TRIM(COALESCE(s."invoiceNo", '')), '') IS NOT NULL
              AND UPPER(COALESCE(s."invoiceNo", '')) NOT LIKE 'CR%'
          ),
          day_quality AS (
            SELECT
              day,
              COUNT(*) FILTER (WHERE amount_due > 0)::integer AS positive_rows,
              COUNT(*) FILTER (WHERE amount_due < 0)::integer AS negative_rows,
              COUNT(*) FILTER (WHERE amount_due > 0 AND due_day IS NOT NULL)::integer AS positive_rows_with_due
            FROM raw_rows
            GROUP BY day
          ),
          valid_days AS (
            SELECT dq.day
            FROM day_quality dq
            WHERE dq.positive_rows > 0
          ),
          invoice_net AS (
            SELECT
              rr.day AS day,
              rr.customer_key,
              rr.invoice_no_norm,
              SUM(rr.amount_due)::double precision AS net_amount_due,
              MAX(rr.invoice_day) AS invoice_day,
              MAX(rr.due_day) AS due_day,
              MAX(rr.source_platform) AS source_platform,
              MAX(rr.source_program) AS source_program,
              BOOL_OR(
                rr.status_token = 'C' OR
                rr.status_token = 'P' OR
                rr.status_text LIKE '%credit%' OR
                rr.status_text LIKE '%payment%' OR
                rr.status_text LIKE '%cash%' OR
                rr.status_text LIKE '%receipt%' OR
                rr.status_text LIKE '%closed%' OR
                rr.status_text LIKE '%paid%' OR
                rr.status_text LIKE '%void%' OR
                rr.status_text LIKE '%cancel%' OR
                rr.status_text LIKE '%settled%' OR
                rr.status_text LIKE '%history%'
              ) AS has_bad_status
            FROM raw_rows rr
            INNER JOIN valid_days vd
              ON vd.day = rr.day
            GROUP BY rr.day, rr.customer_key, rr.invoice_no_norm
          ),
          base AS (
            SELECT
              day,
              net_amount_due AS amount_due,
              -- Standard AR aging: anchor on dueDate (fall back to invoiceDate
              -- only when dueDate is missing). Allow negative ages so we can
              -- distinguish Current (not yet due) from 1-30 (just past due).
              CASE
                WHEN COALESCE(due_day, invoice_day) IS NULL THEN NULL
                ELSE FLOOR(
                  EXTRACT(EPOCH FROM (day - COALESCE(due_day, invoice_day))) / 86400
                )
              END AS invoice_age_days
            FROM invoice_net
            WHERE net_amount_due > 0
              AND NOT has_bad_status
              AND COALESCE(due_day, invoice_day) IS NOT NULL
          ),
          bucketed AS (
            SELECT
              day AS "snapshotDate",
              SUM(amount_due)::double precision AS "totalAR",
              SUM(
                CASE
                  WHEN invoice_age_days < 0 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "current",
              SUM(
                CASE
                  WHEN invoice_age_days >= 0 AND invoice_age_days <= 30 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days1to30",
              SUM(
                CASE
                  WHEN invoice_age_days > 30 AND invoice_age_days <= 60 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days31to60",
              SUM(
                CASE
                  WHEN invoice_age_days > 60 AND invoice_age_days <= 90 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days61to90",
              SUM(
                CASE
                  WHEN invoice_age_days > 90 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days90plus"
            FROM base
            WHERE EXTRACT(DOW FROM day) NOT IN (0, 6)
            GROUP BY day
          )
          SELECT
            b."snapshotDate",
            b."totalAR",
            b."current",
            b."days1to30",
            b."days31to60",
            b."days61to90",
            b."days90plus",
            CASE WHEN b."totalAR" > 0 THEN (b."current" / b."totalAR") * 100 ELSE 0 END::double precision AS "currentPct",
            CASE WHEN b."totalAR" > 0 THEN (b."days1to30" / b."totalAR") * 100 ELSE 0 END::double precision AS "days1to30Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days31to60" / b."totalAR") * 100 ELSE 0 END::double precision AS "days31to60Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days61to90" / b."totalAR") * 100 ELSE 0 END::double precision AS "days61to90Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days90plus" / b."totalAR") * 100 ELSE 0 END::double precision AS "days90plusPct",
            CASE WHEN b."totalAR" > 0 THEN ((b."days31to60" + b."days61to90" + b."days90plus") / b."totalAR") * 100 ELSE 0 END::double precision AS "over30Pct",
            CASE WHEN b."totalAR" > 0 THEN (b."days90plus" / b."totalAR") * 100 ELSE 0 END::double precision AS "over90Pct"
          FROM bucketed b
          ORDER BY b."snapshotDate" DESC
          LIMIT ${Math.max(limit, 365)}
        `;
          data = arTrendFromOpenRows;

          // ARTransactionFact-derived aging-rule override (Infor CSI):
          // The legacy AROpenInvoiceSnapshot trend has gaps and timing issues
          // (e.g. 12/29/2023 = $349K but 1/2/2024 jumps to $1.4M for the same
          // open invoices). When we have an AR balance-sheet anchor configured
          // and ARTransactionFact data, replace each row's totalAR (and rescale
          // its aging buckets proportionally) with the 180-day aging-rule
          // computation. Validated against 4 customer TB anchors:
          //   12/31/2023 +0.3%, 1/31/2026 -2.6%, 2/28/2026 -8.8%, 3/31/2026 +2.1%.
          const arAnchorCfgForTrend = getArBalanceSheetAnchorConfig(companyId);
          if (isInforGlCompany && arAnchorCfgForTrend && data.length > 0) {
            const anchorAccountForTrend = arAnchorCfgForTrend.accounts[0];
            const dailyAr = await buildDailyArSeriesByAgingRule(
              prisma,
              companyId,
              anchorAccountForTrend.accountId,
              anchorAccountForTrend.accountName || 'Accounts Receivable',
              anchorAccountForTrend.accountNumber || anchorAccountForTrend.accountId,
              startDate,
              endDate,
              arAnchorCfgForTrend.agingDays
            );
            if (dailyAr.length > 0) {
              const arTotalByDay = new Map<string, number>();
              for (const row of dailyAr) {
                const k = dateKeyUtc(new Date(row.snapshotDate));
                arTotalByDay.set(k, Number(row.arBalance || 0));
              }
              if (arTotalByDay.size > 0) {
                arGlAnchorApplied = true;
                // Capture latest helper-derived total for later latestOpenTotals override.
                const sortedKeys = Array.from(arTotalByDay.keys()).sort();
                const latestKey = sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : '';
                arGlAnchorLatestTotal = Number(arTotalByDay.get(latestKey) || 0);
                data = data
                  .map((row: any) => {
                    const key = dateKeyUtc(new Date(row.snapshotDate));
                    const fact = arTotalByDay.get(key);
                    if (fact === undefined) return row;
                    const oldTotal = Number(row.totalAR || 0);
                    if (oldTotal <= 0 || fact <= 0) {
                      return {
                        ...row,
                        totalAR: fact,
                        current: fact,
                        days1to30: 0,
                        days31to60: 0,
                        days61to90: 0,
                        days90plus: 0,
                        currentPct: 100,
                        days1to30Pct: 0,
                        days31to60Pct: 0,
                        days61to90Pct: 0,
                        days90plusPct: 0,
                        over30Pct: 0,
                        over90Pct: 0,
                      };
                    }
                    const scale = fact / oldTotal;
                    return {
                      ...row,
                      totalAR: fact,
                      current: Number(row.current || 0) * scale,
                      days1to30: Number(row.days1to30 || 0) * scale,
                      days31to60: Number(row.days31to60 || 0) * scale,
                      days61to90: Number(row.days61to90 || 0) * scale,
                      days90plus: Number(row.days90plus || 0) * scale,
                    };
                  });
              }
            }
          }

          if (openRowsInvoiceLike.length > 0) {
          const openRowsEligible = openRowsInvoiceLike;
          for (const row of openRowsEligible as any[]) {
            const buckets = deriveArBucketsFromRow(row, latestOpenSnapshotDate || endDate);
            if (buckets.totalAR <= 0) continue;
            latestOpenTotals.totalAR += buckets.totalAR;
            latestOpenTotals.current += buckets.current;
            latestOpenTotals.days1to30 += buckets.days1to30;
            latestOpenTotals.days31to60 += buckets.days31to60;
            latestOpenTotals.days61to90 += buckets.days61to90;
            latestOpenTotals.days90plus += buckets.days90plus;
            const invoiceDate = row.invoiceDate ? new Date(row.invoiceDate) : null;
            if (invoiceDate && !Number.isNaN(invoiceDate.getTime())) {
              const ageDays = Math.max(
                0,
                Math.floor((startOfUtcDay(latestOpenSnapshotDate || endDate).getTime() - startOfUtcDay(invoiceDate).getTime()) / (24 * 60 * 60 * 1000))
              );
              latestOpenTotals.dsoWeightedDaysNumerator += buckets.totalAR * ageDays;
              latestOpenTotals.dsoWeightedDaysDenominator += buckets.totalAR;
            }
          }

          const customerAging = openRowsEligible.reduce((acc: Record<string, any>, row: any) => {
            const customerId = row.customerId ? String(row.customerId) : null;
            const name = normalizeCustomerName(row.customerName, customerId);
            const customerKey = buildCustomerGroupKey(customerId, name);
            if (!acc[customerKey]) {
              acc[customerKey] = {
                customerId: row.customerId || '-',
                customerName: name,
                current: 0,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
                totalDue: 0,
              };
            }
            if (!acc[customerKey].customerId && row.customerId) acc[customerKey].customerId = row.customerId;
            acc[customerKey].customerName = chooseCustomerName(acc[customerKey].customerName, row.customerName, customerId);
            const buckets = deriveArBucketsFromRow(row, latestOpenSnapshotDate || endDate);
            if (buckets.totalAR <= 0) return acc;
            acc[customerKey].current += buckets.current;
            acc[customerKey].days1to30 += buckets.days1to30;
            acc[customerKey].days31to60 += buckets.days31to60;
            acc[customerKey].days61to90 += buckets.days61to90;
            acc[customerKey].days90plus += buckets.days90plus;
            acc[customerKey].totalDue += buckets.totalAR;
            return acc;
          }, {});

          unpaidByCustomer = Object.values(customerAging)
            .sort((a: any, b: any) => b.totalDue - a.totalDue)
            .slice(0, 500) as any[];

          const openRowsWithBalance = openRowsEligible;
          unpaidInvoices = openRowsWithBalance
            .sort((a: any, b: any) => {
              const aDue = a.dueDate ? new Date(a.dueDate).getTime() : -Infinity;
              const bDue = b.dueDate ? new Date(b.dueDate).getTime() : -Infinity;
              if (aDue !== bDue) return bDue - aDue;
              const aInv = a.invoiceDate ? new Date(a.invoiceDate).getTime() : -Infinity;
              const bInv = b.invoiceDate ? new Date(b.invoiceDate).getTime() : -Infinity;
              if (aInv !== bInv) return bInv - aInv;
              return Number(b.amountDueHome || 0) - Number(a.amountDueHome || 0);
            })
            .slice(0, 250)
            .map((row: any) => ({
              customerName: normalizeCustomerName(row.customerName, row.customerId),
              customerNumber: row.customerId || '-',
              invoiceDate: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDueHome || 0),
            }));

            customerInvoices = openRowsEligible.slice(0, 500).map((row: any) => ({
            customerId: row.customerId ? String(row.customerId) : null,
            customerName: normalizeCustomerName(row.customerName, row.customerId),
            invoiceNo: row.invoiceNo || '-',
            date: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
            dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
            currency: row.currencyCode || 'USD',
            amountCurrency: Number(row.amountCurrency || row.amountHome || 0),
            amountHome: Number(row.amountHome || row.amountDueHome || 0),
            amountDueHome: Number(row.amountDueHome || 0),
            sourceClass: 'UNKNOWN',
            }));
            const dedupedInvoiceMap = (openRowsEligible as any[]).reduce(
              (acc: Map<string, { invoiceNo: string; customerId: string | null; amountDueHome: number }>, row: any) => {
                const invoiceNo = String(row.invoiceNo || '').trim();
                if (!invoiceNo) return acc;
                const customerId = row.customerId ? String(row.customerId) : null;
                const key = `${normalizeInvoiceNo(invoiceNo)}|${String(customerId || '').trim()}`;
                if (!acc.has(key)) {
                  acc.set(key, { invoiceNo, customerId, amountDueHome: 0 });
                }
                const bucket = acc.get(key)!;
                bucket.amountDueHome += Number(row.amountDueHome || 0);
                return acc;
              },
              new Map<string, { invoiceNo: string; customerId: string | null; amountDueHome: number }>()
            );
            const dedupedInvoiceRows: Array<{ invoiceNo: string; customerId: string | null; amountDueHome: number }> =
              Array.from(dedupedInvoiceMap.values());
            invoiceClassificationRows = dedupedInvoiceRows.filter((row) => Number(row.amountDueHome || 0) > 0);
          }
        }

        const monthStart = startOfMonth(endDate);
        const lastMonthStart = addMonths(monthStart, -1);
        const trailing12Start = addMonths(monthStart, -11);
        const paymentRows = await prisma.aRPaymentFact.findMany({
          where: {
            companyId,
            paymentDate: {
              lte: endDate,
            },
          },
          orderBy: [{ paymentDate: 'desc' }],
          take: factRowCap,
        });

        if (paymentRows.length) {
          const grouped = paymentRows.reduce((acc: Record<string, any>, row: any) => {
            const customerId = row.customerId ? String(row.customerId) : null;
            const name = normalizeCustomerName(row.customerName, customerId);
            const customerKey = buildCustomerGroupKey(customerId, name);
            if (!acc[customerKey]) {
              acc[customerKey] = {
                customerId,
                customerName: name,
                currentMonth: 0,
                lastMonth: 0,
                last12Months: 0,
                cashCollectedToDate: 0,
                lastPaymentDate: null as string | null,
              };
            }
            const dt = new Date(row.paymentDate);
            const amount = Number(row.paidAmountHome || 0);
            acc[customerKey].customerName = chooseCustomerName(acc[customerKey].customerName, row.customerName, customerId);
            if (dt >= monthStart && dt <= endDate) acc[customerKey].currentMonth += amount;
            if (dt >= lastMonthStart && dt < monthStart) acc[customerKey].lastMonth += amount;
            if (dt >= trailing12Start && dt <= endDate) acc[customerKey].last12Months += amount;
            if (dt <= endDate) acc[customerKey].cashCollectedToDate += amount;
            if (
              !acc[customerKey].lastPaymentDate ||
              dt.getTime() > new Date(acc[customerKey].lastPaymentDate).getTime()
            ) {
              acc[customerKey].lastPaymentDate = dt.toISOString().split('T')[0];
            }
            return acc;
          }, {});
          paidInvoices = Object.values(grouped)
            .sort((a: any, b: any) => b.last12Months - a.last12Months)
            .slice(0, 25) as any[];
        }

        const contractStatusDelegate = (prisma as any).customerContractStatus;
        const contractStatusByCustomer = new Map<
          string,
          {
            customerId: string;
            customerName: string;
            contractValueTotal: number;
            remainingToInvoice: number;
            accruedRevenueUnbilled: number;
            invoicedRevenue: number;
            cashCollectedToDate: number;
            lastPaymentDate: string | null;
          }
        >();
        if (contractStatusDelegate?.findMany) {
          const asOfReference = arAsOfReferenceDate;
          const asOfStart = startOfUtcDay(asOfReference);
          const asOfEnd = new Date(asOfStart.getTime() + 24 * 60 * 60 * 1000 - 1);
          let contractRows = await contractStatusDelegate.findMany({
            where: {
              companyId,
              asOfDate: {
                gte: asOfStart,
                lte: asOfEnd,
              },
            },
            orderBy: [{ contractValue: 'desc' }],
            take: 5000,
          });
          if (!contractRows.length) {
            contractRows = await contractStatusDelegate.findMany({
              where: {
                companyId,
                asOfDate: { lte: asOfEnd },
              },
              orderBy: [{ asOfDate: 'desc' }],
              take: 5000,
            });
          }
          for (const row of contractRows as any[]) {
            const customerId = row.customerId ? String(row.customerId) : '-';
            const name = normalizeCustomerName(row.customerName, customerId);
            const customerKey = buildCustomerGroupKey(customerId, name);
            if (!contractStatusByCustomer.has(customerKey)) {
              contractStatusByCustomer.set(customerKey, {
                customerId,
                customerName: name,
                contractValueTotal: 0,
                remainingToInvoice: 0,
                accruedRevenueUnbilled: 0,
                invoicedRevenue: 0,
                cashCollectedToDate: 0,
                lastPaymentDate: null,
              });
            }
            const acc = contractStatusByCustomer.get(customerKey)!;
            acc.contractValueTotal += Number(row.contractValue || 0);
            acc.remainingToInvoice += Number(row.remainingValue || 0);
            acc.accruedRevenueUnbilled += Number(row.accruedRevenueUnbilled || 0);
            acc.invoicedRevenue += Number(row.invoicedToDate || 0);
            acc.cashCollectedToDate += Number(row.cashCollectedToDate || 0);
            if (!acc.lastPaymentDate && row.lastPaymentDate) {
              acc.lastPaymentDate = new Date(row.lastPaymentDate).toISOString().split('T')[0];
            }
            if (!acc.customerId && row.customerId) acc.customerId = row.customerId;
            acc.customerName = chooseCustomerName(acc.customerName, row.customerName, customerId);
          }
        }

        const paidByCustomerName = new Map(
          paidInvoices.map((row) => [row.customerName, row])
        );
        const paidByCustomerId = new Map(
          paidInvoices
            .filter((row) => String(row.customerId || '').trim().length > 0 && String(row.customerId || '').trim() !== '-')
            .map((row) => [String(row.customerId).trim(), row])
        );
        const normalizeText = (value: unknown): string =>
          String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
        const arOrderLineDelegate = (prisma as any).customerOrderLineSnapshot;
        const orderContractByCustomerName = new Map<
          string,
          {
            customerId: string;
            customerName: string;
            contractValueTotal: number;
            invoicedRevenue: number;
            remainingToInvoice: number;
            accruedRevenueUnbilled: number;
          }
        >();
        if (arOrderLineDelegate?.findMany) {
          const latestOrderSnapshot = await arOrderLineDelegate.findFirst({
            where: {
              companyId,
              frequency: arFrequencyForQuery,
              snapshotDate: { lte: endDate },
            },
            orderBy: [{ snapshotDate: 'desc' }],
            select: { snapshotDate: true },
          });
          if (latestOrderSnapshot?.snapshotDate) {
            const orderRows = await arOrderLineDelegate.findMany({
              where: {
                companyId,
                frequency: arFrequencyForQuery,
                snapshotDate: latestOrderSnapshot.snapshotDate,
              },
              select: {
                customerId: true,
                customerName: true,
                contractValue: true,
                invoicedAmount: true,
                remainingAmount: true,
                unbilledAccrual: true,
              },
              take: 100000,
            });
            for (const row of orderRows as any[]) {
              const name = normalizeCustomerName(row.customerName, row.customerId);
              if (!orderContractByCustomerName.has(name)) {
                orderContractByCustomerName.set(name, {
                  customerId: row.customerId || '-',
                  customerName: name,
                  contractValueTotal: 0,
                  invoicedRevenue: 0,
                  remainingToInvoice: 0,
                  accruedRevenueUnbilled: 0,
                });
              }
              const acc = orderContractByCustomerName.get(name)!;
              acc.contractValueTotal += Number(row.contractValue || 0);
              acc.invoicedRevenue += Number(row.invoicedAmount || 0);
              acc.remainingToInvoice += Number(row.remainingAmount || 0);
              acc.accruedRevenueUnbilled += Number(row.unbilledAccrual || 0);
              if (!acc.customerId && row.customerId) acc.customerId = row.customerId;
              acc.customerName = chooseCustomerName(acc.customerName, row.customerName, row.customerId);
            }
          }
        }
        const orderContractByCustomerId = new Map(
          Array.from(orderContractByCustomerName.values())
            .filter((row) => String(row.customerId || '').trim().length > 0 && row.customerId !== '-')
            .map((row) => [normalizeText(row.customerId), row])
        );
        const orderContractByNormalizedName = new Map(
          Array.from(orderContractByCustomerName.values()).map((row) => [normalizeText(row.customerName), row])
        );
        const canonicalCustomerNameById = new Map<string, string>();
        const rememberCanonicalCustomerName = (customerId: unknown, customerName: unknown): void => {
          const cid = String(customerId || '').trim();
          if (!cid || cid === '-') return;
          const candidate = normalizeCustomerName(customerName, cid);
          if (isPlaceholderCustomerName(candidate)) return;
          const existing = canonicalCustomerNameById.get(cid);
          canonicalCustomerNameById.set(cid, chooseCustomerName(existing, candidate, cid));
        };
        for (const row of Array.from(orderContractByCustomerName.values())) {
          rememberCanonicalCustomerName(row.customerId, row.customerName);
        }
        for (const row of Array.from(contractStatusByCustomer.values())) {
          rememberCanonicalCustomerName(row.customerId, row.customerName);
        }
        for (const row of paidInvoices) {
          rememberCanonicalCustomerName(row.customerId, row.customerName);
        }
        const salesInvoiceHeaderDelegate = (prisma as any).salesInvoiceHeaderSnapshot;
        if (salesInvoiceHeaderDelegate?.findFirst && salesInvoiceHeaderDelegate?.findMany) {
          const latestSalesHeaderSnapshot = await salesInvoiceHeaderDelegate.findFirst({
            where: {
              companyId,
              frequency: arFrequencyForQuery,
              snapshotDate: { lte: endDate },
            },
            orderBy: [{ snapshotDate: 'desc' }],
            select: { snapshotDate: true },
          });
          if (latestSalesHeaderSnapshot?.snapshotDate) {
            const salesHeaderRows = await salesInvoiceHeaderDelegate.findMany({
              where: {
                companyId,
                frequency: arFrequencyForQuery,
                snapshotDate: latestSalesHeaderSnapshot.snapshotDate,
                customerId: { not: null },
                customerName: { not: null },
              },
              select: {
                customerId: true,
                customerName: true,
              },
              take: 100000,
            });
            for (const row of salesHeaderRows as any[]) {
              rememberCanonicalCustomerName(row.customerId, row.customerName);
            }
          }
        }
        const resolvedCustomerName = (customerId: unknown, customerName: unknown): string => {
          const cid = String(customerId || '').trim();
          if (cid && canonicalCustomerNameById.has(cid)) return canonicalCustomerNameById.get(cid)!;
          return normalizeCustomerName(customerName, cid);
        };

        unpaidByCustomer = unpaidByCustomer.map((row) => {
          const contract =
            contractStatusByCustomer.get(buildCustomerGroupKey(row.customerId, row.customerName)) ||
            contractStatusByCustomer.get(`name:${normalizeText(row.customerName)}`);
          const orderContract =
            orderContractByCustomerId.get(normalizeText(row.customerId)) ||
            orderContractByCustomerName.get(row.customerName) ||
            orderContractByNormalizedName.get(normalizeText(row.customerName));
          const paid = paidByCustomerId.get(String(row.customerId || '').trim()) || paidByCustomerName.get(row.customerName);
          const cashCollected = Number(contract?.cashCollectedToDate ?? paid?.cashCollectedToDate ?? 0);
          const invoicedRevenue = Number(orderContract?.invoicedRevenue ?? contract?.invoicedRevenue ?? row.totalDue + cashCollected);
          const contractValueTotal = Number(
            orderContract?.contractValueTotal ??
              contract?.contractValueTotal ??
              0
          );
          const remainingToInvoice = Number(
            orderContract?.remainingToInvoice ??
              contract?.remainingToInvoice ??
              (contractValueTotal > 0 ? Math.max(contractValueTotal - invoicedRevenue, 0) : 0)
          );
          return {
            ...row,
            customerName: resolvedCustomerName(row.customerId, row.customerName),
            contractValueTotal,
            remainingToInvoice,
            accruedRevenueUnbilled: Number(orderContract?.accruedRevenueUnbilled ?? contract?.accruedRevenueUnbilled ?? 0),
            invoicedRevenue,
            cashCollectedToDate: cashCollected,
            lastPaymentDate: contract?.lastPaymentDate || paid?.lastPaymentDate || null,
          };
        });
        unpaidInvoices = unpaidInvoices.map((row) => ({
          ...row,
          customerName: resolvedCustomerName(row.customerNumber, row.customerName),
        }));
        customerInvoices = customerInvoices.map((row) => ({
          ...row,
          customerName: resolvedCustomerName(row.customerId, row.customerName),
        }));
        paidInvoices = paidInvoices.map((row) => ({
          ...row,
          customerName: resolvedCustomerName(row.customerId, row.customerName),
        }));
        if (unpaidByCustomer.length === 0 && contractStatusByCustomer.size > 0) {
          unpaidByCustomer = Array.from(contractStatusByCustomer.values())
            .map((row) => ({
              customerId: row.customerId || '-',
              customerName: row.customerName,
              current: 0,
              days1to30: 0,
              days31to60: 0,
              days61to90: 0,
              days90plus: 0,
              // Do not treat billed/invoiced revenue as open AR.
              // If we have no valid open-AR rows for the snapshot, keep open AR at zero.
              totalDue: 0,
              contractValueTotal: Number(row.contractValueTotal || 0),
              remainingToInvoice: Number(row.remainingToInvoice || 0),
              accruedRevenueUnbilled: Number(row.accruedRevenueUnbilled || 0),
              invoicedRevenue: Number(row.invoicedRevenue || 0),
              cashCollectedToDate: Number(row.cashCollectedToDate || 0),
              lastPaymentDate: row.lastPaymentDate || null,
            }))
            .sort((a, b) => Number(b.totalDue || 0) - Number(a.totalDue || 0))
            .slice(0, 500);
        }

        const originMapDelegate = (prisma as any).aRInvoiceOriginMap;
        const originByInvoiceAndCustomer = new Map<string, string>();
        const originByInvoiceOnly = new Map<string, string>();
        if (originMapDelegate?.findMany && invoiceClassificationRows.length > 0) {
          const invoiceNos = Array.from(
            new Set(invoiceClassificationRows.map((row) => normalizeInvoiceNo(row.invoiceNo)).filter(Boolean))
          );
          if (invoiceNos.length > 0) {
            const originRows = await originMapDelegate.findMany({
              where: {
                companyId,
                invoiceNoNormalized: { in: invoiceNos },
              },
              select: {
                invoiceNoNormalized: true,
                customerId: true,
                sourceClass: true,
                lastSeenAt: true,
              },
              orderBy: [{ lastSeenAt: 'desc' }],
              take: Math.max(invoiceNos.length * 4, 2000),
            });
            for (const row of originRows as any[]) {
              const inv = normalizeInvoiceNo(row.invoiceNoNormalized);
              const cust = String(row.customerId || '').trim();
              const sourceClass = String(row.sourceClass || 'UNKNOWN');
              if (inv && cust && !originByInvoiceAndCustomer.has(`${inv}|${cust}`)) {
                originByInvoiceAndCustomer.set(`${inv}|${cust}`, sourceClass);
              }
              if (inv && !originByInvoiceOnly.has(inv)) {
                originByInvoiceOnly.set(inv, sourceClass);
              }
            }
          }
        }
        const resolveSourceClass = (invoiceNo: unknown, customerId: unknown): string => {
          const inv = normalizeInvoiceNo(invoiceNo);
          const cust = String(customerId || '').trim();
          if (!inv) return 'UNKNOWN';
          const direct = originByInvoiceAndCustomer.get(`${inv}|${cust}`);
          if (direct) return direct;
          return originByInvoiceOnly.get(inv) || 'UNKNOWN';
        };
        customerInvoices = customerInvoices.map((row) => ({
          ...row,
          sourceClass: resolveSourceClass(row.invoiceNo, row.customerId || null),
        }));
        const sourceClassTotals = invoiceClassificationRows.reduce(
          (acc, row) => {
            const amount = Number(row.amountDueHome || 0);
            if (!Number.isFinite(amount) || amount <= 0) return acc;
            const sourceClass = resolveSourceClass(row.invoiceNo, row.customerId).toUpperCase();
            if (sourceClass === 'CONTRACT') {
              acc.contractAR += amount;
            } else if (sourceClass === 'NON_CONTRACT') {
              acc.nonContractAR += amount;
            } else {
              acc.unknownSourceAR += amount;
            }
            return acc;
          },
          { contractAR: 0, nonContractAR: 0, unknownSourceAR: 0 }
        );

        if (shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'ar-aging',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        // When the AR aging-rule helper (Infor CSI) was applied to the trend,
        // also override the latest-snapshot totals so the summary cards line
        // up with the trend chart. Bucket dollars are rescaled proportionally
        // (snapshot data carries the relative aging mix).
        if (arGlAnchorApplied && arGlAnchorLatestTotal > 0) {
          const oldLatestTotal = Number(latestOpenTotals.totalAR || 0);
          if (oldLatestTotal > 0) {
            const scale = arGlAnchorLatestTotal / oldLatestTotal;
            latestOpenTotals = {
              totalAR: arGlAnchorLatestTotal,
              current: Number(latestOpenTotals.current || 0) * scale,
              days1to30: Number(latestOpenTotals.days1to30 || 0) * scale,
              days31to60: Number(latestOpenTotals.days31to60 || 0) * scale,
              days61to90: Number(latestOpenTotals.days61to90 || 0) * scale,
              days90plus: Number(latestOpenTotals.days90plus || 0) * scale,
              dsoWeightedDaysNumerator: Number(latestOpenTotals.dsoWeightedDaysNumerator || 0) * scale,
              dsoWeightedDaysDenominator: Number(latestOpenTotals.dsoWeightedDaysDenominator || 0) * scale,
            };
            unpaidByCustomer = unpaidByCustomer.map((row: any) => ({
              ...row,
              current: Number(row.current || 0) * scale,
              days1to30: Number(row.days1to30 || 0) * scale,
              days31to60: Number(row.days31to60 || 0) * scale,
              days61to90: Number(row.days61to90 || 0) * scale,
              days90plus: Number(row.days90plus || 0) * scale,
              totalDue: Number(row.totalDue || 0) * scale,
            }));
          } else {
            latestOpenTotals = {
              totalAR: arGlAnchorLatestTotal,
              current: arGlAnchorLatestTotal,
              days1to30: 0,
              days31to60: 0,
              days61to90: 0,
              days90plus: 0,
              dsoWeightedDaysNumerator: 0,
              dsoWeightedDaysDenominator: 0,
            };
          }
        }

        const derivedTotals = unpaidByCustomer.reduce(
          (acc, row) => {
            acc.totalAR += Number(row.totalDue || 0);
            acc.current += Number(row.current || 0);
            acc.days1to30 += Number(row.days1to30 || 0);
            acc.days31to60 += Number(row.days31to60 || 0);
            acc.days61to90 += Number(row.days61to90 || 0);
            acc.days90plus += Number(row.days90plus || 0);
            return acc;
          },
          { totalAR: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
        );
        const summaryTotals =
          latestOpenTotals.totalAR > 0
            ? latestOpenTotals
            : {
                totalAR: Number(derivedTotals.totalAR || 0),
                current: Number(derivedTotals.current || 0),
                days1to30: Number(derivedTotals.days1to30 || 0),
                days31to60: Number(derivedTotals.days31to60 || 0),
                days61to90: Number(derivedTotals.days61to90 || 0),
                days90plus: Number(derivedTotals.days90plus || 0),
                dsoWeightedDaysNumerator: 0,
                dsoWeightedDaysDenominator: 0,
              };
        const totalARForPct = Number(summaryTotals.totalAR || 0);
        // Standard bucket naming:
        // current<=0, days1to30=1-30, days31to60=31-60, days61to90=61-90, days90plus=>90
        const over30Amount = Number(
          summaryTotals.days31to60 + summaryTotals.days61to90 + summaryTotals.days90plus
        );
        const currentPct = totalARForPct > 0 ? (Number(summaryTotals.current) / totalARForPct) * 100 : 0;
        const over30Pct = totalARForPct > 0 ? (over30Amount / totalARForPct) * 100 : 0;
        const over90Pct =
          totalARForPct > 0
            ? (Number(summaryTotals.days90plus) / totalARForPct) * 100
            : 0;
        const dso =
          summaryTotals.dsoWeightedDaysDenominator > 0
            ? summaryTotals.dsoWeightedDaysNumerator / summaryTotals.dsoWeightedDaysDenominator
            : calculateDSO(data);

        // Weighted AR Age (days):
        //   Σ ( open_balance × max(0, today - dueDate) ) / Σ open_balance
        // Computed server-side via SQL across the full latest snapshot (no row
        // cap). Current/not-yet-due invoices contribute 0 to the numerator but
        // still count in the denominator, so a healthy current book pulls the
        // weighted age down toward 0. Falls back to invoiceDate when dueDate
        // is missing (matches the bucket logic).
        let weightedArAgeDays = 0;
        try {
          const weightedAgeSnapshot = await (prisma as any).aROpenInvoiceSnapshot?.findFirst({
            where: { companyId, frequency: arFrequencyForQuery },
            orderBy: { snapshotDate: 'desc' },
            select: { snapshotDate: true },
          });
          if (weightedAgeSnapshot?.snapshotDate) {
            const weightedAgeRows = await prisma.$queryRaw<
              Array<{ weighted_age_days: number | null }>
            >`
              SELECT
                CASE
                  WHEN SUM("amountDueHome") > 0 THEN
                    SUM(
                      "amountDueHome" * GREATEST(
                        0,
                        EXTRACT(EPOCH FROM (
                          CURRENT_DATE - COALESCE("dueDate"::date, "invoiceDate"::date)
                        )) / 86400
                      )
                    ) / SUM("amountDueHome")
                  ELSE 0
                END::double precision AS "weighted_age_days"
              FROM "AROpenInvoiceSnapshot"
              WHERE "companyId" = ${companyId}
                AND "frequency" = ${arFrequencyForQuery}
                AND "snapshotDate" = ${weightedAgeSnapshot.snapshotDate}
                AND COALESCE("amountDueHome", 0) > 0
                AND COALESCE("dueDate", "invoiceDate") IS NOT NULL
            `;
            weightedArAgeDays = Number(weightedAgeRows?.[0]?.weighted_age_days ?? 0) || 0;
          }
        } catch {
          weightedArAgeDays = 0;
        }

        // True DSO series, anchored to DailyFinancialSnapshot (the same trusted
        // feed Daily Financials and Working Capital read from). This replaces
        // the legacy weighted-invoice-age value (which was mislabeled as "DSO"
        // and never populated per-day, so the Pulse Preview sparkline showed a
        // flat 0.0 line). Falls back to the legacy `dso` computed above only
        // when DFS has no rows in this window.
        let dsoSummaryFromDaily: number | null = null;
        const dsoByDateKey = new Map<string, number>();
        try {
          const dsoSeries = await computeDsoSeriesFromDaily({
            companyId,
            startDate,
            endDate,
            lookbackDays: 90,
            frequency: 'daily',
          });
          for (const point of dsoSeries) {
            dsoByDateKey.set(point.snapshotDate, Number(point.dso || 0));
          }
          if (dsoSeries.length > 0) {
            dsoSummaryFromDaily = Number(dsoSeries[dsoSeries.length - 1].dso || 0);
          }
        } catch {
          // best-effort: leave Pulse on the legacy fallback rather than 500
        }
        const dsoYyyyMmDd = (val: any): string => {
          const d = new Date(val);
          if (Number.isNaN(d.getTime())) return '';
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };
        const dataWithDso = Array.isArray(data)
          ? data.map((row: any) => {
              if (!row || typeof row !== 'object') return row;
              const key = dsoYyyyMmDd(row.snapshotDate ?? row.snapshotTs);
              if (!key) return row;
              if (!dsoByDateKey.has(key)) return row;
              return { ...row, dso: dsoByDateKey.get(key) };
            })
          : data;
        const summaryDso =
          dsoSummaryFromDaily !== null && Number.isFinite(dsoSummaryFromDaily)
            ? dsoSummaryFromDaily
            : Number(dso || 0);

        return cacheOperationalPayload({
          records: dataWithDso,
          summary: {
            totalAR: Number(summaryTotals.totalAR || 0),
            totalOpenAR: Number(summaryTotals.totalAR || 0),
            contractAR: Number(sourceClassTotals.contractAR || 0),
            nonContractAR: Number(sourceClassTotals.nonContractAR || 0),
            unknownSourceAR: Number(sourceClassTotals.unknownSourceAR || 0),
            currentPct: Number(currentPct),
            over30Pct: Number(over30Pct),
            over90Pct: Number(over90Pct),
            dso: Number(summaryDso || 0),
            weightedArAgeDays: Number(weightedArAgeDays || 0),
            breakdown: unpaidByCustomer,
            unpaidByCustomer,
            unpaidInvoices,
            paidInvoices,
            customerInvoices,
          },
        });

      case 'ap-aging':
        // AP aging uses voucher-level facts (APTransactionFact + APAgingSnapshot) anchored on
        // DistDate, which is the correct financial date for vouchers and is unaffected by the
        // GL-side ControlPeriod limitation. The ?type=ap account-balance roll-forward (case 'ap'
        // above) is the surface that carries the documented drift.
        // See docs/AP_RECONCILIATION_KNOWN_LIMITATIONS.md
        // Get AP aging data
        const apFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          isQuickBooksCompany && frequency !== 'monthly' ? 'monthly' : frequency;
        const apOpenRowCap = Math.max(limit * 50, 5000);
        data = await prisma.aPAgingSnapshot.findMany({
          where: {
            companyId,
            frequency: apFrequencyForQuery,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Fallback: derive AP trend from real daily financial snapshots when AP aging snapshots are unavailable.
        // This keeps AP page reports populated with real data in tenants where AP IDOs are not exposed.
        if (!data.length && !isQuickBooksCompany) {
          const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
          const fallbackDaily = dailySnapshotDelegate
            ? await dailySnapshotDelegate.findMany({
                where: {
                  companyId,
                  frequency: 'daily',
                  snapshotDate: dateFilter,
                },
                orderBy: { snapshotDate: 'asc' },
                select: {
                  snapshotDate: true,
                  ap: true,
                },
                take: Math.max(limit * 10, 1500),
              })
            : [];
          if (fallbackDaily.length) {
            const toPeriodKey = (dt: Date): string => {
              const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
              if (frequency === 'monthly') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
              if (frequency === 'weekly') {
                const day = d.getUTCDay(); // 0=Sun ... 6=Sat
                const diffToMonday = day === 0 ? -6 : 1 - day;
                const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
                return `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`;
              }
              return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            };
            const periodLatest = new Map<string, { snapshotDate: Date; ap: number }>();
            for (const row of fallbackDaily) {
              const key = toPeriodKey(new Date(row.snapshotDate));
              const existing = periodLatest.get(key);
              const next = { snapshotDate: new Date(row.snapshotDate), ap: Number(row.ap || 0) };
              if (!existing || next.snapshotDate.getTime() > existing.snapshotDate.getTime()) {
                periodLatest.set(key, next);
              }
            }
            data = Array.from(periodLatest.values())
              .sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime())
              .slice(0, limit)
              .map((row) => ({
                snapshotDate: row.snapshotDate,
                frequency,
                totalAP: row.ap,
                current: row.ap,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
              })) as any;
          }
        }

        // Calculate aging trends (may be replaced when GL TB anchor is applied below).
        let latestAP = data[0];
        let apMetrics = latestAP
          ? {
              totalAP: latestAP.totalAP,
              currentPct: latestAP.totalAP > 0 ? (latestAP.current / latestAP.totalAP) * 100 : 0,
              over30Pct:
                latestAP.totalAP > 0
                  ? ((latestAP.days31to60 + latestAP.days61to90 + latestAP.days90plus) /
                      latestAP.totalAP) *
                    100
                  : 0,
              over90Pct: latestAP.totalAP > 0 ? (latestAP.days90plus / latestAP.totalAP) * 100 : 0,
              dpo: calculateDPO(data), // Days Payable Outstanding estimate
            }
          : null;

        let unpaidByVendor: Array<{
          vendorName: string;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
          totalDue: number;
        }> = [];
        let unpaidBills: Array<{
          vendorName: string;
          billNo: string;
          date: string | null;
          dueDate: string | null;
          amountDue: number;
        }> = [];
        let vendorBills: Array<{
          vendorName: string;
          billNo: string;
          date: string | null;
          dueDate: string | null;
          currency: string;
          amountCurrency: number;
          amountHome: number;
          amountDueHome: number;
        }> = [];
        let paidBills: Array<{
          vendorName: string;
          currentMonth: number;
          lastMonth: number;
          last12Months: number;
        }> = [];
        let computedApFromOpen: {
          totalAP: number;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
        } | null = null;

        const latestOpenBillsSnapshotDate = await (prisma as any).aPOpenBillSnapshot.findFirst({
          where: {
            companyId,
            frequency: apFrequencyForQuery,
            snapshotDate: dateFilter,
          },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });

        if (latestOpenBillsSnapshotDate?.snapshotDate) {
          const OPEN_AMOUNT_EPSILON = 1;
          const asOfDateForBuckets = startOfUtcDay(new Date(latestOpenBillsSnapshotDate.snapshotDate));

          // Display list rows (top exposure only) remain capped.
          const openBillRowsTop = await (prisma as any).aPOpenBillSnapshot.findMany({
            where: {
              companyId,
              frequency: apFrequencyForQuery,
              snapshotDate: latestOpenBillsSnapshotDate.snapshotDate,
              amountDueHome: { gt: OPEN_AMOUNT_EPSILON },
            },
            orderBy: [{ amountDueHome: 'desc' }],
            take: Math.max(limit, 500),
          });
          const summaryAndUnpaidRows = openBillRowsTop.map((row: any) => ({
            ...row,
            netAmountDueHome: Math.max(Number(row.amountDueHome || 0), 0),
          }));

          // Full-day vendor aggregation for correctness (not row-capped).
          const vendorAgingRows = await prisma.$queryRaw<
            Array<{
              vendorName: string;
              current: number;
              days1to30: number;
              days31to60: number;
              days61to90: number;
              days90plus: number;
              totalDue: number;
            }>
          >`
            WITH bills AS (
              SELECT
                COALESCE(NULLIF(TRIM("vendorName"), ''), 'Unknown Vendor') AS "vendorName",
                COALESCE("amountDueHome", 0)::double precision AS "amountDueHome",
                COALESCE("dueDate"::date, "billDate"::date) AS "ageBasisDate"
              FROM "APOpenBillSnapshot"
              WHERE "companyId" = ${companyId}
                AND "frequency" = ${apFrequencyForQuery}
                AND "snapshotDate" = ${latestOpenBillsSnapshotDate.snapshotDate}
                AND COALESCE("amountDueHome", 0) > ${OPEN_AMOUNT_EPSILON}
            ),
            aged AS (
              SELECT
                "vendorName",
                "amountDueHome",
                CASE
                  WHEN "ageBasisDate" IS NULL THEN 99999
                  ELSE GREATEST(0, (${asOfDateForBuckets}::date - "ageBasisDate"))
                END::int AS age_days
              FROM bills
            )
            SELECT
              "vendorName",
              SUM(CASE WHEN age_days < 0 THEN "amountDueHome" ELSE 0 END)::double precision AS "current",
              SUM(CASE WHEN age_days BETWEEN 0 AND 30 THEN "amountDueHome" ELSE 0 END)::double precision AS "days1to30",
              SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN "amountDueHome" ELSE 0 END)::double precision AS "days31to60",
              SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN "amountDueHome" ELSE 0 END)::double precision AS "days61to90",
              SUM(CASE WHEN age_days > 90 THEN "amountDueHome" ELSE 0 END)::double precision AS "days90plus",
              SUM("amountDueHome")::double precision AS "totalDue"
            FROM aged
            GROUP BY 1
            ORDER BY "totalDue" DESC
            LIMIT 25
          `;
          unpaidByVendor = vendorAgingRows.map((row) => ({
            vendorName: String(row.vendorName || 'Unknown Vendor'),
            current: Number(row.current || 0),
            days1to30: Number(row.days1to30 || 0),
            days31to60: Number(row.days31to60 || 0),
            days61to90: Number(row.days61to90 || 0),
            days90plus: Number(row.days90plus || 0),
            totalDue: Number(row.totalDue || 0),
          }));
          if (unpaidByVendor.length) {
            const apTotalsRows = await prisma.$queryRaw<
              Array<{ current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number; totalAP: number }>
            >`
              WITH bills AS (
                SELECT
                  COALESCE("amountDueHome", 0)::double precision AS "amountDueHome",
                  COALESCE("dueDate"::date, "billDate"::date) AS "ageBasisDate"
                FROM "APOpenBillSnapshot"
                WHERE "companyId" = ${companyId}
                  AND "frequency" = ${apFrequencyForQuery}
                  AND "snapshotDate" = ${latestOpenBillsSnapshotDate.snapshotDate}
                  AND COALESCE("amountDueHome", 0) > ${OPEN_AMOUNT_EPSILON}
              ),
              aged AS (
                SELECT
                  "amountDueHome",
                  CASE
                    WHEN "ageBasisDate" IS NULL THEN 99999
                    ELSE GREATEST(0, (${asOfDateForBuckets}::date - "ageBasisDate"))
                  END::int AS age_days
                FROM bills
              )
              SELECT
                SUM(CASE WHEN age_days < 0 THEN "amountDueHome" ELSE 0 END)::double precision AS "current",
                SUM(CASE WHEN age_days BETWEEN 0 AND 30 THEN "amountDueHome" ELSE 0 END)::double precision AS "days1to30",
                SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN "amountDueHome" ELSE 0 END)::double precision AS "days31to60",
                SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN "amountDueHome" ELSE 0 END)::double precision AS "days61to90",
                SUM(CASE WHEN age_days > 90 THEN "amountDueHome" ELSE 0 END)::double precision AS "days90plus",
                SUM("amountDueHome")::double precision AS "totalAP"
              FROM aged
            `;
            const apTotals = apTotalsRows[0];
            computedApFromOpen = apTotals
              ? {
                  totalAP: Number(apTotals.totalAP || 0),
                  current: Number(apTotals.current || 0),
                  days1to30: Number(apTotals.days1to30 || 0),
                  days31to60: Number(apTotals.days31to60 || 0),
                  days61to90: Number(apTotals.days61to90 || 0),
                  days90plus: Number(apTotals.days90plus || 0),
                }
              : null;
          }

          // Canonical AP trend replay from open vouchers is expensive on large tenants.
          // When AP aging snapshots already exist, prefer those records for trend speed.
          const shouldReplayCanonicalApTrend = data.length === 0;
          const trendOpenRows = shouldReplayCanonicalApTrend
            ? await (prisma as any).aPOpenBillSnapshot.findMany({
                where: {
                  companyId,
                  frequency: apFrequencyForQuery,
                  snapshotDate: dateFilter,
                },
                select: {
                  snapshotDate: true,
                  vendorName: true,
                  billNo: true,
                  amountDueHome: true,
                  billDate: true,
                  dueDate: true,
                },
                orderBy: [{ snapshotDate: 'asc' }],
                take: apOpenRowCap,
              })
            : [];
          if (trendOpenRows.length) {
            const rowsBySnapshot = new Map<string, Array<any>>();
            for (const row of trendOpenRows) {
              const dayKey = startOfUtcDay(new Date(row.snapshotDate)).toISOString();
              if (!rowsBySnapshot.has(dayKey)) rowsBySnapshot.set(dayKey, []);
              rowsBySnapshot.get(dayKey)!.push(row);
            }
            const snapshotKeysAsc = Array.from(rowsBySnapshot.keys()).sort();
            let expandedSnapshotKeysAsc = snapshotKeysAsc;
            if (frequency === 'daily' && snapshotKeysAsc.length > 0) {
              const rangeKeys: string[] = [];
              const cursor = startOfUtcDay(new Date(startDate));
              const rangeEnd = startOfUtcDay(new Date(endDate));
              while (cursor.getTime() <= rangeEnd.getTime()) {
                if (!isWeekendUtc(cursor)) {
                  rangeKeys.push(new Date(cursor).toISOString());
                }
                cursor.setUTCDate(cursor.getUTCDate() + 1);
              }
              if (rangeKeys.length) expandedSnapshotKeysAsc = rangeKeys;
            }
            const trendTemplateRows =
              snapshotKeysAsc.length > 0
                ? rowsBySnapshot.get(snapshotKeysAsc[snapshotKeysAsc.length - 1]) || []
                : [];
            const trendRowsAsc: Array<any> = [];
            for (const snapshotKey of expandedSnapshotKeysAsc) {
              const snapshotDate = new Date(snapshotKey);
              const rows = rowsBySnapshot.get(snapshotKey) || trendTemplateRows;
              const bucket = {
                snapshotDate,
                frequency: apFrequencyForQuery,
                totalAP: 0,
                current: 0,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
              };
              for (const row of rows) {
                const grossAmount = Number(row.amountDueHome || 0);
                if (!Number.isFinite(grossAmount) || grossAmount <= 0) continue;
                const openAmount = Math.max(grossAmount, 0);
                if (openAmount <= OPEN_AMOUNT_EPSILON) continue;
                const parseDateCandidate = (value: any): Date | null => {
                  if (!value) return null;
                  const dt = new Date(value);
                  return Number.isNaN(dt.getTime()) ? null : dt;
                };
                const ageBasis = parseDateCandidate(row.dueDate) ?? parseDateCandidate(row.billDate);
                const ageDays =
                  ageBasis && !Number.isNaN(ageBasis.getTime())
                    ? Math.floor((snapshotDate.getTime() - startOfUtcDay(ageBasis).getTime()) / (24 * 60 * 60 * 1000))
                    : 99999;
                bucket.totalAP += openAmount;
                // Standard 5-bucket scheme: <0 = Current; 0-30 = 1-30; etc.
                if (ageDays < 0) bucket.current += openAmount;
                else if (ageDays <= 30) bucket.days1to30 += openAmount;
                else if (ageDays <= 60) bucket.days31to60 += openAmount;
                else if (ageDays <= 90) bucket.days61to90 += openAmount;
                else bucket.days90plus += openAmount;
              }
              trendRowsAsc.push(bucket);
            }
            data = trendRowsAsc
              .sort((a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime())
              .slice(0, limit) as any;
          }

          unpaidBills = summaryAndUnpaidRows
            .map((row: any) => ({
              vendorName: row.vendorName || 'Unknown Vendor',
              billNo: row.billNo || '-',
              date: row.billDate ? new Date(row.billDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.netAmountDueHome || 0),
            }))
            .filter((row: any) => Number.isFinite(Number(row.amountDue || 0)) && Number(row.amountDue || 0) > OPEN_AMOUNT_EPSILON)
            .sort((a: any, b: any) => Number(b.amountDue || 0) - Number(a.amountDue || 0))
            .slice(0, 500);

          vendorBills = summaryAndUnpaidRows
            .map((row: any) => ({
              vendorName: row.vendorName || 'Unknown Vendor',
              billNo: row.billNo || '-',
              date: row.billDate ? new Date(row.billDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              currency: row.currencyCode || 'USD',
              amountCurrency: Number(row.amountCurrency || row.amountHome || 0),
              amountHome: Number(row.amountHome || row.amountDueHome || 0),
              amountDueHome: Number(row.netAmountDueHome || 0),
            }))
            .sort((a: any, b: any) => b.amountDueHome - a.amountDueHome)
            .slice(0, 500);
        }

        const apMonthStart = startOfMonth(endDate);
        const apLastMonthStart = addMonths(apMonthStart, -1);
        const apTrailing12Start = addMonths(apMonthStart, -11);

        // Aggregate "Paid Bills by Vendor" via SQL with two key adjustments:
        //
        //   1. Drop $0 rows. Infor's SLAptrxps stream emits voucher-header
        //      records (no actual payment amount) into APPaymentFact. Including
        //      them inflates the vendor list with rows where every column reads
        //      "$0".
        //
        //   2. Collapse natural-key duplicates (vendorName, paymentDate,
        //      billNo, paidAmountHome). The Infor sync reinserts payment
        //      events on every run with no unique constraint to suppress
        //      copies; one production company had 25,222 identical copies of
        //      a single FedEx event. Aggregating in JS over a row-capped
        //      findMany also truncated 12-month totals into "looks like the
        //      last 1-2 months". Doing the dedup + bucketed sums in a single
        //      SQL pass eliminates both problems and removes the previous
        //      take=2000 ceiling.
        const aggregatedPaidBills = await prisma.$queryRaw<
          Array<{
            vendorName: string;
            currentMonth: number;
            lastMonth: number;
            last12Months: number;
          }>
        >`
          WITH dedup AS (
            SELECT
              "vendorName",
              "paymentDate",
              COALESCE("billNo", '') AS "billNo",
              "paidAmountHome"
            FROM "APPaymentFact"
            WHERE "companyId" = ${companyId}
              AND "paymentDate" >= ${apTrailing12Start}
              AND "paymentDate" <= ${endDate}
              AND "paidAmountHome" <> 0
            GROUP BY "vendorName", "paymentDate", "billNo", "paidAmountHome"
          )
          SELECT
            "vendorName",
            COALESCE(SUM(CASE WHEN "paymentDate" >= ${apMonthStart} AND "paymentDate" <= ${endDate}
                              THEN "paidAmountHome" ELSE 0 END), 0)::float8 AS "currentMonth",
            COALESCE(SUM(CASE WHEN "paymentDate" >= ${apLastMonthStart} AND "paymentDate" < ${apMonthStart}
                              THEN "paidAmountHome" ELSE 0 END), 0)::float8 AS "lastMonth",
            COALESCE(SUM("paidAmountHome"), 0)::float8 AS "last12Months"
          FROM dedup
          GROUP BY "vendorName"
          ORDER BY "last12Months" DESC
          LIMIT 25
        `;

        if (aggregatedPaidBills.length) {
          paidBills = aggregatedPaidBills.map((row) => ({
            vendorName: String(row.vendorName || 'Unknown Vendor'),
            currentMonth: Number(row.currentMonth || 0),
            lastMonth: Number(row.lastMonth || 0),
            last12Months: Number(row.last12Months || 0),
          })) as any[];
        }

        // Fallback vendor/AP detail from mapped AP lines when AP open-bill/payment facts are unavailable.
        if ((!unpaidByVendor.length || !vendorBills.length) && !isQuickBooksCompany) {
          const mappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
          const latestMappedDate = mappedLineDelegate
            ? await mappedLineDelegate.findFirst({
                where: {
                  companyId,
                  frequency: 'daily',
                  targetField: 'ap',
                  snapshotDate: dateFilter,
                },
                select: { snapshotDate: true },
                orderBy: { snapshotDate: 'desc' },
              })
            : null;
          if (latestMappedDate?.snapshotDate && mappedLineDelegate) {
            const mappedLines = await mappedLineDelegate.findMany({
              where: {
                companyId,
                frequency: 'daily',
                targetField: 'ap',
                snapshotDate: latestMappedDate.snapshotDate,
              },
              orderBy: [{ amount: 'desc' }],
              take: Math.max(limit, 500),
            });
            const grouped = new Map<string, number>();
            for (const row of mappedLines) {
              const vendorName = String(row.sourceAccountName || 'Unknown Vendor').trim() || 'Unknown Vendor';
              const amount = Number(row.amount || 0);
              grouped.set(vendorName, Number(grouped.get(vendorName) || 0) + amount);
            }
            const derived = Array.from(grouped.entries())
              .map(([vendorName, totalDue]) => ({
                vendorName,
                current: totalDue,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
                totalDue,
              }))
              .sort((a, b) => b.totalDue - a.totalDue);
            if (!unpaidByVendor.length) unpaidByVendor = derived.slice(0, 25);
            if (!vendorBills.length) {
              vendorBills = derived.slice(0, 500).map((row, idx) => ({
                vendorName: row.vendorName,
                billNo: `AP-${idx + 1}`,
                date: latestMappedDate.snapshotDate.toISOString().slice(0, 10),
                dueDate: null,
                currency: 'USD',
                amountCurrency: Number(row.totalDue || 0),
                amountHome: Number(row.totalDue || 0),
                amountDueHome: Number(row.totalDue || 0),
              }));
            }
            // Do not synthesize unpaid bill rows from vendor totals.
            // The Unpaid Bills table must remain true bill-level open items only.
          }
        }

        let apGlAnchorApplied = false;
        const apAnchorCfgForTrend = getApBalanceSheetAnchorConfig(companyId);
        if (isInforGlCompany && apAnchorCfgForTrend) {
          const anchorAccountForTrend = apAnchorCfgForTrend.accounts[0];
          // Trend uses the same 150-day aging-rule derivation as the main
          // 'ap' case below — see comment there for the rationale and
          // validation evidence. This replaced an anchor-roll-forward that
          // accumulated orphan-payment leakage and produced impossible
          // (negative) AP balances on recent dates.
          const dailyGlAp = await buildDailyApSeriesByAgingRule(
            prisma,
            companyId,
            anchorAccountForTrend.accountId,
            anchorAccountForTrend.accountName || 'Accounts Payable',
            anchorAccountForTrend.accountNumber || anchorAccountForTrend.accountId,
            startDate,
            endDate,
            150
          );
          if (dailyGlAp.length > 0) {
            // Hold the full per-day metric record so we can pick the
            // latest day per reporting period (week / month) for the
            // Payment Cadence chart, AP aging trend chart, and KPIs.
            // All of these are now sourced from the same SQL pass in
            // buildDailyApSeriesByAgingRule and use the termsCode
            // cascade for dueDate, so every column ties to every other.
            type DailyApRecord = {
              snapshotDate: Date;
              apBalance: number;
              current: number;
              days1to30: number;
              days31to60: number;
              days61to90: number;
              days90plus: number;
              over30Pct: number;
              over90Pct: number;
              dpo: number;
            };
            const glApRecordByDay = new Map<string, DailyApRecord>();
            for (const row of dailyGlAp) {
              const k = dateKeyUtc(new Date(row.snapshotDate));
              glApRecordByDay.set(k, {
                snapshotDate: new Date(row.snapshotDate),
                apBalance: Number(row.apBalance || 0),
                current: Number(row.current || 0),
                days1to30: Number(row.days1to30 || 0),
                days31to60: Number(row.days31to60 || 0),
                days61to90: Number(row.days61to90 || 0),
                days90plus: Number(row.days90plus || 0),
                over30Pct: Number(row.over30Pct || 0),
                over90Pct: Number(row.over90Pct || 0),
                dpo: Number(row.dpo || 0),
              });
            }
            if (glApRecordByDay.size > 0) {
                apGlAnchorApplied = true;
                const toPeriodKeyFromDayKey = (dayKey: string): string => {
                  const [y, m, d] = dayKey.split('-').map((x) => Number(x));
                  const cal = new Date(Date.UTC(y, m - 1, d));
                  if (frequency === 'monthly') {
                    return `${cal.getUTCFullYear()}-${String(cal.getUTCMonth() + 1).padStart(2, '0')}`;
                  }
                  if (frequency === 'weekly') {
                    const day = cal.getUTCDay();
                    const diffToMonday = day === 0 ? -6 : 1 - day;
                    const weekStart = new Date(
                      Date.UTC(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate() + diffToMonday)
                    );
                    return `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`;
                  }
                  return dayKey;
                };
                const periodLatestGl = new Map<string, DailyApRecord>();
                for (const dayKey of Array.from(glApRecordByDay.keys()).sort()) {
                  const rec = glApRecordByDay.get(dayKey)!;
                  const pk = toPeriodKeyFromDayKey(dayKey);
                  const existing = periodLatestGl.get(pk);
                  if (!existing || rec.snapshotDate.getTime() > existing.snapshotDate.getTime()) {
                    periodLatestGl.set(pk, rec);
                  }
                }
                data = Array.from(periodLatestGl.values())
                  .sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime())
                  .slice(0, limit)
                  .map((rec) => ({
                    snapshotDate: rec.snapshotDate,
                    frequency: apFrequencyForQuery,
                    totalAP: rec.apBalance,
                    current: rec.current,
                    days1to30: rec.days1to30,
                    days31to60: rec.days31to60,
                    days61to90: rec.days61to90,
                    days90plus: rec.days90plus,
                    over30Pct: rec.over30Pct,
                    over90Pct: rec.over90Pct,
                    dpo: rec.dpo,
                  })) as any;
                latestAP = data[0];
                apMetrics = latestAP
                  ? {
                      totalAP: latestAP.totalAP,
                      currentPct:
                        latestAP.totalAP > 0 ? (latestAP.current / latestAP.totalAP) * 100 : 0,
                      over30Pct: Number(latestAP.over30Pct || 0),
                      over90Pct: Number(latestAP.over90Pct || 0),
                      // Use the per-day DPO computed from real 90-day rolling
                      // credit purchases (transType='V' on the same apAcct).
                      // The legacy calculateDPO() helper just returned ~30 by
                      // construction, so it can't be trusted here.
                      dpo: Number(latestAP.dpo || 0),
                    }
                  : apMetrics;

                // Per-vendor breakdown sourced from the SAME APTransactionFact
                // voucher-level data the trend chart trusts. This guarantees
                // that SUM(unpaidByVendor.totalDue) ties to the latest trend
                // chart total, because both come from the same SQL on the same
                // apAcct over the same aging window. Buckets here are based on
                // (asOfDate - derivedDueDate). dueDate is derived inside
                // buildOpenVouchersByAgingRule via the cascade voucher.termsCode
                // → vendor.termsCode → N30 default, applied to invoiceDate
                // (or voucherCreatedAt if invoiceDate is missing).
                if (latestAP) {
                  try {
                    const apAsOfDateForVendors = startOfUtcDay(new Date(latestAP.snapshotDate));
                    const openVouchers = await buildOpenVouchersByAgingRule(
                      prisma,
                      companyId,
                      anchorAccountForTrend.accountId,
                      apAsOfDateForVendors,
                      150
                    );
                    if (openVouchers.length > 0) {
                      const asOfMs = apAsOfDateForVendors.getTime();
                      type VendorAgg = {
                        vendorName: string;
                        current: number;
                        days1to30: number;
                        days31to60: number;
                        days61to90: number;
                        days90plus: number;
                        totalDue: number;
                      };
                      const vendorMap = new Map<string, VendorAgg>();
                      for (const v of openVouchers) {
                        const daysPastDue = Math.floor(
                          (asOfMs - startOfUtcDay(v.dueDate).getTime()) / 86400000
                        );
                        const amt = Number(v.openBalance || 0);
                        if (!Number.isFinite(amt) || amt <= 0) continue;
                        const key = v.vendorName || 'Unknown Vendor';
                        if (!vendorMap.has(key)) {
                          vendorMap.set(key, {
                            vendorName: key,
                            current: 0,
                            days1to30: 0,
                            days31to60: 0,
                            days61to90: 0,
                            days90plus: 0,
                            totalDue: 0,
                          });
                        }
                        const agg = vendorMap.get(key)!;
                        agg.totalDue += amt;
                        if (daysPastDue < 0) agg.current += amt;
                        else if (daysPastDue <= 30) agg.days1to30 += amt;
                        else if (daysPastDue <= 60) agg.days31to60 += amt;
                        else if (daysPastDue <= 90) agg.days61to90 += amt;
                        else agg.days90plus += amt;
                      }
                      unpaidByVendor = Array.from(vendorMap.values()).sort(
                        (a, b) => b.totalDue - a.totalDue
                      );

                      // Per-bill (per-voucher) list sourced from the same
                      // openVouchers rows. dueDate is the derived due date
                      // from the termsCode cascade so the Unpaid Bills table
                      // shows real (or vendor-default) dates and the Upcoming
                      // Due Calendar can schedule against them.
                      unpaidBills = openVouchers
                        .filter((v) => Number(v.openBalance || 0) > 0)
                        .sort((a, b) => Number(b.openBalance || 0) - Number(a.openBalance || 0))
                        .slice(0, 500)
                        .map((v) => ({
                          vendorName: v.vendorName || 'Unknown Vendor',
                          billNo: v.voucher,
                          invoiceNum: v.invoiceNum,
                          date: v.invoiceDate
                            ? v.invoiceDate.toISOString().slice(0, 10)
                            : v.voucherCreatedAt.toISOString().slice(0, 10),
                          dueDate: v.dueDate.toISOString().slice(0, 10),
                          // Source label for the dueDate cascade so the UI can
                          // show users which dates are real vs. derived from
                          // the N30 default fallback. Values look like
                          // 'voucher:N30', 'vendor:N45', or 'default:N30'.
                          dueDateSource: v.termsCodeUsed,
                          amountDue: Number(v.openBalance || 0),
                        }));

                      // vendorBills uses the same per-voucher source so the
                      // CA-AP per-vendor drilldowns also tie to the chart.
                      vendorBills = openVouchers
                        .filter((v) => Number(v.openBalance || 0) > 0)
                        .sort((a, b) => Number(b.openBalance || 0) - Number(a.openBalance || 0))
                        .slice(0, 500)
                        .map((v) => ({
                          vendorName: v.vendorName || 'Unknown Vendor',
                          billNo: v.voucher,
                          invoiceNum: v.invoiceNum,
                          date: v.invoiceDate
                            ? v.invoiceDate.toISOString().slice(0, 10)
                            : v.voucherCreatedAt.toISOString().slice(0, 10),
                          dueDate: v.dueDate.toISOString().slice(0, 10),
                          dueDateSource: v.termsCodeUsed,
                          currency: 'USD',
                          amountCurrency: Number(v.openBalance || 0),
                          amountHome: Number(v.openBalance || 0),
                          amountDueHome: Number(v.openBalance || 0),
                        }));
                    }
                  } catch (err) {
                    console.error('[ap-aging] per-vendor voucher rebuild failed', err);
                  }
                }
            }
          }
        }

        if (shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'ap-aging',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        // When the GL anchor is applied (Infor companies with an AP anchor
        // configured), the chart and KPIs share that single source of truth.
        // Only fall back to computedApFromOpen (APOpenBillSnapshot SQL) when
        // no GL anchor is in play — that's the case for QuickBooks tenants
        // and any company without an AP balance-sheet anchor configured.
        const effectiveApMetrics = apGlAnchorApplied
          ? apMetrics
          : computedApFromOpen
          ? {
              totalAP: Number(computedApFromOpen.totalAP || 0),
              currentPct:
                computedApFromOpen.totalAP > 0
                  ? (Number(computedApFromOpen.current || 0) / Number(computedApFromOpen.totalAP || 0)) * 100
                  : 0,
              over30Pct:
                computedApFromOpen.totalAP > 0
                  ? ((Number(computedApFromOpen.days31to60 || 0) +
                      Number(computedApFromOpen.days61to90 || 0) +
                      Number(computedApFromOpen.days90plus || 0)) /
                      Number(computedApFromOpen.totalAP || 0)) *
                    100
                  : 0,
              over90Pct:
                computedApFromOpen.totalAP > 0
                  ? (Number(computedApFromOpen.days90plus || 0) / Number(computedApFromOpen.totalAP || 0)) * 100
                  : 0,
              dpo: Number(apMetrics?.dpo || 0),
            }
          : apMetrics;

        return cacheOperationalPayload({
          records: data,
          summary: effectiveApMetrics
            ? {
                ...effectiveApMetrics,
                breakdown: unpaidByVendor,
                unpaidByVendor,
                unpaidBills,
                paidBills,
                vendorBills,
              }
            : apMetrics,
        });

      case 'products':
        // Get product sales data
        const isInforForProducts =
          normalizedAccountingSystem === 'INFOR_M3' || normalizedAccountingSystem === 'INFOR_CSI';
        const productFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          isInforForProducts && frequency !== 'daily' ? 'daily' : frequency;
        const productRowCap = Math.max(Math.min(boundedLimit * 10, 12000), 3000);
        data = await prisma.productSalesSnapshot.findMany({
          where: {
            companyId,
            frequency: productFrequencyForQuery,
            snapshotDate: dateFilter,
          },
          orderBy: [{ snapshotDate: 'desc' }, { itemName: 'asc' }],
          take: productRowCap,
        });
        data = data.sort(
          (a, b) =>
            new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime() ||
            String(a.itemName || '').localeCompare(String(b.itemName || ''))
        );
        const productWindowTruncated = data.length >= productRowCap;

        // Use the full selected window for product analytics. If we have any
        // meaningful rows, drop pure placeholder rows (Unknown Item + zero metrics)
        // so one noisy day cannot blank out all charts.
        const hasMeaningfulRows = data.some((row: any) => {
          const itemName = String(row?.itemName || '').trim().toLowerCase();
          const revenue = Number(row?.revenue || 0);
          const cogs = Number(row?.cogs || 0);
          const qty = Number(row?.quantitySold || 0);
          return itemName !== 'unknown item' || revenue !== 0 || cogs !== 0 || qty !== 0;
        });
        if (hasMeaningfulRows) {
          data = data.filter((row: any) => {
            const itemName = String(row?.itemName || '').trim().toLowerCase();
            const revenue = Number(row?.revenue || 0);
            const cogs = Number(row?.cogs || 0);
            const qty = Number(row?.quantitySold || 0);
            return !(itemName === 'unknown item' && revenue === 0 && cogs === 0 && qty === 0);
          });
        }

        // V1: enrich products with best-available operational signals so all product
        // reports are populated now (real data only, with explicit proxies).
        const productIsoDay = (value: Date | string): string => {
          const d = new Date(value);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };
        const canonicalProductKey = (value: unknown): string =>
          String(value || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
        const productKeyAliases = (row: any): string[] =>
          Array.from(
            new Set(
              [
                canonicalProductKey(row?.sku),
                canonicalProductKey(row?.itemId),
                canonicalProductKey(row?.itemName),
              ].filter(Boolean)
            )
          );
        const trimProductToken = (value: unknown): string => String(value || '').trim();
        const looksLikeItemCode = (value: string): boolean =>
          /[A-Za-z]/.test(value) || value.includes('-') || value.includes('/') || value.includes('_');
        const looksNumericOnly = (value: string): boolean => /^\d+$/.test(value);
        const normalizeProductIdentity = (row: any) => {
          const rawSku = trimProductToken(row?.sku);
          const rawItemId = trimProductToken(row?.itemId);
          const candidate = [rawSku, rawItemId].find((token) => token && looksLikeItemCode(token)) || '';
          if (candidate) {
            row.sku = candidate;
            if (!looksLikeItemCode(rawItemId)) row.itemId = candidate;
            return;
          }
          // No valid item-like identifier present: suppress numeric transaction/customer ids.
          if (looksNumericOnly(rawSku)) row.sku = null;
          if (looksNumericOnly(rawItemId)) row.itemId = null;
        };

        const recordsV1 = data.map((row: any) => ({
          ...row,
          quantitySold: Number(row?.quantitySold || 0),
          cogs: Number(row?.cogs || 0),
          freightAllocated: 0,
          otherRevenueAllocated: 0,
          returnsAmount: Number(row?.revenue || 0) < 0 ? Math.abs(Number(row?.revenue || 0)) : 0,
          isEstimatedCost: false,
        }));
        for (const row of recordsV1) normalizeProductIdentity(row);

        // Quantity fallback from order-line snapshots when product quantity is missing/zero.
        const productOrderLineDelegate = (prisma as any).customerOrderLineSnapshot;
        if (!productWindowTruncated && productOrderLineDelegate?.findMany) {
          const qtyRows = await productOrderLineDelegate.findMany({
            where: {
              companyId,
              frequency,
              snapshotDate: dateFilter,
            },
            select: {
              snapshotDate: true,
              itemId: true,
              itemName: true,
              sku: true,
              qtyInvoiced: true,
              unitPrice: true,
              contractValue: true,
              invoicedAmount: true,
            },
          });
          const qtyByDayAndKey = new Map<string, number>();
          for (const row of qtyRows) {
            // Some CSI streams provide shipped/value fields while invoiced qty stays zero.
            // Derive a conservative quantity proxy from line value when needed.
            const explicitQty = Math.max(0, Number(row.qtyInvoiced || 0));
            const unitPrice = Math.max(0, Number(row.unitPrice || 0));
            const valueBasis = Math.max(0, Number(row.invoicedAmount || 0), Number(row.contractValue || 0));
            const derivedQty = unitPrice > 0 && valueBasis > 0 ? valueBasis / unitPrice : 0;
            const qty = explicitQty > 0 ? explicitQty : derivedQty;
            if (!qty) continue;
            const day = productIsoDay(row.snapshotDate);
            const aliases = Array.from(
              new Set(
                [
                  canonicalProductKey(row.sku),
                  canonicalProductKey(row.itemId),
                  canonicalProductKey(row.itemName),
                ].filter(Boolean)
              )
            );
            for (const alias of aliases) {
              const mapKey = `${day}|${alias}`;
              qtyByDayAndKey.set(mapKey, Number(qtyByDayAndKey.get(mapKey) || 0) + qty);
            }
          }
          for (const row of recordsV1) {
            if (Number(row.quantitySold || 0) > 0) continue;
            const day = productIsoDay(row.snapshotDate);
            const qty = productKeyAliases(row)
              .map((alias) => Number(qtyByDayAndKey.get(`${day}|${alias}`) || 0))
              .find((n) => n > 0);
            if (qty && qty > 0) row.quantitySold = qty;
          }
        }

        // Cost proxy fallback from inventory avg cost when transactional cogs is missing/zero.
        const inventoryRows = productWindowTruncated
          ? []
          : await prisma.inventorySnapshot.findMany({
              where: {
                companyId,
                snapshotDate: dateFilter,
                frequency: { in: ['daily', frequency] },
              },
              select: {
                snapshotDate: true,
                itemId: true,
                itemName: true,
                sku: true,
                avgCost: true,
              },
            });
        const avgCostByDayAndKey = new Map<string, number>();
        const descriptionByKey = new Map<string, string>();
        const looksLikeCode = (value: string): boolean => /^[A-Z0-9\-_.\/]+$/.test(value.trim());
        for (const inv of inventoryRows) {
          const avgCost = Number(inv.avgCost || 0);
          const day = productIsoDay(inv.snapshotDate);
          const candidateDescription = String(inv.itemName || '').trim();
          const aliases = Array.from(
            new Set(
              [
                canonicalProductKey(inv.sku),
                canonicalProductKey(inv.itemId),
                canonicalProductKey(inv.itemName),
              ].filter(Boolean)
            )
          );
          for (const alias of aliases) {
            const mapKey = `${day}|${alias}`;
            if (avgCost > 0 && !avgCostByDayAndKey.has(mapKey)) avgCostByDayAndKey.set(mapKey, avgCost);
            if (candidateDescription) {
              const existing = String(descriptionByKey.get(mapKey) || '').trim();
              const existingScore =
                existing && !looksLikeCode(existing) ? 2 : existing ? 1 : 0;
              const candidateScore =
                !looksLikeCode(candidateDescription) ? 2 : 1;
              // Prefer human-readable inventory descriptions over code-like labels.
              if (candidateScore > existingScore) {
                descriptionByKey.set(mapKey, candidateDescription);
              }
            }
          }
        }
        for (const row of recordsV1) {
          const day = productIsoDay(row.snapshotDate);
          const preferredName = productKeyAliases(row)
            .map((alias) => String(descriptionByKey.get(`${day}|${alias}`) || '').trim())
            .find(Boolean);
          if (preferredName && preferredName.toLowerCase() !== 'unknown item') {
            row.itemName = preferredName;
          }
          const cogs = Number(row.cogs || 0);
          const qty = Math.max(0, Number(row.quantitySold || 0));
          const revenue = Number(row.revenue || 0);
          const avgCost = productKeyAliases(row)
            .map((alias) => Number(avgCostByDayAndKey.get(`${day}|${alias}`) || 0))
            .find((n) => n > 0);
          if (cogs <= 0 && qty > 0 && avgCost && avgCost > 0) {
            row.cogs = avgCost * qty;
            row.isEstimatedCost = true;
          } else if (qty <= 0 && (revenue !== 0 || cogs !== 0)) {
            // Comparison-safe fallback: when quantity is missing but revenue exists,
            // assign a synthetic single-unit row so price/cost deltas are not blank.
            // We still mark cost as estimated and use 0 when no proxy exists.
            row.quantitySold = 1;
            row.isEstimatedQuantity = true;
            if (avgCost && avgCost > 0) {
              row.cogs = avgCost;
              row.isEstimatedCost = true;
            }
          }
        }

        // Allocation bridge for freight + other-revenue proxy lines.
        //
        // Two complementary signal sources are consulted, both bucketed to
        // ISO weeks so freight/misc activity gets attached even when the
        // product snapshot calendar is sparser than the invoice calendar
        // (Atlantic, for example, posts product snapshots ~7 days in a 90-day
        // window while invoices land on ~50 days).
        //
        //   1. GL mapped lines (DailyFinancialMappedLine) for revenue-side
        //      accounts whose name or target bucket implies freight billed
        //      / scrap / misc / other revenue. This is the canonical path
        //      for any company whose chart of accounts cleanly separates
        //      these categories.
        //
        //   2. Raw invoice headers (InforRawRecord miProgram=SLInvHdrs).
        //      Infor CSI invoice headers carry per-invoice `Freight` and
        //      `MiscCharges` fields directly — that is the ground truth for
        //      customer-billed freight and misc revenue, and it is present
        //      regardless of how the GL accounts are mapped. Used as a
        //      per-week fallback when the GL bridge produces zero for that
        //      week (so we never double-count when both signals are
        //      available, but we never silently drop activity that lives
        //      only in the raw invoice payload either).
        const weekStartIsoOf = (value: Date | string): string => {
          const d = new Date(value);
          const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          const day = utc.getUTCDay();
          const diffToMonday = day === 0 ? -6 : 1 - day;
          utc.setUTCDate(utc.getUTCDate() + diffToMonday);
          return utc.toISOString().split('T')[0];
        };

        const productMappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
        if (!productWindowTruncated && productMappedLineDelegate?.findMany) {
          const mappedRows = await productMappedLineDelegate.findMany({
            where: {
              companyId,
              frequency,
              snapshotDate: dateFilter,
            },
            select: {
              snapshotDate: true,
              targetField: true,
              sourceAccountName: true,
              amount: true,
            },
          });
          const freightByWeek = new Map<string, number>();
          const otherRevenueByWeek = new Map<string, number>();
          for (const line of mappedRows) {
            const week = weekStartIsoOf(line.snapshotDate);
            const amount = Math.abs(Number(line.amount || 0));
            if (!Number.isFinite(amount) || amount === 0) continue;
            // Restrict the bridge to revenue-side accounts. Without this guard,
            // expense / COGS lines whose name includes a freight or misc keyword
            // (e.g. inbound freight cost mapped to cogs_other_cogs, or bank
            // fees mapped to otherExpense) leak into a chart that is supposed
            // to track freight BILLED to customers and other operating REVENUE.
            const targetField = String(line.targetField || '').toLowerCase();
            const isRevenueAccount = targetField.includes(':rev_');
            if (!isRevenueAccount) continue;
            const text = `${targetField} ${String(line.sourceAccountName || '')}`.toLowerCase();
            const isFreight =
              text.includes('freight') || text.includes('shipping') || text.includes('delivery');
            // Treat anything mapped to an "other revenue" / scrap revenue bucket
            // as other revenue even when the source account name does not match
            // a keyword (the bucket itself already encodes the intent).
            const isOtherRevenueBucket =
              targetField.includes('scrap_and_other_revenue') ||
              targetField.includes('other_revenue');
            const isOtherRevenue =
              isOtherRevenueBucket ||
              text.includes('other revenue') ||
              text.includes('misc') ||
              text.includes('surcharge') ||
              text.includes('handling') ||
              text.includes('scrap') ||
              text.includes('rebate');
            if (isFreight) {
              freightByWeek.set(week, Number(freightByWeek.get(week) || 0) + amount);
            } else if (isOtherRevenue) {
              otherRevenueByWeek.set(week, Number(otherRevenueByWeek.get(week) || 0) + amount);
            }
          }

          // Raw invoice fallback: pull SLInvHdrs.Freight + SLInvHdrs.MiscCharges
          // from InforRawRecord for any week where the GL bridge is silent.
          // Cheap-ish: jsonb path extraction with the businessDate bound and a
          // companyId/miProgram-prefixed index keep this responsive.
          try {
            const rawDelegate = (prisma as any).inforRawRecord;
            if (rawDelegate?.findMany) {
              const rawFreight = await prisma.$queryRaw<Array<{
                weekStart: string;
                sum_freight: number;
                sum_misc: number;
              }>>`
                WITH src AS (
                  SELECT
                    COALESCE(
                      NULLIF(LEFT(payload->>'InvDate', 8), '')::date,
                      "businessDate"::date
                    ) AS d,
                    COALESCE((payload->>'Freight')::double precision, 0)     AS freight,
                    COALESCE((payload->>'MiscCharges')::double precision, 0) AS misc
                  FROM "InforRawRecord"
                  WHERE "companyId" = ${companyId}
                    AND "miProgram" = 'SLInvHdrs'
                    AND "businessDate" >= ${startDate}
                    AND "businessDate" <= ${endDate}
                )
                SELECT
                  to_char(
                    (d - ((EXTRACT(ISODOW FROM d)::int - 1) || ' days')::interval)::date,
                    'YYYY-MM-DD'
                  ) AS "weekStart",
                  SUM(freight)::double precision AS sum_freight,
                  SUM(misc)::double precision    AS sum_misc
                FROM src
                WHERE d IS NOT NULL
                  AND d >= ${startDate}::date
                  AND d <= ${endDate}::date
                  AND (freight <> 0 OR misc <> 0)
                GROUP BY 1
              `;
              for (const row of rawFreight) {
                const week = String(row.weekStart);
                const fr = Math.abs(Number(row.sum_freight || 0));
                const mc = Math.abs(Number(row.sum_misc || 0));
                // Only fill in when the GL bridge said nothing for this week,
                // otherwise prefer the GL number (it usually reflects post-
                // adjustment net activity that the raw invoice header alone
                // cannot represent — credits, voids, etc.).
                if (fr > 0 && !(Number(freightByWeek.get(week) || 0) > 0)) {
                  freightByWeek.set(week, fr);
                }
                if (mc > 0 && !(Number(otherRevenueByWeek.get(week) || 0) > 0)) {
                  otherRevenueByWeek.set(week, mc);
                }
              }
            }
          } catch (rawFallbackErr) {
            // Raw fallback is best-effort: if Infor raw records are missing
            // (e.g. non-Infor companies) or the jsonb cast fails, just keep
            // whatever the GL bridge produced and move on.
            console.warn('[operational-data] freight raw-invoice fallback skipped:', rawFallbackErr);
          }

          const rowIndexesByWeek = new Map<string, number[]>();
          for (let idx = 0; idx < recordsV1.length; idx += 1) {
            const row = recordsV1[idx];
            const week = weekStartIsoOf(row.snapshotDate);
            if (!rowIndexesByWeek.has(week)) rowIndexesByWeek.set(week, []);
            rowIndexesByWeek.get(week)!.push(idx);
          }

          // Allocate freight / other-revenue to product rows in the same
          // ISO week, weighted by row revenue.
          for (const [week, indexes] of rowIndexesByWeek.entries()) {
            if (!indexes.length) continue;
            const totalFreight = Number(freightByWeek.get(week) || 0);
            const totalOtherRevenue = Number(otherRevenueByWeek.get(week) || 0);
            if (totalFreight <= 0 && totalOtherRevenue <= 0) continue;
            const bases = indexes.map((idx) => Math.max(0, Number(recordsV1[idx].revenue || 0)));
            const totalBase = bases.reduce((sum, n) => sum + n, 0);
            if (totalBase > 0) {
              indexes.forEach((idx, i) => {
                const weight = bases[i] / totalBase;
                if (totalFreight > 0)
                  recordsV1[idx].freightAllocated =
                    Number(recordsV1[idx].freightAllocated || 0) + weight * totalFreight;
                if (totalOtherRevenue > 0)
                  recordsV1[idx].otherRevenueAllocated =
                    Number(recordsV1[idx].otherRevenueAllocated || 0) + weight * totalOtherRevenue;
              });
            } else {
              const freightEven = totalFreight > 0 ? totalFreight / indexes.length : 0;
              const otherEven = totalOtherRevenue > 0 ? totalOtherRevenue / indexes.length : 0;
              indexes.forEach((idx) => {
                if (freightEven > 0)
                  recordsV1[idx].freightAllocated =
                    Number(recordsV1[idx].freightAllocated || 0) + freightEven;
                if (otherEven > 0)
                  recordsV1[idx].otherRevenueAllocated =
                    Number(recordsV1[idx].otherRevenueAllocated || 0) + otherEven;
              });
            }
          }

          // Some companies (e.g. Infor CSI users) record full daily invoice
          // activity but only refresh ProductSalesSnapshot a few times per
          // window. Any freight / other-revenue ISO week that has no
          // product row to anchor to would otherwise be silently dropped
          // from the trend, even though the activity is real (and visible
          // in the raw SLInvHdrs payload). Synthesize a single zero-revenue
          // placeholder record for each orphan week so the activity lands
          // in the right ISO-week bucket on the chart.
          const allActivityWeeks = new Set<string>([
            ...freightByWeek.keys(),
            ...otherRevenueByWeek.keys(),
          ]);
          for (const week of allActivityWeeks) {
            if (rowIndexesByWeek.has(week)) continue;
            const totalFreight = Number(freightByWeek.get(week) || 0);
            const totalOtherRevenue = Number(otherRevenueByWeek.get(week) || 0);
            if (totalFreight <= 0 && totalOtherRevenue <= 0) continue;
            const placeholderDate = new Date(`${week}T00:00:00.000Z`);
            recordsV1.push({
              snapshotDate: placeholderDate,
              itemName: 'Freight & Other Revenue',
              sku: '__freight_other_placeholder__',
              site: 'N/A',
              customer: 'N/A',
              quantitySold: 0,
              revenue: 0,
              cogs: 0,
              freightAllocated: totalFreight,
              otherRevenueAllocated: totalOtherRevenue,
              isPlaceholderRow: true,
            } as any);
          }
        }

        data = recordsV1 as any;

        // Calculate product performance
        const productTotals = data.reduce((acc, record) => {
          if (!acc[record.itemName]) {
            acc[record.itemName] = {
              name: record.itemName,
              sku: record.sku,
              totalRevenue: 0,
              totalCogs: 0,
              totalQuantity: 0,
            };
          }
          acc[record.itemName].totalRevenue += record.revenue;
          acc[record.itemName].totalCogs += record.cogs || 0;
          acc[record.itemName].totalQuantity += record.quantitySold;
          return acc;
        }, {} as Record<string, any>);
        const fullWindowTopProducts = await prisma.$queryRaw<
          Array<{
            name: string;
            sku: string | null;
            totalRevenue: number;
            totalCogs: number;
            totalQuantity: number;
          }>
        >`
          SELECT
            COALESCE(NULLIF(TRIM("itemName"), ''), 'Unknown Item') AS name,
            NULLIF(MAX(TRIM(COALESCE("sku", ''))), '') AS sku,
            SUM(COALESCE("revenue", 0))::double precision AS "totalRevenue",
            SUM(COALESCE("cogs", 0))::double precision AS "totalCogs",
            SUM(COALESCE("quantitySold", 0))::double precision AS "totalQuantity"
          FROM "ProductSalesSnapshot"
          WHERE "companyId" = ${companyId}
            AND "frequency" = ${productFrequencyForQuery}
            AND "snapshotDate" >= ${startDate}
            AND "snapshotDate" <= ${endDate}
          GROUP BY 1
          ORDER BY "totalRevenue" DESC
          LIMIT 10
        `;
        const topProductsSummary = fullWindowTopProducts.length
          ? fullWindowTopProducts.map((row) => {
              const totalRevenue = Number(row.totalRevenue || 0);
              const totalCogs = Number(row.totalCogs || 0);
              return {
                name: String(row.name || 'Unknown Item'),
                sku: row.sku || null,
                totalRevenue,
                totalCogs,
                totalQuantity: Number(row.totalQuantity || 0),
                grossMargin: totalRevenue - totalCogs,
                grossMarginPct: totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0,
              };
            })
          : Object.values(productTotals)
              .map((p: any) => ({
                ...p,
                grossMargin: p.totalRevenue - p.totalCogs,
                grossMarginPct: p.totalRevenue > 0 ? ((p.totalRevenue - p.totalCogs) / p.totalRevenue) * 100 : 0,
              }))
              .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
              .slice(0, 10);

        const wholesaleOrderLines =
          isWholesaleProductsReportRequest && productOrderLineDelegate?.findMany
            ? await (async () => {
                const normalizeOrderLineToken = (value: unknown): string => {
                  const raw = String(value ?? '').trim();
                  if (!raw) return '';
                  const numeric = Number(raw);
                  return Number.isFinite(numeric) ? String(numeric) : raw.toUpperCase();
                };
                const buildRawOrderLineKey = (orderId: unknown, lineId: unknown, releaseId?: unknown) => {
                  const order = normalizeOrderLineToken(orderId);
                  const lineRaw = String(lineId ?? '').trim();
                  const [linePart, releasePart] = lineRaw.split('-');
                  const line = normalizeOrderLineToken(linePart);
                  const release = normalizeOrderLineToken(releaseId ?? releasePart ?? '0') || '0';
                  return `${order}||${line}||${release}`;
                };
                const buildRawOrderLineNoReleaseKey = (orderId: unknown, lineId: unknown) => {
                  const order = normalizeOrderLineToken(orderId);
                  const lineRaw = String(lineId ?? '').trim();
                  const [linePart] = lineRaw.split('-');
                  const line = normalizeOrderLineToken(linePart);
                  return `${order}||${line}`;
                };
                const customerPartNumberKeys = [
                  'CustItem',
                  'custItem',
                  'CUSTITEM',
                  'CustomerItem',
                  'customerItem',
                  'CustomerItemNumber',
                  'customerItemNumber',
                  'CustomerPartNumber',
                  'customerPartNumber',
                  'CustPart',
                  'custPart',
                  'CustomerPart',
                  'customerPart',
                  'ItemCust',
                  'itemCust',
                  'ItemCustomer',
                  'itemCustomer',
                  'CustomerSku',
                  'customerSku',
                ];
                const readRawCustomerPartNumber = (payload: any) => {
                  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
                  for (const key of customerPartNumberKeys) {
                    const value = payload[key];
                    if (value != null && String(value).trim()) return String(value).trim();
                  }
                  return '';
                };
                const readRawCustomerId = (payload: any) => {
                  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
                  return String(
                    payload['CustNum'] ??
                      payload['custNum'] ??
                      payload['CUSTNUM'] ??
                      payload['CustomerNumber'] ??
                      payload['customerNumber'] ??
                      payload['CustomerId'] ??
                      payload['customerId'] ??
                      ''
                  ).trim();
                };
                const readRawAprPartNumber = (payload: any) => {
                  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
                  return String(
                    payload['Item'] ??
                      payload['item'] ??
                      payload['ITEM'] ??
                      payload['DerItem'] ??
                      payload['derItem'] ??
                      payload['ItemNumber'] ??
                      payload['itemNumber'] ??
                      ''
                  ).trim();
                };
                const buildCustomerItemKey = (customerId: unknown, aprPartNumber: unknown) =>
                  `${normalizeOrderLineToken(customerId)}||${normalizeOrderLineToken(aprPartNumber)}`;
                const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const extractCustomerPartFromOverview = (overview: unknown, customerName: unknown) => {
                  const rawOverview = String(overview || '').trim();
                  const rawCustomer = String(customerName || '').trim();
                  if (!rawOverview || !rawCustomer) return '';
                  const normalizedCustomer = rawCustomer.replace(/\s+/g, ' ');
                  const match = rawOverview.match(new RegExp(`${escapeRegExp(normalizedCustomer)}\\s+([A-Za-z0-9][A-Za-z0-9._/-]{2,})\\b`, 'i'));
                  return match?.[1] ? match[1].trim() : '';
                };
                const rawDueDateByOrderLine = new Map<string, string>();
                const rawDueDateByOrderLineNoRelease = new Map<string, string>();
                const rawCustomerPartByOrderLine = new Map<string, string>();
                const rawCustomerPartByOrderLineNoRelease = new Map<string, string>();
                const rawCustomerPartByCustomerItem = new Map<string, string>();
                const rawItemOverviewByAprPart = new Map<string, string>();
                const rawOrderRows = await prisma.inforRawRecord.findMany({
                  where: {
                    companyId,
                    miProgram: 'SLCoitems',
                    businessDate: { gte: startDate, lte: endDate },
                  },
                  select: {
                    payload: true,
                    businessDate: true,
                    fetchedAt: true,
                  },
                  orderBy: [{ businessDate: 'desc' }, { fetchedAt: 'desc' }],
                  take: Math.min(rawPayloadRowCap, 50000),
                });
                for (const rawRow of rawOrderRows as any[]) {
                  const payload = rawRow?.payload;
                  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
                  const orderId = payload['CoNum'] ?? payload['coNum'] ?? payload['CONUM'] ?? payload['OrderNum'] ?? payload['orderNo'] ?? payload['orderNumber'] ?? payload['Order'] ?? payload['orderId'];
                  const lineId = payload['CoLine'] ?? payload['coLine'] ?? payload['COLINE'] ?? payload['Line'] ?? payload['lineId'];
                  const releaseId = payload['CoRelease'] ?? payload['coRelease'] ?? payload['CORELEASE'] ?? payload['Release'];
                  const dueDateRaw = String(payload['DueDate'] ?? payload['dueDate'] ?? payload['DUEDATE'] ?? '').trim();
                  const customerPartNumber = readRawCustomerPartNumber(payload);
                  if (!orderId || !lineId || (!dueDateRaw && !customerPartNumber)) continue;
                  const key = buildRawOrderLineKey(orderId, lineId, releaseId);
                  const noReleaseKey = buildRawOrderLineNoReleaseKey(orderId, lineId);
                  if (!key.replace(/\|/g, '').trim()) continue;
                  if (dueDateRaw && !rawDueDateByOrderLine.has(key)) {
                    const parsedDueDate = parseInforDateValue(dueDateRaw);
                    const dueDate = parsedDueDate ? parsedDueDate.toISOString() : dueDateRaw;
                    rawDueDateByOrderLine.set(key, dueDate);
                    if (!rawDueDateByOrderLineNoRelease.has(noReleaseKey)) rawDueDateByOrderLineNoRelease.set(noReleaseKey, dueDate);
                  }
                  if (customerPartNumber && !rawCustomerPartByOrderLine.has(key)) {
                    rawCustomerPartByOrderLine.set(key, customerPartNumber);
                    if (!rawCustomerPartByOrderLineNoRelease.has(noReleaseKey)) rawCustomerPartByOrderLineNoRelease.set(noReleaseKey, customerPartNumber);
                  }
                }
                const orderRows = await productOrderLineDelegate.findMany({
                  where: {
                    companyId,
                    frequency: productFrequencyForQuery,
                    snapshotDate: { gte: startDate, lte: endDate },
                  },
                  select: {
                    snapshotDate: true,
                    customerId: true,
                    customerName: true,
                    orderId: true,
                    lineId: true,
                    orderDate: true,
                    itemId: true,
                    itemName: true,
                    sku: true,
                    qtyOrdered: true,
                    qtyInvoiced: true,
                    unitPrice: true,
                    contractValue: true,
                    invoicedAmount: true,
                    remainingAmount: true,
                    sourceTransaction: true,
                  },
                  orderBy: [{ snapshotDate: 'desc' }, { customerName: 'asc' }, { orderId: 'asc' }],
                  take: Math.min(rawPayloadRowCap, 50000),
                });
                const orderIdsForDueDateLookup = Array.from(
                  new Set((orderRows as any[]).map((row) => String(row?.orderId || '').trim()).filter(Boolean))
                ).slice(0, 1000);
                if (orderIdsForDueDateLookup.length > 0) {
                  const targetedRawOrderRows = await prisma.$queryRaw<Array<{ payload: any }>>(Prisma.sql`
                    SELECT "payload"
                    FROM "InforRawRecord"
                    WHERE "companyId" = ${companyId}
                      AND "miProgram" = 'SLCoitems'
                      AND TRIM(COALESCE(
                        "payload"->>'CoNum',
                        "payload"->>'coNum',
                        "payload"->>'CONUM',
                        "payload"->>'OrderNum',
                        "payload"->>'orderNo',
                        "payload"->>'orderNumber',
                        "payload"->>'Order',
                        "payload"->>'orderId'
                      )) IN (${Prisma.join(orderIdsForDueDateLookup)})
                    ORDER BY "businessDate" DESC NULLS LAST, "fetchedAt" DESC
                    LIMIT ${Math.min(rawPayloadRowCap, 50000)}
                  `);
                  for (const rawRow of targetedRawOrderRows as any[]) {
                    const payload = rawRow?.payload;
                    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
                    const orderId = payload['CoNum'] ?? payload['coNum'] ?? payload['CONUM'] ?? payload['OrderNum'] ?? payload['orderNo'] ?? payload['orderNumber'] ?? payload['Order'] ?? payload['orderId'];
                    const lineId = payload['CoLine'] ?? payload['coLine'] ?? payload['COLINE'] ?? payload['Line'] ?? payload['lineId'];
                    const releaseId = payload['CoRelease'] ?? payload['coRelease'] ?? payload['CORELEASE'] ?? payload['Release'];
                    const dueDateRaw = String(payload['DueDate'] ?? payload['dueDate'] ?? payload['DUEDATE'] ?? '').trim();
                    const customerPartNumber = readRawCustomerPartNumber(payload);
                    if (!orderId || !lineId || (!dueDateRaw && !customerPartNumber)) continue;
                    const key = buildRawOrderLineKey(orderId, lineId, releaseId);
                    const noReleaseKey = buildRawOrderLineNoReleaseKey(orderId, lineId);
                    if (!key.replace(/\|/g, '').trim()) continue;
                    if (dueDateRaw && !rawDueDateByOrderLine.has(key)) {
                      const parsedDueDate = parseInforDateValue(dueDateRaw);
                      const dueDate = parsedDueDate ? parsedDueDate.toISOString() : dueDateRaw;
                      rawDueDateByOrderLine.set(key, dueDate);
                      if (!rawDueDateByOrderLineNoRelease.has(noReleaseKey)) rawDueDateByOrderLineNoRelease.set(noReleaseKey, dueDate);
                    }
                    if (customerPartNumber && !rawCustomerPartByOrderLine.has(key)) {
                      rawCustomerPartByOrderLine.set(key, customerPartNumber);
                      if (!rawCustomerPartByOrderLineNoRelease.has(noReleaseKey)) rawCustomerPartByOrderLineNoRelease.set(noReleaseKey, customerPartNumber);
                    }
                  }
                }
                const customerIdsForPartLookup = Array.from(
                  new Set((orderRows as any[]).map((row) => String(row?.customerId || '').trim()).filter(Boolean))
                ).slice(0, 1000);
                const aprPartsForPartLookup = Array.from(
                  new Set(
                    (orderRows as any[])
                      .flatMap((row) => [row?.sku, row?.itemId, row?.itemName])
                      .map((value) => String(value || '').trim())
                      .filter(Boolean)
                  )
                ).slice(0, 2000);
                if (customerIdsForPartLookup.length > 0 && aprPartsForPartLookup.length > 0) {
                  const customerItemRows = await prisma.$queryRaw<Array<{ payload: any }>>(Prisma.sql`
                    SELECT "payload"
                    FROM "InforRawRecord"
                    WHERE "companyId" = ${companyId}
                      AND "miProgram" IN (
                        'SLCustomerItems',
                        'SLCustItems',
                        'SLCustItem',
                        'SLItemCusts',
                        'SLItemCust',
                        'SLCustItemXrefs',
                        'SLCustItemCrossRefs',
                        'SLCustomerItemCrossRefs'
                      )
                      AND TRIM(COALESCE(
                        "payload"->>'CustNum',
                        "payload"->>'custNum',
                        "payload"->>'CUSTNUM',
                        "payload"->>'CustomerNumber',
                        "payload"->>'customerNumber',
                        "payload"->>'CustomerId',
                        "payload"->>'customerId'
                      )) IN (${Prisma.join(customerIdsForPartLookup)})
                      AND TRIM(COALESCE(
                        "payload"->>'Item',
                        "payload"->>'item',
                        "payload"->>'ITEM',
                        "payload"->>'DerItem',
                        "payload"->>'derItem',
                        "payload"->>'ItemNumber',
                        "payload"->>'itemNumber'
                      )) IN (${Prisma.join(aprPartsForPartLookup)})
                    ORDER BY "businessDate" DESC NULLS LAST, "fetchedAt" DESC
                    LIMIT ${Math.min(rawPayloadRowCap, 50000)}
                  `);
                  for (const rawRow of customerItemRows as any[]) {
                    const payload = rawRow?.payload;
                    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
                    const customerPartNumber = readRawCustomerPartNumber(payload);
                    if (!customerPartNumber) continue;
                    const key = buildCustomerItemKey(readRawCustomerId(payload), readRawAprPartNumber(payload));
                    if (!key.replace(/\|/g, '').trim() || rawCustomerPartByCustomerItem.has(key)) continue;
                    rawCustomerPartByCustomerItem.set(key, customerPartNumber);
                  }
                }
                if (aprPartsForPartLookup.length > 0) {
                  const itemOverviewRows = await prisma.$queryRaw<Array<{ payload: any }>>(Prisma.sql`
                    SELECT DISTINCT ON (TRIM(COALESCE("payload"->>'Item', "payload"->>'item', "payload"->>'ITEM')))
                      "payload"
                    FROM "InforRawRecord"
                    WHERE "companyId" = ${companyId}
                      AND "miProgram" = 'SLItems'
                      AND TRIM(COALESCE("payload"->>'Item', "payload"->>'item', "payload"->>'ITEM')) IN (${Prisma.join(aprPartsForPartLookup)})
                      AND NULLIF(TRIM(COALESCE("payload"->>'Overview', "payload"->>'overview', "payload"->>'itmUf_PartNotes')), '') IS NOT NULL
                    ORDER BY TRIM(COALESCE("payload"->>'Item', "payload"->>'item', "payload"->>'ITEM')), "businessDate" DESC NULLS LAST, "fetchedAt" DESC
                    LIMIT ${Math.min(aprPartsForPartLookup.length, 2000)}
                  `);
                  for (const rawRow of itemOverviewRows as any[]) {
                    const payload = rawRow?.payload;
                    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
                    const aprPartNumber = readRawAprPartNumber(payload);
                    const overview = String(payload['Overview'] ?? payload['overview'] ?? payload['itmUf_PartNotes'] ?? '').trim();
                    const key = normalizeOrderLineToken(aprPartNumber);
                    if (key && overview && !rawItemOverviewByAprPart.has(key)) rawItemOverviewByAprPart.set(key, overview);
                  }
                }
                return (orderRows as any[]).map((row) => ({
                  source: 'customer-order-line',
                  snapshotDate: row.snapshotDate,
                  date: row.orderDate || row.snapshotDate,
                  dueDate:
                    rawDueDateByOrderLine.get(buildRawOrderLineKey(row.orderId, row.lineId)) ||
                    rawDueDateByOrderLineNoRelease.get(buildRawOrderLineNoReleaseKey(row.orderId, row.lineId)) ||
                    null,
                  customerId: row.customerId || null,
                  customerName: row.customerName || null,
                  customer: row.customerName || null,
                  orderId: row.orderId || null,
                  lineId: row.lineId || null,
                  itemId: row.itemId || row.sku || row.itemName || null,
                  sku: row.sku || row.itemId || row.itemName || null,
                  itemName: row.itemName || row.itemId || row.sku || null,
                  customerPartNumber:
                    rawCustomerPartByOrderLine.get(buildRawOrderLineKey(row.orderId, row.lineId)) ||
                    rawCustomerPartByOrderLineNoRelease.get(buildRawOrderLineNoReleaseKey(row.orderId, row.lineId)) ||
                    rawCustomerPartByCustomerItem.get(buildCustomerItemKey(row.customerId, row.sku || row.itemId || row.itemName)) ||
                    extractCustomerPartFromOverview(rawItemOverviewByAprPart.get(normalizeOrderLineToken(row.sku || row.itemId || row.itemName)), row.customerName) ||
                    null,
                  partNote: rawItemOverviewByAprPart.get(normalizeOrderLineToken(row.sku || row.itemId || row.itemName)) || null,
                  quantitySold: Number(row.qtyInvoiced || row.qtyOrdered || 0),
                  qtyOrdered: Number(row.qtyOrdered || 0),
                  qtyInvoiced: Number(row.qtyInvoiced || 0),
                  unitPrice: Number(row.unitPrice || 0),
                  revenue: Number(row.invoicedAmount || row.contractValue || 0),
                  contractValue: Number(row.contractValue || 0),
                  invoicedAmount: Number(row.invoicedAmount || 0),
                  remainingAmount: Number(row.remainingAmount || 0),
                  transaction: row.sourceTransaction || null,
                  sourceTransaction: row.sourceTransaction || null,
                }));
              })()
            : [];

        const wholesaleVendorPricingRows =
          isWholesaleProductsReportRequest
            ? await (async () => {
                const rawRows = await prisma.inforRawRecord.findMany({
                  where: {
                    companyId,
                    miProgram: { in: ['SLItemVends', 'SLItemVendPrices'] },
                  },
                  select: {
                    miProgram: true,
                    businessDate: true,
                    payload: true,
                    fetchedAt: true,
                  },
                  orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
                  take: Math.min(rawPayloadRowCap, 50000),
                });
                const latestByKey = new Map<string, any>();
                const read = (payload: any, keys: string[]) => {
                  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
                  for (const key of keys) {
                    const value = payload[key];
                    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
                  }
                  return '';
                };
                const asNumber = (value: string) => {
                  const normalized = String(value || '').replace(/,/g, '').trim();
                  const parsed = Number(normalized);
                  return Number.isFinite(parsed) ? parsed : null;
                };
                const asIsoDate = (value: string) => {
                  const raw = String(value || '').trim();
                  if (!raw) return null;
                  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
                  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
                  const parsed = new Date(raw);
                  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
                };
                for (const rawRow of rawRows as any[]) {
                  const payload = rawRow?.payload;
                  const miProgram = String(rawRow?.miProgram || '').trim();
                  const item = read(payload, ['Item', 'DerItem']);
                  const vendorId = read(payload, ['VendNum']);
                  if (!item || !vendorId) continue;
                  const effectiveDateRaw = read(payload, ['EffectDate']);
                  const breakQty1 = asNumber(read(payload, ['BrkQty_1']));
                  const breakCost1 = asNumber(read(payload, ['BrkCost_1']));
                  const breakCostConv1 = asNumber(read(payload, ['BrkCostConv_1']));
                  const vendorPricingSheet = breakCostConv1 ?? breakCost1;
                  const difference = breakCost1 != null && vendorPricingSheet != null ? breakCost1 - vendorPricingSheet : null;
                  const key = [
                    miProgram,
                    item,
                    vendorId,
                    effectiveDateRaw || read(payload, ['RecordDate']),
                    read(payload, ['BrkQty_1']),
                    read(payload, ['BrkCost_1']),
                  ].join('||');
                  if (latestByKey.has(key)) continue;
                  latestByKey.set(key, {
                    source: miProgram,
                    snapshotDate: rawRow.businessDate || null,
                    fetchedAt: rawRow.fetchedAt || null,
                    item,
                    vendorId,
                    vendorName: read(payload, ['VendAddrName', 'VendaddrName']) || `Vendor ${vendorId}`,
                    rank: asNumber(read(payload, ['ItemvendRank', 'Rank', 'NewRank'])),
                    effectiveDate: asIsoDate(effectiveDateRaw),
                    effectiveDateRaw,
                    breakQty1,
                    actualNoAdj: breakCost1,
                    formalContracts: breakCostConv1,
                    vendorPricingSheet,
                    difference,
                    updatedDiff: difference,
                    vendorItem: read(payload, ['ItemVendVendItem', 'VendItem']),
                    masterBuyAgreement: read(payload, ['ItemVendMasterBuyAgreement', 'MasterBuyAgreement']),
                    status: read(payload, ['Stat', 'ItemStat']),
                    recordDate: asIsoDate(read(payload, ['RecordDate'])),
                    unitDutyCost: asNumber(read(payload, ['UnitDutyCost'])),
                    unitFreightCost: asNumber(read(payload, ['UnitFreightCost'])),
                    unitInsuranceCost: asNumber(read(payload, ['UnitInsuranceCost'])),
                  });
                }
                return Array.from(latestByKey.values()).sort((a, b) =>
                  String(a.vendorName || '').localeCompare(String(b.vendorName || ''), undefined, { sensitivity: 'base', numeric: true }) ||
                  String(a.item || '').localeCompare(String(b.item || ''), undefined, { sensitivity: 'base', numeric: true }) ||
                  String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || ''))
                );
              })()
            : [];

        if (shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'products',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        return cacheOperationalPayload({
          records: data,
          summary: {
            topProducts: topProductsSummary,
            wholesaleOrderLines,
            wholesaleVendorPricingRows,
          },
        });

      case 'inventory':
        // Inventory snapshot dates are stored as UTC calendar days; apply exact
        // day boundaries from user input to avoid UTC-4 spillover into next day.
        const parseInventoryUtcDay = (value: string | null, fallback: Date): Date => {
          const raw = String(value || '').trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const [y, m, d] = raw.split('-').map((n) => Number(n));
            return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
          }
          const base = Number.isNaN(fallback.getTime()) ? new Date() : fallback;
          return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
        };
        const inventoryStartUtcDay = parseInventoryUtcDay(startDateParam, startDate);
        const inventoryEndUtcDay = parseInventoryUtcDay(endDateParam, endDate);
        const inventoryEndExclusive = new Date(
          Date.UTC(
            inventoryEndUtcDay.getUTCFullYear(),
            inventoryEndUtcDay.getUTCMonth(),
            inventoryEndUtcDay.getUTCDate() + 1,
            0,
            0,
            0,
            0
          )
        );
        const inventoryDateFilter = {
          gte: inventoryStartUtcDay,
          lt: inventoryEndExclusive,
        };

        // Inventory table should always use the full latest snapshot,
        // not a row-limited slice of mixed days.
        let latestInventoryDate = await prisma.inventorySnapshot.findFirst({
          where: {
            companyId,
            frequency: 'daily',
            snapshotDate: inventoryDateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          select: { snapshotDate: true },
        });
        if (!latestInventoryDate) {
          latestInventoryDate = await prisma.inventorySnapshot.findFirst({
            where: {
              companyId,
              frequency,
              snapshotDate: inventoryDateFilter,
            },
            orderBy: { snapshotDate: 'desc' },
            select: { snapshotDate: true },
          });
        }

        const latestInventory = latestInventoryDate
          ? await prisma.inventorySnapshot.findMany({
              where: {
                companyId,
                frequency: 'daily',
                snapshotDate: latestInventoryDate.snapshotDate,
              },
              orderBy: [{ assetValue: 'desc' }, { itemName: 'asc' }],
            })
          : [];
        const latestInventoryEffective =
          latestInventory.length > 0
            ? latestInventory
            : latestInventoryDate
              ? await prisma.inventorySnapshot.findMany({
                  where: {
                    companyId,
                    frequency,
                    snapshotDate: latestInventoryDate.snapshotDate,
                  },
                  orderBy: [{ assetValue: 'desc' }, { itemName: 'asc' }],
                })
              : [];

        const normalizeInventoryText = (value: unknown): string => String(value ?? '').trim();
        const canonicalInventoryKey = (value: unknown): string =>
          normalizeInventoryText(value).replace(/\s+/g, '').toUpperCase();
        const inventoryNumSig = (value: unknown): string => Number(value || 0).toFixed(6);
        const dedupeInventoryRowsExact = (rows: any[]): any[] => {
          const seen = new Set<string>();
          const deduped: any[] = [];
          for (const row of rows) {
            const signature = [
              normalizeInventoryText(row.sku),
              normalizeInventoryText(row.itemId),
              normalizeInventoryText(row.itemName),
              normalizeInventoryText((row as any).warehouse),
              normalizeInventoryText((row as any).bin),
              normalizeInventoryText((row as any).lot),
              inventoryNumSig(row.qtyOnHand),
              inventoryNumSig(row.assetValue),
              inventoryNumSig(row.avgCost),
            ].join('|');
            if (seen.has(signature)) continue;
            seen.add(signature);
            deduped.push(row);
          }
          return deduped;
        };
        const aggregateInventoryBySku = (rows: any[]): any[] => {
          const deduped = dedupeInventoryRowsExact(rows);
          const inventoryNameQualityScore = (
            candidateName: string,
            candidateSku: string | null,
            candidateItemId: string | null
          ): number => {
            const name = normalizeInventoryText(candidateName);
            if (!name || name === 'Unknown Item') return 0;
            const normalizedName = canonicalInventoryKey(name);
            const normalizedSku = canonicalInventoryKey(candidateSku || '');
            const normalizedItemId = canonicalInventoryKey(candidateItemId || '');
            const looksCodeLike = /^[A-Z0-9\-_.\/]+$/.test(name);
            let score = 1;
            // Exact code mirrors are lowest quality labels for the Item Name column.
            if (normalizedName && (normalizedName === normalizedSku || normalizedName === normalizedItemId)) {
              score -= 2;
            }
            if (!looksCodeLike) score += 2;
            if (name.includes(' ')) score += 1;
            return score;
          };
          const grouped = new Map<
            string,
            {
              itemId: string | null;
              itemName: string;
              sku: string | null;
              qtyOnHand: number;
              assetValue: number;
              warehouseSet: Set<string>;
              binSet: Set<string>;
              lotSet: Set<string>;
            }
          >();
          for (const row of deduped) {
            const sku = normalizeInventoryText(row.sku) || null;
            const itemId = normalizeInventoryText(row.itemId) || null;
            const itemName = normalizeInventoryText(row.itemName) || 'Unknown Item';
            const key = canonicalInventoryKey(sku) || canonicalInventoryKey(itemId) || canonicalInventoryKey(itemName);
            if (!grouped.has(key)) {
              grouped.set(key, {
                itemId,
                itemName,
                sku,
                qtyOnHand: 0,
                assetValue: 0,
                warehouseSet: new Set<string>(),
                binSet: new Set<string>(),
                lotSet: new Set<string>(),
              });
            }
            const acc = grouped.get(key)!;
            if (!acc.sku && sku) acc.sku = sku;
            if (!acc.itemId && itemId) acc.itemId = itemId;
            if (itemName) {
              const existingScore = inventoryNameQualityScore(acc.itemName, acc.sku, acc.itemId);
              const incomingScore = inventoryNameQualityScore(itemName, sku || acc.sku, itemId || acc.itemId);
              if (!acc.itemName || acc.itemName === 'Unknown Item' || incomingScore > existingScore) {
                acc.itemName = itemName;
              }
            }
            acc.qtyOnHand += Number(row.qtyOnHand || 0);
            acc.assetValue += Number(row.assetValue || 0);
            const warehouse = normalizeInventoryText((row as any).warehouse);
            const bin = normalizeInventoryText((row as any).bin);
            const lot = normalizeInventoryText((row as any).lot);
            if (warehouse) acc.warehouseSet.add(warehouse);
            if (bin) acc.binSet.add(bin);
            if (lot) acc.lotSet.add(lot);
          }
          return Array.from(grouped.values()).map((row) => ({
            itemId: row.itemId,
            itemName: row.itemName,
            sku: row.sku,
            qtyOnHand: row.qtyOnHand,
            assetValue: row.assetValue,
            avgCost: row.qtyOnHand > 0 ? row.assetValue / row.qtyOnHand : 0,
            warehouse:
              row.warehouseSet.size === 0
                ? null
                : row.warehouseSet.size === 1
                  ? Array.from(row.warehouseSet)[0]
                  : 'Multiple',
            bin:
              row.binSet.size === 0
                ? null
                : row.binSet.size === 1
                  ? Array.from(row.binSet)[0]
                  : 'Multiple',
            lot:
              row.lotSet.size === 0
                ? null
                : row.lotSet.size === 1
                  ? Array.from(row.lotSet)[0]
                  : 'Multiple',
          }));
        };
        const sumDayInventoryAssetValue = (rows: any[]): number =>
          aggregateInventoryBySku(rows).reduce((sum, row) => sum + Number(row.assetValue || 0), 0);

        const latestInventoryBySku = aggregateInventoryBySku(latestInventoryEffective).sort(
          (a, b) => Number(b.assetValue || 0) - Number(a.assetValue || 0)
        );
        const toIsoDay = (d: Date) =>
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const dailyInventorySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
        const storedDailyInventoryRows = dailyInventorySnapshotDelegate
          ? await dailyInventorySnapshotDelegate.findMany({
              where: {
                companyId,
                frequency: 'daily',
                snapshotDate: inventoryDateFilter,
              },
              select: {
                snapshotDate: true,
                inventory: true,
              },
              orderBy: { snapshotDate: 'asc' },
            })
          : [];

        let inventoryTrendRowsRaw = await prisma.inventorySnapshot.findMany({
          where: {
            companyId,
            frequency: 'daily',
            snapshotDate: inventoryDateFilter,
          },
          orderBy: [{ snapshotDate: 'asc' }, { createdAt: 'desc' }],
        });
        // Fallback for companies that only have non-daily inventory snapshots.
        if (!inventoryTrendRowsRaw.length) {
          inventoryTrendRowsRaw = await prisma.inventorySnapshot.findMany({
            where: {
              companyId,
              frequency,
              snapshotDate: inventoryDateFilter,
            },
            orderBy: [{ snapshotDate: 'asc' }, { createdAt: 'desc' }],
          });
        }
        let unitCostHistory: Array<{
          snapshotDate: string;
          unitCost: number | null;
          unitPrice: number | null;
          spread: number | null;
          qtyOnHand: number;
          assetValue: number;
          pricePointCount: number;
          source: 'weighted' | 'none';
        }> = [];
        if (includeCostHistory && skuParam) {
          const skuKey = canonicalInventoryKey(skuParam);
          const historyByDay = new Map<
            string,
            {
              snapshotDate: Date;
              qtyOnHand: number;
              assetValue: number;
            }
          >();
          const priceByDay = new Map<
            string,
            {
              sum: number;
              count: number;
            }
          >();
          const rawPriceRows = await (prisma as any).inforRawRecord.findMany({
            where: {
              companyId,
              platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
              businessDate: { gte: inventoryStartUtcDay, lt: inventoryEndExclusive },
              miProgram: { in: ['SLCOITEMS', 'SLCoitems'] },
            },
            select: {
              businessDate: true,
              payload: true,
            },
            orderBy: [{ businessDate: 'asc' }],
            take: rawPayloadRowCap,
          });
          for (const row of inventoryTrendRowsRaw) {
            const aliases = Array.from(
              new Set(
                [
                  canonicalInventoryKey(row.sku),
                  canonicalInventoryKey(row.itemId),
                  canonicalInventoryKey(row.itemName),
                ].filter(Boolean)
              )
            );
            if (!aliases.includes(skuKey)) continue;
            const day = new Date(
              Date.UTC(
                row.snapshotDate.getUTCFullYear(),
                row.snapshotDate.getUTCMonth(),
                row.snapshotDate.getUTCDate(),
                0,
                0,
                0,
                0
              )
            );
            const dayKey = toIsoDay(day);
            if (!historyByDay.has(dayKey)) {
              historyByDay.set(dayKey, {
                snapshotDate: day,
                qtyOnHand: 0,
                assetValue: 0,
              });
            }
            const acc = historyByDay.get(dayKey)!;
            const qtyOnHand = Number(row.qtyOnHand || 0);
            const assetValue = Number(row.assetValue || 0);
            acc.qtyOnHand += qtyOnHand;
            acc.assetValue += assetValue;
          }
          for (const raw of rawPriceRows as any[]) {
            const payload =
              raw?.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
                ? (raw.payload as Record<string, unknown>)
                : null;
            if (!payload) continue;
            const rawSku = canonicalInventoryKey(payload['Item'] ?? payload['ITNO'] ?? '');
            if (!rawSku || rawSku !== skuKey) continue;
            const price = Number(payload['Price'] ?? payload['PRICE'] ?? payload['price'] ?? 0);
            if (!Number.isFinite(price) || price <= 0) continue;
            const dateRaw = raw?.businessDate ? new Date(raw.businessDate) : null;
            if (!dateRaw || Number.isNaN(dateRaw.getTime())) continue;
            const day = new Date(
              Date.UTC(dateRaw.getUTCFullYear(), dateRaw.getUTCMonth(), dateRaw.getUTCDate(), 0, 0, 0, 0)
            );
            const dayKey = toIsoDay(day);
            if (!priceByDay.has(dayKey)) {
              priceByDay.set(dayKey, { sum: 0, count: 0 });
            }
            const acc = priceByDay.get(dayKey)!;
            acc.sum += price;
            acc.count += 1;
          }
          const allDays = new Set<string>([...historyByDay.keys(), ...priceByDay.keys()]);
          unitCostHistory = Array.from(allDays.values())
            .map((dayKey) => {
              const inventory = historyByDay.get(dayKey) || null;
              const priceAcc = priceByDay.get(dayKey) || null;
              const weightedUnitCost =
                inventory && inventory.qtyOnHand > 0 ? inventory.assetValue / inventory.qtyOnHand : null;
              const unitPrice =
                priceAcc && priceAcc.count > 0 ? priceAcc.sum / priceAcc.count : null;
              const spread =
                weightedUnitCost != null && unitPrice != null ? unitPrice - weightedUnitCost : null;
              const source: 'weighted' | 'none' = weightedUnitCost ? 'weighted' : 'none';
              const snapshotDate = inventory?.snapshotDate
                ? inventory.snapshotDate
                : (() => {
                    const [y, m, d] = dayKey.split('-').map((n) => Number(n));
                    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
                  })();
              return {
                snapshotDate: snapshotDate.toISOString(),
                unitCost: weightedUnitCost,
                unitPrice,
                spread,
                qtyOnHand: Number(inventory?.qtyOnHand || 0),
                assetValue: Number(inventory?.assetValue || 0),
                pricePointCount: Number(priceAcc?.count || 0),
                source,
              };
            })
            .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());
        }

        // Build a dense day-by-day inventory value series across the selected range.
        // For days without a fresh snapshot, carry forward the latest known inventory value.
        let baselineValue = 0;
        if (storedDailyInventoryRows.length > 0 && dailyInventorySnapshotDelegate) {
          const priorStored = await dailyInventorySnapshotDelegate.findFirst({
            where: {
              companyId,
              frequency: 'daily',
              snapshotDate: { lt: inventoryStartUtcDay },
            },
            select: { inventory: true },
            orderBy: { snapshotDate: 'desc' },
          });
          baselineValue = Number(priorStored?.inventory || 0);
        } else {
          const latestDailyBeforeStart = await prisma.inventorySnapshot.findFirst({
            where: {
              companyId,
              frequency: 'daily',
              snapshotDate: { lt: inventoryStartUtcDay },
            },
            orderBy: { snapshotDate: 'desc' },
            select: { snapshotDate: true },
          });
          if (latestDailyBeforeStart?.snapshotDate) {
            const baselineRows = await prisma.inventorySnapshot.findMany({
              where: {
                companyId,
                frequency: 'daily',
                snapshotDate: latestDailyBeforeStart.snapshotDate,
              },
              orderBy: [{ createdAt: 'desc' }],
            });
            baselineValue = sumDayInventoryAssetValue(baselineRows);
          } else {
            const latestBeforeStart = await prisma.inventorySnapshot.findFirst({
              where: {
                companyId,
                frequency,
                snapshotDate: { lt: inventoryStartUtcDay },
              },
              orderBy: { snapshotDate: 'desc' },
              select: { snapshotDate: true },
            });
            if (latestBeforeStart?.snapshotDate) {
              const baselineRows = await prisma.inventorySnapshot.findMany({
                where: {
                  companyId,
                  frequency,
                  snapshotDate: latestBeforeStart.snapshotDate,
                },
                orderBy: [{ createdAt: 'desc' }],
              });
              baselineValue = sumDayInventoryAssetValue(baselineRows);
            }
          }
        }

        const startUtcDay = new Date(inventoryStartUtcDay);
        const endUtcDay = new Date(inventoryEndUtcDay);
        const trendValueByDay = new Map<string, number>();
        if (storedDailyInventoryRows.length > 0) {
          for (const row of storedDailyInventoryRows) {
            const d = new Date(Date.UTC(row.snapshotDate.getUTCFullYear(), row.snapshotDate.getUTCMonth(), row.snapshotDate.getUTCDate()));
            trendValueByDay.set(toIsoDay(d), Number(row.inventory || 0));
          }
        } else {
          const trendRowsByDay = new Map<string, any[]>();
          for (const row of inventoryTrendRowsRaw) {
            const d = new Date(Date.UTC(row.snapshotDate.getUTCFullYear(), row.snapshotDate.getUTCMonth(), row.snapshotDate.getUTCDate()));
            const key = toIsoDay(d);
            if (!trendRowsByDay.has(key)) trendRowsByDay.set(key, []);
            trendRowsByDay.get(key)!.push(row);
          }
          for (const [dayKey, dayRows] of trendRowsByDay.entries()) {
            trendValueByDay.set(dayKey, sumDayInventoryAssetValue(dayRows));
          }
        }
        const inventoryTrendDaily: Array<{ snapshotDate: Date; assetValue: number; qtyOnHand: number }> = [];
        let carryAssetValue = baselineValue;
        for (
          let cursor = new Date(startUtcDay);
          cursor.getTime() <= endUtcDay.getTime();
          cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1))
        ) {
          const iso = toIsoDay(cursor);
          if (trendValueByDay.has(iso)) {
            carryAssetValue = Number(trendValueByDay.get(iso) || 0);
          }
          if (isWeekendUtc(cursor)) continue;
          inventoryTrendDaily.push({
            snapshotDate: new Date(cursor),
            assetValue: carryAssetValue,
            qtyOnHand: 0,
          });
        }

        // V1 inventory aging/obsolescence model:
        // inventory exposure + SLCOITEMS shipped deltas (no invoiced-qty proxy).
        const canonicalMovementKey = (value: unknown): string =>
          String(value || '')
            .trim()
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
        const normalizeToken = (value: unknown): string => {
          const raw = String(value ?? '').trim();
          if (!raw) return '';
          const num = Number(raw);
          if (Number.isFinite(num)) return String(num);
          return raw.toUpperCase();
        };
        const daysBetweenUtc = (from: Date, to: Date): number =>
          Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
        const start30Utc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate() - 29));
        const start60Utc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate() - 59));
        const start90Utc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate() - 89));
        const asOfUtc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate()));
        let agingReport: any[] = [];
        const rawShippedRows = await (prisma as any).inforRawRecord.findMany({
          where: {
            companyId,
            platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
            businessDate: { gte: start90Utc, lte: asOfUtc },
            miProgram: { in: ['SLCOITEMS', 'SLCoitems'] },
          },
          select: {
            businessDate: true,
            payload: true,
          },
          orderBy: [{ businessDate: 'asc' }],
          take: rawPayloadRowCap,
        });
        const movementBySku = new Map<
          string,
          {
            lastOrderDate: Date | null;
            shippedQty30: number;
            shippedQty60: number;
            shippedQty90: number;
          }
        >();
        const lineState = new Map<string, { seen: boolean; lastQtyShipped: number }>();
        for (const row of rawShippedRows as any[]) {
          const payload =
            row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
              ? (row.payload as Record<string, unknown>)
              : null;
          if (!payload) continue;
          const rawOrderId = normalizeToken(payload['CoNum'] ?? payload['CONUM'] ?? payload['coNum'] ?? '');
          const rawLine = normalizeToken(payload['CoLine'] ?? payload['COLINE'] ?? payload['coLine'] ?? '0') || '0';
          const rawRelease = normalizeToken(payload['CoRelease'] ?? payload['CORELEASE'] ?? payload['coRelease'] ?? '0') || '0';
          const lineKey = `${rawOrderId}|${rawLine}-${rawRelease}`;
          if (!rawOrderId) continue;
          const skuToken = String(payload['Item'] ?? payload['ITNO'] ?? '').trim();
          const keyAliases = Array.from(
            new Set([canonicalMovementKey(skuToken)].filter(Boolean))
          );
          if (!keyAliases.length) continue;
          for (const alias of keyAliases) {
            if (!movementBySku.has(alias)) {
              movementBySku.set(alias, {
                lastOrderDate: null,
                shippedQty30: 0,
                shippedQty60: 0,
                shippedQty90: 0,
              });
            }
          }
          const businessDateRaw = row?.businessDate ? new Date(row.businessDate) : null;
          if (!businessDateRaw || Number.isNaN(businessDateRaw.getTime())) continue;
          const eventUtc = new Date(
            Date.UTC(businessDateRaw.getUTCFullYear(), businessDateRaw.getUTCMonth(), businessDateRaw.getUTCDate())
          );
          const qtyShippedAbs = Math.max(
            0,
            Number(payload['QtyShipped'] ?? payload['QTYSHIPPED'] ?? payload['qtyShipped'] ?? 0)
          );
          if (qtyShippedAbs > 0) {
            for (const alias of keyAliases) {
              const acc = movementBySku.get(alias)!;
              if (!acc.lastOrderDate || eventUtc.getTime() > acc.lastOrderDate.getTime()) acc.lastOrderDate = eventUtc;
            }
          }
          if (!lineState.has(lineKey)) {
            lineState.set(lineKey, { seen: true, lastQtyShipped: qtyShippedAbs });
            if (qtyShippedAbs > 0) {
              for (const alias of keyAliases) {
                const acc = movementBySku.get(alias)!;
                if (eventUtc.getTime() >= start90Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty90 += qtyShippedAbs;
                if (eventUtc.getTime() >= start60Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty60 += qtyShippedAbs;
                if (eventUtc.getTime() >= start30Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty30 += qtyShippedAbs;
              }
            }
            continue;
          }
          const state = lineState.get(lineKey)!;
          const delta = qtyShippedAbs - state.lastQtyShipped;
          state.lastQtyShipped = Math.max(state.lastQtyShipped, qtyShippedAbs);
          if (delta <= 0) continue;
          for (const alias of keyAliases) {
            const acc = movementBySku.get(alias)!;
            if (!acc.lastOrderDate || eventUtc.getTime() > acc.lastOrderDate.getTime()) acc.lastOrderDate = eventUtc;
            if (eventUtc.getTime() >= start90Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty90 += delta;
            if (eventUtc.getTime() >= start60Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty60 += delta;
            if (eventUtc.getTime() >= start30Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty30 += delta;
          }
        }
        agingReport = latestInventoryBySku.map((inv) => {
          const lookupAliases = Array.from(
            new Set([
              canonicalMovementKey(inv.sku),
              canonicalMovementKey(inv.itemId),
              canonicalMovementKey(inv.itemName),
            ].filter(Boolean))
          );
          const movement =
            lookupAliases.map((key) => movementBySku.get(key)).find((m) => Boolean(m)) || null;
          const lastOrderDate = movement?.lastOrderDate || null;
          const daysSinceLastSale = lastOrderDate ? Math.max(0, daysBetweenUtc(lastOrderDate, asOfUtc)) : null;
          const qtyOnHand = Number(inv.qtyOnHand || 0);
          const assetValue = Number(inv.assetValue || 0);
          let riskTier: 'Low' | 'Medium' | 'High' = 'Low';
          if (qtyOnHand > 0 && assetValue > 0) {
            if (daysSinceLastSale == null || daysSinceLastSale > 180) riskTier = 'High';
            else if (daysSinceLastSale > 90) riskTier = 'Medium';
          }
          const exposureFactor = riskTier === 'High' ? 1 : riskTier === 'Medium' ? 0.5 : 0.1;
          return {
            itemName: inv.itemName,
            sku: inv.sku,
            warehouse: inv.warehouse,
            qtyOnHand,
            assetValue,
            lastSaleDate: lastOrderDate ? lastOrderDate.toISOString() : null,
            daysSinceLastSale,
            shippedQty30: Number(movement?.shippedQty30 || 0),
            shippedQty60: Number(movement?.shippedQty60 || 0),
            shippedQty90: Number(movement?.shippedQty90 || 0),
            riskTier,
            estimatedObsolescenceExposure: assetValue * exposureFactor,
          };
        });
        agingReport = agingReport.sort(
          (a, b) =>
            Number(b.estimatedObsolescenceExposure || 0) - Number(a.estimatedObsolescenceExposure || 0)
        );

        const inventoryMetrics = {
          totalValue: latestInventoryBySku.reduce((sum, item) => sum + Number(item.assetValue || 0), 0),
          itemCount: latestInventoryBySku.length,
          topItems: latestInventoryBySku.slice(0, 10),
          top5InventoryValue: 0,
          totalObsolescenceExposure: 0,
          inventoryTurnover: null as number | null,
        };
        inventoryMetrics.top5InventoryValue = [...latestInventoryBySku]
          .sort((a, b) => Number(b.assetValue || 0) - Number(a.assetValue || 0))
          .slice(0, 5)
          .reduce((sum, item) => sum + Number(item.assetValue || 0), 0);
        inventoryMetrics.totalObsolescenceExposure = (Array.isArray(agingReport) ? agingReport : []).reduce(
          (sum: number, row: any) => sum + Number(row?.estimatedObsolescenceExposure || 0),
          0
        );
        const avgInventoryValue = inventoryTrendDaily.length
          ? inventoryTrendDaily.reduce((sum, point) => sum + Number(point.assetValue || 0), 0) / inventoryTrendDaily.length
          : Number(inventoryMetrics.totalValue || 0);
        const inventoryCogsAgg = await prisma.productSalesSnapshot.aggregate({
          where: {
            companyId,
            frequency: 'daily',
            snapshotDate: dateFilter,
          },
          _sum: {
            cogs: true,
          },
        });
        const periodCogs = Number(inventoryCogsAgg?._sum?.cogs || 0);
        inventoryMetrics.inventoryTurnover =
          periodCogs > 0 && avgInventoryValue > 0 ? periodCogs / avgInventoryValue : null;

        // Real-data only for inventory: do not return mock payloads.
        // If no inventory snapshots exist yet, return an empty real response.
        if (!latestInventoryBySku.length) {
          return cacheOperationalPayload({
            records: [],
            trend: [],
            unitCostHistory,
            summary: {
              totalValue: 0,
              itemCount: 0,
              topItems: [],
              top5InventoryValue: 0,
              totalObsolescenceExposure: 0,
              inventoryTurnover: null,
            },
          });
        }

        return cacheOperationalPayload({
          records: latestInventoryBySku,
          trend: inventoryTrendDaily,
          unitCostHistory,
          agingReport,
          summary: inventoryMetrics,
        });

      case 'cash': {
        // Canonical cash series for the Cash Position trend chart and
        // bank-account summary. We use `DailyFinancialSnapshot.cash`
        // (computed in lib/financial/daily-bs-from-gl.ts) as the single
        // source of truth. That column is GL-derived from
        // `GLTransactionFact.signedAmount` rolled forward from the
        // configured BS anchor across every account whose AccountMapping
        // targetField = 'cash' — including clearing / undeposited-funds
        // accounts that hold deposits before they post to the named bank
        // accounts. Empirically this matches bank-statement totals far
        // better than the prior CashSnapshot-vs-DailyFinancialMappedLine
        // merge for Atlantic Precision, where the bookkeeper enters bank
        // deposits with multi-week lag and the bank-account-only roll-up
        // understated cash by $20K-$50K mid-month.
        //
        // The Daily Financials tab already renders this same value; this
        // change unifies the two surfaces so they never disagree.
        const cashDateFilter = {
          gte: startDate,
          lte: endDate,
        };
        const cashSnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
        const dailyCashRows = cashSnapshotDelegate
          ? await cashSnapshotDelegate.findMany({
              where: {
                companyId,
                frequency: 'daily',
                snapshotDate: cashDateFilter,
              },
              orderBy: { snapshotDate: 'asc' },
              select: {
                snapshotDate: true,
                cash: true,
              },
              take: factRowCap,
            })
          : [];

        // Aggregate to the requested frequency (weekly/monthly use the
        // last daily value inside each bucket, matching the rest of the
        // operations API).
        const toCashPeriodKey = (dt: Date): string => {
          const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
          if (frequency === 'monthly') {
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          }
          if (frequency === 'weekly') {
            const day = d.getUTCDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            const weekStart = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday)
            );
            return `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(
              2,
              '0'
            )}-${String(weekStart.getUTCDate()).padStart(2, '0')}`;
          }
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
            d.getUTCDate()
          ).padStart(2, '0')}`;
        };
        const periodLatest = new Map<string, { snapshotDate: Date; cash: number }>();
        for (const row of dailyCashRows) {
          const snapshotDate = new Date(row.snapshotDate);
          const key = toCashPeriodKey(snapshotDate);
          const existing = periodLatest.get(key);
          if (!existing || existing.snapshotDate.getTime() <= snapshotDate.getTime()) {
            periodLatest.set(key, { snapshotDate, cash: Number(row.cash || 0) });
          }
        }

        // Emit one synthetic "Total Cash" row per period. The trend chart
        // sums `cashBalance` per snapshotDate, so a single row per date
        // produces the correct total. Bank-account rows are sourced
        // separately from CashSnapshot below so the table can still show the
        // per-account breakdown.
        data = Array.from(periodLatest.values())
          .sort((a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime())
          .map((entry) => ({
            snapshotDate: entry.snapshotDate,
            accountName: 'Total Cash (GL)',
            cashBalance: entry.cash,
            accountId: null as string | null,
            accountNumber: null as string | null,
          }));

        const rawAccountCashRows = await prisma.cashSnapshot.findMany({
          where: {
            companyId,
            frequency: 'daily',
            snapshotDate: cashDateFilter,
          },
          orderBy: [{ snapshotDate: 'asc' }, { accountName: 'asc' }],
          select: {
            snapshotDate: true,
            accountName: true,
            cashBalance: true,
            accountId: true,
            accountNumber: true,
          },
          take: factRowCap,
        });
        const cashAccountAllowlist = getCashAccountAllowlistSet(companyId);
        const allowedAccountCashRows = rawAccountCashRows.filter((row) =>
          isAllowedCashAccount(
            {
              accountId: row.accountId,
              accountNumber: row.accountNumber,
            },
            cashAccountAllowlist
          )
        );
        const accountPeriodLatest = new Map<
          string,
          {
            snapshotDate: Date;
            accountName: string;
            cashBalance: number;
            accountId: string | null;
            accountNumber: string | null;
          }
        >();
        for (const row of allowedAccountCashRows) {
          const snapshotDate = new Date(row.snapshotDate);
          const accountKey =
            accountKeyFromParts(row.accountId, row.accountNumber, row.accountName) ||
            `name:${normalizeAccountNameForKey(String(row.accountName || 'Cash Account'))}`;
          if (!accountKey) continue;
          const key = `${toCashPeriodKey(snapshotDate)}||${accountKey}`;
          const existing = accountPeriodLatest.get(key);
          if (!existing || existing.snapshotDate.getTime() <= snapshotDate.getTime()) {
            accountPeriodLatest.set(key, {
              snapshotDate,
              accountName: String(row.accountName || row.accountNumber || row.accountId || 'Cash Account'),
              cashBalance: Number(row.cashBalance || 0),
              accountId: row.accountId || null,
              accountNumber: row.accountNumber || row.accountId || null,
            });
          }
        }
        const accountCashRows = Array.from(accountPeriodLatest.values()).sort(
          (a, b) =>
            a.snapshotDate.getTime() - b.snapshotDate.getTime() ||
            a.accountName.localeCompare(b.accountName)
        );

        console.log(`💰 Cash API - frequency: ${frequency}, records returned: ${data.length}`);

        // ----- summary metrics (same shape as before) -----
        const cashRows = data as Array<{
          snapshotDate: Date;
          accountName: string;
          cashBalance: number;
          accountId: string | null;
          accountNumber: string | null;
        }>;
        const distinctCashDates: number[] = Array.from(
          new Set<number>(cashRows.map((r) => r.snapshotDate.getTime()))
        ).sort((a, b) => b - a);
        const latestCashTs = distinctCashDates[0];
        const previousCashTs = distinctCashDates[1] ?? null;
        const latestCash = cashRows.filter(
          (record) => latestCashTs != null && record.snapshotDate.getTime() === latestCashTs
        );
        const totalCash = latestCash.reduce((sum, record) => sum + record.cashBalance, 0);
        const previousCash =
          previousCashTs != null
            ? cashRows.filter((record) => record.snapshotDate.getTime() === previousCashTs)
            : [];
        const previousTotal = previousCash.reduce((sum, record) => sum + record.cashBalance, 0);
        const changeAmount = previousTotal ? totalCash - previousTotal : 0;
        const changePercent = previousTotal ? (changeAmount / previousTotal) * 100 : 0;
        const hasCashObservation = latestCash.length > 0;
        const estimatedRunwayWeeks = !hasCashObservation
          ? null
          : Math.abs(changeAmount) > 0
            ? (totalCash / Math.abs(changeAmount)) * 4.33
            : totalCash > 0
              ? 999
              : null;

        const latestAccountTs =
          accountCashRows.length > 0
            ? Math.max(...accountCashRows.map((record) => record.snapshotDate.getTime()))
            : null;
        const latestAccountRows = accountCashRows.filter(
          (record) => latestAccountTs != null && record.snapshotDate.getTime() === latestAccountTs
        );
        const accountCoverageDates = Array.from(
          new Set(accountCashRows.map((record) => record.snapshotDate.getTime()))
        ).sort((a, b) => a - b);
        const balancesByAccount: Record<string, { name: string; balances: number[]; currentBalance: number }> = {};
        for (const record of accountCashRows) {
          const key =
            accountKeyFromParts(record.accountId, record.accountNumber, record.accountName) ||
            `name:${normalizeAccountNameForKey(record.accountName)}`;
          if (!balancesByAccount[key]) {
            balancesByAccount[key] = {
              name: record.accountName,
              balances: [],
              currentBalance: 0,
            };
          }
          balancesByAccount[key].balances.push(record.cashBalance);
        }
        for (const record of latestAccountRows) {
          const key =
            accountKeyFromParts(record.accountId, record.accountNumber, record.accountName) ||
            `name:${normalizeAccountNameForKey(record.accountName)}`;
          if (balancesByAccount[key]) balancesByAccount[key].currentBalance = record.cashBalance;
        }
        const accountSummaries = Object.values(balancesByAccount)
          .map(({ name, balances, currentBalance }) => ({
            accountName: name,
            currentBalance,
            avgBalance: balances.length
              ? balances.reduce((sum, b) => sum + b, 0) / balances.length
              : 0,
            minBalance: balances.length ? Math.min(...balances) : 0,
            maxBalance: balances.length ? Math.max(...balances) : 0,
          }))
          .sort((a, b) => b.currentBalance - a.currentBalance);

        const cashMetrics = {
          totalCash,
          changeAmount,
          changePercent,
          runwayWeeks: estimatedRunwayWeeks,
          runwaySource: estimatedRunwayWeeks !== null ? 'derived_from_cash_change' : 'unavailable',
          accountCount: latestAccountRows.length,
          accounts: accountSummaries,
          accountAsOfDate: latestAccountTs ? new Date(latestAccountTs).toISOString() : null,
          accountCoverageStart:
            accountCoverageDates.length > 0 ? new Date(accountCoverageDates[0]).toISOString() : null,
          accountCoverageEnd:
            accountCoverageDates.length > 0
              ? new Date(accountCoverageDates[accountCoverageDates.length - 1]).toISOString()
              : null,
          avgTotalCash:
            data.length > 0 ? data.reduce((sum, r) => sum + r.cashBalance, 0) / data.length : 0,
          dailyTotalCash:
            frequency === 'daily' ? computeDailyCashTotalsByDate(data) : undefined,
        };

        if (shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'cash',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        return cacheOperationalPayload({
          records: data,
          summary: cashMetrics,
        });
      }

      case 'ap': {
        // AP balance derivation uses the customer's "150-day aging rule":
        // any voucher older than 150 days without a recorded payment is
        // assumed paid or written off. This was validated against the
        // 12/31/2023 TB anchor ($698K) — the rule produces $723K (drift
        // +3.6%, well within accounting tolerance) and yields a stable
        // historical series ($616K-$999K across 9 quarter-ends).
        //
        // The previous anchor-roll-forward approach drifted to a NEGATIVE
        // ~$360K today because post-anchor payments included settlements
        // for pre-anchor vouchers whose V events never made it into
        // APTransactionFact (orphan-payment leakage). The aging-rule
        // method is anchor-free and immune to that class of bug.
        //
        // See tmp/reconcile-aging-sweep.ts and tmp/compare-current-ap.ts
        // for the validation evidence.
        let apData: Array<{
          snapshotDate: Date;
          accountName: string;
          apBalance: number;
          accountId: string | null;
          accountNumber: string | null;
        }> = [];
        const apSheetAnchorCfg = getApBalanceSheetAnchorConfig(companyId);
        if (apSheetAnchorCfg) {
          const anchorAccount = apSheetAnchorCfg.accounts[0];
          apData = await buildDailyApSeriesByAgingRule(
            prisma,
            companyId,
            anchorAccount.accountId,
            anchorAccount.accountName || 'Accounts Payable',
            anchorAccount.accountNumber || anchorAccount.accountId,
            startDate,
            endDate,
            150
          );
        }
        if (apData.length > 0) {
          apData = aggregateApSeriesByFrequency(apData, frequency);
        }

        const latestApDate =
          apData.length > 0 ? Math.max(...apData.map((r) => r.snapshotDate.getTime())) : 0;
        const latestAp = apData.filter((record) => record.snapshotDate.getTime() === latestApDate);
        const totalAP = latestAp.reduce((sum, record) => sum + record.apBalance, 0);
        const distinctApDates = Array.from(new Set(apData.map((r) => r.snapshotDate.getTime()))).sort(
          (a, b) => b - a
        );
        const previousApDate = distinctApDates.length > 1 ? distinctApDates[1] : null;
        const previousAp = previousApDate
          ? apData.filter((record) => record.snapshotDate.getTime() === previousApDate)
          : [];
        const previousTotalAp = previousAp.reduce((sum, record) => sum + record.apBalance, 0);
        const changeAmountAp = previousTotalAp ? totalAP - previousTotalAp : 0;
        const changePercentAp = previousTotalAp ? (changeAmountAp / previousTotalAp) * 100 : 0;

        const accountBalancesAp = apData.reduce((acc, record) => {
          if (!acc[record.accountName]) {
            acc[record.accountName] = [];
          }
          acc[record.accountName].push(record.apBalance);
          return acc;
        }, {} as Record<string, number[]>);

        const accountSummariesAp = Object.entries(accountBalancesAp)
          .map(([name, balances]) => ({
            accountName: name,
            currentBalance: latestAp.find((r) => r.accountName === name)?.apBalance || 0,
            avgBalance: balances.length ? balances.reduce((sum, b) => sum + b, 0) / balances.length : 0,
            minBalance: balances.length ? Math.min(...balances) : 0,
            maxBalance: balances.length ? Math.max(...balances) : 0,
          }))
          .sort((a, b) => b.currentBalance - a.currentBalance);

        const apMetrics = {
          totalAP,
          changeAmount: changeAmountAp,
          changePercent: changePercentAp,
          accountCount: latestAp.length,
          accounts: accountSummariesAp,
          avgTotalAP:
            apData.length > 0 ? apData.reduce((sum, r) => sum + r.apBalance, 0) / apData.length : 0,
          dailyTotalAP: frequency === 'daily' ? computeDailyApTotalsByDate(apData) : undefined,
          anchorDateIso: apSheetAnchorCfg?.anchorDateIso ?? null,
        };

        if (shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'ap',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        return cacheOperationalPayload({
          records: apData,
          summary: apMetrics,
        });
      }

      case 'daily-financials':
        // Financial snapshots used by Operations (daily/weekly/monthly).
        const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
        const dailyMappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
        if (statementCurrency !== 'USD') {
          return NextResponse.json(
            { error: `Unsupported currency "${statementCurrency}". Daily financial statements currently support USD only.` },
            { status: 400 }
          );
        }
        if (!dailySnapshotDelegate) {
          return cacheOperationalPayload({
            records: [],
            statementRecords: [],
            summary: {
              latestRevenue: 0,
              latestExpense: 0,
              latestNet: 0,
              latestCash: 0,
              statementCurrency: 'USD',
              statementRollup,
              message: 'Daily financial snapshots model not available yet.',
            },
          });
        }

        const requestedFinancialFrequency = String(searchParams.get('frequency') || '')
          .trim()
          .toLowerCase();
        const financialFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          requestedFinancialFrequency === 'weekly' || requestedFinancialFrequency === 'monthly'
            ? (requestedFinancialFrequency as 'weekly' | 'monthly')
            : 'daily';
        // Daily Financials is GL-derived: it must include every day with GL
        // activity, even days that never received an operational raw sync
        // (e.g., MLK Day 2026-01-19 for Atlantic Precision — a company
        // holiday with no Infor raw sync, but the GL still posted $79k of
        // revenue / $47k of COGS that day from back-dated journal entries).
        //
        // The shared `dateFilter` above intersects with `InforRawCompleteness`
        // for Infor companies in daily mode, which silently drops those
        // GL-only days and under-reports rolled-up revenue / COGS by the
        // exact amount the GL posted to them. For this view we want every
        // DFS row in the date window, regardless of raw-sync completeness;
        // weekends are still filtered out below because those carry forward
        // stale prior-day balances rather than reflecting any GL activity.
        const dailyFinancialsDateFilter = { gte: startDate, lte: endDate };
        data = await dailySnapshotDelegate.findMany({
          where: {
            companyId,
            frequency: financialFrequencyForQuery,
            snapshotDate: dailyFinancialsDateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Daily Financials is a business-day view in the per-day table: a
        // weekend row whose only signal is carry-forward BS values from the
        // prior business day is noise, not activity. For the per-day display
        // (`records`) we drop weekend rows that have NO P&L activity. We do
        // NOT filter weekends out of the rollup-aggregator input — month-end
        // accruals and other JEs legitimately post on Saturdays/Sundays
        // (e.g., Atlantic Precision 1/31/2026 carries ~$28.8k of OPEX from
        // Saturday accruals). Filtering those out of the rollup makes the
        // Monthly/Quarterly/Annual columns under-report by exactly that
        // amount vs. the underlying GL.
        const isWeekendNoActivity = (row: any): boolean => {
          const snapshot = row?.snapshotDate ? new Date(row.snapshotDate) : null;
          if (!snapshot || Number.isNaN(snapshot.getTime())) return false;
          const weekday = snapshot.getUTCDay();
          if (weekday !== 0 && weekday !== 6) return false;
          const revenue = Number(row?.revenue || 0);
          const cogsTotal = Number(row?.cogsTotal || 0);
          const expense = Number(row?.expense || 0);
          return revenue === 0 && cogsTotal === 0 && expense === 0;
        };
        const dailyDataForAggregator: any[] = Array.isArray(data) ? data.slice() : [];
        if (financialFrequencyForQuery === 'daily' && Array.isArray(data) && data.length) {
          data = data.filter((row: any) => !isWeekendNoActivity(row));
        }

        if (!data.length && !dailyDataForAggregator.length) {
          return cacheOperationalPayload({
            records: [],
            statementRecords: [],
            summary: {
              latestRevenue: 0,
              latestExpense: 0,
              latestNet: 0,
              latestCash: 0,
              days: 0,
              statementCurrency: 'USD',
              statementRollup,
            },
          });
        }

        const latestDaily = data[0] || dailyDataForAggregator[0];
        const previousDaily = data[1] || latestDaily;
        const latestRevenue = Number(latestDaily?.revenue || 0);
        const latestExpense = Number(latestDaily?.expense || 0);
        const latestNet = latestRevenue - latestExpense;
        const previousNet = Number(previousDaily?.revenue || 0) - Number(previousDaily?.expense || 0);
        const netChange = latestNet - previousNet;
        let mappedLines: any[] = dailyMappedLineDelegate
          ? await dailyMappedLineDelegate.findMany({
              where: {
                companyId,
                frequency: financialFrequencyForQuery,
                // Same reasoning as `data` above: keep every day in the
                // window, including GL-only days excluded from
                // InforRawCompleteness.
                snapshotDate: dailyFinancialsDateFilter,
              },
              orderBy: [{ snapshotDate: 'desc' }, { sourceAccountName: 'asc' }],
              take: factRowCap,
            })
          : [];
        if (financialFrequencyForQuery === 'daily' && mappedLines.length) {
          // Mirror the per-day table's "weekends with activity stay" rule
          // for the per-account breakdown. A mapped line on a weekend is
          // real GL activity; only drop weekend lines whose value is zero.
          mappedLines = mappedLines.filter((row: any) => {
            const snapshot = row?.snapshotDate ? new Date(row.snapshotDate) : null;
            if (!snapshot || Number.isNaN(snapshot.getTime())) return true;
            const weekday = snapshot.getUTCDay();
            if (weekday !== 0 && weekday !== 6) return true;
            return Number(row?.amount || 0) !== 0;
          });
        }
        const statementRecords = aggregateDailyStatementRows(
          financialFrequencyForQuery === 'daily' ? dailyDataForAggregator : data,
          statementRollup
        );

        return cacheOperationalPayload({
          records: data,
          mappedLines,
          statementRecords,
          summary: {
            latestRevenue,
            latestExpense,
            latestNet,
            latestCash: Number(latestDaily?.cash || 0),
            latestAR: Number(latestDaily?.ar || 0),
            latestAP: Number(latestDaily?.ap || 0),
            netChange,
            days: data.length,
            statementPeriods: statementRecords.length,
            statementCurrency: 'USD',
            statementRollup,
            statementBasis: 'daily_activity',
            mappedLineCount: mappedLines.length,
          },
        });

      case 'cash-flow-map':
        {
          const cashMappings = await prisma.accountMapping.findMany({
            where: {
              companyId,
              targetField: 'cash',
              accountClassification: { in: ['A', 'Asset', 'ASSET', 'asset'] },
            },
            select: {
              accountName: true,
              accountId: true,
              accountCode: true,
            },
          });
          const cashAccountTokens = new Set<string>();
          for (const row of cashMappings) {
            if (isExcludedCashControlAccount(row.accountId, row.accountCode, row.accountName)) continue;
            for (const token of [row.accountId, row.accountCode, row.accountName]) {
              const normalized = normalizeAccountToken(token);
              if (normalized) cashAccountTokens.add(normalized);
            }
          }

          const glLogs = await prisma.apiSyncLog.findMany({
            where: {
              companyId,
              platform: 'INFOR_M3',
              status: 'success',
              syncType: { startsWith: 'operational_gl_' },
              createdAt: { gte: startDate, lte: endDate },
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 50,
          });

          type GlLine = {
            acct: string;
            accountName: string;
            amount: number;
            transDate: Date;
            transNum: string;
            site: string;
          };
          const glLines: GlLine[] = [];
          for (const log of glLogs) {
            const detail = (log.errorDetails || {}) as Record<string, unknown>;
            const response = (detail.response || {}) as Record<string, unknown>;
            const items = Array.isArray(response.Items) ? (response.Items as Array<Record<string, unknown>>) : [];
            for (const item of items) {
              const acct = String(item.Acct || item.accountId || '').trim();
              if (!acct) continue;
              const transNum = String(item.TransNum || item.transNum || '').trim();
              if (!transNum) continue;
              const transDateRaw = String(item.TransDate || item.transDate || item.RecordDate || '').trim();
              const transDate = transDateRaw ? new Date(transDateRaw.replace(' ', 'T') + (transDateRaw.includes('T') ? '' : 'Z')) : null;
              if (!transDate || Number.isNaN(transDate.getTime())) continue;
              if (transDate < startDate || transDate > endDate) continue;
              const amount = toNumeric(item.DomAmount ?? item.ForAmount ?? item.Amount ?? item.amount);
              if (!Number.isFinite(amount) || amount === 0) continue;
              glLines.push({
                acct,
                accountName: String(item.ChaDescription || item.ChtDescription || item.Name || acct).trim(),
                amount,
                transDate,
                transNum,
                site: String(item.Site || item.site || '').trim(),
              });
            }
          }

          const byJournal = new Map<string, GlLine[]>();
          for (const line of glLines) {
            const key = `${line.site}|${line.transNum}|${dateKeyUtc(line.transDate)}`;
            if (!byJournal.has(key)) byJournal.set(key, []);
            byJournal.get(key)!.push(line);
          }

          const flowByPair = new Map<string, { fromAccount: string; toAccount: string; netAmount: number; journalCount: number }>();
          for (const lines of byJournal.values()) {
            const cashLines = lines.filter((line) => cashAccountTokens.has(normalizeAccountToken(line.acct)) || cashAccountTokens.has(normalizeAccountToken(line.accountName)));
            const nonCashLines = lines.filter((line) => !cashAccountTokens.has(normalizeAccountToken(line.acct)) && !cashAccountTokens.has(normalizeAccountToken(line.accountName)));
            if (!cashLines.length || !nonCashLines.length) continue;
            const nonCashTotalAbs = nonCashLines.reduce((sum, line) => sum + Math.abs(line.amount), 0);
            if (nonCashTotalAbs <= 0) continue;
            for (const cashLine of cashLines) {
              const cashAbs = Math.abs(cashLine.amount);
              if (cashAbs === 0) continue;
              for (const nonCashLine of nonCashLines) {
                const weight = Math.abs(nonCashLine.amount) / nonCashTotalAbs;
                const attributed = cashAbs * weight;
                const fromAccount = cashLine.amount < 0 ? cashLine.acct : nonCashLine.acct;
                const toAccount = cashLine.amount < 0 ? nonCashLine.acct : cashLine.acct;
                const pairKey = `${fromAccount}->${toAccount}`;
                if (!flowByPair.has(pairKey)) {
                  flowByPair.set(pairKey, { fromAccount, toAccount, netAmount: 0, journalCount: 0 });
                }
                const entry = flowByPair.get(pairKey)!;
                entry.netAmount += attributed;
                entry.journalCount += 1;
              }
            }
          }

          const flows = Array.from(flowByPair.values()).sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount)).slice(0, Math.max(limit, 50));
          return NextResponse.json({
            records: flows,
            summary: {
              journalsAnalyzed: byJournal.size,
              glLinesAnalyzed: glLines.length,
              cashAccountsTracked: Array.from(cashAccountTokens.values()).sort(),
            },
          });
        }

      // ──────────────────────────────────────────────────────────────────
      // Construction sector ('23') native types — M1 stubs.
      // Real mock builders land in M2-M5 (lib/operations/construction-mock-data.ts),
      // and Vista-backed snapshot reads land in M6.
      // See docs/CONSTRUCTION_SECTOR_DASHBOARD_DESIGN.md.
      // ──────────────────────────────────────────────────────────────────
      case 'job-cost-control': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Job Cost Control');
        // M2: Mock-driven Job Cost Control. Vista-backed snapshot read lands
        // in M6 once a live customer is connected.
        const payload = buildJobCostControlMock(companyId);
        return NextResponse.json({
          records: payload.jobs,
          jobs: payload.jobs,
          dailyCost: payload.dailyCost,
          costCode: payload.costCode,
          costByType: payload.costByType,
          laborDetail: payload.laborDetail,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      case 'project-portfolio': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Project Portfolio');
        // M3: Mock-driven Project Portfolio. Reuses the same job set as Job
        // Cost Control so both tabs present a consistent view of the same
        // underlying portfolio. Vista-backed ingestion lands in M6.
        const payload = buildProjectPortfolioMock(companyId);
        return NextResponse.json({
          records: payload.jobProfitability,
          jobProfitability: payload.jobProfitability,
          riskFlags: payload.riskFlags,
          schedule: payload.schedule,
          scheduleSlippageImpact: payload.scheduleSlippageImpact,
          topJobs: payload.topJobs,
          bottomJobs: payload.bottomJobs,
          rolling12: payload.rolling12,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      case 'commitments-forecast': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Commitments & Forecast');
        // M4: Mock-driven Commitments & Forecast. Reuses the JCC job set so
        // the same companyId presents a consistent portfolio across all four
        // construction tabs. Vista-backed ingestion lands in M6.
        const payload = buildCommitmentsForecastMock(companyId);
        return NextResponse.json({
          records: payload.wipReport,
          wipReport: payload.wipReport,
          eacForecast: payload.eacForecast,
          commitmentExposure: payload.commitmentExposure,
          changeOrders: payload.changeOrders,
          openCommitments: payload.openCommitments,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      case 'billing-cash': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Billing & Cash');
        // M5: Mock-driven Billing & Cash. Reuses JCC + CF data so vendors,
        // customers, and AP/AR figures stay consistent across all four
        // construction tabs. Vista-backed ingestion lands in M6.
        const payload = buildBillingCashMock(companyId);
        return NextResponse.json({
          records: payload.billingCash,
          billingCash: payload.billingCash,
          arByJob: payload.arByJob,
          apByJob: payload.apByJob,
          priority: payload.priority,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      case 'revenue-billables': {
        const bambooSnapshot = await readBambooHrWorkforceReportSnapshot(companyId);
        if (bambooSnapshot) {
          return NextResponse.json(getBambooHrRevenueBillablesPayload(bambooSnapshot));
        }
        if (!shouldUseMockData) return mockDataDisabledResponse('Revenue & Billables');
        const payload = buildRevenueBillablesMock(companyId);
        return NextResponse.json(payload);
      }

      case 'unit-economics': {
        const bambooSnapshot = await readBambooHrWorkforceReportSnapshot(companyId);
        if (bambooSnapshot) {
          return NextResponse.json(getBambooHrUnitEconomicsPayload(bambooSnapshot));
        }
        if (!shouldUseMockData) return mockDataDisabledResponse('Unit Economics');
        const payload = buildUnitEconomicsMock(companyId);
        return NextResponse.json(payload);
      }

      case 'labor-scheduling': {
        const bambooSnapshot = await readBambooHrWorkforceReportSnapshot(companyId);
        if (bambooSnapshot) {
          return NextResponse.json(getBambooHrLaborSchedulingPayload(bambooSnapshot));
        }
        if (!shouldUseMockData) return mockDataDisabledResponse('Labor & Scheduling');
        const payload = buildLaborSchedulingMock(companyId);
        return NextResponse.json(payload);
      }

      case 'hiring': {
        return NextResponse.json(await getBambooHrHiringPayload(companyId));
      }

      case 'customers-sites': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Customers / Sites');
        const payload = buildCustomersSitesMock(companyId);
        return NextResponse.json(payload);
      }

      case 'construction-ar': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Construction AR');
        // M5b: Project-aware AR for construction. Customers/jobs/PMs/divisions
        // come straight from the JCC job set so all construction tabs roll up
        // consistently against the same portfolio.
        const payload = buildConstructionArMock(companyId);
        return NextResponse.json({
          records: payload.byInvoice,
          byCustomer: payload.byCustomer,
          byProject: payload.byProject,
          byInvoice: payload.byInvoice,
          collectionsPriority: payload.collectionsPriority,
          filters: payload.filters,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      case 'construction-ap': {
        if (!shouldUseMockData) return mockDataDisabledResponse('Construction AP');
        // M5b: Project-aware AP for construction (subs + suppliers).
        const payload = buildConstructionApMock(companyId);
        return NextResponse.json({
          records: payload.byBill,
          byVendor: payload.byVendor,
          byProject: payload.byProject,
          byBill: payload.byBill,
          paymentPriority: payload.paymentPriority,
          filters: payload.filters,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      default:
        // Get all data types summary
        const [customers, arAging, apAging, products, inventory, cash, dailyFinancials] = await Promise.all([
          prisma.customerSalesSnapshot.count({ where: { companyId } }),
          prisma.aRAgingSnapshot.count({ where: { companyId } }),
          prisma.aPAgingSnapshot.count({ where: { companyId } }),
          prisma.productSalesSnapshot.count({ where: { companyId } }),
          prisma.inventorySnapshot.count({ where: { companyId } }),
          prisma.cashSnapshot.count({ where: { companyId } }),
          (prisma as any).dailyFinancialSnapshot
            ? (prisma as any).dailyFinancialSnapshot.count({ where: { companyId } })
            : Promise.resolve(0),
        ]);

        const summary = {
          customerSalesRecords: customers,
          arAgingRecords: arAging,
          apAgingRecords: apAging,
          productSalesRecords: products,
          inventoryRecords: inventory,
          cashRecords: cash,
          dailyFinancialRecords: dailyFinancials,
        };
        if (shouldUseMockData) {
          return NextResponse.json({
            summary: buildOperationalMockSummaryCounts(sectorCategory),
          });
        }

        return cacheOperationalPayload({
          summary: {
            ...summary,
          },
        });
    }
  } catch (error) {
    console.error('Error fetching operational data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch operational data' },
      { status: 500 }
    );
  }
}

// Helper function to calculate Days Sales Outstanding (simplified)
function calculateDSO(arData: any[]): number {
  if (arData.length < 2) return 0;
  
  const latest = arData[0];
  const avgAR = arData.slice(0, 3).reduce((sum, r) => sum + r.totalAR, 0) / Math.min(3, arData.length);
  
  // Estimate daily sales (would need revenue data for accurate calculation)
  // For now, assume AR represents ~45 days of sales
  const estimatedDailySales = avgAR / 45;
  return estimatedDailySales > 0 ? latest.totalAR / estimatedDailySales : 0;
}

// Helper function to calculate Days Payable Outstanding (simplified)
function calculateDPO(apData: any[]): number {
  if (apData.length < 2) return 0;
  
  const latest = apData[0];
  const avgAP = apData.slice(0, 3).reduce((sum, r) => sum + r.totalAP, 0) / Math.min(3, apData.length);
  
  // Estimate daily purchases (would need COGS data for accurate calculation)
  // For now, assume AP represents ~30 days of purchases
  const estimatedDailyPurchases = avgAP / 30;
  return estimatedDailyPurchases > 0 ? latest.totalAP / estimatedDailyPurchases : 0;
}

