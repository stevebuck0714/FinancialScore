import * as XLSX from 'xlsx';

type ParsedMetricRow = {
  metric: string;
  current: number | null;
  prior: number | null;
  delta: number | null;
};

type ParsedTrendRow = {
  label: string;
  values: Record<string, number | null>;
};

type ParsedCategoryMetric = {
  department: string | null;
  category: string | null;
  currentSales: number | null;
  priorSales: number | null;
  compPct: number | null;
  deltaDollars: number | null;
  salesMixPct: number | null;
  inventoryMixPct: number | null;
  inventoryOnHandDollars: number | null;
  imuPct: number | null;
  grossMarginPct: number | null;
  grossMarginDollars: number | null;
};

type ParsedRetailProductAgingRow = {
  productType: string;
  ageBucket: string;
  units: number | null;
  dollars: number | null;
  inventoryPct: number | null;
};

export type ParsedWorkbookSummary = {
  sheetNames: string[];
  requiredSheets: string[];
  currentPeriodLabel: string | null;
  monthKey: string | null;
  storeInfo: Record<string, string | number | null>;
  salesKpis: ParsedMetricRow[];
  buysKpis: ParsedMetricRow[];
  lossPreventionKpis: ParsedMetricRow[];
  salesHistory: ParsedTrendRow[];
  buysHistory: ParsedTrendRow[];
  marketingChannels: Array<{
    channel: string;
    primaryMetricLabel: string | null;
    primaryMetricValue: string | number | null;
    secondaryMetricLabel: string | null;
    secondaryMetricValue: string | number | null;
  }>;
  categoryMetrics: ParsedCategoryMetric[];
  retailProductAging: ParsedRetailProductAgingRow[];
  categorySummary: {
    rowCount: number;
    departmentCount: number;
    categoryCount: number;
    topDepartmentsBySales: Array<{
      department: string;
      currentSales: number;
      priorSales: number;
      grossMarginDollars: number;
    }>;
  };
};

const REQUIRED_SHEETS = ['YTD Key Performance Indicators', 'YTD Key Indicator'] as const;
const MONTH_COLUMN_MAP: Array<{ label: string; index: number }> = [
  { label: 'Jan', index: 1 },
  { label: 'Feb', index: 4 },
  { label: 'Mar', index: 6 },
  { label: 'Apr', index: 9 },
  { label: 'May', index: 11 },
  { label: 'Jun', index: 15 },
  { label: 'Jul', index: 16 },
  { label: 'Aug', index: 21 },
  { label: 'Sep', index: 22 },
  { label: 'Oct', index: 25 },
  { label: 'Nov', index: 27 },
  { label: 'Dec', index: 30 },
  { label: 'Total', index: 33 },
  { label: 'MTD', index: 35 },
];

function asSheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
}

