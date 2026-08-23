import * as XLSX from 'xlsx';
import {
  FORECAST_MONTHS,
  emptyMonthQtyMap,
  type ForecastMonth,
  type MonthQtyMap,
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';

export type VendorMonthlyForecastLineInput = ProductRevenueForecastLineInput & {
  vendorId: string;
  vendorName: string;
};

export type ParsedVendorMonthlyForecastWorkbook = {
  sheetName: string;
  year: number;
  dataThru: string | null;
  rows: VendorMonthlyForecastLineInput[];
};

type MatrixCell = string | number | Date | boolean | null | undefined;

export const UNASSIGNED_VENDOR_ID = '';
export const UNASSIGNED_VENDOR_NAME = 'Unassigned';

/** Typed SGP estimated qty: annual J plus one column per month. */
export const SGP_ESTIMATED_COLS: Record<ForecastMonth, string> = {
  1: 'N',
  2: 'Q',
  3: 'T',
  4: 'Z',
  5: 'AC',
  6: 'AF',
  7: 'AL',
  8: 'AO',
  9: 'AR',
  10: 'AX',
  11: 'BA',
  12: 'BD',
};

/** Monthly YTD actuals — imported from operations data, not typed on the sheet. */
export const SGP_ACTUAL_COLS: Record<ForecastMonth, string> = {
  1: 'O',
  2: 'R',
  3: 'U',
  4: 'AA',
  5: 'AD',
  6: 'AG',
  7: 'AM',
  8: 'AP',
  9: 'AS',
  10: 'AY',
  11: 'BB',
  12: 'BE',
};

function asString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = asString(value).replace(/[$,%\s,]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDateIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }
  const text = asString(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function cell(row: MatrixCell[] | undefined, letter: string): unknown {
  return row?.[colIndex(letter)];
}

function sheetToMatrix(sheet: XLSX.WorkSheet): MatrixCell[][] {
  return XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
}

function normalizeProductionType(value: unknown): string {
  const text = asString(value).toUpperCase();
  if (text === 'PLANNED' || text === 'P') return 'Planned';
  if (text === 'MTO' || text === 'MAKE TO ORDER' || text === 'MAKE-TO-ORDER') return 'MTO';
  return asString(value);
}

function normalizeStatusFlag(value: unknown): string {
  const text = asString(value).toUpperCase();
  if (text === 'LOST' || text === 'OBS' || text === 'NEW') return text;
  return asString(value);
}

export function findVendorSgpForecastSheetName(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames || [];
  const normalized = names.map((name) => ({ name, lower: name.trim().toLowerCase() }));
  const exact = normalized.find((row) => row.lower === 'forecasts 2026 sgp' || row.lower === 'sgp forecasts current');
  if (exact) return exact.name;
  const fuzzy = normalized.find((row) => {
    const lower = row.lower;
    if (!lower.includes('forecast') || !lower.includes('sgp')) return false;
    if (lower.includes('annual') || lower.includes('discrep') || lower.includes('exposure')) return false;
    if (lower.includes('review') || lower.includes('issues') || lower.includes('group')) return false;
    if (lower.includes('pricing') || lower.includes('gmpa')) return false;
    return true;
  });
  if (fuzzy) return fuzzy.name;
  throw new Error('Workbook is missing the Forecasts 2026 SGP sheet (also named SGP Forecasts Current).');
}

function findDataThru(matrix: MatrixCell[][]): string | null {
  for (let r = 0; r < Math.min(8, matrix.length); r += 1) {
    const row = matrix[r] || [];
    for (let c = 0; c < Math.min(8, row.length); c += 1) {
      const label = asString(row[c]).toLowerCase();
      if (label.includes('data thru') || label.includes('data through')) {
        return asDateIso(row[c + 1]) || asDateIso(row[c + 2]);
      }
    }
  }
  return asDateIso(cell(matrix[3], 'B'));
}

function vendorKey(itemSku: string, customerId: string, customerName: string): string {
  return `${itemSku.toUpperCase()}||${customerId.toUpperCase()}||${customerName.toUpperCase()}`;
}

function buildVendorLookup(workbook: XLSX.WorkBook): Map<string, { vendorId: string; vendorName: string }> {
  const lookup = new Map<string, { vendorId: string; vendorName: string }>();
  for (const sheetName of workbook.SheetNames || []) {
    const lower = sheetName.toLowerCase();
    if (!lower.includes('annual') && !lower.includes('gmpa') && !lower.includes('customer')) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = sheetToMatrix(sheet);
    const headerIndex = matrix.findIndex((row) => {
      const a = asString(cell(row, 'A')).toLowerCase();
      const b = asString(cell(row, 'B')).toLowerCase();
      return a === 'item' && (b === 'customer id' || b === 'customerid');
    });
    if (headerIndex < 0) continue;
    const header = matrix[headerIndex] || [];
    const vendorIdIndex = header.findIndex((value) => /vendor\s*#|vendor\s*id|vendor num/i.test(asString(value)));
    const vendorNameIndex = header.findIndex((value) => /vendor\s*name/i.test(asString(value)));
    if (vendorIdIndex < 0 && vendorNameIndex < 0) continue;
    for (let i = headerIndex + 1; i < matrix.length; i += 1) {
      const row = matrix[i] || [];
      const itemSku = asString(cell(row, 'A'));
      const customerId = asString(cell(row, 'B'));
      const customerName = asString(cell(row, 'C'));
      if (!itemSku || (!customerId && !customerName)) continue;
      const vendorId = asString(row[vendorIdIndex]);
      const vendorName = asString(row[vendorNameIndex]);
      if (!vendorId && !vendorName) continue;
      lookup.set(vendorKey(itemSku, customerId, customerName), {
        vendorId: vendorId || UNASSIGNED_VENDOR_ID,
        vendorName: vendorName || vendorId || UNASSIGNED_VENDOR_NAME,
      });
    }
  }
  return lookup;
}

function isHeaderSku(itemSku: string): boolean {
  const lower = itemSku.toLowerCase();
  return (
    lower === 'apr p/n' ||
    lower === 'item' ||
    lower.includes('forecast') ||
    /^\d{4}-\d{2}-\d{2}$/.test(itemSku)
  );
}

export function parseVendorMonthlyForecastWorkbook(
  workbook: XLSX.WorkBook,
  fallbackYear: number
): ParsedVendorMonthlyForecastWorkbook {
  const sheetName = findVendorSgpForecastSheetName(workbook);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" was not found`);

  const matrix = sheetToMatrix(sheet);
  if (!matrix.length) throw new Error(`Sheet "${sheetName}" is empty`);

  const dataThru = findDataThru(matrix);
  const yearFromSheet = dataThru ? Number(dataThru.slice(0, 4)) : NaN;
  const year = Number.isInteger(yearFromSheet) && yearFromSheet >= fallbackYear ? yearFromSheet : fallbackYear;
  const vendorLookup = buildVendorLookup(workbook);
  const rows: VendorMonthlyForecastLineInput[] = [];

  for (let i = 0; i < matrix.length; i += 1) {
    const row = matrix[i];
    const itemSku = asString(cell(row, 'A'));
    const customerId = asString(cell(row, 'B'));
    const customerName = asString(cell(row, 'C'));
    if (!itemSku || !customerName) continue;
    if (isHeaderSku(itemSku)) continue;

    const forecastQty = emptyMonthQtyMap();
    const actualQty = emptyMonthQtyMap();
    for (const month of FORECAST_MONTHS) {
      forecastQty[String(month)] = asNumber(cell(row, SGP_ESTIMATED_COLS[month])) ?? 0;
      actualQty[String(month)] = asNumber(cell(row, SGP_ACTUAL_COLS[month])) ?? 0;
    }

    const vendor = vendorLookup.get(vendorKey(itemSku, customerId, customerName));
    rows.push({
      vendorId: vendor?.vendorId || UNASSIGNED_VENDOR_ID,
      vendorName: vendor?.vendorName || UNASSIGNED_VENDOR_NAME,
      customerId: customerId || customerName,
      customerName,
      customerGroup: asString(cell(row, 'D')),
      customerPartNumber: asString(cell(row, 'E')),
      itemSku,
      team: asString(cell(row, 'F')),
      csr: asString(cell(row, 'G')),
      productionType: normalizeProductionType(cell(row, 'H')),
      statusFlag: normalizeStatusFlag(cell(row, 'I')),
      annualBaseQty: asNumber(cell(row, 'J')),
      forecastQty,
      actualQty,
      sortOrder: rows.length,
    });
  }

  if (!rows.length) {
    throw new Error('No monthly forecast rows found. Use the Forecasts 2026 SGP sheet with APR P/N in column A.');
  }

  return { sheetName, year, dataThru, rows };
}

export function vendorOptionKey(vendorId: string, vendorName: string): string {
  return `${vendorId || UNASSIGNED_VENDOR_ID}||${vendorName || UNASSIGNED_VENDOR_NAME}`;
}

export function parseVendorOptionKey(key: string): { vendorId: string; vendorName: string } {
  const [vendorId, ...rest] = String(key || '').split('||');
  return {
    vendorId: vendorId || UNASSIGNED_VENDOR_ID,
    vendorName: rest.join('||') || UNASSIGNED_VENDOR_NAME,
  };
}

export function monthlyEstimatedPct(actual: number, estimated: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(estimated) || estimated === 0) return null;
  return actual / estimated;
}
