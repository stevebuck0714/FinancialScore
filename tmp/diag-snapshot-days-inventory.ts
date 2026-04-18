import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);

  // Every distinct snapshot day with rows + total + a "health score" by year.
  const days = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day', "snapshotDate")::date AS day,
            COUNT(*)::int AS rows_total,
            (COUNT(*) FILTER (WHERE "amountDueHome" > 0))::int AS rows_open,
            COALESCE(SUM("amountDueHome") FILTER (WHERE "amountDueHome" > 0), 0)::float8 AS open_total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1 AND frequency='daily'
      GROUP BY 1 ORDER BY 1`,
    COMPANY
  );

  console.log(`\n${days.length} distinct snapshot days. Listing all:\n`);
  console.log('  date         rows_open    open_total      classification');
  console.log('  ---------------------------------------------------------');
  let curYear = '';
  for (const d of days) {
    const dayStr = d.day.toISOString().slice(0,10);
    const yr = dayStr.slice(0,4);
    if (yr !== curYear) { console.log(); curYear = yr; }
    const total = Number(d.open_total);
    const rows = d.rows_open;
    let classification = '';
    if (rows < 100 && total < 200_000) classification = 'TINY (likely degenerate)';
    else if (rows < 1000 && total < 2_000_000) classification = 'SMALL (probably degenerate)';
    else if (rows < 5000) classification = 'MEDIUM';
    else classification = 'LARGE (likely healthy)';
    console.log(`  ${dayStr}   ${String(rows).padStart(7)}   $${total.toLocaleString(undefined,{maximumFractionDigits:0}).padStart(13)}   ${classification}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
