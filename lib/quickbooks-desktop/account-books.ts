import prisma from '@/lib/prisma';
import type { QbdBalanceSheetRow, QbdGlRow } from '@/lib/real-estate/qbd-account-lines';

/** Read-only loaders for QuickBooks Desktop account-level books from saved backfill pages. */

export async function loadQbdAccountRows(companyId: string) {
  return prisma.$queryRaw<Array<{ listId: string | null; fullName: string | null; accountType: string | null; accountNumber: string | null }>>`
    SELECT DISTINCT
      NULLIF(TRIM(a->>'ListID'), '') AS "listId",
      COALESCE(NULLIF(TRIM(a->>'FullName'), ''), NULLIF(TRIM(a->>'Name'), '')) AS "fullName",
      a->>'AccountType' AS "accountType",
      NULLIF(TRIM(a->>'AccountNumber'), '') AS "accountNumber"
    FROM "QuickBooksDesktopBackfillPage" p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p."payload") = 'array' THEN p."payload" ELSE '[]'::jsonb END) a
    WHERE p."companyId" = ${companyId} AND p."requestName" = 'AccountQuery'
  `;
}

export async function loadQbdBalanceSheetRows(companyId: string): Promise<QbdBalanceSheetRow[]> {
  const rows = await prisma.$queryRaw<Array<{ batchId: string | null; createdAt: Date; subtitle: string | null; account: string | null; rowType: string | null; amount: string | null }>>`
    SELECT DISTINCT
      p."batchId" AS "batchId",
      p."createdAt" AS "createdAt",
      x->>'reportSubtitle' AS subtitle,
      COALESCE(NULLIF(TRIM(x->>'accountName'), ''), NULLIF(TRIM(x->>'rowValue'), '')) AS account,
      x->>'rowType' AS "rowType",
      (SELECT replace(c->>'value', ',', '') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x->'colData') = 'array' THEN x->'colData' ELSE '[]'::jsonb END) c
        WHERE c->>'colID' = '2' LIMIT 1) AS amount
    FROM "QuickBooksDesktopBackfillPage" p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p."payload") = 'array' THEN p."payload" ELSE '[]'::jsonb END) x
    WHERE p."companyId" = ${companyId}
      AND p."requestName" = 'BalanceSheetStandardReportQuery'
      AND x->>'rowKind' = 'DataRow'
  `;
  return rows.flatMap((row) => {
    const match = /^As of\s+(.+)$/i.exec(String(row.subtitle || ''));
    if (!match || !row.account) return [];
    if (row.rowType && row.rowType.toLowerCase() !== 'account') return [];
    const parsed = new Date(`${match[1]} UTC`);
    const amount = Number(row.amount);
    if (Number.isNaN(parsed.getTime()) || !Number.isFinite(amount)) return [];
    return [{ asOf: parsed.toISOString().slice(0, 10), batchId: row.batchId, createdAt: row.createdAt, account: row.account, amount }];
  });
}

export async function loadQbdGeneralLedgerRows(companyId: string): Promise<QbdGlRow[]> {
  // Later backfill batches replace earlier ones for the dates they cover.
  const rows = await prisma.$queryRaw<Array<{ account: string; txnDate: string; amount: string | null }>>`
    WITH parsed AS (
      SELECT
        COALESCE(NULLIF(TRIM(x->>'accountName'), ''), NULLIF(TRIM(x->>'rowValue'), '')) AS account,
        p."batchId" AS "batchId",
        p."createdAt" AS "createdAt",
        (SELECT c->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x->'colData') = 'array' THEN x->'colData' ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '3' AND c->>'value' ~ '^\\d{4}-\\d{2}-\\d{2}' LIMIT 1) AS "txnDate",
        (SELECT replace(c->>'value', ',', '') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x->'colData') = 'array' THEN x->'colData' ELSE '[]'::jsonb END) c
          WHERE c->>'colID' = '8' LIMIT 1) AS amount
      FROM "QuickBooksDesktopBackfillPage" p
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p."payload") = 'array' THEN p."payload" ELSE '[]'::jsonb END) x
      WHERE p."companyId" = ${companyId}
        AND p."requestName" = 'GeneralDetailReportQuery'
        AND x->>'rowKind' = 'DataRow'
    ),
    latest_batch_by_date AS (
      SELECT DISTINCT ON ("txnDate") "txnDate", "batchId"
      FROM (SELECT "txnDate", "batchId", MAX("createdAt") AS "lastSeen" FROM parsed WHERE "txnDate" IS NOT NULL GROUP BY "txnDate", "batchId") b
      ORDER BY "txnDate", "lastSeen" DESC
    )
    SELECT d.account, d."txnDate", d.amount
    FROM parsed d
    JOIN latest_batch_by_date l ON l."txnDate" = d."txnDate" AND l."batchId" IS NOT DISTINCT FROM d."batchId"
    WHERE d.account IS NOT NULL
  `;
  return rows
    .map((row) => ({ account: row.account, txnDate: String(row.txnDate).slice(0, 10), amount: Number(row.amount) }))
    .filter((row) => Number.isFinite(row.amount) && Math.abs(row.amount) >= 0.005);
}
