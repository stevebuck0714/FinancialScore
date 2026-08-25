import * as XLSX from 'xlsx';
import {
  calcCbmFromInches,
  DEFAULT_SGP_FREIGHT_ASSUMPTIONS,
  normalizeSgpFreightAssumptions,
  type SgpFreightAssumptions,
} from '@/lib/operational/sgp-freight-calc';

export {
  calcCbmFromInches,
  calcItemFreight,
  calcPercentOfContainer,
  CUBIC_INCHES_PER_CBM,
  DEFAULT_SGP_FREIGHT_ASSUMPTIONS,
  futureDomesticRate,
  futureEstimatedFreightCost,
  isDomesticShipment,
  normalizeSgpFreightAssumptions,
} from '@/lib/operational/sgp-freight-calc';
export type { SgpFreightAssumptions } from '@/lib/operational/sgp-freight-calc';

type MatrixCell = string | number | Date | boolean | null | undefined;

export type ParsedSgpFreightRow = {
  itemSku: string;
  itemDescription: string | null;
  revision: string | null;
  quantityOrdered: number | null;
  orderMultiple: number | null;
  heightIn: number | null;
  widthIn: number | null;
  orderMinimum: number | null;
  lengthIn: number | null;
  cbm: number | null;
  unitWeight: number | null;
  unitCost: number | null;
  currentUnitCost: number | null;
  estimatedFreightCurrent: number | null;
  estimatedFreightFuture: number | null;
  percentOfContainer: number | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorCoo: string | null;
  shipmentType: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  qtyOnHand: number | null;
  nonNettableStock: number | null;
  safetyStock: number | null;
  allocatedQty: number | null;
  productCode: string | null;
  costType: string | null;
  costMethod: string | null;
  plannerCode: string | null;
  ratePerDay: number | null;
  leadTime: number | null;
  materialStatus: string | null;
  reason: string | null;
  lastChange: string | null;
  sheetUser: string | null;
};

export type ParsedSgpFreightWorkbook = {
  sheetName: string;
  rowCount: number;
  rows: ParsedSgpFreightRow[];
  assumptions: SgpFreightAssumptions;
};

function asString(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—' || /^#n\/?a$/i.test(text)) return '';
  return text;
}

function normalizeHeader(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[$()"]/g, '')
    .trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = asString(value).replace(/[$,%\s,]/g, '');
  if (!text || text === '-' || text === '—') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
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

function colIncludes(map: Map<string, number>, ...parts: string[]): number {
  const needles = parts.map((part) => normalizeHeader(part));
  for (const [key, index] of map.entries()) {
    if (needles.every((needle) => key.includes(needle))) return index;
  }
  return -1;
}

function readString(row: MatrixCell[], index: number): string {
  return index >= 0 ? asString(row[index]) : '';
}

function readDisplay(row: MatrixCell[], index: number): string {
  if (index < 0) return '';
  const value = row[index];
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const excelSerial = Math.round((value.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
    return String(excelSerial);
  }
  return asString(value);
}

function readNumber(row: MatrixCell[], index: number): number | null {
  return index >= 0 ? asNumber(row[index]) : null;
}

function asRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value) > 1 ? value / 100 : value;
  }
  const text = asString(value);
  const parsed = asNumber(value);
  if (parsed == null) return null;
  if (text.includes('%') || Math.abs(parsed) > 1) return parsed / 100;
  return parsed;
}

function readNearbyNumber(matrix: MatrixCell[][], rowIndex: number, colIndex: number, prefer: 'above' | 'below'): number | null {
  const offsets = prefer === 'above'
    ? [[-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, 1]]
    : [[1, 0], [-1, 0], [2, 0], [-2, 0], [0, 1], [0, -1]];
  for (const [rowDelta, colDelta] of offsets) {
    const row = matrix[rowIndex + rowDelta] || [];
    const value = readNumber(row, colIndex + colDelta);
    if (value != null) return value;
  }
  return null;
}

function readNearbyRate(matrix: MatrixCell[][], rowIndex: number, colIndex: number, prefer: 'above' | 'below'): number | null {
  const offsets = prefer === 'above'
    ? [[-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, 1]]
    : [[1, 0], [-1, 0], [2, 0], [-2, 0], [0, 1], [0, -1]];
  for (const [rowDelta, colDelta] of offsets) {
    const row = matrix[rowIndex + rowDelta] || [];
    const value = asRate(colIndex + colDelta >= 0 ? row[colIndex + colDelta] : null);
    if (value != null) return value;
  }
  return null;
}

