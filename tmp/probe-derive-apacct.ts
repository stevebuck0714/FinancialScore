/**
 * Probe whether apAcct can be reliably derived from GL data.
 * Uses a temp table to materialize (voucher_num -> ap_account) for speed.
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    console.log(`\n=== Distinct accountType + accountCategory in GL APV rows ===`);
    const types = await p.$queryRawUnsafe<Array<any>>(
      `SELECT "accountType", "accountCategory", COUNT(*)::bigint AS n
       FROM "GLTransactionFact"
       WHERE "companyId" = $1 AND "ref" LIKE 'APV%'
       GROUP BY "accountType", "accountCategory" ORDER BY n DESC LIMIT 20`,
      COMPANY_ID
    );
    for (const r of types) {
      console.log(`  type=${String(r.accountType || '(null)').padEnd(15)}  cat=${String(r.accountCategory || '(null)').padEnd(20)}  rows=${Number(r.n).toLocaleString()}`);
    }

    console.log(`\n=== Distinct drCr / sign for APV rows ===`);
    const signs = await p.$queryRawUnsafe<Array<any>>(
      `SELECT "drCr", SIGN("signedAmount") AS sign, COUNT(*)::bigint AS n
       FROM "GLTransactionFact"
       WHERE "companyId" = $1 AND "ref" LIKE 'APV%'
       GROUP BY "drCr", SIGN("signedAmount") ORDER BY n DESC`,
      COMPANY_ID
    );
    for (const r of signs) {
      console.log(`  drCr=${String(r.drCr || '(null)').padEnd(6)}  sign=${r.sign}  rows=${Number(r.n).toLocaleString()}`);
    }

    console.log(`\n=== Sample APV ref strings (to confirm parsing pattern) ===`);
    const sampleRefs = await p.$queryRawUnsafe<Array<any>>(
      `SELECT DISTINCT "ref" FROM "GLTransactionFact"
       WHERE "companyId" = $1 AND "ref" LIKE 'APV%'
       LIMIT 10`,
      COMPANY_ID
    );
    for (const r of sampleRefs) console.log(`  "${r.ref}"`);

    console.log(`\n=== Build temp table of voucher -> ap_account from credit-side APV rows ===`);
    await p.$executeRawUnsafe(`DROP TABLE IF EXISTS tmp_apv_map`);
    await p.$executeRawUnsafe(
      `
      CREATE TEMP TABLE tmp_apv_map AS
      WITH credit_apv AS (
        SELECT
          "accountId" AS ap_account,
          -- ref is "APV  403645" — strip "APV" prefix and trim
          NULLIF(TRIM(REPLACE("ref", 'APV', '')), '') AS voucher_num
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
          AND "ref" LIKE 'APV%'
          AND "signedAmount" < 0  -- CREDIT side (AP liability)
      )
      SELECT voucher_num, ap_account, COUNT(*)::bigint AS cnt
      FROM credit_apv
      WHERE voucher_num IS NOT NULL AND voucher_num ~ '^[0-9]+$'
      GROUP BY voucher_num, ap_account
      `,
      COMPANY_ID
    );
    await p.$executeRawUnsafe(`CREATE INDEX ON tmp_apv_map (voucher_num)`);

    const mapStats = await p.$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*)::bigint AS rows,
              COUNT(DISTINCT voucher_num)::bigint AS distinct_vouchers,
              COUNT(DISTINCT ap_account)::bigint AS distinct_accts
       FROM tmp_apv_map`
    );
    console.log(JSON.stringify(mapStats[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

    console.log(`\n=== AP-account distribution within tmp_apv_map (credit side) ===`);
    const apAcctDist = await p.$queryRawUnsafe<Array<any>>(
      `SELECT ap_account, SUM(cnt)::bigint AS rows, COUNT(DISTINCT voucher_num)::bigint AS vouchers
       FROM tmp_apv_map GROUP BY ap_account ORDER BY rows DESC`
    );
    for (const r of apAcctDist) {
      console.log(`  acct=${(r.ap_account || '').padEnd(8)}  rows=${Number(r.rows).toString().padStart(6)}  vouchers=${Number(r.vouchers).toString().padStart(6)}`);
    }

    console.log(`\n=== Vouchers mapping to MULTIPLE AP accounts (ambiguous) ===`);
    const ambig = await p.$queryRawUnsafe<Array<any>>(
      `SELECT voucher_num, COUNT(DISTINCT ap_account)::bigint AS distinct_accts,
              string_agg(ap_account, ',' ORDER BY ap_account) AS accts
       FROM tmp_apv_map
       GROUP BY voucher_num HAVING COUNT(DISTINCT ap_account) > 1 LIMIT 10`
    );
    if (ambig.length === 0) {
      console.log('  (no ambiguous vouchers — clean 1:1 mapping)');
    } else {
      for (const r of ambig) console.log(`  voucher=${r.voucher_num}  accts=${r.accts}`);
      const ambigCount = await p.$queryRawUnsafe<Array<any>>(
        `SELECT COUNT(DISTINCT voucher_num)::bigint AS n FROM (
            SELECT voucher_num FROM tmp_apv_map GROUP BY voucher_num HAVING COUNT(DISTINCT ap_account) > 1
         ) x`
      );
      console.log(`  total ambiguous vouchers: ${Number(ambigCount[0].n).toLocaleString()}`);
    }

    console.log(`\n=== Coverage: APTransactionFact rows that match the map ===`);
    const cov = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "transType"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE m.ap_account IS NOT NULL)::bigint AS matched,
             COUNT(*) FILTER (WHERE m.ap_account IS NULL)::bigint AS unmatched
      FROM ap
      LEFT JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map
         WHERE voucher_num = ap.voucher_str
         ORDER BY cnt DESC LIMIT 1
      ) m ON TRUE
      `,
      COMPANY_ID
    );
    console.log(JSON.stringify(cov[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

    console.log(`\n=== Derived apAcct distribution + amount totals ===`);
    const dist = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "transType"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT COALESCE(m.ap_account, '(unmatched)') AS derived_acct,
             COUNT(*)::bigint AS rows,
             SUM("normalizedAmount")::float8 AS sum_amt
      FROM ap
      LEFT JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map
         WHERE voucher_num = ap.voucher_str
         ORDER BY cnt DESC LIMIT 1
      ) m ON TRUE
      GROUP BY m.ap_account
      ORDER BY rows DESC
      `,
      COMPANY_ID
    );
    for (const r of dist) {
      console.log(
        `  derived=${String(r.derived_acct).padEnd(15)}  rows=${Number(r.rows).toString().padStart(5)}  sum=${Number(r.sum_amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== If we restrict to derived_acct='30100' only, what's the voucher-side total? ===`);
    const acct30100 = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "eventDate", "transType"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT
        COUNT(*)::bigint AS rows,
        SUM("normalizedAmount")::float8 AS sum_normalized,
        MIN("eventDate") AS min_date,
        MAX("eventDate") AS max_date
      FROM ap
      JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map
         WHERE voucher_num = ap.voucher_str
         ORDER BY cnt DESC LIMIT 1
      ) m ON TRUE
      WHERE m.ap_account = '30100'
      `,
      COMPANY_ID
    );
    console.log(JSON.stringify(acct30100[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  } finally {
    await p.$disconnect();
  }
})();
