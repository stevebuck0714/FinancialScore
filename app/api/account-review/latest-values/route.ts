import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

export const dynamic = 'force-dynamic';

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
    valueByKey.set(`id:${String(acct).trim()}`, amount);
  }
  return valueByKey;
}

async function collectValuesFromApiSyncLogs(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const accountAccumulator = new Map<string, number>();
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
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
  `;

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
    );
    accountAccumulator.set(acct, Number(accountAccumulator.get(acct) || 0) + amount);
    const name = String(readAny(item, ['Description', 'description', 'AcctDesc', 'accountName', 'Name', 'name']) ?? '')
      .trim()
      .toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }

  for (const [acct, amount] of accountAccumulator.entries()) {
    valueByKey.set(`id:${String(acct).trim()}`, amount);
  }
  return valueByKey;
}

async function collectValuesFromPeriodBalanceLogs(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const accountAccumulator = new Map<string, number>();
  if (!targetMonth) return valueByKey;

  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
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
  `;

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
    const id = String(acct).trim();
    valueByKey.set(`id:${id}`, amount);
    const normalized = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized) valueByKey.set(`id:${normalized}`, amount);
  }

  if (!hasTruePeriodBalanceShape) {
    return new Map<string, number>();
  }
  return valueByKey;
}

async function collectValuesFromGlTransactionFacts(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthEnd = resolveMonthEndUtc(targetMonth);
  const rows = await prisma.$queryRaw<Array<{ accountId: string; amount: number; accountName: string | null }>>`
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
  `;

  for (const row of rows || []) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    const amount = normalizeNumber(row.amount);
    valueByKey.set(`id:${acct}`, amount);
    const normalized = acct.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized) valueByKey.set(`id:${normalized}`, amount);
    const name = String(row.accountName || '').trim().toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }

  return valueByKey;
}

async function collectMonthlyMovementFromGlTransactionFacts(companyId: string, targetMonth: string | null): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthStart = resolveMonthStartUtc(targetMonth);
  const monthEnd = resolveMonthEndUtc(targetMonth);
  if (!monthStart || !monthEnd) return valueByKey;

  const rows = await prisma.$queryRaw<Array<{ accountId: string; amount: number; accountName: string | null }>>`
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
  `;

  for (const row of rows || []) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    const amount = normalizeNumber(row.amount);
    valueByKey.set(`id:${acct}`, amount);
    const normalized = acct.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized) valueByKey.set(`id:${normalized}`, amount);
    const name = String(row.accountName || '').trim().toLowerCase();
    if (name) valueByKey.set(`name:${name}`, amount);
  }
  return valueByKey;
}

