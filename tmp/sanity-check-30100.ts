/**
 * Sanity check on account 30100:
 *   1. Sum signedAmount BEFORE anchor (should ~= -anchor balance if convention is right)
 *   2. Verify signedAmount matches debit-credit math
 *   3. Show min/max transDate
 *   4. Look at the period sums by year
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const ACCOUNT_ID = '30100';
const ANCHOR_BALANCE = 697_929.58;

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    console.log(`\n=== 1. transDate range on 30100 ===`);
    const range = await p.$queryRawUnsafe<Array<any>>(
      `SELECT MIN("transDate") AS min_date, MAX("transDate") AS max_date, COUNT(*)::bigint AS n
       FROM "GLTransactionFact" WHERE "companyId" = $1 AND "accountId" = $2`,
      COMPANY_ID,
      ACCOUNT_ID
    );
    console.log(JSON.stringify(range[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

    console.log(`\n=== 2. Sum signedAmount per YEAR (DEDUP'd) ===`);
    const years = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH dedup AS (
        SELECT "transDate", "signedAmount", "debitAmount", "creditAmount",
               ROW_NUMBER() OVER (PARTITION BY "companyId", "transDate", "accountId", "transNum"
                 ORDER BY CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
                          CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
                          "createdAt" ASC) AS rn
        FROM "GLTransactionFact" WHERE "companyId" = $1 AND "accountId" = $2
      )
      SELECT EXTRACT(YEAR FROM "transDate")::int AS yr,
             COUNT(*)::bigint AS n,
             SUM("signedAmount")::float8 AS sum_signed,
             SUM(COALESCE("debitAmount", 0))::float8 AS sum_debit,
             SUM(COALESCE("creditAmount", 0))::float8 AS sum_credit
      FROM dedup WHERE rn = 1
      GROUP BY yr ORDER BY yr
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    let runningSum = 0;
    for (const y of years) {
      runningSum += Number(y.sum_signed);
      const n = Number(y.n);
      const sumS = Number(y.sum_signed);
      const sumD = Number(y.sum_debit);
      const sumC = Number(y.sum_credit);
      console.log(
        `  yr=${y.yr}  rows=${String(n).padStart(5)}  sum_signed=${sumS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(18)}  sum_dr=${sumD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(18)}  sum_cr=${sumC.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(18)}  dr-cr=${(sumD - sumC).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(18)}  running=${runningSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(18)}`
      );
    }

    console.log(`\n=== 3. Sum signedAmount BEFORE anchor (2023-12-31) — DEDUP'd ===`);
    const preAnchor = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH dedup AS (
        SELECT "transDate", "signedAmount",
               ROW_NUMBER() OVER (PARTITION BY "companyId", "transDate", "accountId", "transNum"
                 ORDER BY CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
                          CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
                          "createdAt" ASC) AS rn
        FROM "GLTransactionFact" WHERE "companyId" = $1 AND "accountId" = $2
      )
      SELECT COALESCE(SUM("signedAmount"), 0)::float8 AS s,
             COUNT(*)::bigint AS n
      FROM dedup
      WHERE rn = 1 AND "transDate" <= '2023-12-31T23:59:59Z'::timestamptz
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    const preSum = Number(preAnchor[0].s);
    console.log(`  rows=${Number(preAnchor[0].n)}  sum_signed=${preSum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Implied "starting balance before all GL data": anchor (697,929.58) - (-pre_sum) = ${(ANCHOR_BALANCE + preSum).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Note: if data is complete from beginning of time, this should be ~0.`);

    console.log(`\n=== 4. Sum signedAmount per MONTH from 2025-12 onward (DEDUP'd) ===`);
    const months = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH dedup AS (
        SELECT "transDate", "signedAmount",
               ROW_NUMBER() OVER (PARTITION BY "companyId", "transDate", "accountId", "transNum"
                 ORDER BY CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
                          CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
                          "createdAt" ASC) AS rn
        FROM "GLTransactionFact" WHERE "companyId" = $1 AND "accountId" = $2
      )
      SELECT EXTRACT(YEAR FROM "transDate")::int AS yr,
             EXTRACT(MONTH FROM "transDate")::int AS mo,
             COUNT(*)::bigint AS n,
             SUM("signedAmount")::float8 AS sum_signed
      FROM dedup
      WHERE rn = 1 AND "transDate" >= '2025-12-01T00:00:00Z'::timestamptz
      GROUP BY yr, mo ORDER BY yr, mo
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    for (const m of months) {
      console.log(
        `  ${m.yr}-${String(m.mo).padStart(2, '0')}  rows=${String(Number(m.n)).padStart(4)}  sum_signed=${Number(m.sum_signed).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== 5. signedAmount vs (creditAmount - debitAmount) sanity ===`);
    const sanity = await p.$queryRawUnsafe<Array<any>>(
      `
      SELECT
        COUNT(*)::bigint AS n,
        COUNT(*) FILTER (WHERE "signedAmount" = COALESCE("creditAmount",0) - COALESCE("debitAmount",0))::bigint AS match_cr_minus_dr,
        COUNT(*) FILTER (WHERE "signedAmount" = COALESCE("debitAmount",0) - COALESCE("creditAmount",0))::bigint AS match_dr_minus_cr,
        COUNT(*) FILTER (WHERE "creditAmount" IS NULL AND "debitAmount" IS NULL)::bigint AS both_null
      FROM "GLTransactionFact"
      WHERE "companyId" = $1 AND "accountId" = $2
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    console.log(JSON.stringify(sanity[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  } finally {
    await p.$disconnect();
  }
})();
