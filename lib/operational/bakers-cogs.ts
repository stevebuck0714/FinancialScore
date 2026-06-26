import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

export const BAKERS_COGS_SOURCE_CODE = 'BAKERS_COGS';
export const BAKERS_COGS_LABEL = 'Bakers COGS';

type MatrixCell = string | number | Date | boolean | null | undefined;

export type BakersCogsLineType = 'INGREDIENT' | 'PACKAGING' | 'LABOR' | 'SUMMARY';

export type BakersCogsFactRow = {
  productId: string;
  productName: string;
  formulaDate: Date;
  formulaDateKey: string;
  sheetName: string;
  lineType: BakersCogsLineType;
  lineNumber: number;
  metricName: string;
  categoryNo: string;
  description: string | null;
  quantity: number | null;
  unitCost: number | null;
  lineCost: number | null;
  valueNumber: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

export type BakersCogsProduct = {
  sheetName: string;
  productName: string;
  productId: string;
  formulaDateIso: string;
  formulaDateKey: string;
  totals: Record<string, number | null>;
  rows: BakersCogsFactRow[];
};

export type ParsedBakersCogsWorkbook = {
  sourceName: string;
  parsedAt: string;
  sheetNames: string[];
  productCount: number;
  rowCount: number;
  formulaDateKeys: string[];
  products: BakersCogsProduct[];
};

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeLabel(value: unknown): string {
  return asString(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function findRowIndex(matrix: MatrixCell[][], predicate: (row: MatrixCell[], index: number) => boolean): number {
  return matrix.findIndex((row, index) => predicate(row || [], index));
}

function findValueBesideLabel(matrix: MatrixCell[][], label: string): MatrixCell {
  const normalized = normalizeLabel(label);
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 12); rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length - 1; colIndex += 1) {
      if (normalizeLabel(row[colIndex]) === normalized) return row[colIndex + 1];
    }
  }
  return null;
}

function findValueByMarker(matrix: MatrixCell[][], marker: string): number | null {
  const normalized = normalizeLabel(marker);
  for (const row of matrix) {
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (normalizeLabel(row[colIndex]).includes(normalized)) {
        return asNumber(colIndex > 0 ? row[colIndex - 1] : row[colIndex + 1]);
      }
    }
  }
  return null;
}

function buildFactBase(product: Omit<BakersCogsProduct, 'totals' | 'rows'>) {
  return {
    productId: product.productId,
    productName: product.productName,
    formulaDate: new Date(product.formulaDateIso),
    formulaDateKey: product.formulaDateKey,
    sheetName: product.sheetName,
  };
}

function parseDetailRows(args: {
  matrix: MatrixCell[][];
  startIndex: number;
  endPredicate: (row: MatrixCell[]) => boolean;
  lineType: Exclude<BakersCogsLineType, 'SUMMARY'>;
  descriptionColumn: number;
  quantityColumn: number;
  unitCostColumn: number;
  lineCostColumn: number;
  product: Omit<BakersCogsProduct, 'totals' | 'rows'>;
}): BakersCogsFactRow[] {
  const rows: BakersCogsFactRow[] = [];
  const base = buildFactBase(args.product);
  for (let rowIndex = args.startIndex; rowIndex < args.matrix.length; rowIndex += 1) {
    const row = args.matrix[rowIndex] || [];
    if (args.endPredicate(row)) break;

    const categoryNo = asString(row[0]);
    const description = asString(row[args.descriptionColumn]);
    const lineCost = asNumber(row[args.lineCostColumn]);
    if (!categoryNo || (!description && (lineCost == null || lineCost === 0))) continue;

    rows.push({
      ...base,
      lineType: args.lineType,
      lineNumber: rows.length + 1,
      metricName: '',
      categoryNo,
      description: description || null,
      quantity: asNumber(row[args.quantityColumn]),
      unitCost: asNumber(row[args.unitCostColumn]),
      lineCost,
      valueNumber: null,
      notes: asString(row[5]) || null,
      metadata: { sourceRowNumber: rowIndex + 1 },
    });
  }
  return rows;
}

