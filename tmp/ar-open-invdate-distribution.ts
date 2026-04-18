/**
 * AR OPEN INVDATE DISTRIBUTION
 *
 * Question: For currently-open AR invoices in the Feb 27 healthy snapshot,
 * how old are they? This tells us how deep CSI re-ingest needs to go.
 *
 * If the oldest open invoice is from 2024, we need ~2.5 years of SLArtrans.
 * If from 2020, we need ~6 years. Etc.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const SNAPSHOT_DATE = process.env.SNAPSHOT_DATE || '2026-02-27';

function fmt$(n: number): string { return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }

async function main() {
  const dburl = process.env.DATABASE_URL || '';
  console.log('DB host:', dburl.replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log('Company :', COMPANY);
  console.log('Snapshot:', SNAPSHOT_DATE);
  console.log('');

  // 1. Overall InvDate range of open invoices.
  const overall = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MIN("invoiceDate") AS min_inv,
            MAX("invoiceDate") AS max_inv,
            COUNT(*)::int      AS rows,
            COALESCE(SUM("amountDueHome"),0)::float8 AS total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1
        AND frequency='daily'
        AND date_trunc('day', "snapshotDate")::date = $2::date
        AND "amountDueHome" > 0`,
    COMPANY, SNAPSHOT_DATE
  );
  console.log('Overall open InvDate range:');
  console.log('  min :', overall[0].min_inv);
  console.log('  max :', overall[0].max_inv);
  console.log('  rows:', overall[0].rows, ' total:', fmt$(Number(overall[0].total)));
  console.log('');

  // 2. Buckets by year (and "no InvDate" bucket).
  const byYear = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
        CASE WHEN "invoiceDate" IS NULL THEN 'NULL'
             ELSE EXTRACT(year FROM "invoiceDate")::text
        END AS yr,
        COUNT(*)::int AS rows,
        COALESCE(SUM("amountDueHome"),0)::float8 AS total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1
        AND frequency='daily'
        AND date_trunc('day', "snapshotDate")::date = $2::date
        AND "amountDueHome" > 0
      GROUP BY 1
      ORDER BY 1`,
    COMPANY, SNAPSHOT_DATE
  );
  const grandTotal = byYear.reduce((a, r) => a + Number(r.total), 0);
  console.log('Open dollars by InvDate year:');
  console.log('  year       rows         dollars       % of $    cumul %');
  console.log('  -----------------------------------------------------------');
  let cumul = 0;
  for (const r of byYear) {
    const pct = grandTotal > 0 ? (Number(r.total) / grandTotal) * 100 : 0;
    cumul += pct;
    console.log(
      `  ${String(r.yr).padEnd(5)}   ${String(r.rows).padStart(6)}   ${fmt$(Number(r.total)).padStart(14)}   ${pct.toFixed(1).padStart(5)}%   ${cumul.toFixed(1).padStart(5)}%`
    );
  }
  console.log('');

  // 3. Cumulative coverage thresholds: how far back to capture 95%, 99%, 100%?
  const sorted = byYear
    .filter(r => r.yr !== 'NULL')
    .sort((a, b) => Number(b.yr) - Number(a.yr)); // newest first
  let running = 0;
  const thresholds = [50, 80, 90, 95, 99, 100];
  const hits: Record<number, string | null> = Object.fromEntries(thresholds.map(t => [t, null]));
  for (const r of sorted) {
    running += Number(r.total);
    const pct = grandTotal > 0 ? (running / grandTotal) * 100 : 0;
    for (const t of thresholds) {
      if (hits[t] === null && pct >= t) hits[t] = String(r.yr);
    }
  }
  console.log('Working newest -> oldest, you cover:');
  for (const t of thresholds) {
    const yr = hits[t];
    console.log(`  ${String(t).padStart(3)}% of $ if you go back to year ${yr ?? '(unreachable)'}`);
  }

  // 4. NULL InvDate sanity check (these can't be reasoned about by year).
  const nullRow = byYear.find(r => r.yr === 'NULL');
  if (nullRow) {
    const nullPct = grandTotal > 0 ? (Number(nullRow.total) / grandTotal) * 100 : 0;
    console.log('');
    console.log(`WARN: ${nullRow.rows} open rows with NULL InvDate (${fmt$(Number(nullRow.total))}, ${nullPct.toFixed(1)}% of $). These won't be reconstructable by date filter; you'd need a non-date pull.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
