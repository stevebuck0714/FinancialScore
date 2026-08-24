import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import {
  emptyMonthQtyMap,
  forecastActualsExactKey,
  forecastActualsItemKey,
  forecastMonthIsEditable,
  FORECAST_MONTHS,
  monthQty,
  overlayShippedActuals,
  normalizeAdjustedQtyMap,
  normalizeMonthQtyMap,
  type CsiShippedActuals,
  type MonthQtyMap,
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureProductRevenueForecastTables(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductRevenueForecastSettings" (
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "dataThru" TIMESTAMP(3),
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductRevenueForecastSettings_pkey" PRIMARY KEY ("companyId", "year")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductRevenueForecastLine" (
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
          "annualBaseQty" DOUBLE PRECISION,
          "forecastQty" JSONB NOT NULL DEFAULT '{}',
          "adjustedQty" JSONB NOT NULL DEFAULT '{}',
          "actualQty" JSONB NOT NULL DEFAULT '{}',
          "sortOrder" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductRevenueForecastLine_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevenueForecastLine_companyId_year_customerId_itemSku_customerPartNumber_key"
          ON "ProductRevenueForecastLine"("companyId", "year", "customerId", "itemSku", "customerPartNumber")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ProductRevenueForecastLine_companyId_year_customerId_idx"
          ON "ProductRevenueForecastLine"("companyId", "year", "customerId")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ProductRevenueForecastLine_companyId_year_customerName_idx"
          ON "ProductRevenueForecastLine"("companyId", "year", "customerName")
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProductRevenueForecastLine"
        ADD COLUMN IF NOT EXISTS "adjustedQty" JSONB NOT NULL DEFAULT '{}'::jsonb
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

export async function assertProductsForecastAccess(companyId: string): Promise<NextResponse | null> {
  let authContext;
  try {
    authContext = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('OperationalData', companyId, 'READ:products');
    return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
  }

  if (authContext.role !== 'USER') return null;

  const membership = await prisma.userCompanyAccess.findUnique({
    where: {
      userId_companyId: {
        userId: authContext.userId,
        companyId,
      },
    },
    select: {
      companyRole: true,
      sidebarAccess: true,
      operationalDashboardAccess: true,
      user: {
        select: {
          companyRole: true,
          sidebarAccess: true,
          operationalDashboardAccess: true,
        },
      },
    },
  });
  const legacyUser = membership
    ? null
    : await prisma.user.findUnique({
        where: { id: authContext.userId },
        select: {
          companyRole: true,
          sidebarAccess: true,
          operationalDashboardAccess: true,
        },
      });
  const companyRole = String(
    membership?.companyRole || membership?.user?.companyRole || legacyUser?.companyRole || ''
  ).toLowerCase();
  const sidebarAccess =
    membership?.sidebarAccess ?? membership?.user?.sidebarAccess ?? legacyUser?.sidebarAccess;
  const canAccessOperationalDashboard =
    companyRole === 'admin' ||
    !Array.isArray(sidebarAccess) ||
    sidebarAccess.includes('operational-dashboard');
  const operationalDashboardAccess =
    membership?.operationalDashboardAccess ??
    membership?.user?.operationalDashboardAccess ??
    legacyUser?.operationalDashboardAccess;

  if (!canAccessOperationalDashboard || !isOperationalDataTypeAllowed(operationalDashboardAccess, 'products')) {
    await auditForbiddenAccess('OperationalData', companyId, 'WRITE:products');
    return NextResponse.json(
      { error: 'Forbidden: Operational Dashboard page access denied' },
      { status: 403 }
    );
  }

  return null;
}

export function asForecastYear(value: unknown, fallback = new Date().getUTCFullYear()): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return fallback;
  return parsed;
}

export function asOptionalIsoDay(value: unknown): Date | null {
  const text = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newForecastId(): string {
  return `prf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

function mergeLockedMonthQty(incoming: MonthQtyMap, existing: unknown, year: number): MonthQtyMap {
  const prior = normalizeMonthQtyMap(existing);
  const next = emptyMonthQtyMap();
  for (const month of FORECAST_MONTHS) {
    next[String(month)] = forecastMonthIsEditable(year, month)
      ? monthQty(incoming, month)
      : monthQty(prior, month);
  }
  return next;
}

export function serializeForecastLine(row: {
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
  annualBaseQty: number | null;
  forecastQty: Prisma.JsonValue;
  adjustedQty?: Prisma.JsonValue | null;
  actualQty: Prisma.JsonValue;
  sortOrder: number;
}) {
  const forecastQty = normalizeMonthQtyMap(row.forecastQty);
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    customerGroup: row.customerGroup || '',
    customerPartNumber: row.customerPartNumber || '',
    itemSku: row.itemSku,
    team: row.team || '',
    csr: row.csr || '',
    productionType: row.productionType || '',
    statusFlag: row.statusFlag || '',
    annualBaseQty: row.annualBaseQty,
    forecastQty,
    adjustedQty: normalizeAdjustedQtyMap(row.adjustedQty, forecastQty),
    actualQty: normalizeMonthQtyMap(row.actualQty),
    sortOrder: row.sortOrder,
  };
}

export function normalizeForecastLineInput(
  raw: Partial<ProductRevenueForecastLineInput> & { id?: string },
  fallbackCustomer: { customerId: string; customerName: string },
  sortOrder: number
) {
  const itemSku = asText(raw.itemSku);
  const customerId = asText(raw.customerId) || fallbackCustomer.customerId;
  const customerName = asText(raw.customerName) || fallbackCustomer.customerName;
  const forecastQty = normalizeMonthQtyMap(raw.forecastQty);
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
    annualBaseQty: asNullableNumber(raw.annualBaseQty),
    forecastQty,
    adjustedQty: normalizeAdjustedQtyMap(raw.adjustedQty, forecastQty),
    actualQty: normalizeMonthQtyMap(raw.actualQty),
    sortOrder,
  };
}

export async function upsertForecastLines(params: {
  companyId: string;
  year: number;
  dataThru?: Date | null;
  replaceCustomer?: { customerId: string; customerName: string } | null;
  preserveLockedMonthQtys?: boolean;
  lines: ReturnType<typeof normalizeForecastLineInput>[];
}) {
  const { companyId, year, dataThru, replaceCustomer, preserveLockedMonthQtys, lines } = params;
  const now = new Date();

  await prisma.productRevenueForecastSettings.upsert({
    where: { companyId_year: { companyId, year } },
    create: { companyId, year, dataThru: dataThru ?? null, updatedAt: now },
    update: dataThru === undefined ? { updatedAt: now } : { dataThru: dataThru ?? null, updatedAt: now },
  });

  const existingByKey = new Map<string, { forecastQty: Prisma.JsonValue; adjustedQty: Prisma.JsonValue | null }>();
  if (preserveLockedMonthQtys && replaceCustomer) {
    const existingRows = await prisma.$queryRaw<Array<{
      customerId: string;
      itemSku: string;
      customerPartNumber: string;
      forecastQty: Prisma.JsonValue;
      adjustedQty: Prisma.JsonValue | null;
    }>>`
      SELECT "customerId", "itemSku", "customerPartNumber", "forecastQty", "adjustedQty"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId}
        AND "year" = ${year}
        AND ${
          replaceCustomer.customerId
            ? Prisma.sql`"customerId" = ${replaceCustomer.customerId}`
            : Prisma.sql`"customerName" = ${replaceCustomer.customerName}`
        }
    `;
    for (const row of existingRows) {
      existingByKey.set(
        `${row.customerId}||${row.itemSku}||${row.customerPartNumber}`,
        { forecastQty: row.forecastQty, adjustedQty: row.adjustedQty }
      );
    }
  }

  if (replaceCustomer) {
    const keepIds = lines.map((line) => line.id).filter((id) => id && !id.startsWith('tmp-'));
    await prisma.productRevenueForecastLine.deleteMany({
      where: {
        companyId,
        year,
        ...(replaceCustomer.customerId
          ? { customerId: replaceCustomer.customerId }
          : { customerName: replaceCustomer.customerName }),
        ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
      },
    });
  }

  const unique = new Map<string, (typeof lines)[number]>();
  for (const line of lines) {
    if (!line.itemSku) continue;
    const key = `${line.customerId}||${line.itemSku}||${line.customerPartNumber}`;
    const existing = existingByKey.get(key);
    unique.set(
      key,
      existing && preserveLockedMonthQtys
        ? {
            ...line,
            forecastQty: mergeLockedMonthQty(line.forecastQty, existing.forecastQty, year),
            adjustedQty: mergeLockedMonthQty(line.adjustedQty, existing.adjustedQty, year),
          }
        : line
    );
  }
  const rows = Array.from(unique.values());
  const columns = [
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    { jsonb: true },
    { jsonb: true },
    { jsonb: true },
    {},
    {},
    {},
  ];

  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset, offset + 80);
    const params: unknown[] = [];
    for (const line of chunk) {
      params.push(
        line.id && !line.id.startsWith('tmp-') ? line.id : newForecastId(),
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
        line.annualBaseQty,
        JSON.stringify(line.forecastQty),
        JSON.stringify(line.actualQty),
        JSON.stringify(line.adjustedQty),
        line.sortOrder,
        now,
        now
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ProductRevenueForecastLine" (
         "id", "companyId", "year", "customerId", "customerName", "customerGroup", "customerPartNumber",
         "itemSku", "team", "csr", "productionType", "statusFlag", "annualBaseQty", "forecastQty", "actualQty",
         "adjustedQty", "sortOrder", "createdAt", "updatedAt"
       ) VALUES ${sqlValues(chunk.length, columns)}
       ON CONFLICT ("companyId", "year", "customerId", "itemSku", "customerPartNumber") DO UPDATE SET
         "customerName" = EXCLUDED."customerName",
         "customerGroup" = EXCLUDED."customerGroup",
         "team" = EXCLUDED."team",
         "csr" = EXCLUDED."csr",
         "productionType" = EXCLUDED."productionType",
         "statusFlag" = EXCLUDED."statusFlag",
         "annualBaseQty" = EXCLUDED."annualBaseQty",
         "forecastQty" = EXCLUDED."forecastQty",
         "actualQty" = EXCLUDED."actualQty",
         "adjustedQty" = EXCLUDED."adjustedQty",
         "sortOrder" = EXCLUDED."sortOrder",
         "updatedAt" = EXCLUDED."updatedAt"`,
      ...params
    );
  }
}

