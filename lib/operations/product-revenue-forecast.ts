import * as XLSX from 'xlsx';

export const FORECAST_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type ForecastMonth = (typeof FORECAST_MONTHS)[number];
export type MonthQtyMap = Record<string, number>;

export const FORECAST_MONTH_LABELS: Record<ForecastMonth, string> = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Aug',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dec',
};

export const FORECAST_MONTH_FULL_LABELS: Record<ForecastMonth, string> = {
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
};

export const PRODUCTION_TYPE_OPTIONS = ['Planned', 'MTO'] as const;
export const STATUS_FLAG_OPTIONS = ['LOST', 'OBS', 'NEW'] as const;

export type ProductRevenueForecastLineInput = {
  id?: string;
  customerId: string;
  customerName: string;
  customerGroup: string;
  customerPartNumber: string;
  itemSku: string;
  team: string;
  csr: string;
  productionType: string;
  statusFlag: string;
  annualBaseQty: number | null;
  forecastQty: MonthQtyMap;
  actualQty: MonthQtyMap;
  sortOrder: number;
};

export type ParsedProductRevenueForecastWorkbook = {
  sheetName: string;
  year: number;
  dataThru: string | null;
  rows: ProductRevenueForecastLineInput[];
};

type MatrixCell = string | number | Date | boolean | null | undefined;

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

export function emptyMonthQtyMap(): MonthQtyMap {
  return FORECAST_MONTHS.reduce<MonthQtyMap>((acc, month) => {
    acc[String(month)] = 0;
    return acc;
  }, {});
}

export function normalizeMonthQtyMap(value: unknown): MonthQtyMap {
  const next = emptyMonthQtyMap();
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  for (const month of FORECAST_MONTHS) {
    const raw = source[String(month)] ?? source[month as unknown as string];
    next[String(month)] = asNumber(raw) ?? 0;
  }
  return next;
}

export function monthQtyTotal(map: MonthQtyMap, months?: ForecastMonth[]): number {
  const keys = months?.length ? months : FORECAST_MONTHS;
  return keys.reduce((sum, month) => sum + (Number(map[String(month)]) || 0), 0);
}

export function closedThroughMonth(dataThru: string | Date | null | undefined): number {
  if (!dataThru) return 0;
  const iso = typeof dataThru === 'string' ? dataThru.slice(0, 10) : dataThru.toISOString().slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? month : 0;
}

export function closedMonths(dataThru: string | Date | null | undefined): ForecastMonth[] {
  const through = closedThroughMonth(dataThru);
  return FORECAST_MONTHS.filter((month) => month <= through);
}

export function remainingMonths(dataThru: string | Date | null | undefined): ForecastMonth[] {
  const through = closedThroughMonth(dataThru);
  return FORECAST_MONTHS.filter((month) => month > through);
}

export function ytdActualQty(actualQty: MonthQtyMap, dataThru: string | Date | null | undefined): number {
  return monthQtyTotal(actualQty, closedMonths(dataThru));
}

export function ytdForecastQty(forecastQty: MonthQtyMap, dataThru: string | Date | null | undefined): number {
  return monthQtyTotal(forecastQty, closedMonths(dataThru));
}

export function remainingForecastQty(forecastQty: MonthQtyMap, dataThru: string | Date | null | undefined): number {
  return monthQtyTotal(forecastQty, remainingMonths(dataThru));
}

export function monthIsClosed(month: ForecastMonth, dataThru: string | Date | null | undefined): boolean {
  const through = closedThroughMonth(dataThru);
  return through > 0 && month <= through;
}

export function monthQty(map: MonthQtyMap, month: ForecastMonth): number {
  return Number(map[String(month)]) || 0;
}

export function normalizeForecastCustomerId(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (/^\d+$/.test(raw)) return raw.replace(/^0+/, '') || '0';
  return raw;
}

export function forecastActualsExactKey(customerId: string, itemSku: string, customerPartNumber: string): string {
  return `${normalizeForecastCustomerId(customerId)}||${String(itemSku || '').trim().toUpperCase()}||${String(customerPartNumber || '').trim().toUpperCase()}`;
}

export function forecastActualsItemKey(customerId: string, itemSku: string): string {
  return `${normalizeForecastCustomerId(customerId)}||${String(itemSku || '').trim().toUpperCase()}`;
}

export type CsiShippedActuals = {
  ok: boolean;
  asOf: string | null;
  byExact: Map<string, MonthQtyMap>;
  byItem: Map<string, MonthQtyMap>;
};

export function emptyCsiShippedActuals(ok = false): CsiShippedActuals {
  return { ok, asOf: null, byExact: new Map(), byItem: new Map() };
}

export function overlayShippedActuals<T extends {
  customerId: string;
  itemSku: string;
  customerPartNumber: string;
  actualQty: MonthQtyMap;
}>(lines: T[], actuals: CsiShippedActuals): T[] {
  if (!actuals.ok) return lines;
  const itemCounts = new Map<string, number>();
  for (const line of lines) {
    const key = forecastActualsItemKey(line.customerId, line.itemSku);
    itemCounts.set(key, (itemCounts.get(key) || 0) + 1);
  }
  return lines.map((line) => {
    const exact = actuals.byExact.get(
      forecastActualsExactKey(line.customerId, line.itemSku, line.customerPartNumber)
    );
    const itemKey = forecastActualsItemKey(line.customerId, line.itemSku);
    const byItem = itemCounts.get(itemKey) === 1 ? actuals.byItem.get(itemKey) : undefined;
    const match = exact || byItem;
    return { ...line, actualQty: match ? match : emptyMonthQtyMap() };
  });
}

