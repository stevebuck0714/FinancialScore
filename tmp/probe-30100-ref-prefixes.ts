import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const ACCOUNT_ID = '30100';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    console.log(`\n=== Ref prefix breakdown for account ${ACCOUNT_ID} (DEDUP'd) ===`);
    const rows = await p.$queryRawUnsafe<
      Array<{ prefix: string; n: bigint; sum_signed: number | null }>
    >(
      `
      WITH ranked AS (
        SELECT
          "ref",
          "signedAmount",
          ROW_NUMBER() OVER (
            PARTITION BY "companyId", "transDate", "accountId", "transNum"
            ORDER BY
              CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
              "createdAt" ASC
          ) AS rn
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "accountId" = $2
      )
      SELECT
        COALESCE(SUBSTRING(ref FROM '^[A-Za-z]+'), '(none)') AS prefix,
        COUNT(*)::bigint AS n,
        SUM("signedAmount")::float8 AS sum_signed
      FROM ranked
      WHERE rn = 1
      GROUP BY prefix
      ORDER BY n DESC
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    for (const r of rows) {
      console.log(
        `  prefix=${(r.prefix || '').padEnd(8)}  rows=${String(r.n).padStart(7)}  sum=${(Number(r.sum_signed) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== APTransactionFact prefix breakdown (vouchers, account ${ACCOUNT_ID}) ===`);
    const v = await p.$queryRawUnsafe<
      Array<{ trans_type: string | null; n: bigint; sum_norm: number | null }>
    >(
      `
      SELECT "transType" AS trans_type, COUNT(*)::bigint AS n,
             SUM("normalizedAmount")::float8 AS sum_norm
      FROM "APTransactionFact"
      WHERE "companyId" = $1
        AND ("apAcct" = $2 OR "apAcct" IS NULL)
      GROUP BY "transType"
      ORDER BY n DESC
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    for (const r of v) {
      console.log(
        `  type=${String(r.trans_type || '(null)').padEnd(10)}  rows=${String(r.n).padStart(7)}  sum=${(Number(r.sum_norm) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== APTransactionFact apAcct distribution ===`);
    const apa = await p.$queryRawUnsafe<Array<{ ap_acct: string | null; n: bigint; sum_norm: number | null }>>(
      `
      SELECT "apAcct" AS ap_acct, COUNT(*)::bigint AS n, SUM("normalizedAmount")::float8 AS sum_norm
      FROM "APTransactionFact"
      WHERE "companyId" = $1
      GROUP BY "apAcct"
      ORDER BY n DESC
      `,
      COMPANY_ID
    );
    for (const r of apa) {
      console.log(
        `  apAcct=${String(r.ap_acct || '(null)').padEnd(10)}  rows=${String(r.n).padStart(7)}  sum=${(Number(r.sum_norm) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
  } finally {
    await p.$disconnect();
  }
})();
