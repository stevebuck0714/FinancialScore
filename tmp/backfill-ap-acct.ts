/**
 * One-time backfill of `APTransactionFact.apAcct`.
 *
 * Background:
 *   The CSI SLVchHdrs IDO endpoint stored on `AccountingConnection.accountingPrograms`
 *   does not include `ApAcct` in its `properties=` query string, so the raw payloads
 *   we ingested have no AP-account field. The writer therefore wrote NULL into
 *   `apAcct` on every voucher row. Without `apAcct`, the AP balance derivation in
 *   app/api/operational-data/route.ts had to fall back to `apAcct IS NULL`, which
 *   is correct only by accident and prevents per-AP-account roll-forwards.
 *
 * Strategy:
 *   For each voucher, find its GL journal entry on an AP-class account (accountId
 *   matching ^3[0-9]+$) regardless of side, and copy that entry's accountId onto
 *   the voucher row. This handles both vouchers (CR side on AP) and credit memos
 *   (DR side on AP). When the JE has multiple AP-class lines (e.g. 401K splits),
 *   the dominant one wins.
 *
 *   Vouchers that have no AP-class GL entry get the per-company default AP
 *   account (the first anchor account in `lib/financial/ap-balance-sheet-anchor.ts`).
 *   Empirically these are AP_OPEN-snapshot synthetic rows or PreRegister vouchers
 *   that simply haven't been posted to GL yet; defaulting them to the primary AP
 *   control reproduces the prior `OR apAcct=null` accuracy while making the data
 *   architecturally correct (every row carries an account).
 *
 * Idempotent:
 *   Running multiple times is safe. The UPDATE only writes when apAcct differs
 *   from the derivation, so re-runs are no-ops once data is correct.
 */
import { PrismaClient } from '@prisma/client';
import { getApBalanceSheetAnchorConfig } from '../lib/financial/ap-balance-sheet-anchor';

const DRY_RUN = process.env.DRY_RUN !== '0';