export async function loadProductForecastLines(params: {
  companyId: string;
  year: number;
  customerId?: string;
  customerName?: string;
}) {
  const { companyId, year, customerId, customerName } = params;
  const customerFilter = customerId
    ? Prisma.sql`"customerId" = ${customerId}`
    : customerName
      ? Prisma.sql`"customerName" = ${customerName}`
      : Prisma.sql`TRUE`;
  return prisma.$queryRaw<Array<{
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
    annualBaseQty: number | null;
    forecastQty: Prisma.JsonValue;
    adjustedQty: Prisma.JsonValue | null;
    actualQty: Prisma.JsonValue;
    sortOrder: number;
  }>>`
    SELECT "id", "customerId", "customerName", "customerGroup", "customerPartNumber",
           "itemSku", "team", "csr", "productionType", "statusFlag", "annualBaseQty",
           "forecastQty", "adjustedQty", "actualQty", "sortOrder"
    FROM "ProductRevenueForecastLine"
    WHERE "companyId" = ${companyId}
      AND "year" = ${year}
      AND ${customerFilter}
    ORDER BY "sortOrder" ASC, "itemSku" ASC
  `;
}

function snapshotCustomerMatchSql(customerId: string, customerName: string): Prisma.Sql {
  const id = customerId.trim();
  const name = customerName.trim();
  const idMatch = id
    ? Prisma.sql`NULLIF(TRIM(COALESCE(s."customerId", '')), '') = ${id}`
    : null;
  const nameMatch = name ? Prisma.sql`s."customerName" = ${name}` : null;
  if (idMatch && nameMatch) return Prisma.sql`(${idMatch} OR ${nameMatch})`;
  if (idMatch) return idMatch;
  if (nameMatch) return nameMatch;
  return Prisma.sql`TRUE`;
}

