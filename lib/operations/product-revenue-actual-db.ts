import prisma from '@/lib/prisma';
import {
  emptyMonthQtyMap,
  normalizeMonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import {
  assertProductsForecastAccess,
  asForecastYear,
  asOptionalIsoDay,
  ensureProductRevenueForecastTables,
  loadCsiMonthlyShippedActuals,
  loadProductForecastLines,
  normalizeForecastLineInput,
  serializeForecastLine,
  upsertForecastLines,
  withCsiShippedActuals,
} from '@/lib/operations/product-revenue-forecast-db';
import {
  adjustedEstimatedMonths,
  annualActualRevenue,
  annualAdjustedEstimatedDollars,
  annualEstimatedDollars,
  estimatedMonths,
  normalizeShippingDays,
  priceKey,
  revenueLineKey,
  sgpEstimatedDollars,
  summarizeRevenueLines,
  type JoinedRevenueLine,
  type ProductRevenueLineInput,
  type ProductRevenuePriceInput,
  type ShippingDay,
  type ParsedProductRevenueWorkbook,
} from '@/lib/operations/product-revenue-actual';
import { buildShippingCalendar } from '@/lib/operations/product-shipping-days';
import {
  hasGoalDashboardData,
  normalizeGoalUpdateSnapshot,
  normalizePyramidSnapshot,
  type GoalUpdateSnapshot,
  type PyramidSnapshot,
} from '@/lib/operations/product-goal-update';

export { assertProductsForecastAccess, asForecastYear, asOptionalIsoDay };

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureProductRevenueTables(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductRevenueSettings" (
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "dataThru" TIMESTAMP(3),
          "shippingDays" JSONB NOT NULL DEFAULT '[]',
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductRevenueSettings_pkey" PRIMARY KEY ("companyId", "year")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductRevenueLine" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "customerId" TEXT NOT NULL,
          "customerName" TEXT NOT NULL,
          "customerGroup" TEXT,
          "customerPartNumber" TEXT NOT NULL DEFAULT '',
          "itemSku" TEXT NOT NULL,
          "team" TEXT,
          "csr" TEXT,
          "productionType" TEXT,
          "statusFlag" TEXT,
          "actualRevenue" JSONB NOT NULL DEFAULT '{}',
          "sortOrder" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductRevenueLine_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevenueLine_company_year_customer_item_part_key"
          ON "ProductRevenueLine"("companyId", "year", "customerId", "itemSku", "customerPartNumber")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ProductRevenueLine_companyId_year_customerId_idx"
          ON "ProductRevenueLine"("companyId", "year", "customerId")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductRevenuePrice" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "customerGroup" TEXT NOT NULL DEFAULT '',
          "itemSku" TEXT NOT NULL,
          "contractPrice" DOUBLE PRECISION,
          "sgpPrice" DOUBLE PRECISION,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductRevenuePrice_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevenuePrice_company_year_group_item_key"
          ON "ProductRevenuePrice"("companyId", "year", "customerGroup", "itemSku")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductGoalUpdate" (
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "dataThru" TIMESTAMP(3),
          "goalUpdate" JSONB NOT NULL DEFAULT '{}',
          "pyramid" JSONB NOT NULL DEFAULT '{}',
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductGoalUpdate_pkey" PRIMARY KEY ("companyId", "year")
        )
      `);
      await ensureProductRevenueForecastTables();
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

function asText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function newId(): string {
  return `prv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sqlValues(rowCount: number, columns: Array<{ jsonb?: boolean }>): string {
  const rows: string[] = [];
  let index = 1;
  for (let row = 0; row < rowCount; row += 1) {
    const cells = columns.map((column) => {
      const token = `$${index++}`;
      return column.jsonb ? `${token}::jsonb` : token;
    });
    rows.push(`(${cells.join(', ')})`);
  }
  return rows.join(', ');
}

type RevenueLineRow = {
  id: string;
  customerId: string;
  customerName: string;
  customerGroup: string | null;
  customerPartNumber: string;
  itemSku: string;
  team: string | null;
  csr: string | null;
  productionType: string | null;
  statusFlag: string | null;
  actualRevenue: unknown;
  sortOrder: number;
};

type RevenuePriceRow = {
  customerGroup: string;
  itemSku: string;
  contractPrice: number | null;
  sgpPrice: number | null;
};

type RevenueSettingsRow = {
  dataThru: Date | null;
  shippingDays: unknown;
};

export function normalizeRevenueLineInput(
  raw: Partial<ProductRevenueLineInput> & { id?: string },
  fallbackCustomer: { customerId: string; customerName: string },
  sortOrder: number
) {
  const itemSku = asText(raw.itemSku);
  const customerId = asText(raw.customerId) || fallbackCustomer.customerId;
  const customerName = asText(raw.customerName) || fallbackCustomer.customerName;
  return {
    id: asText(raw.id),
    customerId,
    customerName,
    customerGroup: asText(raw.customerGroup) || null,
    customerPartNumber: asText(raw.customerPartNumber),
    itemSku,
    team: asText(raw.team) || null,
    csr: asText(raw.csr) || null,
    productionType: asText(raw.productionType) || null,
    statusFlag: asText(raw.statusFlag) || null,
    actualRevenue: normalizeMonthQtyMap(raw.actualRevenue),
    sortOrder,
  };
}

export async function upsertRevenueSettings(params: {
  companyId: string;
  year: number;
  dataThru?: Date | null;
  shippingDays?: ShippingDay[] | null;
}) {
  const { companyId, year, dataThru, shippingDays } = params;
  const now = new Date();
  const nextShipping = shippingDays ? normalizeShippingDays(shippingDays) : null;
  const existing = await prisma.$queryRawUnsafe<RevenueSettingsRow[]>(
    `SELECT "dataThru", "shippingDays" FROM "ProductRevenueSettings" WHERE "companyId" = $1 AND "year" = $2 LIMIT 1`,
    companyId,
    year
  );
  const shippingJson = JSON.stringify(nextShipping || normalizeShippingDays(existing[0]?.shippingDays));
  const nextDataThru = dataThru === undefined ? existing[0]?.dataThru ?? null : dataThru;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ProductRevenueSettings" ("companyId", "year", "dataThru", "shippingDays", "updatedAt")
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT ("companyId", "year") DO UPDATE SET
       "dataThru" = EXCLUDED."dataThru",
       "shippingDays" = EXCLUDED."shippingDays",
       "updatedAt" = EXCLUDED."updatedAt"`,
    companyId,
    year,
    nextDataThru,
    shippingJson,
    now
  );
}

export async function upsertRevenueLines(params: {
  companyId: string;
  year: number;
  dataThru?: Date | null;
  replaceCustomer?: { customerId: string; customerName: string } | null;
  lines: ReturnType<typeof normalizeRevenueLineInput>[];
}) {
  const { companyId, year, dataThru, replaceCustomer, lines } = params;
  const now = new Date();
  await upsertRevenueSettings({ companyId, year, dataThru });

  if (replaceCustomer) {
    const keepIds = lines.map((line) => line.id).filter((id) => id && !id.startsWith('tmp-'));
    if (keepIds.length) {
      const placeholders = keepIds.map((_, index) => `$${index + 4}`).join(', ');
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ProductRevenueLine"
         WHERE "companyId" = $1 AND "year" = $2
           AND (${replaceCustomer.customerId ? `"customerId" = $3` : `"customerName" = $3`})
           AND "id" NOT IN (${placeholders})`,
        companyId,
        year,
        replaceCustomer.customerId || replaceCustomer.customerName,
        ...keepIds
      );
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ProductRevenueLine"
         WHERE "companyId" = $1 AND "year" = $2
           AND (${replaceCustomer.customerId ? `"customerId" = $3` : `"customerName" = $3`})`,
        companyId,
        year,
        replaceCustomer.customerId || replaceCustomer.customerName
      );
    }
  }

  const unique = new Map<string, (typeof lines)[number]>();
  for (const line of lines) {
    if (!line.itemSku) continue;
    unique.set(`${line.customerId}||${line.itemSku}||${line.customerPartNumber}`, line);
  }
  const rows = Array.from(unique.values());
  const columns = [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { jsonb: true }, {}, {}, {}];

  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset, offset + 80);
    const params: unknown[] = [];
    for (const line of chunk) {
      params.push(
        line.id && !line.id.startsWith('tmp-') ? line.id : newId(),
        companyId,
        year,
        line.customerId,
        line.customerName,
        line.customerGroup,
        line.customerPartNumber,
        line.itemSku,
        line.team,
        line.csr,
        line.productionType,
        line.statusFlag,
        JSON.stringify(line.actualRevenue),
        line.sortOrder,
        now,
        now
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ProductRevenueLine" (
         "id", "companyId", "year", "customerId", "customerName", "customerGroup", "customerPartNumber",
         "itemSku", "team", "csr", "productionType", "statusFlag", "actualRevenue", "sortOrder", "createdAt", "updatedAt"
       ) VALUES ${sqlValues(chunk.length, columns)}
       ON CONFLICT ("companyId", "year", "customerId", "itemSku", "customerPartNumber") DO UPDATE SET
         "customerName" = EXCLUDED."customerName",
         "customerGroup" = EXCLUDED."customerGroup",
         "team" = EXCLUDED."team",
         "csr" = EXCLUDED."csr",
         "productionType" = EXCLUDED."productionType",
         "statusFlag" = EXCLUDED."statusFlag",
         "actualRevenue" = EXCLUDED."actualRevenue",
         "sortOrder" = EXCLUDED."sortOrder",
         "updatedAt" = EXCLUDED."updatedAt"`,
      ...params
    );
  }
}

