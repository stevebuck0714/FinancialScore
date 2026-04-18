/**
 * Delete the 18 degenerate AR snapshots written by the Jan 2024 probe run.
 * They contain only the invoices anchored within the Jan 2024 raw slice
 * (no carry-forward seed possible because Dec 2023 snapshot doesn't exist),
 * so each day shows ~$1.4M of opens vs. expected $40M+. Keeping them around
 * would corrupt any future trend chart and confuse downstream analysis.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('DB host:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').split('@')[1]?.split('/')[0]);
  console.log('Company :', COMPANY);

  const before = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day', "snapshotDate")::date AS day,
            COUNT(*)::int AS rows,
            COALESCE(SUM("amountDueHome"),0)::float8 AS total
       FROM "AROpenInvoiceSnapshot"
      WHERE "companyId"=$1
        AND frequency='daily'
        AND "snapshotDate" >= '2024-01-01' AND "snapshotDate" < '2024-02-01'
      GROUP BY 1 ORDER BY 1`,
    COMPANY
  );
  console.log('\nBEFORE delete:');
  for (const r of before) {
    console.log(`  ${r.day.toISOString().slice(0,10)}  rows=${r.rows}  total=$${Number(r.total).toLocaleString(undefined,{maximumFractionDigits:0})}`);
  }
  const totalRowsBefore = before.reduce((a, r) => a + r.rows, 0);
  console.log(`  -> total rows to delete: ${totalRowsBefore}`);

  if (process.argv.includes('--dry-run')) {
    console.log('\n(dry run) Skipping delete. Pass without --dry-run to actually delete.');
    return;
  }

  const deleted = await prisma.aROpenInvoiceSnapshot.deleteMany({
    where: {
      companyId: COMPANY,
      frequency: 'daily',
      snapshotDate: { gte: new Date('2024-01-01T00:00:00Z'), lt: new Date('2024-02-01T00:00:00Z') },
    },
  });
  console.log(`\nDeleted ${deleted.count} rows.`);

  const after = await prisma.aROpenInvoiceSnapshot.count({
    where: {
      companyId: COMPANY,
      frequency: 'daily',
      snapshotDate: { gte: new Date('2024-01-01T00:00:00Z'), lt: new Date('2024-02-01T00:00:00Z') },
    },
  });
  console.log(`AFTER  delete: ${after} rows remain in Jan 2024 window.`);

  // Note: we intentionally KEEP the InforRawRecord SLArtrans events from this
  // run — they're real ingested data and will be useful when we do the proper
  // historical rebuild later. Only the degenerate snapshots are junk.
  const rawCount = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND payload->>'RecordDate' IS NOT NULL
        AND (payload->>'RecordDate')::timestamp >= '2024-01-01'
        AND (payload->>'RecordDate')::timestamp <  '2024-02-01'`,
    COMPANY
  );
  console.log(`\nKEPT (NOT deleted): ${rawCount[0].n} SLArtrans raw events for Jan 2024 — these are reusable for the proper rebuild.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
