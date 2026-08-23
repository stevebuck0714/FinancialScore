import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalModuleAllowed } from '@/lib/operations/operational-dashboard-access';
import { normalizeMonthQtyMap, type MonthQtyMap } from '@/lib/operations/product-revenue-forecast';
import { formatEstDate } from '@/lib/time/eastern';
import {
  UNASSIGNED_VENDOR_ID,
  UNASSIGNED_VENDOR_NAME,
  forecastActualsKey,
  isSgpAsOfDate,
  type VendorMonthlyForecastLineInput,
} from '@/lib/operations/vendor-monthly-forecast';

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureVendorMonthlyForecastTables(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "VendorMonthlyForecastSettings" (
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "dataThru" TIMESTAMP(3),
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "VendorMonthlyForecastSettings_pkey" PRIMARY KEY ("companyId", "year")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "VendorMonthlyForecastLine" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "vendorId" TEXT NOT NULL DEFAULT '',
          "vendorName" TEXT NOT NULL DEFAULT '',
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
          "actualQty" JSONB NOT NULL DEFAULT '{}',
          "sortOrder" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "VendorMonthlyForecastLine_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "VendorMonthlyForecastLine_vendor_item_key"
          ON "VendorMonthlyForecastLine"("companyId", "year", "vendorId", "customerId", "itemSku", "customerPartNumber")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "VendorMonthlyForecastLine_companyId_year_vendorId_idx"
          ON "VendorMonthlyForecastLine"("companyId", "year", "vendorId")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "VendorMonthlyForecastLine_companyId_year_vendorName_idx"
          ON "VendorMonthlyForecastLine"("companyId", "year", "vendorName")
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

export async function assertVendorsForecastAccess(companyId: string): Promise<NextResponse | null> {
  let authContext;
  try {
    authContext = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('OperationalData', companyId, 'READ:vendors');
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

  if (!canAccessOperationalDashboard || !isOperationalModuleAllowed(operationalDashboardAccess, 'vendors')) {
    await auditForbiddenAccess('OperationalData', companyId, 'WRITE:vendors');
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

function toIsoDay(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function resolveVendorDataThru(
  stored: Date | string | null | undefined,
  operationsDataThru: string | null
): string | null {
  if (operationsDataThru && !isSgpAsOfDate(operationsDataThru)) return operationsDataThru;
  const storedIso = toIsoDay(stored);
  if (storedIso && !isSgpAsOfDate(storedIso)) return storedIso;
  if (operationsDataThru) return operationsDataThru;
  return formatEstDate();
}

export async function loadOperationsForecastYtd(companyId: string, year: number): Promise<{
  dataThru: string | null;
  actuals: Map<string, MonthQtyMap>;
}> {
  const actuals = new Map<string, MonthQtyMap>();
  try {
    const settings = await prisma.$queryRawUnsafe<Array<{ dataThru: Date | null }>>(
      `SELECT "dataThru" FROM "ProductRevenueForecastSettings" WHERE "companyId" = $1 AND "year" = $2 LIMIT 1`,
      companyId,
      year
    );
    const rows = await prisma.$queryRawUnsafe<Array<{
      customerId: string;
      itemSku: string;
      customerPartNumber: string;
      actualQty: Prisma.JsonValue;
    }>>(
      `SELECT "customerId", "itemSku", "customerPartNumber", "actualQty"
         FROM "ProductRevenueForecastLine"
        WHERE "companyId" = $1 AND "year" = $2`,
      companyId,
      year
    );
    for (const row of rows) {
      actuals.set(
        forecastActualsKey(row.customerId, row.itemSku, row.customerPartNumber),
        normalizeMonthQtyMap(row.actualQty)
      );
    }
    return { dataThru: toIsoDay(settings[0]?.dataThru), actuals };
  } catch {
    return { dataThru: null, actuals };
  }
}

export function overlayVendorForecastActuals<T extends { customerId: string; itemSku: string; customerPartNumber: string; actualQty: MonthQtyMap }>(
  line: T,
  actuals: Map<string, MonthQtyMap>
): T {
  const match = actuals.get(forecastActualsKey(line.customerId, line.itemSku, line.customerPartNumber));
  return match ? { ...line, actualQty: match } : line;
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
  return `vmf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

export async function loadPrimaryVendorByItem(companyId: string): Promise<Map<string, { vendorId: string; vendorName: string }>> {
  const rawDelegate = (prisma as any).inforRawRecord;
  const result = new Map<string, { vendorId: string; vendorName: string }>();
  if (!rawDelegate?.findMany) return result;

  const latest = await rawDelegate.findFirst({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      miProgram: 'SLItemVends',
    },
    select: { businessDate: true },
    orderBy: [{ businessDate: 'desc' }, { fetchedAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (!latest?.businessDate) return result;

  const rows = await rawDelegate.findMany({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      miProgram: 'SLItemVends',
      businessDate: latest.businessDate,
    },
    select: { payload: true },
    take: 50000,
  });

  type RankedVendor = { vendorId: string; vendorName: string; rank: number };
  const ranked = new Map<string, RankedVendor>();
  for (const row of rows as Array<{ payload?: Record<string, unknown> }>) {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : null;
    if (!payload) continue;
    const item = String(payload.Item ?? payload._ItemId ?? '').trim().toUpperCase();
    const vendorId = String(payload.VendNum ?? '').trim();
    const vendorName = String(payload.VendaddrName ?? payload.VendAddrName ?? '').trim();
    const rank = Number(payload.Rank);
    if (!item || !vendorId) continue;
    const nextRank = Number.isFinite(rank) ? rank : 99;
    const prior = ranked.get(item);
    if (!prior || nextRank < prior.rank) {
      ranked.set(item, { vendorId, vendorName: vendorName || vendorId, rank: nextRank });
    }
  }
  for (const [item, vendor] of ranked) {
    result.set(item, { vendorId: vendor.vendorId, vendorName: vendor.vendorName });
  }
  return result;
}

export function serializeVendorForecastLine(row: {
  id: string;
  vendorId: string;
  vendorName: string;
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
  actualQty: Prisma.JsonValue;
  sortOrder: number;
}) {
  return {
    id: row.id,
    vendorId: row.vendorId || UNASSIGNED_VENDOR_ID,
    vendorName: row.vendorName || UNASSIGNED_VENDOR_NAME,
    customerId: row.customerId,
    customerName: row.customerName,
    customerGroup: row.customerGroup || '',
    customerPartNumber: row.customerPartNumber || '',
    itemSku: row.itemSku,
    team: row.team || '',
    csr: row.csr || '',
    productionType: row.productionType || '',
    statusFlag: row.statusFlag || '',
    annualBaseQty: row.annualBaseQty == null ? null : Number(row.annualBaseQty),
    forecastQty: normalizeMonthQtyMap(row.forecastQty),
    actualQty: normalizeMonthQtyMap(row.actualQty),
    sortOrder: row.sortOrder,
  };
}

export function normalizeVendorForecastLineInput(
  raw: Partial<VendorMonthlyForecastLineInput> & { id?: string },
  fallbackVendor: { vendorId: string; vendorName: string },
  sortOrder: number
) {
  const itemSku = asText(raw.itemSku);
  const vendorId = asText(raw.vendorId) || fallbackVendor.vendorId || UNASSIGNED_VENDOR_ID;
  const vendorName = asText(raw.vendorName) || fallbackVendor.vendorName || UNASSIGNED_VENDOR_NAME;
  return {
    id: asText(raw.id),
    vendorId,
    vendorName,
    customerId: asText(raw.customerId) || asText(raw.customerName),
    customerName: asText(raw.customerName),
    customerGroup: asText(raw.customerGroup) || null,
    customerPartNumber: asText(raw.customerPartNumber),
    itemSku,
    team: asText(raw.team) || null,
    csr: asText(raw.csr) || null,
    productionType: asText(raw.productionType) || null,
    statusFlag: asText(raw.statusFlag) || null,
    annualBaseQty: asNullableNumber(raw.annualBaseQty),
    forecastQty: normalizeMonthQtyMap(raw.forecastQty),
    actualQty: normalizeMonthQtyMap(raw.actualQty),
    sortOrder,
  };
}

type VendorForecastLineRow = {
  id: string;
  vendorId: string;
  vendorName: string;
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
  actualQty: Prisma.JsonValue;
  sortOrder: number;
};

export async function loadVendorForecastSettings(companyId: string, year: number): Promise<{ dataThru: Date | null } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ dataThru: Date | null }>>(
    `SELECT "dataThru" FROM "VendorMonthlyForecastSettings" WHERE "companyId" = $1 AND "year" = $2 LIMIT 1`,
    companyId,
    year
  );
  return rows[0] || null;
}

export async function loadVendorForecastVendors(companyId: string, year: number) {
  return prisma.$queryRawUnsafe<Array<{ vendorId: string; vendorName: string; lineCount: number }>>(
    `SELECT "vendorId", "vendorName", COUNT(*)::int AS "lineCount"
       FROM "VendorMonthlyForecastLine"
      WHERE "companyId" = $1 AND "year" = $2
      GROUP BY "vendorId", "vendorName"
      ORDER BY "vendorName" ASC`,
    companyId,
    year
  );
}

export async function loadVendorForecastLines(params: {
  companyId: string;
  year: number;
  vendorId?: string;
  vendorName?: string;
}): Promise<VendorForecastLineRow[]> {
  const { companyId, year, vendorId, vendorName } = params;
  if (vendorId) {
    return prisma.$queryRawUnsafe<VendorForecastLineRow[]>(
      `SELECT "id", "vendorId", "vendorName", "customerId", "customerName", "customerGroup", "customerPartNumber",
              "itemSku", "team", "csr", "productionType", "statusFlag", "annualBaseQty", "forecastQty", "actualQty", "sortOrder"
         FROM "VendorMonthlyForecastLine"
        WHERE "companyId" = $1 AND "year" = $2 AND "vendorId" = $3
        ORDER BY "sortOrder" ASC, "itemSku" ASC`,
      companyId,
      year,
      vendorId
    );
  }
  return prisma.$queryRawUnsafe<VendorForecastLineRow[]>(
    `SELECT "id", "vendorId", "vendorName", "customerId", "customerName", "customerGroup", "customerPartNumber",
            "itemSku", "team", "csr", "productionType", "statusFlag", "annualBaseQty", "forecastQty", "actualQty", "sortOrder"
       FROM "VendorMonthlyForecastLine"
      WHERE "companyId" = $1 AND "year" = $2 AND "vendorName" = $3
      ORDER BY "sortOrder" ASC, "itemSku" ASC`,
    companyId,
    year,
    vendorName || UNASSIGNED_VENDOR_NAME
  );
}

export async function upsertVendorForecastLines(params: {
  companyId: string;
  year: number;
  dataThru?: Date | null;
  replaceVendor?: { vendorId: string; vendorName: string } | null;
  lines: ReturnType<typeof normalizeVendorForecastLineInput>[];
}) {
  const { companyId, year, dataThru, replaceVendor, lines } = params;
  const now = new Date();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "VendorMonthlyForecastSettings" ("companyId", "year", "dataThru", "updatedAt")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("companyId", "year") DO UPDATE SET
       "dataThru" = CASE WHEN $5::boolean THEN EXCLUDED."dataThru" ELSE "VendorMonthlyForecastSettings"."dataThru" END,
       "updatedAt" = EXCLUDED."updatedAt"`,
    companyId,
    year,
    dataThru ?? null,
    now,
    dataThru !== undefined
  );

  if (replaceVendor) {
    const keepIds = lines.map((line) => line.id).filter((id) => id && !id.startsWith('tmp-'));
    if (keepIds.length) {
      const idPlaceholders = keepIds.map((_, index) => `$${index + 4}`).join(', ');
      await prisma.$executeRawUnsafe(
        `DELETE FROM "VendorMonthlyForecastLine"
          WHERE "companyId" = $1 AND "year" = $2
            AND ${replaceVendor.vendorId ? `"vendorId" = $3` : `"vendorName" = $3`}
            AND "id" NOT IN (${idPlaceholders})`,
        companyId,
        year,
        replaceVendor.vendorId || replaceVendor.vendorName,
        ...keepIds
      );
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "VendorMonthlyForecastLine"
          WHERE "companyId" = $1 AND "year" = $2
            AND ${replaceVendor.vendorId ? `"vendorId" = $3` : `"vendorName" = $3`}`,
        companyId,
        year,
        replaceVendor.vendorId || replaceVendor.vendorName
      );
    }
  }

  const unique = new Map<string, (typeof lines)[number]>();
  for (const line of lines) {
    if (!line.itemSku) continue;
    unique.set(`${line.vendorId}||${line.customerId}||${line.itemSku}||${line.customerPartNumber}`, line);
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
    {},
    {},
    { jsonb: true },
    { jsonb: true },
    {},
    {},
    {},
  ];

  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset, offset + 80);
    const paramsList: unknown[] = [];
    for (const line of chunk) {
      paramsList.push(
        line.id && !line.id.startsWith('tmp-') ? line.id : newForecastId(),
        companyId,
        year,
        line.vendorId,
        line.vendorName,
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
        line.sortOrder,
        now,
        now
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VendorMonthlyForecastLine" (
         "id", "companyId", "year", "vendorId", "vendorName", "customerId", "customerName", "customerGroup",
         "customerPartNumber", "itemSku", "team", "csr", "productionType", "statusFlag", "annualBaseQty",
         "forecastQty", "actualQty", "sortOrder", "createdAt", "updatedAt"
       ) VALUES ${sqlValues(chunk.length, columns)}
       ON CONFLICT ("companyId", "year", "vendorId", "customerId", "itemSku", "customerPartNumber") DO UPDATE SET
         "vendorName" = EXCLUDED."vendorName",
         "customerName" = EXCLUDED."customerName",
         "customerGroup" = EXCLUDED."customerGroup",
         "team" = EXCLUDED."team",
         "csr" = EXCLUDED."csr",
         "productionType" = EXCLUDED."productionType",
         "statusFlag" = EXCLUDED."statusFlag",
         "annualBaseQty" = EXCLUDED."annualBaseQty",
         "forecastQty" = EXCLUDED."forecastQty",
         "actualQty" = EXCLUDED."actualQty",
         "sortOrder" = EXCLUDED."sortOrder",
         "updatedAt" = EXCLUDED."updatedAt"`,
      ...paramsList
    );
  }
}
