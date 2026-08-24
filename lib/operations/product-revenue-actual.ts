import * as XLSX from 'xlsx';
import {
  FORECAST_MONTHS,
  FORECAST_QUARTERS,
  QUARTER_MONTHS,
  adjustedMonthQty,
  emptyMonthQtyMap,
  monthQty,
  monthQtyTotal,
  normalizeAdjustedQtyMap,
  normalizeMonthQtyMap,
  parseProductRevenueForecastWorkbook,
  readProductOperationsWorkbook,
  type ForecastMonth,
  type ForecastQuarter,
  type MonthQtyMap,
  type ParsedProductRevenueForecastWorkbook,
} from '@/lib/operations/product-revenue-forecast';
import { type ShippingDay } from '@/lib/operations/product-shipping-days';
import {
  parseGoalDashboardFromWorkbook,
  type GoalUpdateSnapshot,
  type PyramidSnapshot,
} from '@/lib/operations/product-goal-update';

export type { ShippingDay };

export type ProductRevenuePriceInput = {
  customerGroup: string;
  itemSku: string;
  contractPrice: number | null;
  sgpPrice: number | null;
};

export type ProductRevenueLineInput = {
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
  actualRevenue: MonthQtyMap;
  sortOrder: number;
};

export type ParsedProductRevenueWorkbook = {
  sheetName: string;
  year: number;
  dataThru: string | null;
  rows: ProductRevenueLineInput[];
  prices: ProductRevenuePriceInput[];
  shippingDays: ShippingDay[];
  forecast: ParsedProductRevenueForecastWorkbook | null;
  goalUpdate?: GoalUpdateSnapshot | null;
  pyramid?: PyramidSnapshot | null;
};