export async function upsertRevenuePrices(params: {
  companyId: string;
  year: number;
  prices: ProductRevenuePriceInput[];
}) {
  const { companyId, year, prices } = params;
  const now = new Date();
  const unique = new Map<string, ProductRevenuePriceInput>();
  for (const price of prices) {
    const itemSku = asText(price.itemSku);
    const customerGroup = asText(price.customerGroup);
    if (!itemSku) continue;
    unique.set(`${customerGroup}||${itemSku}`, {
      ...price,
      customerGroup,
      itemSku,
    });
  }
  const rows = Array.from(unique.values());
  const columns = [{}, {}, {}, {}, {}, {}, {}, {}, {}];

  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset, offset + 80);
    const params: unknown[] = [];
    for (const price of chunk) {
      params.push(
        newId(),
        companyId,
        year,
        price.customerGroup,
        price.itemSku,
        price.contractPrice,
        price.sgpPrice,
        now,
        now
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ProductRevenuePrice" (
         "id", "companyId", "year", "customerGroup", "itemSku", "contractPrice", "sgpPrice", "createdAt", "updatedAt"
       ) VALUES ${sqlValues(chunk.length, columns)}
       ON CONFLICT ("companyId", "year", "customerGroup", "itemSku") DO UPDATE SET
         "contractPrice" = COALESCE(EXCLUDED."contractPrice", "ProductRevenuePrice"."contractPrice"),
         "sgpPrice" = COALESCE(EXCLUDED."sgpPrice", "ProductRevenuePrice"."sgpPrice"),
         "updatedAt" = EXCLUDED."updatedAt"`,
      ...params
    );
  }
}

const MAX_IMPORT_ROWS = 20000;

function asImportedIsoDay(value: unknown): string | null {
  const text = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function asImportedYear(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return fallback;
  return parsed;
}

function asImportedNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function workbookFromImportPayload(raw: unknown, fallbackYear: number): ParsedProductRevenueWorkbook {
  const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rowsIn = Array.isArray(parsed.rows) ? parsed.rows : [];
  const pricesIn = Array.isArray(parsed.prices) ? parsed.prices : [];
  const forecastRaw =
    parsed.forecast && typeof parsed.forecast === 'object'
      ? (parsed.forecast as Record<string, unknown>)
      : null;
  const forecastRowsIn = Array.isArray(forecastRaw?.rows) ? forecastRaw.rows : [];
  const goalUpdate = normalizeGoalUpdateSnapshot(parsed.goalUpdate);
  const pyramid = normalizePyramidSnapshot(parsed.pyramid);
  if (rowsIn.length > MAX_IMPORT_ROWS || forecastRowsIn.length > MAX_IMPORT_ROWS || pricesIn.length > MAX_IMPORT_ROWS) {
    throw new Error('Workbook has too many rows to import.');
  }
  if (!rowsIn.length && !forecastRowsIn.length && !hasGoalDashboardData(goalUpdate, pyramid)) {
    throw new Error('No revenue, forecast, or Goal Update data found in the workbook.');
  }

  const dataThru = asImportedIsoDay(parsed.dataThru) || asImportedIsoDay(forecastRaw?.dataThru);
  const year = asImportedYear(parsed.year, fallbackYear);
  const forecastYear = asImportedYear(forecastRaw?.year, year);
  const forecastDataThru = asImportedIsoDay(forecastRaw?.dataThru) || dataThru;

  return {
    sheetName: asText(parsed.sheetName) || 'Revenue Current Year',
    year,
    dataThru,
    rows: rowsIn.map((row, index) => {
      const item = row && typeof row === 'object' ? (row as Partial<ProductRevenueLineInput>) : {};
      return normalizeRevenueLineInput(
        item,
        { customerId: asText(item.customerId), customerName: asText(item.customerName) },
        index
      );
    }),
    prices: pricesIn
      .map((row) => {
        const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        return {
          customerGroup: asText(item.customerGroup),
          itemSku: asText(item.itemSku),
          contractPrice: asImportedNumber(item.contractPrice),
          sgpPrice: asImportedNumber(item.sgpPrice),
        };
      })
      .filter((row) => row.itemSku),
    shippingDays: [],
    forecast: forecastRowsIn.length
      ? {
          sheetName: asText(forecastRaw?.sheetName) || 'Forecasts Current Year',
          year: forecastYear,
          dataThru: forecastDataThru,
          rows: forecastRowsIn.map((row, index) => {
            const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
            return normalizeForecastLineInput(
              item,
              { customerId: asText(item.customerId), customerName: asText(item.customerName) },
              index
            );
          }),
        }
      : null,
    goalUpdate,
    pyramid,
  };
}

type ProductGoalUpdateRow = {
  dataThru: Date | null;
  goalUpdate: unknown;
  pyramid: unknown;
};

export async function upsertProductGoalUpdate(params: {
  companyId: string;
  year: number;
  dataThru: Date | null;
  goalUpdate: GoalUpdateSnapshot | null;
  pyramid: PyramidSnapshot | null;
}) {
  if (!hasGoalDashboardData(params.goalUpdate, params.pyramid)) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ProductGoalUpdate" ("companyId", "year", "dataThru", "goalUpdate", "pyramid", "updatedAt")
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     ON CONFLICT ("companyId", "year") DO UPDATE SET
       "dataThru" = EXCLUDED."dataThru",
       "goalUpdate" = EXCLUDED."goalUpdate",
       "pyramid" = EXCLUDED."pyramid",
       "updatedAt" = EXCLUDED."updatedAt"`,
    params.companyId,
    params.year,
    params.dataThru,
    JSON.stringify(params.goalUpdate || {}),
    JSON.stringify(params.pyramid || {}),
    new Date()
  );
}

