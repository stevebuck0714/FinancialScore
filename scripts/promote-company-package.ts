import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';

const [mode, ...args] = process.argv.slice(2);
const isExport = mode === 'export';
const isImport = mode === 'import';
const sourceOrPackagePath = args[0];
const targetCompanyIdArg = args[1];
const outputPathArg = isExport ? args[2] : undefined;
const flags = isExport ? args.slice(3) : args.slice(2);
const replace = flags.includes('--replace');

if (!isExport && !isImport) {
  throw new Error(
    'Usage:\n' +
      '  npx tsx scripts/promote-company-package.ts export <source-company-id> <target-company-id> [package-path]\n' +
      '  npx tsx scripts/promote-company-package.ts import <package-path> <target-company-id> --replace',
  );
}

// An export is always run locally against development. An import intentionally
// uses the production runtime environment; this script never accepts a database
// URL as a command-line value.
if (isExport) dotenv.config({ path: '.env.local', quiet: true });

const sourceCompanyId = isExport ? String(sourceOrPackagePath || '').trim() : '';
const packagePath = isExport
  ? outputPathArg ||
    `C:/Users/steve/Dropbox/New Corelytics/CUSTOMERS/Benns Grant/benns-grant-promotion-${new Date().toISOString().slice(0, 10)}.json`
  : String(sourceOrPackagePath || '').trim();
const targetCompanyId = String(targetCompanyIdArg || '').trim();

if (!targetCompanyId) throw new Error('A target production company ID is required.');
if (isExport && !sourceCompanyId) throw new Error('A source development company ID is required.');
if (isImport && !packagePath) throw new Error('A promotion package path is required.');

type Column = {
  columnName: string;
  dataType: string;
  udtName: string;
  ordinalPosition: number;
};

type PromotionTable = {
  name: string;
  columns: Column[];
  rows: Array<Record<string, unknown>>;
};

type PromotionPackage = {
  format: 'corelytics-company-promotion/v1';
  exportedAt: string;
  source: { companyId: string; companyName: string; environment: string };
  target: { companyId: string };
  companyConfiguration: Record<string, unknown>;
  tables: PromotionTable[];
  rowCounts: Record<string, number>;
  checksum: string;
};

// This list deliberately includes business data only. Credentials, users,
// session state, sync queues, logs, and billing records never belong in a
// company-promotion package.
const TRANSFER_TABLES = [
  'CompanyProfile',
  'OpsDashboardPreference',
  'CustomReport',
  'RealEstateAccountMapping',
  'RealEstateConstructionBudgetLine',
  'RealEstateConstructionDraw',
  'RealEstateConstructionInvoice',
  'RealEstateFinancialLine',
  'RealEstateFixedAsset',
  'RealEstateFundingSource',
  'RealEstateInvestor',
  'RealEstateInvestorAlias',
  'RealEstateInvestorLedgerEntry',
] as const;

const DELETE_ORDER = [
  'RealEstateInvestorLedgerEntry',
  'RealEstateInvestorAlias',
  'RealEstateInvestor',
  'RealEstateConstructionInvoice',
  'RealEstateConstructionBudgetLine',
  'RealEstateConstructionDraw',
  'RealEstateFundingSource',
  'RealEstateFixedAsset',
  'RealEstateFinancialLine',
  'RealEstateAccountMapping',
  'CustomReport',
  'OpsDashboardPreference',
  'CompanyProfile',
] as const;

const INSERT_ORDER = [...DELETE_ORDER].reverse();
const prisma = new PrismaClient();

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksumFor(value: Omit<PromotionPackage, 'checksum'>): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function sqlValue(column: Column, index: number): string {
  const param = `$${index}`;
  if (column.udtName === 'jsonb' || column.udtName === 'json') return `${param}::${column.udtName}`;
  if (column.dataType === 'date') return `${param}::date`;
  if (column.dataType === 'timestamp without time zone') return `${param}::timestamp`;
  if (column.dataType === 'timestamp with time zone') return `${param}::timestamptz`;
  if (column.dataType === 'numeric') return `${param}::numeric`;
  return param;
}

function serializedValue(column: Column, value: unknown): unknown {
  if (value === undefined) return null;
  if (column.udtName === 'jsonb' || column.udtName === 'json') return JSON.stringify(value ?? null);
  return value;
}

