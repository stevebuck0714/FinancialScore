/**
 * VERIFY JUN 30, 2023 AR SNAPSHOT vs GL ACCOUNT 11100
 *
 * The AROpenInvoiceSnapshot for 2023-06-30 shows $9.76M / 2,166 open invoices.
 * If that's accurate, we can use it as the seed and skip the raw-aggregation
 * bootstrap. To check: compare against the GL trial balance for the AR control
 * account (11100) as of 2023-06-30.
 *
 * Two checks:
 *   (1) Cumulative GL net balance for account 11100 through 2023-06-30 from
 *       GLTransactionFact (sum of debits minus credits, as-of date).
 *   (2) Compare to AROpenInvoiceSnapshot total for 2023-06-30.
 *
 * Also: spot-check the June 21-30 trajectory. If the snapshot grew steadily
 * day-by-day with reasonable carry-forward semantics, that's a positive sign
 * vs. a "cold-start" pattern where day 1 is tiny and day 2+ jumps.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';

function fmt$(n: number): string { return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log('Company:', COMPANY);

  // 0. Find the AR control account(s).
  const arAccounts = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT account, COUNT(*)::int AS txns
       FROM "GLTransactionFact"
      WHERE "companyId"=$1
        AND (account LIKE '11100%' OR account = '11100' OR account LIKE '111-%')
      GROUP BY account
      ORDER BY txns DESC
      LIMIT 10`,
    COMPANY
  );
  console.log('\nAR-like GL accounts:');
  for (const a of arAccounts) console.log(`  ${a.account}  txns=${a.txns}`);

  if (arAccounts.length === 0) {
    console.log('\nNo AR account found in GLTransactionFact. Looking at GL columns to figure out the schema...');
    const cols = await prisma.$queryRawUnsafe<any[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='GLTransactionFact' ORDER BY ordinal_position`
    );
    console.log('GLTransactionFact columns:', cols.map(c=>c.column_name).join(', '));
    return;
  }

  // 1. Pick the highest-volume one and use it as the AR control account.
  const arAcct = arAccounts[0].account;
  console.log(`\nUsing AR account: ${arAcct}`);

  // 2. Cumulative balance as of 2023-06-30 for this account.
  // Try both DistDate and TransDate to see which works.
  for (const dateField of ['"distDate"', '"transDate"', '"controlDate"']) {
    try {
      const bal = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM("debitAmount" - "creditAmount"), 0)::float8 AS net
           FROM "GLTransactionFact"
          WHERE "companyId"=$1
            AND account=$2
            AND ${dateField} <= '2023-06-30'::date`,
        COMPANY, arAcct
      );
      console.log(`  cumulative net balance (by ${dateField}) as of 2023-06-30: ${fmt$(Number(bal[0].net))}`);
    } catch (e: any) {
      console.log(`  ${dateField} not available: ${String(e.message).split('\n')[0]}`);
    }
  }

  // 3. AR snapshot total for 2023-06-30.
  const snap = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) FILTER (WHERE "amountDueHome">0)::int AS rows_open,
            COALESCE(SUM("amountDueHome") FILTER (WHERE "amountDueHome">0), 0)::float8 AS open_total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1 AND frequency='daily'
        AND date_trunc('day',"snapshotDate")::date = '2023-06-30'::date`,
    COMPANY
  );
  console.log(`\nAR snapshot 2023-06-30: ${snap[0].rows_open} rows, ${fmt$(Number(snap[0].open_total))} open`);

  // 4. Spot check trajectory of Jun 21-30.
  const trajectory = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day',"snapshotDate")::date AS day,
            COUNT(*) FILTER (WHERE "amountDueHome">0)::int AS rows_open,
            COALESCE(SUM("amountDueHome") FILTER (WHERE "amountDueHome">0), 0)::float8 AS open_total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1 AND frequency='daily'
        AND "snapshotDate" >= '2023-06-01' AND "snapshotDate" < '2023-07-15'
      GROUP BY 1 ORDER BY 1`,
    COMPANY
  );
  console.log('\nJun 2023 trajectory:');
  for (const t of trajectory) {
    console.log(`  ${t.day.toISOString().slice(0,10)}  rows=${t.rows_open}  total=${fmt$(Number(t.open_total))}`);
  }

  // 5. Are there ANY raw SLArtrans events with RecordDate <= 2023-06-30?
  const earlyRaw = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MIN((payload->>'RecordDate')::timestamp) AS min_rd,
            COUNT(*)::int AS n
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND payload->>'RecordDate' IS NOT NULL
        AND (payload->>'RecordDate')::timestamp <= '2023-06-30'`,
    COMPANY
  );
  console.log('\nSLArtrans raw events with RecordDate <= 2023-06-30:');
  console.log(' ', earlyRaw[0]);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
