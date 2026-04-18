/* eslint-disable @typescript-eslint/no-var-requires */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const dburl = process.env.DATABASE_URL || '';
  const masked = dburl.replace(/:[^:@]*@/, ':***@');
  console.log('DATABASE_URL host:', masked.split('@')[1]?.split('/')[0] || '(none)');
  console.log('NODE_ENV:', process.env.NODE_ENV);

  const total = await prisma.aROpenInvoiceSnapshot.count({ where: { companyId: COMPANY } });
  console.log('Total AROpenInvoiceSnapshot rows for company:', total);

  // Most recent 30 distinct snapshot days regardless of age.
  const recent = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day', "snapshotDate")::date AS day,
            COUNT(*)::int AS rows_total,
            (COUNT(*) FILTER (WHERE "amountDueHome" > 0))::int AS rows_open,
            COALESCE(SUM("amountDueHome") FILTER (WHERE "amountDueHome" > 0), 0)::float8 AS open_total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1 AND frequency='daily'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 30`,
    COMPANY
  );
  console.log('\nMost recent 30 daily AR snapshots:');
  for (const row of recent) {
    console.log(
      `  ${row.day.toISOString().slice(0,10)}  rows_open=${String(row.rows_open).padStart(6)}  open_total=$${row.open_total.toLocaleString(undefined,{maximumFractionDigits:0}).padStart(14)}`
    );
  }

  // Connection state
  const conn = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, "autoSync", "updatedAt"
       FROM "AccountingConnection"
      WHERE "companyId"=$1 AND platform='INFOR_M3'`,
    COMPANY
  );
  console.log('\nINFOR_M3 connection:', JSON.stringify(conn, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
