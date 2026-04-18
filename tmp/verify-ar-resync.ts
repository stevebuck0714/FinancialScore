/**
 * Run AFTER an AR resync to verify the missing days got filled in.
 *
 * Checks:
 *  1. Per-day row counts in the target window (was each day actually rebuilt to a healthy count?).
 *  2. Latest snapshot total vs the prior healthy total (e.g., Feb 27 was $42M; latest after resync should be similar).
 *  3. Aging histogram: should now look healthy (most $$ in current/0-30d, not 91-180d).
 *  4. Snapshot delta vs GL net movement on 11100 for the resynced months — should match within a few %.
 *
 * Usage: edit START / END below, then `npx tsx tmp/verify-ar-resync.ts`
 */
import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmnwyofv000fqhp4z8lebbny';

// EDIT THESE for the window you just resynced
const START = '2025-12-01';
const END   = '2026-04-15';

// Threshold below which a day is considered "incomplete" (median healthy ~17K)
const HEALTHY_MIN_ROWS = 5000;

async function perDayCounts() {
  console.log(`\n=== Per-day row counts for ${START} → ${END} ===`);
  const rows = await prisma.$queryRawUnsafe<Array<{ d: Date; rows: bigint; total: number }>>(
    `SELECT date_trunc('day',"snapshotDate") AS d,
            COUNT(*)::bigint AS rows,
            SUM("amountDueHome")::float8 AS total
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "frequency"='daily'
         AND "snapshotDate" >= $2::timestamp
         AND "snapshotDate" <= $3::timestamp
       GROUP BY 1 ORDER BY 1`,
    CID, START, END
  );
  let healthy = 0, broken = 0, missing = 0;
  const dayMap = new Map(rows.map(r => [r.d.toISOString().slice(0,10), r]));
  // Walk every business day in the window and report
  const start = new Date(START);
  const end = new Date(END);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate()+1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    const key = d.toISOString().slice(0,10);
    const r = dayMap.get(key);
    if (!r) {
      console.log(`  ${key}  (no snapshot)                                            ⚠ MISSING`);
      missing++;
    } else {
      const rowCount = Number(r.rows);
      const status = rowCount >= HEALTHY_MIN_ROWS ? '✓' : '⚠ INCOMPLETE';
      if (rowCount >= HEALTHY_MIN_ROWS) healthy++; else broken++;
      console.log(`  ${key}  rows=${String(rowCount).padStart(6)}  total=$${(r.total||0).toLocaleString('en-US',{maximumFractionDigits:0}).padStart(13)}  ${status}`);
    }
  }
  console.log(`\n  SUMMARY: ${healthy} healthy, ${broken} incomplete, ${missing} missing (weekdays only in window)`);
}

async function latestVsBenchmark() {
  // Find latest snapshot, compare row count and total to the last known healthy snapshot pre-resync.
  console.log('\n=== Latest snapshot vs last-known-healthy benchmark ===');
  const latest = await prisma.$queryRawUnsafe<Array<{ d: Date; rows: bigint; total: number }>>(
    `SELECT date_trunc('day',"snapshotDate") AS d, COUNT(*)::bigint AS rows, SUM("amountDueHome")::float8 AS total
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "frequency"='daily'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 1`,
    CID
  );
  const benchmark = { date: '2026-02-27', rows: 19832, total: 42_458_620 };
  if (latest[0]) {
    const r = latest[0];
    console.log(`  Latest:    ${r.d.toISOString().slice(0,10)}  rows=${r.rows}  total=$${(r.total||0).toLocaleString('en-US')}`);
    console.log(`  Benchmark: ${benchmark.date}  rows=${benchmark.rows}  total=$${benchmark.total.toLocaleString('en-US')}  (last known healthy)`);
    const rowsRatio = Number(r.rows) / benchmark.rows;
    const totalRatio = (r.total||0) / benchmark.total;
    console.log(`  Latest is ${(rowsRatio*100).toFixed(1)}% of benchmark by rows, ${(totalRatio*100).toFixed(1)}% by $`);
    if (rowsRatio < 0.5) console.log('  ⚠ Latest snapshot still looks incomplete.');
    else console.log('  ✓ Latest snapshot looks healthy.');
  }
}

