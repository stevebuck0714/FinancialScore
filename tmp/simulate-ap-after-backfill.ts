/**
 * Compare AP roll-forward results BEFORE and AFTER the apAcct backfill +
 * read-side fix. READ-ONLY.
 *
 *   OLD (read-side `OR apAcct=null`)  -- includes 818 unmatched synthetic vouchers
 *   NEW (read-side strict `apAcct=$ACCT`) -- only matched vouchers
 *
 * Payment side is identical (now uses dedup'd GL since the dedup migration ran).
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
    if (!anchor) { console.error('No anchor config'); return; }
    const acct = anchor.accounts.find((a) => a.accountId === ACCOUNT_ID);
    if (!acct) { console.error(`No anchor for ${ACCOUNT_ID}`); return; }
    const anchorDate = new Date(`${anchor.anchorDateIso}T12:00:00.000Z`);
    const anchorBalance = acct.apBalance;

    console.log(`DB:      ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    console.log(`Company: ${COMPANY_ID}`);
    console.log(`Account: ${ACCOUNT_ID}, Anchor: ${anchor.anchorDateIso} = $${fmt(anchorBalance)}\n`);

    console.log('=== AP roll-forward against TB ===');
    console.log(
      `  ${pad('Checkpoint', 12)}  ${pad('Vouchers OLD', 14, true)}  ${pad('Vouchers NEW', 14, true)}  ${pad('Pmt Δ', 14, true)}  ${pad('Computed OLD', 16, true)}  ${pad('Computed NEW', 16, true)}  ${pad('TB', 14, true)}  ${pad('Drift OLD', 12, true)}  ${pad('Drift NEW', 12, true)}`
    );

    for (const cp of TB_CHECKPOINTS) {
      const cpDate = new Date(cp.dateIso);

      // OLD: include rows where apAcct = $1 OR apAcct IS NULL
      const oldVoucher = await prisma.aPTransactionFact.aggregate({
        _sum: { normalizedAmount: true },
        where: {
          companyId: COMPANY_ID,
          OR: [{ apAcct: ACCOUNT_ID }, { apAcct: null }],
          eventDate: { gt: anchorDate, lte: cpDate },
        },
      });
      const oldDelta = Number(oldVoucher._sum.normalizedAmount || 0);

      // NEW: strict apAcct = $1
      const newVoucher = await prisma.aPTransactionFact.aggregate({
        _sum: { normalizedAmount: true },
        where: {
          companyId: COMPANY_ID,
          apAcct: ACCOUNT_ID,
          eventDate: { gt: anchorDate, lte: cpDate },
        },
      });
      const newDelta = Number(newVoucher._sum.normalizedAmount || 0);

      // Payment side (unchanged): GL APP/APA on the AP account.
      const pmt = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
        `SELECT COALESCE(SUM("signedAmount"), 0) AS s
         FROM "GLTransactionFact"
         WHERE "companyId" = $1 AND "accountId" = $2
           AND "transDate" > $3 AND "transDate" <= $4
           AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')`,
        COMPANY_ID, ACCOUNT_ID, anchorDate, cpDate
      );
      const pmtDelta = -Number(pmt[0]?.s || 0);

      const computedOld = anchorBalance + oldDelta + pmtDelta;
      const computedNew = anchorBalance + newDelta + pmtDelta;
      const driftOld = computedOld - cp.tb;
      const driftNew = computedNew - cp.tb;

      console.log(
        `  ${pad(cp.label, 12)}  ${pad(fmt(oldDelta), 14, true)}  ${pad(fmt(newDelta), 14, true)}  ${pad(fmt(pmtDelta), 14, true)}  ${pad(fmt(computedOld), 16, true)}  ${pad(fmt(computedNew), 16, true)}  ${pad(fmt(cp.tb), 14, true)}  ${pad(fmt(driftOld), 12, true)}  ${pad(fmt(driftNew), 12, true)}`
      );
    }

    console.log('\n=== APTransactionFact apAcct distribution (post-backfill) ===');
    const dist = await prisma.$queryRawUnsafe<Array<{ ap: string; n: bigint; sum: number }>>(
      `SELECT COALESCE("apAcct", '(NULL)') AS ap,
              COUNT(*)::bigint AS n,
              SUM("normalizedAmount")::float8 AS sum
       FROM "APTransactionFact"
       WHERE "companyId" = $1
       GROUP BY "apAcct" ORDER BY n DESC`,
      COMPANY_ID
    );
    for (const r of dist) {
      console.log(`  ${pad(r.ap, 15)}  rows=${pad(String(Number(r.n)), 6, true)}  sum=${pad(fmt(Number(r.sum)), 16, true)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
