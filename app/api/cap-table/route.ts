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

const OWNERSHIP_TARGETS = new Set(['ownersCapital', 'commonStock', 'preferredStock', 'additionalPaidInCapital']);

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

function holderName(fullName: string): string {
  const leaf = fullName.split(':').pop() || fullName;
  return leaf
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

function isMappedOwnershipHolder(mapped: { targetField: string; accountName: string }): boolean {
  if (!OWNERSHIP_TARGETS.has(mapped.targetField)) return false;
  const name = normalizedKey(mapped.accountName);
  const holder = holderKey(mapped.accountName);
  if (!name || !holder) return false;
  if (name === 'opening balance equity') return false;
  if (name === 'partner capital accounts') return false;
  if (name === 'retained earnings') return false;
  if (name.includes('current year net income')) return false;
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

async function loadEquityActivityByAccount(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
    SELECT "payload"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${companyId}
      AND "requestName" = 'GeneralDetailReportQuery'
    ORDER BY "createdAt" ASC, "pageNumber" ASC
  `;
  const byAccount = new Map<string, EquityActivity[]>();
  for (const page of rows) {
    const records = Array.isArray(page.payload) ? page.payload.map(asRecord) : [];
    for (const record of records) {
      if (text(record.rowKind) !== 'DataRow') continue;
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

  const [mappings, pages, balanceSheetPages, trialBalancePages, equityActivityByAccount, savedInputs] = await Promise.all([
    prisma.accountMapping.findMany({
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
    }),
    prisma.$queryRaw<Array<{ payload: unknown; createdAt: Date }>>`
      SELECT "payload", "createdAt"
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
        AND "requestName" = 'AccountQuery'
      ORDER BY "createdAt" DESC, "pageNumber" ASC
    `,
    prisma.$queryRaw<Array<{ payload: unknown; createdAt: Date }>>`
      SELECT "payload", "createdAt"
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
        AND "requestName" = 'BalanceSheetStandardReportQuery'
      ORDER BY "createdAt" DESC, "pageNumber" ASC
    `,
    prisma.$queryRaw<Array<{ payload: unknown; createdAt: Date }>>`
      SELECT "payload", "createdAt"
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
        AND "requestName" = 'TrialBalanceReportQuery'
      ORDER BY "createdAt" DESC, "pageNumber" ASC
    `,
    loadEquityActivityByAccount(companyId),
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
    if (value.accountName) targetByHolderKey.set(holderKey(value.accountName), value);
  }

  const accounts = pages.flatMap((page) =>
    Array.isArray(page.payload) ? page.payload.map(asRecord) : []
  );
  const fullNames = accounts.map((account) => text(account.FullName || account.Name)).filter(Boolean);
  const holdings = accounts
    .map((account) => {
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
    .filter((row): row is NonNullable<typeof row> => row !== null);
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
    if (!isMappedOwnershipHolder(mapped)) continue;
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

  const ownershipDenominator = holdings.reduce(
    (sum, row) => sum + (OWNERSHIP_TARGETS.has(row.targetField) && row.balance > 0 ? row.balance : 0),
    0,
  );
  const enrichedHoldings = holdings
    .map((row) => ({
      ...row,
      ownershipPct:
        OWNERSHIP_TARGETS.has(row.targetField) && row.balance > 0 && ownershipDenominator > 0
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
