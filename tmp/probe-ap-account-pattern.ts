/**
 * Verify the AP-class account pattern: are all genuine AP accounts in the
 * 3xxxx range? Cross-check against chart-of-accounts (SLChartAccts) raw records.
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    console.log(`\n=== AP-class accounts on this CoA (account starts with 3 + appears as APV credit) ===`);
    // Look at BOTH sides of APV journal entries restricted to 3xxxx accounts.
    const apAccts = await p.$queryRawUnsafe<Array<any>>(
      `
      SELECT "accountId", "accountName",
             COUNT(*) FILTER (WHERE "signedAmount" > 0)::bigint AS dr_rows,
             COUNT(*) FILTER (WHERE "signedAmount" < 0)::bigint AS cr_rows
      FROM "GLTransactionFact"
      WHERE "companyId" = $1 AND "ref" LIKE 'APV%' AND "accountId" ~ '^3[0-9]+$'
      GROUP BY "accountId", "accountName"
      ORDER BY (COUNT(*)) DESC
      `,
      COMPANY_ID
    );
    for (const r of apAccts) {
      console.log(
        `  acct=${(r.accountId || '').padEnd(8)}  name=${(r.accountName || '').padEnd(40)}  dr=${Number(r.dr_rows).toString().padStart(5)}  cr=${Number(r.cr_rows).toString().padStart(5)}`
      );
    }

    console.log(`\n=== Sample SLChartAccts payload to confirm Liability accts ===`);
    const coa = await p.$queryRawUnsafe<Array<any>>(
      `SELECT payload FROM "InforRawRecord"
       WHERE "companyId" = $1
         AND "miProgram" ILIKE 'SLChartAccts'
       LIMIT 5`,
      COMPANY_ID
    );
    for (const r of coa) {
      const payload = r.payload as Record<string, any>;
      console.log(`  ${JSON.stringify(payload)}`);
    }

    console.log(`\n=== Liability accounts (Type='L' or category-based) ===`);
    const liabAccts = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH coa AS (
        SELECT DISTINCT
          payload->>'Acct'        AS acct,
          payload->>'Description' AS description,
          payload->>'Type'        AS type,
          payload->>'Category'    AS category
        FROM "InforRawRecord"
        WHERE "companyId" = $1 AND "miProgram" ILIKE 'SLChartAccts'
      )
      SELECT type, category, COUNT(*)::bigint AS n
      FROM coa GROUP BY type, category ORDER BY n DESC
      `,
      COMPANY_ID
    );
    for (const r of liabAccts) {
      console.log(`  type=${String(r.type || '(null)').padEnd(15)}  cat=${String(r.category || '(null)').padEnd(20)}  n=${Number(r.n)}`);
    }

    console.log(`\n=== AP accounts from CoA (Type matching liability/AP) ===`);
    const apFromCoa = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH coa AS (
        SELECT DISTINCT
          payload->>'Acct'        AS acct,
          payload->>'Description' AS description,
          payload->>'Type'        AS type,
          payload->>'Category'    AS category
        FROM "InforRawRecord"
        WHERE "companyId" = $1 AND "miProgram" ILIKE 'SLChartAccts'
      )
      SELECT acct, description, type, category
      FROM coa
      WHERE acct ~ '^3[0-9]+$'
      ORDER BY acct
      `,
      COMPANY_ID
    );
    for (const r of apFromCoa) {
      console.log(`  ${String(r.acct).padEnd(8)} ${String(r.description || '').padEnd(40)} type=${r.type} cat=${r.category}`);
    }
  } finally {
    await p.$disconnect();
  }
})();
