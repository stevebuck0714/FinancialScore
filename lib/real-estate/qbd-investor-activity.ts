import prisma from '@/lib/prisma';
import { matchMember, type NameMatch } from '@/lib/real-estate/cash-flow-report';

/**
 * Member contributions and distributions read from QuickBooks Desktop
 * General Ledger detail. Member capital accounts follow the
 * `<Equity group>:<Member>[:Contributions|Distributions[:<detail>]]` layout,
 * so the member is the second path segment of an equity account.
 *
 * This is a review source only: it is never written to
 * RealEstateInvestorLedgerEntry, so the capital rollforward and waterfall keep
 * using the imported member ledger until the QuickBooks data is approved.
 */
export type QbdInvestorActivityType = 'CONTRIBUTION' | 'DISTRIBUTION' | 'OTHER';

export type QbdInvestorActivity = {
  memberName: string;
  investorId: string | null;
  matchConfidence: NameMatch['confidence'];
  activityType: QbdInvestorActivityType;
  detail: string;
  accountName: string;
  txnDate: string;
  txnType: string;
  refNo: string;
  payee: string;
  memo: string;
  /** Positive = money in for contributions, money out for distributions. */
  amount: number;
};

export type QbdInvestorActivitySummary = {
  memberName: string;
  investorId: string | null;
  matchConfidence: NameMatch['confidence'];
  contributions: number;
  distributions: number;
  other: number;
  firstDate: string | null;
  lastDate: string | null;
  transactionCount: number;
};

export type QbdInvestorActivityResult = {
  members: QbdInvestorActivitySummary[];
  activity: QbdInvestorActivity[];
  equityGroups: string[];
  latestSyncAt: string | null;
};

type GlRow = {
  account: string;
  txnDate: string;
  txnType: string | null;
  refNo: string | null;
  payee: string | null;
  memo: string | null;
  amount: string | null;
};

function classify(pathAfterMember: string[], signedAmount: number): QbdInvestorActivityType {
  const text = pathAfterMember.join(' ').toLowerCase();
  if (/distribut|\bdraws?\b/.test(text)) return 'DISTRIBUTION';
  if (/contribut|\bcont\b/.test(text)) return 'CONTRIBUTION';
  if (!pathAfterMember.length) return signedAmount < 0 ? 'CONTRIBUTION' : 'OTHER';
  return 'OTHER';
}

async function loadEquityAccountNames(companyId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ fullName: string | null }>>`
    SELECT COALESCE(NULLIF(TRIM(account->>'FullName'), ''), NULLIF(TRIM(account->>'Name'), '')) AS "fullName"
    FROM "QuickBooksDesktopBackfillPage" page
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(page."payload") = 'array' THEN page."payload" ELSE '[]'::jsonb END
    ) AS account
    WHERE page."companyId" = ${companyId}
      AND page."requestName" = 'AccountQuery'
      AND lower(COALESCE(account->>'AccountType', '')) = 'equity'
  `;
  const names = new Set(rows.map((row) => String(row.fullName || '').trim()).filter(Boolean));
  if (names.size) return names;
  const mapped = await prisma.accountMapping.findMany({
    where: { companyId, accountClassification: { contains: 'Equity', mode: 'insensitive' } },
    select: { accountName: true },
  });
  return new Set(mapped.map((row) => row.accountName.trim()).filter(Boolean));
}