export function adjustedMonthQty(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  month: ForecastMonth,
  dataThru: string | Date | null | undefined
): number {
  return monthIsClosed(month, dataThru) ? monthQty(actualQty, month) : monthQty(forecastQty, month);
}

export function annualAdjustedQty(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  dataThru: string | Date | null | undefined
): number {
  return FORECAST_MONTHS.reduce(
    (sum, month) => sum + adjustedMonthQty(forecastQty, actualQty, month, dataThru),
    0
  );
}

export const FORECAST_QUARTERS = [1, 2, 3, 4] as const;
export type ForecastQuarter = (typeof FORECAST_QUARTERS)[number];

export const QUARTER_MONTHS: Record<ForecastQuarter, ForecastMonth[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
};

export function quarterForecastQty(forecastQty: MonthQtyMap, quarter: ForecastQuarter): number {
  return monthQtyTotal(forecastQty, QUARTER_MONTHS[quarter]);
}

export function quarterActualQty(actualQty: MonthQtyMap, quarter: ForecastQuarter): number {
  return monthQtyTotal(actualQty, QUARTER_MONTHS[quarter]);
}

export function quarterAdjustedQty(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  dataThru: string | Date | null | undefined,
  quarter: ForecastQuarter
): number {
  return QUARTER_MONTHS[quarter].reduce(
    (sum, month) => sum + adjustedMonthQty(forecastQty, actualQty, month, dataThru),
    0
  );
}

export function pctVsPlan(actualYtd: number, forecastYtd: number): number | null {
  if (!Number.isFinite(actualYtd) || !Number.isFinite(forecastYtd) || forecastYtd === 0) return null;
  return actualYtd / forecastYtd;
}

export function workbookImportErrorMessage(error: unknown, fallback = 'Failed to import workbook'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) return message;
  }
  const text = String(error ?? '').trim();
  return text && text !== '[object Object]' ? `${fallback}: ${text}` : fallback;
}

export function readProductOperationsWorkbook(
  data: ArrayBuffer | Uint8Array,
  _mode: 'forecast' | 'all' = 'all'
): XLSX.WorkBook {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
  return XLSX.read(bytes, { type: 'array', cellDates: true });
}

export async function parseForecastWorkbookFile(
  file: File,
  fallbackYear: number
): Promise<ParsedProductRevenueForecastWorkbook> {
  if (!file || file.size <= 0) {
    throw new Error('The selected file is empty.');
  }
  const workbook = readProductOperationsWorkbook(await file.arrayBuffer(), 'forecast');
  return parseProductRevenueForecastWorkbook(workbook, fallbackYear);
}

function findForecastSheetName(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames || [];
  const exact = names.find((name) => name.trim().toLowerCase() === 'forecasts current year');
  if (exact) return exact;
  const fuzzy = names.find((name) => {
    const lower = name.toLowerCase();
    return lower.includes('forecast') && lower.includes('current');
  });
  if (fuzzy) return fuzzy;
  if (names[0]) return names[0];
  throw new Error('Workbook has no sheets');
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

const FORECAST_COLS: Record<ForecastMonth, string> = {
  1: 'O',
  2: 'S',
  3: 'W',
  4: 'AE',
  5: 'AI',
  6: 'AM',
  7: 'AU',
  8: 'AY',
  9: 'BC',
  10: 'BK',
  11: 'BO',
  12: 'BS',
};

const ACTUAL_COLS: Record<ForecastMonth, string> = {
  1: 'Q',
  2: 'U',
  3: 'Y',
  4: 'AG',
  5: 'AK',
  6: 'AO',
  7: 'AW',
  8: 'BA',
  9: 'BE',
  10: 'BM',
  11: 'BQ',
  12: 'BU',
};

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

export function parseProductRevenueForecastWorkbook(
  workbook: XLSX.WorkBook,
  fallbackYear: number
): ParsedProductRevenueForecastWorkbook {
  const sheetName = findForecastSheetName(workbook);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" was not found`);

  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  if (!matrix.length) throw new Error(`Sheet "${sheetName}" is empty`);

  const dataThru = findDataThru(matrix);
  const year = dataThru ? Number(dataThru.slice(0, 4)) : fallbackYear;
  const rows: ProductRevenueForecastLineInput[] = [];

  for (let i = 0; i < matrix.length; i += 1) {
    const row = matrix[i];
    const itemSku = asString(cell(row, 'A'));
    const customerId = asString(cell(row, 'B'));
    const customerName = asString(cell(row, 'C'));
    if (!itemSku || !customerId || !customerName) continue;
    const lowerSku = itemSku.toLowerCase();
    if (
      lowerSku === 'apr p/n' ||
      lowerSku === 'item' ||
      lowerSku.includes('forecast') ||
      /^\d{4}-\d{2}-\d{2}$/.test(itemSku)
    ) {
      continue;
    }

    const forecastQty = emptyMonthQtyMap();
    const actualQty = emptyMonthQtyMap();
    for (const month of FORECAST_MONTHS) {
      forecastQty[String(month)] = asNumber(cell(row, FORECAST_COLS[month])) ?? 0;
      actualQty[String(month)] = asNumber(cell(row, ACTUAL_COLS[month])) ?? 0;
    }

    rows.push({
      customerId,
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
    throw new Error('No forecast rows found. Use the Forecasts Current Year sheet with APR P/N in column A.');
  }

  return { sheetName, year, dataThru, rows };
}
