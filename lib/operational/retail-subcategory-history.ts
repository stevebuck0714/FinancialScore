import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';

export const RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE = 'RETAIL_SUBCATEGORY_HISTORY';
export const PLATOS_INVENTORY_SOURCE_CODE = 'PLATOS_INVENTORY';
const RETAIL_SUBCATEGORY_PRODUCT_SOURCE_CODES = [
  PLATOS_INVENTORY_SOURCE_CODE,
];

export type ParsedRetailSubcategory = {
  code: string | null;
  name: string;
  rows: ParsedRetailSubcategoryMonth[];
  currentOnHandUnits: number | null;
  avgStockUnits: number | null;
  retailDollars: number | null;
  avgRetail: number | null;
  costDollars: number | null;
  avgCost: number | null;
  imuPct: number | null;
  turnRate: number | null;
};

export type ParsedRetailSubcategoryMonth = {
  monthKey: string;
  monthLabel: string;
  bomUnits: number | null;
  salesUnits: number | null;
  buysUnits: number | null;
  eomUnits: number | null;
  sellThroughPct: number | null;
};

export type ParsedRetailSubcategoryHistory = {
  sheetNames: string[];
  monthKeys: string[];
  subcategories: ParsedRetailSubcategory[];
};

function asString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = asString(value).replace(/[$,%(),]/g, '');
  if (!raw || raw === '-') return raw === '-' ? 0 : null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePercent(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed == null) return null;
  return Math.abs(parsed) <= 2 ? parsed * 100 : parsed;
}

function monthKeyFromCell(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
  }
  const text = asString(value);
  const namedMonth = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i);
  if (namedMonth) {
    const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      namedMonth[1].slice(0, 3).toLowerCase(),
    );
    return `${namedMonth[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
  }
  const iso = text.match(/\b(\d{4})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`;
  return null;
}

function monthLabelFromKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split('-').map(Number);
  if (!yearRaw || !monthRaw) return monthKey;
  return new Date(Date.UTC(yearRaw, monthRaw - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function monthStartFromKey(monthKey: string): Date {
  const [yearRaw, monthRaw] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(yearRaw, (monthRaw || 1) - 1, 1));
}

function normalizeDimensionKey(code: string | null, name: string): string {
  const base = String(code || name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'unknown';
}

function findMonthColumns(rows: unknown[][]): Array<{ index: number; monthKey: string; monthLabel: string }> {
  let best: Array<{ index: number; monthKey: string; monthLabel: string }> = [];
  for (const row of rows.slice(0, 20)) {
    const columns = row
      .map((cell, index) => {
        const monthKey = monthKeyFromCell(cell);
        return monthKey ? { index, monthKey, monthLabel: monthLabelFromKey(monthKey) } : null;
      })
      .filter(Boolean) as Array<{ index: number; monthKey: string; monthLabel: string }>;
    if (columns.length > best.length) best = columns;
  }
  return best;
}

function metricName(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractTrailingValue(row: unknown[], labels: string[]): number | null {
  const wanted = labels.map((label) => label.toLowerCase());
  for (let index = 0; index < row.length - 1; index += 1) {
    const cell = asString(row[index]).replace(/:$/, '').trim().toLowerCase();
    if (!wanted.includes(cell)) continue;
    const value = asNumber(row[index + 1]);
    if (value != null) return value;
  }
  return null;
}

function findMetricCell(row: unknown[]): { label: string; index: number } | null {
  for (let index = 0; index < row.length; index += 1) {
    const label = metricName(row[index]);
    if (['bom units', 'sales', 'buys', 'eom units', 'sell through'].includes(label)) {
      return { label, index };
    }
  }
  return null;
}

type MetricRow = {
  row: unknown[];
  valueStartIndex: number;
};

function metricValue(metric: MetricRow | null, offset: number): number | null {
  return metric ? asNumber(metric.row[metric.valueStartIndex + offset]) : null;
}

function metricPercentValue(metric: MetricRow | null, offset: number): number | null {
  return metric ? normalizePercent(metric.row[metric.valueStartIndex + offset]) : null;
}

function parseSubcategoryRow(row: unknown[]): { code: string | null; name: string } | null {
  const firstSubcategoryCellIndex = row.findIndex((cell) => /sub-?category\s*:/i.test(asString(cell)));
  if (firstSubcategoryCellIndex < 0) return null;

  const text = row
    .slice(firstSubcategoryCellIndex)
    .map(asString)
    .filter(Boolean)
    .join(' ');
  const match = text.match(/Sub-?Category\s*:\s*(?:\[(.*?)\])?\s*([^:]+?)(?=\s+(?:BOM Units|Sales\*?|Buys|EOM Units|Sell-Through|Units|Avg\.?\s+Stock|Retail|Cost|IMU%|Turn Rate)\b|$)/i);
  if (!match) return null;

  const name = asString(match[2]).replace(/\s+/g, ' ');
  if (!name) return null;
  return {
    code: match[1] ? asString(match[1]) : null,
    name,
  };
}

function parseRetailSubcategorySheetRows(sheetName: string, rows: unknown[][]): ParsedRetailSubcategoryHistory {
  const monthColumns = findMonthColumns(rows);
  if (monthColumns.length < 3) {
    throw new Error('Unable to find monthly columns like "Apr 2025", "May 2025" in the subcategory spreadsheet.');
  }

  const subcategories: ParsedRetailSubcategory[] = [];
  let current: ParsedRetailSubcategory | null = null;
  const metricsBySubcategory = new Map<
    ParsedRetailSubcategory,
    {
      bom: MetricRow | null;
      sales: MetricRow | null;
      buys: MetricRow | null;
      eom: MetricRow | null;
      sellThrough: MetricRow | null;
    }
  >();

  for (const row of rows) {
    const subcategoryMatch = parseSubcategoryRow(row);
    if (subcategoryMatch) {
      current = {
        code: subcategoryMatch.code,
        name: subcategoryMatch.name,
        rows: [],
        currentOnHandUnits: null,
        avgStockUnits: null,
        retailDollars: null,
        avgRetail: null,
        costDollars: null,
        avgCost: null,
        imuPct: null,
        turnRate: null,
      };
      subcategories.push(current);
      metricsBySubcategory.set(current, { bom: null, sales: null, buys: null, eom: null, sellThrough: null });
      continue;
    }
    if (!current) continue;
    const metric = findMetricCell(row);
    if (!metric) continue;
    const metricRow = { row, valueStartIndex: metric.index + 1 };
    const bucket = metricsBySubcategory.get(current);
    if (!bucket) continue;
    if (metric.label === 'bom units' && !bucket.bom) {
      bucket.bom = metricRow;
      current.currentOnHandUnits = extractTrailingValue(row, ['Units']);
      current.avgStockUnits = extractTrailingValue(row, ['Avg. Stock', 'Avg Stock']);
    } else if (metric.label === 'sales' && !bucket.sales) {
      bucket.sales = metricRow;
      current.retailDollars = extractTrailingValue(row, ['Retail']);
      current.avgRetail = extractTrailingValue(row, ['Avg. Retail', 'Avg Retail']);
    } else if (metric.label === 'buys' && !bucket.buys) {
      bucket.buys = metricRow;
      current.costDollars = extractTrailingValue(row, ['Cost']);
      current.avgCost = extractTrailingValue(row, ['Avg. Cost', 'Avg Cost']);
    } else if (metric.label === 'eom units' && !bucket.eom) {
      bucket.eom = metricRow;
      current.imuPct = normalizePercent(extractTrailingValue(row, ['IMU%', 'IMU']));
    } else if (metric.label === 'sell through' && !bucket.sellThrough) {
      bucket.sellThrough = metricRow;
      current.turnRate = extractTrailingValue(row, ['Turn Rate']);
    }
  }

  for (const subcategory of subcategories) {
    const metrics = metricsBySubcategory.get(subcategory);
    if (!metrics) continue;
    subcategory.rows = monthColumns.map((month, index) => ({
      monthKey: month.monthKey,
      monthLabel: month.monthLabel,
      bomUnits: metricValue(metrics.bom, index),
      salesUnits: metricValue(metrics.sales, index),
      buysUnits: metricValue(metrics.buys, index),
      eomUnits: metricValue(metrics.eom, index),
      sellThroughPct: metricPercentValue(metrics.sellThrough, index),
    }));
  }

  const populated = subcategories.filter((subcategory) =>
    subcategory.rows.some(
      (row) => (row.salesUnits || 0) !== 0 || (row.buysUnits || 0) !== 0 || (row.eomUnits || 0) !== 0 || (row.bomUnits || 0) !== 0,
    ),
  );

  return {
    sheetNames: [sheetName],
    monthKeys: monthColumns.map((month) => month.monthKey),
    subcategories: populated,
  };
}

export function parseRetailSubcategoryHistoryWorkbook(workbook: XLSX.WorkBook): ParsedRetailSubcategoryHistory {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no worksheets.');
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true }) as unknown[][];
  const parsed = parseRetailSubcategorySheetRows(sheetName, rows);
  if (!parsed.subcategories.length) {
    throw new Error('No subcategory monthly rows were found in the spreadsheet.');
  }
  return parsed;
}

export async function saveRetailSubcategoryHistoryFacts(input: {
  companyId: string;
  parsed: ParsedRetailSubcategoryHistory;
  sourceCode?: string;
  replaceAllForSource?: boolean;
}): Promise<void> {
  const sourceCode = input.sourceCode || RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE;
  const facts = input.parsed.subcategories.flatMap((subcategory) => {
    const dimensionKey = normalizeDimensionKey(subcategory.code, subcategory.name);
    return subcategory.rows.map((row) => ({
      monthKey: row.monthKey,
      monthStart: monthStartFromKey(row.monthKey).toISOString(),
      factType: 'category_metric',
      metricName: 'sales_units',
      dimensionType: 'category',
      dimensionKey,
      dimensionLabel: subcategory.name,
      valueNumber: row.salesUnits,
      compareNumber: row.buysUnits,
      sharePct: row.sellThroughPct == null ? null : row.sellThroughPct / 100,
      auxNumber: row.eomUnits,
      metadata: {
        source: sourceCode,
        sourceCode,
        subcategoryCode: subcategory.code,
        subcategoryName: subcategory.name,
        bomUnits: row.bomUnits,
        salesUnits: row.salesUnits,
        buysUnits: row.buysUnits,
        eomUnits: row.eomUnits,
        sellThroughPct: row.sellThroughPct,
        currentOnHandUnits: subcategory.currentOnHandUnits,
        avgStockUnits: subcategory.avgStockUnits,
        retailDollars: subcategory.retailDollars,
        avgRetail: subcategory.avgRetail,
        costDollars: subcategory.costDollars,
        avgCost: subcategory.avgCost,
        imuPct: subcategory.imuPct,
        turnRate: subcategory.turnRate,
      },
    }));
  });
  const serializedFacts = JSON.stringify(facts);
  const monthKeys = Array.from(new Set(facts.map((fact) => fact.monthKey).filter(Boolean)));
  if (!monthKeys.length) return;

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${input.companyId}
        AND "sourceCode" = ${sourceCode}
        ${
          input.replaceAllForSource === true
            ? Prisma.empty
            : Prisma.sql`AND "monthKey" IN (${Prisma.join(monthKeys)})`
        }
    `),
    prisma.$executeRaw(Prisma.sql`
      WITH payload AS (
        SELECT *
        FROM jsonb_to_recordset(${serializedFacts}::jsonb) AS x(
          "monthKey" text,
          "monthStart" timestamptz,
          "factType" text,
          "metricName" text,
          "dimensionType" text,
          "dimensionKey" text,
          "dimensionLabel" text,
          "valueNumber" double precision,
          "compareNumber" double precision,
          "sharePct" double precision,
          "auxNumber" double precision,
          "metadata" jsonb
        )
      )
      INSERT INTO "PlatosClosetMonthlyFact" (
        "id",
        "companyId",
        "sourceCode",
        "monthKey",
        "monthStart",
        "factType",
        "metricName",
        "dimensionType",
        "dimensionKey",
        "dimensionLabel",
        "valueNumber",
        "compareNumber",
        "sharePct",
        "auxNumber",
        "metadata",
        "createdAt",
        "updatedAt"
      )
      SELECT
        md5(random()::text || clock_timestamp()::text),
        ${input.companyId},
        ${sourceCode},
        payload."monthKey",
        payload."monthStart"::timestamp,
        payload."factType",
        payload."metricName",
        COALESCE(payload."dimensionType", ''),
        COALESCE(payload."dimensionKey", ''),
        payload."dimensionLabel",
        payload."valueNumber",
        payload."compareNumber",
        payload."sharePct",
        payload."auxNumber",
        COALESCE(payload."metadata", '{}'::jsonb),
        NOW(),
        NOW()
      FROM payload
    `),
  ]);
}

export async function hasRetailSubcategoryHistoryFacts(companyId: string): Promise<boolean> {
  const sourceCodes = RETAIL_SUBCATEGORY_PRODUCT_SOURCE_CODES;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "PlatosClosetMonthlyFact"
    WHERE "companyId" = ${companyId}
      AND "sourceCode" IN (${Prisma.join(sourceCodes)})
      AND "factType" = 'category_metric'
  `);
  return Number(rows[0]?.count || 0) > 0;
}

