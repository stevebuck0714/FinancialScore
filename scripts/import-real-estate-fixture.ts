/**
 * Dev-only loader for client-provided trial statement workbooks.
 * Usage: npx tsx scripts/import-real-estate-fixture.ts --company "BGAH Demo"
 *
 * This intentionally stages BGAH and SLN separately. It never writes a third,
 * manually-maintained "combined" source.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';

const ROOT = process.cwd();
const sources = [
  { entity: 'SLN', file: path.join(ROOT, 'docs', 'SLN import file Final.xlsx') },
  { entity: 'BGAH', file: path.join(ROOT, 'docs', 'bgah import file final.xlsx') },
];

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : '';
}

function dateFromHeader(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function classifyReport(accountType: string) {
  return /income|revenue|expense|cost of goods|cogs/i.test(accountType) ? 'ACTIVITY' : 'BALANCE';
}

async function main() {
  const companyName = arg('--company');
  if (!companyName) throw new Error('Pass the exact target company: --company "BGAH Demo"');
  const companies = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "Company" WHERE "name" = $1',
    companyName,
  );
  if (companies.length !== 1) throw new Error(`Expected exactly one company named "${companyName}", found ${companies.length}.`);
  const companyId = companies[0].id;

  // The schema migration is the normal deployment path. This permits the dev
  // fixture to run before a local migration has been applied.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateFinancialLine" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "sourceEntity" TEXT NOT NULL,
      "reportType" TEXT NOT NULL, "periodEnd" DATE NOT NULL, "accountCode" TEXT NOT NULL,
      "accountName" TEXT NOT NULL, "accountType" TEXT NOT NULL, "canonicalAccountCode" TEXT,
      "amount" NUMERIC(18,2) NOT NULL, "sourceFileName" TEXT, "sourceSheetName" TEXT,
      "sourceRowNumber" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","sourceEntity","reportType","periodEnd","accountCode")
    );
  `);

  let imported = 0;
  for (const source of sources) {
    const workbook = XLSX.readFile(source.file, { cellDates: true });
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
      const headerIndex = rows.findIndex((row) => String(row?.[0] || '').trim() === 'Acct Type' && String(row?.[1] || '').trim() === 'Acct ID');
      if (headerIndex < 0) throw new Error(`${path.basename(source.file)} / ${sheetName}: could not find Acct Type and Acct ID headers.`);
      const headers = rows[headerIndex];
      for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const accountType = String(row?.[0] || '').trim();
        const accountCode = String(row?.[1] || '').trim();
        const accountName = String(row?.[2] || '').trim();
        if (!accountType || !accountCode || !accountName) continue;
        for (let column = 3; column < headers.length; column += 1) {
          const periodEnd = dateFromHeader(headers[column]);
          const rawAmount = row[column];
          const amount = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount || '').replace(/[$,()]/g, ''));
          if (!periodEnd || !Number.isFinite(amount)) continue;
          await prisma.$executeRawUnsafe(
            `INSERT INTO "RealEstateFinancialLine"
             ("id","companyId","sourceEntity","reportType","periodEnd","accountCode","accountName","accountType","amount","sourceFileName","sourceSheetName","sourceRowNumber","updatedAt")
             VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,NOW())
             ON CONFLICT ("companyId","sourceEntity","reportType","periodEnd","accountCode")
             DO UPDATE SET "accountName"=EXCLUDED."accountName", "accountType"=EXCLUDED."accountType",
               "amount"=EXCLUDED."amount", "sourceFileName"=EXCLUDED."sourceFileName",
               "sourceSheetName"=EXCLUDED."sourceSheetName", "sourceRowNumber"=EXCLUDED."sourceRowNumber", "updatedAt"=NOW()`,
            randomUUID(), companyId, source.entity, classifyReport(accountType), periodEnd, accountCode, accountName,
            accountType, amount, path.basename(source.file), sheetName, rowIndex + 1,
          );
          imported += 1;
        }
      }
    }
  }
  console.log(`Imported ${imported} source-period lines into ${companyName} (${companyId}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
