/**
 * Confirm whether distDate is populated for 30100, and look at the largest
 * Feb / Mar 2026 transactions on 30100 to see if a small number of big items
 * explain the +$150K Feb / -$157K Mar mirror.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';
const ACCT = '30100';

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function main() {
  console.log('=== A) distDate population on 30100 rows ===');
  const dd = await prisma.$queryRawUnsafe<Array<{ has_dist: boolean; equal: boolean | null; cnt: bigint }>>(
    `SELECT ("distDate" IS NOT NULL) AS has_dist,
            ("distDate" = "transDate") AS equal,
            COUNT(*)::bigint AS cnt
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
     GROUP BY 1,2 ORDER BY 1,2`, CID, ACCT,
  );
  for (const r of dd) {
    console.log(`  has_distDate=${r.has_dist} equals_transDate=${String(r.equal)} : ${Number(r.cnt).toLocaleString()} rows`);
  }

  console.log('\n=== B) Top 15 Feb 2026 30100 rows by abs amount (from any source) ===');
  const feb = await prisma.$queryRawUnsafe<Array<{ transDate: Date; ref: string | null; descr: string | null; amt: number; src: string | null; transNum: string | null }>>(
    `SELECT "transDate", "ref", "description" AS descr, "signedAmount"::float8 AS amt, "sourceProgram" AS src, "transNum"
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
       AND "transDate" >  '2026-01-31'::date AND "transDate" <= '2026-02-28'::date
     ORDER BY ABS("signedAmount") DESC LIMIT 15`, CID, ACCT,
  );
  console.log('  date        amount         src        ref            transNum    description');
  for (const r of feb) {
    console.log(`  ${r.transDate.toISOString().slice(0,10)}  ${fmt(r.amt).padStart(13)}  ${String(r.src||'').padEnd(9)}  ${(r.ref||'').padEnd(13)}  ${(r.transNum||'').padEnd(10)}  ${(r.descr||'').slice(0,50)}`);
  }

  console.log('\n=== C) Top 15 Mar 2026 30100 rows by abs amount ===');
  const mar = await prisma.$queryRawUnsafe<Array<{ transDate: Date; ref: string | null; descr: string | null; amt: number; src: string | null; transNum: string | null }>>(
    `SELECT "transDate", "ref", "description" AS descr, "signedAmount"::float8 AS amt, "sourceProgram" AS src, "transNum"
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
       AND "transDate" >  '2026-02-28'::date AND "transDate" <= '2026-03-31'::date
     ORDER BY ABS("signedAmount") DESC LIMIT 15`, CID, ACCT,
  );
  console.log('  date        amount         src        ref            transNum    description');
  for (const r of mar) {
    console.log(`  ${r.transDate.toISOString().slice(0,10)}  ${fmt(r.amt).padStart(13)}  ${String(r.src||'').padEnd(9)}  ${(r.ref||'').padEnd(13)}  ${(r.transNum||'').padEnd(10)}  ${(r.descr||'').slice(0,50)}`);
  }

  console.log('\n=== D) Net by ref-prefix for Feb and Mar ===');
  for (const [from, to, label] of [['2026-01-31','2026-02-28','Feb'], ['2026-02-28','2026-03-31','Mar']] as const) {
    const x = await prisma.$queryRawUnsafe<Array<{ pfx: string; cnt: bigint; total: number }>>(
      `SELECT SUBSTRING(COALESCE("ref",''),1,3) AS pfx,
              COUNT(*)::bigint AS cnt,
              COALESCE(SUM("signedAmount"),0)::float8 AS total
       FROM "GLTransactionFact"
       WHERE "companyId" = $1 AND "accountId" = $2
         AND "transDate" > $3::date AND "transDate" <= $4::date
       GROUP BY 1 ORDER BY ABS(COALESCE(SUM("signedAmount"),0)) DESC`,
      CID, ACCT, from, to,
    );
    console.log(`  ${label}:`);
    for (const r of x) {
      console.log(`    ref=${(r.pfx||'(empty)').padEnd(6)} rows=${String(r.cnt).padStart(5)}   net=${fmt(r.total).padStart(13)}   AP-impact=${fmt(-Number(r.total)).padStart(13)}`);
    }
  }

  console.log('\n=== E) Feb 28 specifically vs Mar 1 specifically (boundary check) ===');
  const boundary = await prisma.$queryRawUnsafe<Array<{ d: Date; cnt: bigint; total: number }>>(
    `SELECT "transDate" AS d, COUNT(*)::bigint AS cnt, COALESCE(SUM("signedAmount"),0)::float8 AS total
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = $2
       AND "transDate" >= '2026-02-26'::date AND "transDate" <= '2026-03-03'::date
     GROUP BY 1 ORDER BY 1`, CID, ACCT,
  );
  for (const r of boundary) {
    console.log(`  ${r.d.toISOString().slice(0,10)}  rows=${String(r.cnt).padStart(4)}  sum=${fmt(Number(r.total))}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