(async () => {
  const p = new PrismaClient();
  try {
    const dbHost = (process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1];
    console.log(`DB: ${dbHost}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (set DRY_RUN=0 to apply)' : 'APPLY (writes will be committed)'}`);

    console.log(`\n=== Step 1: build temp map of voucher_num -> ap_account from GL APV rows ===`);
    // Filter to AP-class accounts (account number starts with '3' on this CoA).
    // This works for BOTH sides of the JE:
    //   - Voucher (DR expense / CR AP): the 3xxxx row is on the CREDIT side
    //   - Credit memo (DR AP / CR expense): the 3xxxx row is on the DEBIT side
    // This is a CSI/Infor convention; for other clients we'll need to derive the
    // AP-account list from SLChartAccts (Type='L' / category='Liability') once
    // the CoA properties are populated. Tracked as Phase 3.
    await p.$executeRawUnsafe(`DROP TABLE IF EXISTS tmp_apv_map`);
    await p.$executeRawUnsafe(
      `
      CREATE TEMP TABLE tmp_apv_map AS
      WITH apv_ap_class AS (
        SELECT
          "companyId",
          "accountId" AS ap_account,
          NULLIF(TRIM(REPLACE("ref", 'APV', '')), '') AS voucher_num
        FROM "GLTransactionFact"
        WHERE "ref" LIKE 'APV%' AND "accountId" ~ '^3[0-9]+$'
      ),
      grouped AS (
        SELECT "companyId", voucher_num, ap_account, COUNT(*)::bigint AS cnt
        FROM apv_ap_class
        WHERE voucher_num IS NOT NULL AND voucher_num ~ '^[0-9]+$'
        GROUP BY "companyId", voucher_num, ap_account
      ),
      ranked AS (
        -- For vouchers that hit multiple AP accounts in the JE (rare splits like
        -- 401K vouchers crediting 4 deduction accounts), pick the dominant one
        -- by row count, then alphabetically for stability.
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY "companyId", voucher_num
                 ORDER BY cnt DESC, ap_account ASC
               ) AS rn
        FROM grouped
      )
      SELECT "companyId", voucher_num, ap_account
      FROM ranked WHERE rn = 1
      `
    );
    await p.$executeRawUnsafe(`CREATE INDEX ON tmp_apv_map ("companyId", voucher_num)`);
    const mapStats = await p.$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*)::bigint AS rows,
              COUNT(DISTINCT "companyId")::bigint AS companies
       FROM tmp_apv_map`
    );
    console.log(`  tmp_apv_map: ${Number(mapStats[0].rows).toLocaleString()} rows across ${mapStats[0].companies} companies`);

    console.log(`\n=== Step 2: build per-company default AP account map (from balance-sheet-anchor config) ===`);
    const companies = await p.$queryRawUnsafe<Array<{ companyId: string }>>(
      `SELECT DISTINCT "companyId" FROM "APTransactionFact"`
    );
    const defaultByCompany = new Map<string, string | null>();
    for (const { companyId } of companies) {
      const cfg = getApBalanceSheetAnchorConfig(companyId);
      const acct = cfg?.accounts?.[0]?.accountId || null;
      defaultByCompany.set(companyId, acct);
      console.log(`  company=${companyId.slice(0, 12)}…  default_ap_account=${acct ?? '(no anchor configured)'}`);
    }

    console.log(`\n=== Step 3: preview impact (per company, per derived ap_account) ===`);
    const preview = await p.$queryRawUnsafe<Array<any>>(
      `
      SELECT
        ap."companyId",
        m.ap_account AS derived_acct,
        COUNT(*)::bigint AS rows,
        SUM(ap."normalizedAmount")::float8 AS sum_amt
      FROM "APTransactionFact" ap
      LEFT JOIN tmp_apv_map m
        ON m."companyId" = ap."companyId"
       AND m.voucher_num = ap.voucher::text
      GROUP BY ap."companyId", m.ap_account
      ORDER BY ap."companyId", rows DESC
      `
    );
    for (const r of preview) {
      const fallback = defaultByCompany.get(r.companyId);
      const target = r.derived_acct ?? fallback ?? '(NO DEFAULT)';
      const label = r.derived_acct
        ? `derived from GL: ${target}`
        : `unmatched -> default: ${target}`;
      console.log(
        `  company=${r.companyId.slice(0, 12)}…  ${label.padEnd(45)}  rows=${Number(r.rows).toString().padStart(5)}  sum=${Number(r.sum_amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      );
    }

    if (DRY_RUN) {
      console.log(`\n[DRY-RUN] Skipping UPDATE. Re-run with DRY_RUN=0 to apply.`);
      return;
    }

    console.log(`\n=== Step 4: apply UPDATE (matched -> derived; unmatched -> per-company default) ===`);
    // Phase A: matched rows get the derived account.
    const matchedUpdate = await p.$executeRawUnsafe(
      `
      UPDATE "APTransactionFact" ap
         SET "apAcct" = m.ap_account
        FROM tmp_apv_map m
       WHERE m."companyId" = ap."companyId"
         AND m.voucher_num = ap.voucher::text
         AND ap."apAcct" IS DISTINCT FROM m.ap_account
      `
    );
    console.log(`  Phase A (matched -> derived): ${matchedUpdate.toLocaleString()} rows updated`);

    // Phase B: unmatched rows (apAcct still NULL) get the per-company default.
    let phaseBTotal = 0;
    for (const [companyId, defaultAcct] of defaultByCompany.entries()) {
      if (!defaultAcct) {
        console.log(`  Phase B (company=${companyId.slice(0, 12)}…): SKIP — no anchor configured`);
        continue;
      }
      const n = await p.$executeRawUnsafe(
        `UPDATE "APTransactionFact"
            SET "apAcct" = $1
          WHERE "companyId" = $2 AND "apAcct" IS NULL`,
        defaultAcct,
        companyId
      );
      console.log(`  Phase B (company=${companyId.slice(0, 12)}… -> ${defaultAcct}): ${Number(n).toLocaleString()} rows updated`);
      phaseBTotal += Number(n);
    }
    console.log(`  Total: ${(Number(matchedUpdate) + phaseBTotal).toLocaleString()} rows updated`);

    console.log(`\n=== Step 5: post-update sanity check ===`);
    const post = await p.$queryRawUnsafe<Array<any>>(
      `
      SELECT
        "companyId",
        COALESCE("apAcct", '(NULL)') AS ap_acct,
        COUNT(*)::bigint AS rows,
        SUM("normalizedAmount")::float8 AS sum_amt
      FROM "APTransactionFact"
      GROUP BY "companyId", "apAcct"
      ORDER BY "companyId", rows DESC
      `
    );
    for (const r of post) {
      console.log(
        `  company=${r.companyId.slice(0, 12)}…  apAcct=${String(r.ap_acct).padEnd(15)}  rows=${Number(r.rows).toString().padStart(5)}  sum=${Number(r.sum_amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      );
    }
  } finally {
    await p.$disconnect();
  }
})();
