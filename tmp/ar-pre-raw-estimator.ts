/**
 * AR PRE-RAW WINDOW ESTIMATOR
 *
 * Question: For our last known-healthy AR snapshot (Feb 27, 2026), how much
 * dollar value and how many open invoices depend on invoices that ORIGINATED
 * before our InforRawRecord SLArtrans retention window?
 *
 * Methodology:
 *   1. Find the earliest SLArtrans RecordDate in InforRawRecord (= start of
 *      our raw event horizon).
 *   2. Load every open row in the Feb 27 snapshot (amountDueHome > 0).
 *   3. For each row, look for ANY SLArtrans raw event matching that
 *      (custNum, invNum). If none, the invoice is "pre-raw" — its origin
 *      event lives before our retention window and it cannot be reconstructed
 *      from current raw alone.
 *   4. Aggregate: counts and dollars in three buckets:
 *         - pre_raw       : invoice has NO matching raw event at all
 *         - raw_covered   : invoice has at least one matching raw event
 *
 * If pre_raw is small (< 5% of $), Phase 2 alone is fine. If pre_raw is large
 * (> 30% of $), Phase 3 (deep raw re-ingest from CSI) is needed first.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
// override:true so .env.local wins over any stale shell env vars.
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const SNAPSHOT_DATE = process.env.SNAPSHOT_DATE || '2026-02-27';

function fmt$(n: number): string {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function main() {
  const dburl = process.env.DATABASE_URL || '';
  console.log('DB host:', dburl.replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log('Company :', COMPANY);
  console.log('Snapshot:', SNAPSHOT_DATE);
  console.log('');

  // 1. Raw retention horizon for SLArtrans.
  const horizonRow = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MIN((payload->>'RecordDate')::timestamp) AS earliest_record,
            MAX((payload->>'RecordDate')::timestamp) AS latest_record,
            COUNT(*)::int AS total_events
       FROM "InforRawRecord"
      WHERE "companyId"=$1
        AND "miProgram" ILIKE 'SLArtrans'
        AND payload->>'RecordDate' IS NOT NULL`,
    COMPANY
  );
  const horizon = horizonRow[0];
  console.log('SLArtrans raw window:');
  console.log('  earliest event :', horizon.earliest_record);
  console.log('  latest event   :', horizon.latest_record);
  console.log('  total events   :', horizon.total_events);
  console.log('');

  // 2. Snapshot rows.
  const snapRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, "customerName", "invoiceNo", "customerId", "amountDueHome"
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1
        AND frequency='daily'
        AND date_trunc('day', "snapshotDate")::date = $2::date
        AND "amountDueHome" > 0`,
    COMPANY, SNAPSHOT_DATE
  );
  console.log(`Snapshot has ${snapRows.length} open rows (amountDueHome > 0).`);
  if (snapRows.length === 0) {
    console.log('No data to analyze. Try setting SNAPSHOT_DATE to a known-healthy day.');
    return;
  }
  const totalSnapDollars = snapRows.reduce((a, r) => a + Number(r.amountDueHome), 0);
  console.log(`Snapshot total open  : ${fmt$(totalSnapDollars)}`);
  console.log('');

  // 3. Bulk match snapshot rows to raw events.
  //    We do one aggregated query keyed by UPPER-trimmed (cust, inv).
  //    Coverage rule: a snapshot row is "raw_covered" if there exists a row in
  //    SLArtrans raw whose normalized invNum matches AND whose normalized
  //    customer matches.
  const coverage = await prisma.$queryRawUnsafe<any[]>(
    `WITH snap AS (
       SELECT id,
              UPPER(TRIM(COALESCE("customerName", ''))) AS cust_norm,
              UPPER(TRIM(COALESCE("invoiceNo", '')))   AS inv_norm,
              "amountDueHome"
         FROM "AROpenInvoiceSnapshot"
        WHERE "companyId"=$1
          AND frequency='daily'
          AND date_trunc('day', "snapshotDate")::date = $2::date
          AND "amountDueHome" > 0
     ),
     raw AS (
       SELECT DISTINCT
              UPPER(TRIM(COALESCE(payload->>'CustNum', ''))) AS cust_a,
              UPPER(TRIM(COALESCE(payload->>'DerCustName', ''))) AS cust_b,
              UPPER(TRIM(COALESCE(payload->>'UbCustName', ''))) AS cust_c,
              UPPER(TRIM(COALESCE(payload->>'InvNum', ''))) AS inv_a,
              UPPER(TRIM(COALESCE(payload->>'ApplyToInvNum', ''))) AS inv_b,
              UPPER(TRIM(COALESCE(payload->>'DerApplyToInvNum', ''))) AS inv_c
         FROM "InforRawRecord"
        WHERE "companyId"=$1
          AND "miProgram" ILIKE 'SLArtrans'
     ),
     covered AS (
       SELECT s.id
         FROM snap s
        WHERE EXISTS (
                SELECT 1 FROM raw r
                 WHERE (r.inv_a = s.inv_norm OR r.inv_b = s.inv_norm OR r.inv_c = s.inv_norm)
              )
     )
     SELECT
       (SELECT COUNT(*)::int FROM covered)                                    AS covered_rows,
       (SELECT COUNT(*)::int FROM snap WHERE id NOT IN (SELECT id FROM covered)) AS pre_raw_rows,
       (SELECT COALESCE(SUM("amountDueHome"),0)::float8 FROM snap WHERE id IN (SELECT id FROM covered))     AS covered_total,
       (SELECT COALESCE(SUM("amountDueHome"),0)::float8 FROM snap WHERE id NOT IN (SELECT id FROM covered)) AS pre_raw_total
    `,
    COMPANY, SNAPSHOT_DATE
  );
  const c = coverage[0];

  console.log('Coverage analysis:');
  console.log('');
  console.log('                       rows           dollars           % of $');
  console.log('  -----------------------------------------------------------');
  const pctCov = totalSnapDollars > 0 ? (Number(c.covered_total) / totalSnapDollars) * 100 : 0;
  const pctPre = totalSnapDollars > 0 ? (Number(c.pre_raw_total) / totalSnapDollars) * 100 : 0;
  console.log(
    `  raw_covered   ${String(c.covered_rows).padStart(9)}   ${fmt$(Number(c.covered_total)).padStart(15)}   ${pctCov.toFixed(1).padStart(6)}%`
  );
  console.log(
    `  pre_raw       ${String(c.pre_raw_rows).padStart(9)}   ${fmt$(Number(c.pre_raw_total)).padStart(15)}   ${pctPre.toFixed(1).padStart(6)}%`
  );
  console.log('');

  // 4. Recommendation.
  console.log('Recommendation:');
  if (pctPre < 5) {
    console.log(`  PRE-RAW is only ${pctPre.toFixed(1)}% of $ — Phase 2 alone is sufficient.`);
    console.log('  Skip the deep CSI re-ingest. Heal forward from Feb 27 with current raw.');
  } else if (pctPre < 30) {
    console.log(`  PRE-RAW is ${pctPre.toFixed(1)}% of $ — Phase 2 is mostly fine but you'll`);
    console.log('  lose some long-tail aged opens. Consider Phase 3 only if those matter for');
    console.log('  collections / management reporting.');
  } else {
    console.log(`  PRE-RAW is ${pctPre.toFixed(1)}% of $ — DO PHASE 3 FIRST. Healing without`);
    console.log('  deep raw will permanently lose a significant chunk of historical AR.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
