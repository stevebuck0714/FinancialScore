import prisma from '@/lib/prisma';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import {
  loadAnchoredBsBalances,
  loadCsvMonthlyByAccount,
  loadQboReportMonthlyByAccount,
  nameLookupKeys,
  type MonthlyByAccount,
} from '@/lib/sde/account-monthly-sources';
import type { RevenueBasis } from './revenue-reconciliation';

export type BookBalanceSource = 'qbo_reports' | 'gl_anchor' | 'trial_balance' | 'manual';

export type CashAccountMapping = {
  id: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string;
};

// Systems whose per-account history lives in FinancialRecord.rawData.
const RAW_DATA_ACCOUNTING_SYSTEMS = new Set([
  'QUICKBOOKS',
  'QUICKBOOKS_DESKTOP',
  'QUICKBOOKS_ENTERPRISE',
  'XERO',
  'SAGE',
  'CSV_FILE',
]);

// QuickBooks Desktop only syncs General Ledger movement, never month-end
// balances, so its cash balances come from an uploaded trial balance or are
// keyed in by hand.
const MANUAL_ONLY_ACCOUNTING_SYSTEMS = new Set(['QUICKBOOKS_DESKTOP', 'QUICKBOOKS_ENTERPRISE']);

export function monthKeyFromParts(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKeyFromParts(y, m - 1 + delta);
}

export function monthRange(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let cursor = startMonth;
  while (cursor <= endMonth && out.length < 120) {
    out.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return out;
}

export function monthEndDate(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

export async function resolveLatestFinancialMonth(companyId: string): Promise<string | null> {
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ ym: string }>>`
      SELECT to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') AS ym
      FROM "MonthlyFinancial" mf
      WHERE mf."companyId" = ${companyId}
      ORDER BY mf."monthDate" DESC
      LIMIT 1
    `,
    'cash-proof.resolveLatestFinancialMonth',
  );
  return rows[0]?.ym || null;
}

/**
 * Default review period: the trailing 24 months, widened when needed so it
 * also covers the two most recent complete fiscal years.
 */
export function defaultCashProofPeriod(
  latestMonth: string,
  fiscalYearEndMonth: number,
): { periodStartMonth: string; periodEndMonth: string } {
  const [y, m] = latestMonth.split('-').map(Number);
  const fyeYear = m >= fiscalYearEndMonth ? y : y - 1;
  const lastFye = monthKeyFromParts(fyeYear, fiscalYearEndMonth - 1);
  const twoFullYearsStart = shiftMonth(lastFye, -23);
  const trailingStart = shiftMonth(latestMonth, -23);
  return {
    periodStartMonth: twoFullYearsStart < trailingStart ? twoFullYearsStart : trailingStart,
    periodEndMonth: latestMonth,
  };
}

export async function listCashAccountMappings(companyId: string): Promise<CashAccountMapping[]> {
  return withPrismaReconnectRetry(
    () =>
      prisma.accountMapping.findMany({
        where: { companyId, targetField: { equals: 'cash', mode: 'insensitive' } },
        select: { id: true, accountId: true, accountCode: true, accountName: true },
        orderBy: [{ accountCode: 'asc' }, { accountName: 'asc' }],
      }),
    'cash-proof.listCashAccountMappings',
  );
}

function lookupKeysFor(mapping: Pick<CashAccountMapping, 'accountId' | 'accountCode' | 'accountName'>): string[] {
  const keys: string[] = [];
  const push = (v: string) => {
    if (v && !keys.includes(v)) keys.push(v);
  };
  push(String(mapping.accountId || '').trim());
  push(String(mapping.accountCode || '').trim());
  for (const k of nameLookupKeys(mapping.accountName)) push(k);
  return keys;
}

/**
 * Balances for month-ends before the earliest anchor, rolled back from it:
 *   balance(monthEnd) = openingBalance − SUM(signedAmount) where monthEnd < transDate <= anchorDate
 * Only months the General Ledger actually covers are returned.
 */
