import { NextRequest, NextResponse } from 'next/server';
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
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getCashBalanceSheetAnchorConfig } from '@/lib/financial/cash-balance-sheet-anchor';
import { getApBalanceSheetAnchorConfig } from '@/lib/financial/ap-balance-sheet-anchor';

export const dynamic = 'force-dynamic';

async function companyHasAnyRealOperationalData(companyId: string): Promise<boolean> {
  const optionalFindFirst = async (delegate: any): Promise<{ id: string } | null> => {
    if (!delegate || typeof delegate.findFirst !== 'function') return null;
    return delegate.findFirst({ where: { companyId }, select: { id: true } });
  };

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
      apPayments
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

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

const BUSINESS_TZ_OFFSET_HOURS = -4;
const BUSINESS_TZ_OFFSET_MS = BUSINESS_TZ_OFFSET_HOURS * 60 * 60 * 1000;
const BUSINESS_TZ_START_HOUR_UTC = -BUSINESS_TZ_OFFSET_HOURS;

function isWeekendUtc(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function startOfUtcDay(date: Date): Date {
  // Normalize to business-day boundaries in UTC-4 (fixed offset).
  const shifted = new Date(date.getTime() + BUSINESS_TZ_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      BUSINESS_TZ_START_HOUR_UTC,
      0,
      0,
      0
    )
  );
}

function endOfUtcDay(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function parseDateParamBoundary(value: string | null, boundary: 'start' | 'end', fallback: Date): Date {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  // Treat date-only params as full UTC-4 business-day boundaries so same-day
  // snapshots (commonly persisted with non-midnight UTC timestamps) are not excluded.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const day = parseIsoDayKey(trimmed);
    return boundary === 'start' ? day : endOfUtcDay(day);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function dateKeyUtc(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function parseIsoDayKey(dayKey: string): Date {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(`${dayKey}T00:00:00.000Z`);
  }
  // UTC-4 midnight is 04:00 UTC.
  return new Date(Date.UTC(year, month - 1, day, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
}

/** GL posting dates from (exclusive) min(request range start, anchor) through max(request range end, anchor). */
function getCashMovementDateFilterForSheetAnchor(
  rangeStart: Date,
  rangeEnd: Date,
  anchorDay: Date
): { gte: Date; lte: Date } {
  const rs = startOfUtcDay(rangeStart);
  const re = startOfUtcDay(rangeEnd);
  const a = startOfUtcDay(anchorDay);
  const minDay = rs.getTime() < a.getTime() ? rs : a;
  const maxDay = re.getTime() > a.getTime() ? re : a;
  return {
    gte: new Date(minDay.getTime() + 24 * 60 * 60 * 1000),
    lte: maxDay,
  };
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

function shiftToBusinessTz(date: Date): Date {
  return new Date(date.getTime() + BUSINESS_TZ_OFFSET_MS);
}

function startOfBusinessMonth(date: Date): Date {
  const shifted = shiftToBusinessTz(date);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
}

function startOfBusinessQuarter(date: Date): Date {
  const shifted = shiftToBusinessTz(date);
  const quarterStartMonth = Math.floor(shifted.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(shifted.getUTCFullYear(), quarterStartMonth, 1, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
}

function startOfBusinessYear(date: Date): Date {
  const shifted = shiftToBusinessTz(date);
  return new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
}

function businessMonthKey(date: Date): string {
  const shifted = shiftToBusinessTz(date);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStartFromBusinessMonthKey(key: string): Date {
  const [yearRaw, monthRaw] = String(key || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return startOfBusinessMonth(new Date());
  }
  return new Date(Date.UTC(year, month - 1, 1, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
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

function startOfBusinessQuarterByDate(date: Date): Date {
  const shifted = shiftToBusinessTz(date);
  const quarterStartMonth = Math.floor(shifted.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(shifted.getUTCFullYear(), quarterStartMonth, 1, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
}

function endOfBusinessQuarterByDate(date: Date): Date {
  const start = startOfBusinessQuarterByDate(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0, 23, 59, 59, 999));
}

function startOfBusinessYearByDate(date: Date): Date {
  const shifted = shiftToBusinessTz(date);
  return new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1, BUSINESS_TZ_START_HOUR_UTC, 0, 0, 0));
}

function endOfBusinessYearByDate(date: Date): Date {
  const start = startOfBusinessYearByDate(date);
  return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 0, 23, 59, 59, 999));
}

function statementRollupKey(date: Date, rollup: StatementRollup): string {
  const shifted = shiftToBusinessTz(date);
  if (rollup === 'daily') {
    return dateKeyUtc(date);
  }
  if (rollup === 'quarterly') {
    const quarter = Math.floor(shifted.getUTCMonth() / 3) + 1;
    return `${shifted.getUTCFullYear()}-Q${quarter}`;
  }
  return String(shifted.getUTCFullYear());
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

  // Age by due date first, then invoice date.
  // AR view uses 1-30 as all <=30 (Current intentionally unused/zeroed).
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
      days1to30: openAmount,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const invoiceAgeDays = Math.floor((startOfUtcDay(asOfDate).getTime() - startOfUtcDay(agingAnchor).getTime()) / dayMs);
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

async function getAssetCashMappingTokens(companyId: string): Promise<Set<string>> {
  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { in: ['cash', 'otherCA'] },
      qbAccountClassification: { in: ['A', 'Asset', 'ASSET', 'asset'] },
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
    },
  });
  const tokens = new Set<string>();
  for (const mapping of mappings) {
    if (
      isExcludedCashControlAccount(mapping.qbAccountId, mapping.qbAccountCode, mapping.qbAccount)
    ) {
      continue;
    }
    for (const rawToken of [mapping.qbAccount, mapping.qbAccountId, mapping.qbAccountCode]) {
      const token = normalizeAccountToken(rawToken);
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

function buildDailyCashSeriesFromMovements(
  anchorRows: Array<{
    snapshotDate: Date;
    accountName: string;
    cashBalance: number;
    accountId?: string | null;
    accountNumber?: string | null;
  }>,
  movementRows: Array<{
    snapshotDate: Date;
    sourceAccountName: string;
    sourceAccountId?: string | null;
    amount: number;
  }>,
  rangeStart: Date,
  rangeEnd: Date
): Array<{
  snapshotDate: Date;
  accountName: string;
  cashBalance: number;
  accountId: string | null;
  accountNumber: string | null;
}> {
  if (!anchorRows.length) return [];
  const anchorDate = startOfUtcDay(anchorRows[0].snapshotDate);
  const start = startOfUtcDay(rangeStart);
  const end = startOfUtcDay(rangeEnd);

  const movementByDateAccount = new Map<string, Map<string, number>>();
  const accountDisplayNames = new Map<string, string>();
  for (const row of movementRows) {
    const dayKey = dateKeyUtc(row.snapshotDate);
    if (!movementByDateAccount.has(dayKey)) movementByDateAccount.set(dayKey, new Map<string, number>());
    const perAccount = movementByDateAccount.get(dayKey)!;
    const accountName = String(row.sourceAccountName || '').trim();
    if (isExcludedCashControlAccount(row.sourceAccountId, null, accountName)) continue;
    const accountKey = accountKeyFromParts(row.sourceAccountId, null, accountName);
    if (!accountKey) continue;
    if (accountName && !accountDisplayNames.has(accountKey)) accountDisplayNames.set(accountKey, accountName);
    perAccount.set(accountKey, Number(perAccount.get(accountKey) || 0) + Number(row.amount || 0));
  }

  const accountUniverse = new Set<string>();
  const anchorBalances = new Map<string, number>();
  for (const row of anchorRows) {
    const accountName = String(row.accountName || '').trim();
    if (!accountName) continue;
    if (/^cash account \d+$/i.test(accountName)) continue;
    if (isExcludedCashControlAccount(row.accountId, row.accountNumber, accountName)) continue;
    const accountKey = accountKeyFromParts(row.accountId, row.accountNumber, accountName);
    if (!accountKey) continue;
    accountUniverse.add(accountKey);
    anchorBalances.set(accountKey, Number(row.cashBalance || 0));
    if (!accountDisplayNames.has(accountKey)) accountDisplayNames.set(accountKey, accountName);
  }
  for (const row of movementRows) {
    const accountName = String(row.sourceAccountName || '').trim();
    if (!accountName) continue;
    if (/^cash account \d+$/i.test(accountName)) continue;
    if (isExcludedCashControlAccount(row.sourceAccountId, null, accountName)) continue;
    const accountKey = accountKeyFromParts(row.sourceAccountId, null, accountName);
    if (!accountKey) continue;
    accountUniverse.add(accountKey);
    if (!anchorBalances.has(accountKey)) anchorBalances.set(accountKey, 0);
    if (!accountDisplayNames.has(accountKey)) accountDisplayNames.set(accountKey, accountName);
  }

  if (accountUniverse.size === 0) return [];

  const balancesByDate = new Map<string, Map<string, number>>();
  const anchorKey = dateKeyUtc(anchorDate);
  balancesByDate.set(anchorKey, new Map(anchorBalances));

  // Backfill prior dates from anchor using movement deltas.
  for (
    let cursor = new Date(anchorDate.getTime() - 24 * 60 * 60 * 1000);
    cursor.getTime() >= start.getTime();
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  ) {
    const dayKey = dateKeyUtc(cursor);
    const nextKey = dateKeyUtc(new Date(cursor.getTime() + 24 * 60 * 60 * 1000));
    const nextBalances = balancesByDate.get(nextKey) || new Map<string, number>();
    const movementOnNext = movementByDateAccount.get(nextKey) || new Map<string, number>();
    const reconstructed = new Map<string, number>();
    for (const accountKey of accountUniverse) {
      const nextValue = Number(nextBalances.get(accountKey) || 0);
      const deltaOnNext = Number(movementOnNext.get(accountKey) || 0);
      reconstructed.set(accountKey, nextValue - deltaOnNext);
    }
    balancesByDate.set(dayKey, reconstructed);
  }

  // Roll forward dates after anchor.
  for (
    let cursor = new Date(anchorDate.getTime() + 24 * 60 * 60 * 1000);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dayKey = dateKeyUtc(cursor);
    const prevKey = dateKeyUtc(new Date(cursor.getTime() - 24 * 60 * 60 * 1000));
    const prevBalances = balancesByDate.get(prevKey) || new Map<string, number>();
    const movementOnDay = movementByDateAccount.get(dayKey) || new Map<string, number>();
    const rolled = new Map<string, number>();
    for (const accountKey of accountUniverse) {
      const prevValue = Number(prevBalances.get(accountKey) || 0);
      const delta = Number(movementOnDay.get(accountKey) || 0);
      rolled.set(accountKey, prevValue + delta);
    }
    balancesByDate.set(dayKey, rolled);
  }

  const rows: Array<{
    snapshotDate: Date;
    accountName: string;
    cashBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }> = [];
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dayKey = dateKeyUtc(cursor);
    const balances = balancesByDate.get(dayKey);
    if (!balances) continue;
    for (const accountKey of accountUniverse) {
      const accountName = accountDisplayNames.get(accountKey) || accountKey;
      const accountId = accountKey.startsWith('id:') ? accountKey.slice(3) : null;
      const accountNumber = accountKey.startsWith('num:') ? accountKey.slice(4) : null;
      rows.push({
        snapshotDate: parseIsoDayKey(dayKey),
        accountName,
        cashBalance: Number(balances.get(accountKey) || 0),
        accountId,
        accountNumber,
      });
    }
  }
  return rows;
}

/**
 * Roll-forward AP from TB anchor using event-based sources:
 *   1. APTransactionFact (voucher events from SLVCHHDRS) — normalizedAmount already signed
 *   2. GLTransactionFact (APP payment entries) — signedAmount is positive (debit), negate for AP
 *
 * AP_day = anchor + SUM(voucher.normalizedAmount) + SUM(-payment.signedAmount)
 *
 * Events are keyed by `eventDate` / `transDate` (the accounting date from DistDate on vouchers,
 * not the GL posting date), which aligns with the AP trial balance.
 */
function buildDailyApSeriesFromEvents(
  anchorBalance: number,
  anchorDate: Date,
  voucherEvents: Array<{ eventDate: Date; normalizedAmount: number }>,
  paymentEvents: Array<{ transDate: Date; signedAmount: number }>,
  rangeStart: Date,
  rangeEnd: Date
): Array<{
  snapshotDate: Date;
  accountName: string;
  apBalance: number;
  accountId: string | null;
  accountNumber: string | null;
}> {
  const anchor = startOfUtcDay(anchorDate);
  const start = startOfUtcDay(rangeStart);
  const end = startOfUtcDay(rangeEnd);

  const deltaByDay = new Map<string, number>();
  for (const v of voucherEvents) {
    const key = dateKeyUtc(v.eventDate);
    deltaByDay.set(key, (deltaByDay.get(key) || 0) + Number(v.normalizedAmount || 0));
  }
  for (const p of paymentEvents) {
    const key = dateKeyUtc(p.transDate);
    deltaByDay.set(key, (deltaByDay.get(key) || 0) + (-Number(p.signedAmount || 0)));
  }

  const balancesByDate = new Map<string, number>();
  const anchorKey = dateKeyUtc(anchor);
  balancesByDate.set(anchorKey, anchorBalance);

  const DAY_MS = 24 * 60 * 60 * 1000;

  for (
    let cursor = new Date(anchor.getTime() - DAY_MS);
    cursor.getTime() >= start.getTime();
    cursor = new Date(cursor.getTime() - DAY_MS)
  ) {
    const dayKey = dateKeyUtc(cursor);
    const nextKey = dateKeyUtc(new Date(cursor.getTime() + DAY_MS));
    const nextBal = balancesByDate.get(nextKey) || 0;
    const deltaOnNext = deltaByDay.get(nextKey) || 0;
    balancesByDate.set(dayKey, nextBal - deltaOnNext);
  }

  for (
    let cursor = new Date(anchor.getTime() + DAY_MS);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const dayKey = dateKeyUtc(cursor);
    const prevKey = dateKeyUtc(new Date(cursor.getTime() - DAY_MS));
    const prevBal = balancesByDate.get(prevKey) || 0;
    const delta = deltaByDay.get(dayKey) || 0;
    balancesByDate.set(dayKey, prevBal + delta);
  }

  const rows: Array<{
    snapshotDate: Date;
    accountName: string;
    apBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }> = [];
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const dayKey = dateKeyUtc(cursor);
    if (!balancesByDate.has(dayKey)) continue;
    rows.push({
      snapshotDate: parseIsoDayKey(dayKey),
      accountName: 'Accounts Payable',
      apBalance: balancesByDate.get(dayKey) || 0,
      accountId: '30100',
      accountNumber: '30100',
    });
  }
  return rows;
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

function aggregateCashSeriesByFrequency(
  rows: Array<{
    snapshotDate: Date;
    accountName: string;
    cashBalance: number;
    accountId: string | null;
    accountNumber: string | null;
  }>,
  frequency: 'daily' | 'weekly' | 'monthly'
): Array<{
  snapshotDate: Date;
  accountName: string;
  cashBalance: number;
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
        cashBalance: number;
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
    cashBalance: number;
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
 * - type: 'customers' | 'ar-aging' | 'ap-aging' | 'products' | 'inventory' | 'cash' | 'ap' | 'daily-financials' | 'cash-flow-map'
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

    let data;

    switch (type) {
      case 'customers': {
        const isInforCompany =
          normalizedAccountingSystem === 'INFOR_M3' || normalizedAccountingSystem === 'INFOR_CSI';
        const customerFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          isInforCompany && frequency !== 'daily' ? 'daily' : frequency;
        const orderLineFrequencyForQuery: 'daily' | 'weekly' | 'monthly' =
          isInforCompany && frequency !== 'daily' ? 'daily' : frequency;

        // --- Track 1: Sales snapshots + bookings aggregation ---
        const fetchSalesAndBookings = async () => {
          let salesData = await prisma.customerSalesSnapshot.findMany({
            where: {
              companyId,
              frequency: customerFrequencyForQuery,
              snapshotDate: { gte: startDate, lte: endDate },
            },
            orderBy: { snapshotDate: 'asc' },
            take: 50000,
          });
          const basis: 'orderline_delta' | 'customer_sales_snapshot' = salesData.length > 0 ? 'customer_sales_snapshot' : 'orderline_delta';
          if (salesData.length === 0) {
            salesData = await deriveCustomerSalesFromOrderLineDeltas(companyId, orderLineFrequencyForQuery, startDate, endDate);
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
          const topCustomersSummary = Object.values(customerTotals)
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
              orderBy: [{ contractValue: 'desc' }],
              take: 300000,
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
              const rawRows = await (prisma as any).inforRawRecord.findMany({
                where: {
                  companyId,
                  platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
                  miProgram: { in: ['SLCOITEMS', 'SLCoitems'] },
                  businessDate: latestOrderSnapshotDate,
                },
                select: {
                  payload: true,
                },
                take: 200000,
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
              const rawDueDate = rawDetail?.dueDate ? new Date(rawDetail.dueDate.replace(/\s+\d{2}:\d{2}:\d{2}\.\d+$/, '')) : null;
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
            wipTopCustomers = allWipCustomers.slice(0, 10).map((row) => ({
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
              take: 500000,
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
                  take: 500000,
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
        const [salesResult, wipResult, arResult] = await Promise.all([
          fetchSalesAndBookings(),
          fetchWip(),
          fetchArOverview(),
        ]);

        data = salesResult.salesData;

        return NextResponse.json({
          records: data,
          summary: {
            topCustomers: salesResult.topCustomersSummary,
            customerDataBasis: salesResult.basis,
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
              date_trunc('day', d."invoiceDate") AS invoice_day
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
              invoice_day,
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
                WHEN invoice_day IS NULL THEN NULL
                ELSE GREATEST(
                  FLOOR(
                    EXTRACT(
                      EPOCH FROM (day - invoice_day)
                    ) / 86400
                  ),
                  0
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
              0::double precision AS "current",
              SUM(CASE WHEN age_days IS NULL OR age_days <= 30 THEN amount_due ELSE 0 END)::double precision AS "days1to30",
              SUM(CASE WHEN age_days > 30 AND age_days <= 60 THEN amount_due ELSE 0 END)::double precision AS "days31to60",
              SUM(CASE WHEN age_days > 60 AND age_days <= 90 THEN amount_due ELSE 0 END)::double precision AS "days61to90",
              SUM(CASE WHEN age_days > 90 THEN amount_due ELSE 0 END)::double precision AS "days90plus"
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
            .slice(0, 25) as any[];
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
              CASE
                WHEN COALESCE(due_day, invoice_day) IS NULL THEN NULL
                ELSE GREATEST(
                  FLOOR(
                    EXTRACT(EPOCH FROM (day - COALESCE(due_day, invoice_day))) / 86400
                  ),
                  0
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
                  WHEN invoice_age_days <= 30 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "current",
              0::double precision AS "days1to30",
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
            .slice(0, 25) as any[];

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
          take: Math.max(limit * 20, 50000),
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
            .slice(0, 25);
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

        return NextResponse.json({
          records: data,
          summary: {
            totalAR: Number(summaryTotals.totalAR || 0),
            totalOpenAR: Number(summaryTotals.totalAR || 0),
            contractAR: Number(sourceClassTotals.contractAR || 0),
            nonContractAR: Number(sourceClassTotals.nonContractAR || 0),
            unknownSourceAR: Number(sourceClassTotals.unknownSourceAR || 0),
            currentPct: Number(currentPct),
            over30Pct: Number(over30Pct),
            over90Pct: Number(over90Pct),
            dso: Number(dso || 0),
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
                  ? ((latestAP.days1to30 + latestAP.days31to60 + latestAP.days61to90 + latestAP.days90plus) /
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
              SUM(CASE WHEN age_days <= 30 THEN "amountDueHome" ELSE 0 END)::double precision AS "current",
              0::double precision AS "days1to30",
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
                SUM(CASE WHEN age_days <= 0 THEN "amountDueHome" ELSE 0 END)::double precision AS "current",
                SUM(CASE WHEN age_days BETWEEN 1 AND 30 THEN "amountDueHome" ELSE 0 END)::double precision AS "days1to30",
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
                if (ageDays <= 0) bucket.current += openAmount;
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
        const apPaymentRows = await (prisma as any).aPPaymentFact.findMany({
          where: {
            companyId,
            paymentDate: {
              gte: apTrailing12Start,
              lte: endDate,
            },
          },
          orderBy: [{ paymentDate: 'desc' }],
          take: Math.max(limit * 5, 2000),
        });

        if (apPaymentRows.length) {
          const grouped = apPaymentRows.reduce((acc: Record<string, any>, row: any) => {
            const name = row.vendorName || 'Unknown Vendor';
            if (!acc[name]) {
              acc[name] = {
                vendorName: name,
                currentMonth: 0,
                lastMonth: 0,
                last12Months: 0,
              };
            }
            const dt = new Date(row.paymentDate);
            const amount = Number(row.paidAmountHome || 0);
            if (dt >= apMonthStart && dt <= endDate) acc[name].currentMonth += amount;
            if (dt >= apLastMonthStart && dt < apMonthStart) acc[name].lastMonth += amount;
            if (dt >= apTrailing12Start && dt <= endDate) acc[name].last12Months += amount;
            return acc;
          }, {});
          paidBills = Object.values(grouped)
            .sort((a: any, b: any) => b.last12Months - a.last12Months)
            .slice(0, 25) as any[];
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
          const anchorDayAp = startOfUtcDay(new Date(`${apAnchorCfgForTrend.anchorDateIso}T12:00:00.000Z`));
          const apMovWhere = getCashMovementDateFilterForSheetAnchor(startDate, endDate, anchorDayAp);
          if (apMovWhere.gte.getTime() <= apMovWhere.lte.getTime()) {
            const apFactDelegateForTrend = (prisma as any).aPTransactionFact;
            const glFactDelegateForTrend = (prisma as any).gLTransactionFact;
            const trendVouchers: Array<{ eventDate: Date; normalizedAmount: number }> = apFactDelegateForTrend
              ? await apFactDelegateForTrend.findMany({
                  where: { companyId, apAcct: anchorAccountForTrend.accountId, eventDate: apMovWhere },
                  select: { eventDate: true, normalizedAmount: true },
                  orderBy: [{ eventDate: 'asc' }],
                })
              : [];
            const trendPayments: Array<{ transDate: Date; signedAmount: number }> = glFactDelegateForTrend
              ? await glFactDelegateForTrend.findMany({
                  where: {
                    companyId,
                    accountId: anchorAccountForTrend.accountId,
                    OR: [{ ref: { startsWith: 'APP' } }, { ref: { startsWith: 'APA' } }],
                    transDate: apMovWhere,
                  },
                  select: { transDate: true, signedAmount: true },
                  orderBy: [{ transDate: 'asc' }],
                })
              : [];
            if (trendVouchers.length > 0 || trendPayments.length > 0) {
              const dailyGlAp = buildDailyApSeriesFromEvents(
                anchorAccountForTrend.apBalance,
                anchorDayAp,
                trendVouchers,
                trendPayments,
                startDate,
                endDate
              );
              const glApTotalByDay = new Map<string, number>();
              for (const row of dailyGlAp) {
                const k = dateKeyUtc(new Date(row.snapshotDate));
                glApTotalByDay.set(k, Number(glApTotalByDay.get(k) || 0) + Number(row.apBalance || 0));
              }
              if (glApTotalByDay.size > 0) {
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
                const periodLatestGl = new Map<string, { snapshotDate: Date; total: number }>();
                for (const dayKey of Array.from(glApTotalByDay.keys()).sort()) {
                  const total = Number(glApTotalByDay.get(dayKey) || 0);
                  const pk = toPeriodKeyFromDayKey(dayKey);
                  const d = parseIsoDayKey(dayKey);
                  const next = { snapshotDate: d, total };
                  const existing = periodLatestGl.get(pk);
                  if (!existing || next.snapshotDate.getTime() > existing.snapshotDate.getTime()) {
                    periodLatestGl.set(pk, next);
                  }
                }
                data = Array.from(periodLatestGl.values())
                  .sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime())
                  .slice(0, limit)
                  .map((row) => ({
                    snapshotDate: row.snapshotDate,
                    frequency: apFrequencyForQuery,
                    totalAP: row.total,
                    current: row.total,
                    days1to30: 0,
                    days31to60: 0,
                    days61to90: 0,
                    days90plus: 0,
                  })) as any;
                latestAP = data[0];
                apMetrics = latestAP
                  ? {
                      totalAP: latestAP.totalAP,
                      currentPct:
                        latestAP.totalAP > 0 ? (latestAP.current / latestAP.totalAP) * 100 : 0,
                      over30Pct:
                        latestAP.totalAP > 0
                          ? ((latestAP.days1to30 +
                              latestAP.days31to60 +
                              latestAP.days61to90 +
                              latestAP.days90plus) /
                              latestAP.totalAP) *
                            100
                          : 0,
                      over90Pct:
                        latestAP.totalAP > 0 ? (latestAP.days90plus / latestAP.totalAP) * 100 : 0,
                      dpo: calculateDPO(data),
                    }
                  : apMetrics;
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

        const effectiveApMetrics = computedApFromOpen && !apGlAnchorApplied
          ? {
              totalAP: Number(computedApFromOpen.totalAP || 0),
              currentPct:
                computedApFromOpen.totalAP > 0
                  ? (Number(computedApFromOpen.current || 0) / Number(computedApFromOpen.totalAP || 0)) * 100
                  : 0,
              over30Pct:
                computedApFromOpen.totalAP > 0
                  ? ((Number(computedApFromOpen.days1to30 || 0) +
                      Number(computedApFromOpen.days31to60 || 0) +
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

        return NextResponse.json({
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
        const productRowCap = Math.max(Math.min(boundedLimit * 30, 30000), 8000);
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

        // GL allocation bridge for freight and other-revenue proxy lines.
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
          const freightByDay = new Map<string, number>();
          const otherRevenueByDay = new Map<string, number>();
          for (const line of mappedRows) {
            const day = productIsoDay(line.snapshotDate);
            const amount = Math.abs(Number(line.amount || 0));
            if (!Number.isFinite(amount) || amount === 0) continue;
            const text = `${String(line.targetField || '')} ${String(line.sourceAccountName || '')}`.toLowerCase();
            const isFreight =
              text.includes('freight') || text.includes('shipping') || text.includes('delivery');
            const isOtherRevenue =
              text.includes('other revenue') ||
              text.includes('misc') ||
              text.includes('surcharge') ||
              text.includes('handling');
            if (isFreight) {
              freightByDay.set(day, Number(freightByDay.get(day) || 0) + amount);
            } else if (isOtherRevenue) {
              otherRevenueByDay.set(day, Number(otherRevenueByDay.get(day) || 0) + amount);
            }
          }

          const rowIndexesByDay = new Map<string, number[]>();
          for (let idx = 0; idx < recordsV1.length; idx += 1) {
            const row = recordsV1[idx];
            const day = productIsoDay(row.snapshotDate);
            if (!rowIndexesByDay.has(day)) rowIndexesByDay.set(day, []);
            rowIndexesByDay.get(day)!.push(idx);
          }
          for (const [day, indexes] of rowIndexesByDay.entries()) {
            if (!indexes.length) continue;
            const totalFreight = Number(freightByDay.get(day) || 0);
            const totalOtherRevenue = Number(otherRevenueByDay.get(day) || 0);
            if (totalFreight <= 0 && totalOtherRevenue <= 0) continue;
            const bases = indexes.map((idx) => Math.max(0, Number(recordsV1[idx].revenue || 0)));
            const totalBase = bases.reduce((sum, n) => sum + n, 0);
            if (totalBase > 0) {
              indexes.forEach((idx, i) => {
                const weight = bases[i] / totalBase;
                if (totalFreight > 0) recordsV1[idx].freightAllocated = weight * totalFreight;
                if (totalOtherRevenue > 0) recordsV1[idx].otherRevenueAllocated = weight * totalOtherRevenue;
              });
            } else {
              const freightEven = totalFreight > 0 ? totalFreight / indexes.length : 0;
              const otherEven = totalOtherRevenue > 0 ? totalOtherRevenue / indexes.length : 0;
              indexes.forEach((idx) => {
                if (freightEven > 0) recordsV1[idx].freightAllocated = freightEven;
                if (otherEven > 0) recordsV1[idx].otherRevenueAllocated = otherEven;
              });
            }
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

        return NextResponse.json({
          records: data,
          summary: {
            topProducts: topProductsSummary,
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
            take: 500000,
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
          take: 400000,
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
          return NextResponse.json({
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

        return NextResponse.json({
          records: latestInventoryBySku,
          trend: inventoryTrendDaily,
          unitCostHistory,
          agingReport,
          summary: inventoryMetrics,
        });

      case 'cash':
        // Canonical cash series comes from GL-derived cash movements.
        data = [];
        const observedCashHistory = await prisma.cashSnapshot.findMany({
          where: {
            companyId,
            frequency: 'daily',
            snapshotDate: dateFilter,
          },
          orderBy: [{ snapshotDate: 'asc' }, { createdAt: 'desc' }],
          select: {
            snapshotDate: true,
            accountName: true,
            accountId: true,
            accountNumber: true,
            cashBalance: true,
          },
          take: Math.max(limit * 200, 20000),
        });
        let observedDaily: Array<{
          snapshotDate: Date;
          accountName: string;
          cashBalance: number;
          accountId: string | null;
          accountNumber: string | null;
        }> = [];
        if (observedCashHistory.length > 0) {
          const seenByDateAccount = new Set<string>();
          for (const row of observedCashHistory) {
            const accountName = String(row.accountName || '').trim();
            if (!accountName || /^cash account \d+$/i.test(accountName)) continue;
            if (isExcludedCashControlAccount(row.accountId, row.accountNumber, accountName)) continue;
            const accountKey = accountKeyFromParts(row.accountId, row.accountNumber, accountName);
            if (!accountKey) continue;
            const dayKey = dateKeyUtc(new Date(row.snapshotDate));
            const dedupeKey = `${dayKey}|${accountKey}`;
            // Query ordering keeps newest created row first for each day/account.
            if (seenByDateAccount.has(dedupeKey)) continue;
            seenByDateAccount.add(dedupeKey);
            observedDaily.push({
              snapshotDate: parseIsoDayKey(dayKey),
              accountName,
              cashBalance: Number(row.cashBalance || 0),
              accountId: row.accountId ? String(row.accountId) : null,
              accountNumber: row.accountNumber ? String(row.accountNumber) : null,
            });
          }
          observedDaily = observedDaily.sort((a, b) => {
            const dt = a.snapshotDate.getTime() - b.snapshotDate.getTime();
            if (dt !== 0) return dt;
            return a.accountName.localeCompare(b.accountName);
          });
        }
        const cashMappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
        let syntheticDaily: Array<{
          snapshotDate: Date;
          accountName: string;
          cashBalance: number;
          accountId: string | null;
          accountNumber: string | null;
        }> = [];
        if (cashMappedLineDelegate) {
          const sheetAnchorCfg = getCashBalanceSheetAnchorConfig(companyId);
          const anchorDayForMovements = sheetAnchorCfg
            ? startOfUtcDay(new Date(`${sheetAnchorCfg.anchorDateIso}T12:00:00.000Z`))
            : null;
          const movementDateWhere =
            sheetAnchorCfg && anchorDayForMovements
              ? getCashMovementDateFilterForSheetAnchor(startDate, endDate, anchorDayForMovements)
              : dateFilter;
          const movementRows =
            !sheetAnchorCfg ||
            !anchorDayForMovements ||
            movementDateWhere.gte.getTime() <= movementDateWhere.lte.getTime()
              ? await cashMappedLineDelegate.findMany({
                  where: {
                    companyId,
                    frequency: 'daily',
                    targetField: 'balance_movement:cash',
                    snapshotDate: movementDateWhere,
                  },
                  select: {
                    snapshotDate: true,
                    sourceAccountName: true,
                    sourceAccountId: true,
                    amount: true,
                  },
                  orderBy: [{ snapshotDate: 'asc' }],
                  take: Math.max(limit * 50, 5000),
                })
              : [];
          if (movementRows.length > 0) {
            if (sheetAnchorCfg && anchorDayForMovements) {
              const anchorRows = sheetAnchorCfg.accounts.map((a) => ({
                snapshotDate: anchorDayForMovements,
                accountName: a.accountName,
                cashBalance: a.cashBalance,
                accountId: a.accountId,
                accountNumber: a.accountNumber,
              }));
              syntheticDaily = buildDailyCashSeriesFromMovements(
                anchorRows,
                movementRows,
                startDate,
                endDate
              );
            } else {
              const anchorHistory = await prisma.cashSnapshot.findMany({
                where: {
                  companyId,
                  frequency: 'daily',
                  snapshotDate: { lte: endDate },
                },
                orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
                select: {
                  snapshotDate: true,
                  accountName: true,
                  accountId: true,
                  accountNumber: true,
                  cashBalance: true,
                },
                take: 10000,
              });
              if (anchorHistory.length > 0) {
                // Build anchors from one consistent snapshot day. Mixing account rows
                // across different days can distort reconstructed balances.
                const anchorsByDay = new Map<string, Map<string, (typeof anchorHistory)[number]>>();
                for (const row of anchorHistory) {
                  const accountName = String(row.accountName || '').trim();
                  if (!accountName || /^cash account \d+$/i.test(accountName)) continue;
                  const key = accountKeyFromParts(row.accountId, row.accountNumber, row.accountName);
                  if (!key) continue;
                  const dayKey = dateKeyUtc(new Date(row.snapshotDate));
                  if (!anchorsByDay.has(dayKey)) anchorsByDay.set(dayKey, new Map<string, (typeof anchorHistory)[number]>());
                  const perDay = anchorsByDay.get(dayKey)!;
                  // anchorHistory is ordered snapshotDate desc, createdAt desc.
                  if (!perDay.has(key)) perDay.set(key, row);
                }
                const latestAnchorDay = Array.from(anchorsByDay.keys()).sort((a, b) => b.localeCompare(a))[0];
                if (latestAnchorDay) {
                  const anchorRows = Array.from(anchorsByDay.get(latestAnchorDay)!.values());
                  syntheticDaily = buildDailyCashSeriesFromMovements(anchorRows, movementRows, startDate, endDate);
                }
              }
            }
          }
        }
        if (observedDaily.length > 0 || syntheticDaily.length > 0) {
          const dayMs = 24 * 60 * 60 * 1000;
          const expectedWindowDays = Math.max(
            1,
            Math.floor((startOfUtcDay(endDate).getTime() - startOfUtcDay(startDate).getTime()) / dayMs) + 1
          );
          const uniqueDayCount = (
            rows: Array<{
              snapshotDate: Date;
              accountName: string;
              cashBalance: number;
              accountId: string | null;
              accountNumber: string | null;
            }>
          ): number => {
            const seen = new Set<string>();
            for (const row of rows) {
              seen.add(dateKeyUtc(new Date(row.snapshotDate)));
            }
            return seen.size;
          };
          const uniqueBalanceCount = (
            rows: Array<{
              snapshotDate: Date;
              accountName: string;
              cashBalance: number;
              accountId: string | null;
              accountNumber: string | null;
            }>
          ): number => {
            const values = new Set<string>();
            for (const row of rows) values.add(Number(row.cashBalance || 0).toFixed(4));
            return values.size;
          };

          const mergeKeyForCashRow = (
            row: {
              accountName: string;
              accountId: string | null;
              accountNumber: string | null;
            }
          ): string => {
            return (
              accountKeyFromParts(row.accountId, row.accountNumber, row.accountName) ||
              (() => {
                const nameKey = normalizeAccountNameForKey(String(row.accountName || ''));
                return nameKey ? `name:${nameKey}` : String(row.accountName || '').trim().toLowerCase();
              })()
            );
          };

          const observedByAccount = new Map<string, typeof observedDaily>();
          for (const row of observedDaily) {
            const accountKey = accountKeyFromParts(row.accountId, row.accountNumber, row.accountName);
            if (!accountKey) continue;
            if (!observedByAccount.has(accountKey)) observedByAccount.set(accountKey, []);
            observedByAccount.get(accountKey)!.push(row);
          }
          const syntheticByAccount = new Map<string, typeof syntheticDaily>();
          for (const row of syntheticDaily) {
            const accountKey = accountKeyFromParts(row.accountId, row.accountNumber, row.accountName);
            if (!accountKey) continue;
            if (!syntheticByAccount.has(accountKey)) syntheticByAccount.set(accountKey, []);
            syntheticByAccount.get(accountKey)!.push(row);
          }

          // Merge by normalized account name so movement-derived rows can replace
          // stale observed rows even when account IDs are inconsistent/missing.
          const observedByMergeKey = new Map<string, typeof observedDaily>();
          for (const rows of observedByAccount.values()) {
            for (const row of rows) {
              const mergeKey = mergeKeyForCashRow(row);
              if (!observedByMergeKey.has(mergeKey)) observedByMergeKey.set(mergeKey, []);
              observedByMergeKey.get(mergeKey)!.push(row);
            }
          }
          const syntheticByMergeKey = new Map<string, typeof syntheticDaily>();
          for (const rows of syntheticByAccount.values()) {
            for (const row of rows) {
              const mergeKey = mergeKeyForCashRow(row);
              if (!syntheticByMergeKey.has(mergeKey)) syntheticByMergeKey.set(mergeKey, []);
              syntheticByMergeKey.get(mergeKey)!.push(row);
            }
          }

          const allAccountKeys = new Set<string>([
            ...Array.from(observedByMergeKey.keys()),
            ...Array.from(syntheticByMergeKey.keys()),
          ]);
          const chosenRows: typeof observedDaily = [];

          for (const accountKey of allAccountKeys) {
            const observedRows = observedByMergeKey.get(accountKey) || [];
            const syntheticRows = syntheticByMergeKey.get(accountKey) || [];

            // Prefer GL movement-derived history when available. Snapshot-only balances
            // from CSI bank headers can be flat/static across long ranges.
            const selectedRows = syntheticRows.length > 0 ? syntheticRows : observedRows;

            const identityRow =
              [...observedRows, ...syntheticRows].find((row) => row.accountId || row.accountNumber) ||
              observedRows[0] ||
              syntheticRows[0];
            for (const row of selectedRows) {
              chosenRows.push({
                snapshotDate: row.snapshotDate,
                accountName: identityRow?.accountName || row.accountName,
                cashBalance: row.cashBalance,
                accountId: identityRow?.accountId || row.accountId,
                accountNumber: identityRow?.accountNumber || row.accountNumber,
              });
            }
          }

          const dedupedByDateAccount = new Map<
            string,
            {
              snapshotDate: Date;
              accountName: string;
              cashBalance: number;
              accountId: string | null;
              accountNumber: string | null;
            }
          >();
          for (const row of chosenRows) {
            const accountKey = mergeKeyForCashRow(row);
            if (!accountKey) continue;
            const dayKey = dateKeyUtc(new Date(row.snapshotDate));
            dedupedByDateAccount.set(`${dayKey}|${accountKey}`, row);
          }
          const mergedDaily = Array.from(dedupedByDateAccount.values()).sort((a, b) => {
            const dt = a.snapshotDate.getTime() - b.snapshotDate.getTime();
            if (dt !== 0) return dt;
            return a.accountName.localeCompare(b.accountName);
          });
          data = aggregateCashSeriesByFrequency(mergedDaily, frequency) as any;
        }
        const assetCashTokens = await getAssetCashMappingTokens(companyId);
        if (assetCashTokens.size > 0) {
          data = data.map((record) => {
            const balance = Number(record.cashBalance || 0);
            if (!Number.isFinite(balance) || balance >= 0) return record;
            const matchesAssetMappedAccount = [record.accountId, record.accountNumber, record.accountName]
              .map((value) => normalizeAccountToken(String(value || '')))
              .some((token) => token && assetCashTokens.has(token));
            if (!matchesAssetMappedAccount) return record;
            return { ...record, cashBalance: Math.abs(balance) };
          });
        }

        const isGenericCashName = (name: string): boolean =>
          /^cash account \d+$/i.test(name) || /^account \d+$/i.test(name);
        const canonicalizedByDayAccount = new Map<
          string,
          {
            snapshotDate: Date;
            accountName: string;
            cashBalance: number;
            accountId: string | null;
            accountNumber: string | null;
          }
        >();
        const scoreCashRecord = (record: {
          accountName: string;
          cashBalance: number;
          accountId?: string | null;
          accountNumber?: string | null;
        }): number => {
          const hasStructuredId = Boolean(String(record.accountNumber || '').trim() || String(record.accountId || '').trim());
          const hasSpecificName = !isGenericCashName(String(record.accountName || '').trim());
          const hasNonZeroBalance = Math.abs(Number(record.cashBalance || 0)) > 0;
          return (hasStructuredId ? 4 : 0) + (hasSpecificName ? 2 : 0) + (hasNonZeroBalance ? 1 : 0);
        };
        for (const record of data) {
          const accountKey =
            accountKeyFromParts(record.accountId, record.accountNumber, record.accountName) ||
            normalizeAccountNameForKey(String(record.accountName || ''));
          if (!accountKey) continue;
          const dayKey = dateKeyUtc(new Date(record.snapshotDate));
          const compositeKey = `${dayKey}|${accountKey}`;
          const existing = canonicalizedByDayAccount.get(compositeKey);
          if (!existing) {
            canonicalizedByDayAccount.set(compositeKey, record);
            continue;
          }
          const existingScore = scoreCashRecord(existing);
          const currentScore = scoreCashRecord(record);
          if (currentScore > existingScore) {
            canonicalizedByDayAccount.set(compositeKey, record);
            continue;
          }
          if (currentScore === existingScore) {
            const currentAbs = Math.abs(Number(record.cashBalance || 0));
            const existingAbs = Math.abs(Number(existing.cashBalance || 0));
            if (currentAbs > existingAbs) {
              canonicalizedByDayAccount.set(compositeKey, record);
            }
          }
        }
        data = Array.from(canonicalizedByDayAccount.values()).sort(
          (a, b) =>
            new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime() ||
            String(a.accountName || '').localeCompare(String(b.accountName || ''))
        );

        console.log(`💰 Cash API - frequency: ${frequency}, records returned: ${data.length}`);

        // Calculate cash metrics
        const latestCash = data.filter(
          (record) =>
            record.snapshotDate.getTime() === Math.max(...data.map((r) => r.snapshotDate.getTime()))
        );

        const totalCash = latestCash.reduce((sum, record) => sum + record.cashBalance, 0);
        const previousCash = data.filter(
          (record) => {
            const dates = [...new Set(data.map(r => r.snapshotDate.getTime()))].sort((a, b) => b - a);
            return record.snapshotDate.getTime() === dates[1];
          }
        );
        const previousTotal = previousCash.reduce((sum, record) => sum + record.cashBalance, 0);
        const changeAmount = previousTotal ? totalCash - previousTotal : 0;
        const changePercent = previousTotal ? (changeAmount / previousTotal) * 100 : 0;
        const hasCashObservation = latestCash.length > 0;
        const estimatedRunwayWeeks =
          !hasCashObservation
            ? null
            : Math.abs(changeAmount) > 0
              ? (totalCash / Math.abs(changeAmount)) * 4.33
              : totalCash > 0
                ? 999
                : null;

        // Calculate average cash balance over the period
        const accountBalances = data.reduce((acc, record) => {
          if (!acc[record.accountName]) {
            acc[record.accountName] = [];
          }
          acc[record.accountName].push(record.cashBalance);
          return acc;
        }, {} as Record<string, number[]>);

        const accountSummaries = Object.entries(accountBalances).map(([name, balances]) => ({
          accountName: name,
          currentBalance: latestCash.find(r => r.accountName === name)?.cashBalance || 0,
          avgBalance: balances.reduce((sum, b) => sum + b, 0) / balances.length,
          minBalance: Math.min(...balances),
          maxBalance: Math.max(...balances),
        })).sort((a, b) => b.currentBalance - a.currentBalance);

        const cashMetrics = {
          totalCash,
          changeAmount,
          changePercent,
          runwayWeeks: estimatedRunwayWeeks,
          runwaySource: estimatedRunwayWeeks !== null ? 'derived_from_cash_change' : 'unavailable',
          accountCount: latestCash.length,
          accounts: accountSummaries,
          avgTotalCash: data.length > 0 
            ? data.reduce((sum, r) => sum + r.cashBalance, 0) / data.length 
            : 0,
          dailyTotalCash: frequency === 'daily' ? computeDailyCashTotalsByDate(data) : undefined,
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

        return NextResponse.json({
          records: data,
          summary: cashMetrics,
        });

      case 'ap': {
        // KNOWN LIMITATION: monthly closing balance can drift vs CSI TB by an amount
        // bounded by month-boundary voucher activity. Roll-forward sums GLTransactionFact
        // by transDate; CSI's TB uses fiscal ControlPeriod, which SLGLTRANS payloads
        // (9-field thin feed) do not include. SLLedgers (rich feed, has ControlPeriod)
        // is incomplete for recent months on validated companies. Aggregate accuracy is
        // strong (~0.2% over two months); single month-end may be off by ±cross-boundary
        // voucher value. Fix path: complete the SLLedgers re-sync, then switch the AP
        // roll-forward to a (ControlYear, ControlPeriod) filter.
        // See docs/AP_RECONCILIATION_KNOWN_LIMITATIONS.md
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
          const anchorDay = startOfUtcDay(new Date(`${apSheetAnchorCfg.anchorDateIso}T12:00:00.000Z`));
          const movementDateWhere = getCashMovementDateFilterForSheetAnchor(startDate, endDate, anchorDay);

          const apFactDelegate = (prisma as any).aPTransactionFact;
          const glFactDelegate = (prisma as any).gLTransactionFact;

          const voucherEvents: Array<{ eventDate: Date; normalizedAmount: number }> = apFactDelegate
            ? await apFactDelegate.findMany({
                where: {
                  companyId,
                  // apAcct is now backfilled (Phase 2 derivation from GL APV credit-side
                  // restricted to AP-class accounts ^3[0-9]+$) and is populated on every
                  // newly-synced voucher because the SLVchHdrs endpoint URL now requests
                  // ApAcct in its properties= clause. The previous `OR apAcct=null` fallback
                  // is no longer needed and was actively harmful: it pulled in 818 unmatched
                  // synthetic vouchers ($5.4M) that have no GL counterpart.
                  apAcct: anchorAccount.accountId,
                  eventDate: movementDateWhere,
                },
                select: { eventDate: true, normalizedAmount: true },
                orderBy: [{ eventDate: 'asc' }],
              })
            : [];

          const paymentEvents: Array<{ transDate: Date; signedAmount: number }> = glFactDelegate
            ? await glFactDelegate.findMany({
                where: {
                  companyId,
                  accountId: anchorAccount.accountId,
                  OR: [{ ref: { startsWith: 'APP' } }, { ref: { startsWith: 'APA' } }],
                  transDate: movementDateWhere,
                },
                select: { transDate: true, signedAmount: true },
                orderBy: [{ transDate: 'asc' }],
              })
            : [];

          if (voucherEvents.length > 0 || paymentEvents.length > 0) {
            apData = buildDailyApSeriesFromEvents(
              anchorAccount.apBalance,
              anchorDay,
              voucherEvents,
              paymentEvents,
              startDate,
              endDate
            );
          }
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

        return NextResponse.json({
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
          return NextResponse.json({
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
        data = await dailySnapshotDelegate.findMany({
          where: {
            companyId,
            frequency: financialFrequencyForQuery,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        if (!data.length) {
          return NextResponse.json({
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

        const latestDaily = data[0];
        const previousDaily = data[1] || latestDaily;
        const latestRevenue = Number(latestDaily.revenue || 0);
        const latestExpense = Number(latestDaily.expense || 0);
        const latestNet = latestRevenue - latestExpense;
        const previousNet = Number(previousDaily.revenue || 0) - Number(previousDaily.expense || 0);
        const netChange = latestNet - previousNet;
        const mappedLines = dailyMappedLineDelegate
          ? await dailyMappedLineDelegate.findMany({
              where: {
                companyId,
                frequency: financialFrequencyForQuery,
                snapshotDate: dateFilter,
              },
              orderBy: [{ snapshotDate: 'desc' }, { sourceAccountName: 'asc' }],
              take: Math.max(limit * 200, 3000),
            })
          : [];
        const statementRecords = aggregateDailyStatementRows(data, statementRollup);

        return NextResponse.json({
          records: data,
          mappedLines,
          statementRecords,
          summary: {
            latestRevenue,
            latestExpense,
            latestNet,
            latestCash: Number(latestDaily.cash || 0),
            latestAR: Number(latestDaily.ar || 0),
            latestAP: Number(latestDaily.ap || 0),
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
              qbAccountClassification: { in: ['A', 'Asset', 'ASSET', 'asset'] },
            },
            select: {
              qbAccount: true,
              qbAccountId: true,
              qbAccountCode: true,
            },
          });
          const cashAccountTokens = new Set<string>();
          for (const row of cashMappings) {
            if (isExcludedCashControlAccount(row.qbAccountId, row.qbAccountCode, row.qbAccount)) continue;
            for (const token of [row.qbAccountId, row.qbAccountCode, row.qbAccount]) {
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
        // M4: Mock-driven Commitments & Forecast. Reuses the JCC job set so
        // the same companyId presents a consistent portfolio across all four
        // construction tabs. Vista-backed ingestion lands in M6.
        const payload = buildCommitmentsForecastMock(companyId);
        return NextResponse.json({
          records: payload.eacForecast,
          eacForecast: payload.eacForecast,
          commitmentExposure: payload.commitmentExposure,
          changeOrders: payload.changeOrders,
          openCommitments: payload.openCommitments,
          summary: payload.summary,
          meta: payload.meta,
        });
      }

      case 'billing-cash': {
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

      case 'construction-ar': {
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

        return NextResponse.json({
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

