import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

const EQUITY_TARGETS = new Set([
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
]);

const CAP_TABLE_HOLDER_TARGETS = new Set(['ownersCapital', 'commonStock', 'preferredStock']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function number(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dateKey(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function reportColValue(record: Record<string, unknown>, colID: string): string {
  const colData = Array.isArray(record.colData) ? record.colData.map(asRecord) : [];
  const column = colData.find((col) => text(col.colID) === colID);
  return text(column?.value);
}

function reportAmount(record: Record<string, unknown>): number {
  const colData = Array.isArray(record.colData) ? record.colData.map(asRecord) : [];
  const byId = (colID: string) => number(colData.find((col) => text(col.colID) === colID)?.value);
  const balance = byId('2');
  if (Math.abs(balance) >= 0.005) return balance;
  const credit = byId('3');
  if (Math.abs(credit) >= 0.005) return credit;
  return number(colData[colData.length - 1]?.value);
}

function accountPath(fullName: string): string[] {
  return fullName.split(':').map((part) => part.trim()).filter(Boolean);
}

/**
 * Member capital accounts are `<Equity group>:<Member>[:Contributions|Distributions[:<detail>]]`,
 * so the holder is the member segment, not the leaf ("Member Contributions").
 */
function holderName(fullName: string): string {
  const parts = accountPath(fullName);
  const memberSegment = parts.length >= 2 ? parts[1] : parts[0] || fullName;
  return memberSegment
    .replace(/^Capital\s*-\s*/i, '')
    .replace(/^Capital Draws\s*-\s*/i, '')
    .trim() || fullName;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function holderKey(fullName: string): string {
  return normalizedKey(holderName(fullName));
}

function isDrawAccount(accountName: string): boolean {
  const parts = accountPath(accountName);
  if (/^capital draws\s*-/i.test(parts[parts.length - 1] || accountName.trim())) return true;
  return parts.slice(2).some((part) => /distribut|\bdraws?\b/i.test(part));
}

type CapTableHolding = {
  holder: string;
  accountName: string;
  accountCode: string | null;
  security: string;
  targetField: string;
  balance: number;
  issuedDate: string | null;
  activity: EquityActivity[];
};

/** Combines a member's sub-accounts (e.g. Contributions and Member Contributions) into one holding per security. */
function mergeHoldingsByHolder(holdings: CapTableHolding[]): CapTableHolding[] {
  const merged = new Map<string, CapTableHolding & { accountCount: number }>();
  for (const holding of holdings) {
    const key = `${holderKey(holding.accountName)}|${holding.targetField}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...holding, activity: [...holding.activity], accountCount: 1 });
      continue;
    }
    const parts = accountPath(holding.accountName);
    current.balance += holding.balance;
    current.activity.push(...holding.activity);
    current.accountCount += 1;
    current.accountName = parts.length >= 2 ? parts.slice(0, 2).join(':') : current.accountName;
    current.accountCode = current.accountCode || holding.accountCode;
    if (holding.issuedDate && (!current.issuedDate || holding.issuedDate < current.issuedDate)) {
      current.issuedDate = holding.issuedDate;
    }
  }
  return Array.from(merged.values()).map(({ accountCount, ...holding }) => ({
    ...holding,
    activity: accountCount > 1 ? holding.activity.sort((a, b) => a.txnDate.localeCompare(b.txnDate)) : holding.activity,
  }));
}

function isMappedCapTableHolder(mapped: { targetField: string; accountName: string }): boolean {
  if (!CAP_TABLE_HOLDER_TARGETS.has(mapped.targetField)) return false;
  if (isDrawAccount(mapped.accountName)) return false;
  const accountName = normalizedKey(mapped.accountName);
  const holder = holderKey(mapped.accountName);
  if (!accountName || !holder) return false;
  if (accountName === 'opening balance equity') return false;
  if (accountName === 'partner capital accounts') return false;
  if (accountName === 'retained earnings') return false;
  if (accountName.includes('current year net income')) return false;
  if (holder === 'total equity' || holder === 'total capital') return false;
  return true;
}

function securityLabel(targetField: string): string {
  if (targetField === 'preferredStock') return 'Preferred / Investor Capital';
  if (targetField === 'commonStock') return 'Common / Partner Capital';
  if (targetField === 'ownersCapital') return "Owner's Capital";
  if (targetField === 'ownersDraw') return "Owner's Draw";
  if (targetField === 'additionalPaidInCapital') return 'Additional Paid-In Capital';
  if (targetField === 'retainedEarnings') return 'Retained Earnings';
  if (targetField === 'treasuryStock') return 'Treasury Stock';
  return targetField;
}

type EquityActivity = {
  txnDate: string;
  txnType: string;
  refNo: string;
  name: string;
  splitAccount: string;
  amount: number;
  balance: number;
};

type CapTableInputs = {
  holderSharePrice: string;
  sharesIssuedByHolding: Record<string, string>;
};

const CAP_TABLE_INPUTS_NAMESPACE = 'cap-table-inputs';

function capTableInputsCacheKey(companyId: string): string {
  return `company:${companyId}`;
}

function normalizeCapTableInputs(value: unknown): CapTableInputs {
  const record = asRecord(value);
  const sharesRaw = asRecord(record.sharesIssuedByHolding);
  const sharesIssuedByHolding: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(sharesRaw)) {
    const normalizedKeyValue = text(key);
    const normalizedValue = text(rawValue);
    if (normalizedKeyValue && normalizedValue) sharesIssuedByHolding[normalizedKeyValue] = normalizedValue;
  }
  return {
    holderSharePrice: text(record.holderSharePrice),
    sharesIssuedByHolding,
  };
}

async function loadCapTableInputs(companyId: string): Promise<CapTableInputs> {
  const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
    SELECT "payload"
    FROM "DerivedApiCache"
    WHERE "namespace" = ${CAP_TABLE_INPUTS_NAMESPACE}
      AND "cacheKey" = ${capTableInputsCacheKey(companyId)}
    LIMIT 1
  `;
  return normalizeCapTableInputs(rows[0]?.payload);
}

async function saveCapTableInputs(companyId: string, inputs: CapTableInputs) {
  const now = new Date();
  const payloadJson = JSON.stringify(inputs);
  await prisma.$executeRaw`
    INSERT INTO "DerivedApiCache" (
      "id",
      "namespace",
      "cacheKey",
      "dataVersion",
      "payload",
      "createdAt",
      "updatedAt",
      "expiresAt"
    )
    VALUES (
      ${`${CAP_TABLE_INPUTS_NAMESPACE}:${companyId}`},
      ${CAP_TABLE_INPUTS_NAMESPACE},
      ${capTableInputsCacheKey(companyId)},
      'v1',
      CAST(${payloadJson} AS jsonb),
      ${now},
      ${now},
      ${new Date('2099-12-31T23:59:59.999Z')}
    )
    ON CONFLICT ("namespace", "cacheKey") DO UPDATE SET
      "payload" = EXCLUDED."payload",
      "dataVersion" = EXCLUDED."dataVersion",
      "updatedAt" = EXCLUDED."updatedAt",
      "expiresAt" = EXCLUDED."expiresAt";
  `;
}

async function loadEquityActivityByAccount(companyId: string, equityAccountNames: string[]) {
  const byAccount = new Map<string, EquityActivity[]>();
  if (equityAccountNames.length === 0) return byAccount;
  const rows = await prisma.$queryRaw<Array<{ record: unknown }>>`
    SELECT row_record AS "record"
    FROM "QuickBooksDesktopBackfillPage" page
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(page."payload") = 'array' THEN page."payload" ELSE '[]'::jsonb END
    ) AS row_record
    WHERE page."companyId" = ${companyId}
      AND page."requestName" = 'GeneralDetailReportQuery'
      AND row_record->>'rowKind' = 'DataRow'
      AND lower(btrim(COALESCE(NULLIF(row_record->>'accountName', ''), row_record->>'rowValue', ''))) = ANY(${equityAccountNames})
    ORDER BY page."createdAt" ASC, page."pageNumber" ASC
  `;
  for (const row of rows) {
    const record = asRecord(row.record);
    const accountName = text(record.accountName || record.rowValue);
    const txnDate = dateKey(reportColValue(record, '3'));
    const amount = number(reportColValue(record, '8'));
    if (!accountName || !txnDate || Math.abs(amount) < 0.005) continue;
    const key = accountName.toLowerCase();
    const activity = byAccount.get(key) || [];
    activity.push({
      txnDate,
      txnType: reportColValue(record, '2'),
      refNo: reportColValue(record, '4'),
      name: reportColValue(record, '5'),
      splitAccount: reportColValue(record, '7'),
      amount,
      balance: number(reportColValue(record, '9')),
    });
    byAccount.set(key, activity);
  }
  for (const [key, activity] of byAccount.entries()) {
    activity.sort((a, b) => a.txnDate.localeCompare(b.txnDate));
    byAccount.set(key, activity);
  }
  return byAccount;
}

export async function GET(request: NextRequest) {
  await requireAuth();
  const companyId = request.nextUrl.searchParams.get('companyId') || '';
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('CapTable', companyId, 'READ');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    return await buildCapTableResponse(companyId);
  } catch (error) {
    console.error('Cap table load failed', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Unable to load cap table data. The failure has been logged.' }, { status: 500 });
  }
}

async function loadLatestBackfillPages(companyId: string, requestName: string) {
  return prisma.$queryRaw<Array<{ payload: unknown; createdAt: Date }>>`
    SELECT "payload", "createdAt"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${companyId}
      AND "requestName" = ${requestName}
      AND "batchId" = (
        SELECT "batchId"
        FROM "QuickBooksDesktopBackfillPage"
        WHERE "companyId" = ${companyId}
          AND "requestName" = ${requestName}
        ORDER BY "createdAt" DESC
        LIMIT 1
      )
    ORDER BY "createdAt" DESC, "pageNumber" ASC
  `;
}

async function buildCapTableResponse(companyId: string) {
  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      OR: [
        { targetField: { in: Array.from(EQUITY_TARGETS) } },
        { accountClassification: { contains: 'Equity', mode: 'insensitive' } },
      ],
    },
    select: {
      accountId: true,
      accountName: true,
      accountCode: true,
      accountClassification: true,
      targetField: true,
    },
  });
  const equityAccountNames = Array.from(
    new Set(
      mappings
        .filter((mapping) => EQUITY_TARGETS.has(text(mapping.targetField)))
        .flatMap((mapping) => {
          const accountName = text(mapping.accountName);
          return [accountName, accountName.split(':').pop() || ''];
        })
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const [pages, balanceSheetPages, trialBalancePages, equityActivityByAccount, savedInputs] = await Promise.all([
    loadLatestBackfillPages(companyId, 'AccountQuery'),
    loadLatestBackfillPages(companyId, 'BalanceSheetStandardReportQuery'),
    loadLatestBackfillPages(companyId, 'TrialBalanceReportQuery'),
    loadEquityActivityByAccount(companyId, equityAccountNames),
    loadCapTableInputs(companyId),
  ]);

  const targetByKey = new Map<string, { targetField: string; accountName: string; accountCode: string | null }>();
  const targetByHolderKey = new Map<string, { targetField: string; accountName: string; accountCode: string | null }>();
  for (const mapping of mappings) {
    const targetField = text(mapping.targetField);
    if (!EQUITY_TARGETS.has(targetField)) continue;
    const value = {
      targetField,
      accountName: text(mapping.accountName),
      accountCode: mapping.accountCode ? text(mapping.accountCode) : null,
    };
    for (const key of [mapping.accountId, mapping.accountName, mapping.accountCode].map(text).filter(Boolean)) {
      targetByKey.set(key.toLowerCase(), value);
    }
    if (value.accountName) {
      const key = holderKey(value.accountName);
      const existing = targetByHolderKey.get(key);
      const rank = (candidate: typeof value) =>
        (CAP_TABLE_HOLDER_TARGETS.has(candidate.targetField) ? 0 : 2) + (isDrawAccount(candidate.accountName) ? 1 : 0);
      if (
        !existing ||
        rank(value) < rank(existing) ||
        (rank(value) === rank(existing) && value.accountName.length < existing.accountName.length)
      ) {
        targetByHolderKey.set(key, value);
      }
    }
  }
  const mappedEquityNames = Array.from(targetByKey.values()).map((value) => value.accountName.toLowerCase());
  const isEquityGroupHeader = (accountName: string) => {
    const name = accountName.toLowerCase();
    return accountPath(accountName).length === 1 && mappedEquityNames.some((candidate) => candidate.startsWith(`${name}:`));
  };

  const accounts = pages.flatMap((page) =>
    Array.isArray(page.payload) ? page.payload.map(asRecord) : []
  );
  const fullNames = accounts.map((account) => text(account.FullName || account.Name)).filter(Boolean);
  const holdings: CapTableHolding[] = accounts
    .map((account): CapTableHolding | null => {
      const fullName = text(account.FullName || account.Name);
      const mapped =
        targetByKey.get(text(account.ListID).toLowerCase()) ||
        targetByKey.get(fullName.toLowerCase()) ||
        targetByKey.get(text(account.Name).toLowerCase()) ||
        targetByKey.get(text(account.AccountNumber).toLowerCase());
      if (!mapped) return null;
      const hasChildren = fullName
        ? fullNames.some((candidate) => candidate !== fullName && candidate.startsWith(`${fullName}:`))
        : false;
      const balance = number(account.Balance) || (hasChildren ? 0 : number(account.TotalBalance));
      if (Math.abs(balance) < 0.005) return null;
      return {
        holder: holderName(fullName || mapped.accountName),
        accountName: fullName || mapped.accountName,
        accountCode: mapped.accountCode,
        security: securityLabel(mapped.targetField),
        targetField: mapped.targetField,
        balance,
        issuedDate: equityActivityByAccount.get((fullName || mapped.accountName).toLowerCase())?.[0]?.txnDate || null,
        activity: equityActivityByAccount.get((fullName || mapped.accountName).toLowerCase()) || [],
      };
    })
    .filter((row): row is CapTableHolding => row !== null);
  let source = 'quickbooks-desktop-account-equity';
  let reportFallbackCreatedAt: Date | null = null;
  const seenAccounts = new Set<string>();
  const rememberHolding = (accountName: string, holder: string) => {
    for (const key of [accountName, holder, holderName(accountName)].map(text).filter(Boolean)) {
      seenAccounts.add(normalizedKey(key));
      seenAccounts.add(holderKey(key));
    }
  };
  for (const holding of holdings) {
    rememberHolding(holding.accountName, holding.holder);
  }
  for (const pageSet of [balanceSheetPages, trialBalancePages]) {
    for (const page of pageSet) {
      const rows = Array.isArray(page.payload) ? page.payload.map(asRecord) : [];
      for (const row of rows) {
        if (text(row.rowKind) !== 'DataRow') continue;
        const accountName = text(row.accountName || row.rowValue || reportColValue(row, '1'));
        const mapped =
          targetByKey.get(accountName.toLowerCase()) ||
          targetByKey.get(text(row.rowValue).toLowerCase()) ||
          targetByKey.get(reportColValue(row, '1').toLowerCase()) ||
          targetByHolderKey.get(holderKey(accountName)) ||
          targetByHolderKey.get(holderKey(text(row.rowValue))) ||
          targetByHolderKey.get(holderKey(reportColValue(row, '1')));
        if (!mapped) continue;
        const resolvedAccountName = accountName || mapped.accountName;
        if (isDrawAccount(resolvedAccountName) || isDrawAccount(mapped.accountName)) continue;
        const duplicateKeys = [
          mapped.accountName,
          resolvedAccountName,
          holderName(resolvedAccountName),
          holderName(mapped.accountName),
        ].map(text).filter(Boolean);
        if (duplicateKeys.some((key) => seenAccounts.has(normalizedKey(key)) || seenAccounts.has(holderKey(key)))) continue;
        const balance = reportAmount(row);
        if (Math.abs(balance) < 0.005) continue;
        const activity = equityActivityByAccount.get(resolvedAccountName.toLowerCase()) || [];
        holdings.push({
          holder: holderName(resolvedAccountName || mapped.accountName),
          accountName: resolvedAccountName || mapped.accountName,
          accountCode: mapped.accountCode,
          security: securityLabel(mapped.targetField),
          targetField: mapped.targetField,
          balance,
          issuedDate: activity[0]?.txnDate || null,
          activity,
        });
        rememberHolding(resolvedAccountName || mapped.accountName, holderName(resolvedAccountName || mapped.accountName));
        reportFallbackCreatedAt = reportFallbackCreatedAt || page.createdAt;
      }
    }
  }
  for (const mapped of targetByHolderKey.values()) {
    if (!isMappedCapTableHolder(mapped) || isEquityGroupHeader(mapped.accountName)) continue;
    const duplicateKeys = [
      mapped.accountName,
      holderName(mapped.accountName),
    ].map(text).filter(Boolean);
    if (duplicateKeys.some((key) => seenAccounts.has(normalizedKey(key)) || seenAccounts.has(holderKey(key)))) continue;
    const activity = equityActivityByAccount.get(mapped.accountName.toLowerCase()) || [];
    holdings.push({
      holder: holderName(mapped.accountName),
      accountName: mapped.accountName,
      accountCode: mapped.accountCode,
      security: securityLabel(mapped.targetField),
      targetField: mapped.targetField,
      balance: 0,
      issuedDate: activity[0]?.txnDate || null,
      activity,
    });
    rememberHolding(mapped.accountName, holderName(mapped.accountName));
  }
  if (reportFallbackCreatedAt) {
    source = pages.length > 0 ? 'quickbooks-desktop-account-and-report-equity' : 'quickbooks-desktop-report-equity';
  }

  const mergedHoldings = mergeHoldingsByHolder(holdings);
  const ownershipDenominator = mergedHoldings.reduce(
    (sum, row) => sum + (CAP_TABLE_HOLDER_TARGETS.has(row.targetField) && row.balance > 0 ? row.balance : 0),
    0,
  );
  const enrichedHoldings = mergedHoldings
    .map((row) => ({
      ...row,
      ownershipPct:
        CAP_TABLE_HOLDER_TARGETS.has(row.targetField) && row.balance > 0 && ownershipDenominator > 0
          ? (row.balance / ownershipDenominator) * 100
          : null,
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  type SecuritySummary = { security: string; balance: number; holders: number; ownershipPct: number };
  const securitySummary = Array.from(
    enrichedHoldings.reduce<Map<string, SecuritySummary>>((map, row) => {
      const current = map.get(row.security) || { security: row.security, balance: 0, holders: 0, ownershipPct: 0 };
      current.balance += row.balance;
      current.holders += 1;
      current.ownershipPct += Number(row.ownershipPct || 0);
      map.set(row.security, current);
      return map;
    }, new Map<string, { security: string; balance: number; holders: number; ownershipPct: number }>())
      .values(),
  ).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const asOfDate =
    (source === 'quickbooks-desktop-report-equity' || source === 'quickbooks-desktop-account-and-report-equity'
      ? reportFallbackCreatedAt?.toISOString?.()
      : pages[0]?.createdAt?.toISOString?.()) || new Date().toISOString();

  return NextResponse.json({
    success: true,
    source,
    asOfDate,
    holdings: enrichedHoldings,
    savedInputs,
    securitySummary,
    summary: {
      capitalBalance: ownershipDenominator,
      holderCount: enrichedHoldings.length,
      securityClassCount: securitySummary.length,
    },
  });
}

export async function POST(request: NextRequest) {
  await requireAuth();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = text(body.companyId);
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('CapTable', companyId, 'UPDATE');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const inputs = normalizeCapTableInputs(body);
  await saveCapTableInputs(companyId, inputs);
  return NextResponse.json({ success: true, savedInputs: inputs });
}