async function loadRolledBackBalances(companyId: string, months: string[]): Promise<MonthlyByAccount> {
  const result: MonthlyByAccount = new Map();
  const bounds = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ anchorDate: Date | null; glStart: Date | null }>>`
      SELECT
        (SELECT MIN("anchorDate") FROM "BalanceSheetAccountAnchor" WHERE "companyId" = ${companyId}) AS "anchorDate",
        (SELECT MIN("transDate") FROM "GLTransactionFact" WHERE "companyId" = ${companyId}) AS "glStart"
    `,
    'cash-proof.rollback.bounds',
  );
  const anchorDate = bounds[0]?.anchorDate;
  const glStart = bounds[0]?.glStart;
  if (!anchorDate || !glStart) return result;
  const glStartMonth = monthKeyFromParts(glStart.getUTCFullYear(), glStart.getUTCMonth());
  const targetMonths = months.filter((m) => monthEndDate(m) < anchorDate && m >= glStartMonth);
  if (targetMonths.length === 0) return result;

  const [anchors, activity] = await Promise.all([
    withPrismaReconnectRetry(
      () => prisma.$queryRaw<Array<{ accountId: string; accountName: string | null; accountCode: string | null; openingBalance: number }>>`
        SELECT TRIM("accountId") AS "accountId",
               NULLIF(TRIM(COALESCE("accountName", '')), '') AS "accountName",
               NULLIF(TRIM(COALESCE("accountCode", '')), '') AS "accountCode",
               "openingBalance"::double precision AS "openingBalance"
        FROM "BalanceSheetAccountAnchor"
        WHERE "companyId" = ${companyId} AND "anchorDate" = ${anchorDate}
      `,
      'cash-proof.rollback.anchors',
    ),
    withPrismaReconnectRetry(
      () => prisma.$queryRaw<Array<{ accountId: string; ym: string; total: number }>>`
        SELECT TRIM(g."accountId") AS "accountId",
               to_char(date_trunc('month', g."transDate"), 'YYYY-MM') AS ym,
               SUM(g."signedAmount")::double precision AS total
        FROM "GLTransactionFact" g
        WHERE g."companyId" = ${companyId}
          AND g."transDate" > ${monthEndDate(targetMonths[0])}
          AND g."transDate" <= ${anchorDate}
          AND TRIM(g."accountId") IN (
            SELECT TRIM("accountId") FROM "BalanceSheetAccountAnchor"
            WHERE "companyId" = ${companyId} AND "anchorDate" = ${anchorDate}
          )
        GROUP BY 1, 2
      `,
      'cash-proof.rollback.activity',
    ),
  ]);

  const activityByAccount = new Map<string, Array<{ ym: string; total: number }>>();
  for (const row of activity) {
    if (!activityByAccount.has(row.accountId)) activityByAccount.set(row.accountId, []);
    activityByAccount.get(row.accountId)!.push({ ym: row.ym, total: Number(row.total) || 0 });
  }

  for (const anchor of anchors) {
    const rows = activityByAccount.get(anchor.accountId) || [];
    const monthMap = new Map<string, number>();
    for (const month of targetMonths) {
      const later = rows.reduce((sum, r) => (r.ym > month ? sum + r.total : sum), 0);
      monthMap.set(month, Math.round((Number(anchor.openingBalance) - later) * 100) / 100);
    }
    const keys = [anchor.accountId, String(anchor.accountCode || ''), ...nameLookupKeys(String(anchor.accountName || ''))];
    for (const key of keys) if (key && !result.has(key)) result.set(key, monthMap);
  }
  return result;
}

async function loadAnchoredMonthlyBalances(companyId: string, months: string[]): Promise<MonthlyByAccount> {
  const result: MonthlyByAccount = await loadRolledBackBalances(companyId, months);
  const batchSize = 6;
  for (let i = 0; i < months.length; i += batchSize) {
    const batch = months.slice(i, i + batchSize);
    const maps = await Promise.all(batch.map((month) => loadAnchoredBsBalances(companyId, monthEndDate(month))));
    batch.forEach((month, idx) => {
      for (const [key, value] of maps[idx]) {
        if (!result.has(key)) result.set(key, new Map());
        result.get(key)!.set(month, value);
      }
    });
  }
  return result;
}

/**
 * Month-end book balance per cash account mapping, from the company's
 * accounting source. Returns `source: 'manual'` when the system cannot
 * provide balances (QuickBooks Desktop) or nothing could be matched.
 */
