/**
 * EXPERIMENT: Can we reconstruct Feb 27 open AR from the raw event journal?
 *
 * Theory: each business_day_backfill task only sees a slice of SLArtrans, and the
 * transform compensates with priorOpenKeys carry-forward. When prior is broken, the
 * cascade breaks the day too. But the raw events ARE in InforRawRecord.
 *
 * If we aggregate ALL InforRawRecord SLArtrans events with RecordDate <= Feb 27 and
 * compute net open balance per invoice, we should get back ~19832 rows / $42.4M (the
 * existing healthy Feb 27 snapshot).
 *
 * Outcome:
 *   ✓ MATCH (within ~5%)  → raw data is sufficient; Phase 2 = deep rebuild from raw.
 *   ✗ MISMATCH            → SLArtrans drops closed invoices; need additional data source.
 */
import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmnwyofv000fqhp4z8lebbny';
const TARGET = '2026-02-27';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);
  console.log(`Target date: ${TARGET}`);

  // Step 1: existing Feb 27 snapshot (the "ground truth")
  console.log('\n=== Existing Feb 27 snapshot (ground truth) ===');
  const truth = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS rows, SUM("amountDueHome")::float8 AS total
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND frequency='daily'
         AND date_trunc('day',"snapshotDate")::date = $2::date
         AND "amountDueHome" > 0`, CID, TARGET);
  console.log(`  rows=${truth[0]?.rows}  total=$${(truth[0]?.total||0).toLocaleString()}`);

  // Step 2: how many SLArtrans raw events do we have ingested?
  console.log('\n=== Raw SLArtrans inventory ===');
  const inv = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n,
            MIN((payload->>'RecordDate')::timestamp) AS min_record_date,
            MAX((payload->>'RecordDate')::timestamp) AS max_record_date
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'`, CID);
  console.log(`  total rows: ${inv[0]?.n}`);
  console.log(`  RecordDate range: ${inv[0]?.min_record_date?.toISOString().slice(0,10)} → ${inv[0]?.max_record_date?.toISOString().slice(0,10)}`);

  // Step 3: count distinct events with RecordDate <= Feb 27
  console.log(`\n=== Events with RecordDate <= ${TARGET} ===`);
  const events = await prisma.$queryRawUnsafe<any[]>(
    `SELECT (payload->>'Type') AS type, COUNT(*)::int AS n
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
         AND (payload->>'RecordDate')::timestamp <= ($2::date + INTERVAL '1 day')
       GROUP BY type ORDER BY n DESC LIMIT 20`, CID, TARGET);
  for (const r of events) console.log(`  Type=${(r.type||'(null)').padEnd(8)} ${r.n}`);

  // Step 4: deep reconstruction — sum net per invoice using ApplyToInvNum or InvNum
  // Invoice anchor (Type='I' or unknown that's positive) → invNum = InvNum
  // Payment/credit reduction → maps to ApplyToInvNum (the invoice it's paying)
  console.log(`\n=== Deep reconstruction: net open balance per invoice as of ${TARGET} ===`);
  const reconstructed = await prisma.$queryRawUnsafe<any[]>(
    `WITH events AS (
       SELECT
         payload,
         (payload->>'Type') AS typ,
         COALESCE(NULLIF(TRIM(payload->>'CustNum'),''), payload->>'DerCustNoName') AS cust,
         UPPER(TRIM(COALESCE(payload->>'InvNum', ''))) AS native_inv,
         UPPER(TRIM(COALESCE(payload->>'ApplyToInvNum', payload->>'DerApplyToInvNum', ''))) AS apply_inv,
         (payload->>'Amount')::float8 AS amount,
         (payload->>'RecordDate')::timestamp AS rec_date
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
         AND (payload->>'RecordDate')::timestamp <= ($2::date + INTERVAL '1 day')
     ),
     scored AS (
       SELECT
         cust,
         CASE
           WHEN UPPER(typ)='I' THEN native_inv
           WHEN apply_inv <> '' THEN apply_inv
           ELSE native_inv
         END AS inv_key,
         CASE
           WHEN UPPER(typ)='I' THEN ABS(amount)
           WHEN UPPER(typ)='P' THEN -ABS(amount)
           WHEN UPPER(typ)='C' THEN -ABS(amount)
           WHEN UPPER(typ)='CR' THEN -ABS(amount)
           ELSE amount
         END AS signed_amt
       FROM events
       WHERE amount IS NOT NULL AND amount <> 0
     ),
     per_invoice AS (
       SELECT cust, inv_key, SUM(signed_amt) AS net
         FROM scored
         WHERE inv_key <> '' AND inv_key <> '0'
         GROUP BY cust, inv_key
     )
     SELECT
       (COUNT(*) FILTER (WHERE net > 0.005))::int AS open_invoices,
       (COUNT(*) FILTER (WHERE ABS(net) <= 0.005))::int AS settled_invoices,
       (COUNT(*) FILTER (WHERE net < -0.005))::int AS overpaid_invoices,
       COALESCE(SUM(net) FILTER (WHERE net > 0.005), 0)::float8 AS open_total
     FROM per_invoice`, CID, TARGET);
  const r = reconstructed[0] || {};
  console.log(`  open_invoices    = ${r.open_invoices}    (truth: ${truth[0]?.rows})`);
  console.log(`  settled_invoices = ${r.settled_invoices}`);
  console.log(`  overpaid         = ${r.overpaid_invoices}`);
  console.log(`  open_total       = $${(r.open_total||0).toLocaleString()}    (truth: $${(truth[0]?.total||0).toLocaleString()})`);

  const rowRatio = truth[0]?.rows ? r.open_invoices / truth[0].rows : 0;
  const totalRatio = truth[0]?.total ? r.open_total / truth[0].total : 0;
  console.log(`\n  Reconstruction is ${(rowRatio*100).toFixed(1)}% of truth by rows, ${(totalRatio*100).toFixed(1)}% by $`);
  if (rowRatio >= 0.85 && totalRatio >= 0.85) {
    console.log('  ✓ HYPOTHESIS CONFIRMED — raw events are sufficient for deep rebuild.');
  } else if (rowRatio >= 0.5) {
    console.log('  ◐ PARTIAL — raw events recover most but not all; investigate gap.');
  } else {
    console.log('  ✗ HYPOTHESIS REJECTED — raw events alone cannot reconstruct historical truth.');
    console.log('    Likely reason: SLArtrans does not retain closed invoices, OR ingest is incomplete.');
  }

  // Step 5: as a sanity check, look at one healthy invoice from Feb 27 snapshot
  // and see if its events are in raw
  console.log('\n=== Sanity check: pick a top-$ Feb 27 invoice, look it up in raw ===');
  const top = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "invoiceNo", "customerName", "customerId", "amountDueHome"
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND frequency='daily'
         AND date_trunc('day',"snapshotDate")::date = $2::date
         AND "amountDueHome" > 0
       ORDER BY "amountDueHome" DESC LIMIT 1`, CID, TARGET);
  const t = top[0];
  if (!t) { console.log('  (no top invoice)'); return; }
  console.log(`  Snapshot says: invoice ${t.invoiceNo} for ${t.customerName} — open $${Number(t.amountDueHome).toLocaleString()}`);
  const raw = await prisma.$queryRawUnsafe<any[]>(
    `SELECT (payload->>'Type') AS typ, (payload->>'RecordDate') AS rd,
            (payload->>'Amount')::float8 AS amt, (payload->>'UbOpening')::float8 AS open_now,
            (payload->>'InvNum') AS inv, (payload->>'ApplyToInvNum') AS apply_inv
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
         AND (payload->>'InvNum' = $3 OR payload->>'ApplyToInvNum' = $3)
       ORDER BY (payload->>'RecordDate') LIMIT 10`, CID, TARGET, t.invoiceNo);
  if (raw.length === 0) console.log(`  ⚠ NO raw events found for invoice ${t.invoiceNo} — that explains the gap`);
  for (const ev of raw) {
    console.log(`    Type=${(ev.typ||'?').padEnd(3)} RecordDate=${ev.rd?.slice(0,10)}  Amount=${ev.amt}  UbOpening=${ev.open_now}  inv=${ev.inv}  apply=${ev.apply_inv}`);
  }
}
main().catch(e=>{console.error(e); process.exitCode=1;}).finally(()=>prisma.$disconnect());