export async function loadProductGoalUpdate(params: {
  companyId: string;
  year: number;
}): Promise<{
  year: number;
  dataThru: string | null;
  goalUpdate: GoalUpdateSnapshot | null;
  pyramid: PyramidSnapshot | null;
}> {
  const rows = await prisma.$queryRawUnsafe<ProductGoalUpdateRow[]>(
    `SELECT "dataThru", "goalUpdate", "pyramid"
     FROM "ProductGoalUpdate"
     WHERE "companyId" = $1 AND "year" = $2
     LIMIT 1`,
    params.companyId,
    params.year
  );
  const row = rows[0];
  const dataThru = row?.dataThru ? new Date(row.dataThru).toISOString().slice(0, 10) : null;
  return {
    year: params.year,
    dataThru: Number.isNaN(Date.parse(dataThru || '')) ? null : dataThru,
    goalUpdate: normalizeGoalUpdateSnapshot(row?.goalUpdate),
    pyramid: normalizePyramidSnapshot(row?.pyramid),
  };
}

export async function persistParsedRevenueWorkbook(params: {
  companyId: string;
  parsed: ParsedProductRevenueWorkbook;
}) {
  const { companyId, parsed } = params;
  const dataThru = parsed.dataThru ? new Date(`${parsed.dataThru}T00:00:00.000Z`) : null;

  if (parsed.forecast?.rows.length) {
    const forecastLines = parsed.forecast.rows.map((row, index) =>
      normalizeForecastLineInput(row, { customerId: row.customerId, customerName: row.customerName }, index)
    );
    await upsertForecastLines({
      companyId,
      year: parsed.forecast.year || parsed.year,
      dataThru: parsed.forecast.dataThru ? new Date(`${parsed.forecast.dataThru}T00:00:00.000Z`) : dataThru,
      replaceCustomer: null,
      lines: forecastLines,
    });
  }

  const lines = parsed.rows.map((row, index) =>
    normalizeRevenueLineInput(row, { customerId: row.customerId, customerName: row.customerName }, index)
  );
  await upsertRevenueLines({
    companyId,
    year: parsed.year,
    dataThru,
    replaceCustomer: null,
    lines,
  });
  await upsertRevenuePrices({
    companyId,
    year: parsed.year,
    prices: parsed.prices,
  });
  await upsertRevenueSettings({
    companyId,
    year: parsed.year,
    dataThru,
  });

  const goalUpdate = normalizeGoalUpdateSnapshot(parsed.goalUpdate);
  const pyramid = normalizePyramidSnapshot(parsed.pyramid);
  await upsertProductGoalUpdate({
    companyId,
    year: parsed.year,
    dataThru,
    goalUpdate,
    pyramid,
  });

  return {
    year: parsed.year,
    dataThru: parsed.dataThru,
    sheetName: parsed.sheetName,
    rowCount: lines.length,
    customerCount: new Set(lines.map((line) => `${line.customerId}||${line.customerName}`)).size,
    priceCount: parsed.prices.length,
    forecastRowCount: parsed.forecast?.rows.length || 0,
    hasGoalUpdate: Boolean(goalUpdate),
    hasPyramid: Boolean(pyramid),
  };
}

