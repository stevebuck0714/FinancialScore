import { Prisma } from '@prisma/client';

export const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

/**
 * Before 2026, CSI's SLLedgers pull for Atlantic is missing whole journal
 * entries (inventory receipts, AR invoices, AP vouchers, year-end closes)
 * that only SLGLTRANS carries. Through 2025 those SLGLTRANS rows are added
 * back; from 2026 on SLGLTRANS duplicates SLLedgers and is ignored.
 * Validated against the 2025-12-31 trial balance (AP, cash, other CL tie)
 * and the 2024/2025 income summary closes (net income within ~$1.5K).
 */
const ATLANTIC_SLGLTRANS_SUPPLEMENT_BEFORE = new Date('2026-01-01T00:00:00.000Z');

export function isAtlanticPrecisionGlCompany(companyId: string): boolean {
  return companyId === ATLANTIC_PRECISION_COMPANY_ID;
}

/**
 * Derived table of Atlantic GL lines (`accountId`, `transDate`,
 * `signedAmount`, `ref`) restricted to `accountIds` and `dateFilter`.
 * `dateFilter` must reference the unqualified `"transDate"` column.
 *
 * An SLGLTRANS line is kept only when it outnumbers SLLedgers lines with the
 * same account, day, and amount, so lines already in SLLedgers are not
 * counted twice. All Atlantic GL transDates are stored at UTC midnight.
 */
export function atlanticGlRowsSql(
  companyId: string,
  accountIds: string[],
  dateFilter: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`(
    SELECT "accountId", "transDate", "signedAmount", "ref"
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "accountId" = ANY(${accountIds}::text[])
      AND "sourceProgram" = 'SLLedgers'
      AND "sourceTransaction" = 'RAW_REPLAY'
      AND ${dateFilter}
    UNION ALL
    SELECT g."accountId", g."transDate", g."signedAmount", g."ref"
    FROM (
      SELECT "accountId", "transDate", "signedAmount", "ref",
        ROW_NUMBER() OVER (
          PARTITION BY "accountId", "transDate", ROUND("signedAmount"::numeric, 2)
          ORDER BY "transNum", "id"
        ) AS rn
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "accountId" = ANY(${accountIds}::text[])
        AND "sourceProgram" = 'SLGLTRANS'
        AND "sourceTransaction" = 'RAW_REPLAY'
        AND "transDate" < ${ATLANTIC_SLGLTRANS_SUPPLEMENT_BEFORE}
        AND ${dateFilter}
    ) g
    WHERE g.rn > (
      SELECT COUNT(*)
      FROM "GLTransactionFact" l
      WHERE l."companyId" = ${companyId}
        AND l."accountId" = g."accountId"
        AND l."sourceProgram" = 'SLLedgers'
        AND l."sourceTransaction" = 'RAW_REPLAY'
        AND l."transDate" = g."transDate"
        AND ROUND(l."signedAmount"::numeric, 2) = ROUND(g."signedAmount"::numeric, 2)
    )
  )`;
}