async function columnsFor(tableName: string): Promise<Column[]> {
  return prisma.$queryRawUnsafe<Column[]>(
    `
      SELECT
        column_name AS "columnName",
        data_type AS "dataType",
        udt_name AS "udtName",
        ordinal_position AS "ordinalPosition"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    tableName,
  );
}

async function exportPackage() {
  enforceDatabaseSecurity();
  const database = validateDatabaseConnection();
  if (database.isProduction) {
    throw new Error('Export is blocked against production. Export from development only.');
  }

  const company = await prisma.company.findUnique({
    where: { id: sourceCompanyId },
    select: {
      id: true,
      name: true,
      industrySector: true,
      industrySectorCategory: true,
      baseCurrency: true,
      reportingCurrency: true,
      locale: true,
      linesOfBusiness: true,
      headcountAllocations: true,
      userDefinedAllocations: true,
    },
  });
  if (!company) throw new Error(`Source company ${sourceCompanyId} was not found.`);

  const tables: PromotionTable[] = [];
  for (const name of TRANSFER_TABLES) {
    const columns = await columnsFor(name);
    if (columns.length === 0) {
      throw new Error(`Required promotion table ${name} does not exist in this environment.`);
    }
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM ${quoteIdentifier(name)} WHERE "companyId" = $1 ORDER BY ${quoteIdentifier(columns[0].columnName)}`,
      sourceCompanyId,
    );
    tables.push({ name, columns, rows });
  }

  const rowCounts = Object.fromEntries(tables.map((table) => [table.name, table.rows.length]));
  const draft = {
    format: 'corelytics-company-promotion/v1' as const,
    exportedAt: new Date().toISOString(),
    source: { companyId: sourceCompanyId, companyName: company.name, environment: database.label },
    target: { companyId: targetCompanyId },
    companyConfiguration: {
      industrySector: company.industrySector,
      industrySectorCategory: company.industrySectorCategory,
      baseCurrency: company.baseCurrency,
      reportingCurrency: company.reportingCurrency,
      locale: company.locale,
      linesOfBusiness: company.linesOfBusiness,
      headcountAllocations: company.headcountAllocations,
      userDefinedAllocations: company.userDefinedAllocations,
    },
    tables,
    rowCounts,
  };
  const promotionPackage: PromotionPackage = { ...draft, checksum: checksumFor(draft) };
  await writeFile(packagePath, `${JSON.stringify(promotionPackage, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        packagePath,
        source: promotionPackage.source,
        target: promotionPackage.target,
        rowCounts,
        totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
        checksum: promotionPackage.checksum,
      },
      null,
      2,
    ),
  );
}

function parsePackage(raw: string): PromotionPackage {
  const parsed = JSON.parse(raw) as PromotionPackage;
  if (parsed.format !== 'corelytics-company-promotion/v1') throw new Error('Unsupported promotion package format.');
  if (!Array.isArray(parsed.tables)) throw new Error('Promotion package has no table data.');
  if (parsed.tables.some((table) => !(TRANSFER_TABLES as readonly string[]).includes(table.name))) {
    throw new Error('Promotion package contains a non-transferable table.');
  }

  const { checksum, ...draft } = parsed;
  if (!checksum || checksumFor(draft) !== checksum) throw new Error('Promotion package checksum does not match.');
  return parsed;
}

async function importPackage() {
  if (!replace) {
    throw new Error('Import requires --replace because it atomically replaces only the target company’s promoted business data.');
  }

  enforceDatabaseSecurity();
  const database = validateDatabaseConnection();
  if (!database.isProduction) {
    throw new Error('Import is blocked outside the approved production runtime.');
  }

  const promotionPackage = parsePackage(await readFile(packagePath, 'utf8'));
  if (promotionPackage.target.companyId !== targetCompanyId) {
    throw new Error(`Package target ${promotionPackage.target.companyId} does not match requested target ${targetCompanyId}.`);
  }

  const target = await prisma.company.findUnique({
    where: { id: targetCompanyId },
    select: { id: true, name: true, accountingSystem: true },
  });
  if (!target) throw new Error(`Target production company ${targetCompanyId} was not found.`);
  if (target.accountingSystem !== 'QUICKBOOKS_DESKTOP') {
    throw new Error(`Target company accounting system is ${target.accountingSystem || 'unset'}, not QUICKBOOKS_DESKTOP.`);
  }

  const tablesByName = new Map(promotionPackage.tables.map((table) => [table.name, table]));

  await prisma.$transaction(async (tx) => {
    for (const tableName of DELETE_ORDER) {
      await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdentifier(tableName)} WHERE "companyId" = $1`, targetCompanyId);
    }

    for (const tableName of INSERT_ORDER) {
      const table = tablesByName.get(tableName);
      if (!table?.rows.length) continue;
      const columnNames = table.columns.map((column) => column.columnName);
      const companyIdIndex = columnNames.indexOf('companyId');
      if (companyIdIndex < 0) throw new Error(`${tableName} does not have companyId.`);

      const insertSql = `
        INSERT INTO ${quoteIdentifier(tableName)}
          (${columnNames.map(quoteIdentifier).join(', ')})
        VALUES
          (${table.columns.map((column, index) => sqlValue(column, index + 1)).join(', ')})
      `;

      for (const row of table.rows) {
        const values = table.columns.map((column, index) =>
          serializedValue(column, index === companyIdIndex ? targetCompanyId : row[column.columnName]),
        );
        await tx.$executeRawUnsafe(insertSql, ...values);
      }
    }

    await tx.company.update({
      where: { id: targetCompanyId },
      data: promotionPackage.companyConfiguration,
    });
  });

  console.log(
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        targetCompany: target.name,
        targetCompanyId,
        rowCounts: promotionPackage.rowCounts,
        totalRows: Object.values(promotionPackage.rowCounts).reduce((sum, count) => sum + count, 0),
        checksum: promotionPackage.checksum,
      },
      null,
      2,
    ),
  );
}

(isExport ? exportPackage() : importPackage())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
