import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';

export const dynamic = 'force-dynamic';

const LATEST_VALUES_CACHE_TTL_MS = 60 * 1000;
const latestValuesResponseCache = new Map<string, { cachedAt: number; payload: Record<string, unknown> }>();

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readAny(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function toYearMonth(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const compact = raw.match(/^(\d{4})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  const csiCompactWithTime = raw.match(/^(\d{4})(\d{2})(\d{2})[ T]/);
  if (csiCompactWithTime) return `${csiCompactWithTime[1]}-${csiCompactWithTime[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function resolveMonthEndUtc(targetMonth: string | null): Date | null {
  if (!targetMonth) return null;
  const match = targetMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function resolveMonthStartUtc(targetMonth: string | null): Date | null {
  if (!targetMonth) return null;
  const match = targetMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

// Group B = "QuickBooks pattern": no per-account GLTransactionFact rows are
// written for these systems, so the only trustworthy per-account number is
// what landed in MonthlyFinancial via 1:1 AccountMapping.targetField.
// Everything else (Infor, Sage Intacct, Vista Cloud, NetSuite, Acumatica,
// Odoo, Dynamics 365) is treated as Group A: GLTransactionFact +
// BalanceSheetAccountAnchor based.
const GROUP_B_ACCOUNTING_SYSTEMS = new Set([
  'QUICKBOOKS',
  'QUICKBOOKS_DESKTOP',
  'XERO',
  'SAGE',
]);

const BS_TARGET_FIELDS = new Set([
  'cash',
  'ar',
  'inventory',
  'otherca',
  'fixedassets',
  'otherassets',
  'totalassets',
  'ap',
  'loc',
  'othercl',
  'tcl',
  'ltd',
  'totalliab',
  'ownerscapital',
  'ownersdraw',
  'commonstock',
  'preferredstock',
  'retainedearnings',
  'additionalpaidincapital',
  'treasurystock',
  'totalequity',
  'totallande',
]);

function normalizeTargetField(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function asObjectPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildAccountIdAliases(value: unknown): string[] {
  const aliases = new Set<string>();
  const raw = String(value ?? '').trim();
  if (!raw) return [];

  aliases.add(raw);

  const alnum = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (alnum) aliases.add(alnum);

  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly) aliases.add(digitsOnly);

  if (/^\d+$/.test(digitsOnly)) {
    const numeric = Number(digitsOnly);
    if (Number.isFinite(numeric)) aliases.add(String(numeric));

    if (digitsOnly.length >= 4) aliases.add(digitsOnly.slice(0, 4));
    if (digitsOnly.length >= 5) aliases.add(digitsOnly.slice(0, 5));
    if (digitsOnly.length === 4) aliases.add(`${digitsOnly}0`);
    if (digitsOnly.length >= 5 && digitsOnly.endsWith('0')) aliases.add(digitsOnly.slice(0, -1));
  }

  return Array.from(aliases).filter((token) => token.length > 0);
}

function setAccountValueByAliases(valueByKey: Map<string, number>, accountId: unknown, amount: number): void {
  for (const alias of buildAccountIdAliases(accountId)) {
    valueByKey.set(`id:${alias}`, amount);
  }
}

function addAccountLookupAliases(target: Set<string>, accountId: unknown): void {
  for (const alias of buildAccountIdAliases(accountId)) {
    target.add(`id:${alias}`);
  }
}

function hasGlResponsesPayload(value: unknown): boolean {
  const payload = asObjectPayload(value);
  if (!payload) return false;
  return Array.isArray(payload.glResponses) && payload.glResponses.length > 0;
}

function collectValuesFromInforPayload(rawPayload: unknown, targetMonth: string | null): Map<string, number> {
  const valueByKey = new Map<string, number>();
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return valueByKey;
  }
  const payload = rawPayload as Record<string, unknown>;
  const glResponses = Array.isArray(payload.glResponses) ? payload.glResponses : [];
  const accountAccumulator = new Map<string, number>();

  for (const entry of glResponses) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const entryRecord = entry as Record<string, unknown>;
    const response =
      entryRecord.response && typeof entryRecord.response === 'object' && !Array.isArray(entryRecord.response)
        ? (entryRecord.response as Record<string, unknown>)
        : null;
    const items =
      Array.isArray(response?.Items) ? (response?.Items as unknown[])
      : Array.isArray(response?.items) ? (response?.items as unknown[])
      : Array.isArray(entryRecord.Items) ? (entryRecord.Items as unknown[])
      : [];

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const acct = String(readAny(row, ['Acct', 'AcctNum', 'Account', 'account', 'accountId', 'accountCode']) ?? '').trim();
      if (!acct) continue;

      const year = normalizeNumber(readAny(row, ['ControlYear', 'controlYear', 'FiscalYear', 'fiscalYear']));
      const period = normalizeNumber(readAny(row, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod', 'fiscalPeriod']));
      const rowMonth =
        year >= 1900 && period >= 1 && period <= 12
          ? `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`
          : toYearMonth(readAny(row, ['PeriodEndDate', 'periodEndDate', 'TransDate', 'transDate', 'RecordDate', 'recordDate', 'Date', 'date']));
      if (targetMonth && rowMonth && rowMonth !== targetMonth) continue;

      const amount = normalizeNumber(
        readAny(row, [
          'EndBalance',
          'endBalance',
          'EndingBalance',
          'endingBalance',
          'Balance',
          'balance',
          'PeriodEndBalance',
          'periodEndBalance',
          'YtdBalance',
          'ytdBalance',
        ]),
      );
      accountAccumulator.set(acct, Number(accountAccumulator.get(acct) || 0) + amount);

      const name = String(
        readAny(row, ['Description', 'description', 'AcctDesc', 'accountName', 'Name', 'name']) ?? '',
      )
        .trim()
        .toLowerCase();
      if (name) valueByKey.set(`name:${name}`, amount);
    }
  }

  for (const [acct, amount] of accountAccumulator.entries()) {
    setAccountValueByAliases(valueByKey, acct, amount);
  }
  return valueByKey;
}

async function collectValuesFromApiSyncLogs(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const accountAccumulator = new Map<string, number>();
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) IN ('SLGLTRANS')
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT item
    FROM ledger_rows
  `,
    'account-review.latest-values.collectValuesFromApiSyncLogs',
  );

  for (const row of rows || []) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = String(readAny(item, ['Acct', 'AcctNum', 'Account', 'account', 'accountId', 'accountCode']) ?? '').trim();
    if (!acct) continue;
    const year = normalizeNumber(readAny(item, ['ControlYear', 'controlYear', 'FiscalYear', 'fiscalYear']));
    const period = normalizeNumber(readAny(item, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod', 'fiscalPeriod']));
    const rowMonth =
      year >= 1900 && period >= 1 && period <= 12
        ? `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`
        : toYearMonth(readAny(item, ['PeriodEndDate', 'periodEndDate', 'TransDate', 'transDate', 'RecordDate', 'recordDate', 'Date', 'date']));
    if (targetMonth && rowMonth && rowMonth !== targetMonth) continue;

    const signedAmountFallback = (() => {
      const explicitSigned = readAny(item, ['SignedAmount', 'signedAmount', 'DomAmount', 'domAmount', 'Amount', 'amount']);
      if (explicitSigned !== undefined && explicitSigned !== null && String(explicitSigned).trim() !== '') {
        return normalizeNumber(explicitSigned);
      }
      const debit = normalizeNumber(readAny(item, ['Debit', 'debit', 'DebitAmount', 'debitAmount']));
      const credit = normalizeNumber(readAny(item, ['Credit', 'credit', 'CreditAmount', 'creditAmount']));
      if (debit !== 0 || credit !== 0) return debit - credit;
      return 0;
    })();
    const amount = normalizeNumber(
      readAny(item, [
        'EndBalance',
        'endBalance',
        'EndingBalance',
        'endingBalance',
        'Balance',
        'balance',
        'PeriodEndBalance',
        'periodEndBalance',
        'YtdBalance',
        'ytdBalance',
      ]),
    ) || signedAmountFallback;
    accountAccumulator.set(acct, Number(accountAccumulator.get(acct) || 0) + amount);
    const name = String(readAny(item, ['Description', 'description', 'AcctDesc', 'accountName', 'Name', 'name']) ?? '')
      .trim()
      .toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }

  for (const [acct, amount] of accountAccumulator.entries()) {
    setAccountValueByAliases(valueByKey, acct, amount);
  }
  return valueByKey;
}

async function collectValuesFromPeriodBalanceLogs(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const accountAccumulator = new Map<string, number>();
  if (!targetMonth) return valueByKey;

  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) IN ('GLACCTPERIODBALANCES')
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT item
    FROM ledger_rows
  `,
    'account-review.latest-values.collectValuesFromPeriodBalanceLogs',
  );

  let hasTruePeriodBalanceShape = false;
  for (const row of rows || []) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const hasFiscal = readAny(item, ['FiscalYear', 'fiscalYear', 'FiscalPeriod', 'fiscalPeriod']) !== undefined;
    const hasEndBalance = readAny(item, ['EndBalance', 'endBalance', 'PeriodEndBalance', 'periodEndBalance']) !== undefined;
    if (!hasFiscal || !hasEndBalance) continue;
    hasTruePeriodBalanceShape = true;
    const acct = String(readAny(item, ['Acct', 'AcctNum', 'Account', 'account', 'accountId', 'accountCode']) ?? '').trim();
    if (!acct) continue;
    const year = normalizeNumber(readAny(item, ['FiscalYear', 'fiscalYear', 'ControlYear', 'controlYear']));
    const period = normalizeNumber(readAny(item, ['FiscalPeriod', 'fiscalPeriod', 'ControlPeriod', 'controlPeriod']));
    const rowMonth =
      year >= 1900 && period >= 1 && period <= 12
        ? `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`
        : toYearMonth(readAny(item, ['PeriodEndDate', 'periodEndDate', 'TransDate', 'transDate', 'RecordDate', 'recordDate', 'Date', 'date']));
    if (rowMonth !== targetMonth) continue;

    const amount = normalizeNumber(
      readAny(item, [
        'EndBalance',
        'endBalance',
        'EndingBalance',
        'endingBalance',
        'PeriodEndBalance',
        'periodEndBalance',
      ])
    );
    accountAccumulator.set(acct, Number(accountAccumulator.get(acct) || 0) + amount);
    const name = String(readAny(item, ['Description', 'description', 'AcctDesc', 'accountName', 'Name', 'name']) ?? '')
      .trim()
      .toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }

  for (const [acct, amount] of accountAccumulator.entries()) {
    setAccountValueByAliases(valueByKey, acct, amount);
  }

  if (!hasTruePeriodBalanceShape) {
    return new Map<string, number>();
  }
  return valueByKey;
}

async function collectValuesFromGlTransactionFacts(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthEnd = resolveMonthEndUtc(targetMonth);
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ accountId: string; amount: number; accountName: string | null }>>`
    WITH account_balances AS (
      SELECT
        TRIM("accountId") AS "accountId",
        SUM("signedAmount")::double precision AS amount
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        ${monthEnd ? Prisma.sql`AND "transDate" <= ${monthEnd}` : Prisma.empty}
      GROUP BY 1
    ),
    account_names AS (
      SELECT DISTINCT ON (TRIM("accountId"))
        TRIM("accountId") AS "accountId",
        NULLIF(TRIM(COALESCE("accountName", '')), '') AS "accountName"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        ${monthEnd ? Prisma.sql`AND "transDate" <= ${monthEnd}` : Prisma.empty}
      ORDER BY TRIM("accountId"), "transDate" DESC
    )
    SELECT
      b."accountId",
      b.amount,
      n."accountName"
    FROM account_balances b
    LEFT JOIN account_names n
      ON n."accountId" = b."accountId"
  `,
    'account-review.latest-values.collectValuesFromGlTransactionFacts',
  );

  for (const row of rows || []) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    const amount = normalizeNumber(row.amount);
    setAccountValueByAliases(valueByKey, acct, amount);
    const name = String(row.accountName || '').trim().toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }

  return valueByKey;
}

/**
 * Trusted, per-account end-of-period balance for balance-sheet accounts.
 *
 * Picks the most recent BalanceSheetAccountAnchor <= month-end, then for each
 * anchored account computes
 *   value = openingBalance + SUM(GLTransactionFact.signedAmount)
 *           where transDate > anchorDate AND transDate <= monthEnd
 * which is the same anchor + delta pattern the daily balance sheet uses.
 *
 * Only emits id:* and name:* aliases. The caller decides precedence; this
 * function never returns rollup target:* keys.
 */
async function collectValuesFromPerAccountAnchors(
  companyId: string,
  targetMonth: string | null,
): Promise<{ values: Map<string, number>; anchorDate: Date | null; accountCount: number }> {
  const valueByKey = new Map<string, number>();
  const monthEnd = resolveMonthEndUtc(targetMonth);
  if (!monthEnd) {
    return { values: valueByKey, anchorDate: null, accountCount: 0 };
  }

  const anchorDateRows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ anchorDate: Date }>>`
      SELECT "anchorDate"
      FROM "BalanceSheetAccountAnchor"
      WHERE "companyId" = ${companyId}
        AND "anchorDate" <= ${monthEnd}
      ORDER BY "anchorDate" DESC
      LIMIT 1
    `,
    'account-review.latest-values.collectValuesFromPerAccountAnchors.anchorDate',
  );
  const anchorDate = anchorDateRows[0]?.anchorDate ?? null;
  if (!anchorDate) {
    return { values: valueByKey, anchorDate: null, accountCount: 0 };
  }

  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{
      accountId: string;
      accountName: string | null;
      accountCode: string | null;
      openingBalance: number;
      delta: number | null;
    }>>`
      WITH anchors AS (
        SELECT
          TRIM("accountId") AS "accountId",
          NULLIF(TRIM(COALESCE("accountName", '')), '') AS "accountName",
          NULLIF(TRIM(COALESCE("accountCode", '')), '') AS "accountCode",
          "openingBalance"::double precision AS "openingBalance"
        FROM "BalanceSheetAccountAnchor"
        WHERE "companyId" = ${companyId}
          AND "anchorDate" = ${anchorDate}
      ),
      deltas AS (
        SELECT
          TRIM(g."accountId") AS "accountId",
          SUM(g."signedAmount")::double precision AS "delta"
        FROM "GLTransactionFact" g
        WHERE g."companyId" = ${companyId}
          AND g."transDate" > ${anchorDate}
          AND g."transDate" <= ${monthEnd}
          AND TRIM(g."accountId") IN (SELECT "accountId" FROM anchors)
        GROUP BY 1
      )
      SELECT
        a."accountId",
        a."accountName",
        a."accountCode",
        a."openingBalance",
        d."delta"
      FROM anchors a
      LEFT JOIN deltas d ON d."accountId" = a."accountId"
    `,
    'account-review.latest-values.collectValuesFromPerAccountAnchors.compute',
  );

  let accountCount = 0;
  for (const row of rows || []) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    const opening = normalizeNumber(row.openingBalance);
    const delta = normalizeNumber(row.delta);
    const value = opening + delta;
    accountCount += 1;
    setAccountValueByAliases(valueByKey, acct, value);
    const code = String(row.accountCode || '').trim();
    if (code) setAccountValueByAliases(valueByKey, code, value);
    const name = String(row.accountName || '').trim().toLowerCase();
    if (name) valueByKey.set(`name:${name}`, value);
  }

  return { values: valueByKey, anchorDate, accountCount };
}

async function collectMonthlyMovementFromGlTransactionFacts(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthStart = resolveMonthStartUtc(targetMonth);
  const monthEnd = resolveMonthEndUtc(targetMonth);
  if (!monthStart || !monthEnd) return valueByKey;

  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ accountId: string; amount: number; accountName: string | null }>>`
    WITH account_movements AS (
      SELECT
        TRIM("accountId") AS "accountId",
        SUM("signedAmount")::double precision AS amount
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" >= ${monthStart}
        AND "transDate" <= ${monthEnd}
      GROUP BY 1
    ),
    account_names AS (
      SELECT DISTINCT ON (TRIM("accountId"))
        TRIM("accountId") AS "accountId",
        NULLIF(TRIM(COALESCE("accountName", '')), '') AS "accountName"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" >= ${monthStart}
        AND "transDate" <= ${monthEnd}
      ORDER BY TRIM("accountId"), "transDate" DESC
    )
    SELECT
      m."accountId",
      m.amount,
      n."accountName"
    FROM account_movements m
    LEFT JOIN account_names n
      ON n."accountId" = m."accountId"
  `,
    'account-review.latest-values.collectMonthlyMovementFromGlTransactionFacts',
  );

  for (const row of rows || []) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    const amount = normalizeNumber(row.amount);
    setAccountValueByAliases(valueByKey, acct, amount);
    const name = String(row.accountName || '').trim().toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }
  return valueByKey;
}

async function collectAllMappedValuesFromMonthlyFinancial(
  companyId: string,
  targetMonth: string | null
): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthlyRows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT *
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${companyId}
      ${
        targetMonth
          ? Prisma.sql`AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${targetMonth}`
          : Prisma.empty
      }
    ORDER BY mf."monthDate" DESC, mf."createdAt" DESC
    LIMIT 1
  `,
    'account-review.latest-values.collectAllMappedValuesFromMonthlyFinancial.monthlyRows',
  );
  const monthly = monthlyRows[0] || null;
  if (!monthly) return valueByKey;

  const mappings = await withPrismaReconnectRetry(
    () =>
      prisma.accountMapping.findMany({
        where: {
          companyId,
          targetField: { notIn: ['', 'unmapped', 'UNMAPPED', 'ignored', 'IGNORED'] },
        },
        select: {
          accountName: true,
          accountId: true,
          accountCode: true,
          targetField: true,
        },
      }),
    'account-review.latest-values.collectAllMappedValuesFromMonthlyFinancial.mappings',
  );

  const mappingsByTarget = new Map<string, typeof mappings>();
  for (const mapping of mappings) {
    const targetField = String(mapping.targetField || '').trim();
    const normalizedTarget = normalizeTargetField(targetField);
    if (!normalizedTarget) continue;
    if (!mappingsByTarget.has(normalizedTarget)) mappingsByTarget.set(normalizedTarget, []);
    mappingsByTarget.get(normalizedTarget)!.push(mapping);
  }

  for (const [normalizedTarget, targetMappings] of mappingsByTarget.entries()) {
    const sample = targetMappings[0];
    const rawTargetField = String(sample?.targetField || '').trim();
    if (!rawTargetField) continue;
    const amount = normalizeNumber((monthly as Record<string, unknown>)[rawTargetField]);

    // Guardrail: do not fan out one rolled-up monthly target amount (e.g. payroll)
    // to every mapped account under that target.
    if (targetMappings.length !== 1) {
      continue;
    }

    const mapping = targetMappings[0];
    const accountId = String(mapping.accountId || '').trim();
    const accountCode = String(mapping.accountCode || '').trim();
    const accountName = String(mapping.accountName || '').trim().toLowerCase();

    if (accountId) setAccountValueByAliases(valueByKey, accountId, amount);
    if (accountCode) setAccountValueByAliases(valueByKey, accountCode, amount);
    if (accountName) valueByKey.set(`name:${accountName}`, amount);
  }

  return valueByKey;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const companyId = String(searchParams.get('companyId') || '').trim();
    const targetMonthRaw = String(searchParams.get('targetMonth') || '').trim();
    const targetMonth = /^\d{4}-\d{2}$/.test(targetMonthRaw) ? targetMonthRaw : null;
    const forceRefreshRaw = String(searchParams.get('forceRefresh') || '').trim().toLowerCase();
    const forceRefresh = forceRefreshRaw === '1' || forceRefreshRaw === 'true' || forceRefreshRaw === 'yes';
    const cacheKey = `${companyId}|${targetMonth || ''}`;
    if (forceRefresh) {
      latestValuesResponseCache.delete(cacheKey);
    }
    const cached = latestValuesResponseCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < LATEST_VALUES_CACHE_TTL_MS) {
      return NextResponse.json(cached.payload);
    }

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    const company = await withPrismaReconnectRetry(
      () =>
        prisma.company.findUnique({
          where: { id: companyId },
          select: { accountingSystem: true },
        }),
      'account-review.latest-values.get.company',
    );
    const accountingSystem = String(company?.accountingSystem || '').trim().toUpperCase();
    const isGroupB = GROUP_B_ACCOUNTING_SYSTEMS.has(accountingSystem);

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('AccountReviewLatestValues', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Mappings drive both the BS-vs-P&L classification (via targetField) and
    // the 1:1 fan-out guardrails inside the MonthlyFinancial collectors.
    const mappings = await withPrismaReconnectRetry(
      () =>
        prisma.accountMapping.findMany({
          where: {
            companyId,
            targetField: { notIn: ['', 'unmapped', 'UNMAPPED', 'ignored', 'IGNORED'] },
          },
          select: {
            accountId: true,
            accountCode: true,
            accountName: true,
            targetField: true,
          },
        }),
      'account-review.latest-values.get.mappings',
    );
    const bsAccountKeySet = new Set<string>();
    for (const mapping of mappings) {
      const normalizedTarget = normalizeTargetField(mapping.targetField);
      if (!BS_TARGET_FIELDS.has(normalizedTarget)) continue;
      const id = String(mapping.accountId || '').trim();
      const code = String(mapping.accountCode || '').trim();
      if (id) {
        addAccountLookupAliases(bsAccountKeySet, id);
      }
      if (code) {
        addAccountLookupAliases(bsAccountKeySet, code);
      }
      const name = String(mapping.accountName || '').trim().toLowerCase();
      if (name) bsAccountKeySet.add(`name:${name}`);
    }

    const valueByKey = new Map<string, number>();
    let perAccountAnchorResult: {
      values: Map<string, number>;
      anchorDate: Date | null;
      accountCount: number;
    } = { values: new Map(), anchorDate: null, accountCount: 0 };

    if (isGroupB) {
      // Group B (QuickBooks / Xero / Sage on-prem): no per-account
      // GLTransactionFact ingestion. Latest Value is exclusively the
      // 1:1-mapped MonthlyFinancial[targetField] for the selected month.
      // Multi-mapped targets emit only a `target:<field>` rollup so the
      // per-account row shows N/A instead of a fanned-out fake split.
      const monthlyAll = await collectAllMappedValuesFromMonthlyFinancial(companyId, targetMonth);
      for (const [key, value] of monthlyAll.entries()) {
        valueByKey.set(key, value);
      }
    } else {
      // Group A ("Big ERP" pattern): Infor M3/CSI, Sage Intacct, Vista Cloud,
      // NetSuite, Acumatica, Odoo, Dynamics 365.
      //
      // Resolution order (lowest -> highest priority; later writes win):
      //   1. MonthlyFinancial 1:1 baseline (last-resort for both BS and P&L)
      //   2. Infor connection-metadata snapshot + SLGLTRANS logs (P&L only)
      //   3. GLACCTPERIODBALANCES (BS only, M3-native EOM)
      //   4. Cumulative GLTransactionFact through monthEnd (BS only)
      //   5. Monthly GLTransactionFact movement (P&L only) – primary P&L source
      //   6. BalanceSheetAccountAnchor + GL delta (BS only) – authoritative
      //
      // The bsAccountKeySet guard is applied to every fallback so movement /
      // snapshot values can never be written into a BS account row, and EOM
      // balance sources can never be written into a P&L row.

      // 1. MonthlyFinancial 1:1 baseline.
      const monthlyBaseline = await collectAllMappedValuesFromMonthlyFinancial(companyId, targetMonth);
      for (const [key, value] of monthlyBaseline.entries()) {
        valueByKey.set(key, value);
      }

      // 2. Tertiary P&L fallbacks – Infor connection-metadata snapshot and
      // SLGLTRANS log items. Only relevant when the company is Infor; for
      // other Group A systems the AccountingConnection row will not carry
      // these payloads and the collectors return empty maps.
      const isInfor = accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI';
      if (isInfor) {
        const rows = await withPrismaReconnectRetry(
          () => prisma.$queryRaw<Array<{ csiFinancial: unknown; m3Financial: unknown; csiCoa: unknown; m3Coa: unknown }>>`
          SELECT
            "connectionMetadata"->'inforCsiFinancialPayload' AS "csiFinancial",
            "connectionMetadata"->'inforM3FinancialPayload' AS "m3Financial",
            "connectionMetadata"->'inforCsiCoaPayload' AS "csiCoa",
            "connectionMetadata"->'inforM3CoaPayload' AS "m3Coa"
          FROM "AccountingConnection"
          WHERE "companyId" = ${companyId}
            AND platform = 'INFOR_M3'
          LIMIT 1
        `,
          'account-review.latest-values.get.accounting-connection',
        );
        const payloadRow = rows[0] || null;
        const metadataPayload = hasGlResponsesPayload(payloadRow?.csiFinancial)
          ? asObjectPayload(payloadRow?.csiFinancial)
          : hasGlResponsesPayload(payloadRow?.csiCoa)
            ? asObjectPayload(payloadRow?.csiCoa)
            : hasGlResponsesPayload(payloadRow?.m3Financial)
              ? asObjectPayload(payloadRow?.m3Financial)
              : hasGlResponsesPayload(payloadRow?.m3Coa)
                ? asObjectPayload(payloadRow?.m3Coa)
                : asObjectPayload(payloadRow?.csiFinancial) ||
                  asObjectPayload(payloadRow?.csiCoa) ||
                  asObjectPayload(payloadRow?.m3Financial) ||
                  asObjectPayload(payloadRow?.m3Coa) ||
                  null;
        const inforSnapshot = collectValuesFromInforPayload(metadataPayload, targetMonth);
        for (const [key, value] of inforSnapshot.entries()) {
          if (bsAccountKeySet.has(key)) continue;
          valueByKey.set(key, value);
        }
        const apiSyncValues = await collectValuesFromApiSyncLogs(companyId, targetMonth);
        for (const [key, value] of apiSyncValues.entries()) {
          if (bsAccountKeySet.has(key)) continue;
          valueByKey.set(key, value);
        }
      }

      // 3. GLACCTPERIODBALANCES – Infor M3 native period-end balances.
      // BS-only. Acts as a fallback when no anchor exists for an account.
      if (accountingSystem === 'INFOR_M3') {
        const periodValues = await collectValuesFromPeriodBalanceLogs(companyId, targetMonth);
        for (const [key, value] of periodValues.entries()) {
          if (!bsAccountKeySet.has(key)) continue;
          valueByKey.set(key, value);
        }
      }

      // 4. Cumulative GLTransactionFact through monthEnd. BS-only.
      const factValues = await collectValuesFromGlTransactionFacts(companyId, targetMonth);
      for (const [key, value] of factValues.entries()) {
        if (!bsAccountKeySet.has(key)) continue;
        valueByKey.set(key, value);
      }

      // 5. Monthly GLTransactionFact movement. P&L-only, primary source.
      const monthMovementValues = await collectMonthlyMovementFromGlTransactionFacts(companyId, targetMonth);
      for (const [key, value] of monthMovementValues.entries()) {
        if (bsAccountKeySet.has(key)) continue;
        valueByKey.set(key, value);
      }

      // 6. Per-account BalanceSheetAccountAnchor + GL delta. BS-only,
      // authoritative – mirrors lib/financial/daily-bs-from-gl.ts so EOM
      // balances include pre-ingest activity (cash, fixed assets,
      // accumulated depreciation, etc. with non-zero opening balances).
      perAccountAnchorResult = await collectValuesFromPerAccountAnchors(companyId, targetMonth);
      for (const [key, value] of perAccountAnchorResult.values.entries()) {
        valueByKey.set(key, value);
      }
    }

    const payload = {
      ok: true,
      companyId,
      targetMonth,
      accountingSystem,
      resolutionGroup: isGroupB ? 'B_QUICKBOOKS_PATTERN' : 'A_BIG_ERP_PATTERN',
      count: valueByKey.size,
      values: Object.fromEntries(valueByKey.entries()),
      perAccountAnchor: perAccountAnchorResult.anchorDate
        ? {
            anchorDate: perAccountAnchorResult.anchorDate.toISOString().slice(0, 10),
            accountsWithAnchor: perAccountAnchorResult.accountCount,
          }
        : null,
    };
    latestValuesResponseCache.set(cacheKey, {
      cachedAt: Date.now(),
      payload,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load account review latest values',
        details,
      },
      { status: 500 },
    );
  }
}