export type JoinedRevenueLine = ProductRevenueLineInput & {
  id: string;
  annualBaseQty: number | null;
  forecastQty: MonthQtyMap;
  actualQty: MonthQtyMap;
  adjustedQty: MonthQtyMap;
  contractPrice: number | null;
  sgpPrice: number | null;
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

export function normalizeMatchToken(value: unknown): string {
  return asString(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

export function revenueLineKey(row: {
  customerId?: unknown;
  itemSku?: unknown;
  customerPartNumber?: unknown;
}): string {
  return [
    asString(row.customerId).toUpperCase(),
    normalizeMatchToken(row.itemSku),
    normalizeMatchToken(row.customerPartNumber),
  ].join('||');
}

export function priceKey(customerGroup: unknown, itemSku: unknown): string {
  return `${normalizeMatchToken(customerGroup)}||${normalizeMatchToken(itemSku)}`;
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

function findSheetName(names: string[], matcher: (name: string) => boolean, fallback?: string): string | null {
  const exact = names.find(matcher);
  return exact || fallback || null;
}

function findRevenueSheetName(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames || [];
  const exact = names.find((name) => name.trim().toLowerCase() === 'revenue current year');
  if (exact) return exact;
  const fuzzy = names.find((name) => {
    const lower = name.toLowerCase();
    return lower.includes('revenue') && lower.includes('current');
  });
  if (fuzzy) return fuzzy;
  throw new Error('Workbook is missing the Revenue Current Year sheet.');
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
  return asDateIso(cell(matrix[3], 'B')) || asDateIso(cell(matrix[3], 'L'));
}

const ACTUAL_REVENUE_COLS: Record<ForecastMonth, string> = {
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

function parseRevenueRows(matrix: MatrixCell[][]): ProductRevenueLineInput[] {
  const rows: ProductRevenueLineInput[] = [];
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
      lowerSku.includes('estimated') ||
      lowerSku.includes('revenue') ||
      /^\d{4}-\d{2}-\d{2}$/.test(itemSku)
    ) {
      continue;
    }

    const actualRevenue = emptyMonthQtyMap();
    for (const month of FORECAST_MONTHS) {
      actualRevenue[String(month)] = asNumber(cell(row, ACTUAL_REVENUE_COLS[month])) ?? 0;
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
      actualRevenue,
      sortOrder: rows.length,
    });
  }
  return rows;
}

function parseContractPrices(workbook: XLSX.WorkBook, year: number): ProductRevenuePriceInput[] {
  const names = workbook.SheetNames || [];
  const preferred = `${year}-01-01 Yr Pricing`;
  const sheetName = findSheetName(
    names,
    (name) => name.trim().toLowerCase() === preferred.toLowerCase(),
    names.find((name) => {
      const lower = name.toLowerCase();
      return lower.includes('yr pricing') && !lower.includes('most recent') && !lower.includes('sgp');
    })
  );
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  const prices: ProductRevenuePriceInput[] = [];
  const seen = new Set<string>();
  for (const row of matrix) {
    const customerGroup = asString(cell(row, 'A'));
    const itemSku = asString(cell(row, 'D'));
    const contractPrice = asNumber(cell(row, 'I'));
    if (!customerGroup || !itemSku || contractPrice == null) continue;
    if (customerGroup.toLowerCase() === 'customer group' || itemSku.toLowerCase() === 'item') continue;
    const key = priceKey(customerGroup, itemSku);
    if (seen.has(key)) continue;
    seen.add(key);
    prices.push({ customerGroup, itemSku, contractPrice, sgpPrice: null });
  }
  return prices;
}

function parseSgpPrices(workbook: XLSX.WorkBook): ProductRevenuePriceInput[] {
  const names = workbook.SheetNames || [];
  const sheetName = findSheetName(
    names,
    (name) => name.trim().toLowerCase() === 'current yr pricing sgp gmpa',
    names.find((name) => {
      const lower = name.toLowerCase();
      return lower.includes('sgp') && lower.includes('pricing');
    })
  );
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  const prices: ProductRevenuePriceInput[] = [];
  const seen = new Set<string>();
  for (const row of matrix) {
    const customerGroup = asString(cell(row, 'A'));
    const itemSku = asString(cell(row, 'B'));
    const sgpPrice = asNumber(cell(row, 'C'));
    if (!customerGroup || !itemSku || sgpPrice == null) continue;
    if (customerGroup.toLowerCase() === 'customer group' || itemSku.toLowerCase() === 'item') continue;
    const key = priceKey(customerGroup, itemSku);
    if (seen.has(key)) continue;
    seen.add(key);
    prices.push({ customerGroup, itemSku, contractPrice: null, sgpPrice });
  }
  return prices;
}

function mergePrices(contract: ProductRevenuePriceInput[], sgp: ProductRevenuePriceInput[]): ProductRevenuePriceInput[] {
  const byKey = new Map<string, ProductRevenuePriceInput>();
  for (const row of [...contract, ...sgp]) {
    const key = priceKey(row.customerGroup, row.itemSku);
    const prior = byKey.get(key);
    byKey.set(key, {
      customerGroup: row.customerGroup || prior?.customerGroup || '',
      itemSku: row.itemSku || prior?.itemSku || '',
      contractPrice: row.contractPrice ?? prior?.contractPrice ?? null,
      sgpPrice: row.sgpPrice ?? prior?.sgpPrice ?? null,
    });
  }
  return Array.from(byKey.values());
}

function parseShippingDays(workbook: XLSX.WorkBook): ShippingDay[] {
  const names = workbook.SheetNames || [];
  const sheetName = findSheetName(
    names,
    (name) => name.trim().toLowerCase() === 'shipping days',
    names.find((name) => name.toLowerCase().includes('shipping') && name.toLowerCase().includes('day'))
  );
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  const days: ShippingDay[] = [];
  const seen = new Set<string>();
  for (const row of matrix) {
    const date = asDateIso(cell(row, 'H'));
    if (!date) continue;
    const shipRaw = asString(cell(row, 'K')).toUpperCase();
    if (!shipRaw || shipRaw === 'SHIP') continue;
    if (seen.has(date)) continue;
    seen.add(date);
    days.push({ date, ship: shipRaw === 'YES' || shipRaw === 'Y' || shipRaw === 'TRUE' });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export function compactParsedRevenueWorkbook(parsed: ParsedProductRevenueWorkbook) {
  return {
    sheetName: parsed.sheetName,
    year: parsed.year,
    dataThru: parsed.dataThru,
    rows: parsed.rows,
    prices: parsed.prices,
    forecast: parsed.forecast
      ? {
          sheetName: parsed.forecast.sheetName,
          year: parsed.forecast.year,
          dataThru: parsed.forecast.dataThru,
          rows: parsed.forecast.rows,
        }
      : null,
    goalUpdate: parsed.goalUpdate || null,
    pyramid: parsed.pyramid || null,
  };
}

export async function parseProductOperationsFile(
  file: File,
  fallbackYear: number,
  options?: { allowForecastOnly?: boolean }
): Promise<ParsedProductRevenueWorkbook> {
  const workbook = readProductOperationsWorkbook(await file.arrayBuffer(), 'all');
  try {
    return parseProductRevenueWorkbook(workbook, fallbackYear);
  } catch (error) {
    if (!options?.allowForecastOnly) throw error;
    const forecast = parseProductRevenueForecastWorkbook(workbook, fallbackYear);
    const goals = parseGoalDashboardFromWorkbook(workbook);
    return {
      sheetName: forecast.sheetName,
      year: forecast.year,
      dataThru: forecast.dataThru,
      rows: [],
      prices: [],
      shippingDays: [],
      forecast,
      goalUpdate: goals.goalUpdate,
      pyramid: goals.pyramid,
    };
  }
}

export function parseProductRevenueWorkbook(
  workbook: XLSX.WorkBook,
  fallbackYear: number
): ParsedProductRevenueWorkbook {
  const sheetName = findRevenueSheetName(workbook);
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
  const rows = parseRevenueRows(matrix);
  if (!rows.length) {
    throw new Error('No revenue rows found. Use the Revenue Current Year sheet with APR P/N in column A.');
  }

  let forecast: ParsedProductRevenueForecastWorkbook | null = null;
  try {
    forecast = parseProductRevenueForecastWorkbook(workbook, year);
  } catch {
    forecast = null;
  }
  const goals = parseGoalDashboardFromWorkbook(workbook);

  return {
    sheetName,
    year,
    dataThru,
    rows,
    prices: mergePrices(parseContractPrices(workbook, year), parseSgpPrices(workbook)),
    shippingDays: parseShippingDays(workbook),
    forecast,
    goalUpdate: goals.goalUpdate,
    pyramid: goals.pyramid,
  };
}

export function estimatedMonthDollars(
  forecastQty: MonthQtyMap,
  contractPrice: number | null | undefined,
  month: ForecastMonth
): number {
  const price = Number(contractPrice);
  if (!Number.isFinite(price)) return 0;
  return monthQty(forecastQty, month) * price;
}

export function estimatedMonths(forecastQty: MonthQtyMap, contractPrice: number | null | undefined): MonthQtyMap {
  const next = emptyMonthQtyMap();
  for (const month of FORECAST_MONTHS) {
    next[String(month)] = estimatedMonthDollars(forecastQty, contractPrice, month);
  }
  return next;
}

export function adjustedEstimatedMonthDollars(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  month: ForecastMonth,
  dataThru: string | Date | null | undefined,
  contractPrice: number | null | undefined,
  adjustedQty?: MonthQtyMap | null
): number {
  const price = Number(contractPrice);
  if (!Number.isFinite(price)) return 0;
  return adjustedMonthQty(forecastQty, actualQty, month, dataThru, adjustedQty) * price;
}

export function adjustedEstimatedMonths(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  dataThru: string | Date | null | undefined,
  contractPrice: number | null | undefined,
  adjustedQty?: MonthQtyMap | null
): MonthQtyMap {
  const next = emptyMonthQtyMap();
  for (const month of FORECAST_MONTHS) {
    next[String(month)] = adjustedEstimatedMonthDollars(
      forecastQty,
      actualQty,
      month,
      dataThru,
      contractPrice,
      adjustedQty
    );
  }
  return next;
}

export function sgpEstimatedDollars(
  annualBaseQty: number | null | undefined,
  sgpPrice: number | null | undefined
): number {
  const qty = Number(annualBaseQty);
  const price = Number(sgpPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return qty * price;
}

export function annualEstimatedDollars(forecastQty: MonthQtyMap, contractPrice: number | null | undefined): number {
  return monthQtyTotal(estimatedMonths(forecastQty, contractPrice));
}

export function annualAdjustedEstimatedDollars(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  dataThru: string | Date | null | undefined,
  contractPrice: number | null | undefined,
  adjustedQty?: MonthQtyMap | null
): number {
  return monthQtyTotal(adjustedEstimatedMonths(forecastQty, actualQty, dataThru, contractPrice, adjustedQty));
}

export function quarterEstimatedDollars(
  forecastQty: MonthQtyMap,
  contractPrice: number | null | undefined,
  quarter: ForecastQuarter
): number {
  return monthQtyTotal(estimatedMonths(forecastQty, contractPrice), QUARTER_MONTHS[quarter]);
}

export function quarterAdjustedEstimatedDollars(
  forecastQty: MonthQtyMap,
  actualQty: MonthQtyMap,
  dataThru: string | Date | null | undefined,
  contractPrice: number | null | undefined,
  quarter: ForecastQuarter,
  adjustedQty?: MonthQtyMap | null
): number {
  return monthQtyTotal(
    adjustedEstimatedMonths(forecastQty, actualQty, dataThru, contractPrice, adjustedQty),
    QUARTER_MONTHS[quarter]
  );
}

export function quarterActualRevenue(actualRevenue: MonthQtyMap, quarter: ForecastQuarter): number {
  return monthQtyTotal(actualRevenue, QUARTER_MONTHS[quarter]);
}

export function annualActualRevenue(actualRevenue: MonthQtyMap): number {
  return monthQtyTotal(actualRevenue);
}

export function pctRevenueShipped(actualYtd: number, estimated: number): number | null {
  if (!Number.isFinite(actualYtd) || !Number.isFinite(estimated)) return null;
  if (actualYtd === 0) return 0;
  if (estimated === 0) return 1;
  return actualYtd / estimated;
}

export function revenueDifference(actualYtd: number, estimated: number): number {
  return (Number(actualYtd) || 0) - (Number(estimated) || 0);
}

function isoDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function lastDayOfMonth(year: number, month: ForecastMonth): string {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function lastDayOfQuarter(year: number, quarter: ForecastQuarter): string {
  const month = QUARTER_MONTHS[quarter][2];
  return lastDayOfMonth(year, month);
}

export function normalizeShippingDays(value: unknown): ShippingDay[] {
  if (!Array.isArray(value)) return [];
  const days: ShippingDay[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const date = isoDay((row as ShippingDay)?.date);
    if (!date || seen.has(date)) continue;
    seen.add(date);
    days.push({ date, ship: Boolean((row as ShippingDay)?.ship) });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function shipRatio(
  days: ShippingDay[],
  dataThru: string,
  inWindow: (date: string) => boolean,
  windowEnd: string
): number | null {
  const shipDays = days.filter((day) => day.ship && inWindow(day.date));
  if (!shipDays.length) return null;
  if (dataThru >= windowEnd) return 1;
  const elapsed = shipDays.filter((day) => day.date <= dataThru).length;
  return elapsed / shipDays.length;
}

export function pctDaysShippedMonth(
  days: ShippingDay[],
  year: number,
  month: ForecastMonth,
  dataThru: string | Date | null | undefined
): number | null {
  const thru = isoDay(dataThru);
  if (!thru || !days.length) return null;
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return shipRatio(days, thru, (date) => date.startsWith(prefix), lastDayOfMonth(year, month));
}

export function pctDaysShippedQuarter(
  days: ShippingDay[],
  year: number,
  quarter: ForecastQuarter,
  dataThru: string | Date | null | undefined
): number | null {
  const thru = isoDay(dataThru);
  if (!thru || !days.length) return null;
  const months = new Set(QUARTER_MONTHS[quarter].map((month) => `${year}-${String(month).padStart(2, '0')}-`));
  return shipRatio(
    days,
    thru,
    (date) => [...months].some((prefix) => date.startsWith(prefix)),
    lastDayOfQuarter(year, quarter)
  );
}

export function pctDaysShippedYear(
  days: ShippingDay[],
  year: number,
  dataThru: string | Date | null | undefined
): number | null {
  const thru = isoDay(dataThru);
  if (!thru || !days.length) return null;
  const prefix = `${year}-`;
  return shipRatio(days, thru, (date) => date.startsWith(prefix), `${year}-12-31`);
}

export function workbookUpdatedDate(dataThru: string | Date | null | undefined): string | null {
  const thru = isoDay(dataThru);
  if (!thru) return null;
  const date = new Date(`${thru}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export type RevenueMonthTotals = {
  estimated: number;
  adjusted: number;
  ytd: number;
};

export type RevenueTotals = {
  lineCount: number;
  sgpEstimated: number;
  annualEstimated: number;
  annualAdjusted: number;
  annualYtd: number;
  months: Record<ForecastMonth, RevenueMonthTotals>;
  quarters: Record<ForecastQuarter, RevenueMonthTotals>;
};

export function emptyRevenueTotals(): RevenueTotals {
  const months = FORECAST_MONTHS.reduce(
    (acc, month) => {
      acc[month] = { estimated: 0, adjusted: 0, ytd: 0 };
      return acc;
    },
    {} as Record<ForecastMonth, RevenueMonthTotals>
  );
  const quarters = FORECAST_QUARTERS.reduce(
    (acc, quarter) => {
      acc[quarter] = { estimated: 0, adjusted: 0, ytd: 0 };
      return acc;
    },
    {} as Record<ForecastQuarter, RevenueMonthTotals>
  );
  return {
    lineCount: 0,
    sgpEstimated: 0,
    annualEstimated: 0,
    annualAdjusted: 0,
    annualYtd: 0,
    months,
    quarters,
  };
}

export function summarizeRevenueLines(
  lines: Array<{
    annualBaseQty?: number | null;
    forecastQty: MonthQtyMap;
    actualQty?: MonthQtyMap;
    adjustedQty?: MonthQtyMap;
    actualRevenue: MonthQtyMap;
    contractPrice: number | null;
    sgpPrice: number | null;
  }>,
  dataThru?: string | Date | null
): RevenueTotals {
  return lines.reduce((acc, line) => {
    acc.lineCount += 1;
    acc.sgpEstimated += sgpEstimatedDollars(line.annualBaseQty, line.sgpPrice);
    const estimated = estimatedMonths(line.forecastQty, line.contractPrice);
    const actualQty = line.actualQty || emptyMonthQtyMap();
    const adjustedQty = normalizeAdjustedQtyMap(line.adjustedQty, line.forecastQty);
    const adjusted = adjustedEstimatedMonths(
      line.forecastQty,
      actualQty,
      dataThru,
      line.contractPrice,
      adjustedQty
    );
    acc.annualEstimated += monthQtyTotal(estimated);
    acc.annualAdjusted += monthQtyTotal(adjusted);
    acc.annualYtd += annualActualRevenue(line.actualRevenue);
    for (const month of FORECAST_MONTHS) {
      acc.months[month].estimated += monthQty(estimated, month);
      acc.months[month].adjusted += monthQty(adjusted, month);
      acc.months[month].ytd += monthQty(line.actualRevenue, month);
    }
    for (const quarter of FORECAST_QUARTERS) {
      acc.quarters[quarter].estimated += monthQtyTotal(estimated, QUARTER_MONTHS[quarter]);
      acc.quarters[quarter].adjusted += monthQtyTotal(adjusted, QUARTER_MONTHS[quarter]);
      acc.quarters[quarter].ytd += quarterActualRevenue(line.actualRevenue, quarter);
    }
    return acc;
  }, emptyRevenueTotals());
}
