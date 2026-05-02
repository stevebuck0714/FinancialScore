import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { parsePlatosClosetWorkbook, type ParsedWorkbookSummary } from '@/lib/operational/platos-closet-parser';

const SOURCE_CODE = 'PLATOS_CLOSET_STORE_VISIT';

type MonthlyFactRow = {
  monthKey: string;
  monthStart: Date;
  factType: string;
  metricName: string;
  dimensionType: string;
  dimensionKey: string;
  dimensionLabel: string | null;
  valueNumber: number | null;
  compareNumber: number | null;
  sharePct: number | null;
  auxNumber: number | null;
  metadata: Record<string, unknown> | null;
};

type SavePlatosClosetMonthlyFactsInput = {
  companyId: string;
  monthKey: string;
  parsedWorkbook: ParsedWorkbookSummary;
};

function monthStartFromKey(monthKey: string): Date {
  const [yearRaw, monthRaw] = String(monthKey || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return new Date(Date.UTC(year, Math.max(month - 1, 0), 1, 0, 0, 0, 0));
}

function monthBounds(startDate: Date, endDate: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
  };
}

function metricSlug(label: string): string {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/%/g, ' pct ')
    .replace(/\$/g, ' dollars ')
    .replace(/@/g, ' at ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const aliases: Record<string, string> = {
    total_sales: 'total_sales',
    avg_sales_transaction: 'avg_sales_transaction',
    avg_items_per_sales_transaction: 'avg_items_per_sales_transaction',
    sales_transaction_count: 'sales_transaction_count',
    sales_gm_pct: 'sales_gm_pct',
    sales_gm_dollars: 'sales_gm_dollars',
    total_buys_cost: 'total_buys_cost',
    avg_items_per_buy_transaction: 'avg_items_per_buy_transaction',
    total_buys_units: 'total_buys_units',
    number_of_buys: 'buy_transaction_count',
    avg_cost_per_unit: 'avg_buy_cost_per_unit',
    avg_retail_per_unit: 'avg_buy_retail_per_unit',
    trade_of_buys: 'trade_pct_buys',
    trade_pct_of_buys: 'trade_pct_buys',
    return_of_sales: 'return_pct_sales',
    return_pct_of_sales: 'return_pct_sales',
  };

  return aliases[normalized] || normalized;
}

async function needsPlatosFactRebuild(companyId: string): Promise<boolean> {
  try {
    const agingSnapshotRows = await prisma.$queryRaw<Array<{ snapshotCount: bigint; factCount: bigint }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "parsedWorkbook" ? 'retailProductAging' OR "blobUrl" IS NOT NULL)::bigint AS "snapshotCount",
        (
          SELECT COUNT(*)::bigint
          FROM "PlatosClosetMonthlyFact" f
          WHERE f."companyId" = ${companyId}
            AND f."sourceCode" = ${SOURCE_CODE}
            AND f."factType" = 'retail_product_aging'
            AND f."metricName" = 'used_inventory_age_dollars'
        ) AS "factCount"
      FROM "PlatosClosetWorkbookSnapshot"
      WHERE "companyId" = ${companyId}
        AND "sourceCode" = ${SOURCE_CODE}
    `);
    const agingSnapshotCount = Number(agingSnapshotRows[0]?.snapshotCount || 0);
    const agingFactCount = Number(agingSnapshotRows[0]?.factCount || 0);
    if (agingSnapshotCount > 0 && agingFactCount === 0) return true;

    const staleCategoryRows = await prisma.$queryRaw<Array<{ staleCount: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "staleCount"
      FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${companyId}
        AND "sourceCode" = ${SOURCE_CODE}
        AND "factType" = 'category_metric'
        AND (
          "dimensionLabel" IN ('NEW', 'AGED INVENTORY', 'OPEN SKU/USED BULK')
          OR "metadata"->>'department' IN ('NEW', 'AGED INVENTORY', 'OPEN SKU/USED BULK')
        )
    `);
    if (Number(staleCategoryRows[0]?.staleCount || 0) > 0) return true;

    const rows = await prisma.$queryRaw<Array<{ metricName: string; valueNumber: number | null }>>(Prisma.sql`
      SELECT "metricName", "valueNumber"
      FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${companyId}
        AND "sourceCode" = ${SOURCE_CODE}
        AND "factType" = 'summary_metric'
        AND "metricName" IN ('sales_gm_pct', 'sales_gm_dollars')
      ORDER BY "monthStart" DESC
    `);
    if (!rows.length) return true;
    const salesGmPct = rows.find((row) => row.metricName === 'sales_gm_pct');
    const salesGmDollars = rows.find((row) => row.metricName === 'sales_gm_dollars');
    if (!salesGmPct || !salesGmDollars) return true;
    const pctValue = Number(salesGmPct.valueNumber ?? 0);
    const dollarsValue = Number(salesGmDollars.valueNumber ?? 0);
    return pctValue > 1.5 || pctValue > dollarsValue;
  } catch {
    return false;
  }
}

function factKey(row: {
  factType: string;
  metricName: string;
  dimensionType?: string | null;
  dimensionKey?: string | null;
}): string {
  return [
    row.factType,
    row.metricName,
    row.dimensionType || '',
    row.dimensionKey || '',
  ].join('|');
}

function normalizeDimensionKey(value: string | null, fallback: string): string {
  const base = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'unknown';
}

function isRetailProductAgingTotal(ageBucket: string): boolean {
  return /^totals?$/i.test(String(ageBucket || '').trim());
}