async function loadMemberGlRows(companyId: string, groups: string[]): Promise<{ rows: GlRow[]; latestSyncAt: Date | null }> {
  if (!groups.length) return { rows: [], latestSyncAt: null };
  const prefixes = groups.map((group) => `${group.toLowerCase()}:%`);
  const rows = await prisma.$queryRaw<Array<GlRow & { batchId: string; createdAt: Date }>>`
    WITH gl_rows AS (
      SELECT
        COALESCE(NULLIF(TRIM(x->>'accountName'), ''), NULLIF(TRIM(x->>'rowValue'), '')) AS account,
        p."batchId" AS "batchId",
        p."createdAt" AS "createdAt",
        p."pageNumber" AS "pageNumber",
        (x->>'rowIndex')::int AS "rowIndex",
        x->'colData' AS cols
      FROM "QuickBooksDesktopBackfillPage" p
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p."payload") = 'array' THEN p."payload" ELSE '[]'::jsonb END
      ) x
      WHERE p."companyId" = ${companyId}
        AND p."requestName" = 'GeneralDetailReportQuery'
        AND x->>'rowKind' = 'DataRow'
        AND lower(COALESCE(NULLIF(TRIM(x->>'accountName'), ''), NULLIF(TRIM(x->>'rowValue'), ''), '')) LIKE ANY(${prefixes})
    ),
    parsed AS (
      SELECT
        account, "batchId", "createdAt", "pageNumber", "rowIndex",
        (SELECT c->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cols) = 'array' THEN cols ELSE '[]'::jsonb END) c
          WHERE (c->>'colID' = '3' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) IN ('txndate', 'date'))
            AND c->>'value' ~ '^\\d{4}-\\d{2}-\\d{2}' LIMIT 1) AS "txnDate",
        (SELECT c->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cols) = 'array' THEN cols ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '2' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) IN ('type', 'txntype') LIMIT 1) AS "txnType",
        (SELECT c->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cols) = 'array' THEN cols ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '4' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) IN ('num', 'refnumber') LIMIT 1) AS "refNo",
        (SELECT c->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cols) = 'array' THEN cols ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '5' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) = 'name' LIMIT 1) AS payee,
        (SELECT c->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cols) = 'array' THEN cols ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '6' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) = 'memo' LIMIT 1) AS memo,
        (SELECT replace(c->>'value', ',', '') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cols) = 'array' THEN cols ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '8' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) = 'amount' LIMIT 1) AS amount
      FROM gl_rows
    ),
    latest_batch_by_date AS (
      SELECT DISTINCT ON ("txnDate") "txnDate", "batchId"
      FROM (
        SELECT "txnDate", "batchId", MAX("createdAt") AS "lastSeen"
        FROM parsed
        WHERE "txnDate" IS NOT NULL
        GROUP BY "txnDate", "batchId"
      ) batch_dates
      ORDER BY "txnDate", "lastSeen" DESC
    )
    SELECT d.account, d."txnDate", d."txnType", d."refNo", d.payee, d.memo, d.amount, d."batchId", d."createdAt"
    FROM parsed d
    JOIN latest_batch_by_date l
      ON l."txnDate" = d."txnDate"
     AND l."batchId" IS NOT DISTINCT FROM d."batchId"
    ORDER BY d."txnDate", d."pageNumber", d."rowIndex"
  `;
  const latestSyncAt = rows.reduce<Date | null>(
    (latest, row) => (!latest || row.createdAt > latest ? row.createdAt : latest),
    null,
  );
  return { rows, latestSyncAt };
}

export async function loadQbdInvestorActivity(
  companyId: string,
  investors: Array<{ id: string; legalName: string }>,
  aliases: Array<{ alias: string; investorId: string }>,
): Promise<QbdInvestorActivityResult> {
  const equityAccounts = await loadEquityAccountNames(companyId);
  const equityGroups = Array.from(
    new Set(
      Array.from(equityAccounts)
        .map((name) => name.split(':'))
        .filter((parts) => parts.length >= 2)
        .map((parts) => parts[0].trim())
        .filter(Boolean),
    ),
  ).sort();
  const { rows, latestSyncAt } = await loadMemberGlRows(companyId, equityGroups);

  const matchCache = new Map<string, NameMatch>();
  const matchFor = (memberName: string) => {
    if (!matchCache.has(memberName)) matchCache.set(memberName, matchMember(memberName, investors, aliases));
    return matchCache.get(memberName)!;
  };

  const activity: QbdInvestorActivity[] = [];
  for (const row of rows) {
    const parts = row.account.split(':').map((part) => part.trim());
    const memberName = parts[1];
    const signedAmount = Number(row.amount);
    if (!memberName || !Number.isFinite(signedAmount) || Math.abs(signedAmount) < 0.005) continue;
    const pathAfterMember = parts.slice(2);
    const activityType = classify(pathAfterMember, signedAmount);
    const match = matchFor(memberName);
    activity.push({
      memberName,
      investorId: match.investorId,
      matchConfidence: match.confidence,
      activityType,
      detail: pathAfterMember[pathAfterMember.length - 1] || 'Member capital account',
      accountName: row.account,
      txnDate: row.txnDate,
      txnType: row.txnType || '',
      refNo: row.refNo || '',
      payee: row.payee || '',
      memo: row.memo || '',
      // QuickBooks GL amounts are debit-positive: contributions post as credits, distributions as debits.
      amount: activityType === 'CONTRIBUTION' ? -signedAmount : signedAmount,
    });
  }

  const byMember = new Map<string, QbdInvestorActivitySummary>();
  for (const entry of activity) {
    const summary = byMember.get(entry.memberName) || {
      memberName: entry.memberName,
      investorId: entry.investorId,
      matchConfidence: entry.matchConfidence,
      contributions: 0,
      distributions: 0,
      other: 0,
      firstDate: null,
      lastDate: null,
      transactionCount: 0,
    };
    if (entry.activityType === 'CONTRIBUTION') summary.contributions += entry.amount;
    else if (entry.activityType === 'DISTRIBUTION') summary.distributions += entry.amount;
    else summary.other += entry.amount;
    summary.firstDate = !summary.firstDate || entry.txnDate < summary.firstDate ? entry.txnDate : summary.firstDate;
    summary.lastDate = !summary.lastDate || entry.txnDate > summary.lastDate ? entry.txnDate : summary.lastDate;
    summary.transactionCount += 1;
    byMember.set(entry.memberName, summary);
  }

  return {
    members: Array.from(byMember.values()).sort((a, b) => a.memberName.localeCompare(b.memberName)),
    activity,
    equityGroups,
    latestSyncAt: latestSyncAt ? latestSyncAt.toISOString() : null,
  };
}