function addSummaryRows(
  product: Omit<BakersCogsProduct, 'totals' | 'rows'>,
  totals: Record<string, number | null>,
): BakersCogsFactRow[] {
  const base = buildFactBase(product);
  return Object.entries(totals)
    .filter(([, value]) => value != null)
    .map(([metricName, value], index) => ({
      ...base,
      lineType: 'SUMMARY' as const,
      lineNumber: index + 1,
      metricName,
      categoryNo: '',
      description: metricName,
      quantity: null,
      unitCost: null,
      lineCost: null,
      valueNumber: value,
      notes: null,
      metadata: {},
    }));
}

function parseBakersCogsSheet(workbook: XLSX.WorkBook, sheetName: string): BakersCogsProduct {
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, { header: 1, raw: true, blankrows: false });
  const productName = asString(findValueBesideLabel(matrix, 'Product Name'));
  const productId = asString(findValueBesideLabel(matrix, 'Item Code')) || sheetName;
  const formulaDate = asDate(findValueBesideLabel(matrix, 'Date'));

  if (!productName) throw new Error(`Sheet "${sheetName}" is missing Product Name.`);
  if (!productId) throw new Error(`Sheet "${sheetName}" is missing Item Code.`);
  if (!formulaDate) throw new Error(`Sheet "${sheetName}" is missing a valid Date.`);

  const productBase = {
    sheetName,
    productName,
    productId,
    formulaDateIso: formulaDate.toISOString(),
    formulaDateKey: dateKey(formulaDate),
  };

  const ingredientHeaderIndex = findRowIndex(
    matrix,
    (row) => normalizeLabel(row[0]) === 'category/no' && normalizeLabel(row[1]) === 'ingredient name',
  );
  const packagingHeaderIndex = findRowIndex(
    matrix,
    (row) => normalizeLabel(row[0]) === 'category/no' && normalizeLabel(row[1]) === 'type',
  );
  const laborHeaderIndex = findRowIndex(
    matrix,
    (row) => normalizeLabel(row[0]) === 'category/no' && normalizeLabel(row[1]) === 'department/position',
  );

  if (ingredientHeaderIndex < 0) throw new Error(`Sheet "${sheetName}" is missing the ingredient header row.`);

  const totals = {
    totalWeight: findValueByMarker(matrix, 'total weight') ?? asNumber(matrix.find((row) => normalizeLabel(row?.[0]) === 'total weight')?.[2]),
    totalFormulaCost: asNumber(matrix.find((row) => normalizeLabel(row?.[0]) === 'total weight')?.[4]),
    caseScaledWeight: asNumber(matrix.find((row) => normalizeLabel(row?.[0]) === 'case scaled weight')?.[1]),
    totalCases: asNumber(matrix.find((row) => normalizeLabel(row?.[0]) === 'case scaled weight')?.[2]),
    totalCaseIngredientCost: findValueByMarker(matrix, 'total case ingredient cost'),
    totalCasePackagingCost: findValueByMarker(matrix, 'total case packaging cost'),
    totalCaseLaborCost: findValueByMarker(matrix, 'total case labor cost'),
    totalCaseShippingCost: findValueByMarker(matrix, 'total case shipping cost'),
    totalCogs: findValueByMarker(matrix, 'total cogs'),
    itemPrice: findValueByMarker(matrix, 'item price'),
    grossMargin: findValueByMarker(matrix, 'gross margin'),
  };

  const ingredientRows = parseDetailRows({
    matrix,
    startIndex: ingredientHeaderIndex + 1,
    endPredicate: (row) => normalizeLabel(row[0]) === 'total weight',
    lineType: 'INGREDIENT',
    descriptionColumn: 1,
    quantityColumn: 2,
    unitCostColumn: 3,
    lineCostColumn: 4,
    product: productBase,
  });

  const packagingRows =
    packagingHeaderIndex >= 0
      ? parseDetailRows({
          matrix,
          startIndex: packagingHeaderIndex + 1,
          endPredicate: (row) => normalizeLabel(row[5]).includes('total case packaging cost'),
          lineType: 'PACKAGING',
          descriptionColumn: 1,
          quantityColumn: 2,
          unitCostColumn: 3,
          lineCostColumn: 4,
          product: productBase,
        })
      : [];

  const laborRows =
    laborHeaderIndex >= 0
      ? parseDetailRows({
          matrix,
          startIndex: laborHeaderIndex + 1,
          endPredicate: (row) => normalizeLabel(row[0]) === 'cases per hour',
          lineType: 'LABOR',
          descriptionColumn: 1,
          quantityColumn: 2,
          unitCostColumn: 3,
          lineCostColumn: 4,
          product: productBase,
        })
      : [];

  return {
    ...productBase,
    totals,
    rows: [...ingredientRows, ...packagingRows, ...laborRows, ...addSummaryRows(productBase, totals)],
  };
}

