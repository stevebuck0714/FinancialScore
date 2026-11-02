import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isProductionSite } from '@/lib/db-security';
import { requireSiteAdmin } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

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

function validChecksum(value: PromotionPackage): boolean {
  const { checksum, ...draft } = value;
  const actual = createHash('sha256').update(stableJson(draft)).digest('hex');
  return Boolean(checksum) && actual === checksum;
}

function sqlValue(column: Column, index: number): string {
  const parameter = `$${index}`;
  if (column.udtName === 'jsonb' || column.udtName === 'json') return `${parameter}::${column.udtName}`;
  if (column.dataType === 'date') return `${parameter}::date`;
  if (column.dataType === 'timestamp without time zone') return `${parameter}::timestamp`;
  if (column.dataType === 'timestamp with time zone') return `${parameter}::timestamptz`;
  if (column.dataType === 'numeric') return `${parameter}::numeric`;
  return parameter;
}

function serializedValue(column: Column, value: unknown): unknown {
  if (value === undefined) return null;
  if (column.udtName === 'jsonb' || column.udtName === 'json') return JSON.stringify(value ?? null);
  return value;
}

async function targetColumns(tableName: string): Promise<Column[]> {
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

function verifyPackage(promotionPackage: PromotionPackage, targetCompanyId: string) {
  if (promotionPackage?.format !== 'corelytics-company-promotion/v1') {
    throw new Error('Unsupported promotion package format.');
  }
  if (promotionPackage.target?.companyId !== targetCompanyId) {
    throw new Error('The promotion package was prepared for a different target company.');
  }
  if (!Array.isArray(promotionPackage.tables) || !validChecksum(promotionPackage)) {
    throw new Error('The promotion package is missing data or its checksum does not match.');
  }
  if (promotionPackage.tables.some((table) => !(TRANSFER_TABLES as readonly string[]).includes(table.name))) {
    throw new Error('The promotion package contains a non-transferable table.');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSiteAdmin();
    if (!isProductionSite()) {
      return NextResponse.json({ error: 'Company promotion imports may run only in production.' }, { status: 403 });
    }

    const body = await request.json();
    const targetCompanyId = String(body?.targetCompanyId || '').trim();
    const confirmation = String(body?.confirmation || '').trim();
    const promotionPackage = body?.promotionPackage as PromotionPackage;

    if (!targetCompanyId || confirmation !== targetCompanyId) {
      return NextResponse.json({ error: 'Type the target company ID exactly to confirm this import.' }, { status: 400 });
    }

    verifyPackage(promotionPackage, targetCompanyId);
    const target = await prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { id: true, name: true, accountingSystem: true },
    });
    if (!target) return NextResponse.json({ error: 'Target company not found.' }, { status: 404 });
    if (target.accountingSystem !== 'QUICKBOOKS_DESKTOP') {
      return NextResponse.json({ error: 'Target company is not configured for QuickBooks Desktop.' }, { status: 400 });
    }

    const tablesByName = new Map(promotionPackage.tables.map((table) => [table.name, table]));

    const destinationColumnsByTable = new Map<string, Column[]>();
    for (const tableName of TRANSFER_TABLES) {
      const source = tablesByName.get(tableName);
      if (!source) throw new Error(`Promotion package is missing ${tableName}.`);
      const destination = await targetColumns(tableName);
      const expected = destination.map((column) => column.columnName).sort().join('|');
      const received = source.columns.map((column) => column.columnName).sort().join('|');
      if (!destination.length || expected !== received) {
        throw new Error(`Schema mismatch for ${tableName}; deploy the current production migrations before importing.`);
      }
      destinationColumnsByTable.set(tableName, destination);
    }

    await prisma.$transaction(async (tx) => {
      for (const tableName of DELETE_ORDER) {
        await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdentifier(tableName)} WHERE "companyId" = $1`, targetCompanyId);
      }

      for (const tableName of INSERT_ORDER) {
        const table = tablesByName.get(tableName);
        if (!table?.rows.length) continue;
        const columns = destinationColumnsByTable.get(tableName) || [];
        const companyIdIndex = columns.findIndex((column) => column.columnName === 'companyId');
        if (companyIdIndex < 0) throw new Error(`${tableName} is missing companyId.`);

        const insertSql = `
          INSERT INTO ${quoteIdentifier(tableName)} (${columns.map((column) => quoteIdentifier(column.columnName)).join(', ')})
          VALUES (${columns.map((column, index) => sqlValue(column, index + 1)).join(', ')})
        `;

        for (const row of table.rows) {
          const values = columns.map((column, index) =>
            serializedValue(column, index === companyIdIndex ? targetCompanyId : row[column.columnName]),
          );
          await tx.$executeRawUnsafe(insertSql, ...values);
        }
      }

      await tx.company.update({
        where: { id: targetCompanyId },
        data: promotionPackage.companyConfiguration as any,
      });
    });

    return NextResponse.json({
      ok: true,
      targetCompany: target.name,
      targetCompanyId,
      rowCounts: promotionPackage.rowCounts,
      totalRows: Object.values(promotionPackage.rowCounts).reduce((total, count) => total + Number(count || 0), 0),
      checksum: promotionPackage.checksum,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import company promotion package.';
    const status = /unauthorized|forbidden/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