function buildFacts(parsedWorkbook: ParsedWorkbookSummary): MonthlyFactRow[] {
  const facts = new Map<string, MonthlyFactRow>();
  const monthStart = monthStartFromKey(parsedWorkbook.monthKey || '');

  const upsertFact = (row: MonthlyFactRow) => {
    facts.set(factKey(row), row);
  };

  const metricSections = [
    ...parsedWorkbook.salesKpis,
    ...parsedWorkbook.buysKpis,
    ...parsedWorkbook.lossPreventionKpis,
  ];

  for (const metric of metricSections) {
    upsertFact({
      monthKey: parsedWorkbook.monthKey || '',
      monthStart,
      factType: 'summary_metric',
      metricName: metricSlug(metric.metric),
      dimensionType: '',
      dimensionKey: '',
      dimensionLabel: metric.metric,
      valueNumber: metric.current,
      compareNumber: metric.prior,
      sharePct: null,
      auxNumber: metric.delta,
      metadata: null,
    });
  }

  const totalRow =
    parsedWorkbook.categoryMetrics.find((row) => row.department === 'USED' && !row.category) ||
    parsedWorkbook.categoryMetrics.find((row) => !row.category) ||
    null;

  if (totalRow) {
    upsertFact({
      monthKey: parsedWorkbook.monthKey || '',
      monthStart,
      factType: 'summary_metric',
      metricName: 'inventory_on_hand_total',
      dimensionType: '',
      dimensionKey: '',
      dimensionLabel: 'Inventory On Hand Total',
      valueNumber: totalRow.inventoryOnHandDollars,
      compareNumber: null,
      sharePct: totalRow.inventoryMixPct,
      auxNumber: totalRow.grossMarginDollars,
      metadata: {
        grossMarginPct: totalRow.grossMarginPct,
        imuPct: totalRow.imuPct,
        salesMixPct: totalRow.salesMixPct,
      },
    });
  }

  upsertFact({
    monthKey: parsedWorkbook.monthKey || '',
    monthStart,
    factType: 'summary_metric',
    metricName: 'category_row_count',
    dimensionType: '',
    dimensionKey: '',
    dimensionLabel: 'Category Row Count',
    valueNumber: parsedWorkbook.categorySummary.categoryCount,
    compareNumber: null,
    sharePct: null,
    auxNumber: null,
    metadata: null,
  });

  for (const row of parsedWorkbook.categoryMetrics) {
    const dimensionType = row.category ? 'category' : 'department';
    const dimensionLabel = row.category || row.department || 'Unknown';
    const dimensionKey = row.category
      ? normalizeDimensionKey(row.category, `${row.department || 'unknown'}_${row.category}`)
      : normalizeDimensionKey(row.department, 'department');
    upsertFact({
      monthKey: parsedWorkbook.monthKey || '',
      monthStart,
      factType: 'category_metric',
      metricName: 'net_sales',
      dimensionType,
      dimensionKey,
      dimensionLabel,
      valueNumber: row.currentSales,
      compareNumber: row.priorSales,
      sharePct: row.salesMixPct,
      auxNumber: row.grossMarginDollars,
      metadata: {
        department: row.department,
        category: row.category,
        compPct: row.compPct,
        deltaDollars: row.deltaDollars,
        inventoryMixPct: row.inventoryMixPct,
        inventoryOnHandDollars: row.inventoryOnHandDollars,
        imuPct: row.imuPct,
        grossMarginPct: row.grossMarginPct,
      },
    });
  }

  for (const row of parsedWorkbook.retailProductAging || []) {
    if (String(row.productType || '').trim().toUpperCase() !== 'USED') continue;
    if (!row.ageBucket || isRetailProductAgingTotal(row.ageBucket)) continue;
    upsertFact({
      monthKey: parsedWorkbook.monthKey || '',
      monthStart,
      factType: 'retail_product_aging',
      metricName: 'used_inventory_age_dollars',
      dimensionType: 'age_bucket',
      dimensionKey: normalizeDimensionKey(row.ageBucket, 'age_bucket'),
      dimensionLabel: row.ageBucket,
      valueNumber: row.dollars,
      compareNumber: row.units,
      sharePct: row.inventoryPct,
      auxNumber: null,
      metadata: {
        productType: row.productType,
      },
    });
  }

  return Array.from(facts.values()).filter((row) => row.monthKey);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export async function savePlatosClosetMonthlyFacts(input: SavePlatosClosetMonthlyFactsInput): Promise<void> {
  const facts = buildFacts(input.parsedWorkbook);
  const serializedFacts = JSON.stringify(
    facts.map((fact) => ({
      monthKey: fact.monthKey,
      monthStart: fact.monthStart.toISOString(),
      factType: fact.factType,
      metricName: fact.metricName,
      dimensionType: fact.dimensionType,
      dimensionKey: fact.dimensionKey,
      dimensionLabel: fact.dimensionLabel,
      valueNumber: fact.valueNumber,
      compareNumber: fact.compareNumber,
      sharePct: fact.sharePct,
      auxNumber: fact.auxNumber,
      metadata: fact.metadata || {},
    })),
  );

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${input.companyId}
        AND "sourceCode" = ${SOURCE_CODE}
        AND "monthKey" = ${input.monthKey}
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
      ${SOURCE_CODE},
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

async function listMonthlyFacts(companyId: string, startDate: Date, endDate: Date): Promise<MonthlyFactRow[]> {
  try {
    const bounds = monthBounds(startDate, endDate);
    const rows = await prisma.$queryRaw<Array<MonthlyFactRow & { metadata: unknown }>>(Prisma.sql`
      SELECT
        "monthKey",
        "monthStart",
        "factType",
        "metricName",
        COALESCE("dimensionType", '') AS "dimensionType",
        COALESCE("dimensionKey", '') AS "dimensionKey",
        "dimensionLabel",
        "valueNumber",
        "compareNumber",
        "sharePct",
        "auxNumber",
        "metadata"
      FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${companyId}
        AND "sourceCode" = ${SOURCE_CODE}
        AND "monthStart" >= ${bounds.start}
        AND "monthStart" <= ${bounds.end}
      ORDER BY "monthStart" ASC, "factType" ASC, "dimensionLabel" ASC
    `);

    return rows.map((row) => ({
      ...row,
      monthStart: new Date(row.monthStart),
      metadata: asObject(row.metadata),
    }));
  } catch {
    return [];
  }
}

export async function hasPlatosClosetMonthlyFacts(companyId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: number }>>(Prisma.sql`
      SELECT 1 AS exists
      FROM "PlatosClosetMonthlyFact"
      WHERE "companyId" = ${companyId}
        AND "sourceCode" = ${SOURCE_CODE}
      LIMIT 1
    `);
    return rows.length > 0;
  } catch {
    return false;
  }
}

function asMetricRows(value: unknown): ParsedWorkbookSummary['salesKpis'] {
  return Array.isArray(value) ? (value as ParsedWorkbookSummary['salesKpis']) : [];
}

function asTrendRows(value: unknown): ParsedWorkbookSummary['salesHistory'] {
  return Array.isArray(value) ? (value as ParsedWorkbookSummary['salesHistory']) : [];
}

function asCategoryMetrics(value: unknown): ParsedWorkbookSummary['categoryMetrics'] {
  return Array.isArray(value) ? (value as ParsedWorkbookSummary['categoryMetrics']) : [];
}

function asRetailProductAging(value: unknown): ParsedWorkbookSummary['retailProductAging'] {
  return Array.isArray(value) ? (value as ParsedWorkbookSummary['retailProductAging']) : [];
}

function asMarketingChannels(value: unknown): ParsedWorkbookSummary['marketingChannels'] {
  return Array.isArray(value) ? (value as ParsedWorkbookSummary['marketingChannels']) : [];
}

