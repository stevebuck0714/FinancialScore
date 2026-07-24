import * as XLSX from 'xlsx';

export const APR_SGP_GMPA_SOURCE_CODE = 'APR_SGP_GMPA_FORECAST';
export const APR_SGP_GMPA_LABEL = 'APR SGP GMPA Forecast Worksheet';

type MatrixCell = string | number | Date | boolean | null | undefined;

export type AprSgpGmpaRow = {
  itemId: string;
  customerId: string | null;
  customerName: string;
  customerGroup: string | null;
  customerPartNumber: string | null;
  sgpPrice: number | null;
  sgpMaterialCost: number | null;
  sgpTariffPerPiece: number | null;
  sgpDutiesPerPiece: number | null;
  sgpFreightPerPiece: number | null;
  sgpCostOfSales: number | null;
  sgpOperatingExpensesPerPiece: number | null;
  sgpFullyLoadedCost: number | null;
  sgpNetProfit: number | null;
  sgpNetProfitPct: number | null;
  sgpGrossMarginPct: number | null;
  currentPrice: number | null;
  updatedMaterialCost: number | null;
  projectedTariffPerPiece: number | null;
  projectedDutiesPerPiece: number | null;
  projectedFreightPerPiece: number | null;
  projectedCostOfSales: number | null;
  projectedOperatingExpensesPerPiece: number | null;
  projectedFullyLoadedCost: number | null;
  projectedNetProfit: number | null;
  projectedNetProfitPct: number | null;
  projectedGrossMarginPct: number | null;
};

export type ParsedAprSgpGmpaWorkbook = {
  sourceName: string;
  parsedAt: string;
  sheetNames: string[];
  sheetName: string;
  sourceDateIso: string;
  rowCount: number;
  customerCount: number;
  itemCount: number;
  rows: AprSgpGmpaRow[];
};

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return asString(value).toLowerCase().replace(/\s+/g, ' ').replace(/[$()]/g, '').trim();
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
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findHeaderIndex(matrix: MatrixCell[][]): number {
  return matrix.findIndex((row) =>
    normalizeHeader(row?.[0]) === 'item' &&
    normalizeHeader(row?.[1]) === 'customer id' &&
    normalizeHeader(row?.[2]) === 'customer'
  );
}

