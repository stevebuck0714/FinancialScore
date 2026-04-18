/**
 * Diagnostic: GL-derived AR balance vs snapshot-derived AR balance.
 *
 * Method:
 *  - For account 11100 (and 12000 separately) compute the daily signed-amount sum from GLTransactionFact.
 *  - Cumulative sum from earliest GL date forward (no anchor — relative-only).
 *  - Pull the snapshot total (sum of amountDueHome) for each snapshot day.
 *  - Show side-by-side movement comparison: GL-derived delta vs snapshot delta.
 *
 * If snapshot is dropping invoices, the snapshot delta will be SMALLER (or negative) compared to GL delta during invoice-heavy periods.
 */
import * as fs from 'fs';
import * as path from 'path';

(function loadDotenvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
})();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmnwyofv000fqhp4z8lebbny';

async function glMonthlyMovement(account: string) {
  // AR is an asset → positive signedAmount = debit = increases AR.
  const rows = await prisma.$queryRawUnsafe<Array<{ ym: string; n: bigint; net: number; debits: number; credits: number; ref_prefixes: string }>>(
    `WITH base AS (
       SELECT to_char("transDate",'YYYY-MM') AS ym,
              "signedAmount"::float8 AS sa,
              CASE WHEN "ref" IS NULL THEN '?' ELSE substr(upper("ref"),1,3) END AS rp
         FROM "GLTransactionFact"
         WHERE "companyId" = $1 AND "accountId" = $2
     )
     SELECT ym, COUNT(*)::bigint AS n,
            SUM(sa)::float8 AS net,
            SUM(GREATEST(sa,0))::float8 AS debits,
            SUM(LEAST(sa,0))::float8 AS credits,
            STRING_AGG(DISTINCT rp, ',') AS ref_prefixes
       FROM base GROUP BY ym ORDER BY ym`,
    CID, account
  );
  console.log(`\n=== GL movement on account ${account} (signedAmount) ===`);
  console.log('  YYYY-MM    rows      debits           credits          net              ref-prefixes');
  let cumulative = 0;
  for (const r of rows) {
    cumulative += r.net;
    const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(15);
    console.log(`  ${r.ym}  ${String(r.n).padStart(6)}  ${fmt(r.debits)}  ${fmt(r.credits)}  ${fmt(r.net)}  cum=${fmt(cumulative)}  [${r.ref_prefixes}]`);
  }
  return rows;
}

async function snapshotMonthlyTotals() {
  // Use last snapshot per month (i.e., month-end open balance) for comparison.
  const rows = await prisma.$queryRawUnsafe<Array<{ ym: string; snap_date: Date; total: number; rows: bigint }>>(
    `WITH per_day AS (
       SELECT date_trunc('day',"snapshotDate") AS d,
              SUM("amountDueHome")::float8 AS total,
              COUNT(*)::bigint AS rows
         FROM "AROpenInvoiceSnapshot"
         WHERE "companyId"=$1 AND "frequency"='daily'
         GROUP BY 1
     ),
     last_per_month AS (
       SELECT DISTINCT ON (to_char(d,'YYYY-MM')) to_char(d,'YYYY-MM') AS ym, d AS snap_date, total, rows
         FROM per_day ORDER BY to_char(d,'YYYY-MM'), d DESC
     )
     SELECT ym, snap_date, total, rows FROM last_per_month ORDER BY ym`,
    CID
  );
  console.log('\n=== AR snapshot last-day-of-month totals ===');
  console.log('  YYYY-MM  snap_date     rows      totalAR');
  for (const r of rows) {
    console.log(`  ${r.ym}  ${r.snap_date.toISOString().slice(0,10)} ${String(r.rows).padStart(8)}   $${r.total.toLocaleString('en-US',{maximumFractionDigits:0}).padStart(14)}`);
  }
  return rows;
}

async function refPrefixBreakdown(account: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ rp: string; n: bigint; net: number }>>(
    `SELECT
        CASE WHEN "ref" IS NULL THEN '(null)' ELSE substr(upper("ref"),1,3) END AS rp,
        COUNT(*)::bigint AS n,
        SUM("signedAmount")::float8 AS net
       FROM "GLTransactionFact"
       WHERE "companyId"=$1 AND "accountId"=$2
       GROUP BY 1 ORDER BY n DESC`,
    CID, account
  );
  console.log(`\n=== Ref-prefix breakdown for ${account} ===`);
  for (const r of rows) {
    console.log(`  ${r.rp.padEnd(8)} ${String(r.n).padStart(6)}  net=${r.net.toLocaleString('en-US',{maximumFractionDigits:0}).padStart(15)}`);
  }
}

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);
  console.log('Company:', CID);

  await glMonthlyMovement('11100');
  await refPrefixBreakdown('11100');
  await glMonthlyMovement('12000');
  await refPrefixBreakdown('12000');

  await snapshotMonthlyTotals();

  console.log('\n=== Interpretation guide ===');
  console.log('  Snapshot deltas should match GL net movement on the AR control account, ±cross-period drift.');
  console.log('  If snapshot delta is much LESS than GL net positive movement, snapshot is missing invoices.');
  console.log('  If snapshot delta is much MORE than GL net (or wrong direction), snapshot is missing payments.');
}

main().catch((e)=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
