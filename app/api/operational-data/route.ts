import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { buildOperationalMockResponse, buildOperationalMockSummaryCounts } from '@/lib/operations/sector-mock-data';

export const dynamic = 'force-dynamic';

async function companyHasAnyRealOperationalData(companyId: string): Promise<boolean> {
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
    (prisma as any).aPOpenBillSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    (prisma as any).aPPaymentFact.findFirst({ where: { companyId }, select: { id: true } }),
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
  // Current: 0-30, 1-30: 31-60, 31-60: 61-90, 61-90: 91-120, 90+: 121+.
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
      current: openAmount,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const invoiceAgeDays = Math.floor((startOfUtcDay(asOfDate).getTime() - startOfUtcDay(agingAnchor).getTime()) / dayMs);
  if (invoiceAgeDays <= 30) {
    return { totalAR: openAmount, current: openAmount, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  }
  if (invoiceAgeDays <= 60) {
    return { totalAR: openAmount, current: 0, days1to30: openAmount, days31to60: 0, days61to90: 0, days90plus: 0 };
  }
  if (invoiceAgeDays <= 90) {
    return { totalAR: openAmount, current: 0, days1to30: 0, days31to60: openAmount, days61to90: 0, days90plus: 0 };
  }
  if (invoiceAgeDays <= 120) {
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

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay(); // 0=Sun, 1=Mon, ...
  const offset = day === 0 ? -6 : 1 - day; // Monday as week start
  return new Date(dayStart.getTime() + offset * 24 * 60 * 60 * 1000);
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
 * - type: 'customers' | 'ar-aging' | 'ap-aging' | 'products' | 'inventory' | 'cash' | 'daily-financials' | 'cash-flow-map'
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
    const frequency = (searchParams.get('frequency') || 'monthly') as 'daily' | 'weekly' | 'monthly';
    const limit = parseInt(searchParams.get('limit') || '1000');
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
    // Hard guard: once a company is on real operational data, never serve mock payloads.
    // This prevents mixed real+mock experiences if a stale demo flag remains enabled.
    const shouldUseMockData =
      company.forceOperationalMockData === true && hasRealOperationalData !== true;

    const sectorCategory = sectorCategoryParam || company?.industrySectorCategory || '01';

    // Build date filter
    const dateFilter = {
      gte: startDate,
      lte: endDate,
    };

    let data;

    switch (type) {
      case 'customers':
        // Get customer sales data for the full requested date window.
        // Do not cap with `take` here; KPI totals and coverage must reflect the
        // selected From/To range, not only the newest N customer rows.
        data = await prisma.customerSalesSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: [{ snapshotDate: 'asc' }, { customerName: 'asc' }],
        });

        const hasNonZeroCustomerSales = data.some(
          (record) => Number(record.revenue || 0) !== 0 || Number(record.invoiceCount || 0) !== 0
        );

        // Fallback for tenants where CustomerSalesSnapshot rows exist but revenue/invoice
        // are not populated yet: derive customer revenue from order-line snapshots.
        // Important: emit rows at business period dates (orderDate when present), not
        // a single endDate stamp, so all customer charts/tables can period-group correctly.
        if (!hasNonZeroCustomerSales) {
          const orderLineDelegate = (prisma as any).customerOrderLineSnapshot;
          if (orderLineDelegate?.findMany) {
            const orderRows = await orderLineDelegate.findMany({
              where: {
                companyId,
                frequency,
                snapshotDate: { lte: endDate },
              },
              select: {
                snapshotDate: true,
                orderDate: true,
                customerId: true,
                customerName: true,
                orderId: true,
                lineId: true,
                contractValue: true,
                invoicedAmount: true,
              },
              orderBy: [{ snapshotDate: 'asc' }],
              take: 250000,
            });

            const latestLineSnapshot = new Map<
              string,
              {
                snapshotDate: Date;
                effectiveDate: Date;
                customerId: string | null;
                customerName: string;
                orderId: string;
                lineId: string;
                invoicedAmount: number;
                contractValue: number;
              }
            >();

            for (const row of orderRows as any[]) {
              const snapshotDate = new Date(row.snapshotDate || row.orderDate);
              if (Number.isNaN(snapshotDate.getTime())) continue;
              if (snapshotDate > endDate) continue;
              const orderDateRaw = row.orderDate ? new Date(row.orderDate) : null;
              const effectiveDate =
                orderDateRaw && !Number.isNaN(orderDateRaw.getTime())
                  ? orderDateRaw
                  : snapshotDate;
              if (effectiveDate < startDate || effectiveDate > endDate) continue;
              const customerName = String(row.customerName || 'Unknown Customer');
              const customerId = row.customerId ? String(row.customerId) : null;
              const orderId = String(row.orderId || '').trim() || 'UNKNOWN_ORDER';
              const lineId = String(row.lineId || '').trim() || 'UNKNOWN_LINE';
              const key = `${customerId || customerName.toLowerCase()}|${orderId}|${lineId}`;
              const existing = latestLineSnapshot.get(key);
              if (!existing || snapshotDate >= existing.snapshotDate) {
                latestLineSnapshot.set(key, {
                  snapshotDate,
                  effectiveDate,
                  customerId,
                  customerName,
                  orderId,
                  lineId,
                  invoicedAmount: Number(row.invoicedAmount || 0),
                  contractValue: Number(row.contractValue || 0),
                });
              }
            }

            const customerDayAgg = new Map<
              string,
              {
                snapshotDate: Date;
                customerId: string | null;
                customerName: string;
                revenue: number;
                orderIds: Set<string>;
              }
            >();

            for (const state of latestLineSnapshot.values()) {
              const recognizedRevenue = state.invoicedAmount > 0 ? state.invoicedAmount : state.contractValue;
              if (recognizedRevenue <= 0) continue;
              const dayKey = state.effectiveDate.toISOString().slice(0, 10);
              const customerKey = `${state.customerId || ''}|${state.customerName.toLowerCase()}|${dayKey}`;
              if (!customerDayAgg.has(customerKey)) {
                customerDayAgg.set(customerKey, {
                  snapshotDate: new Date(`${dayKey}T00:00:00.000Z`),
                  customerId: state.customerId,
                  customerName: state.customerName,
                  revenue: 0,
                  orderIds: new Set<string>(),
                });
              }
              const acc = customerDayAgg.get(customerKey)!;
              acc.revenue += recognizedRevenue;
              acc.orderIds.add(state.orderId);
            }

            data = Array.from(customerDayAgg.values())
              .map((row) => ({
                companyId,
                snapshotDate: row.snapshotDate,
                frequency,
                customerId: row.customerId,
                customerName: row.customerName,
                revenue: row.revenue,
                invoiceCount: row.orderIds.size,
                avgInvoiceSize: row.orderIds.size > 0 ? row.revenue / row.orderIds.size : null,
              }))
              .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)) as any[];
          }
        }

        // Build real bookings from order headers/lines using orderDate periods.
        // Formula intent: SUM(QtyOrdered * Price) grouped by SLCohdrs.OrderDate period.
        const bookingsByCustomer = new Map<
          string,
          {
            customerId: string | null;
            customerName: string;
            mtd: number;
            qtd: number;
            ytd: number;
          }
        >();
        const bookingsByMonth = new Map<string, number>();
        const bookingsOrderLineDelegate = (prisma as any).customerOrderLineSnapshot;
        if (bookingsOrderLineDelegate?.findMany) {
          const hasOrderDateColumn = await customerOrderLineHasOrderDateColumn();
          const mtdStart = startOfBusinessMonth(endDate);
          const qtdStart = startOfBusinessQuarter(endDate);
          const ytdStart = startOfBusinessYear(endDate);
          if (hasOrderDateColumn) {
            const orderRows = await bookingsOrderLineDelegate.findMany({
              where: {
                companyId,
                frequency,
                snapshotDate: { lte: endDate },
                orderDate: { lte: endDate },
              },
              select: {
                snapshotDate: true,
                orderDate: true,
                customerId: true,
                customerName: true,
                orderId: true,
                lineId: true,
                contractValue: true,
              },
              orderBy: [{ snapshotDate: 'desc' }],
              take: 300000,
            });

            const latestLineAsOfEnd = new Map<
              string,
              {
                orderDate: Date;
                customerId: string | null;
                customerName: string;
                contractValue: number;
              }
            >();

            for (const row of orderRows as any[]) {
              const snapshot = new Date(row.snapshotDate);
              const orderDate = row.orderDate ? new Date(row.orderDate) : null;
              if (Number.isNaN(snapshot.getTime()) || !orderDate || Number.isNaN(orderDate.getTime())) continue;
              const customerName = String(row.customerName || 'Unknown Customer');
              const customerId = row.customerId ? String(row.customerId) : null;
              const orderId = String(row.orderId || '').trim() || 'UNKNOWN_ORDER';
              const lineId = String(row.lineId || '').trim() || 'UNKNOWN_LINE';
              // Deduplicate by physical order line identity only.
              // Customer fields can vary across snapshots (null/late enrichment/name format changes),
              // and including them in the key can double-count the same line.
              const lineKey = `${orderId}|${lineId}`;
              if (latestLineAsOfEnd.has(lineKey)) continue;
              latestLineAsOfEnd.set(lineKey, {
                orderDate,
                customerId,
                customerName,
                contractValue: Math.max(Number(row.contractValue || 0), 0),
              });
            }

            for (const line of latestLineAsOfEnd.values()) {
              const bookingValue = Number(line.contractValue || 0);
              if (bookingValue <= 0) continue;
              const orderDate = new Date(line.orderDate);
              if (orderDate > endDate) continue;
              const key = `${line.customerId || ''}|${line.customerName.toLowerCase()}`;
              if (!bookingsByCustomer.has(key)) {
                bookingsByCustomer.set(key, {
                  customerId: line.customerId,
                  customerName: line.customerName,
                  mtd: 0,
                  qtd: 0,
                  ytd: 0,
                });
              }
              const acc = bookingsByCustomer.get(key)!;
              if (orderDate >= mtdStart) acc.mtd += bookingValue;
              if (orderDate >= qtdStart) acc.qtd += bookingValue;
              if (orderDate >= ytdStart) acc.ytd += bookingValue;
              if (orderDate >= startDate && orderDate <= endDate) {
                const monthKey = businessMonthKey(orderDate);
                bookingsByMonth.set(monthKey, Number(bookingsByMonth.get(monthKey) || 0) + bookingValue);
              }
            }
          } else {
            // Backward-compatible fallback until orderDate column is migrated/backfilled.
            const orderRows = await bookingsOrderLineDelegate.findMany({
              where: {
                companyId,
                frequency,
                snapshotDate: { lte: endDate },
              },
              select: {
                snapshotDate: true,
                customerId: true,
                customerName: true,
                orderId: true,
                lineId: true,
                contractValue: true,
              },
              orderBy: [{ snapshotDate: 'asc' }],
              take: 250000,
            });

            const lineState = new Map<
              string,
              {
                customerId: string | null;
                customerName: string;
                lastValue: number;
                hasBaseline: boolean;
                endValue: number;
                beforeMtd: number;
                beforeQtd: number;
                beforeYtd: number;
                hasEndValue: boolean;
              }
            >();

            for (const row of orderRows as any[]) {
              const snapshot = new Date(row.snapshotDate);
              if (Number.isNaN(snapshot.getTime())) continue;
              const customerName = String(row.customerName || 'Unknown Customer');
              const customerId = row.customerId ? String(row.customerId) : null;
              const orderId = String(row.orderId || '').trim() || 'UNKNOWN_ORDER';
              const lineId = String(row.lineId || '').trim() || 'UNKNOWN_LINE';
              // Keep line identity stable across snapshots regardless of customer-field drift.
              const lineKey = `${orderId}|${lineId}`;
              if (!lineState.has(lineKey)) {
                lineState.set(lineKey, {
                  customerId,
                  customerName,
                  lastValue: 0,
                  hasBaseline: false,
                  endValue: 0,
                  beforeMtd: 0,
                  beforeQtd: 0,
                  beforeYtd: 0,
                  hasEndValue: false,
                });
              }
              const state = lineState.get(lineKey)!;
              // Prefer populated customer identity as rows become enriched over time.
              if (!state.customerId && customerId) state.customerId = customerId;
              if (
                (!state.customerName || state.customerName === 'Unknown Customer') &&
                customerName &&
                customerName !== 'Unknown Customer'
              ) {
                state.customerName = customerName;
              }
              const value = Number(row.contractValue || 0);
              if (!state.hasBaseline) {
                state.lastValue = value;
                state.hasBaseline = true;
              } else {
                const delta = value - state.lastValue;
                if (delta > 0 && snapshot >= startDate && snapshot <= endDate) {
                  const monthKey = businessMonthKey(snapshot);
                  bookingsByMonth.set(monthKey, Number(bookingsByMonth.get(monthKey) || 0) + delta);
                }
                state.lastValue = value;
              }
              if (snapshot < mtdStart) state.beforeMtd = value;
              if (snapshot < qtdStart) state.beforeQtd = value;
              if (snapshot < ytdStart) state.beforeYtd = value;
              if (snapshot <= endDate) {
                state.endValue = value;
                state.hasEndValue = true;
              }
            }

            for (const state of lineState.values()) {
              if (!state.hasEndValue) continue;
              const mtd = Math.max(state.endValue - state.beforeMtd, 0);
              const qtd = Math.max(state.endValue - state.beforeQtd, 0);
              const ytd = Math.max(state.endValue - state.beforeYtd, 0);
              if (mtd === 0 && qtd === 0 && ytd === 0) continue;
              const key = `${state.customerId || ''}|${state.customerName.toLowerCase()}`;
              if (!bookingsByCustomer.has(key)) {
                bookingsByCustomer.set(key, {
                  customerId: state.customerId,
                  customerName: state.customerName,
                  mtd: 0,
                  qtd: 0,
                  ytd: 0,
                });
              }
              const acc = bookingsByCustomer.get(key)!;
              acc.mtd += mtd;
              acc.qtd += qtd;
              acc.ytd += ytd;
            }
          }
        }

        const bookingsCustomers = Array.from(bookingsByCustomer.values()).sort((a, b) => b.ytd - a.ytd);
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
        for (const row of data as any[]) {
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

        // Calculate top customers
        const customerTotals = data.reduce((acc, record: any) => {
          if (!acc[record.customerName]) {
            acc[record.customerName] = {
              name: record.customerName,
              totalRevenue: 0,
              totalInvoices: 0,
            };
          }
          acc[record.customerName].totalRevenue += record.revenue;
          acc[record.customerName].totalInvoices += record.invoiceCount;
          return acc;
        }, {} as Record<string, any>);

        if (!data.length && shouldUseMockData) {
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

        return NextResponse.json({
          records: data,
          summary: {
            topCustomers: Object.values(customerTotals)
              .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
              .slice(0, 10),
            bookings: {
              totals: bookingsTotals,
              top5: bookingsTop5,
              topCustomers: bookingsCustomers.slice(0, 10),
              monthly: bookingsMonthly,
              bridge: bookingsVsRevenueBridge,
              backlogSeries,
            },
          },
        });

      case 'ar-aging':
        // Get AR aging data
        let arFrequencyForQuery: 'daily' | 'weekly' | 'monthly' = frequency;
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
          customerName: string;
          currentMonth: number;
          lastMonth: number;
          last12Months: number;
          cashCollectedToDate: number;
          lastPaymentDate: string | null;
        }> = [];
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
        let usedArInvoiceDetail = false;
        const preferOpenInvoiceSnapshotTrend = false;

        const arInvoiceTrendRows = await prisma.$queryRaw<
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
              SUM(CASE WHEN age_days IS NULL OR age_days <= 30 THEN amount_due ELSE 0 END)::double precision AS "current",
              SUM(CASE WHEN age_days > 30 AND age_days <= 60 THEN amount_due ELSE 0 END)::double precision AS "days1to30",
              SUM(CASE WHEN age_days > 60 AND age_days <= 90 THEN amount_due ELSE 0 END)::double precision AS "days31to60",
              SUM(CASE WHEN age_days > 90 AND age_days <= 120 THEN amount_due ELSE 0 END)::double precision AS "days61to90",
              SUM(CASE WHEN age_days > 120 THEN amount_due ELSE 0 END)::double precision AS "days90plus"
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
        if (!preferOpenInvoiceSnapshotTrend && arInvoiceTrendRows.length > 0) {
          usedArInvoiceDetail = true;
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
          const invoiceRowsOpenDeduped = Array.from(
            invoiceRowsOpen.reduce((acc: Map<string, any>, row: any) => {
              const invoiceKey =
                String(row.invoiceId || '').trim() ||
                `NOINV|${String(row.customerId || row.customerName || '').trim()}|${row.invoiceDate ? new Date(row.invoiceDate).toISOString().slice(0, 10) : 'na'}`;
              if (!acc.has(invoiceKey)) acc.set(invoiceKey, row);
              return acc;
            }, new Map<string, any>())
          );
          const customerAging = invoiceRowsOpenDeduped.reduce((acc: Record<string, any>, row: any) => {
            const name = row.customerName || 'Unknown Customer';
            if (!acc[name]) {
              acc[name] = {
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
            if (!acc[name].customerId && row.customerId) acc[name].customerId = row.customerId;
            const buckets = deriveArBucketsFromRow(
              {
                amountDueHome: Number(row.amountDue || 0),
                dueDate: null,
                invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
              },
              latestArInvoiceSnapshotDate
            );
            if (buckets.totalAR <= 0) return acc;
            acc[name].current += buckets.current;
            acc[name].days1to30 += buckets.days1to30;
            acc[name].days31to60 += buckets.days31to60;
            acc[name].days61to90 += buckets.days61to90;
            acc[name].days90plus += buckets.days90plus;
            acc[name].totalDue += buckets.totalAR;
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
              customerName: row.customerName || 'Unknown Customer',
              customerNumber: row.customerId || '-',
              invoiceDate: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDue || 0),
            }));
          customerInvoices = invoiceRowsOpenDeduped.slice(0, 500).map((row: any) => ({
            customerId: row.customerId ? String(row.customerId) : null,
            customerName: row.customerName || 'Unknown Customer',
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

        if (!usedArInvoiceDetail) {
          const latestOpenSnapshot = await prisma.aROpenInvoiceSnapshot.findFirst({
          where: {
            companyId,
            frequency: 'daily',
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
                frequency: 'daily',
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
              SUM(
                CASE
                  WHEN invoice_age_days > 30 AND invoice_age_days <= 60 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days1to30",
              SUM(
                CASE
                  WHEN invoice_age_days > 60 AND invoice_age_days <= 90 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days31to60",
              SUM(
                CASE
                  WHEN invoice_age_days > 90 AND invoice_age_days <= 120 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days61to90",
              SUM(
                CASE
                  WHEN invoice_age_days > 120 THEN amount_due
                  ELSE 0
                END
              )::double precision AS "days90plus"
            FROM base
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
            const name = row.customerName || 'Unknown Customer';
            if (!acc[name]) {
              acc[name] = {
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
            if (!acc[name].customerId && row.customerId) acc[name].customerId = row.customerId;
            const buckets = deriveArBucketsFromRow(row, latestOpenSnapshotDate || endDate);
            if (buckets.totalAR <= 0) return acc;
            acc[name].current += buckets.current;
            acc[name].days1to30 += buckets.days1to30;
            acc[name].days31to60 += buckets.days31to60;
            acc[name].days61to90 += buckets.days61to90;
            acc[name].days90plus += buckets.days90plus;
            acc[name].totalDue += buckets.totalAR;
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
              customerName: row.customerName || 'Unknown Customer',
              customerNumber: row.customerId || '-',
              invoiceDate: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDueHome || 0),
            }));

            customerInvoices = openRowsEligible.slice(0, 500).map((row: any) => ({
            customerId: row.customerId ? String(row.customerId) : null,
            customerName: row.customerName || 'Unknown Customer',
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
            const name = row.customerName || 'Unknown Customer';
            if (!acc[name]) {
              acc[name] = {
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
            if (dt >= monthStart && dt <= endDate) acc[name].currentMonth += amount;
            if (dt >= lastMonthStart && dt < monthStart) acc[name].lastMonth += amount;
            if (dt >= trailing12Start && dt <= endDate) acc[name].last12Months += amount;
            if (dt <= endDate) acc[name].cashCollectedToDate += amount;
            if (!acc[name].lastPaymentDate || dt.getTime() > new Date(acc[name].lastPaymentDate).getTime()) {
              acc[name].lastPaymentDate = dt.toISOString().split('T')[0];
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
            const name = row.customerName || 'Unknown Customer';
            if (!contractStatusByCustomer.has(name)) {
              contractStatusByCustomer.set(name, {
                customerId: row.customerId || '-',
                customerName: name,
                contractValueTotal: 0,
                remainingToInvoice: 0,
                accruedRevenueUnbilled: 0,
                invoicedRevenue: 0,
                cashCollectedToDate: 0,
                lastPaymentDate: null,
              });
            }
            const acc = contractStatusByCustomer.get(name)!;
            acc.contractValueTotal += Number(row.contractValue || 0);
            acc.remainingToInvoice += Number(row.remainingValue || 0);
            acc.accruedRevenueUnbilled += Number(row.accruedRevenueUnbilled || 0);
            acc.invoicedRevenue += Number(row.invoicedToDate || 0);
            acc.cashCollectedToDate += Number(row.cashCollectedToDate || 0);
            if (!acc.lastPaymentDate && row.lastPaymentDate) {
              acc.lastPaymentDate = new Date(row.lastPaymentDate).toISOString().split('T')[0];
            }
            if (!acc.customerId && row.customerId) acc.customerId = row.customerId;
          }
        }

        const paidByCustomerName = new Map(
          paidInvoices.map((row) => [row.customerName, row])
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
              const name = row.customerName || 'Unknown Customer';
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

        unpaidByCustomer = unpaidByCustomer.map((row) => {
          const contract = contractStatusByCustomer.get(row.customerName);
          const orderContract =
            orderContractByCustomerId.get(normalizeText(row.customerId)) ||
            orderContractByCustomerName.get(row.customerName) ||
            orderContractByNormalizedName.get(normalizeText(row.customerName));
          const paid = paidByCustomerName.get(row.customerName);
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
            contractValueTotal,
            remainingToInvoice,
            accruedRevenueUnbilled: Number(orderContract?.accruedRevenueUnbilled ?? contract?.accruedRevenueUnbilled ?? 0),
            invoicedRevenue,
            cashCollectedToDate: cashCollected,
            lastPaymentDate: contract?.lastPaymentDate || paid?.lastPaymentDate || null,
          };
        });
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

        if (!data.length && shouldUseMockData) {
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
        // Bucket naming is historical:
        // current=0-30, days1to30=31-60, days31to60=61-90, days61to90=91-120, days90plus=121+
        const over30Amount = Number(
          summaryTotals.days1to30 + summaryTotals.days31to60 + summaryTotals.days61to90 + summaryTotals.days90plus
        );
        const currentPct = totalARForPct > 0 ? (Number(summaryTotals.current) / totalARForPct) * 100 : 0;
        const over30Pct = totalARForPct > 0 ? (over30Amount / totalARForPct) * 100 : 0;
        const over90Pct =
          totalARForPct > 0
            ? (Number(summaryTotals.days61to90 + summaryTotals.days90plus) / totalARForPct) * 100
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
        // Get AP aging data
        data = await prisma.aPAgingSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Fallback: derive AP trend from real daily financial snapshots when AP aging snapshots are unavailable.
        // This keeps AP page reports populated with real data in tenants where AP IDOs are not exposed.
        if (!data.length) {
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

        // Calculate aging trends
        const latestAP = data[0];
        const apMetrics = latestAP
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

        const latestOpenBillsSnapshotDate = await (prisma as any).aPOpenBillSnapshot.findFirst({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });

        if (latestOpenBillsSnapshotDate?.snapshotDate) {
          const openBillRows = await (prisma as any).aPOpenBillSnapshot.findMany({
            where: {
              companyId,
              frequency,
              snapshotDate: latestOpenBillsSnapshotDate.snapshotDate,
            },
            orderBy: [{ amountDueHome: 'desc' }],
            take: Math.max(limit, 500),
          });

          const vendorAging = openBillRows.reduce((acc: Record<string, any>, row: any) => {
            const name = row.vendorName || 'Unknown Vendor';
            if (!acc[name]) {
              acc[name] = {
                vendorName: name,
                current: 0,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
                totalDue: 0,
              };
            }
            const bucketCurrent = Number(row.current || 0);
            const bucket1to30 = Number(row.days1to30 || 0);
            const bucket31to60 = Number(row.days31to60 || 0);
            const bucket61to90 = Number(row.days61to90 || 0);
            const bucket90plus = Number(row.days90plus || 0);
            const openAmount = Number(row.amountDueHome || 0);
            acc[name].current += bucketCurrent;
            acc[name].days1to30 += bucket1to30;
            acc[name].days31to60 += bucket31to60;
            acc[name].days61to90 += bucket61to90;
            acc[name].days90plus += bucket90plus;
            acc[name].totalDue +=
              bucketCurrent + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus > 0
                ? bucketCurrent + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus
                : openAmount;
            return acc;
          }, {});

          unpaidByVendor = Object.values(vendorAging)
            .sort((a: any, b: any) => b.totalDue - a.totalDue)
            .slice(0, 25) as any[];

          unpaidBills = openBillRows
            .filter((row: any) => Number(row.amountDueHome || 0) > 0)
            .slice(0, 250)
            .map((row: any) => ({
              vendorName: row.vendorName || 'Unknown Vendor',
              billNo: row.billNo || '-',
              date: row.billDate ? new Date(row.billDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDueHome || 0),
            }));

          vendorBills = openBillRows.slice(0, 500).map((row: any) => ({
            vendorName: row.vendorName || 'Unknown Vendor',
            billNo: row.billNo || '-',
            date: row.billDate ? new Date(row.billDate).toISOString().split('T')[0] : null,
            dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
            currency: row.currencyCode || 'USD',
            amountCurrency: Number(row.amountCurrency || row.amountHome || 0),
            amountHome: Number(row.amountHome || row.amountDueHome || 0),
            amountDueHome: Number(row.amountDueHome || 0),
          }));
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
        if (!unpaidByVendor.length || !vendorBills.length) {
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
            if (!unpaidBills.length) {
              unpaidBills = vendorBills.slice(0, 250).map((row) => ({
                vendorName: row.vendorName,
                billNo: row.billNo,
                date: row.date,
                dueDate: row.dueDate,
                amountDue: Number(row.amountDueHome || 0),
              }));
            }
          }
        }

        if (!data.length && shouldUseMockData) {
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

        return NextResponse.json({
          records: data,
          summary: apMetrics
            ? {
                ...apMetrics,
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
        data = await prisma.productSalesSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: [{ snapshotDate: 'asc' }, { itemName: 'asc' }],
        });

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

        const recordsV1 = data.map((row: any) => ({
          ...row,
          quantitySold: Number(row?.quantitySold || 0),
          cogs: Number(row?.cogs || 0),
          freightAllocated: 0,
          otherRevenueAllocated: 0,
          returnsAmount: Number(row?.revenue || 0) < 0 ? Math.abs(Number(row?.revenue || 0)) : 0,
          isEstimatedCost: false,
        }));

        // Quantity fallback from order-line snapshots when product quantity is missing/zero.
        const productOrderLineDelegate = (prisma as any).customerOrderLineSnapshot;
        if (productOrderLineDelegate?.findMany) {
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
        const inventoryRows = await prisma.inventorySnapshot.findMany({
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
        if (productMappedLineDelegate?.findMany) {
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

        if (!data.length && shouldUseMockData) {
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
            topProducts: Object.values(productTotals)
              .map((p: any) => ({
                ...p,
                grossMargin: p.totalRevenue - p.totalCogs,
                grossMarginPct: p.totalRevenue > 0 ? ((p.totalRevenue - p.totalCogs) / p.totalRevenue) * 100 : 0,
              }))
              .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
              .slice(0, 10),
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
            if ((!acc.itemName || acc.itemName === 'Unknown Item') && itemName) acc.itemName = itemName;
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
          inventoryTrendDaily.push({
            snapshotDate: new Date(cursor),
            assetValue: carryAssetValue,
            qtyOnHand: 0,
          });
        }

        // V1 proxy model for aging/obsolescence using currently available data:
        // inventory exposure + latest SLCoitems-derived order-line recency and quantities.
        const inventoryOrderLineDelegate = (prisma as any).customerOrderLineSnapshot;
        const canonicalMovementKey = (value: unknown): string =>
          String(value || '')
            .trim()
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
        const daysBetweenUtc = (from: Date, to: Date): number =>
          Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
        const start30Utc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate() - 29));
        const start60Utc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate() - 59));
        const start90Utc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate() - 89));
        const asOfUtc = new Date(Date.UTC(inventoryEndUtcDay.getUTCFullYear(), inventoryEndUtcDay.getUTCMonth(), inventoryEndUtcDay.getUTCDate()));
        let agingReport: any[] = [];
        if (inventoryOrderLineDelegate) {
          const latestOrderLineSnapshot = await inventoryOrderLineDelegate.findFirst({
            where: {
              companyId,
              frequency: 'daily',
              snapshotDate: { lt: inventoryEndExclusive },
            },
            orderBy: { snapshotDate: 'desc' },
            select: { snapshotDate: true },
          });
          if (latestOrderLineSnapshot?.snapshotDate) {
            const orderLines = await inventoryOrderLineDelegate.findMany({
              where: {
                companyId,
                frequency: 'daily',
                snapshotDate: latestOrderLineSnapshot.snapshotDate,
              },
              select: {
                itemId: true,
                itemName: true,
                orderDate: true,
                snapshotDate: true,
                qtyInvoiced: true,
              },
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
            for (const line of orderLines) {
              const keyAliases = Array.from(
                new Set([
                  canonicalMovementKey(line.itemId),
                  canonicalMovementKey(line.itemName),
                ].filter(Boolean))
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
              const qty = Math.max(0, Number(line.qtyInvoiced || 0));
              const eventDateRaw = line.orderDate ? new Date(line.orderDate) : line.snapshotDate ? new Date(line.snapshotDate) : null;
              if (eventDateRaw) {
                const eventUtc = new Date(
                  Date.UTC(eventDateRaw.getUTCFullYear(), eventDateRaw.getUTCMonth(), eventDateRaw.getUTCDate())
                );
                for (const alias of keyAliases) {
                  const acc = movementBySku.get(alias)!;
                  if (!acc.lastOrderDate || eventUtc.getTime() > acc.lastOrderDate.getTime()) acc.lastOrderDate = eventUtc;
                  if (eventUtc.getTime() >= start90Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty90 += qty;
                  if (eventUtc.getTime() >= start60Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty60 += qty;
                  if (eventUtc.getTime() >= start30Utc.getTime() && eventUtc.getTime() <= asOfUtc.getTime()) acc.shippedQty30 += qty;
                }
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
          }
        }

        const inventoryMetrics = {
          totalValue: latestInventoryBySku.reduce((sum, item) => sum + Number(item.assetValue || 0), 0),
          itemCount: latestInventoryBySku.length,
          topItems: latestInventoryBySku.slice(0, 10),
        };

        // Real-data only for inventory: do not return mock payloads.
        // If no inventory snapshots exist yet, return an empty real response.
        if (!latestInventoryBySku.length) {
          return NextResponse.json({
            records: [],
            trend: [],
            summary: {
              totalValue: 0,
              itemCount: 0,
              topItems: [],
            },
          });
        }

        return NextResponse.json({
          records: latestInventoryBySku,
          trend: inventoryTrendDaily,
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
          const movementRows = await cashMappedLineDelegate.findMany({
            where: {
              companyId,
              frequency: 'daily',
              targetField: 'balance_movement:cash',
              snapshotDate: dateFilter,
            },
            select: {
              snapshotDate: true,
              sourceAccountName: true,
              sourceAccountId: true,
              amount: true,
            },
            orderBy: [{ snapshotDate: 'asc' }],
            take: Math.max(limit * 50, 5000),
          });
          if (movementRows.length > 0) {
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

          const allAccountKeys = new Set<string>([
            ...Array.from(observedByAccount.keys()),
            ...Array.from(syntheticByAccount.keys()),
          ]);
          const chosenRows: typeof observedDaily = [];

          for (const accountKey of allAccountKeys) {
            const observedRows = observedByAccount.get(accountKey) || [];
            const syntheticRows = syntheticByAccount.get(accountKey) || [];

            let selectedRows = observedRows;
            if (observedRows.length === 0) {
              selectedRows = syntheticRows;
            } else if (syntheticRows.length > 0) {
              const observedVariation = uniqueBalanceCount(observedRows);
              const syntheticVariation = uniqueBalanceCount(syntheticRows);
              const observedLooksFlat = observedVariation <= 1;
              const observedDays = uniqueDayCount(observedRows);
              const syntheticDays = uniqueDayCount(syntheticRows);
              const observedCoverageRatio = observedDays / expectedWindowDays;
              // Some CSI accounts only appear in sparse spot snapshots (e.g. a few days)
              // while synthetic series can provide full-period continuity from anchors.
              const observedLooksSparse = observedCoverageRatio < 0.5 && syntheticDays > observedDays;
              if ((observedLooksFlat && syntheticVariation > observedVariation) || observedLooksSparse) {
                selectedRows = syntheticRows;
              }
            }

            const identityRow = observedRows[0] || syntheticRows[0];
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
            const accountKey = accountKeyFromParts(row.accountId, row.accountNumber, row.accountName);
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
          accountCount: latestCash.length,
          accounts: accountSummaries,
          avgTotalCash: data.length > 0 
            ? data.reduce((sum, r) => sum + r.cashBalance, 0) / data.length 
            : 0,
        };

        if (!data.length && shouldUseMockData) {
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

      case 'daily-financials':
        // Financial snapshots used by Operations (daily/weekly/monthly).
        const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
        const dailyMappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
        if (!dailySnapshotDelegate) {
          return NextResponse.json({
            records: [],
            summary: {
              latestRevenue: 0,
              latestExpense: 0,
              latestNet: 0,
              latestCash: 0,
              message: 'Daily financial snapshots model not available yet.',
            },
          });
        }

        data = await dailySnapshotDelegate.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        if (!data.length) {
          return NextResponse.json({
            records: [],
            summary: {
              latestRevenue: 0,
              latestExpense: 0,
              latestNet: 0,
              latestCash: 0,
              days: 0,
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
                frequency,
                snapshotDate: dateFilter,
              },
              orderBy: [{ snapshotDate: 'desc' }, { sourceAccountName: 'asc' }],
              take: Math.max(limit * 200, 3000),
            })
          : [];

        return NextResponse.json({
          records: data,
          mappedLines,
          summary: {
            latestRevenue,
            latestExpense,
            latestNet,
            latestCash: Number(latestDaily.cash || 0),
            latestAR: Number(latestDaily.ar || 0),
            latestAP: Number(latestDaily.ap || 0),
            netChange,
            days: data.length,
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
        if (!customers && !arAging && !apAging && !products && !inventory && !cash && !dailyFinancials && shouldUseMockData) {
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

