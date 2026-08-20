import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LOAN_ACTIVITY_CACHE_VERSION = 29;
const STALE_LOAN_ACTIVITY_MONTHS = 13;

type LoanTermInput = {
  instrumentKey: string;
  displayName?: string | null;
  loanType?: string | null;
  lender?: string | null;
  originalBalance?: number | null;
  loanOriginationDate?: string | null;
  currentBalance?: number | null;
  interestRatePct?: number | null;
  maturityDate?: string | null;
  amortizationTermMonths?: number | null;
  paymentFrequency?: string | null;
  notes?: string | null;
  closed?: boolean | null;
};

const DEBT_ACCOUNT_NAME_PATTERN = [
  'loan',
  'note',
  'notes payable',
  'line of credit',
  '\\bloc\\b',
  'amnb',
  'shareholder note',
].join('|');

const CASH_ACCOUNT_NAME_PATTERN = [
  'cash',
  'checking',
  'savings',
  'bank',
  'operating account',
  'money market',
  'deposit',
].join('|');

const NON_DEBT_LOAN_ACCOUNT_PATTERN = [
  '401k',
  '401 k',
  'employee loan repayment',
  'employee loan receivable',
  'bad debt',
  'bad debts',
  'allowance',
  'accum',
  'depr',
  'depreciation',
  'interest payable',
  'interest expense',
  'vehicle exp',
  'gas',
  'mileage',
  'personal vehicle',
].join('|');

async function requireCompanyAccess(companyId: string, action: string) {
  await requireAuth();
  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('Company', companyId, action);
    return false;
  }
  return true;
}

async function ensureLoanTermsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LoanInstrumentTerm" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "companyId" TEXT NOT NULL,
      "instrumentKey" TEXT NOT NULL,
      "displayName" TEXT,
      "loanType" TEXT,
      "lender" TEXT,
      "originalBalance" NUMERIC(18, 2),
      "loanOriginationDate" DATE,
      "currentBalance" NUMERIC(18, 2),
      "interestRatePct" NUMERIC(9, 4),
      "maturityDate" DATE,
      "amortizationTermMonths" INTEGER,
      "paymentFrequency" TEXT,
      "notes" TEXT,
      "closed" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "LoanInstrumentTerm_company_instrument_key" UNIQUE ("companyId", "instrumentKey")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "LoanInstrumentTerm_company_idx"
      ON "LoanInstrumentTerm" ("companyId");
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "LoanInstrumentTerm"
      ADD COLUMN IF NOT EXISTS "loanOriginationDate" DATE;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "LoanInstrumentTerm"
      ADD COLUMN IF NOT EXISTS "closed" BOOLEAN NOT NULL DEFAULT false;
  `);
}

async function ensureLoanActivityCacheTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LoanActivityCache" (
      "companyId" TEXT PRIMARY KEY,
      "payload" JSONB NOT NULL,
      "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function readLoanActivityCache(companyId: string): Promise<{ payload: any; generatedAt: string } | null> {
  await ensureLoanActivityCacheTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: any; generatedAt: Date }>>(
    `
      SELECT "payload", "generatedAt"
      FROM "LoanActivityCache"
      WHERE "companyId" = $1
      LIMIT 1
    `,
    companyId
  );
  const row = rows[0];
  if (!row?.payload) return null;
  if (Number(row.payload?.cacheVersion || 0) !== LOAN_ACTIVITY_CACHE_VERSION) return null;
  const generatedAt = row.generatedAt instanceof Date ? row.generatedAt : new Date(row.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return null;
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  if (generatedAt.getTime() < todayUtc.getTime()) return null;
  const latestSourceUpdatedAt = await loadLatestLoanSourceUpdatedAt(companyId);
  if (latestSourceUpdatedAt && latestSourceUpdatedAt.getTime() > generatedAt.getTime() + 1000) return null;
  return {
    payload: row.payload,
    generatedAt: generatedAt.toISOString(),
  };
}

async function loadLatestLoanSourceUpdatedAt(companyId: string): Promise<Date | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ sourceUpdatedAt: Date | null }>>(
    `
      SELECT MAX("sourceUpdatedAt") AS "sourceUpdatedAt"
      FROM (
        SELECT MAX(GREATEST("updatedAt", "createdAt")) AS "sourceUpdatedAt"
        FROM "DailyFinancialSnapshot"
        WHERE "companyId" = $1

        UNION ALL

        SELECT MAX("updatedAt") AS "sourceUpdatedAt"
        FROM "BalanceSheetAccountAnchor"
        WHERE "companyId" = $1

        UNION ALL

        SELECT MAX("updatedAt") AS "sourceUpdatedAt"
        FROM "AccountMapping"
        WHERE "companyId" = $1
          AND (
            COALESCE("targetField", '') IN ('loc', 'ltd')
            OR COALESCE("accountName", '') ~* $2
          )

        UNION ALL

        SELECT MAX("updatedAt") AS "sourceUpdatedAt"
        FROM "LoanInstrumentTerm"
        WHERE "companyId" = $1
      ) source_updates
    `,
    companyId,
    DEBT_ACCOUNT_NAME_PATTERN
  );
  const value = rows[0]?.sourceUpdatedAt;
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadLoanAccountMetadata(companyId: string, accountIds: string[]): Promise<Map<string, {
  targetField: string | null;
  accountClassification: string | null;
}>> {
  const ids = Array.from(new Set(accountIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const metadata = new Map<string, { targetField: string | null; accountClassification: string | null }>();
  if (!ids.length) return metadata;

  const rows = await prisma.$queryRawUnsafe<Array<{
    accountId: string | null;
    targetField: string | null;
    accountClassification: string | null;
  }>>(
    `
      SELECT
        TRIM("accountId") AS "accountId",
        NULLIF(TRIM(COALESCE("targetField", '')), '') AS "targetField",
        NULLIF(TRIM(COALESCE("accountClassification", '')), '') AS "accountClassification"
      FROM "AccountMapping"
      WHERE "companyId" = $1
        AND TRIM("accountId") = ANY($2::text[])
    `,
    companyId,
    ids
  );

  for (const row of rows) {
    const accountId = String(row.accountId || '').trim();
    if (!accountId || metadata.has(accountId)) continue;
    metadata.set(accountId, {
      targetField: row.targetField || null,
      accountClassification: row.accountClassification || null,
    });
  }

  return metadata;
}

async function loadLatestDailyFinancialSnapshot(companyId: string): Promise<{
  snapshotDate: Date | null;
  loc: number;
  ltd: number;
} | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    snapshotDate: Date | null;
    loc: number | null;
    ltd: number | null;
  }>>(
    `
      SELECT
        "snapshotDate",
        "loc"::float8 AS "loc",
        "ltd"::float8 AS "ltd"
      FROM "DailyFinancialSnapshot"
      WHERE "companyId" = $1
      ORDER BY "snapshotDate" DESC
      LIMIT 1
    `,
    companyId
  );
  const row = rows[0];
  if (!row) return null;
  return {
    snapshotDate: row.snapshotDate || null,
    loc: Math.abs(Number(row.loc || 0)),
    ltd: Math.abs(Number(row.ltd || 0)),
  };
}

async function loadLatestMonthlyFinancialDebtSnapshot(companyId: string): Promise<{
  snapshotDate: Date | null;
  loc: number;
  ltd: number;
  interestExpense: number;
} | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    snapshotDate: Date | null;
    loc: number | null;
    ltd: number | null;
    interestExpense: number | null;
  }>>(
    `
      SELECT
        mf."monthDate" AS "snapshotDate",
        mf."loc"::float8 AS "loc",
        mf."ltd"::float8 AS "ltd",
        mf."interestExpense"::float8 AS "interestExpense"
      FROM "MonthlyFinancial" mf
      JOIN "FinancialRecord" fr ON fr.id = mf."financialRecordId"
      WHERE mf."companyId" = $1
      ORDER BY fr."createdAt" DESC, mf."monthDate" DESC
      LIMIT 1
    `,
    companyId
  );
  const row = rows[0];
  if (!row) return null;
  return {
    snapshotDate: row.snapshotDate || null,
    loc: Math.abs(Number(row.loc || 0)),
    ltd: Math.abs(Number(row.ltd || 0)),
    interestExpense: Math.abs(Number(row.interestExpense || 0)),
  };
}

async function writeLoanActivityCache(companyId: string, payload: any) {
  await ensureLoanActivityCacheTable();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "LoanActivityCache" ("companyId", "payload", "generatedAt", "updatedAt")
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT ("companyId")
      DO UPDATE SET
        "payload" = EXCLUDED."payload",
        "generatedAt" = EXCLUDED."generatedAt",
        "updatedAt" = NOW()
    `,
    companyId,
    JSON.stringify(payload)
  );
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === 't' || text === '1' || text === 'yes' || text === 'on';
}

