/**
 * Validate AP roll-forward for account 30100 against three TB checkpoints.
 *
 *   2026-01-31  $458,386.50  (anchor)
 *   2026-02-28  $678,972.12  (target)
 *   2026-03-31  $815,260.86  (target)
 *
 * Sign convention for AP (liability, natural credit):
 *   AP_t = AP_{t-1} - SUM(signedAmount)
 *   credit -> negative signedAmount -> increases AP
 *   debit  -> positive signedAmount -> decreases AP
 *
 * Date convention:
 *   Use TransDate for company/account-level roll-forward (per user spec for APP batches).
 *   We do not allocate APP back to voucher DistDate.
 *
 * Three scenarios are reported so we can see source coverage impact:
 *   A) SLLedgers only       (the proposed new primary)
 *   B) SLLedgers + SLGLTRANS (union with table-level dedup already done by unique key)
 *   C) SLGLTRANS only        (the previous primary, baseline for the gap)
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';
const ACCT = '30100';

const ANCHOR = { date: '2026-01-31', amount: 458386.50 };
const CHECKPOINTS: Array<{ date: string; expected: number }> = [
  { date: '2026-02-28', expected: 678972.12 },
  { date: '2026-03-31', expected: 815260.86 },
];

async function sumDeltas(fromDateExclusive: string, toDateInclusive: string, sourceFilter: string): Promise<number> {
  // sourceFilter is a SQL fragment; safe because we control the values below.
  const r = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
    `SELECT COALESCE(SUM("signedAmount"), 0)::float8 AS s
     FROM "GLTransactionFact"
     WHERE "companyId" = $1
       AND "accountId" = $2
       AND "transDate" >  $3::date
       AND "transDate" <= $4::date
       ${sourceFilter}`,
    CID, ACCT, fromDateExclusive, toDateInclusive,
  );
  return Number(r[0]?.s || 0);
}

async function rowCount(fromDateExclusive: string, toDateInclusive: string, sourceFilter: string): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*)::bigint AS c
     FROM "GLTransactionFact"
     WHERE "companyId" = $1
       AND "accountId" = $2
       AND "transDate" >  $3::date
       AND "transDate" <= $4::date
       ${sourceFilter}`,
    CID, ACCT, fromDateExclusive, toDateInclusive,
  );
  return Number(r[0]?.c || 0n);
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function runScenario(label: string, sourceFilter: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`  filter: ${sourceFilter || '(all sources)'}`);
  console.log(`  Anchor ${ANCHOR.date}: $${fmt(ANCHOR.amount)} (assumed correct)`);
  let runningAP = ANCHOR.amount;
  let prevDate = ANCHOR.date;
  for (const cp of CHECKPOINTS) {
    const sumDelta = await sumDeltas(prevDate, cp.date, sourceFilter);
    const rows = await rowCount(prevDate, cp.date, sourceFilter);
    const computed = runningAP - sumDelta;
    const gap = computed - cp.expected;
    const gapPct = (gap / cp.expected) * 100;
    console.log(`  ${prevDate} -> ${cp.date}:`);
    console.log(`    sum(signedAmount) over ${rows.toLocaleString()} GL rows = $${fmt(sumDelta)}`);
    console.log(`    computed AP = $${fmt(runningAP)} - ($${fmt(sumDelta)}) = $${fmt(computed)}`);
    console.log(`    expected    = $${fmt(cp.expected)}`);
    console.log(`    gap         = $${fmt(gap)}  (${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}%)`);
    runningAP = cp.expected; // re-anchor at each checkpoint so each interval is judged independently
    prevDate = cp.date;
  }
}

async function main() {
  const head = await prisma.$queryRawUnsafe<Array<{ db: string; cnt: bigint }>>(
    `SELECT current_database() AS db,
            (SELECT COUNT(*)::bigint FROM "GLTransactionFact"
              WHERE "companyId" = $1 AND "accountId" = $2) AS cnt`,
    CID, ACCT,
  );
  console.log(`DB=${head[0].db}  GLTransactionFact rows for ${CID}/${ACCT} (all sources): ${Number(head[0].cnt).toLocaleString()}`);

  const bySrc = await prisma.$queryRawUnsafe<Array<{ sourceProgram: string | null; cnt: bigint }>>(
    `SELECT "sourceProgram", COUNT(*)::bigint AS cnt
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
     GROUP BY "sourceProgram" ORDER BY cnt DESC`,
    CID, ACCT,
  );
  console.log('Breakdown by sourceProgram:');
  for (const r of bySrc) {
    console.log(`  ${String(r.sourceProgram || '(null)').padEnd(20)} ${Number(r.cnt).toLocaleString().padStart(10)}`);
  }

  await runScenario('Scenario A: SLLedgers only',           `AND "sourceProgram" = 'SLLedgers'`);
  await runScenario('Scenario B: SLLedgers + SLGLTRANS',    `AND "sourceProgram" IN ('SLLedgers','SLGLTRANS')`);
  await runScenario('Scenario C: SLGLTRANS only (baseline)', `AND "sourceProgram" = 'SLGLTRANS'`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
