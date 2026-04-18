/**
 * BOOTSTRAP TARGET (12/31/2023 BS) vs WHAT WE CAN BUILD FROM RAW
 *
 * Computes two numbers and reports the gap:
 *
 *  TARGET = GL trial balance for AR control account 11100 as of 2023-12-31
 *           (cumulative debits - credits through that date).
 *
 *  RAW    = Open AR computed by aggregating all currently-ingested SLArtrans
 *           events with RecordDate <= 2023-12-31. For each (cust, inv) pair,
 *           sum signed amounts (I=+, P/C/CR=-). Open = positive net.
 *
 * If TARGET ≈ RAW: our raw is sufficient to bootstrap Jan 1, 2024.
 * If TARGET >> RAW: we're missing invoices that originated before our raw
 *                   window (Aug 2023). Need to ingest more raw OR find another
 *                   way to seed those invoices.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const AS_OF = process.env.AS_OF || '2023-12-31';

function fmt$(n: number): string {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log('Company:', COMPANY, ' AS_OF:', AS_OF);

  // === TARGET: GL trial balance for AR control account ===
  // Find AR-like accounts.
  const arAccounts = await prisma.$queryRawUnsafe<any[]>(
    `SELECT account, COUNT(*)::int AS txns,
            COALESCE(SUM("debitAmount" - "creditAmount"), 0)::float8 AS net_lifetime
       FROM "GLTransactionFact"
      WHERE "companyId"=$1
        AND (account LIKE '11100%' OR account LIKE '111-%' OR account LIKE '1110%')
      GROUP BY account
      ORDER BY txns DESC
      LIMIT 10`,
    COMPANY
  );
  console.log('\nAR-like GL accounts:');
  for (const a of arAccounts) console.log(`  ${a.account}  txns=${a.txns}  lifetime_net=${fmt$(Number(a.net_lifetime))}`);

  // Try multiple date columns to find the one that exists.
  const cols = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='GLTransactionFact'`
  );
  const colNames = new Set(cols.map(c => c.column_name as string));
  console.log('\nAvailable date columns on GLTransactionFact:',
    ['distDate','transDate','controlDate','recordDate','postingDate'].filter(c => colNames.has(c)).join(', '));

  if (arAccounts.length === 0) {
    console.log('\nNo AR account found. Aborting GL portion.');
  } else {
    const arAcct = arAccounts[0].account;
    console.log(`\nUsing AR account: ${arAcct}`);
    // Try each date column we have.
    for (const dateCol of ['distDate','transDate','controlDate','recordDate','postingDate']) {
      if (!colNames.has(dateCol)) continue;
      const bal = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM("debitAmount" - "creditAmount"), 0)::float8 AS net,
                COUNT(*)::int AS n_txns
           FROM "GLTransactionFact"
          WHERE "companyId"=$1 AND account=$2
            AND "${dateCol}" <= $3::date`,
        COMPANY, arAcct, AS_OF
      );
      console.log(`  TARGET (by ${dateCol}) cumulative through ${AS_OF}: ${fmt$(Number(bal[0].net))} (${bal[0].n_txns} txns)`);
    }
  }

  // === RAW: aggregate raw SLArtrans events ===
  console.log('\nRaw SLArtrans aggregate (RecordDate <= ' + AS_OF + '):');
  const rawAgg = await prisma.$queryRawUnsafe<any[]>(
    `WITH events AS (
       SELECT
         (payload->>'Type') AS typ,
         COALESCE(NULLIF(TRIM(payload->>'CustNum'), ''), payload->>'DerCustNoName') AS cust,
         UPPER(TRIM(COALESCE(payload->>'InvNum', ''))) AS native_inv,
         UPPER(TRIM(COALESCE(payload->>'ApplyToInvNum', payload->>'DerApplyToInvNum', ''))) AS apply_inv,
         (payload->>'Amount')::float8 AS amount
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
         AND payload->>'RecordDate' IS NOT NULL
         AND (payload->>'RecordDate')::timestamp <= ($2::date + INTERVAL '1 day')
     ),
     scored AS (
       SELECT cust,
              CASE WHEN UPPER(typ)='I' THEN native_inv
                   WHEN apply_inv <> ''  THEN apply_inv
                   ELSE native_inv
              END AS inv_key,
              CASE WHEN UPPER(typ)='I' THEN ABS(amount)
                   WHEN UPPER(typ) IN ('P','C','CR') THEN -ABS(amount)
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
       COUNT(*)::int                                    AS distinct_invoices_seen,
       (COUNT(*) FILTER (WHERE net > 0.005))::int       AS open_invoices,
       (COUNT(*) FILTER (WHERE ABS(net) <= 0.005))::int AS settled_invoices,
       (COUNT(*) FILTER (WHERE net < -0.005))::int      AS overpaid_invoices,
       COALESCE(SUM(net) FILTER (WHERE net > 0.005), 0)::float8 AS open_total,
       COALESCE(SUM(net), 0)::float8                              AS net_total
     FROM per_invoice`,
    COMPANY, AS_OF
  );
  const r = rawAgg[0];
  console.log(`  distinct invoices seen : ${r.distinct_invoices_seen}`);
  console.log(`  open invoices          : ${r.open_invoices}`);
  console.log(`  settled invoices       : ${r.settled_invoices}`);
  console.log(`  overpaid invoices      : ${r.overpaid_invoices}`);
  console.log(`  RAW open total         : ${fmt$(Number(r.open_total))}`);
  console.log(`  RAW net total          : ${fmt$(Number(r.net_total))}`);

  // What raw is available at all?
  const horizon = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MIN((payload->>'RecordDate')::timestamp) AS min_rd,
            MAX((payload->>'RecordDate')::timestamp) AS max_rd,
            COUNT(*)::int AS n
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND payload->>'RecordDate' IS NOT NULL
        AND (payload->>'RecordDate')::timestamp <= ($2::date + INTERVAL '1 day')`,
    COMPANY, AS_OF
  );
  console.log(`\nRaw window used: ${horizon[0].min_rd?.toISOString().slice(0,10)} → ${AS_OF}  (${horizon[0].n} events)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