function normalizeLoanTerms(row: any) {
  if (!row) return null;
  return {
    ...row,
    closed: toBooleanFlag(row.closed),
  };
}

function dateToTime(value: unknown): number | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
}

function subtractMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() - months);
  return next;
}

function shouldHideInactiveLoanFromReport(instrument: any) {
  const derivedCurrentBalance = toNumber(instrument?.derivedCurrentBalance);
  const lastActivityTime = dateToTime(instrument?.lastDate);
  if (!lastActivityTime) return true;

  const asOfTime = dateToTime(instrument?.derivedCurrentBalanceAsOf);
  const referenceDate = asOfTime ? new Date(asOfTime) : new Date();
  const staleBefore = subtractMonths(referenceDate, STALE_LOAN_ACTIVITY_MONTHS).getTime();
  const isStale = lastActivityTime < staleBefore;
  if (String(instrument?.targetField || '').toLowerCase() === 'ltd') return isStale;
  if (derivedCurrentBalance !== null && Math.abs(derivedCurrentBalance) > 0.005) return false;
  return isStale;
}

function isLocLoanAccount(accountId: unknown, accountName: unknown, targetField: unknown): boolean {
  const normalizedTarget = String(targetField || '').trim().toLowerCase();
  if (normalizedTarget === 'loc') return true;
  const haystack = `${accountId || ''} ${accountName || ''}`.toLowerCase();
  return /\bloc\b|line of credit/.test(haystack);
}

function sumActivityForMonth(activity: any[], month: string) {
  if (!month) return 0;
  return activity.reduce((sum, row) => {
    return monthKey(row?.transDate) === month ? sum + Math.abs(Number(row?.signedAmount || 0)) : sum;
  }, 0);
}

function dedupeActivityRows(rows: any[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row?.transDate ? new Date(row.transDate).toISOString().slice(0, 10) : '',
      String(row?.accountId || '').trim(),
      String(row?.ref || '').trim(),
      String(row?.description || '').trim(),
      Number(row?.signedAmount || 0).toFixed(2),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: unknown, maxLength = 500): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function safeInstrumentKey(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .slice(0, 120);
}

function monthKey(value: unknown): string {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthEnd(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 0, 23, 59, 59, 999));
}

function maxValidDate(values: unknown[]): Date | null {
  let latest = 0;
  for (const value of values) {
    const time = dateToTime(value);
    if (time && time > latest) latest = time;
  }
  return latest ? new Date(latest) : null;
}

async function loadLoanAccountBalanceSnapshots(
  companyId: string,
  accountIds: string[],
  currentAsOfDate: Date,
  priorAsOfDate: Date
): Promise<Map<string, {
  currentBalance: number | null;
  priorMonthBalance: number | null;
  currentSource: string | null;
  priorSource: string | null;
  currentAsOfDate: Date | null;
  priorAsOfDate: Date | null;
}>> {
  const ids = Array.from(new Set(accountIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const balances = new Map<string, {
    currentBalance: number | null;
    priorMonthBalance: number | null;
    currentSource: string | null;
    priorSource: string | null;
    currentAsOfDate: Date | null;
    priorAsOfDate: Date | null;
  }>();
  ids.forEach((accountId) => {
    balances.set(accountId, {
      currentBalance: null,
      priorMonthBalance: null,
      currentSource: null,
      priorSource: null,
      currentAsOfDate: null,
      priorAsOfDate: null,
    });
  });
  if (!ids.length) return balances;

  const anchorRows = await prisma.$queryRawUnsafe<Array<{
    period: string;
    accountId: string | null;
    asOfDate: Date | null;
    anchorDate: Date | null;
    balance: number | null;
  }>>(
    `
      WITH periods("period", "asOfDate") AS (
        VALUES
          ('current', $2::timestamptz),
          ('prior', $3::timestamptz)
      ),
      anchor_dates AS (
        SELECT
          p."period",
          MAX(a."anchorDate") AS "anchorDate"
        FROM periods p
        JOIN "BalanceSheetAccountAnchor" a
          ON a."companyId" = $1
         AND a."anchorDate" <= p."asOfDate"
        GROUP BY p."period"
      ),
      anchors AS (
        SELECT
          p."period",
          p."asOfDate",
          TRIM(a."accountId") AS "accountId",
          a."anchorDate",
          a."openingBalance"::float8 AS "openingBalance"
        FROM periods p
        JOIN anchor_dates ad
          ON ad."period" = p."period"
        JOIN "BalanceSheetAccountAnchor" a
          ON a."companyId" = $1
         AND a."anchorDate" = ad."anchorDate"
         AND TRIM(a."accountId") = ANY($4::text[])
      ),
      deltas AS (
        SELECT
          a."period",
          a."accountId",
          SUM(COALESCE(g."signedAmount", 0))::float8 AS "delta"
        FROM anchors a
        LEFT JOIN "GLTransactionFact" g
          ON g."companyId" = $1
         AND TRIM(g."accountId") = a."accountId"
         AND g."transDate" > a."anchorDate"
         AND g."transDate" <= a."asOfDate"
        GROUP BY a."period", a."accountId"
      )
      SELECT
        a."period",
        a."accountId",
        a."asOfDate",
        a."anchorDate",
        (a."openingBalance" + COALESCE(d."delta", 0))::float8 AS "balance"
      FROM anchors a
      LEFT JOIN deltas d
        ON d."period" = a."period"
       AND d."accountId" = a."accountId"
    `,
    companyId,
    currentAsOfDate,
    priorAsOfDate,
    ids
  );

  const setBalance = (
    accountId: string,
    period: string,
    balance: number | null,
    source: string,
    asOfDate: Date | null
  ) => {
    const existing = balances.get(accountId);
    if (!existing || balance === null || balance === undefined) return;
    if (period === 'current' && existing.currentBalance === null) {
      existing.currentBalance = Number(balance || 0);
      existing.currentSource = source;
      existing.currentAsOfDate = asOfDate;
    }
    if (period === 'prior' && existing.priorMonthBalance === null) {
      existing.priorMonthBalance = Number(balance || 0);
      existing.priorSource = source;
      existing.priorAsOfDate = asOfDate;
    }
  };

  for (const row of anchorRows) {
    const accountId = String(row.accountId || '').trim();
    if (!accountId) continue;
    setBalance(accountId, String(row.period || ''), row.balance, 'BalanceSheetAccountAnchor + GL delta', row.asOfDate);
  }

  return balances;
}

function compactTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !['note', 'loan', 'payable', 'term', 'line', 'credit'].includes(token))
    )
  );
}

