/**
 * Loads non-PII Benn's Grant source data into a development company.
 *
 * Usage:
 *   npx tsx scripts/import-benns-grant-operating-data.ts --company "BGAH Demo"
 *   npx tsx scripts/import-benns-grant-operating-data.ts --dry-run true   (parse only, no database)
 *
 * Source rules:
 * - Excel financial statements are the source of record for monthly SLN actuals/budgets and balances.
 * - The Cash Flow Summary block at the top of each income statement is the SLN cash flow statement.
 * - Only workbooks inside a month folder are read; loose files in a year folder are working copies.
 * - VHDA operating summaries supply apartment metrics and lender-reporting metrics.
 * - Cash trackers supply dated receipts, owner funding, and vendor disbursements.
 * - Tenant-, resident-, and employee-level rows are excluded.
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';
import {
  numberValue, periodFromReport, slnActivityLines, slnBalanceLines, slnCashFlowLines, slnLegalEntity, statementKind, text,
} from '../lib/real-estate/sln-statement-parser';

dotenv.config({ path: '.env.local' });

const SOURCE_ROOT = 'C:/Users/steve/Dropbox/New Corelytics/CUSTOMERS/Benns Grant';
const FINANCIAL_ROOTS = [
  '2024 SLN MONTHLY FINANCIALS',
  '2025 SLN MONTHLY FINANCIALS',
  '2026 SLN MONTHLY FINANCIALS',
];
const prisma = new PrismaClient();

type FinancialKind = 'ACTIVITY' | 'BALANCE';
type FinancialCandidate = {
  file: string;
  sheet: string;
  periodEnd: string;
  kind: FinancialKind;
  rows: unknown[][];
  rank: number;
};

type Metric = { metric: string; value: number; unit?: string; sourceReference: string };
type Summary = Record<string, number>;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : Promise.resolve([path.join(directory, entry.name)])
  )));
  return nested.flat();
}

function workbookRows(file: string, sheet: string): unknown[][] {
  const workbook = XLSX.readFile(file, { cellDates: true });
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: null, raw: true });
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function sourceRef(file: string, sheet: string, row: number): string {
  return `${path.relative(SOURCE_ROOT, file).replace(/\\/g, '/')}#${sheet}:R${row}`;
}

function sourceRank(file: string): number {
  const value = file.toLowerCase();
  return (value.includes('prior') ? -100 : 0) + (value.includes('updated') ? 100 : 0) + (value.includes('5.15.26 version') ? 80 : 0);
}

function inMonthFolder(file: string): boolean {
  const parts = file.split(/[\\/]/);
  const rootIndex = parts.findIndex((part) => /\b20\d\d\s+SLN\s+MONTHLY\s+FINANCIALS\b/i.test(part));
  return rootIndex >= 0 && parts.length >= rootIndex + 3 && !path.basename(file).startsWith('~$');
}

function periodFromPath(file: string): string | null {
  const parts = file.split(/[\\/]/);
  const rootIndex = parts.findIndex((part) => /\b20\d\d\s+SLN\s+MONTHLY\s+FINANCIALS\b/i.test(part));
  if (rootIndex < 0 || parts.length < rootIndex + 3) return null;
  const yearMatch = parts[rootIndex].match(/\b(20\d\d)\b/);
  const folder = parts[rootIndex + 1] || '';
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const numericMonth = folder.match(/\b(0?[1-9]|1[0-2])\b/);
  const namedMonth = monthNames.findIndex((month) => new RegExp(`\\b${month.slice(0, 3)}`, 'i').test(folder));
  const month = numericMonth ? Number(numericMonth[1]) : namedMonth + 1;
  if (!yearMatch || !month) return null;
  return `${yearMatch[1]}-${String(month).padStart(2, '0')}-${String(new Date(Number(yearMatch[1]), month, 0).getDate()).padStart(2, '0')}`;
}

async function eachBatch<T>(items: T[], handler: (item: T) => Promise<unknown>, size = 20) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(handler));
  }
}

function identifyFinancialWorkbook(file: string): FinancialCandidate[] {
  const workbook = XLSX.readFile(file, { cellDates: true });
  const output: FinancialCandidate[] = [];
  for (const sheet of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: null, raw: true });
    const kind = statementKind(path.basename(file), rows);
    const periodEnd = periodFromPath(file) || periodFromReport(rows);
    if (kind && periodEnd) output.push({ file, sheet, rows, periodEnd, kind, rank: sourceRank(file) });
  }
  return output;
}

async function upsertFinancialLine(input: {
  companyId: string; reportType: string; periodEnd: string; accountCode: string; accountName: string;
  accountType: string; amount: number; file: string; sheet: string; row: number;
}) {
  const legalEntity = slnLegalEntity(input.accountName);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RealEstateFinancialLine"
      ("id","companyId","sourceEntity","legalEntity","reportType","periodEnd","accountCode","accountName","accountType","amount","sourceFileName","sourceSheetName","sourceRowNumber","updatedAt")
     VALUES ($1,$2,'SLN',$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT ("companyId","sourceEntity","reportType","periodEnd","accountCode")
     DO UPDATE SET "accountName"=EXCLUDED."accountName","accountType"=EXCLUDED."accountType","amount"=EXCLUDED."amount",
       "legalEntity"=EXCLUDED."legalEntity","sourceFileName"=EXCLUDED."sourceFileName","sourceSheetName"=EXCLUDED."sourceSheetName","sourceRowNumber"=EXCLUDED."sourceRowNumber","updatedAt"=NOW()`,
    randomUUID(), input.companyId, legalEntity, input.reportType, input.periodEnd, input.accountCode, input.accountName,
    input.accountType, input.amount, path.basename(input.file), input.sheet, input.row,
  );
}

async function ensureSourcedOperatingTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateAccountMapping" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "financialFeed" TEXT NOT NULL,
      "accountCode" TEXT NOT NULL, "accountName" TEXT NOT NULL, "accountType" TEXT NOT NULL,
      "targetField" TEXT NOT NULL, "bookTreatment" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE ("companyId","financialFeed","accountCode")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateCashActivity" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "periodEnd" DATE NOT NULL, "activityDate" DATE,
      "activityType" TEXT NOT NULL, "counterparty" TEXT, "description" TEXT, "amount" NUMERIC(18,2) NOT NULL,
      "sourceReference" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","sourceReference")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateOperationalMetric" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "periodEnd" DATE NOT NULL, "metric" TEXT NOT NULL,
      "value" NUMERIC(18,4) NOT NULL, "unit" TEXT, "sourceReference" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","periodEnd","metric")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateCashFlowLine" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "sourceEntity" TEXT NOT NULL, "periodEnd" DATE NOT NULL,
      "lineKey" TEXT NOT NULL, "lineName" TEXT NOT NULL, "lineOrder" INTEGER NOT NULL, "amount" NUMERIC(18,2) NOT NULL,
      "budgetAmount" NUMERIC(18,2), "sourceFileName" TEXT, "sourceSheetName" TEXT, "sourceRowNumber" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","sourceEntity","periodEnd","lineKey")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RealEstateCashActivity_companyId_periodEnd_idx" ON "RealEstateCashActivity" ("companyId","periodEnd")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RealEstateCashActivity_companyId_activityDate_idx" ON "RealEstateCashActivity" ("companyId","activityDate")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RealEstateOperationalMetric_companyId_periodEnd_idx" ON "RealEstateOperationalMetric" ("companyId","periodEnd")`);
}

async function addSuggestedMappings(companyId: string, lines: Array<{ accountCode: string; accountName: string; accountType: string }>) {
  // Historical account labels must be crosswalked to the approved SLN chart,
  // not inferred from wording. Keep unmatched accounts visible for review.
  void companyId;
  void lines;
}

async function removePriorImport(companyId: string, files: string[]) {
  await prisma.$executeRawUnsafe(`DELETE FROM "RealEstateCashFlowLine" WHERE "companyId"=$1 AND "sourceEntity"='SLN'`, companyId);
  const sourceNames = [...new Set(files.filter((file) => /\.(xlsx|xlsm)$/i.test(file)).map((file) => path.basename(file)))];
  for (const sourceName of sourceNames) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "sourceFileName"=$2`,
      companyId, sourceName,
    );
  }
  for (const root of FINANCIAL_ROOTS) {
    await prisma.$executeRawUnsafe(`DELETE FROM "RealEstateCashActivity" WHERE "companyId"=$1 AND "sourceReference" LIKE $2`, companyId, `${root}/%`);
    await prisma.$executeRawUnsafe(`DELETE FROM "RealEstateOperationalMetric" WHERE "companyId"=$1 AND "sourceReference" LIKE $2`, companyId, `${root}/%`);
    await prisma.$executeRawUnsafe(`DELETE FROM "RealEstateOccupancySnapshot" WHERE "companyId"=$1 AND "sourceReference" LIKE $2`, companyId, `${root}/%`);
  }
}

async function upsertMetric(companyId: string, periodEnd: string, metric: Metric) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RealEstateOperationalMetric" ("id","companyId","periodEnd","metric","value","unit","sourceReference","updatedAt")
     VALUES ($1,$2,$3::date,$4,$5,$6,$7,NOW())
     ON CONFLICT ("companyId","periodEnd","metric") DO UPDATE SET "value"=EXCLUDED."value","unit"=EXCLUDED."unit","sourceReference"=EXCLUDED."sourceReference","updatedAt"=NOW()`,
    randomUUID(), companyId, periodEnd, metric.metric, metric.value, metric.unit || null, metric.sourceReference,
  );
}

function selectFinancialCandidates(files: string[]) {
  const candidates = files
    .filter((file) => /\.(xlsx|xlsm)$/i.test(file) && inMonthFolder(file))
    .flatMap(identifyFinancialWorkbook);
  const selected = new Map<string, FinancialCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.periodEnd}`;
    const previous = selected.get(key);
    if (!previous || candidate.rank >= previous.rank) selected.set(key, candidate);
  }
  return [...selected.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.kind.localeCompare(b.kind));
}

async function importCashFlow(companyId: string, candidate: FinancialCandidate, summary: Summary) {
  const lines = slnCashFlowLines(candidate.rows);
  await eachBatch(lines, async (line) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateCashFlowLine"
        ("id","companyId","sourceEntity","periodEnd","lineKey","lineName","lineOrder","amount","budgetAmount","sourceFileName","sourceSheetName","sourceRowNumber","updatedAt")
       VALUES ($1,$2,'SLN',$3::date,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT ("companyId","sourceEntity","periodEnd","lineKey")
       DO UPDATE SET "lineName"=EXCLUDED."lineName","lineOrder"=EXCLUDED."lineOrder","amount"=EXCLUDED."amount","budgetAmount"=EXCLUDED."budgetAmount",
         "sourceFileName"=EXCLUDED."sourceFileName","sourceSheetName"=EXCLUDED."sourceSheetName","sourceRowNumber"=EXCLUDED."sourceRowNumber","updatedAt"=NOW()`,
      randomUUID(), companyId, candidate.periodEnd, line.lineKey, line.lineName, line.lineOrder, line.actual, line.budget,
      path.basename(candidate.file), candidate.sheet, line.row,
    );
    summary.cashFlowLines += 1;
  });
}

async function importFinancials(companyId: string, files: string[], summary: Summary) {
  const selected = selectFinancialCandidates(files);
  for (const candidate of selected) {
    if (candidate.kind === 'ACTIVITY') {
      await importCashFlow(companyId, candidate, summary);
      const lines = slnActivityLines(candidate.rows);
      await eachBatch(lines, async (line) => {
        await upsertFinancialLine({
          companyId, reportType: 'ACTIVITY', periodEnd: candidate.periodEnd, accountCode: line.accountCode,
          accountName: line.accountName, accountType: line.accountType, amount: line.actual, file: candidate.file, sheet: candidate.sheet, row: line.row,
        });
        summary.activityActual += 1;
        if (line.budget !== null) {
          await upsertFinancialLine({ companyId, reportType: 'ACTIVITY_BUDGET', periodEnd: candidate.periodEnd, accountCode: line.accountCode, accountName: line.accountName, accountType: line.accountType, amount: line.budget, file: candidate.file, sheet: candidate.sheet, row: line.row });
          summary.activityBudget += 1;
        }
      });
      await addSuggestedMappings(companyId, lines);
    } else {
      const lines = slnBalanceLines(candidate.rows);
      await eachBatch(lines, async (line) => {
        await upsertFinancialLine({ companyId, reportType: 'BALANCE', periodEnd: candidate.periodEnd, ...line, file: candidate.file, sheet: candidate.sheet });
        summary.balance += 1;
      });
    }
  }
  summary.financialPeriods = selected.length;
}

/** Parses every selected statement and prints what would be imported, without touching a database. */
function dryRun(files: string[]) {
  for (const candidate of selectFinancialCandidates(files)) {
    if (candidate.kind !== 'ACTIVITY') continue;
    const lines = slnActivityLines(candidate.rows);
    const income = lines.filter((line) => line.accountType === 'Income').reduce((total, line) => total + line.actual, 0);
    const expense = lines.filter((line) => line.accountType === 'Expense').reduce((total, line) => total + line.actual, 0);
    const cash = slnCashFlowLines(candidate.rows);
    const beginning = cash.find((line) => /^cash beginning of period$/i.test(line.lineName))?.actual ?? null;
    const ending = cash.find((line) => /^cash end of period$/i.test(line.lineName))?.actual ?? null;
    const flows = cash.filter((line) => !/^cash (beginning|end) of period$/i.test(line.lineName)).reduce((total, line) => total + line.actual, 0);
    const difference = beginning === null || ending === null ? null : Math.round(beginning + flows - ending);
    console.log([
      candidate.periodEnd,
      `lines=${lines.length}`,
      `income=${Math.round(income)}`,
      `expense=${Math.round(expense)}`,
      `cashLines=${cash.length}`,
      `begin=${beginning}`,
      `end=${ending}`,
      `cashDiff=${difference}`,
      path.relative(SOURCE_ROOT, candidate.file),
    ].join(' | '));
  }
}