function lookupPrice(
  prices: Map<string, { contractPrice: number | null; sgpPrice: number | null }>,
  customerGroup: string,
  itemSku: string
) {
  const exact = prices.get(priceKey(customerGroup, itemSku));
  if (exact && (exact.contractPrice != null || exact.sgpPrice != null)) return exact;

  const sku = itemSku.trim().toUpperCase().replace(/\s+/g, ' ');
  let fallback = { contractPrice: null as number | null, sgpPrice: null as number | null };
  for (const [key, value] of prices) {
    if (!key.endsWith(`||${sku}`)) continue;
    fallback = {
      contractPrice: fallback.contractPrice ?? value.contractPrice,
      sgpPrice: fallback.sgpPrice ?? value.sgpPrice,
    };
  }
  return fallback;
}

export function serializeJoinedRevenueLine(
  line: JoinedRevenueLine,
  dataThru?: string | Date | null
) {
  const estimated = estimatedMonths(line.forecastQty, line.contractPrice);
  const estimatedAdjusted = adjustedEstimatedMonths(
    line.forecastQty,
    line.actualQty,
    dataThru,
    line.contractPrice,
    line.adjustedQty
  );
  return {
    ...line,
    estimated,
    estimatedAdjusted,
    sgpEstimated: sgpEstimatedDollars(line.annualBaseQty, line.sgpPrice),
    annualEstimated: annualEstimatedDollars(line.forecastQty, line.contractPrice),
    annualAdjusted: annualAdjustedEstimatedDollars(
      line.forecastQty,
      line.actualQty,
      dataThru,
      line.contractPrice,
      line.adjustedQty
    ),
    annualYtd: annualActualRevenue(line.actualRevenue),
  };
}