async function agingHistogram() {
  const latest = await prisma.aROpenInvoiceSnapshot.findFirst({
    where: { companyId: CID, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return;
  console.log(`\n=== Aging histogram on latest snapshot ${latest.snapshotDate.toISOString().slice(0,10)} ===`);
  const rows = await prisma.$queryRawUnsafe<Array<{ bucket: string; n: bigint; due: number }>>(
    `WITH base AS (
       SELECT
         CASE
           WHEN "invoiceDate" IS NULL THEN 'null'
           WHEN "snapshotDate"::date - "invoiceDate"::date <= 0 THEN '0-future-or-today'
           WHEN "snapshotDate"::date - "invoiceDate"::date <= 30 THEN '1-30 d'
           WHEN "snapshotDate"::date - "invoiceDate"::date <= 60 THEN '31-60 d'
           WHEN "snapshotDate"::date - "invoiceDate"::date <= 90 THEN '61-90 d'
           WHEN "snapshotDate"::date - "invoiceDate"::date <= 180 THEN '91-180 d'
           WHEN "snapshotDate"::date - "invoiceDate"::date <= 365 THEN '181-365 d'
           ELSE '365+ d'
         END AS bucket,
         "amountDueHome" AS due
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId" = $1 AND "frequency" = 'daily'
         AND date_trunc('day',"snapshotDate") = date_trunc('day',$2::timestamp)
         AND COALESCE("amountDueHome",0) > 0
     )
     SELECT bucket, COUNT(*)::bigint AS n, COALESCE(SUM(due),0)::float8 AS due
       FROM base GROUP BY bucket ORDER BY bucket`,
    CID, latest.snapshotDate
  );
  let total = 0;
  for (const r of rows) total += r.due;
  for (const r of rows) {
    const pct = total ? (r.due/total*100).toFixed(1) : '0';
    console.log(`  ${r.bucket.padEnd(20)} ${String(r.n).padStart(6)} rows  $${r.due.toLocaleString('en-US',{maximumFractionDigits:0}).padStart(13)}  (${pct}%)`);
  }
  console.log(`  Healthy AR usually has most $ in current/1-30d, not 91-180d.`);
}

async function glVsSnapshot() {
  console.log('\n=== GL net movement on 11100 vs snapshot month-end totals ===');
  const gl = await prisma.$queryRawUnsafe<Array<{ ym:string; net: number }>>(
    `SELECT to_char("transDate",'YYYY-MM') AS ym, SUM("signedAmount")::float8 AS net
       FROM "GLTransactionFact"
       WHERE "companyId"=$1 AND "accountId"='11100'
       GROUP BY 1 ORDER BY 1`, CID);
  const snap = await prisma.$queryRawUnsafe<Array<{ ym:string; total: number }>>(
    `WITH per_day AS (
       SELECT date_trunc('day',"snapshotDate") AS d, SUM("amountDueHome")::float8 AS total
         FROM "AROpenInvoiceSnapshot"
         WHERE "companyId"=$1 AND "frequency"='daily'
         GROUP BY 1
     ),
     last_per_month AS (
       SELECT DISTINCT ON (to_char(d,'YYYY-MM')) to_char(d,'YYYY-MM') AS ym, total
         FROM per_day ORDER BY to_char(d,'YYYY-MM'), d DESC
     )
     SELECT ym, total FROM last_per_month ORDER BY ym`, CID);
  const snapMap = new Map(snap.map(r => [r.ym, r.total]));
  let cum = 0;
  console.log('  YYYY-MM   gl_net           gl_cumulative    snapshot_eom_total');
  for (const r of gl) {
    cum += r.net;
    const sn = snapMap.get(r.ym);
    const fmt = (n: number|undefined) => n==null ? '—' : ('$'+n.toLocaleString('en-US',{maximumFractionDigits:0}));
    console.log(`  ${r.ym}   ${fmt(r.net).padStart(15)}  ${fmt(cum).padStart(15)}  ${fmt(sn).padStart(15)}`);
  }
}

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);
  console.log(`Verification window: ${START} → ${END}`);
  await perDayCounts();
  await latestVsBenchmark();
  await agingHistogram();
  await glVsSnapshot();
}

main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