function asString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = asString(value).replace(/[$,%(),]/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function maybeExcelDate(value: unknown): string | number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return asString(value) || null;
  if (value < 20000 || value > 80000) return value;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return value;
  const year = String(parsed.y).padStart(4, '0');
  const month = String(parsed.m).padStart(2, '0');
  const day = String(parsed.d).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readCell(rows: unknown[][], rowIndex: number, colIndex: number): unknown {
  return rows[rowIndex]?.[colIndex] ?? '';
}

function parseMonthKeyFromPeriodLabel(label: string): string | null {
  const trimmed = asString(label);
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2})\/\d{1,2}-\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = String(Number(match[1])).padStart(2, '0');
  const rawYear = match[2];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}`;
}

function detectCurrentPeriodLabel(rows: unknown[][]): string | null {
  const candidates = [
    asString(readCell(rows, 8, 5)),
    asString(readCell(rows, 17, 5)),
  ];
  return candidates.find(Boolean) || null;
}

function parseMetricSection(
  rows: unknown[][],
  startRow: number,
  endRow: number,
  columns: { label: number; current: number; prior: number; delta: number } = {
    label: 0,
    current: 5,
    prior: 10,
    delta: 14,
  },
): ParsedMetricRow[] {
  const out: ParsedMetricRow[] = [];
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const metric = asString(readCell(rows, rowIndex, columns.label));
    if (!metric) continue;
    out.push({
      metric,
      current: asNumber(readCell(rows, rowIndex, columns.current)),
      prior: asNumber(readCell(rows, rowIndex, columns.prior)),
      delta: asNumber(readCell(rows, rowIndex, columns.delta)),
    });
  }
  return out;
}

function parseTrendRows(rows: unknown[][], startRow: number, endRow: number): ParsedTrendRow[] {
  return rows.slice(startRow, endRow + 1).map((row) => {
    const label = asString(row?.[0]);
    const values: Record<string, number | null> = {};
    for (const month of MONTH_COLUMN_MAP) {
      values[month.label] = asNumber(row?.[month.index]);
    }
    return { label, values };
  }).filter((row) => row.label);
}

function parseMarketingRows(rows: unknown[][]): ParsedWorkbookSummary['marketingChannels'] {
  const out: ParsedWorkbookSummary['marketingChannels'] = [];
  for (let rowIndex = 40; rowIndex <= 43; rowIndex += 1) {
    const channel = asString(readCell(rows, rowIndex, 0));
    if (!channel) continue;
    out.push({
      channel,
      primaryMetricLabel: asString(readCell(rows, rowIndex, 8)) || null,
      primaryMetricValue: maybeExcelDate(readCell(rows, rowIndex + 1, 8)),
      secondaryMetricLabel: asString(readCell(rows, rowIndex, 19)) || null,
      secondaryMetricValue: maybeExcelDate(readCell(rows, rowIndex + 1, 19)),
    });
  }
  return out;
}

function parseStoreInfo(rows: unknown[][]): Record<string, string | number | null> {
  const mappings: Array<Array<[number, number]>> = [
    [[0, 2], [7, 12], [18, 23], [28, 32]],
    [[0, 2], [7, 12], [18, 23], [28, 32]],
    [[0, 2], [7, 12], [18, 23], [28, 32]],
    [[0, 2], [7, 12], [18, 23], [28, 32]],
    [[7, 12], [28, 32]],
  ];
  const out: Record<string, string | number | null> = {};
  for (let rowOffset = 0; rowOffset < mappings.length; rowOffset += 1) {
    const rowIndex = rowOffset + 1;
    for (const [labelIndex, valueIndex] of mappings[rowOffset]) {
      const label = asString(readCell(rows, rowIndex, labelIndex));
      if (!label) continue;
      const raw = readCell(rows, rowIndex, valueIndex);
      const maybeDate = /date|renewal|inv\./i.test(label) ? maybeExcelDate(raw) : raw;
      const normalizedNumber = typeof maybeDate === 'number' ? maybeDate : asNumber(maybeDate);
      out[label] =
        typeof maybeDate === 'string'
          ? maybeDate || null
          : normalizedNumber !== null
            ? normalizedNumber
            : asString(maybeDate) || null;
    }
  }
  return out;
}

function parseCategoryMetrics(rows: unknown[][]): ParsedCategoryMetric[] {
  const out: ParsedCategoryMetric[] = [];
  let currentDepartment: string | null = null;
  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const totalLabel = asString(row[0]);
    const departmentLabel = asString(row[1]);
    const categoryLabel = asString(row[2]);
    if (!totalLabel && !departmentLabel && !categoryLabel) continue;
    const normalizedTotalLabel = totalLabel.trim().toUpperCase();
    if (normalizedTotalLabel === 'NEW' || normalizedTotalLabel === 'AGED INVENTORY' || normalizedTotalLabel === 'OPEN SKU/USED BULK') {
      break;
    }
    if (departmentLabel) currentDepartment = departmentLabel;
    out.push({
      department: departmentLabel || (categoryLabel ? currentDepartment : totalLabel || null),
      category: categoryLabel || null,
      currentSales: asNumber(row[4]),
      priorSales: asNumber(row[6]),
      compPct: asNumber(row[8]),
      deltaDollars: asNumber(row[10]),
      salesMixPct: asNumber(row[11]),
      inventoryMixPct: asNumber(row[13]),
      inventoryOnHandDollars: asNumber(row[14]),
      imuPct: asNumber(row[16]),
      grossMarginPct: asNumber(row[18]),
      grossMarginDollars: asNumber(row[19]),
    });
  }
  return out;
}

function parseRetailProductAging(rows: unknown[][]): ParsedRetailProductAgingRow[] {
  const startIndex = rows.findIndex((row) => asString(row?.[0]).toUpperCase() === 'AGED INVENTORY');
  if (startIndex < 0) return [];

  const headerRow = rows[startIndex + 1] || [];
  const blocks = [
    { productType: asString(headerRow[0]), label: 0, units: 3, dollars: 5, pct: 7 },
    { productType: asString(headerRow[12]), label: 12, units: 15, dollars: 17, pct: 20 },
  ].filter((block) => block.productType);

  const out: ParsedRetailProductAgingRow[] = [];
  for (let rowIndex = startIndex + 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const firstLabel = asString(row[0]);
    if (!firstLabel) break;
    if (/^open sku\/used bulk$/i.test(firstLabel)) break;

    for (const block of blocks) {
      const ageBucket = asString(row[block.label]);
      if (!ageBucket) continue;
      out.push({
        productType: block.productType,
        ageBucket,
        units: asNumber(row[block.units]),
        dollars: asNumber(row[block.dollars]),
        inventoryPct: asNumber(row[block.pct]),
      });
    }
  }

  return out;
}

function summarizeCategoryMetrics(metrics: ParsedCategoryMetric[]): ParsedWorkbookSummary['categorySummary'] {
  const departmentRows = metrics.filter((row) => row.department && !row.category && row.department !== 'USED');
  const departmentMap = new Map<string, { currentSales: number; priorSales: number; grossMarginDollars: number }>();
  let categoryCount = 0;
  const sourceRows = departmentRows.length > 0 ? departmentRows : metrics.filter((row) => row.category && row.department);

  for (const row of metrics) {
    if (row.category) categoryCount += 1;
  }

  for (const row of sourceRows) {
    const department = row.department;
    if (!department) continue;
    const bucket = departmentMap.get(department) || { currentSales: 0, priorSales: 0, grossMarginDollars: 0 };
    bucket.currentSales += row.currentSales || 0;
    bucket.priorSales += row.priorSales || 0;
    bucket.grossMarginDollars += row.grossMarginDollars || 0;
    departmentMap.set(department, bucket);
  }
  const topDepartmentsBySales = Array.from(departmentMap.entries())
    .map(([department, totals]) => ({ department, ...totals }))
    .sort((a, b) => b.currentSales - a.currentSales)
    .slice(0, 10);

  return {
    rowCount: metrics.length,
    departmentCount: departmentMap.size,
    categoryCount,
    topDepartmentsBySales,
  };
}

export function parsePlatosClosetWorkbook(workbook: XLSX.WorkBook): ParsedWorkbookSummary {
  const missingSheets = REQUIRED_SHEETS.filter((sheetName) => !workbook.SheetNames.includes(sheetName));
  if (missingSheets.length > 0) {
    throw new Error(`Workbook is missing required sheet(s): ${missingSheets.join(', ')}`);
  }

  const kpiRows = asSheetRows(workbook, 'YTD Key Performance Indicators');
  const categoryRows = asSheetRows(workbook, 'YTD Key Indicator');
  const categoryMetrics = parseCategoryMetrics(categoryRows);
  const retailProductAging = parseRetailProductAging(categoryRows);

  return {
    sheetNames: workbook.SheetNames.map((name) => String(name)),
    requiredSheets: [...REQUIRED_SHEETS],
    currentPeriodLabel: detectCurrentPeriodLabel(kpiRows),
    monthKey: parseMonthKeyFromPeriodLabel(detectCurrentPeriodLabel(kpiRows) || ''),
    storeInfo: parseStoreInfo(kpiRows),
    salesKpis: parseMetricSection(kpiRows, 9, 14),
    buysKpis: parseMetricSection(kpiRows, 9, 14, { label: 20, current: 26, prior: 31, delta: 34 }),
    lossPreventionKpis: parseMetricSection(kpiRows, 18, 19),
    salesHistory: parseTrendRows(kpiRows, 24, 29),
    buysHistory: parseTrendRows(kpiRows, 32, 37),
    marketingChannels: parseMarketingRows(kpiRows),
    categoryMetrics,
    retailProductAging,
    categorySummary: summarizeCategoryMetrics(categoryMetrics),
  };
}