function asCategorySummary(value: unknown): ParsedWorkbookSummary['categorySummary'] {
  const obj = asObject(value);
  return {
    rowCount: asNumber(obj?.rowCount),
    departmentCount: asNumber(obj?.departmentCount),
    categoryCount: asNumber(obj?.categoryCount),
    topDepartmentsBySales: Array.isArray(obj?.topDepartmentsBySales)
      ? (obj?.topDepartmentsBySales as ParsedWorkbookSummary['categorySummary']['topDepartmentsBySales'])
      : [],
  };
}

function asParsedWorkbookSummary(value: unknown, monthKey: string): ParsedWorkbookSummary | null {
  const obj = asObject(value);
  if (!obj) return null;
  return {
    sheetNames: Array.isArray(obj.sheetNames) ? (obj.sheetNames as string[]) : [],
    requiredSheets: Array.isArray(obj.requiredSheets) ? (obj.requiredSheets as string[]) : [],
    currentPeriodLabel: obj.currentPeriodLabel ? String(obj.currentPeriodLabel) : null,
    monthKey,
    storeInfo: asObject(obj.storeInfo) || {},
    salesKpis: asMetricRows(obj.salesKpis),
    buysKpis: asMetricRows(obj.buysKpis),
    lossPreventionKpis: asMetricRows(obj.lossPreventionKpis),
    salesHistory: asTrendRows(obj.salesHistory),
    buysHistory: asTrendRows(obj.buysHistory),
    marketingChannels: asMarketingChannels(obj.marketingChannels),
    categoryMetrics: asCategoryMetrics(obj.categoryMetrics),
    retailProductAging: asRetailProductAging(obj.retailProductAging),
    categorySummary: asCategorySummary(obj.categorySummary),
  };
}

