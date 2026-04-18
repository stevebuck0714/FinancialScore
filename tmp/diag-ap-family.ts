/**
 * Find all "AP-family" accounts and report their net movement for the three TB intervals.
 * Goal: find which combination of accounts reconciles to $458K -> $679K -> $815K.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';

const INTERVALS = [
  { from: '2026-01-31', to: '2026-02-28', expectedDelta: 678972.12 - 458386.50 },
  { from: '2026-02-28', to: '2026-03-31', expectedDelta: 815260.86 - 678972.12 },
];

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function main() {
  console.log('=== A) Candidate AP-family accounts (30000-39999, plus any with "payable" in name) ===');
  const accts = await prisma.$queryRawUnsafe<Array<{ accountId: string; accountName: string | null; cnt: bigint; total: number | null }>>(
    `SELECT "accountId",
            MAX("accountName") AS "accountName",
            COUNT(*)::bigint AS cnt,
            COALESCE(SUM("signedAmount"),0)::float8 AS total
     FROM "GLTransactionFact"
     WHERE "companyId" = $1
       AND ( ("accountId" >= '30000' AND "accountId" < '40000')
             OR LOWER(COALESCE("accountName",'')) LIKE '%payable%'
             OR LOWER(COALESCE("accountName",'')) LIKE '%accrual%' )
     GROUP BY "accountId"
     HAVING COUNT(*) > 0
     ORDER BY "accountId"`, CID,
  );
  console.log('  acct    rows    sum(signedAmount)        name');
  for (const r of accts) {
    console.log(`  ${r.accountId.padEnd(7)} ${String(r.cnt).padStart(6)}   ${fmt(Number(r.total||0)).padStart(15)}    ${r.accountName || ''}`);
  }

  console.log('\n=== B) Per-account net movement during each TB interval (all sources, transDate) ===');
  for (const iv of INTERVALS) {
    console.log(`\n  Interval ${iv.from} -> ${iv.to}   (expected AP delta = +$${fmt(iv.expectedDelta)})`);
    const rows = await prisma.$queryRawUnsafe<Array<{ accountId: string; accountName: string | null; cnt: bigint; total: number | null }>>(
      `SELECT "accountId",
              MAX("accountName") AS "accountName",
              COUNT(*)::bigint AS cnt,
              COALESCE(SUM("signedAmount"),0)::float8 AS total
       FROM "GLTransactionFact"
       WHERE "companyId" = $1
         AND ( ("accountId" >= '30000' AND "accountId" < '40000')
               OR LOWER(COALESCE("accountName",'')) LIKE '%payable%'
               OR LOWER(COALESCE("accountName",'')) LIKE '%accrual%' )
         AND "transDate" >  $2::date
         AND "transDate" <= $3::date
       GROUP BY "accountId"
       HAVING COUNT(*) > 0
       ORDER BY ABS(COALESCE(SUM("signedAmount"),0)) DESC`,
      CID, iv.from, iv.to,
    );
    console.log('  acct    rows    sum(signedAmount)   AP delta if treated as liability  name');
    let runningDelta = 0;
    for (const r of rows) {
      const sum = Number(r.total || 0);
      const apDelta = -sum; // for liability: AP change = -sum(signedAmount)
      runningDelta += apDelta;
      console.log(`  ${r.accountId.padEnd(7)} ${String(r.cnt).padStart(6)}   ${fmt(sum).padStart(15)}   ${fmt(apDelta).padStart(15)}     ${r.accountName || ''}`);
    }
    console.log(`  ----- combined AP delta if all are liabilities: $${fmt(runningDelta)}  (target: $${fmt(iv.expectedDelta)})`);
  }

  console.log('\n=== C) Top 30100 vendor / ref activity in March 2026 (SLGLTRANS) ===');
  const refTypes = await prisma.$queryRawUnsafe<Array<{ ref_prefix: string | null; cnt: bigint; total: number | null }>>(
    `SELECT SUBSTRING(COALESCE("ref",''), 1, 3) AS ref_prefix,
            COUNT(*)::bigint AS cnt,
            COALESCE(SUM("signedAmount"),0)::float8 AS total
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = '30100'
       AND "transDate" > '2026-02-28'::date AND "transDate" <= '2026-03-31'::date
     GROUP BY 1 ORDER BY ABS(COALESCE(SUM("signedAmount"),0)) DESC`,
    CID,
  );
  for (const r of refTypes) {
    console.log(`  ref_prefix=${(r.ref_prefix || '(empty)').padEnd(6)} rows=${String(r.cnt).padStart(5)}  sum=${fmt(Number(r.total||0))}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
