/**
 * Simulate a redesigned AP roll-forward that derives EVERYTHING from
 * GLTransactionFact rows on accountId='30100', dropping APTransactionFact
 * entirely from the balance calc. Tests two date strategies:
 *
 *   - PURE_TRANS:  group by transDate (current behavior)
 *   - HYBRID:      use controlPeriod month-end when controlPeriod < month(transDate)
 *                  to align late postings with CSI's fiscal close
 *
 * Sign convention on accountId=30100 (verified by APV sum -$33.4M, APP sum +$33.9M):
 *   AP (liability) credits → signedAmount < 0   (raises AP)
 *   AP (liability) debits  → signedAmount > 0   (lowers AP)
 *
 *   AP_balance(t) = anchor - SUM(signedAmount where eff_date in (anchor, t])
 */
import { PrismaClient } from '@prisma/client';
import { getApBalanceSheetAnchorConfig } from '../lib/financial/ap-balance-sheet-anchor';

const COMPANY_ID = String(process.env.TARGET_COMPANY_ID || '').trim();
const ACCOUNT_ID = String(process.env.DIAG_ACCOUNT_ID || '30100').trim();

if (!COMPANY_ID) {
  console.error('FATAL: TARGET_COMPANY_ID required');
  process.exit(1);
}

const TB_CHECKPOINTS: Array<{ label: string; dateIso: string; tb: number }> = [
  { label: '2026-01-31', dateIso: '2026-01-31T23:59:59.999Z', tb: 458_386.50 },
  { label: '2026-02-28', dateIso: '2026-02-28T23:59:59.999Z', tb: 678_972.12 },
  { label: '2026-03-31', dateIso: '2026-03-31T23:59:59.999Z', tb: 815_260.86 },
];

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pad(s: string, w: number, right = false) {
  return s.length >= w ? s : right ? s.padStart(w) : s.padEnd(w);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const anchor = getApBalanceSheetAnchorConfig(COMPANY_ID);
    if (!anchor) return;
    const acct = anchor.accounts.find((a) => a.accountId === ACCOUNT_ID);
    if (!acct) return;
    const anchorDate = new Date(`${anchor.anchorDateIso}T12:00:00.000Z`);
    const anchorBalance = acct.apBalance;

    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    console.log(`Company: ${COMPANY_ID}, Account: ${ACCOUNT_ID}`);
    console.log(`Anchor: ${anchor.anchorDateIso} = $${fmt(anchorBalance)}\n`);

    // Build dedup'd row set (mimics what the migration will leave behind):
    // one row per (companyId, transDate, accountId, transNum), preferring
    // SLLedgers rows with controlPeriod set.
    const dedupedCte = `
      WITH dedup AS (
        SELECT
          "transDate",
          "controlYear",
          "controlPeriod",
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
    `;

    console.log(`=== STRATEGY: PURE_TRANS (DEDUP'd, sum signedAmount by transDate) ===`);
    console.log(
      `  ${pad('Checkpoint', 12)}  ${pad('SUM(signedAmount)', 22, true)}  ${pad('Computed AP', 18, true)}  ${pad('TB', 14, true)}  ${pad('Drift', 14, true)}`
    );
    for (const cp of TB_CHECKPOINTS) {
      const r = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
        `${dedupedCte}
        SELECT COALESCE(SUM("signedAmount"), 0) AS s
        FROM dedup
        WHERE rn = 1 AND "transDate" > $3 AND "transDate" <= $4
        `,
        COMPANY_ID,
        ACCOUNT_ID,
        anchorDate,
        new Date(cp.dateIso)
      );
      const sumSigned = Number(r[0]?.s || 0);
      const computed = anchorBalance - sumSigned;
      const drift = computed - cp.tb;
      console.log(
        `  ${pad(cp.label, 12)}  ${pad(fmt(sumSigned), 22, true)}  ${pad(fmt(computed), 18, true)}  ${pad(fmt(cp.tb), 14, true)}  ${pad(fmt(drift), 14, true)}`
      );
    }

    console.log(`\n=== STRATEGY: HYBRID (DEDUP'd + controlPeriod month-end pull-back when set) ===`);
    console.log(
      `  ${pad('Checkpoint', 12)}  ${pad('SUM(signedAmount)', 22, true)}  ${pad('Computed AP', 18, true)}  ${pad('TB', 14, true)}  ${pad('Drift', 14, true)}`
    );
    for (const cp of TB_CHECKPOINTS) {
      const r = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
        `${dedupedCte},
         eff AS (
          SELECT
            CASE
              WHEN "controlYear" IS NOT NULL AND "controlPeriod" IS NOT NULL
                THEN (DATE_TRUNC('month', MAKE_DATE("controlYear", "controlPeriod", 1)) + INTERVAL '1 month - 1 day')::timestamp AT TIME ZONE 'UTC'
              ELSE "transDate"
            END AS eff_date,
            "signedAmount"
          FROM dedup
          WHERE rn = 1
        )
        SELECT COALESCE(SUM("signedAmount"), 0) AS s
        FROM eff
        WHERE eff_date > $3 AND eff_date <= $4
        `,
        COMPANY_ID,
        ACCOUNT_ID,
        anchorDate,
        new Date(cp.dateIso)
      );
      const sumSigned = Number(r[0]?.s || 0);
      const computed = anchorBalance - sumSigned;
      const drift = computed - cp.tb;
      console.log(
        `  ${pad(cp.label, 12)}  ${pad(fmt(sumSigned), 22, true)}  ${pad(fmt(computed), 18, true)}  ${pad(fmt(cp.tb), 14, true)}  ${pad(fmt(drift), 14, true)}`
      );
    }

    console.log(`\n=== STRATEGY: PURE_CP (use controlPeriod month-end ALWAYS, fallback to transDate) ===`);
    console.log(`(Same as HYBRID since the difference is only when controlPeriod = NULL)`);
    console.log(`  See HYBRID above`);

    console.log(`\n=== Coverage check: how many rows have controlPeriod set? ===`);
    const cov = await prisma.$queryRawUnsafe<
      Array<{ total: bigint; cp_set: bigint; cp_null: bigint }>
    >(
      `
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE "controlPeriod" IS NOT NULL)::bigint AS cp_set,
             COUNT(*) FILTER (WHERE "controlPeriod" IS NULL)::bigint AS cp_null
      FROM "GLTransactionFact"
      WHERE "companyId" = $1 AND "accountId" = $2
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    const c = cov[0];
    console.log(`  total=${Number(c.total).toLocaleString()}  cp_set=${Number(c.cp_set).toLocaleString()}  cp_null=${Number(c.cp_null).toLocaleString()}`);
    if (Number(c.cp_null) > 0) {
      console.log(`\n=== controlPeriod NULL: by month/year (transDate-based) ===`);
      const months = await prisma.$queryRawUnsafe<
        Array<{ yr: number; mo: number; n: bigint; programs: string }>
      >(
        `
        SELECT EXTRACT(YEAR FROM "transDate")::int AS yr,
               EXTRACT(MONTH FROM "transDate")::int AS mo,
               COUNT(*)::bigint AS n,
               string_agg(DISTINCT COALESCE("sourceProgram",'(null)'), ',' ORDER BY COALESCE("sourceProgram",'(null)')) AS programs
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "accountId" = $2 AND "controlPeriod" IS NULL
        GROUP BY yr, mo
        ORDER BY yr, mo
        `,
        COMPANY_ID,
        ACCOUNT_ID
      );
      for (const m of months) {
        console.log(`  ${m.yr}-${String(m.mo).padStart(2, '0')}  rows=${String(Number(m.n)).padStart(5)}  programs=${m.programs}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