function findLabelCells(matrix: MatrixCell[][], limit: number, match: (key: string) => boolean): Array<{ row: number; col: number }> {
  const found: Array<{ row: number; col: number }> = [];
  for (let rowIndex = 0; rowIndex < Math.min(limit, matrix.length); rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    row.forEach((cell, colIndex) => {
      if (match(normalizeHeader(cell))) found.push({ row: rowIndex, col: colIndex });
    });
  }
  return found;
}

export function parseSgpFreightAssumptions(matrix: MatrixCell[][], headerIndex: number): SgpFreightAssumptions {
  const limit = headerIndex >= 0 ? Math.max(0, headerIndex) : Math.min(matrix.length, 20);
  const assumptions = { ...DEFAULT_SGP_FREIGHT_ASSUMPTIONS };
  const domestic = findLabelCells(matrix, limit, (key) => key.includes('estimated domestic rate'))[0];
  const averageShipment = findLabelCells(matrix, limit, (key) => key.includes('average shipment cost'))[0];
  const estimatedFreight = findLabelCells(
    matrix,
    limit,
    (key) => key.includes('estimated freight cost') && !key.includes('per part')
  )[0];
  const container = findLabelCells(matrix, limit, (key) => key === 'cbms' || key === 'cbm s')[0];
  const increases = findLabelCells(matrix, limit, (key) => key === 'estimated increase' || key.startsWith('estimated increase'));

  if (domestic) {
    const rate = readNearbyRate(matrix, domestic.row, domestic.col, 'above');
    if (rate != null) assumptions.domesticRateCurrent = rate;
  }
  if (averageShipment) {
    const value = readNearbyNumber(matrix, averageShipment.row, averageShipment.col, 'above');
    if (value != null) assumptions.averageShipmentCost = value;
  }
  if (estimatedFreight) {
    const value = readNearbyNumber(matrix, estimatedFreight.row, estimatedFreight.col, 'above');
    if (value != null) assumptions.estimatedFreightCost = value;
  }
  if (container) {
    const value = readNearbyNumber(matrix, container.row, container.col, 'above');
    if (value != null) assumptions.containerCbm = value;
  }

  const domesticIncrease = increases.find((cell) => domestic && cell.col === domestic.col) || increases[0];
  const freightIncrease =
    increases.find((cell) => estimatedFreight && cell.col === estimatedFreight.col) ||
    increases.find((cell) => cell !== domesticIncrease) ||
    null;
  if (domesticIncrease) {
    const rate = readNearbyRate(matrix, domesticIncrease.row, domesticIncrease.col, 'below');
    if (rate != null) assumptions.domesticRateIncrease = rate;
  }
  if (freightIncrease) {
    const rate = readNearbyRate(matrix, freightIncrease.row, freightIncrease.col, 'below');
    if (rate != null) assumptions.freightCostIncrease = rate;
  }
  return normalizeSgpFreightAssumptions(assumptions);
}

