/**
 * Simulate what the AP roll-forward would produce IF we deduplicated GLTransactionFact
 * on (companyId, transDate, accountId, transNum). READ ONLY.
 *
 * For each (transDate, accountId, transNum) group, picks ONE canonical row:
 *   1. Prefer rows with controlPeriod IS NOT NULL (SLLedgers with fiscal-period stamp).
 *   2. Then any SLLedgers row.
 *   3. Then the SLGLTRANS row.
 *
 * Computes AP at user-supplied checkpoint dates and compares to TB ground truth.
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
  { label: '2024-12-31', dateIso: '2024-12-31T23:59:59.999Z', tb: NaN },
  { label: '2025-12-31', dateIso: '2025-12-31T23:59:59.999Z', tb: NaN },
  { label: '2026-01-31', dateIso: '2026-01-31T23:59:59.999Z', tb: 458_386.50 },
  { label: '2026-02-28', dateIso: '2026-02-28T23:59:59.999Z', tb: 678_972.12 },
  { label: '2026-03-31', dateIso: '2026-03-31T23:59:59.999Z', tb: 815_260.86 },
];

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pad(s: string, w: number, right = false) {
  return s.length >= w ? s : right ? s.padStart(w) : s.padEnd(w);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const anchor = getApBalanceSheetAnchorConfig(COMPANY_ID);
    if (!anchor) {
      console.error('No anchor config for this company');
      return;
    }
    const acct = anchor.accounts.find((a) => a.accountId === ACCOUNT_ID);
    if (!acct) {
      console.error(`No anchor for account ${ACCOUNT_ID}`);
      return;
    }
    const anchorDate = new Date(`${anchor.anchorDateIso}T12:00:00.000Z`);
    const anchorBalance = acct.apBalance;

    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    console.log(`Company: ${COMPANY_ID}, Account: ${ACCOUNT_ID}`);
    console.log(`Anchor: ${anchor.anchorDateIso} = $${fmt(anchorBalance)}\n`);

    console.log('=== SIMULATION RESULTS ===');
    console.log(
      `  ${pad('Checkpoint', 12)}  ${pad('Voucher Δ', 16, true)}  ${pad('GL Pmt Δ (RAW)', 18, true)}  ${pad('GL Pmt Δ (DEDUP)', 18, true)}  ${pad('Computed AP (DEDUP)', 22, true)}  ${pad('TB', 14, true)}  ${pad('Drift', 14, true)}`
    );

    for (const cp of TB_CHECKPOINTS) {
      const cpDate = new Date(cp.dateIso);

      const voucherSum = await prisma.aPTransactionFact.aggregate({
        _sum: { normalizedAmount: true },
        where: {
          companyId: COMPANY_ID,
          OR: [{ apAcct: ACCOUNT_ID }, { apAcct: null }],
          eventDate: { gt: anchorDate, lte: cpDate },
        },
      });
      const voucherDelta = Number(voucherSum._sum.normalizedAmount || 0);

      const rawPmt = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
        `
        SELECT COALESCE(SUM("signedAmount"), 0) AS s
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
          AND "accountId" = $2
          AND "transDate" > $3
          AND "transDate" <= $4
          AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
        `,
        COMPANY_ID,
        ACCOUNT_ID,
        anchorDate,
        cpDate
      );
      const rawPmtDelta = -Number(rawPmt[0]?.s || 0);

      const dedupPmt = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
        `
        WITH ranked AS (
          SELECT
            "transDate",
            "accountId",
            "transNum",
            "signedAmount",
            "sourceProgram",
            "controlPeriod",
            ROW_NUMBER() OVER (
              PARTITION BY "companyId", "transDate", "accountId", "transNum"
              ORDER BY
                CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
                CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
                "createdAt" ASC
            ) AS rn
          FROM "GLTransactionFact"
          WHERE "companyId" = $1
            AND "accountId" = $2
            AND "transDate" > $3
            AND "transDate" <= $4
            AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
        )
        SELECT COALESCE(SUM("signedAmount"), 0) AS s
        FROM ranked
        WHERE rn = 1
        `,
        COMPANY_ID,
        ACCOUNT_ID,
        anchorDate,
        cpDate
      );
      const dedupPmtDelta = -Number(dedupPmt[0]?.s || 0);
      const computed = anchorBalance + voucherDelta + dedupPmtDelta;
      const drift = Number.isFinite(cp.tb) ? computed - cp.tb : null;

      console.log(
        `  ${pad(cp.label, 12)}  ${pad(fmt(voucherDelta), 16, true)}  ${pad(fmt(rawPmtDelta), 18, true)}  ${pad(
          fmt(dedupPmtDelta),
          18,
          true
        )}  ${pad(fmt(computed), 22, true)}  ${pad(Number.isFinite(cp.tb) ? fmt(cp.tb) : '-', 14, true)}  ${pad(
          drift != null ? fmt(drift) : '-',
          14,
          true
        )}`
      );
    }

    console.log('\n=== ROW-COUNT IMPACT IF DEDUPLICATION RAN ===');
    const counts = await prisma.$queryRawUnsafe<
      Array<{ total: bigint; groups: bigint; would_delete: bigint }>
    >(
      `
      WITH groups AS (
        SELECT "transDate", "accountId", "transNum", COUNT(*) AS n
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
        GROUP BY "transDate", "accountId", "transNum"
      )
      SELECT
        SUM(n)::bigint AS total,
        COUNT(*)::bigint AS groups,
        SUM(n - 1)::bigint AS would_delete
      FROM groups
      `,
      COMPANY_ID
    );
    const c = counts[0];
    console.log(`  Total rows now:                ${Number(c.total).toLocaleString()}`);
    console.log(`  Distinct logical transactions: ${Number(c.groups).toLocaleString()}`);
    console.log(`  Rows that would be deleted:    ${Number(c.would_delete).toLocaleString()}`);
    console.log(`  Rows kept after cleanup:       ${(Number(c.total) - Number(c.would_delete)).toLocaleString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