export async function ensurePlatosClosetMonthlyFacts(companyId: string): Promise<boolean> {
  const hasExistingFacts = await hasPlatosClosetMonthlyFacts(companyId);
  if (hasExistingFacts && !(await needsPlatosFactRebuild(companyId))) return true;
  let snapshots: Array<{ monthKey: string; parsedWorkbook: unknown; blobUrl: string | null }> = [];
  try {
    snapshots = await prisma.$queryRaw<Array<{ monthKey: string; parsedWorkbook: unknown; blobUrl: string | null }>>(Prisma.sql`
      SELECT "monthKey", "parsedWorkbook", "blobUrl"
      FROM "PlatosClosetWorkbookSnapshot"
      WHERE "companyId" = ${companyId}
        AND "sourceCode" = ${SOURCE_CODE}
      ORDER BY "monthKey" ASC
    `);
  } catch {
    return false;
  }

  if (!snapshots.length) return false;

  for (const snapshot of snapshots) {
    let parsedWorkbook = asParsedWorkbookSummary(snapshot.parsedWorkbook, snapshot.monthKey);
    if (parsedWorkbook && snapshot.blobUrl) {
      try {
        const response = await fetch(snapshot.blobUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const reparsedWorkbook = parsePlatosClosetWorkbook(XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' }));
          parsedWorkbook = { ...reparsedWorkbook, monthKey: snapshot.monthKey };
        }
      } catch {
        // Keep the stored parsed snapshot if the historical blob is unavailable.
      }
    }
    if (!parsedWorkbook) continue;
    await savePlatosClosetMonthlyFacts({
      companyId,
      monthKey: snapshot.monthKey,
      parsedWorkbook,
    });
  }

  return hasPlatosClosetMonthlyFacts(companyId);
}

const HISTORY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function monthKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildHistorySection(rows: ParsedWorkbookSummary['salesHistory'], currentMonthKey: string) {
  const yearRows = rows.filter((row) => /^\d{4}$/.test(String(row.label || '').trim()));
  const pctRows = rows.filter((row) => String(row.label || '').includes('%'));
  const indexRow = rows.find((row) => /index/i.test(String(row.label || ''))) || null;
  const currentMonthLabel = HISTORY_MONTHS[Math.max(0, Math.min(11, Number(currentMonthKey.split('-')[1] || '1') - 1))];
  const currentYearRow = yearRows[0] || null;
  const priorYearRow = yearRows[1] || null;
  const latestPctRow = pctRows[0] || null;
  const chartData = HISTORY_MONTHS.map((month) => {
    const out: Record<string, string | number | null> = { month };
    yearRows.forEach((row) => {
      out[String(row.label)] = row.values[month] ?? null;
    });
    return out;
  });

  return {
    rows,
    currentMonthLabel,
    currentYearLabel: currentYearRow?.label || null,
    priorYearLabel: priorYearRow?.label || null,
    currentMonthValue: currentYearRow?.values[currentMonthLabel] ?? null,
    priorMonthValue: priorYearRow?.values[currentMonthLabel] ?? null,
    totalValue: currentYearRow?.values.Total ?? null,
    mtdValue: currentYearRow?.values.MTD ?? null,
    currentMonthCompPct: latestPctRow?.values[currentMonthLabel] ?? null,
    totalCompPct: latestPctRow?.values.Total ?? null,
    mtdCompPct: latestPctRow?.values.MTD ?? null,
    indexPct: indexRow?.values[currentMonthLabel] ?? null,
    chartData,
  };
}

function buildCategoryRevenueSectionFromFacts(facts: MonthlyFactRow[]) {
  const categoryFacts = facts.filter((row) => row.factType === 'category_metric');
  const allRows = categoryFacts
    .filter((row) => row.dimensionType === 'category' || row.dimensionType === 'department')
    .map((row) => {
      const metadata = row.metadata || {};
      return {
        key: row.dimensionKey || row.dimensionLabel || 'unknown',
        name: String(row.dimensionLabel || 'Unknown'),
        totalRevenue: asNumber(row.valueNumber),
        priorRevenue: asNumber(row.compareNumber),
        compPct: asNumber(metadata.compPct),
        salesMixPct: asNumber(row.sharePct),
        grossMarginPct: asNumber(metadata.grossMarginPct),
        grossMarginDollars: asNumber(row.auxNumber),
        inventoryOnHandDollars: asNumber(metadata.inventoryOnHandDollars),
        department: metadata.department ? String(metadata.department) : null,
        category: metadata.category ? String(metadata.category) : null,
        totalInvoices: null,
      };
    });

  const nonAggregateRows = allRows.filter(
    (row) => !(String(row.department || '').trim().toUpperCase() === 'USED' && !row.category),
  );
  const sourceRows = nonAggregateRows.some((row) => row.category)
    ? nonAggregateRows.filter((row) => row.category)
    : nonAggregateRows.filter((row) => !row.category);

  const totals = new Map<string, (typeof sourceRows)[number]>();
  for (const row of sourceRows) {
    const key = String(row.key || row.name).trim();
    if (!key) continue;
    const bucket = totals.get(key) || { ...row, totalRevenue: 0, grossMarginDollars: 0 };
    bucket.totalRevenue += asNumber(row.totalRevenue);
    bucket.grossMarginDollars += asNumber(row.grossMarginDollars);
    totals.set(key, bucket);
  }

  const rows = Array.from(totals.values())
    .filter((row) => row.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return {
    rows,
    totalRevenue: rows.reduce((sum, row) => sum + asNumber(row.totalRevenue), 0),
    topCategory: rows[0] || null,
  };
}

function buildCategorySalesHistorySection(facts: MonthlyFactRow[]) {
  const categoryFacts = facts
    .filter((row) => row.factType === 'category_metric' && (row.dimensionType === 'category' || row.dimensionType === 'department'))
    .map((row) => {
      const metadata = row.metadata || {};
      return {
        monthKey: row.monthKey,
        monthStart: row.monthStart,
        key: row.dimensionKey || row.dimensionLabel || 'unknown',
        name: String(row.dimensionLabel || 'Unknown'),
        sales: asNumber(row.valueNumber),
        department: metadata.department ? String(metadata.department) : null,
        category: metadata.category ? String(metadata.category) : null,
      };
    })
    .filter((row) => !(String(row.department || '').trim().toUpperCase() === 'USED' && !row.category));

  if (!categoryFacts.length) return null;

  const monthRows = Array.from(
    categoryFacts.reduce((months: Map<string, { monthKey: string; monthStart: Date; monthLabel: string }>, row) => {
      months.set(row.monthKey, {
        monthKey: row.monthKey,
        monthStart: row.monthStart,
        monthLabel: row.monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      });
      return months;
    }, new Map<string, { monthKey: string; monthStart: Date; monthLabel: string }>())
      .values(),
  )
    .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime())
    .slice(-18);
  const monthKeys = new Set(monthRows.map((row) => row.monthKey));

  const departmentRows = categoryFacts.filter((row) => row.department && !row.category);
  const itemRows = categoryFacts.filter((row) => row.department && row.category);
  const totalSourceRows = departmentRows.length > 0 ? departmentRows : itemRows.length > 0 ? itemRows : categoryFacts;
  const totalValues: Record<string, number> = {};
  for (const row of totalSourceRows) {
    if (!monthKeys.has(row.monthKey)) continue;
    totalValues[row.monthKey] = asNumber(totalValues[row.monthKey]) + row.sales;
  }

  const categoryBuckets = new Map<
    string,
    {
      label: string;
      values: Record<string, number>;
      total: number;
      items: Map<string, { label: string; values: Record<string, number>; total: number }>;
    }
  >();
  const ensureCategoryBucket = (label: string) => {
    const categoryKey = label.trim();
    const bucket = categoryBuckets.get(categoryKey) || {
      label: categoryKey,
      values: {},
      total: 0,
      items: new Map<string, { label: string; values: Record<string, number>; total: number }>(),
    };
    categoryBuckets.set(categoryKey, bucket);
    return bucket;
  };

  for (const row of departmentRows) {
    if (!monthKeys.has(row.monthKey) || !row.department) continue;
    const bucket = ensureCategoryBucket(row.department);
    bucket.values[row.monthKey] = asNumber(bucket.values[row.monthKey]) + row.sales;
    bucket.total += row.sales;
  }

  for (const row of itemRows) {
    if (!monthKeys.has(row.monthKey) || !row.department || !row.category) continue;
    const bucket = ensureCategoryBucket(row.department);
    const itemKey = String(row.category).trim();
    const item = bucket.items.get(itemKey) || {
      label: itemKey,
      values: {},
      total: 0,
    };
    item.values[row.monthKey] = asNumber(item.values[row.monthKey]) + row.sales;
    item.total += row.sales;
    bucket.items.set(itemKey, item);
  }

  for (const bucket of categoryBuckets.values()) {
    if (bucket.total > 0) continue;
    for (const item of bucket.items.values()) {
      for (const [monthKey, value] of Object.entries(item.values)) {
        bucket.values[monthKey] = asNumber(bucket.values[monthKey]) + asNumber(value);
      }
      bucket.total += item.total;
    }
  }

  if (!categoryBuckets.size) {
    for (const row of categoryFacts) {
      if (!monthKeys.has(row.monthKey)) continue;
      const bucket = ensureCategoryBucket(row.name);
      bucket.values[row.monthKey] = asNumber(bucket.values[row.monthKey]) + row.sales;
      bucket.total += row.sales;
    }
  }

  return {
    months: monthRows,
    totalRow: {
      label: 'Total Sales',
      values: totalValues,
      total: Object.values(totalValues).reduce((sum, value) => sum + asNumber(value), 0),
    },
    rows: Array.from(categoryBuckets.values())
      .filter((row) => row.total > 0)
      .map((row) => ({
        label: row.label,
        values: row.values,
        total: row.total,
        items: Array.from(row.items.values())
          .filter((item) => item.total > 0)
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total),
  };
}

function buildGrossMarginHistorySection(facts: MonthlyFactRow[]) {
  const metricRows = facts.filter(
    (row) =>
      row.factType === 'summary_metric' &&
      (row.metricName === 'sales_gm_dollars' || row.metricName === 'sales_gm_pct'),
  );
  if (!metricRows.length) return null;

  const rowsByMonth = new Map<
    string,
    { monthStart: Date; gmDollars: number | null; gmPct: number | null }
  >();

  for (const row of metricRows) {
    const bucket = rowsByMonth.get(row.monthKey) || {
      monthStart: row.monthStart,
      gmDollars: null,
      gmPct: null,
    };
    if (row.metricName === 'sales_gm_dollars') bucket.gmDollars = asNumber(row.valueNumber);
    if (row.metricName === 'sales_gm_pct') bucket.gmPct = asNumber(row.valueNumber);
    rowsByMonth.set(row.monthKey, bucket);
  }

  const rows = Array.from(rowsByMonth.entries())
    .map(([monthKey, values]) => ({
      monthKey,
      monthStart: values.monthStart,
      monthLabel: values.monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      gmDollars: values.gmDollars,
      gmPct: values.gmPct == null ? null : values.gmPct * 100,
    }))
    .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime());

  return {
    rows,
    chartData: rows.slice(-18).map((row) => ({
      month: row.monthLabel,
      gmDollars: row.gmDollars,
      gmPct: row.gmPct,
    })),
  };
}

function buildMetricHistorySectionFromFacts(
  facts: MonthlyFactRow[],
  metricName: string,
  fallbackLatestMonthKey: string | null,
) {
  const metricRows = facts
    .filter((row) => row.factType === 'summary_metric' && row.metricName === metricName)
    .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime());
  if (!metricRows.length) return null;

  const rowsByYear = new Map<string, { label: string; values: Record<string, number | null> }>();
  for (const row of metricRows) {
    const yearLabel = String(row.monthStart.getUTCFullYear());
    const monthLabel = HISTORY_MONTHS[row.monthStart.getUTCMonth()] || row.monthKey;
    const bucket = rowsByYear.get(yearLabel) || {
      label: yearLabel,
      values: Object.fromEntries(HISTORY_MONTHS.map((month) => [month, null])) as Record<string, number | null>,
    };
    bucket.values[monthLabel] = asNumber(row.valueNumber);
    rowsByYear.set(yearLabel, bucket);
  }

  const orderedRows = Array.from(rowsByYear.values())
    .map((row) => ({
      ...row,
      values: {
        ...row.values,
        Total: HISTORY_MONTHS.reduce((sum, month) => sum + asNumber(row.values[month]), 0),
        MTD: null,
      },
    }))
    .sort((a, b) => String(b.label).localeCompare(String(a.label)));

  const latestRow = metricRows[metricRows.length - 1];
  const latestMonthKey = latestRow?.monthKey || fallbackLatestMonthKey;
  const currentMonthLabel = latestMonthKey
    ? HISTORY_MONTHS[Math.max(0, Math.min(11, Number(latestMonthKey.split('-')[1] || '1') - 1))]
    : HISTORY_MONTHS[metricRows[metricRows.length - 1]?.monthStart.getUTCMonth() || 0];
  const currentYearLabel = latestRow ? String(latestRow.monthStart.getUTCFullYear()) : orderedRows[0]?.label || null;
  const priorYearLabel = orderedRows.find((row) => row.label !== currentYearLabel)?.label || null;
  const currentYearRow = orderedRows.find((row) => row.label === currentYearLabel) || null;
  const priorYearRow = orderedRows.find((row) => row.label === priorYearLabel) || null;
  if (currentYearRow) currentYearRow.values.MTD = asNumber(latestRow?.valueNumber);

  const chartData = metricRows.slice(-18).map((row) => {
    const yearLabel = String(row.monthStart.getUTCFullYear());
    return {
      month: row.monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      monthKey: row.monthKey,
      [yearLabel]: asNumber(row.valueNumber),
    };
  });

  const latestValue = asNumber(latestRow?.valueNumber);
  const latestCompare = asNumber(latestRow?.compareNumber);
  const latestCompPct =
    latestCompare > 0 ? ((latestValue - latestCompare) / latestCompare) * 100 : null;

  return {
    rows: orderedRows,
    currentMonthLabel,
    currentYearLabel,
    priorYearLabel,
    currentMonthValue: latestValue,
    priorMonthValue: latestCompare,
    totalValue: currentYearRow?.values.Total ?? null,
    mtdValue: latestValue,
    currentMonthCompPct: latestCompPct == null ? null : latestCompPct / 100,
    totalCompPct: null,
    mtdCompPct: latestCompPct == null ? null : latestCompPct / 100,
    indexPct: null,
    chartData,
  };
}

export async function getPlatosClosetSalesPageSummary(args: {
  companyId: string;
  startDate: Date;
  endDate: Date;
}): Promise<any | null> {
  const historyStartDate = new Date(Date.UTC(args.endDate.getUTCFullYear(), args.endDate.getUTCMonth() - 17, 1));
  const startMonthKey = monthKeyFromDate(historyStartDate);
  const endMonthKey = monthKeyFromDate(args.endDate);
  try {
    await ensurePlatosClosetMonthlyFacts(args.companyId);
    const facts = await listMonthlyFacts(args.companyId, historyStartDate, args.endDate);
    if (!facts.length) return null;

    const snapshots = await prisma.$queryRaw<Array<{ monthKey: string; workbookPeriod: string | null }>>(Prisma.sql`
      SELECT "monthKey", "workbookPeriod"
      FROM "PlatosClosetWorkbookSnapshot"
      WHERE "companyId" = ${args.companyId}
        AND "sourceCode" = ${SOURCE_CODE}
        AND "monthKey" >= ${startMonthKey}
        AND "monthKey" <= ${endMonthKey}
      ORDER BY "monthKey" DESC
    `);
    const latestSnapshot = snapshots[0];
    const latestFactMonthKey = facts
      .slice()
      .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime())
      .slice(-1)[0]?.monthKey || null;

    const sales = buildMetricHistorySectionFromFacts(facts, 'total_sales', latestFactMonthKey);
    const buys = buildMetricHistorySectionFromFacts(facts, 'total_buys_cost', latestFactMonthKey);
    const categoryRevenue = buildCategoryRevenueSectionFromFacts(facts);
    const categorySalesHistory = buildCategorySalesHistorySection(facts);
    const grossMarginHistory = buildGrossMarginHistorySection(facts);

    if (!sales && !buys && !categoryRevenue && !grossMarginHistory) return null;
    const salesWithCategoryHistory = sales && categorySalesHistory ? { ...sales, categoryHistory: categorySalesHistory } : sales;

    return {
      latestMonthKey: latestSnapshot?.monthKey || latestFactMonthKey,
      workbookPeriod: latestSnapshot?.workbookPeriod || latestFactMonthKey || null,
      sales: salesWithCategoryHistory,
      buys,
      grossMarginHistory,
      categoryRevenue,
    };
  } catch {
    return null;
  }
}

