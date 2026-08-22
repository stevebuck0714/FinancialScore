import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import {
  normalizeMonthQtyMap,
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
  actualQty: Prisma.JsonValue;
  sortOrder: number;
}) {
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
    forecastQty: normalizeMonthQtyMap(row.forecastQty),
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
    forecastQty: normalizeMonthQtyMap(raw.forecastQty),
    actualQty: normalizeMonthQtyMap(raw.actualQty),
    sortOrder,
  };
}

export async function upsertForecastLines(params: {
  companyId: string;
  year: number;
  dataThru?: Date | null;
  replaceCustomer?: { customerId: string; customerName: string } | null;
  lines: ReturnType<typeof normalizeForecastLineInput>[];
}) {
  const { companyId, year, dataThru, replaceCustomer, lines } = params;
  const now = new Date();

  await prisma.productRevenueForecastSettings.upsert({
    where: { companyId_year: { companyId, year } },
    create: { companyId, year, dataThru: dataThru ?? null, updatedAt: now },
    update: dataThru === undefined ? { updatedAt: now } : { dataThru: dataThru ?? null, updatedAt: now },
  });

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
    unique.set(`${line.customerId}||${line.itemSku}||${line.customerPartNumber}`, line);
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
        line.sortOrder,
        now,
        now
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ProductRevenueForecastLine" (
         "id", "companyId", "year", "customerId", "customerName", "customerGroup", "customerPartNumber",
         "itemSku", "team", "csr", "productionType", "statusFlag", "annualBaseQty", "forecastQty", "actualQty",
         "sortOrder", "createdAt", "updatedAt"
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
         "sortOrder" = EXCLUDED."sortOrder",
         "updatedAt" = EXCLUDED."updatedAt"`,
      ...params
    );
  }
}
