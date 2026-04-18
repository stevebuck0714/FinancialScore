/**
 * Where do the 30100 SLLedgers rows actually live?
 * And: are SLLedgers Feb/Mar 2026 rows being dedup-suppressed against SLGLTRANS rows
 * that have the SAME unique key but DIFFERENT amounts?
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';
const ACCT = '30100';

async function main() {
  console.log('=== A) GLTransactionFact 30100 by year-month and source (transDate) ===');
  const fact = await prisma.$queryRawUnsafe<Array<{ ym: string; src: string | null; cnt: bigint; total: number | null }>>(
    `SELECT to_char(date_trunc('month', "transDate"), 'YYYY-MM') AS ym,
            "sourceProgram" AS src,
            COUNT(*)::bigint AS cnt,
            COALESCE(SUM("signedAmount"), 0)::float8 AS total
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
     GROUP BY 1, 2
     ORDER BY 1 DESC, 2`, CID, ACCT,
  );
  console.log('  ym       src          rows      sum(signedAmount)');
  for (const r of fact.slice(0, 40)) {
    console.log(`  ${r.ym}  ${String(r.src).padEnd(10)} ${String(r.cnt).padStart(7)}   ${Number(r.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)}`);
  }

  console.log('\n=== B) RAW SLLedgers payloads for 30100 by year-month (TransDate) ===');
  const raw = await prisma.$queryRawUnsafe<Array<{ ym: string; cnt: bigint; total: number | null }>>(
    `WITH src AS (
       SELECT
         (payload->>'TransDate') AS td,
         (payload->>'Acct')      AS acct,
         COALESCE(NULLIF(payload->>'DomAmount','')::float8, 0) AS amt
       FROM "InforRawRecord"
       WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
     )
     SELECT to_char(date_trunc('month',
              to_date(substring(td,1,8),'YYYYMMDD')),
              'YYYY-MM') AS ym,
            COUNT(*)::bigint AS cnt,
            COALESCE(SUM(amt),0)::float8 AS total
     FROM src
     WHERE acct = $2 AND td IS NOT NULL AND td <> ''
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 24`,
    CID, ACCT,
  );
  console.log('  ym       rows      sum(DomAmount)');
  for (const r of raw) {
    console.log(`  ${r.ym}   ${String(r.cnt).padStart(7)}   ${Number(r.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)}`);
  }

  console.log('\n=== C) Conflicts: SLLedgers raw rows in Feb/Mar 2026 30100 vs existing GLTransactionFact unique key ===');
  const conflicts = await prisma.$queryRawUnsafe<Array<{
    matched: boolean; cnt: bigint;
    sum_raw: number | null; sum_fact: number | null;
  }>>(
    `WITH src AS (
       SELECT
         to_date(substring(payload->>'TransDate',1,8),'YYYYMMDD') AS td,
         payload->>'Acct'  AS acct,
         payload->>'TransNum' AS transnum,
         payload->>'Ref'   AS ref,
         payload->>'Description' AS descr,
         COALESCE(NULLIF(payload->>'DomAmount','')::float8, 0) AS amt
       FROM "InforRawRecord"
       WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
     )
     SELECT EXISTS (
       SELECT 1 FROM "GLTransactionFact" g
       WHERE g."companyId" = $1
         AND g."accountId" = src.acct
         AND g."transDate" = src.td
         AND COALESCE(g."transNum",'') = COALESCE(src.transnum,'')
         AND COALESCE(g."ref",'') = COALESCE(src.ref,'')
         AND COALESCE(g."description",'') = COALESCE(src.descr,'')
     ) AS matched,
     COUNT(*)::bigint AS cnt,
     SUM(src.amt)::float8 AS sum_raw,
     NULL::float8 AS sum_fact
     FROM src
     WHERE src.acct = $2
       AND src.td >= '2026-02-01'::date
       AND src.td <  '2026-04-01'::date
     GROUP BY matched
     ORDER BY matched DESC`,
    CID, ACCT,
  );
  console.log('  matched_in_fact?  rows   sum(SLLedgers DomAmount)');
  for (const r of conflicts) {
    console.log(`  ${String(r.matched).padEnd(15)} ${String(r.cnt).padStart(6)}   ${Number(r.sum_raw || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)}`);
  }

  console.log('\n=== D) For each Feb/Mar 30100 SLLedgers raw row that matched a fact row, compare SLLedgers DomAmount vs fact signedAmount ===');
  const compare = await prisma.$queryRawUnsafe<Array<{
    same_amt: boolean; cnt: bigint; sum_diff: number | null;
  }>>(
    `WITH src AS (
       SELECT
         to_date(substring(payload->>'TransDate',1,8),'YYYYMMDD') AS td,
         payload->>'Acct'  AS acct,
         payload->>'TransNum' AS transnum,
         payload->>'Ref'   AS ref,
         payload->>'Description' AS descr,
         COALESCE(NULLIF(payload->>'DomAmount','')::float8, 0) AS amt
       FROM "InforRawRecord"
       WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
     ),
     joined AS (
       SELECT src.amt AS raw_amt, g."signedAmount" AS fact_amt, g."sourceProgram" AS fact_src
       FROM src
       JOIN "GLTransactionFact" g
         ON g."companyId" = $1
        AND g."accountId" = src.acct
        AND g."transDate" = src.td
        AND COALESCE(g."transNum",'') = COALESCE(src.transnum,'')
        AND COALESCE(g."ref",'') = COALESCE(src.ref,'')
        AND COALESCE(g."description",'') = COALESCE(src.descr,'')
       WHERE src.acct = $2
         AND src.td >= '2026-02-01'::date
         AND src.td <  '2026-04-01'::date
     )
     SELECT (ABS(raw_amt - fact_amt) < 0.005) AS same_amt,
            COUNT(*)::bigint AS cnt,
            SUM(raw_amt - fact_amt)::float8 AS sum_diff
     FROM joined
     GROUP BY 1
     ORDER BY 1`,
    CID, ACCT,
  );
  console.log('  same_amount?  rows   sum(rawDom - factSigned)');
  for (const r of compare) {
    console.log(`  ${String(r.same_amt).padEnd(13)} ${String(r.cnt).padStart(6)}   ${Number(r.sum_diff || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