export function deriveShipmentType(explicit: string | null | undefined, countryOfOrigin: string | null | undefined): string | null {
  const shipment = asString(explicit).toUpperCase();
  if (shipment) return shipment;
  const origin = asString(countryOfOrigin).toUpperCase();
  if (!origin) return null;
  if (['DOM', 'US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(origin)) return 'DOM';
  return 'OVERSEAS';
}

function pickFreightSheetName(workbook: XLSX.WorkBook): string | null {
  const names = workbook.SheetNames || [];
  return (
    names.find((name) => /sgp\s*freight/i.test(name)) ||
    names.find((name) => /^current freight$/i.test(name)) ||
    names.find((name) => /^freight$/i.test(name)) ||
    names.find((name) => /freight/i.test(name) && !/duty|tariff|forecast|customer pn/i.test(name)) ||
    null
  );
}

function mergeHeaderRow(matrix: MatrixCell[][], headerIndex: number): MatrixCell[] {
  const base = [...(matrix[headerIndex] || [])];
  const extra = matrix[headerIndex + 1] || [];
  const extraLooksLikeSubheader = extra.some((cell) => {
    const value = normalizeHeader(cell);
    return value === 'current' || value === 'future' || value === 'in' || value === '(in)';
  });
  if (!extraLooksLikeSubheader) return base;
  extra.forEach((cell, index) => {
    const top = asString(base[index]);
    const bottom = asString(cell);
    if (!bottom) return;
    if (!top) {
      base[index] = cell;
      return;
    }
    if (!normalizeHeader(top).includes(normalizeHeader(bottom))) {
      base[index] = `${top} ${bottom}`;
    }
  });
  return base;
}

function rowLooksLikeFreightHeader(headers: string[]): boolean {
  const hasItem = headers.some(
    (header) =>
      header === 'item' ||
      header === 'apr p/n' ||
      header === 'apr pn' ||
      header === 'apr p n' ||
      header.includes('apr p/n')
  );
  const hasFreightShape =
    headers.includes('cbm') ||
    headers.includes('order multiple') ||
    headers.includes('unit weight') ||
    headers.includes('quantity ordered') ||
    headers.some((header) => header.includes('estimated freight'));
  return hasItem && hasFreightShape;
}

function findHeaderIndex(matrix: MatrixCell[][]): number {
  for (let index = 0; index < matrix.length; index += 1) {
    const single = (matrix[index] || []).map((cell) => normalizeHeader(cell));
    if (rowLooksLikeFreightHeader(single)) return index;
    const merged = mergeHeaderRow(matrix, index).map((cell) => normalizeHeader(cell));
    if (rowLooksLikeFreightHeader(merged)) return index;
  }
  return -1;
}

function isSubheaderRow(row: MatrixCell[]): boolean {
  const values = (row || []).map((cell) => normalizeHeader(cell)).filter(Boolean);
  if (!values.length) return true;
  return values.every((value) => value === 'current' || value === 'future' || value === 'in' || value === '(in)');
}

export function parseSgpFreightWorkbook(workbook: XLSX.WorkBook): ParsedSgpFreightWorkbook | null {
  const sheetName = pickFreightSheetName(workbook);
  if (!sheetName || !workbook.Sheets[sheetName]) return null;
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    blankrows: false,
  });
  const headerIndex = findHeaderIndex(matrix);
  const assumptions = parseSgpFreightAssumptions(matrix, headerIndex);
  if (headerIndex < 0) return { sheetName, rowCount: 0, rows: [], assumptions };
  const columnMap = buildColumnMap(mergeHeaderRow(matrix, headerIndex));
  const freightCurrent = colIncludes(columnMap, 'estimated freight', 'current');
  const freightFuture = colIncludes(columnMap, 'estimated freight', 'future');
  const freightAny = colIncludes(columnMap, 'estimated freight');
  const indexes = {
    itemSku: col(columnMap, 'APR P/N', 'APR PN', 'APR P N', 'Item'),
    aprPn: col(columnMap, 'Item', 'APR P/N', 'APR PN', 'APR P N'),
    revision: col(columnMap, 'Revision'),
    quantityOrdered: col(columnMap, 'Quantity Ordered', 'Qty Ordered'),
    orderMultiple: col(columnMap, 'Order Multiple'),
    heightIn: col(columnMap, 'Height (in)', 'Height'),
    widthIn: col(columnMap, 'Width (in)', 'Width'),
    orderMinimum: col(columnMap, 'Order Minimum'),
    lengthIn: col(columnMap, 'Length (in)', 'Length'),
    cbm: col(columnMap, 'CBM'),
    unitWeight: col(columnMap, 'Unit Weight'),
    unitCost: col(columnMap, 'Unit Cost'),
    currentUnitCost: col(columnMap, 'Current Unit Cost'),
    estimatedFreightCurrent: freightCurrent >= 0 ? freightCurrent : freightAny,
    estimatedFreightFuture: freightFuture,
    percentOfContainer: col(columnMap, '% of Container', 'Percent of Container'),
    vendorId: col(columnMap, 'Current Vendor #', 'Vendor #', 'Vendor Number'),
    vendorName: col(columnMap, 'Current Vendor Name', 'Vendor Name', 'Vendor'),
    vendorCoo: col(columnMap, 'Current Vendor COO', 'Vendor COO'),
    shipmentType: col(columnMap, 'Shipment Type'),
    htsCode: col(columnMap, 'HTS Code', 'HTS', 'HTS-10', 'HTS Number'),
    countryOfOrigin: col(columnMap, 'Country Of Origin', 'Country of Origin', 'COO', 'Origin'),
    qtyOnHand: col(columnMap, 'Quantity On Hand', 'Qty On Hand', 'Qty OH'),
    nonNettableStock: col(columnMap, 'Non-Nettable Stock', 'Non Nettable Stock'),
    safetyStock: col(columnMap, 'Safety Stock'),
    allocatedQty: col(columnMap, 'Allocated To Customer Orders', 'Allocated'),
    productCode: col(columnMap, 'Product Code'),
    costType: col(columnMap, 'Cost Type'),
    costMethod: col(columnMap, 'Cost Method'),
    plannerCode: col(columnMap, 'Planner Code', 'Planner'),
    ratePerDay: col(columnMap, 'Rate/Day', 'Rate / Day'),
    leadTime: col(columnMap, 'Lead Time'),
    materialStatus: col(columnMap, 'Material Status'),
    reason: col(columnMap, 'Reason'),
    lastChange: col(columnMap, 'Last Change'),
    sheetUser: col(columnMap, 'User'),
  };

  const rows: ParsedSgpFreightRow[] = [];
  const seen = new Set<string>();
  const dataStart = isSubheaderRow(matrix[headerIndex + 1] || []) ? headerIndex + 2 : headerIndex + 1;
  for (let rowIndex = dataStart; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const itemSku = readString(row, indexes.itemSku) || readString(row, indexes.aprPn);
    if (!itemSku || seen.has(itemSku.toUpperCase())) continue;
    seen.add(itemSku.toUpperCase());
    const heightIn = readNumber(row, indexes.heightIn);
    const widthIn = readNumber(row, indexes.widthIn);
    const lengthIn = readNumber(row, indexes.lengthIn);
    const parsedCbm = readNumber(row, indexes.cbm);
    const cbm = parsedCbm ?? calcCbmFromInches(heightIn, widthIn, lengthIn);
    const vendorCoo = readString(row, indexes.vendorCoo) || null;
    const countryOfOrigin = readString(row, indexes.countryOfOrigin) || vendorCoo;
    rows.push({
      itemSku,
      itemDescription: null,
      revision: readString(row, indexes.revision) || null,
      quantityOrdered: readNumber(row, indexes.quantityOrdered),
      orderMultiple: readNumber(row, indexes.orderMultiple),
      heightIn,
      widthIn,
      orderMinimum: readNumber(row, indexes.orderMinimum),
      lengthIn,
      cbm,
      unitWeight: readNumber(row, indexes.unitWeight),
      unitCost: readNumber(row, indexes.unitCost),
      currentUnitCost: readNumber(row, indexes.currentUnitCost),
      estimatedFreightCurrent: readNumber(row, indexes.estimatedFreightCurrent),
      estimatedFreightFuture: readNumber(row, indexes.estimatedFreightFuture),
      percentOfContainer: readNumber(row, indexes.percentOfContainer),
      vendorId: readString(row, indexes.vendorId) || null,
      vendorName: readString(row, indexes.vendorName) || null,
      vendorCoo,
      shipmentType: deriveShipmentType(readString(row, indexes.shipmentType), vendorCoo || countryOfOrigin),
      htsCode: readString(row, indexes.htsCode) || null,
      countryOfOrigin,
      qtyOnHand: readNumber(row, indexes.qtyOnHand),
      nonNettableStock: readNumber(row, indexes.nonNettableStock),
      safetyStock: readNumber(row, indexes.safetyStock),
      allocatedQty: readNumber(row, indexes.allocatedQty),
      productCode: readString(row, indexes.productCode) || null,
      costType: readString(row, indexes.costType) || null,
      costMethod: readString(row, indexes.costMethod) || null,
      plannerCode: readString(row, indexes.plannerCode) || null,
      ratePerDay: readNumber(row, indexes.ratePerDay),
      leadTime: readNumber(row, indexes.leadTime),
      materialStatus: readString(row, indexes.materialStatus) || null,
      reason: readString(row, indexes.reason) || null,
      lastChange: readDisplay(row, indexes.lastChange) || null,
      sheetUser: readString(row, indexes.sheetUser) || null,
    });
  }
  return { sheetName, rowCount: rows.length, rows, assumptions };
}
