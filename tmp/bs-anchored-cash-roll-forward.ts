/**
 * BS-ANCHORED CASH ROLL-FORWARD validator.
 *
 * Goal: prove that the 12/31/2023 cash balance + GL movements rolls forward
 * to the reported month-end checkpoints in 2026.
 *
 * Data sources:
 *   anchor       lib/financial/cash-balance-sheet-anchor.ts (12/31/2023)
 *   movements    DailyFinancialMappedLine where targetField='balance_movement:cash'
 *   parallel     GLTransactionFact (per-tx ledger; cross-check)
 *   observed     CashSnapshot (what the dashboard shows today)
 *
 * Method (per cash account, per checkpoint date D):
 *   computed_dfml(D)  = anchor_balance + Σ DFML.amount where snapshotDate in (12/31/2023, D]
 *   computed_glfact(D)= anchor_balance + Σ GLTransactionFact.signedAmount in (12/31/2023, D]
 *   observed(D)       = latest CashSnapshot.cashBalance for accountId on/<= D
 *   expected(D)       = reported month-end balance from operator
 *
 * Output: table of expected vs computed_dfml vs computed_glfact vs observed per account/checkpoint.
 *
 * Run:  npx tsx tmp/bs-anchored-cash-roll-forward.ts
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmcp278j0002kz0439rlixdj'; // prod
const ANCHOR_DATE_ISO = '2023-12-31';

// --- 12/31/2023 anchor (matches lib/financial/cash-balance-sheet-anchor.ts) ---
type Anchor = { acctId: string; name2023: string; anchorBalance: number };
const ANCHOR: Anchor[] = [
  { acctId: '10100', name2023: 'Cash - American National Bank',  anchorBalance: 11_486.31 },
  { acctId: '10150', name2023: 'Cash - FCB',                     anchorBalance: 50_000.00 },
  { acctId: '10200', name2023: 'Money Market Account',           anchorBalance: 145_530.52 },
  { acctId: '10250', name2023: '(did not exist)',                anchorBalance: 0 },
  { acctId: '10400', name2023: 'Checking - Flex Spending',       anchorBalance: 204.78 },
  { acctId: '10450', name2023: 'Flex Spending - FCB',            anchorBalance: 2_816.22 },
];

// --- Reported month-end checkpoints from operator ---
type Checkpoint = { dateIso: string; expected: Record<string, number | null> };
// null = "not reported / unknown" (skip from variance); 0 = hard expected zero.
const TREAT_BLANK_10200_AS_ZERO = true; // FLIP IF USER SAYS "UNKNOWN" INSTEAD OF "CLOSED"
const CHECKPOINTS: Checkpoint[] = [
  {
    dateIso: '2026-01-31',
    expected: {
      '10100': 94_542.62,
      '10150': 42_877.75,
      '10200': TREAT_BLANK_10200_AS_ZERO ? 0 : null,
      '10250': 2_502.03,
      '10400': 204.78,
      '10450': 4_133.29,
    },
  },
  {
    dateIso: '2026-02-28',
    expected: {
      '10100': 94_542.62,
      '10150': 59_259.67,
      '10200': TREAT_BLANK_10200_AS_ZERO ? 0 : null,
      '10250': 2_502.46,
      '10400': 204.78,
      '10450': 3_035.41,
    },
  },
  {
    dateIso: '2026-03-31',
    expected: {
      '10100': 95_680.49,
      '10150': 62_396.68,
      '10200': TREAT_BLANK_10200_AS_ZERO ? 0 : null,
      '10250': 2_502.84,
      '10400': 204.78,
      '10450': 4_259.77,
    },
  },
];

// ---------- helpers ----------
const ANCHOR_DAY_END = new Date(`${ANCHOR_DATE_ISO}T23:59:59.999Z`);
function endOfUtcDay(iso: string): Date { return new Date(`${iso}T23:59:59.999Z`); }
function fmt$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '       —';
  const sign = n < 0 ? '-' : ' ';
  return sign + Math.abs(Number(n)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(11);
}
function ts(): string { return new Date().toISOString().slice(11, 19); }

// ---------- main ----------
async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] || '(unset)');
  console.log(`Company: ${COMPANY}`);
  console.log(`Anchor:  ${ANCHOR_DATE_ISO}\n`);

  const acctIds = ANCHOR.map((a) => a.acctId);

  // ---- 1. DailyFinancialMappedLine: cumulative balance_movement:cash per account, per checkpoint
  console.log(`[${ts()}] Pulling DailyFinancialMappedLine balance_movement:cash...`);
  const dfmlRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
        COALESCE("sourceAccountId", '') AS acct_id,
        "sourceAccountName"             AS acct_name,
        "snapshotDate"::date            AS snap_day,
        SUM("amount")::float8           AS amt
       FROM "DailyFinancialMappedLine"
      WHERE "companyId" = $1
        AND "frequency" = 'daily'
        AND "targetField" = 'balance_movement:cash'
        AND "snapshotDate" > $2::timestamp
      GROUP BY 1,2,3`,
    COMPANY, ANCHOR_DAY_END
  );
  console.log(`  → ${dfmlRows.length} (acct,day) movement rows`);

  // ---- 2. GLTransactionFact: parallel cumulative per account, per checkpoint
  console.log(`[${ts()}] Pulling GLTransactionFact for cash accounts...`);
  const glRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
        "accountId"             AS acct_id,
        "accountName"           AS acct_name,
        "transDate"::date       AS tran_day,
        SUM("signedAmount")::float8 AS amt,
        COUNT(*)::int           AS n
       FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND "transDate" > $2::timestamp
        AND "accountId" = ANY($3::text[])
      GROUP BY 1,2,3`,
    COMPANY, ANCHOR_DAY_END, acctIds
  );
  console.log(`  → ${glRows.length} (acct,day) GL fact rows`);

  // ---- 3. CashSnapshot: latest per account, per checkpoint
  console.log(`[${ts()}] Pulling CashSnapshot history...`);
  const snapRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
        COALESCE("accountId", '')   AS acct_id,
        "accountName"               AS acct_name,
        "snapshotDate"::date        AS snap_day,
        "cashBalance"::float8       AS bal
       FROM "CashSnapshot"
      WHERE "companyId" = $1
        AND "frequency" = 'daily'
        AND "snapshotDate" <= $2::timestamp
      ORDER BY "snapshotDate" DESC, "createdAt" DESC`,
    COMPANY, endOfUtcDay(CHECKPOINTS[CHECKPOINTS.length - 1].dateIso)
  );
  console.log(`  → ${snapRows.length} cash snapshot rows`);

  // ---- 4. Build per-checkpoint computed values
  type CellRow = {
    acctId: string;
    acctName: string;
    anchor: number;
    expected: number | null;
    computedDfml: number;
    computedGlFact: number;
    observed: number | null;
  };

  const out: Record<string, CellRow[]> = {};
  for (const cp of CHECKPOINTS) {
    const cpEnd = endOfUtcDay(cp.dateIso);
    const rows: CellRow[] = [];
    for (const a of ANCHOR) {
      const movDfml = dfmlRows
        .filter((r) => String(r.acct_id) === a.acctId && new Date(r.snap_day) <= cpEnd)
        .reduce((s, r) => s + Number(r.amt || 0), 0);
      const movGl = glRows
        .filter((r) => String(r.acct_id) === a.acctId && new Date(r.tran_day) <= cpEnd)
        .reduce((s, r) => s + Number(r.amt || 0), 0);
      const snap = snapRows.find((r) => String(r.acct_id) === a.acctId && new Date(r.snap_day) <= cpEnd);
      const acctName =
        dfmlRows.find((r) => String(r.acct_id) === a.acctId)?.acct_name ||
        glRows.find((r) => String(r.acct_id) === a.acctId)?.acct_name ||
        snapRows.find((r) => String(r.acct_id) === a.acctId)?.acct_name ||
        a.name2023;
      rows.push({
        acctId: a.acctId,
        acctName: String(acctName || ''),
        anchor: a.anchorBalance,
        expected: cp.expected[a.acctId] ?? null,
        computedDfml: a.anchorBalance + movDfml,
        computedGlFact: a.anchorBalance + movGl,
        observed: snap ? Number(snap.bal) : null,
      });
    }
    out[cp.dateIso] = rows;
  }

  // ---- 5. Print per-checkpoint table
  for (const cp of CHECKPOINTS) {
    console.log(`\n=== ${cp.dateIso} ==============================================================`);
    console.log(
      'acct  ' +
      'name'.padEnd(34) +
      ' anchor'.padStart(13) +
      ' expected'.padStart(13) +
      ' comp(DFML)'.padStart(14) +
      ' comp(GLFact)'.padStart(15) +
      ' observed'.padStart(13) +
      ' Δexp(DFML)'.padStart(14)
    );
    let totExp = 0, totDfml = 0, totGl = 0, totObs = 0, totAnc = 0;
    let anyExpUnknown = false;
    for (const r of out[cp.dateIso]) {
      const dExp = r.expected != null ? r.computedDfml - r.expected : null;
      console.log(
        r.acctId.padEnd(6) +
        r.acctName.padEnd(34).slice(0, 34) +
        fmt$(r.anchor) +
        fmt$(r.expected) +
        fmt$(r.computedDfml) +
        fmt$(r.computedGlFact) +
        fmt$(r.observed) +
        fmt$(dExp)
      );
      totAnc += r.anchor;
      if (r.expected != null) totExp += r.expected; else anyExpUnknown = true;
      totDfml += r.computedDfml;
      totGl += r.computedGlFact;
      if (r.observed != null) totObs += r.observed;
    }
    console.log(
      'TOTAL'.padEnd(40) +
      fmt$(totAnc) +
      fmt$(anyExpUnknown ? null : totExp) +
      fmt$(totDfml) +
      fmt$(totGl) +
      fmt$(totObs) +
      fmt$(anyExpUnknown ? null : totDfml - totExp)
    );
  }

  console.log('\nLegend:');
  console.log('  comp(DFML)   = anchor + Σ DailyFinancialMappedLine.amount (balance_movement:cash) ≤ checkpoint');
  console.log('  comp(GLFact) = anchor + Σ GLTransactionFact.signedAmount on cash accountId ≤ checkpoint');
  console.log('  observed     = latest CashSnapshot.cashBalance ≤ checkpoint');
  console.log('  Δexp(DFML)   = comp(DFML) − expected   (negative = computed is BELOW reported)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
