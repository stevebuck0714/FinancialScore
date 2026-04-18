import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);

  // 1. Where did the snapshots go? Look at recent snapshot writes near Jan 2024.
  const snapsAround = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day', "snapshotDate")::date AS day,
            COUNT(*)::int AS rows,
            COALESCE(SUM("amountDueHome"),0)::float8 AS total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1 AND frequency='daily'
        AND "snapshotDate" >= '2023-12-01' AND "snapshotDate" < '2024-03-01'
      GROUP BY 1 ORDER BY 1`,
    COMPANY
  );
  console.log('\nAR snapshots Dec 2023 - Feb 2024:');
  for (const r of snapsAround) console.log(`  ${r.day.toISOString().slice(0,10)}  rows=${r.rows}  total=$${Number(r.total).toLocaleString(undefined,{maximumFractionDigits:0})}`);
  if (snapsAround.length === 0) console.log('  (none)');

  // 2. Check what AR snapshot dates exist at all in the dev DB.
  const snapDateRange = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MIN("snapshotDate") AS min_date,
            MAX("snapshotDate") AS max_date,
            COUNT(DISTINCT date_trunc('day',"snapshotDate"))::int AS distinct_days,
            COUNT(*)::int AS total_rows
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1 AND frequency='daily'`,
    COMPANY
  );
  console.log('\nAR snapshot overall coverage:');
  console.log(' ', snapDateRange[0]);

  // 3. Raw events: distribution by RecordDate year/month for the company.
  const rawDist = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('month', (payload->>'RecordDate')::timestamp)::date AS mo,
            COUNT(*)::int AS n
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND payload->>'RecordDate' IS NOT NULL
        AND (payload->>'RecordDate')::timestamp >= '2020-01-01'
      GROUP BY 1 ORDER BY 1`,
    COMPANY
  );
  console.log('\nSLArtrans raw RecordDate distribution by month:');
  for (const r of rawDist) console.log(`  ${r.mo.toISOString().slice(0,7)}  events=${r.n}`);

  // 4. Total raw count for the company SLArtrans.
  const rawTotal = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'`,
    COMPANY
  );
  console.log('\nTotal SLArtrans raw events for company:', rawTotal[0].n);

  // 5. Check the run that just completed.
  const recentRun = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, mode, "startDate", "endDate", "chunkCount", "startedAt", "finishedAt", message
       FROM "InforSyncRun"
      WHERE "companyId"=$1 AND "createdAt" > NOW() - INTERVAL '60 minutes'
      ORDER BY "createdAt" DESC LIMIT 5`,
    COMPANY
  );
  console.log('\nRuns in last 60 minutes:');
  for (const r of recentRun) console.log(' ', JSON.stringify(r));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