async function collectBalanceSheetValuesFromMonthlyFinancial(
  companyId: string,
  targetMonth: string | null
): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthlyRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      mf."cash",
      mf."ar",
      mf."inventory",
      mf."otherCA" AS "otherCA",
      mf."fixedAssets" AS "fixedAssets",
      mf."otherAssets" AS "otherAssets",
      mf."totalAssets" AS "totalAssets",
      mf."ap",
      mf."loc",
      mf."otherCL" AS "otherCL",
      mf."tcl",
      mf."ltd",
      mf."totalLiab" AS "totalLiab",
      mf."ownersCapital" AS "ownersCapital",
      mf."ownersDraw" AS "ownersDraw",
      mf."commonStock" AS "commonStock",
      mf."preferredStock" AS "preferredStock",
      mf."retainedEarnings" AS "retainedEarnings",
      mf."additionalPaidInCapital" AS "additionalPaidInCapital",
      mf."treasuryStock" AS "treasuryStock",
      mf."totalEquity" AS "totalEquity",
      mf."totalLAndE" AS "totalLAndE"
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${companyId}
      ${
        targetMonth
          ? Prisma.sql`AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${targetMonth}`
          : Prisma.empty
      }
    ORDER BY mf."monthDate" DESC, mf."createdAt" DESC
    LIMIT 1
  `;
  const monthly = monthlyRows[0] || null;
  if (!monthly) return valueByKey;

  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { notIn: ['', 'unmapped', 'UNMAPPED'] },
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      targetField: true,
    },
  });

  const bsMappings = mappings.filter((mapping) => BS_TARGET_FIELDS.has(normalizeTargetField(mapping.targetField)));
  const byTarget = new Map<string, typeof bsMappings>();
  for (const mapping of bsMappings) {
    const normalized = normalizeTargetField(mapping.targetField);
    if (!byTarget.has(normalized)) byTarget.set(normalized, []);
    byTarget.get(normalized)!.push(mapping);
  }

  for (const [normalizedTarget, targetMappings] of byTarget.entries()) {
    const sample = targetMappings[0];
    const amount = normalizeNumber((monthly as Record<string, unknown>)[sample.targetField as string]);
    // Guardrail: do not fan out one rollup line value (e.g. total cash)
    // to many detailed accounts; only hydrate 1:1 mapped targets here.
    if (targetMappings.length !== 1) {
      valueByKey.set(`target:${normalizedTarget}`, amount);
      continue;
    }
    const mapping = targetMappings[0];
    const accountId = String(mapping.qbAccountId || '').trim();
    const accountCode = String(mapping.qbAccountCode || '').trim();
    const accountName = String(mapping.qbAccount || '').trim().toLowerCase();
    if (accountId) valueByKey.set(`id:${accountId}`, amount);
    if (accountCode) valueByKey.set(`id:${accountCode}`, amount);
    if (accountName) valueByKey.set(`name:${accountName}`, amount);
    valueByKey.set(`target:${normalizedTarget}`, amount);
  }

  return valueByKey;
}

async function collectAllMappedValuesFromMonthlyFinancial(
  companyId: string,
  targetMonth: string | null
): Promise<Map<string, number>> {
  const valueByKey = new Map<string, number>();
  const monthlyRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
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
  `;
  const monthly = monthlyRows[0] || null;
  if (!monthly) return valueByKey;

  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { notIn: ['', 'unmapped', 'UNMAPPED'] },
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      targetField: true,
    },
  });

  for (const mapping of mappings) {
    const targetField = String(mapping.targetField || '').trim();
    if (!targetField) continue;
    const amount = normalizeNumber((monthly as Record<string, unknown>)[targetField]);
    const accountId = String(mapping.qbAccountId || '').trim();
    const accountCode = String(mapping.qbAccountCode || '').trim();
    const accountName = String(mapping.qbAccount || '').trim().toLowerCase();

    if (accountId) {
      valueByKey.set(`id:${accountId}`, amount);
      const normalized = accountId.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized) valueByKey.set(`id:${normalized}`, amount);
    }
    if (accountCode) {
      valueByKey.set(`id:${accountCode}`, amount);
      const normalized = accountCode.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized) valueByKey.set(`id:${normalized}`, amount);
    }
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

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const accountingSystem = String(company?.accountingSystem || '').trim().toUpperCase();


    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('AccountReviewLatestValues', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await prisma.$queryRaw<Array<{ csi: unknown; m3: unknown }>>`
      SELECT
        "connectionMetadata"->'inforCsiFinancialPayload' AS csi,
        "connectionMetadata"->'inforM3FinancialPayload' AS m3
      FROM "AccountingConnection"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
      LIMIT 1
    `;
    const metadataPayload = rows[0]?.csi ?? rows[0]?.m3 ?? null;
    const valueByKey = collectValuesFromInforPayload(metadataPayload, targetMonth);

    const mappings = await prisma.accountMapping.findMany({
      where: {
        companyId,
        targetField: { notIn: ['', 'unmapped', 'UNMAPPED'] },
      },
      select: {
        qbAccountId: true,
        qbAccountCode: true,
        qbAccount: true,
        targetField: true,
      },
    });
    const bsAccountKeySet = new Set<string>();
    for (const mapping of mappings) {
      const normalizedTarget = normalizeTargetField(mapping.targetField);
      if (!BS_TARGET_FIELDS.has(normalizedTarget)) continue;
      const id = String(mapping.qbAccountId || '').trim();
      const code = String(mapping.qbAccountCode || '').trim();
      if (id) {
        bsAccountKeySet.add(`id:${id}`);
        bsAccountKeySet.add(`id:${id.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
      }
      if (code) {
        bsAccountKeySet.add(`id:${code}`);
        bsAccountKeySet.add(`id:${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
      }
      const name = String(mapping.qbAccount || '').trim().toLowerCase();
      if (name) bsAccountKeySet.add(`name:${name}`);
    }

    // Income/expense accounts should show month movement, not cumulative balances.
    const monthMovementValues = await collectMonthlyMovementFromGlTransactionFacts(companyId, targetMonth);
    for (const [key, value] of monthMovementValues.entries()) {
      if (bsAccountKeySet.has(key)) continue;
      valueByKey.set(key, value);
    }

    // Balance-sheet account review values must match Data Review source (MonthlyFinancial).
    const monthlyBsValues = await collectBalanceSheetValuesFromMonthlyFinancial(companyId, targetMonth);
    for (const [key, value] of monthlyBsValues.entries()) valueByKey.set(key, value);

    // For BS account-level rows, fill missing values from month-end point-in-time/cumulative facts.
    // This avoids N/A when MonthlyFinancial only contains rollup fields for multi-mapped targets.
    const periodValues = await collectValuesFromPeriodBalanceLogs(companyId, targetMonth);
    for (const [key, value] of periodValues.entries()) {
      if (!bsAccountKeySet.has(key)) continue;
      if (!valueByKey.has(key)) valueByKey.set(key, value);
    }
    const factValues = await collectValuesFromGlTransactionFacts(companyId, targetMonth);
    for (const [key, value] of factValues.entries()) {
      if (!bsAccountKeySet.has(key)) continue;
      if (!valueByKey.has(key)) valueByKey.set(key, value);
    }

    // QBO account review does not have GLTransactionFact-style account movement sources.
    // Fill account rows directly from latest mapped MonthlyFinancial fields.
    if (accountingSystem === 'QUICKBOOKS' || accountingSystem === 'QUICKBOOKS_DESKTOP') {
      const qboMonthlyValues = await collectAllMappedValuesFromMonthlyFinancial(companyId, targetMonth);
      for (const [key, value] of qboMonthlyValues.entries()) {
        valueByKey.set(key, value);
      }
    }

    return NextResponse.json({
      ok: true,
      companyId,
      targetMonth,
      count: valueByKey.size,
      values: Object.fromEntries(valueByKey.entries()),
    });
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
