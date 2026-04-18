import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    console.log(`\n=== Distinct AP-related accounts in GLTransactionFact (DEDUP'd, by APP/APV/APA prefix) ===`);
    const accts = await p.$queryRawUnsafe<
      Array<{ accountId: string; accountName: string | null; n: bigint; sum_signed: number | null }>
    >(
      `
      WITH ranked AS (
        SELECT
          "accountId", "accountName", "ref", "signedAmount",
          ROW_NUMBER() OVER (
            PARTITION BY "companyId", "transDate", "accountId", "transNum"
            ORDER BY
              CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
              "createdAt" ASC
          ) AS rn
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
          AND ("ref" LIKE 'AP%')
      )
      SELECT "accountId", "accountName", COUNT(*)::bigint AS n, SUM("signedAmount")::float8 AS sum_signed
      FROM ranked
      WHERE rn = 1
      GROUP BY "accountId", "accountName"
      ORDER BY n DESC
      `,
      COMPANY_ID
    );
    for (const r of accts) {
      console.log(
        `  acct=${r.accountId.padEnd(8)}  name=${(r.accountName || '').padEnd(30)}  rows=${String(r.n).padStart(6)}  sum=${(Number(r.sum_signed) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== APTransactionFact: peek at columns to find AP-account hint ===`);
    const sample = await p.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT * FROM "APTransactionFact" WHERE "companyId" = $1 ORDER BY "eventDate" DESC LIMIT 3`,
      COMPANY_ID
    );
    for (const r of sample) {
      console.log('  ---');
      for (const [k, v] of Object.entries(r)) {
        const sv = v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        console.log(`    ${k}: ${sv.length > 100 ? sv.substring(0, 100) + '...' : sv}`);
      }
    }
  } finally {
    await p.$disconnect();
  }
})();
