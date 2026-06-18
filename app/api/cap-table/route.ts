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

function holderName(fullName: string): string {
  const leaf = fullName.split(':').pop() || fullName;
  return leaf
    .replace(/^Capital\s*-\s*/i, '')
    .replace(/^Capital Draws\s*-\s*/i, '')
    .trim() || fullName;
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

  const [mappings, pages] = await Promise.all([
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
  ]);

  const targetByKey = new Map<string, { targetField: string; accountName: string; accountCode: string | null }>();
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
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const ownershipEligibleTargets = new Set(['ownersCapital', 'commonStock', 'preferredStock', 'additionalPaidInCapital']);
  const ownershipDenominator = holdings.reduce(
    (sum, row) => sum + (ownershipEligibleTargets.has(row.targetField) && row.balance > 0 ? row.balance : 0),
    0,
  );
  const enrichedHoldings = holdings
    .map((row) => ({
      ...row,
      ownershipPct:
        ownershipEligibleTargets.has(row.targetField) && row.balance > 0 && ownershipDenominator > 0
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

  const asOfDate = pages[0]?.createdAt?.toISOString?.() || new Date().toISOString();

  return NextResponse.json({
    success: true,
    source: 'quickbooks-desktop-account-equity',
    asOfDate,
    holdings: enrichedHoldings,
    securitySummary,
    summary: {
      capitalBalance: ownershipDenominator,
      holderCount: enrichedHoldings.length,
      securityClassCount: securitySummary.length,
    },
  });
}