export function parseBakersCogsWorkbook(workbook: XLSX.WorkBook): ParsedBakersCogsWorkbook {
  const products = workbook.SheetNames.map((sheetName) => parseBakersCogsSheet(workbook, sheetName));
  if (!products.length) throw new Error('Bakers COGS workbook has no worksheets.');

  return {
    sourceName: BAKERS_COGS_LABEL,
    parsedAt: new Date().toISOString(),
    sheetNames: workbook.SheetNames,
    productCount: products.length,
    rowCount: products.reduce((sum, product) => sum + product.rows.length, 0),
    formulaDateKeys: Array.from(new Set(products.map((product) => product.formulaDateKey))).sort(),
    products,
  };
}

export async function saveBakersCogsFacts(args: {
  companyId: string;
  parsed: ParsedBakersCogsWorkbook;
  sourceCode?: string;
}): Promise<void> {
  const { default: prisma } = await import('@/lib/prisma');
  const sourceCode = args.sourceCode || BAKERS_COGS_SOURCE_CODE;
  const rows = args.parsed.products.flatMap((product) => product.rows);
  if (!rows.length) return;

  const productDatePairs = Array.from(
    new Map(rows.map((row) => [`${row.productId}|${row.formulaDateKey}`, row])).values(),
  );

  await prisma.$transaction(async (tx) => {
    for (const row of productDatePairs) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "BakersCogsFact"
        WHERE "companyId" = ${args.companyId}
          AND "sourceCode" = ${sourceCode}
          AND "productId" = ${row.productId}
          AND "formulaDateKey" = ${row.formulaDateKey}
      `);
    }

    for (const row of rows) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "BakersCogsFact" (
          "id",
          "companyId",
          "sourceCode",
          "productId",
          "productName",
          "formulaDate",
          "formulaDateKey",
          "sheetName",
          "lineType",
          "lineNumber",
          "metricName",
          "categoryNo",
          "description",
          "quantity",
          "unitCost",
          "lineCost",
          "valueNumber",
          "notes",
          "metadata",
          "uploadedAt",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          md5(random()::text || clock_timestamp()::text),
          ${args.companyId},
          ${sourceCode},
          ${row.productId},
          ${row.productName},
          ${row.formulaDate},
          ${row.formulaDateKey},
          ${row.sheetName},
          ${row.lineType},
          ${row.lineNumber},
          ${row.metricName},
          ${row.categoryNo},
          ${row.description},
          ${row.quantity},
          ${row.unitCost},
          ${row.lineCost},
          ${row.valueNumber},
          ${row.notes},
          ${JSON.stringify(row.metadata || {})}::jsonb,
          NOW(),
          NOW(),
          NOW()
        )
      `);
    }
  });
}