export async function getPlatosClosetProductsPayload(args: {
  companyId: string;
  startDate: Date;
  endDate: Date;
  limit?: number;
}): Promise<any | null> {
  const facts = await listMonthlyFacts(args.companyId, args.startDate, args.endDate);
  const historyStartDate = new Date(Date.UTC(args.endDate.getUTCFullYear(), args.endDate.getUTCMonth() - 17, 1));
  const historyFacts = await listMonthlyFacts(args.companyId, historyStartDate, args.endDate);
  const categoryFacts = facts.filter((row) => row.factType === 'category_metric');
  if (!categoryFacts.length) return null;

  const allRows = categoryFacts
    .filter((row) => row.dimensionType === 'category' || row.dimensionType === 'department')
    .map((row) => {
      const metadata = row.metadata || {};
      const revenue = asNumber(row.valueNumber);
      const grossMarginDollars = asNumber(row.auxNumber);
      const grossMarginPct = asNumber(metadata.grossMarginPct);
      return {
        snapshotDate: row.monthStart.toISOString(),
        itemName: row.dimensionLabel || 'Unknown',
        itemId: row.dimensionKey,
        sku: row.dimensionKey,
        revenue,
        cogs: revenue - grossMarginDollars,
        quantitySold: 0,
        grossMarginPct: grossMarginPct * 100,
        grossMarginDollars,
        priorRevenue: asNumber(row.compareNumber),
        compPct: asNumber(metadata.compPct) * 100,
        deltaDollars: asNumber(metadata.deltaDollars),
        salesMixPct: asNumber(row.sharePct) * 100,
        inventoryOnHandDollars: asNumber(metadata.inventoryOnHandDollars),
        inventoryMixPct: asNumber(metadata.inventoryMixPct) * 100,
        imuPct: asNumber(metadata.imuPct) * 100,
        department: String(metadata.department || row.dimensionLabel || ''),
        category: metadata.category ? String(metadata.category) : null,
      };
    });

  const nonAggregateRows = allRows.filter(
    (row) => !(String(row.department || '').trim().toUpperCase() === 'USED' && !row.category),
  );
  const productRows = nonAggregateRows.some((row) => row.category)
    ? nonAggregateRows.filter((row) => row.category)
    : nonAggregateRows.filter((row) => !row.category);
  const buyMetricNames = new Set([
    'total_buys_cost',
    'avg_items_per_buy_transaction',
    'total_buys_units',
    'buy_transaction_count',
    'avg_buy_cost_per_unit',
    'avg_buy_retail_per_unit',
  ]);
  const buyMetricsByMonth = new Map<string, { monthStart: Date; values: Map<string, number> }>();
  for (const row of facts) {
    if (row.factType !== 'summary_metric' || !buyMetricNames.has(row.metricName)) continue;
    const bucket = buyMetricsByMonth.get(row.monthKey) || {
      monthStart: row.monthStart,
      values: new Map<string, number>(),
    };
    bucket.values.set(row.metricName, asNumber(row.valueNumber));
    buyMetricsByMonth.set(row.monthKey, bucket);
  }
  const latestBuyMetricMonthKey =
    Array.from(buyMetricsByMonth.entries())
      .filter(([, bucket]) =>
        asNumber(bucket.values.get('total_buys_cost')) > 0 ||
        asNumber(bucket.values.get('total_buys_units')) > 0 ||
        asNumber(bucket.values.get('buy_transaction_count')) > 0,
      )
      .sort(([, a], [, b]) => a.monthStart.getTime() - b.monthStart.getTime())
      .slice(-1)[0]?.[0] || null;
  const metricMonthKey = latestBuyMetricMonthKey;
  const latestMonthRows = metricMonthKey
    ? productRows.filter((row) => String(row.snapshotDate || '').slice(0, 7) === metricMonthKey)
    : [];
  const latestSummaryFacts = metricMonthKey
    ? facts.filter((row) => row.factType === 'summary_metric' && row.monthKey === metricMonthKey)
    : [];
  const metricByName = new Map(latestSummaryFacts.map((row) => [row.metricName, row]));
  const latestTopCategory = [...latestMonthRows]
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];

  const totals = new Map<string, any>();
  for (const row of productRows) {
    const key = String(row.sku || row.itemName || '').trim();
    if (!key) continue;
    const bucket = totals.get(key) || {
      name: row.itemName,
      sku: row.sku,
      totalRevenue: 0,
      totalCogs: 0,
      totalQuantity: 0,
    };
    bucket.totalRevenue += asNumber(row.revenue);
    bucket.totalCogs += asNumber(row.cogs);
    bucket.totalQuantity += asNumber(row.quantitySold);
    totals.set(key, bucket);
  }

  const topProducts = Array.from(totals.values())
    .map((row) => ({
      ...row,
      grossMargin: row.totalRevenue - row.totalCogs,
      grossMarginPct: row.totalRevenue > 0 ? ((row.totalRevenue - row.totalCogs) / row.totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, Math.min(Math.max(args.limit || 10, 5), 25));
  const lossPreventionRowsByMonth = new Map<
    string,
    { monthKey: string; monthStart: Date; monthLabel: string; tradePctBuys: number | null; returnPctSales: number | null }
  >();
  for (const row of historyFacts.filter(
    (fact) =>
      fact.factType === 'summary_metric' &&
      (
        fact.metricName === 'trade_pct_buys' ||
        fact.metricName === 'trade_pct_of_buys' ||
        fact.metricName === 'return_pct_sales' ||
        fact.metricName === 'return_pct_of_sales'
      ),
  )) {
    const bucket = lossPreventionRowsByMonth.get(row.monthKey) || {
      monthKey: row.monthKey,
      monthStart: row.monthStart,
      monthLabel: row.monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      tradePctBuys: null,
      returnPctSales: null,
    };
    const percentValue = asNumber(row.valueNumber) * 100;
    if (row.metricName === 'trade_pct_buys' || row.metricName === 'trade_pct_of_buys') bucket.tradePctBuys = percentValue;
    if (row.metricName === 'return_pct_sales' || row.metricName === 'return_pct_of_sales') bucket.returnPctSales = percentValue;
    lossPreventionRowsByMonth.set(row.monthKey, bucket);
  }
  const lossPreventionRows = Array.from(lossPreventionRowsByMonth.values())
    .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime())
    .slice(-18);

  return {
    records: productRows,
    summary: {
      topProducts,
      lossPrevention: {
        rows: lossPreventionRows,
      },
      platosMetrics: metricMonthKey
        ? {
            latestMonthKey: metricMonthKey,
            totalSales: asNumber(metricByName.get('total_sales')?.valueNumber),
            totalSalesPrior: asNumber(metricByName.get('total_sales')?.compareNumber),
            grossMarginPct: asNumber(metricByName.get('sales_gm_pct')?.valueNumber) * 100,
            grossMarginPctPrior: asNumber(metricByName.get('sales_gm_pct')?.compareNumber) * 100,
            grossMarginDollars: asNumber(metricByName.get('sales_gm_dollars')?.valueNumber),
            grossMarginDollarsPrior: asNumber(metricByName.get('sales_gm_dollars')?.compareNumber),
            totalBuysCost: asNumber(metricByName.get('total_buys_cost')?.valueNumber),
            totalBuysCostPrior: asNumber(metricByName.get('total_buys_cost')?.compareNumber),
            avgItemsPerBuyTransaction: asNumber(metricByName.get('avg_items_per_buy_transaction')?.valueNumber),
            avgItemsPerBuyTransactionPrior: asNumber(metricByName.get('avg_items_per_buy_transaction')?.compareNumber),
            totalBuysUnits: asNumber(metricByName.get('total_buys_units')?.valueNumber),
            totalBuysUnitsPrior: asNumber(metricByName.get('total_buys_units')?.compareNumber),
            buyTransactionCount: asNumber(metricByName.get('buy_transaction_count')?.valueNumber),
            buyTransactionCountPrior: asNumber(metricByName.get('buy_transaction_count')?.compareNumber),
            avgBuyCostPerUnit: asNumber(metricByName.get('avg_buy_cost_per_unit')?.valueNumber),
            avgBuyCostPerUnitPrior: asNumber(metricByName.get('avg_buy_cost_per_unit')?.compareNumber),
            avgBuyRetailPerUnit: asNumber(metricByName.get('avg_buy_retail_per_unit')?.valueNumber),
            avgBuyRetailPerUnitPrior: asNumber(metricByName.get('avg_buy_retail_per_unit')?.compareNumber),
            inventoryOnHandTotal: asNumber(metricByName.get('inventory_on_hand_total')?.valueNumber),
            categoryCount: asNumber(metricByName.get('category_row_count')?.valueNumber),
            topCategory: latestTopCategory
              ? {
                  name: latestTopCategory.itemName,
                  revenue: asNumber(latestTopCategory.revenue),
                  grossMarginPct: asNumber(latestTopCategory.grossMarginPct),
                  inventoryOnHandDollars: asNumber(latestTopCategory.inventoryOnHandDollars),
                  compPct: asNumber(latestTopCategory.compPct),
                }
              : null,
          }
        : null,
      source: 'platos-closet-monthly-facts',
    },
  };
}

export async function getPlatosClosetInventoryPayload(args: {
  companyId: string;
  startDate: Date;
  endDate: Date;
}): Promise<any | null> {
  const trendEndDate = new Date();
  const trendStartDate = new Date(Date.UTC(trendEndDate.getUTCFullYear(), trendEndDate.getUTCMonth() - 35, 1));
  const facts = await listMonthlyFacts(args.companyId, trendStartDate, trendEndDate);
  if (!facts.length) return null;

  const summaryFacts = facts.filter((row) => row.factType === 'summary_metric');
  const categoryFacts = facts.filter((row) => row.factType === 'category_metric');
  const retailProductAgingFacts = facts.filter(
    (row) => row.factType === 'retail_product_aging' && row.metricName === 'used_inventory_age_dollars',
  );
  const inventorySeries = summaryFacts
    .filter((row) => row.metricName === 'inventory_on_hand_total')
    .map((row) => ({
      snapshotDate: row.monthStart.toISOString(),
      assetValue: asNumber(row.valueNumber),
    }))
    .sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  if (!inventorySeries.length || !categoryFacts.length) return null;

  const factsByMonth = categoryFacts.reduce((acc: Map<string, MonthlyFactRow[]>, row) => {
    const rows = acc.get(row.monthKey) || [];
    rows.push(row);
    acc.set(row.monthKey, rows);
    return acc;
  }, new Map<string, MonthlyFactRow[]>());
  const departmentInventoryByMonth = new Map<string, Map<string, { monthStart: Date; department: string; assetValue: number }>>();
  for (const [monthKey, monthFacts] of factsByMonth.entries()) {
    const hasCategoryRows = monthFacts.some((row) => {
      const metadata = row.metadata || {};
      return row.dimensionType === 'category' && Boolean(metadata.category);
    });
    const sourceRows = hasCategoryRows
      ? monthFacts.filter((row) => row.dimensionType === 'category')
      : monthFacts.filter((row) => row.dimensionType === 'department');

    for (const row of sourceRows) {
      const metadata = row.metadata || {};
      const department = String(metadata.department || row.dimensionLabel || '').trim();
      const category = metadata.category ? String(metadata.category) : null;
      if (!department || (department.toUpperCase() === 'USED' && !category)) continue;
      const inventoryOnHandDollars = asNumber(metadata.inventoryOnHandDollars);
      if (inventoryOnHandDollars <= 0) continue;
      const monthBucket = departmentInventoryByMonth.get(row.monthKey) || new Map<string, { monthStart: Date; department: string; assetValue: number }>();
      const departmentBucket = monthBucket.get(department) || {
        monthStart: row.monthStart,
        department,
        assetValue: 0,
      };
      departmentBucket.assetValue += inventoryOnHandDollars;
      monthBucket.set(department, departmentBucket);
      departmentInventoryByMonth.set(monthKey, monthBucket);
    }
  }
  const departmentInventorySeries = Array.from(departmentInventoryByMonth.values())
    .flatMap((monthBucket) =>
      Array.from(monthBucket.values()).map((row) => ({
        snapshotDate: row.monthStart.toISOString(),
        department: row.department,
        assetValue: row.assetValue,
      })),
    )
    .sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)) || String(a.department).localeCompare(String(b.department)));

  const totalSalesByMonth = new Map(
    summaryFacts
      .filter((row) => row.metricName === 'total_sales')
      .map((row) => [row.monthKey, asNumber(row.valueNumber)]),
  );
  const inventorySummaryFacts = summaryFacts
    .filter((row) => row.metricName === 'inventory_on_hand_total')
    .sort((a, b) => b.monthStart.getTime() - a.monthStart.getTime());
  const latestInventorySummary =
    inventorySummaryFacts.find((row) => asNumber(row.valueNumber) > 0 && asNumber(totalSalesByMonth.get(row.monthKey)) > 0) ||
    inventorySummaryFacts[0];
  const latestInventoryValue = asNumber(latestInventorySummary?.valueNumber);
  const latestInventoryMonthKey = latestInventorySummary?.monthKey || inventorySeries[inventorySeries.length - 1]?.snapshotDate.slice(0, 7) || '';
  const latestInventoryMonthLabel = latestInventorySummary?.monthStart
    ? latestInventorySummary.monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : latestInventoryMonthKey;
  const inventoryMovementRows = categoryFacts
    .filter((row) => row.dimensionType === 'category' || row.dimensionType === 'department')
    .map((row) => {
      const metadata = row.metadata || {};
      return {
        monthKey: row.monthKey,
        monthStart: row.monthStart.toISOString(),
        department: String(metadata.department || row.dimensionLabel || ''),
        category: metadata.category ? String(metadata.category) : null,
        label: row.dimensionLabel || 'Unknown',
        currentSales: asNumber(row.valueNumber),
        priorSales: asNumber(row.compareNumber),
        compPct: asNumber(metadata.compPct) * 100,
        deltaDollars: asNumber(metadata.deltaDollars),
        salesMixPct: asNumber(row.sharePct) * 100,
        inventoryMixPct: asNumber(metadata.inventoryMixPct) * 100,
        inventoryOnHandDollars: asNumber(metadata.inventoryOnHandDollars),
        imuPct: asNumber(metadata.imuPct) * 100,
        grossMarginPct: asNumber(metadata.grossMarginPct) * 100,
        grossMarginDollars: asNumber(row.auxNumber),
      };
    })
    .filter((row) => !(String(row.department || '').trim().toUpperCase() === 'USED' && !row.category))
    .filter((row) => row.category || row.currentSales > 0 || row.inventoryOnHandDollars > 0)
    .sort((a, b) => {
      const monthCompare = String(b.monthKey).localeCompare(String(a.monthKey));
      if (monthCompare !== 0) return monthCompare;
      return Number(b.inventoryOnHandDollars || 0) - Number(a.inventoryOnHandDollars || 0);
    });
  const latestCategoryRows = categoryFacts
    .filter((row) => row.monthKey === latestInventoryMonthKey)
    .filter((row) => row.dimensionType === 'category')
    .map((row) => {
      const metadata = row.metadata || {};
      return {
        itemName: row.dimensionLabel || 'Unknown',
        sku: row.dimensionKey,
        warehouse: 'Store',
        qtyOnHand: null,
        assetValue: asNumber(metadata.inventoryOnHandDollars),
        lastSaleDate: null,
        daysSinceLastSale: null,
        shippedQty30: 0,
        shippedQty60: 0,
        shippedQty90: 0,
        riskTier: 'Low',
        estimatedObsolescenceExposure: 0,
        department: String(metadata.department || row.dimensionLabel || ''),
        category: metadata.category ? String(metadata.category) : null,
      };
    })
    .filter((row) => !(String(row.department || '').trim().toUpperCase() === 'USED' && !row.category))
    .filter((row) => row.assetValue > 0)
    .sort((a, b) => b.assetValue - a.assetValue);

  const top5InventoryValue = latestCategoryRows.slice(0, 5).reduce((sum, row) => sum + asNumber(row.assetValue), 0);

  const agingBucketSortRank = (label: string): number => {
    const normalized = String(label || '').toLowerCase();
    if (normalized.includes('0-90')) return 1;
    if (normalized.includes('91-180')) return 2;
    if (normalized.includes('181-365')) return 3;
    if (normalized.includes('366')) return 4;
    return 99;
  };
  const retailProductAgingBuckets = Array.from(
    retailProductAgingFacts.reduce((bucketMap: Map<string, { key: string; label: string }>, row) => {
      const key = row.dimensionKey || normalizeDimensionKey(row.dimensionLabel, 'age_bucket');
      const label = String(row.dimensionLabel || key);
      bucketMap.set(key, { key, label });
      return bucketMap;
    }, new Map<string, { key: string; label: string }>())
      .values(),
  ).sort((a, b) => agingBucketSortRank(a.label) - agingBucketSortRank(b.label) || a.label.localeCompare(b.label));
  const retailProductAgingByMonth = new Map<string, Record<string, unknown>>();
  for (const row of retailProductAgingFacts) {
    const monthRow = retailProductAgingByMonth.get(row.monthKey) || {
      monthKey: row.monthKey,
      monthLabel: row.monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      totalDollars: 0,
      totalUnits: 0,
    };
    const key = row.dimensionKey || normalizeDimensionKey(row.dimensionLabel, 'age_bucket');
    const dollars = asNumber(row.valueNumber);
    const units = asNumber(row.compareNumber);
    monthRow[key] = dollars;
    monthRow[`${key}Units`] = units;
    monthRow[`${key}Pct`] = asNumber(row.sharePct) * 100;
    monthRow.totalDollars = asNumber(monthRow.totalDollars) + dollars;
    monthRow.totalUnits = asNumber(monthRow.totalUnits) + units;
    retailProductAgingByMonth.set(row.monthKey, monthRow);
  }
  const retailProductAgingChartData = Array.from(retailProductAgingByMonth.values()).sort((a, b) =>
    String(a.monthKey || '').localeCompare(String(b.monthKey || '')),
  ).slice(-36);
  const latestRetailProductAging = retailProductAgingChartData[retailProductAgingChartData.length - 1] || null;

  const cogsSeries = new Map<string, number>();
  for (const row of summaryFacts.filter((fact) => fact.metricName === 'total_sales' || fact.metricName === 'sales_gm_dollars')) {
    const acc = cogsSeries.get(row.monthKey) || 0;
    if (row.metricName === 'total_sales') {
      cogsSeries.set(row.monthKey, acc + asNumber(row.valueNumber));
    } else {
      cogsSeries.set(row.monthKey, acc - asNumber(row.valueNumber));
    }
  }
  const avgInventoryValue =
    inventorySeries.reduce((sum, row) => sum + asNumber(row.assetValue), 0) / Math.max(inventorySeries.length, 1);
  const periodCogs = Array.from(cogsSeries.values()).reduce((sum, value) => sum + value, 0);

  return {
    records: latestCategoryRows,
    trend: inventorySeries,
    departmentTrend: departmentInventorySeries,
    unitCostHistory: [],
    agingReport: [],
    summary: {
      totalValue: latestInventoryValue,
      itemCount: latestCategoryRows.length,
      topItems: latestCategoryRows.slice(0, 10),
      top5InventoryValue,
      latestInventoryMonthKey,
      latestInventoryMonthLabel,
      totalObsolescenceExposure: 0,
      inventoryTurnover: periodCogs > 0 && avgInventoryValue > 0 ? periodCogs / avgInventoryValue : null,
      inventoryMovement: {
        rows: inventoryMovementRows,
        monthCount: new Set(inventoryMovementRows.map((row) => row.monthKey)).size,
        rowCount: inventoryMovementRows.length,
      },
      retailProductAging: {
        buckets: retailProductAgingBuckets,
        chartData: retailProductAgingChartData,
        latestMonthKey: latestRetailProductAging?.monthKey || null,
        latestMonthLabel: latestRetailProductAging?.monthLabel || null,
        latestTotalDollars: asNumber(latestRetailProductAging?.totalDollars),
        latestTotalUnits: asNumber(latestRetailProductAging?.totalUnits),
      },
      source: 'platos-closet-monthly-facts',
    },
  };
}
