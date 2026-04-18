/**
 * RAW AGGREGATION AS OF 2023-12-31
 *
 * Computes "what would Jan 1, 2024 open AR look like if we built it by
 * aggregating all currently-ingested SLArtrans raw events with
 * RecordDate <= 2023-12-31?"
 *
 * Method: per (cust, inv_key), sum signed amounts:
 *   - Type='I'  (invoice)        → +amount
 *   - Type='P'  (payment)        → -amount
 *   - Type='C'  (credit memo)    → -amount
 *   - Type='CR' (cash receipt)   → -amount
 *   - other types                → +amount (signed as-is)
 *
 * Open = positive net.
 *
 * Compare the printed RAW open total against the user's 12/31/2023 balance
 * sheet AR figure to determine if our raw is sufficient to bootstrap.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const AS_OF = process.env.AS_OF || '2023-12-31';

function fmt$(n: number): string { return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log('Company:', COMPANY, ' AS_OF:', AS_OF, '\n');

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
  console.log(`Raw window used: ${horizon[0].min_rd?.toISOString().slice(0,10)} → ${AS_OF}`);
  console.log(`Total events in window: ${horizon[0].n}\n`);

  // Per-type breakdown (sanity check).
  const byType = await prisma.$queryRawUnsafe<any[]>(
    `SELECT UPPER(COALESCE(payload->>'Type','?')) AS typ,
            COUNT(*)::int AS n,
            COALESCE(SUM(ABS((payload->>'Amount')::float8)), 0)::float8 AS abs_sum
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND (payload->>'RecordDate')::timestamp <= ($2::date + INTERVAL '1 day')
      GROUP BY 1 ORDER BY 1`,
    COMPANY, AS_OF
  );
  console.log('Events by Type (within window):');
  for (const t of byType) console.log(`  ${String(t.typ).padEnd(4)}  events=${String(t.n).padStart(6)}  |sum amt|=${fmt$(Number(t.abs_sum))}`);

  // Main aggregation.
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
              CASE WHEN UPPER(typ)='I'  THEN  ABS(amount)
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
       COUNT(*)::int                                     AS distinct_invoices,
       (COUNT(*) FILTER (WHERE net > 0.005))::int        AS open_invoices,
       (COUNT(*) FILTER (WHERE ABS(net) <= 0.005))::int  AS settled_invoices,
       (COUNT(*) FILTER (WHERE net < -0.005))::int       AS overpaid_invoices,
       COALESCE(SUM(net) FILTER (WHERE net > 0.005), 0)::float8 AS open_total,
       COALESCE(SUM(net), 0)::float8                              AS net_total
     FROM per_invoice`,
    COMPANY, AS_OF
  );
  const r = rawAgg[0];
  console.log('\n=== RAW BOOTSTRAP CANDIDATE FOR 1/1/2024 ===');
  console.log(`  distinct invoices seen : ${r.distinct_invoices}`);
  console.log(`  OPEN invoices          : ${r.open_invoices}`);
  console.log(`  settled invoices       : ${r.settled_invoices}`);
  console.log(`  overpaid invoices      : ${r.overpaid_invoices}`);
  console.log(`  OPEN TOTAL ($)         : ${fmt$(Number(r.open_total))}`);
  console.log(`  NET TOTAL  ($)         : ${fmt$(Number(r.net_total))}`);
  console.log('\n=> Compare OPEN TOTAL above to your 12/31/2023 balance sheet AR.');
  console.log('   If close (within ~5%): we can bootstrap from existing raw, no new ingest needed.');
  console.log('   If RAW < BS by > 5%: we need to ingest more pre-Aug-2023 raw.');
  console.log('   If RAW > BS by > 5%: data quality issue (over-counting somewhere).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