function buildColumnMap(headerRow: MatrixCell[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function col(map: Map<string, number>, ...headers: string[]): number {
  for (const header of headers) {
    const index = map.get(normalizeHeader(header));
    if (index != null) return index;
  }
  return -1;
}

function readString(row: MatrixCell[], index: number): string {
  return index >= 0 ? asString(row[index]) : '';
}

function readNumber(row: MatrixCell[], index: number): number | null {
  return index >= 0 ? asNumber(row[index]) : null;
}

export function normalizeAprSgpMatchToken(value: unknown): string {
  return asString(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

export function buildAprSgpMatchKeys(row: {
  customerId?: unknown;
  customerName?: unknown;
  itemId?: unknown;
  sku?: unknown;
  itemName?: unknown;
}): string[] {
  const item = normalizeAprSgpMatchToken(row.itemId || row.sku || row.itemName);
  const customerId = normalizeAprSgpMatchToken(row.customerId);
  const customerName = normalizeAprSgpMatchToken(row.customerName);
  return [
    customerId && item ? `ID:${customerId}|ITEM:${item}` : '',
    customerName && item ? `NAME:${customerName}|ITEM:${item}` : '',
  ].filter(Boolean);
}

export function buildAprSgpItemCustomerPartKeys(row: {
  itemId?: unknown;
  sku?: unknown;
  itemName?: unknown;
  customerPartNumber?: unknown;
  aprSgpCustomerPartNumber?: unknown;
}): string[] {
  const item = normalizeAprSgpMatchToken(row.itemId || row.sku || row.itemName);
  const customerPartNumber = normalizeAprSgpMatchToken(row.customerPartNumber || row.aprSgpCustomerPartNumber);
  return item && customerPartNumber ? [`ITEM:${item}|CUSTOMER_PART:${customerPartNumber}`] : [];
}

export function parseAprSgpGmpaWorkbook(workbook: XLSX.WorkBook): ParsedAprSgpGmpaWorkbook {
  const sheetName = workbook.SheetNames.find((name) => /annual by customer/i.test(name)) || workbook.SheetNames[0];
  if (!sheetName) throw new Error(`${APR_SGP_GMPA_LABEL} has no worksheets.`);
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, { header: 1, raw: true, blankrows: false });
  const sourceDate = asDate(matrix[1]?.[1]);
  if (!sourceDate) throw new Error(`${APR_SGP_GMPA_LABEL} is missing a valid date in B2.`);

  const headerIndex = findHeaderIndex(matrix);
  if (headerIndex < 0) throw new Error(`${APR_SGP_GMPA_LABEL} is missing the Item / Customer ID / Customer header row.`);
  const columnMap = buildColumnMap(matrix[headerIndex] || []);

  const indexes = {
    itemId: col(columnMap, 'Item'),
    customerId: col(columnMap, 'Customer ID'),
    customerName: col(columnMap, 'Customer'),
    customerGroup: col(columnMap, 'Customer Group'),
    customerPartNumber: col(columnMap, 'Customer P/N'),
    sgpPrice: col(columnMap, 'SGP Price'),
    sgpMaterialCost: col(columnMap, 'SGP Cost of Material'),
    sgpTariffPerPiece: col(columnMap, 'SGP Impact of Tariff per Piece'),
    sgpDutiesPerPiece: col(columnMap, 'SGP Impact of Duties per Piece'),
    sgpFreightPerPiece: col(columnMap, 'SGP Cost of Freight per Piece'),
    sgpCostOfSales: col(columnMap, 'SGP Cost of Sales'),
    sgpOperatingExpensesPerPiece: col(columnMap, 'SGP Operating Expenses'),
    sgpFullyLoadedCost: col(columnMap, 'SGP Fully Loaded Cost'),
    sgpNetProfit: col(columnMap, 'SGP Net Profit'),
    sgpNetProfitPct: col(columnMap, 'SGP Net Profit %', 'SGP Net Profit'),
    sgpGrossMarginPct: col(columnMap, 'SGP Gross Margin %'),
    currentPrice: col(columnMap, 'Current Price'),
    updatedMaterialCost: col(columnMap, 'Updated Cost of Material'),
    projectedTariffPerPiece: col(columnMap, 'Projected Impact of Tariff'),
    projectedDutiesPerPiece: col(columnMap, 'Projected Impact of Duties'),
    projectedFreightPerPiece: col(columnMap, 'Projected Cost of Freight per Piece'),
    projectedCostOfSales: col(columnMap, 'Projected Cost of Sales'),
    projectedOperatingExpensesPerPiece: col(columnMap, 'Projected Operating Expenses'),
    projectedFullyLoadedCost: col(columnMap, 'Projected Fully Loaded Cost'),
    projectedNetProfit: col(columnMap, 'Projected Net Profit'),
    projectedNetProfitPct: col(columnMap, 'Projected Net Profit %'),
    projectedGrossMarginPct: col(columnMap, 'Projected Gross Margin %'),
  };

  const rows: AprSgpGmpaRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const itemId = readString(row, indexes.itemId);
    const customerName = readString(row, indexes.customerName);
    if (!itemId || !customerName) continue;
    rows.push({
      itemId,
      customerId: readString(row, indexes.customerId) || null,
      customerName,
      customerGroup: readString(row, indexes.customerGroup) || null,
      customerPartNumber: readString(row, indexes.customerPartNumber) || null,
      sgpPrice: readNumber(row, indexes.sgpPrice),
      sgpMaterialCost: readNumber(row, indexes.sgpMaterialCost),
      sgpTariffPerPiece: readNumber(row, indexes.sgpTariffPerPiece),
      sgpDutiesPerPiece: readNumber(row, indexes.sgpDutiesPerPiece),
      sgpFreightPerPiece: readNumber(row, indexes.sgpFreightPerPiece),
      sgpCostOfSales: readNumber(row, indexes.sgpCostOfSales),
      sgpOperatingExpensesPerPiece: readNumber(row, indexes.sgpOperatingExpensesPerPiece),
      sgpFullyLoadedCost: readNumber(row, indexes.sgpFullyLoadedCost),
      sgpNetProfit: readNumber(row, indexes.sgpNetProfit),
      sgpNetProfitPct: readNumber(row, indexes.sgpNetProfitPct),
      sgpGrossMarginPct: readNumber(row, indexes.sgpGrossMarginPct),
      currentPrice: readNumber(row, indexes.currentPrice),
      updatedMaterialCost: readNumber(row, indexes.updatedMaterialCost),
      projectedTariffPerPiece: readNumber(row, indexes.projectedTariffPerPiece),
      projectedDutiesPerPiece: readNumber(row, indexes.projectedDutiesPerPiece),
      projectedFreightPerPiece: readNumber(row, indexes.projectedFreightPerPiece),
      projectedCostOfSales: readNumber(row, indexes.projectedCostOfSales),
      projectedOperatingExpensesPerPiece: readNumber(row, indexes.projectedOperatingExpensesPerPiece),
      projectedFullyLoadedCost: readNumber(row, indexes.projectedFullyLoadedCost),
      projectedNetProfit: readNumber(row, indexes.projectedNetProfit),
      projectedNetProfitPct: readNumber(row, indexes.projectedNetProfitPct),
      projectedGrossMarginPct: readNumber(row, indexes.projectedGrossMarginPct),
    });
  }

  if (!rows.length) throw new Error(`${APR_SGP_GMPA_LABEL} did not contain any customer/item rows.`);
  return {
    sourceName: APR_SGP_GMPA_LABEL,
    parsedAt: new Date().toISOString(),
    sheetNames: workbook.SheetNames,
    sheetName,
    sourceDateIso: sourceDate.toISOString(),
    rowCount: rows.length,
    customerCount: new Set(rows.map((row) => row.customerId || row.customerName)).size,
    itemCount: new Set(rows.map((row) => row.itemId)).size,
    rows,
  };
}

export async function readAprSgpGmpaWorkbook(companyId: string): Promise<ParsedAprSgpGmpaWorkbook | null> {
  const { getOperationalSystemConnection } = await import('@/lib/operational/operational-system-connections');
  const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
  const metadata = connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
    ? connection.connectionMetadata
    : {};
  const parsed = metadata.aprSgpGmpaParsedWorkbook;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const rows = Array.isArray((parsed as any).rows) ? (parsed as any).rows : [];
  if (!rows.length) return null;
  return parsed as ParsedAprSgpGmpaWorkbook;
}