function normalizeMatchText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function qbdNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function loanMatchTokens(value: string): string[] {
  const generic = new Set([
    'loan',
    'note',
    'payable',
    'line',
    'credit',
    'bank',
    'financial',
    'capital',
    'program',
  ]);
  return Array.from(
    new Set(
      normalizeMatchText(value)
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !generic.has(token))
    )
  );
}

async function loadLoanTerms(companyId: string) {
  await ensureLoanTermsTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        "instrumentKey",
        "displayName",
        "loanType",
        "lender",
        "originalBalance",
        "loanOriginationDate",
        "currentBalance",
        "interestRatePct",
        "maturityDate",
        "amortizationTermMonths",
        "paymentFrequency",
        "notes",
        COALESCE("closed", false) AS "closed",
        "updatedAt"
      FROM "LoanInstrumentTerm"
      WHERE "companyId" = $1
      ORDER BY COALESCE("displayName", "instrumentKey")
    `,
    companyId
  );
  return rows.map(normalizeLoanTerms);
}

async function loadAccountNameFallbacks(companyId: string, accountIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(accountIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const names = new Map<string, string>();
  if (!ids.length) return names;

  const mappingRows = await prisma.$queryRawUnsafe<Array<{ accountId: string | null; accountName: string | null }>>(
    `
      SELECT "accountId", NULLIF(TRIM("accountName"), '') AS "accountName"
      FROM "AccountMapping"
      WHERE "companyId" = $1
        AND "accountId" = ANY($2::text[])
        AND NULLIF(TRIM("accountName"), '') IS NOT NULL
      ORDER BY "updatedAt" DESC
    `,
    companyId,
    ids
  );
  for (const row of mappingRows) {
    const accountId = String(row.accountId || '').trim();
    const accountName = String(row.accountName || '').trim();
    if (accountId && accountName && !names.has(accountId)) names.set(accountId, accountName);
  }

  const anchorRows = await prisma.$queryRawUnsafe<Array<{ accountId: string | null; accountName: string | null }>>(
    `
      SELECT DISTINCT ON ("accountId")
        "accountId",
        NULLIF(TRIM("accountName"), '') AS "accountName"
      FROM "BalanceSheetAccountAnchor"
      WHERE "companyId" = $1
        AND "accountId" = ANY($2::text[])
        AND NULLIF(TRIM("accountName"), '') IS NOT NULL
      ORDER BY "accountId", "anchorDate" DESC, "updatedAt" DESC
    `,
    companyId,
    ids
  );
  for (const row of anchorRows) {
    const accountId = String(row.accountId || '').trim();
    const accountName = String(row.accountName || '').trim();
    if (accountId && accountName && !names.has(accountId)) names.set(accountId, accountName);
  }

  return names;
}

async function loadInforRawLoanActivity(companyId: string, accountIds: string[]): Promise<Map<string, any>> {
  const ids = Array.from(new Set(accountIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const byAccount = new Map<string, any>();
  if (!ids.length) return byAccount;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      WITH logs AS (
        SELECT l."errorDetails"->'response'->'Items' AS items
        FROM "ApiSyncLog" l
        WHERE l."companyId" = $1
          AND l.platform = 'INFOR_M3'
          AND l.status = 'success'
          AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ),
      raw_rows AS (
        SELECT x.value AS item
        FROM logs l
        CROSS JOIN LATERAL jsonb_array_elements(l.items) x
      ),
      normalized AS (
        SELECT
          TRIM(COALESCE(item->>'Acct', item->>'AcctNum', item->>'Account', item->>'account', item->>'accountId', item->>'accountCode')) AS "accountId",
          NULLIF(TRIM(COALESCE(item->>'Ref', item->>'Description', item->>'description', item->>'accountName', item->>'Name', item->>'name')), '') AS "description",
          NULLIF(TRIM(COALESCE(item->>'TransDate', item->>'transDate', item->>'Date', item->>'date')), '') AS "transDateRaw",
          NULLIF(TRIM(COALESCE(item->>'DomAmount', item->>'Amount', item->>'amount', item->>'SignedAmount', item->>'signedAmount')), '') AS "amountRaw",
          NULLIF(TRIM(COALESCE(item->>'TransNum', item->>'transNum', item->>'_ItemId')), '') AS "transNum"
        FROM raw_rows
      ),
      dedup AS (
        SELECT DISTINCT
          "accountId",
          "description",
          "transDateRaw",
          "amountRaw",
          "transNum"
        FROM normalized
        WHERE "accountId" = ANY($2::text[])
          AND "amountRaw" IS NOT NULL
      ),
      typed AS (
        SELECT
          "accountId",
          "description",
          "transDateRaw",
          CASE
            WHEN "transDateRaw" ~ '^[0-9]{8}' THEN to_timestamp(substring("transDateRaw" from 1 for 8), 'YYYYMMDD')::timestamptz
            ELSE NULL
          END AS "transDate",
          NULLIF(regexp_replace("amountRaw", '[^0-9.\\-]', '', 'g'), '')::float8 AS "signedAmount",
          "transNum"
        FROM dedup
      ),
      summary AS (
        SELECT
          "accountId",
          COUNT(*)::int AS "transactionCount",
          MIN("transDate") AS "firstDate",
          MAX("transDate") AS "lastDate",
          SUM(COALESCE("signedAmount", 0))::float8 AS "activityTotal"
        FROM typed
        GROUP BY "accountId"
      )
      SELECT
        s.*,
        NULLIF(TRIM(am."accountName"), '') AS "accountName",
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'transDate', t."transDate",
              'accountId', t."accountId",
              'accountName', NULLIF(TRIM(am."accountName"), ''),
              'signedAmount', t."signedAmount",
              'debitAmount', CASE WHEN t."signedAmount" > 0 THEN t."signedAmount" ELSE 0 END,
              'creditAmount', CASE WHEN t."signedAmount" < 0 THEN ABS(t."signedAmount") ELSE 0 END,
              'description', t."description",
              'ref', t."transNum",
              'sourceProgram', 'ApiSyncLog:INFOR_M3'
            )
            ORDER BY t."transDate" DESC NULLS LAST
          ) FILTER (WHERE t."accountId" IS NOT NULL),
          '[]'::jsonb
        ) AS "recentActivity"
      FROM summary s
      LEFT JOIN LATERAL (
        SELECT *
        FROM typed t
        WHERE t."accountId" = s."accountId"
        ORDER BY t."transDate" DESC NULLS LAST
        LIMIT 20
      ) t ON true
      LEFT JOIN "AccountMapping" am
        ON am."companyId" = $1
       AND TRIM(am."accountId") = s."accountId"
      GROUP BY s."accountId", s."transactionCount", s."firstDate", s."lastDate", s."activityTotal", am."accountName"
    `,
    companyId,
    ids
  );

  for (const row of rows) {
    const accountId = String(row.accountId || '').trim();
    if (!accountId) continue;
    byAccount.set(accountId, {
      transactionCount: Number(row.transactionCount || 0),
      firstDate: row.firstDate || null,
      lastDate: row.lastDate || null,
      activityTotal: Number(row.activityTotal || 0),
      recentActivity: Array.isArray(row.recentActivity) ? row.recentActivity : [],
    });
  }
  return byAccount;
}