export async function loadRevenueDataset(params: {
  companyId: string;
  year: number;
  customerId?: string;
  customerName?: string;
}) {
  const { companyId, year, customerId, customerName } = params;
  const [settingsRows, forecastSettings, forecastRaw, revenueRows, priceRows, shipped] = await Promise.all([
    prisma.$queryRawUnsafe<RevenueSettingsRow[]>(
      `SELECT "dataThru", "shippingDays" FROM "ProductRevenueSettings" WHERE "companyId" = $1 AND "year" = $2 LIMIT 1`,
      companyId,
      year
    ),
    prisma.productRevenueForecastSettings.findUnique({
      where: { companyId_year: { companyId, year } },
    }),
    loadProductForecastLines({ companyId, year }),
    prisma.$queryRawUnsafe<RevenueLineRow[]>(
      `SELECT "id", "customerId", "customerName", "customerGroup", "customerPartNumber", "itemSku",
              "team", "csr", "productionType", "statusFlag", "actualRevenue", "sortOrder"
       FROM "ProductRevenueLine"
       WHERE "companyId" = $1 AND "year" = $2
       ORDER BY "sortOrder" ASC, "itemSku" ASC`,
      companyId,
      year
    ),
    prisma.$queryRawUnsafe<RevenuePriceRow[]>(
      `SELECT "customerGroup", "itemSku", "contractPrice", "sgpPrice"
       FROM "ProductRevenuePrice"
       WHERE "companyId" = $1 AND "year" = $2`,
      companyId,
      year
    ),
    loadCsiMonthlyShippedActuals({ companyId, year }),
  ]);
  const settings = settingsRows[0] || null;
  const forecastRows = withCsiShippedActuals(forecastRaw.map(serializeForecastLine), shipped);

  const priceMap = new Map<string, { contractPrice: number | null; sgpPrice: number | null }>();
  for (const row of priceRows) {
    priceMap.set(priceKey(row.customerGroup, row.itemSku), {
      contractPrice: row.contractPrice == null ? null : Number(row.contractPrice),
      sgpPrice: row.sgpPrice == null ? null : Number(row.sgpPrice),
    });
  }

  const revenueByKey = new Map(revenueRows.map((row) => [revenueLineKey(row), row]));
  const joinedByKey = new Map<string, JoinedRevenueLine>();

  for (const forecast of forecastRows) {
    const key = revenueLineKey(forecast);
    const revenue = revenueByKey.get(key);
    const group = revenue?.customerGroup || forecast.customerGroup || '';
    const matched = lookupPrice(priceMap, group, forecast.itemSku);
    joinedByKey.set(key, {
      id: revenue?.id || forecast.id,
      customerId: forecast.customerId,
      customerName: forecast.customerName,
      customerGroup: group,
      customerPartNumber: revenue?.customerPartNumber || forecast.customerPartNumber || '',
      itemSku: forecast.itemSku,
      team: revenue?.team || forecast.team || '',
      csr: revenue?.csr || forecast.csr || '',
      productionType: revenue?.productionType || forecast.productionType || '',
      statusFlag: revenue?.statusFlag || forecast.statusFlag || '',
      actualRevenue: normalizeMonthQtyMap(revenue?.actualRevenue),
      sortOrder: revenue?.sortOrder ?? forecast.sortOrder,
      annualBaseQty: forecast.annualBaseQty,
      forecastQty: forecast.forecastQty,
      actualQty: forecast.actualQty,
      adjustedQty: forecast.adjustedQty,
      contractPrice: matched.contractPrice,
      sgpPrice: matched.sgpPrice,
    });
  }

  for (const revenue of revenueRows) {
    const key = revenueLineKey(revenue);
    if (joinedByKey.has(key)) continue;
    const matched = lookupPrice(priceMap, revenue.customerGroup || '', revenue.itemSku);
    joinedByKey.set(key, {
      id: revenue.id,
      customerId: revenue.customerId,
      customerName: revenue.customerName,
      customerGroup: revenue.customerGroup || '',
      customerPartNumber: revenue.customerPartNumber || '',
      itemSku: revenue.itemSku,
      team: revenue.team || '',
      csr: revenue.csr || '',
      productionType: revenue.productionType || '',
      statusFlag: revenue.statusFlag || '',
      actualRevenue: normalizeMonthQtyMap(revenue.actualRevenue),
      sortOrder: revenue.sortOrder,
      annualBaseQty: null,
      forecastQty: emptyMonthQtyMap(),
      actualQty: emptyMonthQtyMap(),
      adjustedQty: emptyMonthQtyMap(),
      contractPrice: matched.contractPrice,
      sgpPrice: matched.sgpPrice,
    });
  }

  const allLines = Array.from(joinedByKey.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.itemSku.localeCompare(b.itemSku);
  });

  const scoped = customerId
    ? allLines.filter((line) => line.customerId === customerId)
    : customerName
      ? allLines.filter((line) => line.customerName === customerName)
      : allLines;

  const customers = Array.from(
    allLines.reduce((acc, line) => {
      const key = `${line.customerId}||${line.customerName}`;
      const prior = acc.get(key);
      acc.set(key, {
        customerId: line.customerId,
        customerName: line.customerName,
        key,
        label: line.customerName || line.customerId || 'Unknown customer',
        lineCount: (prior?.lineCount || 0) + 1,
      });
      return acc;
    }, new Map<string, { customerId: string; customerName: string; key: string; label: string; lineCount: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => a.label.localeCompare(b.label));

  const includeLines = Boolean(customerId || customerName);
  const dataThru = settings?.dataThru
    ? new Date(settings.dataThru).toISOString().slice(0, 10)
    : forecastSettings?.dataThru
      ? forecastSettings.dataThru.toISOString().slice(0, 10)
      : null;
  return {
    year,
    dataThru,
    shippingDays: buildShippingCalendar(year),
    priceCount: priceRows.length,
    customers,
    companyLineCount: allLines.length,
    totals: summarizeRevenueLines(includeLines ? scoped : allLines, dataThru),
    lines: includeLines ? scoped.map((line) => serializeJoinedRevenueLine(line, dataThru)) : [],
  };
}