export async function getRetailSubcategoryHistoryProductsPayload(args: {
  companyId: string;
  startDate: Date;
  endDate: Date;
}): Promise<any | null> {
  const historyStartDate = new Date(Date.UTC(args.endDate.getUTCFullYear(), args.endDate.getUTCMonth() - 35, 1));
  const effectiveStartDate = args.startDate < historyStartDate ? args.startDate : historyStartDate;
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      "sourceCode",
      "monthKey",
      "monthStart",
      "dimensionKey",
      "dimensionLabel",
      "valueNumber",
      "compareNumber",
      "sharePct",
      "auxNumber",
      "metadata"
    FROM "PlatosClosetMonthlyFact"
    WHERE "companyId" = ${args.companyId}
      AND "sourceCode" IN (${Prisma.join(RETAIL_SUBCATEGORY_PRODUCT_SOURCE_CODES)})
      AND "factType" = 'category_metric'
      AND "metricName" = 'sales_units'
      AND "monthStart" >= ${effectiveStartDate}
      AND "monthStart" <= ${args.endDate}
    ORDER BY "monthStart" ASC, "dimensionLabel" ASC
  `);
  if (!rows.length) return null;

  const records = rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
    const subcategoryName = String(row.dimensionLabel || metadata.subcategoryName || 'Unknown');
    const subcategoryCode = String(metadata.subcategoryCode || '').trim();
    const subcategoryKey = normalizeDimensionKey(null, subcategoryName);
    const salesUnits = Number(row.valueNumber || 0);
    const avgRetail = Number(metadata.avgRetail || 0);
    const avgCost = Number(metadata.avgCost || 0);
    const revenue = avgRetail > 0 ? salesUnits * avgRetail : 0;
    const cogs = salesUnits * avgCost;
    return {
      snapshotDate: new Date(row.monthStart).toISOString(),
      itemName: subcategoryName,
      itemId: subcategoryCode || String(row.dimensionKey || subcategoryKey),
      sku: subcategoryKey,
      sourceCode: String(row.sourceCode || metadata.sourceCode || metadata.source || ''),
      source: String(row.sourceCode || metadata.source || metadata.sourceCode || ''),
      subcategoryCode: subcategoryCode || null,
      category: subcategoryName,
      department: 'Retail',
      quantitySold: salesUnits,
      salesUnits,
      buysUnits: Number(row.compareNumber || 0),
      bomUnits: metadata.bomUnits == null ? null : Number(metadata.bomUnits),
      eomUnits: row.auxNumber == null ? null : Number(row.auxNumber),
      currentOnHandUnits: metadata.currentOnHandUnits == null ? null : Number(metadata.currentOnHandUnits),
      avgStockUnits: metadata.avgStockUnits == null ? null : Number(metadata.avgStockUnits),
      sellThroughPct: row.sharePct == null ? null : Number(row.sharePct) * 100,
      revenue,
      cogs,
      grossMarginDollars: revenue - cogs,
      grossMarginPct: revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0,
      retailDollars: metadata.retailDollars == null ? null : Number(metadata.retailDollars),
      costDollars: metadata.costDollars == null ? null : Number(metadata.costDollars),
      avgRetail,
      avgCost,
      imuPct: metadata.imuPct == null ? null : Number(metadata.imuPct),
      turnRate: metadata.turnRate == null ? null : Number(metadata.turnRate),
    };
  });

  const latestMonthKey = rows.map((row) => String(row.monthKey || '')).filter(Boolean).sort().slice(-1)[0] || null;
  const topProducts = Array.from(
    records.reduce((acc: Map<string, any>, row: any) => {
      const key = String(row.sku || row.itemName);
      const existing = acc.get(key) || {
        name: row.itemName,
        sku: row.sku,
        totalRevenue: 0,
        totalCogs: 0,
        totalQuantity: 0,
      };
      existing.totalRevenue += Number(row.revenue || 0);
      existing.totalCogs += Number(row.cogs || 0);
      existing.totalQuantity += Number(row.quantitySold || 0);
      acc.set(key, existing);
      return acc;
    }, new Map<string, any>()).values(),
  )
    .map((row) => ({
      ...row,
      grossMargin: row.totalRevenue - row.totalCogs,
      grossMarginPct: row.totalRevenue > 0 ? ((row.totalRevenue - row.totalCogs) / row.totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => Number(b.totalQuantity || 0) - Number(a.totalQuantity || 0))
    .slice(0, 25);

  return {
    records,
    summary: {
      topProducts,
      source: 'retail-subcategory-history',
      retailSubcategoryHistory: {
        latestMonthKey,
        rowCount: records.length,
        subcategoryCount: new Set(records.map((row: any) => row.sku)).size,
      },
    },
  };
}

export async function getRetailSubcategoryTurnsSummary(args: {
  companyId: string;
  endDate: Date;
}): Promise<any | null> {
  const historyStartDate = new Date(Date.UTC(args.endDate.getUTCFullYear(), args.endDate.getUTCMonth() - 35, 1));
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      "sourceCode",
      "monthKey",
      "monthStart",
      "dimensionKey",
      "dimensionLabel",
      "valueNumber",
      "compareNumber",
      "sharePct",
      "auxNumber",
      "metadata"
    FROM "PlatosClosetMonthlyFact"
    WHERE "companyId" = ${args.companyId}
      AND "sourceCode" IN (${Prisma.join(RETAIL_SUBCATEGORY_PRODUCT_SOURCE_CODES)})
      AND "factType" = 'category_metric'
      AND "metricName" = 'sales_units'
      AND "monthStart" >= ${historyStartDate}
      AND "monthStart" <= ${args.endDate}
    ORDER BY "monthStart" ASC, "dimensionLabel" ASC
  `);
  if (!rows.length) return null;

  const categoryMapRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      "dimensionLabel",
      "metadata"
    FROM "PlatosClosetMonthlyFact"
    WHERE "companyId" = ${args.companyId}
      AND "sourceCode" = 'PLATOS_CLOSET_STORE_VISIT'
      AND "factType" = 'category_metric'
      AND "dimensionType" = 'category'
    ORDER BY "monthStart" DESC
  `).catch(() => []);
  const categoryBySubcategory = new Map<string, string>();
  for (const row of categoryMapRows) {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
    const subcategory = String(row.dimensionLabel || metadata.category || '').trim();
    const category = String(metadata.department || '').trim();
    if (subcategory && category && !categoryBySubcategory.has(subcategory.toLowerCase())) {
      categoryBySubcategory.set(subcategory.toLowerCase(), category);
    }
  }

  const normalizedRows = rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
    const subcategory = String(row.dimensionLabel || metadata.subcategoryName || 'Unknown').trim();
    const bomUnits = metadata.bomUnits == null ? null : Number(metadata.bomUnits);
    const eomUnits = row.auxNumber == null ? null : Number(row.auxNumber);
    const monthAvgStock =
      Number.isFinite(Number(bomUnits)) && Number.isFinite(Number(eomUnits))
        ? (Number(bomUnits) + Number(eomUnits)) / 2
        : metadata.avgStockUnits == null
          ? null
          : Number(metadata.avgStockUnits);
    return {
      monthKey: String(row.monthKey || ''),
      monthStart: new Date(row.monthStart),
      monthLabel: monthLabelFromKey(String(row.monthKey || '')),
      subcategory,
      category: categoryBySubcategory.get(subcategory.toLowerCase()) || 'Unmapped',
      salesUnits: Number(row.valueNumber || 0),
      buysUnits: Number(row.compareNumber || 0),
      bomUnits,
      eomUnits,
      avgStockUnits: monthAvgStock,
      sellThroughPct: row.sharePct == null ? null : Number(row.sharePct) * 100,
      currentOnHandUnits: metadata.currentOnHandUnits == null ? null : Number(metadata.currentOnHandUnits),
      sourceTurnRate: metadata.turnRate == null ? null : Number(metadata.turnRate),
    };
  }).filter((row) => row.monthKey && row.salesUnits > 0);

  const latestMonthKey = normalizedRows.map((row) => row.monthKey).sort().slice(-1)[0] || '';
  if (!latestMonthKey) return null;
  const chartMonthKeys = Array.from({ length: 12 }, (_, index) => {
    const [yearRaw, monthRaw] = latestMonthKey.split('-').map(Number);
    const date = new Date(Date.UTC(yearRaw || 2000, (monthRaw || 1) - 1 + index - 11, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const [yearRaw, monthRaw] = latestMonthKey.split('-').map(Number);
    const date = new Date(Date.UTC(yearRaw || 2000, (monthRaw || 1) - 1 + index - 5, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const monthSet = new Set(monthKeys);
  const periodRows = normalizedRows.filter((row) => monthSet.has(row.monthKey));
  const periodLabel = `${monthLabelFromKey(monthKeys[0])} - ${monthLabelFromKey(monthKeys[monthKeys.length - 1])}`;
  const chartMonthSet = new Set(chartMonthKeys);
  const chartRows = normalizedRows.filter((row) => chartMonthSet.has(row.monthKey));
  const chartPeriodLabel = `${monthLabelFromKey(chartMonthKeys[0])} - ${monthLabelFromKey(chartMonthKeys[chartMonthKeys.length - 1])}`;

  const chartData = chartMonthKeys.map((monthKey) => {
    const monthRows = chartRows.filter((row) => row.monthKey === monthKey);
    const salesUnits = monthRows.reduce((sum, row) => sum + Number(row.salesUnits || 0), 0);
    const avgStockUnits = monthRows.reduce((sum, row) => sum + Number(row.avgStockUnits || 0), 0);
    const sellThroughValues = monthRows.map((row) => Number(row.sellThroughPct)).filter((value) => Number.isFinite(value));
    return {
      monthKey,
      monthLabel: monthLabelFromKey(monthKey),
      salesUnits,
      avgStockUnits,
      turnRate: avgStockUnits > 0 ? salesUnits / avgStockUnits : null,
      sellThroughPct: sellThroughValues.length
        ? sellThroughValues.reduce((sum, value) => sum + value, 0) / sellThroughValues.length
        : null,
    };
  });

  const buildSummaryRows = (level: 'category' | 'subcategory') => {
    const buckets = new Map<string, any>();
    for (const row of periodRows) {
      const key = level === 'category' ? row.category : `${row.category}||${row.subcategory}`;
      const bucket = buckets.get(key) || {
        key,
        category: row.category,
        subcategory: level === 'subcategory' ? row.subcategory : null,
        label: level === 'category' ? row.category : row.subcategory,
        salesUnits: 0,
        buysUnits: 0,
        avgStockByMonth: new Map<string, number>(),
        sellThroughValues: [] as number[],
        latestOnHandUnits: null as number | null,
      };
      bucket.salesUnits += Number(row.salesUnits || 0);
      bucket.buysUnits += Number(row.buysUnits || 0);
      bucket.avgStockByMonth.set(row.monthKey, (bucket.avgStockByMonth.get(row.monthKey) || 0) + Number(row.avgStockUnits || 0));
      if (Number.isFinite(Number(row.sellThroughPct))) bucket.sellThroughValues.push(Number(row.sellThroughPct));
      if (row.monthKey === latestMonthKey && row.currentOnHandUnits != null) {
        bucket.latestOnHandUnits = (bucket.latestOnHandUnits || 0) + Number(row.currentOnHandUnits || 0);
      }
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values()).map((bucket) => {
      const avgStockValues = Array.from((bucket.avgStockByMonth as Map<string, number>).values()).filter((value) => value > 0);
      const avgStockUnits = avgStockValues.length
        ? avgStockValues.reduce((sum, value) => sum + value, 0) / avgStockValues.length
        : 0;
      return {
        key: bucket.key,
        category: bucket.category,
        subcategory: bucket.subcategory,
        label: bucket.label,
        salesUnits: bucket.salesUnits,
        buysUnits: bucket.buysUnits,
        avgStockUnits,
        latestOnHandUnits: bucket.latestOnHandUnits,
        turnRate: avgStockUnits > 0 ? bucket.salesUnits / avgStockUnits : null,
        sellThroughPct: bucket.sellThroughValues.length
          ? bucket.sellThroughValues.reduce((sum: number, value: number) => sum + value, 0) / bucket.sellThroughValues.length
          : null,
      };
    }).sort((a, b) => Number(b.turnRate || 0) - Number(a.turnRate || 0));
  };

  return {
    latestMonthKey,
    latestMonthLabel: monthLabelFromKey(latestMonthKey),
    periodLabel,
    chartPeriodLabel,
    chartData,
    categoryRows: buildSummaryRows('category'),
    subcategoryRows: buildSummaryRows('subcategory'),
  };
}
