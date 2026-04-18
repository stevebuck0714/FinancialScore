/**
 * Re-validate 30100 AP roll-forward using DIFFERENT date conventions, so we can isolate
 * the timing-shift hypothesis (Feb +$150K / Mar -$157K nearly cancels).
 *
 *   M1: transDate everywhere (baseline from validate-30100-final.ts)
 *   M2: distDate when present, else transDate (pure financial date)
 *   M3: hybrid - APV/APA refs use distDate, APP refs use transDate (per user's earlier rule)
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';
const ACCT = '30100';
const ANCHOR = { date: '2026-01-31', amount: 458386.50 };
const CHECKPOINTS = [
  { date: '2026-02-28', expected: 678972.12 },
  { date: '2026-03-31', expected: 815260.86 },
];

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function sumDeltas(fromExclusive: string, toInclusive: string, dateExpr: string): Promise<{ total: number; rows: number }> {
  const r = await prisma.$queryRawUnsafe<Array<{ s: number | null; c: bigint }>>(
    `SELECT COALESCE(SUM("signedAmount"),0)::float8 AS s,
            COUNT(*)::bigint AS c
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
       AND ${dateExpr} >  $3::date
       AND ${dateExpr} <= $4::date`,
    CID, ACCT, fromExclusive, toInclusive,
  );
  return { total: Number(r[0]?.s || 0), rows: Number(r[0]?.c || 0n) };
}

async function sumDeltasHybrid(fromExclusive: string, toInclusive: string): Promise<{ total: number; rows: number; appRows: number; appSum: number; apvRows: number; apvSum: number }> {
  // APV/APA -> use distDate when available (financial date); APP -> use transDate.
  // Anything without classifiable ref defaults to transDate.
  const r = await prisma.$queryRawUnsafe<Array<{ s: number | null; c: bigint; appS: number | null; appC: bigint; apvS: number | null; apvC: bigint }>>(
    `WITH classed AS (
       SELECT
         CASE WHEN "ref" LIKE 'APV%' OR "ref" LIKE 'APA%'
              THEN COALESCE("distDate", "transDate")
              ELSE "transDate"
         END AS effectiveDate,
         CASE WHEN "ref" LIKE 'APP%' THEN 'APP'
              WHEN "ref" LIKE 'APV%' THEN 'APV'
              WHEN "ref" LIKE 'APA%' THEN 'APA'
              ELSE 'OTH' END AS cls,
         "signedAmount"
       FROM "GLTransactionFact"
       WHERE "companyId" = $1 AND "accountId" = $2
     )
     SELECT
       COALESCE(SUM("signedAmount"),0)::float8 AS s,
       COUNT(*)::bigint AS c,
       COALESCE(SUM(CASE WHEN cls='APP' THEN "signedAmount" END),0)::float8 AS "appS",
       COUNT(*) FILTER (WHERE cls='APP')::bigint AS "appC",
       COALESCE(SUM(CASE WHEN cls IN ('APV','APA') THEN "signedAmount" END),0)::float8 AS "apvS",
       COUNT(*) FILTER (WHERE cls IN ('APV','APA'))::bigint AS "apvC"
     FROM classed
     WHERE effectiveDate >  $3::date AND effectiveDate <= $4::date`,
    CID, ACCT, fromExclusive, toInclusive,
  );
  return {
    total: Number(r[0]?.s || 0),
    rows: Number(r[0]?.c || 0n),
    appRows: Number(r[0]?.appC || 0n), appSum: Number(r[0]?.appS || 0),
    apvRows: Number(r[0]?.apvC || 0n), apvSum: Number(r[0]?.apvS || 0),
  };
}

async function runMethod(label: string, computeDeltas: (from: string, to: string) => Promise<{ total: number; rows: number; extra?: string }>) {
  console.log(`\n=== ${label} ===`);
  console.log(`  Anchor ${ANCHOR.date}: $${fmt(ANCHOR.amount)}`);
  let runningAP = ANCHOR.amount;
  let prev = ANCHOR.date;
  for (const cp of CHECKPOINTS) {
    const { total, rows, extra } = await computeDeltas(prev, cp.date);
    const computed = runningAP - total;
    const gap = computed - cp.expected;
    console.log(`  ${prev} -> ${cp.date}:`);
    console.log(`    rows=${rows.toLocaleString()}, sum(signedAmount)=$${fmt(total)}${extra ? '  ' + extra : ''}`);
    console.log(`    computed AP = $${fmt(computed)}   expected $${fmt(cp.expected)}   gap $${fmt(gap)} (${((gap/cp.expected)*100).toFixed(2)}%)`);
    runningAP = cp.expected; // re-anchor between intervals
    prev = cp.date;
  }
}

async function main() {
  await runMethod('M1: transDate everywhere', async (f, t) => {
    const { total, rows } = await sumDeltas(f, t, '"transDate"');
    return { total, rows };
  });

  await runMethod('M2: distDate when present, else transDate', async (f, t) => {
    const { total, rows } = await sumDeltas(f, t, 'COALESCE("distDate","transDate")');
    return { total, rows };
  });

  await runMethod('M3: hybrid (APV/APA -> distDate, APP/other -> transDate)', async (f, t) => {
    const r = await sumDeltasHybrid(f, t);
    return { total: r.total, rows: r.rows, extra: `(APP: ${r.appRows} rows / $${fmt(r.appSum)} ; APV/APA: ${r.apvRows} rows / $${fmt(r.apvSum)})` };
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
