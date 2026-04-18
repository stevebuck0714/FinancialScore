/**
 * AR snapshot health diagnostic (dev DB, no raw records available).
 *
 * Answers:
 *  1. Snapshot-frequency timeline: how many snapshots per month? Is there a Jan 2026 cliff like SLLedgers?
 *  2. sourceProgram distribution in AROpenInvoiceSnapshot — which CSI feed actually filled this table?
 *  3. invoiceDate vs snapshotDate offset histogram — does invoiceDate look like a financial date (broad dist) or like RecordDate clustered near snapshot date?
 *  4. Latest snapshot totals (totalAR, count, customer count) — sanity check.
 *  5. Open invoice list diversity: how many distinct invoices, customers, and any obvious duplicates.
 *  6. Cross-check: sum of latest open snapshot vs GLTransactionFact balance for candidate AR control accounts.
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

async function snapshotMonthlyCadence() {
  const rows = await prisma.$queryRawUnsafe<Array<{ ym: string; n: bigint; days: bigint; total_ar: number }>>(
    `SELECT
        to_char("snapshotDate",'YYYY-MM') AS ym,
        COUNT(*)::bigint AS n,
        COUNT(DISTINCT date_trunc('day',"snapshotDate"))::bigint AS days,
        COALESCE(SUM("amountDueHome"),0)::float8 AS total_ar
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId" = $1
         AND "frequency" = 'daily'
       GROUP BY 1
       ORDER BY 1`,
    CID
  );
  console.log('\n=== AROpenInvoiceSnapshot monthly cadence (daily freq) ===');
  console.log('  YYYY-MM        rows      days_covered    sum_amountDueHome');
  for (const r of rows) {
    console.log(`  ${r.ym}   ${String(r.n).padStart(8)}   ${String(r.days).padStart(8)}        ${r.total_ar.toLocaleString('en-US',{maximumFractionDigits:0}).padStart(15)}`);
  }
}

async function sourceProgramDist() {
  const rows = await prisma.$queryRawUnsafe<Array<{ sp: string | null; n: bigint }>>(
    `SELECT "sourceProgram" AS sp, COUNT(*)::bigint AS n
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId" = $1
       GROUP BY 1
       ORDER BY n DESC`,
    CID
  );
  console.log('\n=== AROpenInvoiceSnapshot.sourceProgram distribution ===');
  for (const r of rows) console.log(`  ${(r.sp||'(null)').padEnd(36)} ${String(r.n).padStart(10)}`);
}

async function invoiceDateOffsetHistogram() {
  // For latest snapshot date, how is (snapshotDate - invoiceDate) distributed?
  // If invoiceDate is properly the financial invoice date, distribution should span months/years.
  // If invoiceDate equals RecordDate (operational), it tends to cluster heavily near snapshotDate.
  const latest = await prisma.aROpenInvoiceSnapshot.findFirst({
    where: { companyId: CID, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return;
  console.log(`\n=== Age-of-invoice histogram on latest snapshot ${latest.snapshotDate.toISOString().slice(0,10)} ===`);
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
       WHERE "companyId" = $1
         AND "frequency" = 'daily'
         AND date_trunc('day',"snapshotDate") = date_trunc('day',$2::timestamp)
         AND COALESCE("amountDueHome",0) > 0
     )
     SELECT bucket, COUNT(*)::bigint AS n, COALESCE(SUM(due),0)::float8 AS due
       FROM base
       GROUP BY bucket
       ORDER BY bucket`,
    CID, latest.snapshotDate
  );
  for (const r of rows) console.log(`  ${r.bucket.padEnd(20)} ${String(r.n).padStart(8)} rows   $${r.due.toLocaleString('en-US',{maximumFractionDigits:0}).padStart(15)}`);
}

async function latestSnapshotSummary() {
  const latest = await prisma.aROpenInvoiceSnapshot.findFirst({
    where: { companyId: CID, frequency: 'daily', amountDueHome: { gt: 0 } },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return;
  console.log(`\n=== Latest open snapshot summary (${latest.snapshotDate.toISOString().slice(0,10)}) ===`);
  const r = await prisma.$queryRawUnsafe<Array<{ rows: bigint; cust: bigint; inv: bigint; total: number; pos: bigint; neg: bigint }>>(
    `SELECT
        COUNT(*)::bigint AS rows,
        COUNT(DISTINCT COALESCE("customerId","customerName"))::bigint AS cust,
        COUNT(DISTINCT "invoiceNo")::bigint AS inv,
        COALESCE(SUM("amountDueHome"),0)::float8 AS total,
        COUNT(*) FILTER (WHERE "amountDueHome" > 0)::bigint AS pos,
        COUNT(*) FILTER (WHERE "amountDueHome" < 0)::bigint AS neg
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "frequency"='daily'
         AND date_trunc('day',"snapshotDate") = date_trunc('day',$2::timestamp)`,
    CID, latest.snapshotDate
  );
  const x = r[0];
  console.log(`  rows=${x.rows}  customers=${x.cust}  distinctInvoices=${x.inv}  positiveRows=${x.pos}  negativeRows=${x.neg}`);
  console.log(`  totalAR  = $${x.total.toLocaleString('en-US',{maximumFractionDigits:2})}`);
}

async function arControlAccountsInGL() {
  // Find candidate AR control accounts on this DB.
  const accts = await prisma.$queryRawUnsafe<Array<{ accountId: string; accountName: string|null; n: bigint; firstD: Date; lastD: Date }>>(
    `SELECT "accountId","accountName", COUNT(*)::bigint AS n,
            MIN("transDate") AS "firstD", MAX("transDate") AS "lastD"
       FROM "GLTransactionFact"
       WHERE "companyId"=$1
         AND ("accountId" LIKE '11%' OR "accountId" LIKE '12%' OR LOWER("accountName") LIKE '%receivable%')
       GROUP BY 1,2
       ORDER BY n DESC
       LIMIT 30`,
    CID
  );
  console.log('\n=== Candidate AR control accounts in GLTransactionFact ===');
  for (const r of accts) {
    console.log(`  ${r.accountId.padEnd(8)} ${(r.accountName||'').padEnd(40)} ${String(r.n).padStart(8)}  ${r.firstD?.toISOString().slice(0,10)} → ${r.lastD?.toISOString().slice(0,10)}`);
  }
}

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);
  console.log('Company:', CID);
  await snapshotMonthlyCadence();
  await sourceProgramDist();
  await latestSnapshotSummary();
  await invoiceDateOffsetHistogram();
  await arControlAccountsInGL();
}

main().catch((e)=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