export async function loadCashBookBalances(
  companyId: string,
  accounts: CashAccountMapping[],
  months: string[],
): Promise<{ source: BookBalanceSource; balances: Map<string, Map<string, number>> }> {
  const balances = new Map<string, Map<string, number>>();
  if (accounts.length === 0 || months.length === 0) return { source: 'manual', balances };

  const company = await withPrismaReconnectRetry(
    () => prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } }),
    'cash-proof.company',
  );
  const accountingSystem = String(company?.accountingSystem || '').trim().toUpperCase();

  let byAccount: MonthlyByAccount = new Map();
  let source: BookBalanceSource = 'manual';
  if (MANUAL_ONLY_ACCOUNTING_SYSTEMS.has(accountingSystem)) {
    // Skip the synced General Ledger; only an uploaded trial balance has balances.
  } else if (accountingSystem === 'QUICKBOOKS') {
    const latestRecord = await withPrismaReconnectRetry(
      () =>
        prisma.financialRecord.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          select: { rawData: true },
        }),
      'cash-proof.qboLatestRecord',
    );
    byAccount = loadQboReportMonthlyByAccount(latestRecord?.rawData, months, nameLookupKeys, ['balanceSheet']);
    if (byAccount.size > 0) source = 'qbo_reports';
  } else if (!RAW_DATA_ACCOUNTING_SYSTEMS.has(accountingSystem)) {
    byAccount = await loadAnchoredMonthlyBalances(companyId, months);
    if (byAccount.size > 0) source = 'gl_anchor';
  }
  if (byAccount.size === 0) {
    byAccount = await loadCsvMonthlyByAccount(companyId, months);
    if (byAccount.size > 0) source = 'trial_balance';
  }

  for (const account of accounts) {
    for (const key of lookupKeysFor(account)) {
      const found = byAccount.get(key);
      if (found && found.size > 0) {
        balances.set(account.id, found);
        break;
      }
    }
  }
  return { source: balances.size > 0 ? source : 'manual', balances };
}

/** Balance-sheet cash per month from MonthlyFinancial, used as the completeness check. */
export async function loadBalanceSheetCashByMonth(
  companyId: string,
  startMonth: string,
  endMonth: string,
): Promise<Record<string, number>> {
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ ym: string; cash: number }>>`
      SELECT DISTINCT ON (date_trunc('month', mf."monthDate"))
             to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') AS ym,
             mf."cash"::float8 AS cash
      FROM "MonthlyFinancial" mf
      WHERE mf."companyId" = ${companyId}
        AND mf."monthDate" >= ${new Date(`${startMonth}-01T00:00:00.000Z`)}
        AND mf."monthDate" <= ${monthEndDate(endMonth)}
      ORDER BY date_trunc('month', mf."monthDate"), mf."createdAt" DESC
    `,
    'cash-proof.balanceSheetCash',
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.ym] = Number(row.cash) || 0;
  return out;
}

/** Monthly revenue plus the month-end balances that bridge collections to revenue. */
export async function loadRevenueBasisByMonth(
  companyId: string,
  startMonth: string,
  endMonth: string,
): Promise<Record<string, RevenueBasis>> {
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<
      Array<{ ym: string; revenue: number; receivables: number; contractAssets: number; contractLiabilities: number }>
    >`
      SELECT DISTINCT ON (date_trunc('month', mf."monthDate"))
             to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') AS ym,
             mf."revenue"::float8 AS revenue,
             (mf."ar" + mf."retainageReceivables")::float8 AS receivables,
             mf."contractAssets"::float8 AS "contractAssets",
             mf."contractLiabilities"::float8 AS "contractLiabilities"
      FROM "MonthlyFinancial" mf
      WHERE mf."companyId" = ${companyId}
        AND mf."monthDate" >= ${new Date(`${startMonth}-01T00:00:00.000Z`)}
        AND mf."monthDate" <= ${monthEndDate(endMonth)}
      ORDER BY date_trunc('month', mf."monthDate"), mf."createdAt" DESC
    `,
    'cash-proof.revenueBasis',
  );
  const out: Record<string, RevenueBasis> = {};
  for (const row of rows) {
    out[row.ym] = {
      revenue: Number(row.revenue) || 0,
      receivables: Number(row.receivables) || 0,
      contractAssets: Number(row.contractAssets) || 0,
      contractLiabilities: Number(row.contractLiabilities) || 0,
    };
  }
  return out;
}