function vhdaPeriod(rows: unknown[][]): string | null {
  const monthRow = rows.find((row) => text(row[1]) === 'Reporting Month:');
  const yearRow = rows.find((row) => text(row[5]) === 'Reporting Year:');
  const month = numberValue(monthRow?.[2]);
  const year = numberValue(yearRow?.[6]);
  if (!month || !year || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

async function importVhdaMetrics(companyId: string, files: string[], summary: Summary) {
  const labels: Record<string, { metric: string; unit: string }> = {
    'A. Total Rental Income Potential at 100% Occupancy': { metric: 'rental_income_potential', unit: 'USD' },
    'B. Vacancies': { metric: 'vacancy_loss', unit: 'USD' },
    'C. Concessions': { metric: 'concessions', unit: 'USD' },
    'D. Accounts Receivable -- Tenant': { metric: 'tenant_accounts_receivable', unit: 'USD' },
    'A. Operating Account': { metric: 'operating_account_balance', unit: 'USD' },
    'B. Petty Cash': { metric: 'petty_cash_balance', unit: 'USD' },
    'C. Other Accounts': { metric: 'other_cash_balance', unit: 'USD' },
    'Cash Balance': { metric: 'cash_balance', unit: 'USD' },
    'A. Receipts from Reserve Accounts': { metric: 'reserve_receipts', unit: 'USD' },
    'B. Receipts from Insurance Claims': { metric: 'insurance_claim_receipts', unit: 'USD' },
    'C. Receipts from Owner (aka: Owner Advances)': { metric: 'owner_advances_received', unit: 'USD' },
    'D. Repayment of Owner Advances': { metric: 'owner_advance_repayments', unit: 'USD' },
    'E. Distributions to Owner': { metric: 'owner_distributions', unit: 'USD' },
    'A. Trade Payables': { metric: 'trade_payables', unit: 'USD' },
    'B. Management Agent Payables': { metric: 'management_agent_payables', unit: 'USD' },
    'C. Owner Advances': { metric: 'owner_advances_payable', unit: 'USD' },
    'A. Number of Occupied Units': { metric: 'occupied_units', unit: 'units' },
    'B. Number of Rent-Free Units': { metric: 'rent_free_units', unit: 'units' },
    'C. Number of Vacant Units Pre-Leased': { metric: 'vacant_preleased_units', unit: 'units' },
    'D. Number of Vacant Units Not-Leased': { metric: 'vacant_unleased_units', unit: 'units' },
    'Total Units in Property (Sum of A thru D above)': { metric: 'total_units', unit: 'units' },
    'E. Total Number of Move-outs During Reporting Month': { metric: 'move_outs', unit: 'units' },
  };
  for (const file of files.filter((item) => /vhda.*operating summary/i.test(path.basename(item)))) {
    const workbook = XLSX.readFile(file, { cellDates: true });
    for (const sheet of workbook.SheetNames) {
      const rows = workbookRows(file, sheet);
      const periodEnd = vhdaPeriod(rows);
      if (!periodEnd) continue;
      const values = new Map<string, number>();
      for (let index = 0; index < rows.length; index += 1) {
        const name = text(rows[index][0]);
        const definition = labels[name];
        const value = numberValue(rows[index][5]);
        if (!definition || value === null) continue;
        values.set(definition.metric, value);
        await upsertMetric(companyId, periodEnd, { ...definition, value, sourceReference: sourceRef(file, sheet, index + 1) });
        summary.metrics += 1;
      }
      const totalUnits = values.get('total_units');
      const occupiedUnits = values.get('occupied_units');
      if (totalUnits && occupiedUnits !== undefined) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "RealEstateOccupancySnapshot" ("id","companyId","periodEnd","totalUnits","occupiedUnits","physicalOccupancyPct","economicOccupancyPct","sourceReference","updatedAt")
           VALUES ($1,$2,$3::date,$4,$5,$6,NULL,$7,NOW())
           ON CONFLICT ("companyId","periodEnd") DO UPDATE SET "totalUnits"=EXCLUDED."totalUnits","occupiedUnits"=EXCLUDED."occupiedUnits","physicalOccupancyPct"=EXCLUDED."physicalOccupancyPct","sourceReference"=EXCLUDED."sourceReference","updatedAt"=NOW()`,
          randomUUID(), companyId, periodEnd, totalUnits, occupiedUnits, (occupiedUnits / totalUnits) * 100, path.relative(SOURCE_ROOT, file).replace(/\\/g, '/'),
        );
        summary.occupancy += 1;
      }
    }
  }
}

function trackerPeriod(sheetName: string, rows: unknown[][]): string | null {
  const match = sheetName.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
  if (match) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
    return `${match[2]}-${String(month).padStart(2, '0')}-${String(new Date(Number(match[2]), month, 0).getDate()).padStart(2, '0')}`;
  }
  const date = rows.slice(0, 15).flat().map(parseDate).find(Boolean);
  return date || null;
}

function looksLikePerson(name: string): boolean {
  const normalized = name.replace(/[.,]/g, '').trim();
  return /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(normalized)
    && !/\b(inc|llc|ltd|corp|company|co|group|realty|services|supply|energy|bank)\b/i.test(normalized);
}

function trackerRank(file: string): number {
  const folderMatch = file.match(/[\\/](\d{1,2})\s+\w+\s+Financials[\\/]/i);
  return (folderMatch ? Number(folderMatch[1]) : 0) + sourceRank(file);
}

async function importCashTrackers(companyId: string, files: string[], summary: Summary) {
  const candidates = files.filter((file) => /cash tracker/i.test(path.basename(file)) && /\.(xlsx|xlsm)$/i.test(file));
  const selected = new Map<string, { file: string; sheet: string; rows: unknown[][]; periodEnd: string; rank: number }>();
  for (const file of candidates) {
    const workbook = XLSX.readFile(file, { cellDates: true });
    for (const sheet of workbook.SheetNames) {
      const rows = workbookRows(file, sheet);
      const periodEnd = trackerPeriod(sheet, rows);
      if (!periodEnd) continue;
      const previous = selected.get(periodEnd);
      const rank = trackerRank(file);
      if (!previous || rank >= previous.rank) selected.set(periodEnd, { file, sheet, rows, periodEnd, rank });
    }
  }
  for (const { file, sheet, rows, periodEnd } of selected.values()) {
      const balance = numberValue(rows[5]?.[7]);
      if (balance !== null) {
        await upsertMetric(companyId, periodEnd, {
          metric: 'cash_tracker_ending_balance', value: balance, unit: 'USD', sourceReference: sourceRef(file, sheet, 6),
        });
        summary.metrics += 1;
      }
      const activities: Array<{ activityDate: string | null; activityType: string; counterparty: string; description: string | null; amount: number; sourceReference: string }> = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const counterparty = text(row[1]);
        const activityDate = parseDate(row[0]);
        for (const [column, baseType] of [[2, 'CASH_RECEIPT'], [3, 'OWNER_FUNDING'], [5, 'CASH_DISBURSEMENT']] as const) {
          const sourceAmount = numberValue(row[column]);
          if (sourceAmount === null || sourceAmount === 0 || !counterparty || looksLikePerson(counterparty)) continue;
          const activityType = baseType === 'CASH_RECEIPT' && /onesite|tenant/i.test(counterparty) ? 'TENANT_RECEIPT' : baseType;
          const amount = baseType === 'CASH_DISBURSEMENT' ? -Math.abs(sourceAmount) : sourceAmount;
          activities.push({
            activityDate, activityType, counterparty, description: text(row[9]) || null, amount, sourceReference: sourceRef(file, sheet, index + 1),
          });
        }
      }
      await eachBatch(activities, async (activity) => {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "RealEstateCashActivity" ("id","companyId","periodEnd","activityDate","activityType","counterparty","description","amount","sourceReference","updatedAt")
             VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,NOW())
             ON CONFLICT ("companyId","sourceReference") DO UPDATE SET "activityDate"=EXCLUDED."activityDate","activityType"=EXCLUDED."activityType","counterparty"=EXCLUDED."counterparty","description"=EXCLUDED."description","amount"=EXCLUDED."amount","updatedAt"=NOW()`,
            randomUUID(), companyId, periodEnd, activity.activityDate, activity.activityType, activity.counterparty, activity.description, activity.amount, activity.sourceReference,
          );
          summary.cashActivities += 1;
      });
  }
}

