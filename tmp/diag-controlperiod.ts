/**
 * Test the ControlPeriod hypothesis: TB closing balances are derived from
 * fiscal period stamps in CSI, not transDate ranges.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';
const ACCT = '30100';

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function main() {
  console.log('=== A) controlPeriod/controlYear population on 30100 rows ===');
  const pop = await prisma.$queryRawUnsafe<Array<{ src: string | null; has_cp: boolean; cnt: bigint }>>(
    `SELECT "sourceProgram" AS src,
            ("controlPeriod" IS NOT NULL AND "controlYear" IS NOT NULL) AS has_cp,
            COUNT(*)::bigint AS cnt
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
     GROUP BY 1, 2 ORDER BY 1, 2`, CID, ACCT,
  );
  for (const r of pop) {
    console.log(`  src=${String(r.src||'').padEnd(10)} has_controlPeriod=${r.has_cp}  ${Number(r.cnt).toLocaleString()} rows`);
  }

  console.log('\n=== B) For SLLedgers rows, distribution of (controlYear, controlPeriod) ===');
  const dist = await prisma.$queryRawUnsafe<Array<{ y: number | null; p: number | null; cnt: bigint; total: number }>>(
    `SELECT "controlYear" AS y, "controlPeriod" AS p,
            COUNT(*)::bigint AS cnt, COALESCE(SUM("signedAmount"),0)::float8 AS total
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
       AND "sourceProgram" = 'SLLedgers'
     GROUP BY 1,2 ORDER BY 1 DESC NULLS LAST, 2 DESC NULLS LAST LIMIT 40`, CID, ACCT,
  );
  for (const r of dist) {
    console.log(`  ${String(r.y).padStart(4)} P${String(r.p).padStart(2)}  rows=${String(r.cnt).padStart(5)}  sum=${fmt(Number(r.total))}`);
  }

  console.log('\n=== C) Look directly at SLLedgers RAW payload for ControlPeriod field for 30100 Feb/Mar 2026 ===');
  const raw = await prisma.$queryRawUnsafe<Array<{ td: string | null; cp: string | null; cy: string | null; amt: string | null }>>(
    `SELECT payload->>'TransDate' AS td,
            payload->>'ControlPeriod' AS cp,
            payload->>'ControlYear' AS cy,
            payload->>'DomAmount' AS amt
     FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
       AND payload->>'Acct' = $2
       AND payload->>'TransDate' >= '20260201'
       AND payload->>'TransDate' <  '20260401'
     ORDER BY payload->>'TransDate'
     LIMIT 30`, CID, ACCT,
  );
  console.log('  TransDate         CtrlYr CtrlPd  DomAmount');
  for (const r of raw) {
    console.log(`  ${(r.td||'').padEnd(18)} ${(r.cy||'').padStart(6)} ${(r.cp||'').padStart(6)}  ${r.amt}`);
  }

  console.log('\n=== D) GLAcctPeriodBalances: Do we have explicit period-end balances for 30100? ===');
  // Check if the table exists and has data
  try {
    const bal = await prisma.$queryRawUnsafe<Array<{ y: number; p: number; periodEnd: number | null; net: number | null; cnt: bigint }>>(
      `SELECT
         (payload->>'ControlYear')::int AS y,
         (payload->>'ControlPeriod')::int AS p,
         COALESCE(NULLIF(payload->>'PeriodEndBalance','')::float8,
                  NULLIF(payload->>'PeriodBalance','')::float8,
                  NULLIF(payload->>'YtdBalance','')::float8) AS "periodEnd",
         COALESCE(NULLIF(payload->>'PeriodNet','')::float8,
                  NULLIF(payload->>'PeriodActivity','')::float8) AS net,
         COUNT(*)::bigint AS cnt
       FROM "InforRawRecord"
       WHERE "companyId" = $1
         AND "miProgram" = 'GLAcctPeriodBalances'
         AND payload->>'Acct' = $2
       GROUP BY 1,2,3,4 ORDER BY 1,2 LIMIT 30`, CID, ACCT,
    );
    if (bal.length === 0) {
      const anyRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
        `SELECT COUNT(*)::bigint AS cnt FROM "InforRawRecord"
         WHERE "companyId" = $1 AND "miProgram" = 'GLAcctPeriodBalances'`, CID,
      );
      console.log(`  No GLAcctPeriodBalances rows for 30100 (total program rows: ${Number(anyRows[0].cnt).toLocaleString()}).`);
      // Show one sample payload to see what fields exist
      const sample = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(
        `SELECT payload FROM "InforRawRecord"
         WHERE "companyId" = $1 AND "miProgram" = 'GLAcctPeriodBalances' LIMIT 1`, CID,
      );
      if (sample[0]) {
        console.log('  Sample payload keys:', Object.keys(sample[0].payload));
      }
    } else {
      for (const r of bal) {
        console.log(`  ${r.y} P${String(r.p).padStart(2)}  periodEnd=${r.periodEnd ?? '(null)'}  net=${r.net ?? '(null)'}  rows=${r.cnt}`);
      }
    }
  } catch (err) {
    console.log('  GLAcctPeriodBalances query error:', err instanceof Error ? err.message : String(err));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
