/**
 * Investigate the 818 APTransactionFact rows that don't have a GL APV entry.
 * Hypothesis: they're pre-Apr-2023 (before our GL history starts).
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    await p.$executeRawUnsafe(`DROP TABLE IF EXISTS tmp_apv_map`);
    await p.$executeRawUnsafe(
      `
      CREATE TEMP TABLE tmp_apv_map AS
      WITH credit_apv AS (
        SELECT
          "accountId" AS ap_account,
          NULLIF(TRIM(REPLACE("ref", 'APV', '')), '') AS voucher_num
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "ref" LIKE 'APV%' AND "signedAmount" < 0
      )
      SELECT voucher_num, ap_account, COUNT(*)::bigint AS cnt
      FROM credit_apv
      WHERE voucher_num IS NOT NULL AND voucher_num ~ '^[0-9]+$'
      GROUP BY voucher_num, ap_account
      `,
      COMPANY_ID
    );
    await p.$executeRawUnsafe(`CREATE INDEX ON tmp_apv_map (voucher_num)`);

    console.log(`\n=== Unmatched vouchers: date distribution ===`);
    const dateDist = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "eventDate", "transType"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT
        date_trunc('year', "eventDate")::date AS yr,
        COUNT(*)::bigint AS rows,
        SUM("normalizedAmount")::float8 AS sum_amt
      FROM ap
      LEFT JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map
         WHERE voucher_num = ap.voucher_str
         ORDER BY cnt DESC LIMIT 1
      ) m ON TRUE
      WHERE m.ap_account IS NULL
      GROUP BY 1 ORDER BY 1
      `,
      COMPANY_ID
    );
    for (const r of dateDist) {
      console.log(
        `  ${String(r.yr).slice(0, 10)}  rows=${Number(r.rows).toString().padStart(4)}  sum=${Number(r.sum_amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== Unmatched vouchers: transType distribution ===`);
    const typeDist = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "transType"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT
        COALESCE(ap."transType", '(null)') AS trans_type,
        COUNT(*)::bigint AS rows,
        SUM("normalizedAmount")::float8 AS sum_amt
      FROM ap
      LEFT JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map
         WHERE voucher_num = ap.voucher_str
         ORDER BY cnt DESC LIMIT 1
      ) m ON TRUE
      WHERE m.ap_account IS NULL
      GROUP BY 1 ORDER BY 2 DESC
      `,
      COMPANY_ID
    );
    for (const r of typeDist) {
      console.log(
        `  type=${String(r.trans_type).padEnd(15)} rows=${Number(r.rows).toString().padStart(4)}  sum=${Number(r.sum_amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      );
    }

    console.log(`\n=== Sample unmatched vouchers (recent) ===`);
    const samples = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "eventDate", "transType",
               "vendorId", "vendorName", "invNum"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT ap.voucher_str, ap."eventDate", ap."normalizedAmount", ap."transType", ap."vendorName", ap."invNum"
      FROM ap
      LEFT JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map WHERE voucher_num = ap.voucher_str LIMIT 1
      ) m ON TRUE
      WHERE m.ap_account IS NULL
      ORDER BY ap."eventDate" DESC LIMIT 15
      `,
      COMPANY_ID
    );
    for (const r of samples) {
      console.log(
        `  voucher=${String(r.voucher_str).padEnd(8)} ${String(r.eventDate).slice(0, 10)} type=${String(r.transType || '').padEnd(8)} amt=${Number(r.normalizedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }).padStart(12)} vendor=${(r.vendorName || '').slice(0, 25)}`
      );
    }

    console.log(`\n=== Sample unmatched vouchers (oldest) ===`);
    const oldSamples = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH ap AS (
        SELECT id, voucher::text AS voucher_str, "normalizedAmount", "eventDate", "transType",
               "vendorName", "invNum"
        FROM "APTransactionFact" WHERE "companyId" = $1
      )
      SELECT ap.voucher_str, ap."eventDate", ap."normalizedAmount", ap."transType", ap."vendorName"
      FROM ap
      LEFT JOIN LATERAL (
        SELECT ap_account FROM tmp_apv_map WHERE voucher_num = ap.voucher_str LIMIT 1
      ) m ON TRUE
      WHERE m.ap_account IS NULL
      ORDER BY ap."eventDate" ASC LIMIT 15
      `,
      COMPANY_ID
    );
    for (const r of oldSamples) {
      console.log(
        `  voucher=${String(r.voucher_str).padEnd(8)} ${String(r.eventDate).slice(0, 10)} type=${String(r.transType || '').padEnd(8)} amt=${Number(r.normalizedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }).padStart(12)} vendor=${(r.vendorName || '').slice(0, 25)}`
      );
    }

    console.log(`\n=== Earliest GL APV row ===`);
    const earliestApv = await p.$queryRawUnsafe<Array<any>>(
      `SELECT MIN("transDate") AS min_dt, MAX("transDate") AS max_dt, COUNT(*)::bigint AS n
       FROM "GLTransactionFact"
       WHERE "companyId" = $1 AND "ref" LIKE 'APV%'`,
      COMPANY_ID
    );
    console.log(JSON.stringify(earliestApv[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

    console.log(`\n=== Earliest APTransactionFact row ===`);
    const earliestApFact = await p.$queryRawUnsafe<Array<any>>(
      `SELECT MIN("eventDate") AS min_dt, MAX("eventDate") AS max_dt, COUNT(*)::bigint AS n
       FROM "APTransactionFact"
       WHERE "companyId" = $1`,
      COMPANY_ID
    );
    console.log(JSON.stringify(earliestApFact[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  } finally {
    await p.$disconnect();
  }
})();