async function main() {
  if (argument('--dry-run') === 'true') {
    dryRun((await Promise.all(FINANCIAL_ROOTS.map((root) => walk(path.join(SOURCE_ROOT, root))))).flat());
    return;
  }
  const companyName = argument('--company');
  const companyId = argument('--company-id');
  if (!companyName && !companyId) throw new Error('Pass --company-id for the target company, or an exact --company name.');
  enforceDatabaseSecurity();
  const db = validateDatabaseConnection();
  if (db.isProduction && argument('--production') !== 'true') {
    throw new Error('Production import requires --production true and an explicit --company-id.');
  }
  if (db.isProduction && !companyId) throw new Error('Production import requires an explicit --company-id.');
  const companies = await prisma.company.findMany({
    where: companyId ? { id: companyId } : { name: companyName },
    select: { id: true, name: true },
  });
  if (companies.length !== 1) throw new Error(companyId ? `Expected one company with ID "${companyId}", found ${companies.length}.` : `Expected one company named "${companyName}", found ${companies.length}.`);

  await ensureSourcedOperatingTables();
  const files = (await Promise.all(FINANCIAL_ROOTS.map((root) => walk(path.join(SOURCE_ROOT, root))))).flat();
  await removePriorImport(companies[0].id, files);
  const summary: Summary = { activityActual: 0, activityBudget: 0, balance: 0, financialPeriods: 0, metrics: 0, occupancy: 0, cashActivities: 0, cashFlowLines: 0 };
  await importFinancials(companies[0].id, files, summary);
  await importVhdaMetrics(companies[0].id, files, summary);
  await importCashTrackers(companies[0].id, files, summary);
  console.log(JSON.stringify({ database: db.label, company: companies[0], filesScanned: files.length, summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