async function loadInforRawLoanInterestActivity(companyId: string): Promise<Map<string, any[]>> {
  const byLoanAccount = new Map<string, any[]>();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      WITH logs AS (
        SELECT l."errorDetails"->'response'->'Items' AS items
        FROM "ApiSyncLog" l
        WHERE l."companyId" = $1
          AND l.platform = 'INFOR_M3'
          AND l.status = 'success'
          AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ),
      raw_rows AS (
        SELECT x.value AS item
        FROM logs l
        CROSS JOIN LATERAL jsonb_array_elements(l.items) x
      ),
      normalized AS (
        SELECT
          TRIM(COALESCE(item->>'Acct', item->>'AcctNum', item->>'Account', item->>'account', item->>'accountId', item->>'accountCode')) AS "accountId",
          NULLIF(TRIM(COALESCE(item->>'Ref', item->>'Description', item->>'description', item->>'accountName', item->>'Name', item->>'name')), '') AS "description",
          NULLIF(TRIM(COALESCE(item->>'TransDate', item->>'transDate', item->>'Date', item->>'date')), '') AS "transDateRaw",
          NULLIF(TRIM(COALESCE(item->>'DomAmount', item->>'Amount', item->>'amount', item->>'SignedAmount', item->>'signedAmount')), '') AS "amountRaw",
          NULLIF(TRIM(COALESCE(item->>'TransNum', item->>'transNum', item->>'_ItemId')), '') AS "transNum"
        FROM raw_rows
      ),
      dedup AS (
        SELECT DISTINCT
          CASE
            WHEN COALESCE("description", '') ~* 'loc interest' THEN '39160'
            ELSE NULL
          END AS "loanAccountId",
          "accountId",
          "description",
          "transDateRaw",
          "amountRaw",
          "transNum"
        FROM normalized
        WHERE COALESCE("description", '') ~* 'loc interest'
          AND "amountRaw" IS NOT NULL
      )
      SELECT
        "loanAccountId",
        "accountId",
        "description",
        CASE
          WHEN "transDateRaw" ~ '^[0-9]{8}' THEN to_timestamp(substring("transDateRaw" from 1 for 8), 'YYYYMMDD')::timestamptz
          ELSE NULL
        END AS "transDate",
        NULLIF(regexp_replace("amountRaw", '[^0-9.\\-]', '', 'g'), '')::float8 AS "signedAmount",
        "transNum"
      FROM dedup
      WHERE "loanAccountId" IS NOT NULL
      ORDER BY "transDate" DESC NULLS LAST
      LIMIT 200
    `,
    companyId
  );

  const accountNames = await loadAccountNameFallbacks(
    companyId,
    rows.map((row) => String(row.accountId || '').trim())
  );

  for (const row of rows) {
    const loanAccountId = String(row.loanAccountId || '').trim();
    const accountId = String(row.accountId || '').trim();
    if (!loanAccountId || !accountId) continue;
    const signedAmount = Number(row.signedAmount || 0);
    const activity = {
      transDate: row.transDate,
      accountId,
      accountName: accountNames.get(accountId) || null,
      signedAmount,
      debitAmount: signedAmount > 0 ? signedAmount : 0,
      creditAmount: signedAmount < 0 ? Math.abs(signedAmount) : 0,
      drCr: null,
      description: row.description || 'LOC Interest',
      ref: row.transNum,
      sourceProgram: 'ApiSyncLog:INFOR_M3',
    };
    const existing = byLoanAccount.get(loanAccountId) || [];
    existing.push(activity);
    byLoanAccount.set(loanAccountId, existing);
  }

  return byLoanAccount;
}

async function loadQuickBooksDesktopLoanInterestActivity(companyId: string, loanRows: any[]): Promise<Map<string, any[]>> {
  const byLoanAccount = new Map<string, any[]>();
  const accountIds = Array.from(new Set(loanRows.map((row) => String(row.accountId || '').trim()).filter(Boolean)));
  if (!accountIds.length) return byLoanAccount;

  const termsRows = await loadLoanTerms(companyId).catch(() => []);
  const termsByInstrument = new Map(termsRows.map((term) => [String(term.instrumentKey || ''), term]));
  const loanCandidates = loanRows
    .map((row) => {
      const accountId = String(row.accountId || '').trim();
      const instrumentKey = String(row.instrumentKey || `gl:${accountId}`);
      const terms = termsByInstrument.get(instrumentKey) || null;
      const accountName = String(row.accountName || row.displayName || accountId || '').trim();
      const displayName = String(terms?.displayName || accountName || '').trim();
      const lender = String(terms?.lender || '').trim();
      const phrases = [lender, displayName, accountName].map(normalizeMatchText).filter((text) => text.length >= 4);
      const tokens = loanMatchTokens([lender, displayName, accountName].join(' '));
      return { accountId, accountName, displayName, lender, phrases, tokens };
    })
    .filter((candidate) => candidate.accountId);

  if (!loanCandidates.length) return byLoanAccount;

  const rows = await prisma.$queryRawUnsafe<Array<{
    accountName: string | null;
    transDateRaw: string | null;
    amountRaw: string | null;
    txnType: string | null;
    ref: string | null;
    payee: string | null;
    memo: string | null;
    splitAccount: string | null;
  }>>(
    `
      WITH qbd_rows AS (
        SELECT row.value AS item
        FROM "QuickBooksDesktopBackfillPage" p
        CROSS JOIN LATERAL jsonb_array_elements(p."payload") row(value)
        WHERE p."companyId" = $1
          AND p."requestName" = 'GeneralDetailReportQuery'
      )
      SELECT
        COALESCE(item->>'accountName', item->>'rowValue', '') AS "accountName",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '3'), '') AS "transDateRaw",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '8'), '') AS "amountRaw",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '2'), '') AS "txnType",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '4'), '') AS "ref",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '5'), '') AS "payee",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '6'), '') AS "memo",
        COALESCE((SELECT c->>'value' FROM jsonb_array_elements(item->'colData') c WHERE c->>'colID' = '7'), '') AS "splitAccount"
      FROM qbd_rows
      WHERE item->>'rowKind' = 'DataRow'
        AND COALESCE(item->>'accountName', item->>'rowValue', '') ~* 'interest'
    `,
    companyId
  );

  const bestMatchForRow = (row: {
    accountName: string | null;
    payee: string | null;
    memo: string | null;
    ref: string | null;
    splitAccount: string | null;
  }) => {
    const haystack = normalizeMatchText([
      row.accountName,
      row.payee,
      row.memo,
      row.ref,
      row.splitAccount,
    ].join(' '));
    let best: { accountId: string; score: number } | null = null;
    for (const candidate of loanCandidates) {
      let score = 0;
      const lenderText = normalizeMatchText(candidate.lender);
      if (lenderText && haystack.includes(lenderText)) score += 100;
      for (const phrase of candidate.phrases) {
        if (phrase && haystack.includes(phrase)) score += 50;
      }
      const tokenHits = candidate.tokens.filter((token) => haystack.includes(token)).length;
      score += tokenHits * 10;
      if (score > 0 && (!best || score > best.score)) {
        best = { accountId: candidate.accountId, score };
      }
    }
    return best?.accountId || null;
  };

  for (const row of rows) {
    const amount = qbdNumber(row.amountRaw);
    if (Math.abs(amount) <= 0.005) continue;
    const loanAccountId = bestMatchForRow(row);
    if (!loanAccountId) continue;
    const transDate = row.transDateRaw ? new Date(`${row.transDateRaw}T00:00:00.000Z`) : null;
    const activity = {
      transDate: transDate && !Number.isNaN(transDate.getTime()) ? transDate : row.transDateRaw,
      accountId: 'QBD_INTEREST_EXPENSE',
      accountName: row.accountName || 'Interest Expense',
      signedAmount: amount,
      debitAmount: amount > 0 ? amount : 0,
      creditAmount: amount < 0 ? Math.abs(amount) : 0,
      drCr: null,
      description: [row.payee, row.memo].filter(Boolean).join(' | ') || 'QBD Interest Expense',
      ref: row.ref || row.txnType || null,
      sourceProgram: 'QuickBooksDesktopBackfillPage:GeneralDetailReportQuery',
    };
    const existing = byLoanAccount.get(loanAccountId) || [];
    existing.push(activity);
    byLoanAccount.set(loanAccountId, existing);
  }

  return byLoanAccount;
}

async function loadLoanActivity(companyId: string) {
  const mappedDebtRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        CONCAT('gl:', TRIM("accountId")) AS "instrumentKey",
        TRIM("accountId") AS "accountId",
        NULLIF(TRIM("accountName"), '') AS "accountName",
        0::int AS "transactionCount",
        NULL::timestamptz AS "firstDate",
        NULL::timestamptz AS "lastDate",
        0::float8 AS "activityTotal",
        0::float8 AS "debits",
        0::float8 AS "credits"
      FROM "AccountMapping"
      WHERE "companyId" = $1
        AND NULLIF(TRIM("accountId"), '') IS NOT NULL
        AND (
          COALESCE("targetField", '') IN ('loc', 'ltd')
          OR (
            (
              UPPER(COALESCE("accountClassification", '')) IN ('L', 'LIABILITY', 'LIABILITIES')
              OR TRIM("accountId") ~ '^39[0-9]'
            )
            AND COALESCE("accountName", '') ~* $2
          )
        )
        AND NOT (
          COALESCE("accountName", '') ~* 'interest income|interest expense|accrued interest|interest payable'
          OR TRIM("accountId") IN ('39140', '76050', '76350', '83010')
        )
        AND NOT (COALESCE("accountName", '') ~* $3)
      ORDER BY TRIM("accountId"), "accountName"
    `,
    companyId,
    DEBT_ACCOUNT_NAME_PATTERN,
    NON_DEBT_LOAN_ACCOUNT_PATTERN
  );

  const mappedDebtAccountIds = Array.from(
    new Set(mappedDebtRows.map((row) => String(row.accountId || '').trim()).filter(Boolean))
  );

  let principalRows = mappedDebtAccountIds.length
    ? await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        CONCAT('gl:', TRIM("accountId")) AS "instrumentKey",
        TRIM("accountId") AS "accountId",
        COALESCE(MAX(NULLIF(TRIM("accountName"), '')), MAX(TRIM("accountId"))) AS "accountName",
        COUNT(*)::int AS "transactionCount",
        MIN("transDate") AS "firstDate",
        MAX("transDate") AS "lastDate",
        SUM(COALESCE("signedAmount", 0))::float8 AS "activityTotal",
        SUM(COALESCE("debitAmount", 0))::float8 AS "debits",
        SUM(COALESCE("creditAmount", 0))::float8 AS "credits"
      FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND TRIM("accountId") = ANY($2::text[])
        AND NOT (
          COALESCE("accountName", '') ~* 'interest income|interest expense|accrued interest'
          OR TRIM("accountId") IN ('76050', '76350', '83010')
        )
        AND NOT (COALESCE("accountName", '') ~* $3)
      GROUP BY TRIM("accountId")
      HAVING COUNT(*) > 0
      ORDER BY TRIM("accountId")
    `,
    companyId,
    mappedDebtAccountIds,
    NON_DEBT_LOAN_ACCOUNT_PATTERN
  )
    : [];

  const existingInstrumentKeys = new Set(principalRows.map((row) => String(row.instrumentKey || '')));
  principalRows = [
    ...principalRows,
    ...mappedDebtRows.filter((row) => {
      const key = String(row.instrumentKey || '');
      if (!key || existingInstrumentKeys.has(key)) return false;
      existingInstrumentKeys.add(key);
      return true;
    }),
  ];
  const rawInforActivityByAccount = await loadInforRawLoanActivity(
    companyId,
    principalRows.map((row) => row.accountId)
  );
  const rawInforInterestByAccount = await loadInforRawLoanInterestActivity(companyId);
  const qbdInterestByAccount = await loadQuickBooksDesktopLoanInterestActivity(companyId, principalRows);
  const accountMetadata = await loadLoanAccountMetadata(
    companyId,
    principalRows.map((row) => row.accountId)
  );
  const latestDailySnapshot = await loadLatestDailyFinancialSnapshot(companyId);
  const latestMonthlyDebtSnapshot = await loadLatestMonthlyFinancialDebtSnapshot(companyId);
  const latestActivityDate = maxValidDate([
    ...principalRows.map((row) => row.lastDate),
    ...Array.from(rawInforActivityByAccount.values()).map((row) => row?.lastDate),
  ]);
  const reportAsOfDate = latestDailySnapshot?.snapshotDate || latestMonthlyDebtSnapshot?.snapshotDate || latestActivityDate || new Date();
  const priorAsOfDate = previousMonthEnd(reportAsOfDate);
  const accountBalanceSnapshots = await loadLoanAccountBalanceSnapshots(
    companyId,
    principalRows.map((row) => row.accountId),
    reportAsOfDate,
    priorAsOfDate
  );

  const monthlyRows = mappedDebtAccountIds.length
    ? await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        CONCAT('gl:', TRIM("accountId")) AS "instrumentKey",
        DATE_TRUNC('month', "transDate")::date AS "month",
        SUM(COALESCE("signedAmount", 0))::float8 AS "activityTotal",
        SUM(COALESCE("debitAmount", 0))::float8 AS "debits",
        SUM(COALESCE("creditAmount", 0))::float8 AS "credits",
        COUNT(*)::int AS "transactionCount"
      FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND TRIM("accountId") = ANY($2::text[])
        AND NOT (
          COALESCE("accountName", '') ~* 'interest income|interest expense|accrued interest'
          OR TRIM("accountId") IN ('76050', '76350', '83010')
        )
        AND NOT (COALESCE("accountName", '') ~* $3)
      GROUP BY TRIM("accountId"), DATE_TRUNC('month', "transDate")::date
      ORDER BY TRIM("accountId"), "month"
    `,
    companyId,
    mappedDebtAccountIds,
    NON_DEBT_LOAN_ACCOUNT_PATTERN
  )
    : [];

  const detailRows = mappedDebtAccountIds.length
    ? await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        CONCAT('gl:', TRIM("accountId")) AS "instrumentKey",
        "transDate",
        TRIM("accountId") AS "accountId",
        "accountName",
        "signedAmount"::float8 AS "signedAmount",
        "debitAmount"::float8 AS "debitAmount",
        "creditAmount"::float8 AS "creditAmount",
        "drCr",
        "description",
        "ref",
        "sourceProgram"
      FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND (
          TRIM("accountId") = ANY($2::text[])
          OR TRIM("accountId") IN ('39140', '76050', '76350', '83010')
          OR COALESCE("accountName", '') ~* 'interest'
        )
        AND NOT (TRIM("accountId") ~ '^10[0-9]' AND COALESCE("accountName", '') !~* 'interest')
      ORDER BY "transDate" DESC
      LIMIT 300
    `,
    companyId,
    mappedDebtAccountIds
  )
    : [];

  const interestRows = detailRows.filter((row) => {
    const haystack = `${row.accountId || ''} ${row.accountName || ''} ${row.ref || ''} ${row.description || ''}`.toLowerCase();
    return (
      ['76050', '76350', '83010', '39140'].includes(String(row.accountId || '')) ||
      /interest/.test(haystack)
    );
  });

  const monthlyByInstrument = monthlyRows.reduce<Record<string, any[]>>((acc, row) => {
    const key = String(row.instrumentKey || '');
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      month: monthKey(row.month),
      activityTotal: Number(row.activityTotal || 0),
      debits: Number(row.debits || 0),
      credits: Number(row.credits || 0),
      transactionCount: Number(row.transactionCount || 0),
    });
    return acc;
  }, {});

  const detailByInstrument = detailRows.reduce<Record<string, any[]>>((acc, row) => {
    const key = String(row.instrumentKey || '');
    if (!acc[key]) acc[key] = [];
    if (acc[key].length < 20) {
      acc[key].push({
        transDate: row.transDate,
        accountId: row.accountId,
        accountName: row.accountName,
        signedAmount: Number(row.signedAmount || 0),
        debitAmount: Number(row.debitAmount || 0),
        creditAmount: Number(row.creditAmount || 0),
        drCr: row.drCr,
        description: row.description,
        ref: row.ref,
        sourceProgram: row.sourceProgram,
      });
    }
    return acc;
  }, {});

  const baseBalanceByAccount = new Map<string, number>();
  const baseSignedBalanceByAccount = new Map<string, number>();
  principalRows.forEach((row) => {
    const accountId = String(row.accountId || '').trim();
    const rawInforActivity = rawInforActivityByAccount.get(accountId) || null;
    const rawTxCount = Number(rawInforActivity?.transactionCount || 0);
    const glTxCount = Number(row.transactionCount || 0);
    const rawLast = rawInforActivity?.lastDate ? new Date(rawInforActivity.lastDate).getTime() : 0;
    const glLast = row.lastDate ? new Date(row.lastDate).getTime() : 0;
    const targetField = (accountMetadata.get(accountId)?.targetField || '').toLowerCase();
    const isLocAccount = isLocLoanAccount(accountId, row.accountName, targetField);
    const useRawActivity =
      rawInforActivity &&
      rawTxCount > glTxCount &&
      (!isLocAccount || rawLast >= glLast);
    const principalActivityTotal = useRawActivity
      ? Number(rawInforActivity.activityTotal || 0)
      : Number(row.activityTotal || 0);
    baseSignedBalanceByAccount.set(accountId, principalActivityTotal);
    baseBalanceByAccount.set(accountId, Math.abs(principalActivityTotal));
  });

  const locAccountIds = principalRows
    .filter((row) => {
      const accountId = String(row.accountId || '').trim();
      const metadata = accountMetadata.get(accountId);
      return isLocLoanAccount(accountId, row.accountName, metadata?.targetField);
    })
    .map((row) => String(row.accountId || '').trim());
  const ltdAccountIds = principalRows
    .map((row) => String(row.accountId || '').trim())
    .filter((accountId) => (accountMetadata.get(accountId)?.targetField || '').toLowerCase() === 'ltd');
  const useMonthlyDebtSnapshot =
    Math.abs(Number(latestDailySnapshot?.loc || 0)) === 0 &&
    Math.abs(Number(latestDailySnapshot?.ltd || 0)) === 0 &&
    !!latestMonthlyDebtSnapshot;
  const debtSnapshotSource = useMonthlyDebtSnapshot ? 'MonthlyFinancial' : 'DailyFinancialSnapshot';
  const latestLocBalance = Math.abs(Number((useMonthlyDebtSnapshot ? latestMonthlyDebtSnapshot?.loc : latestDailySnapshot?.loc) || 0));
  const latestLtdBalance = Math.abs(Number((useMonthlyDebtSnapshot ? latestMonthlyDebtSnapshot?.ltd : latestDailySnapshot?.ltd) || 0));
  const latestInterestExpense = Math.abs(Number(latestMonthlyDebtSnapshot?.interestExpense || 0));
  const latestSnapshotDate =
    (useMonthlyDebtSnapshot ? latestMonthlyDebtSnapshot?.snapshotDate : latestDailySnapshot?.snapshotDate) || null;
  const activeLocAccountIds = new Set<string>();
  const activeLtdAccountIds = new Set<string>();
  if (latestLocBalance > 0) {
    if (locAccountIds.length === 1) {
      activeLocAccountIds.add(locAccountIds[0]);
    }
    locAccountIds.forEach((accountId) => {
      const balance = Math.abs(Number(baseSignedBalanceByAccount.get(accountId) || 0));
      const tolerance = Math.max(1, latestLocBalance * 0.0025);
      if (Math.abs(balance - latestLocBalance) <= tolerance) {
        activeLocAccountIds.add(accountId);
      }
    });
    if (activeLocAccountIds.size === 0) {
      const staleBefore = subtractMonths(reportAsOfDate, STALE_LOAN_ACTIVITY_MONTHS).getTime();
      const bestRecentLoc = locAccountIds
        .map((accountId) => {
          const row = principalRows.find((item) => String(item.accountId || '').trim() === accountId);
          const rawInforActivity = rawInforActivityByAccount.get(accountId) || null;
          const lastActivityTime = Math.max(dateToTime(row?.lastDate) || 0, dateToTime(rawInforActivity?.lastDate) || 0);
          const accountBalanceSnapshot = accountBalanceSnapshots.get(accountId) || null;
          const currentBalance = accountBalanceSnapshot?.currentBalance == null
            ? Math.abs(Number(baseSignedBalanceByAccount.get(accountId) || 0))
            : Math.abs(Number(accountBalanceSnapshot.currentBalance || 0));
          return { accountId, lastActivityTime, currentBalance };
        })
        .filter((candidate) => candidate.lastActivityTime >= staleBefore && candidate.currentBalance > 0.005)
        .sort((a, b) => b.lastActivityTime - a.lastActivityTime || b.currentBalance - a.currentBalance)[0];
      if (bestRecentLoc) activeLocAccountIds.add(bestRecentLoc.accountId);
    }
  }
  if (latestLtdBalance > 0) {
    if (ltdAccountIds.length === 1) {
      activeLtdAccountIds.add(ltdAccountIds[0]);
    }
    const ltdGlTotal = ltdAccountIds.reduce((sum, accountId) => {
      const row = principalRows.find((item) => String(item.accountId || '').trim() === accountId);
      return sum + Math.abs(Number(row?.activityTotal || 0));
    }, 0);
    const tolerance = Math.max(1, latestLtdBalance * 0.0025);
    if (Math.abs(ltdGlTotal - latestLtdBalance) <= tolerance) {
      ltdAccountIds.forEach((accountId) => {
        const row = principalRows.find((item) => String(item.accountId || '').trim() === accountId);
        if (Math.abs(Number(row?.activityTotal || 0)) > 0) activeLtdAccountIds.add(accountId);
      });
    }
  }

  return principalRows.map((row) => {
    const accountId = String(row.accountId || '').trim();
    const rawInforActivity = rawInforActivityByAccount.get(accountId) || null;
    const rawInforInterest = rawInforInterestByAccount.get(accountId) || [];
    const qbdInterest = qbdInterestByAccount.get(accountId) || [];
    const name = String(row.accountName || row.accountId || 'Loan');
    const tokens = compactTokens(`${row.accountId || ''} ${name}`);
    const linkedInterest = interestRows.filter((interest) => {
      const interestAccountId = String(interest.accountId || '').trim();
      const haystack = `${interest.accountName || ''} ${interest.ref || ''} ${interest.description || ''}`.toLowerCase();
      if (accountId === '39185' && interestAccountId === '76350') return true;
      if (accountId === '39165' && interestAccountId === '76050' && /term loan|amnb term/.test(haystack)) return true;
      if (accountId === '39175' && interestAccountId === '76050' && /\bsba\b|eidl/.test(haystack)) return true;
      return tokens.some((token) => haystack.includes(token));
    });
    const allInterestActivity = dedupeActivityRows([...linkedInterest, ...rawInforInterest, ...qbdInterest]);

    const rawTxCount = Number(rawInforActivity?.transactionCount || 0);
    const glTxCount = Number(row.transactionCount || 0);
    const rawLast = rawInforActivity?.lastDate ? new Date(rawInforActivity.lastDate).getTime() : 0;
    const glLast = row.lastDate ? new Date(row.lastDate).getTime() : 0;
    const targetField = (accountMetadata.get(accountId)?.targetField || '').toLowerCase();
    const isLocAccount = isLocLoanAccount(accountId, name, targetField);
    let useRawActivity =
      rawInforActivity &&
      rawTxCount > glTxCount &&
      (!isLocAccount || rawLast >= glLast);
    if (targetField === 'ltd' && glTxCount > 0) {
      useRawActivity = false;
    }
    if ((isLocAccount && activeLocAccountIds.has(accountId)) || (targetField === 'ltd' && activeLtdAccountIds.has(accountId))) {
      useRawActivity = false;
    }
    const principalActivityTotal = useRawActivity
      ? Number(rawInforActivity.activityTotal || 0)
      : Number(row.activityTotal || 0);
    const accountBalanceSnapshot = accountBalanceSnapshots.get(accountId) || null;
    const snapshotCurrentBalance = accountBalanceSnapshot?.currentBalance == null
      ? null
      : Math.abs(Number(accountBalanceSnapshot.currentBalance || 0));
    const derivedCurrentBalance = snapshotCurrentBalance;
    const derivedCurrentBalanceSource = accountBalanceSnapshot?.currentSource || null as string | null;
    const derivedCurrentBalanceAsOf = accountBalanceSnapshot?.currentAsOfDate || null as Date | null;
    let instrumentStatus: 'active' | 'inactive' | 'unknown' = 'unknown';
    let statusReason: string | null = null;
    if (derivedCurrentBalance !== null && Math.abs(derivedCurrentBalance) > 0.005) {
      instrumentStatus = 'active';
    } else if (Number(row.transactionCount || 0) > 0 || rawTxCount > 0) {
      instrumentStatus = 'inactive';
      statusReason = 'No current account-level balance remains for this loan account.';
    } else {
      statusReason = 'Loan account is mapped, but no account-level balance or activity was found.';
    }
    const monthlyActivity = monthlyByInstrument[String(row.instrumentKey)] || [];
    const recentActivity = dedupeActivityRows([
      ...(useRawActivity ? rawInforActivity.recentActivity : detailByInstrument[String(row.instrumentKey)] || []),
      ...allInterestActivity,
    ]).sort((a, b) => new Date(b?.transDate || 0).getTime() - new Date(a?.transDate || 0).getTime()).slice(0, 30);
    const currentMonth = monthKey(reportAsOfDate);
    const priorMonthBalance = accountBalanceSnapshot?.priorMonthBalance == null
      ? null
      : Math.abs(Number(accountBalanceSnapshot.priorMonthBalance || 0));
    const principalChange = derivedCurrentBalance !== null && priorMonthBalance !== null
      ? derivedCurrentBalance - priorMonthBalance
      : null;
    const currentMonthInterestPaid = sumActivityForMonth(allInterestActivity, currentMonth);

    return {
      instrumentKey: String(row.instrumentKey),
      accountId,
      displayName: name,
      targetField,
      source: useRawActivity ? 'ApiSyncLog:INFOR_M3' : 'GLTransactionFact',
      transactionCount: useRawActivity ? Number(rawInforActivity.transactionCount || 0) : Number(row.transactionCount || 0),
      firstDate: useRawActivity ? rawInforActivity.firstDate : row.firstDate,
      lastDate: (useRawActivity ? rawInforActivity.lastDate : row.lastDate) || derivedCurrentBalanceAsOf,
      activityTotal: principalActivityTotal,
      debits: Number(row.debits || 0),
      credits: Number(row.credits || 0),
      estimatedInterestPaid: currentMonthInterestPaid,
      currentMonthInterestPaid,
      instrumentStatus,
      statusReason,
      derivedCurrentBalance,
      derivedCurrentBalanceSource,
      derivedCurrentBalanceAsOf,
      priorMonthBalance,
      principalChange,
      principalChangeMonth: currentMonth,
      monthlyActivity,
      recentActivity,
    };
  });
}

async function buildLoanActivityPayload(companyId: string) {
  const [terms, instruments] = await Promise.all([
    loadLoanTerms(companyId),
    loadLoanActivity(companyId),
  ]);
  const termsByKey = new Map(terms.map((term) => [String(term.instrumentKey), term]));
  const merged = instruments.map((instrument) => ({
    ...instrument,
    terms: normalizeLoanTerms(termsByKey.get(instrument.instrumentKey)),
  }));
  const configuredOnly = terms
    .filter((term) => !merged.some((instrument) => instrument.instrumentKey === term.instrumentKey))
    .map((term) => ({
      instrumentKey: term.instrumentKey,
      accountId: '',
      displayName: term.displayName || term.instrumentKey,
      source: 'manual',
      transactionCount: 0,
      firstDate: null,
      lastDate: null,
      activityTotal: 0,
      debits: 0,
      credits: 0,
      estimatedInterestPaid: 0,
      monthlyActivity: [],
      recentActivity: [],
      terms: normalizeLoanTerms(term),
    }));
  const reportInstruments = [...merged, ...configuredOnly].filter(
    (instrument) => Boolean(instrument?.instrumentKey)
  );

  return {
    companyId,
    cacheVersion: LOAN_ACTIVITY_CACHE_VERSION,
    instruments: reportInstruments,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    if (!(await requireCompanyAccess(companyId, 'OPERATIONS_LOANS_READ'))) {
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const force = ['1', 'true', 'yes'].includes(String(request.nextUrl.searchParams.get('force') || '').toLowerCase());
    if (!force) {
      const cached = await readLoanActivityCache(companyId);
      if (cached) {
        return NextResponse.json({
          ...cached.payload,
          cache: { hit: true, generatedAt: cached.generatedAt },
        });
      }
    }

    const payload = await buildLoanActivityPayload(companyId);
    await writeLoanActivityCache(companyId, payload);
    return NextResponse.json({
      ...payload,
      cache: { hit: false, generatedAt: payload.generatedAt },
    });
  } catch (error: any) {
    console.error('Operations loans GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load loan data', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'OPERATIONS_LOANS_WRITE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    await ensureLoanTermsTable();
    const input = (body?.terms || {}) as LoanTermInput;
    const instrumentKey = safeInstrumentKey(input.instrumentKey || body?.instrumentKey);
    if (!instrumentKey) {
      return NextResponse.json({ error: 'instrumentKey is required' }, { status: 400 });
    }

    const displayName = cleanText(input.displayName, 200);
    const loanType = cleanText(input.loanType, 100);
    const lender = cleanText(input.lender, 160);
    const originalBalance = toNumber(input.originalBalance);
    const loanOriginationDate = normalizeDate(input.loanOriginationDate);
    const currentBalance = toNumber(input.currentBalance);
    const interestRatePct = toNumber(input.interestRatePct);
    const maturityDate = normalizeDate(input.maturityDate);
    const amortizationTermMonths = toNumber(input.amortizationTermMonths);
    const paymentFrequency = cleanText(input.paymentFrequency, 80);
    const notes = cleanText(input.notes, 2000);
    const closedProvided = Object.prototype.hasOwnProperty.call(input, 'closed');
    const closed = closedProvided ? toBooleanFlag(input.closed) : null;

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
        INSERT INTO "LoanInstrumentTerm" (
          "companyId",
          "instrumentKey",
          "displayName",
          "loanType",
          "lender",
          "originalBalance",
          "loanOriginationDate",
          "currentBalance",
          "interestRatePct",
          "maturityDate",
          "amortizationTermMonths",
          "paymentFrequency",
          "notes",
          "closed",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10::date, $11, $12, $13, COALESCE($14, false), NOW())
        ON CONFLICT ("companyId", "instrumentKey")
        DO UPDATE SET
          "displayName" = EXCLUDED."displayName",
          "loanType" = EXCLUDED."loanType",
          "lender" = EXCLUDED."lender",
          "originalBalance" = EXCLUDED."originalBalance",
          "loanOriginationDate" = EXCLUDED."loanOriginationDate",
          "currentBalance" = EXCLUDED."currentBalance",
          "interestRatePct" = EXCLUDED."interestRatePct",
          "maturityDate" = EXCLUDED."maturityDate",
          "amortizationTermMonths" = EXCLUDED."amortizationTermMonths",
          "paymentFrequency" = EXCLUDED."paymentFrequency",
          "notes" = EXCLUDED."notes",
          "closed" = CASE WHEN $14::boolean IS NULL THEN "LoanInstrumentTerm"."closed" ELSE $14::boolean END,
          "updatedAt" = NOW()
        RETURNING *
      `,
      companyId,
      instrumentKey,
      displayName,
      loanType,
      lender,
      originalBalance,
      loanOriginationDate,
      currentBalance,
      interestRatePct,
      maturityDate,
      amortizationTermMonths,
      paymentFrequency,
      notes,
      closed
    );

    const payload = await buildLoanActivityPayload(companyId);
    await writeLoanActivityCache(companyId, payload);

    return NextResponse.json({
      ok: true,
      term: normalizeLoanTerms(rows[0]) || null,
      payload,
      updatedBy: authContext.email || authContext.userId || null,
    });
  } catch (error: any) {
    console.error('Operations loans POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save loan terms', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}
