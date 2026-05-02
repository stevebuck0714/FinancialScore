import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';

export const RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE = 'RETAIL_SUBCATEGORY_HISTORY';

type ParsedRetailSubcategory = {
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

type ParsedRetailSubcategoryMonth = {
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

export function parseRetailSubcategoryHistoryWorkbook(workbook: XLSX.WorkBook): ParsedRetailSubcategoryHistory {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no worksheets.');
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true }) as unknown[][];
  const monthColumns = findMonthColumns(rows);
  if (monthColumns.length < 3) {
    throw new Error('Unable to find monthly columns like "Apr 2025", "May 2025" in the subcategory spreadsheet.');
  }

  const subcategories: ParsedRetailSubcategory[] = [];
  let current: ParsedRetailSubcategory | null = null;
  const metricsBySubcategory = new Map<
    ParsedRetailSubcategory,
    {
      bom: unknown[] | null;
      sales: unknown[] | null;
      buys: unknown[] | null;
      eom: unknown[] | null;
      sellThrough: unknown[] | null;
    }
  >();

  for (const row of rows) {
    const joined = row.map(asString).filter(Boolean).join(' ');
    const subcategoryMatch = joined.match(/Sub-Category:\s*(?:\[(.*?)\])?\s*(.+)$/i);
    if (subcategoryMatch) {
      current = {
        code: subcategoryMatch[1] ? asString(subcategoryMatch[1]) : null,
        name: asString(subcategoryMatch[2]),
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
    const label = row.map(metricName).find((cell) => ['bom units', 'sales', 'buys', 'eom units', 'sell through'].includes(cell));
    if (!label) continue;
    const bucket = metricsBySubcategory.get(current);
    if (!bucket) continue;
    if (label === 'bom units') {
      bucket.bom = row;
      current.currentOnHandUnits = extractTrailingValue(row, ['Units']);
      current.avgStockUnits = extractTrailingValue(row, ['Avg. Stock', 'Avg Stock']);
    } else if (label === 'sales') {
      bucket.sales = row;
      current.retailDollars = extractTrailingValue(row, ['Retail']);
      current.avgRetail = extractTrailingValue(row, ['Avg. Retail', 'Avg Retail']);
    } else if (label === 'buys') {
      bucket.buys = row;
      current.costDollars = extractTrailingValue(row, ['Cost']);
      current.avgCost = extractTrailingValue(row, ['Avg. Cost', 'Avg Cost']);
    } else if (label === 'eom units') {
      bucket.eom = row;
      current.imuPct = normalizePercent(extractTrailingValue(row, ['IMU%', 'IMU']));
    } else if (label === 'sell through') {
      bucket.sellThrough = row;
      current.turnRate = extractTrailingValue(row, ['Turn Rate']);
    }
  }

  for (const subcategory of subcategories) {
    const metrics = metricsBySubcategory.get(subcategory);
    if (!metrics) continue;
    subcategory.rows = monthColumns.map((month) => ({
      monthKey: month.monthKey,
      monthLabel: month.monthLabel,
      bomUnits: metrics.bom ? asNumber(metrics.bom[month.index]) : null,
      salesUnits: metrics.sales ? asNumber(metrics.sales[month.index]) : null,
      buysUnits: metrics.buys ? asNumber(metrics.buys[month.index]) : null,
      eomUnits: metrics.eom ? asNumber(metrics.eom[month.index]) : null,
      sellThroughPct: metrics.sellThrough ? normalizePercent(metrics.sellThrough[month.index]) : null,
    }));
  }

  const populated = subcategories.filter((subcategory) =>
    subcategory.rows.some(
      (row) => (row.salesUnits || 0) !== 0 || (row.buysUnits || 0) !== 0 || (row.eomUnits || 0) !== 0 || (row.bomUnits || 0) !== 0,
    ),
  );
  if (!populated.length) {
    throw new Error('No subcategory monthly rows were found in the spreadsheet.');
  }

  return {
    sheetNames: workbook.SheetNames,
    monthKeys: monthColumns.map((month) => month.monthKey),
    subcategories: populated,
  };
}

export async function saveRetailSubcategoryHistoryFacts(input: {
  companyId: string;
  parsed: ParsedRetailSubcategoryHistory;
}): Promise<void> {
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
        source: RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE,
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

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${input.companyId}
        AND "sourceCode" = ${RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE}
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
        ${RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE},
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
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "PlatosClosetMonthlyFact"
    WHERE "companyId" = ${companyId}
      AND "sourceCode" = ${RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE}
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
      AND "sourceCode" = ${RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE}
      AND "factType" = 'category_metric'
      AND "metricName" = 'sales_units'
      AND "monthStart" >= ${effectiveStartDate}
      AND "monthStart" <= ${args.endDate}
    ORDER BY "monthStart" ASC, "dimensionLabel" ASC
  `);
  if (!rows.length) return null;

  const records = rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
    const salesUnits = Number(row.valueNumber || 0);
    const avgRetail = Number(metadata.avgRetail || 0);
    const avgCost = Number(metadata.avgCost || 0);
    const revenue = avgRetail > 0 ? salesUnits * avgRetail : 0;
    const cogs = salesUnits * avgCost;
    return {
      snapshotDate: new Date(row.monthStart).toISOString(),
      itemName: String(row.dimensionLabel || metadata.subcategoryName || 'Unknown'),
      itemId: String(row.dimensionKey || metadata.subcategoryCode || row.dimensionLabel || 'unknown'),
      sku: String(metadata.subcategoryCode || row.dimensionKey || row.dimensionLabel || 'unknown'),
      category: String(row.dimensionLabel || metadata.subcategoryName || 'Unknown'),
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