function addShippedQty(map: Map<string, MonthQtyMap>, key: string, month: number, qty: number) {
  if (!key || month < 1 || month > 12 || !Number.isFinite(qty) || qty === 0) return;
  const current = map.get(key) || emptyMonthQtyMap();
  current[String(month)] = (Number(current[String(month)]) || 0) + qty;
  map.set(key, current);
}

async function queryCsiShippedDeltas(params: {
  companyId: string;
  year: number;
  customerId?: string;
  customerName?: string;
  qtySql: Prisma.Sql;
}): Promise<Array<{
  customerId: string | null;
  itemSku: string | null;
  customerPn: string | null;
  month: number | null;
  qty: number | null;
  asOf: Date | null;
}>> {
  const lookbackStart = new Date(Date.UTC(params.year - 1, 11, 1));
  const yearStart = new Date(Date.UTC(params.year, 0, 1));
  const nextYear = new Date(Date.UTC(params.year + 1, 0, 1));
  const customerMatch = snapshotCustomerMatchSql(params.customerId || '', params.customerName || '');
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('statement_timeout', '20000', true)`;
      return tx.$queryRaw<Array<{
        customerId: string | null;
        itemSku: string | null;
        customerPn: string | null;
        month: number | null;
        qty: number | null;
        asOf: Date | null;
      }>>(Prisma.sql`
        WITH month_end AS (
          SELECT DISTINCT ON (s."orderId", s."lineId", date_trunc('month', s."snapshotDate"))
            s."orderId",
            s."lineId",
            NULLIF(TRIM(COALESCE(s."customerId", '')), '') AS "customerId",
            NULLIF(TRIM(COALESCE(s."sku", s."itemId", '')), '') AS "itemSku",
            NULLIF(TRIM(COALESCE(s."customerPn", '')), '') AS "customerPn",
            date_trunc('month', s."snapshotDate") AS month_start,
            ${params.qtySql} AS qty,
            s."snapshotDate" AS as_of
          FROM "CustomerOrderLineSnapshot" s
          WHERE s."companyId" = ${params.companyId}
            AND s."frequency" = 'daily'
            AND s."snapshotDate" >= ${lookbackStart}
            AND s."snapshotDate" < ${nextYear}
            AND ${customerMatch}
          ORDER BY s."orderId", s."lineId", date_trunc('month', s."snapshotDate"), s."snapshotDate" DESC
        ),
        deltas AS (
          SELECT
            "customerId",
            "itemSku",
            "customerPn",
            month_start,
            EXTRACT(MONTH FROM month_start)::int AS month,
            GREATEST(qty - LAG(qty, 1, qty) OVER (PARTITION BY "orderId", "lineId" ORDER BY month_start), 0) AS delta,
            as_of
          FROM month_end
        )
        SELECT
          "customerId",
          "itemSku",
          "customerPn",
          month,
          SUM(delta)::double precision AS qty,
          MAX(as_of) AS "asOf"
        FROM deltas
        WHERE month_start >= ${yearStart}
          AND month_start < ${nextYear}
          AND month BETWEEN 1 AND 12
        GROUP BY 1, 2, 3, 4
      `);
    },
    { maxWait: 5000, timeout: 25000 }
  );
}

export async function loadCsiMonthlyShippedActuals(params: {
  companyId: string;
  year: number;
  customerId?: string;
  customerName?: string;
}): Promise<CsiShippedActuals> {
  const queries = [
    Prisma.sql`COALESCE(s."qtyShipped", 0)`,
    Prisma.sql`COALESCE(s."qtyInvoiced", 0)`,
  ];
  for (const qtySql of queries) {
    try {
      const rows = await queryCsiShippedDeltas({ ...params, qtySql });
      const byExact = new Map<string, MonthQtyMap>();
      const byItem = new Map<string, MonthQtyMap>();
      let asOf: string | null = null;
      for (const row of rows) {
        const month = Number(row.month || 0);
        const qty = Number(row.qty || 0);
        const customerId = String(row.customerId || '');
        const itemSku = String(row.itemSku || '');
        const customerPn = String(row.customerPn || '');
        addShippedQty(byExact, forecastActualsExactKey(customerId, itemSku, customerPn), month, qty);
        addShippedQty(byItem, forecastActualsItemKey(customerId, itemSku), month, qty);
        if (row.asOf) {
          const iso = new Date(row.asOf).toISOString().slice(0, 10);
          if (!asOf || iso > asOf) asOf = iso;
        }
      }
      return { ok: true, asOf, byExact, byItem };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/qtyShipped/i.test(message)) continue;
      console.error('[product-forecast] CSI shipped actuals failed', error);
      return { ok: false, asOf: null, byExact: new Map(), byItem: new Map() };
    }
  }
  return { ok: false, asOf: null, byExact: new Map(), byItem: new Map() };
}

export function withCsiShippedActuals<T extends {
  customerId: string;
  itemSku: string;
  customerPartNumber: string;
  actualQty: MonthQtyMap;
}>(lines: T[], actuals: CsiShippedActuals): T[] {
  return overlayShippedActuals(lines, actuals);
}
