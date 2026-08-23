import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import { ensureCustomerOrderLineFilledTables, ensureFilledHistory } from '@/lib/operations/product-order-filled';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RECENT_MONTHS = 12;
const OLDER_MONTHS = 24;
const MAX_UNIQUE_LINES = 8000;
const MAX_CUSTOMERS = 2000;
const HISTORY_FLOOR = '2018-01-01';

type ProductRawCustomer = {
  customerId: string;
  customerName: string;
};

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcMonths(value: Date, months: number): Date {
  const next = utcDay(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseIsoDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function yesterdayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

function historyFloorUtc(): Date {
  return new Date(`${HISTORY_FLOOR}T00:00:00.000Z`);
}

function maxUtcDay(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? utcDay(left) : utcDay(right);
}

function olderWindowBefore(before: Date): { startDate: Date; endDate: Date } | null {
  const floor = historyFloorUtc();
  const beforeDay = utcDay(before);
  if (beforeDay.getTime() <= floor.getTime()) return null;
  const endDate = utcDay(beforeDay);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = maxUtcDay(addUtcMonths(beforeDay, -OLDER_MONTHS), floor);
  if (endDate.getTime() < startDate.getTime()) return null;
  return { startDate, endDate };
}

function customerMatchSql(customerId: string, customerName: string, alias?: string): Prisma.Sql {
  const customerIdCol = alias ? Prisma.raw(`"${alias}"."customerId"`) : Prisma.raw('"customerId"');
  const customerNameCol = alias ? Prisma.raw(`"${alias}"."customerName"`) : Prisma.raw('"customerName"');
  if (customerId) {
    return Prisma.sql`NULLIF(TRIM(COALESCE(${customerIdCol}, '')), '') = ${customerId}`;
  }
  return Prisma.sql`${customerNameCol} = ${customerName}`;
}

function mapOrderLineRecord(row: any, status: 'open' | 'filled') {
  return {
    source: 'customer-order-line',
    status,
    snapshotDate: row.snapshotDate || row.filledAsOf || null,
    filledAsOf: row.filledAsOf || null,
    date: row.orderDate || row.snapshotDate || row.filledAsOf || null,
    orderDate: row.orderDate || null,
    customerId: row.customerId || null,
    customerName: row.customerName || null,
    customer: row.customerName || null,
    orderId: row.orderId || null,
    lineId: row.lineId || null,
    itemId: row.itemId || row.sku || row.itemName || null,
    sku: row.sku || row.itemId || row.itemName || null,
    itemName: row.itemName || row.itemId || row.sku || null,
    quantitySold: Number(row.qtyInvoiced || row.qtyOrdered || 0),
    qtyOrdered: Number(row.qtyOrdered || 0),
    qtyInvoiced: Number(row.qtyInvoiced || 0),
    unitPrice: Number(row.unitPrice || 0),
    revenue: Number(row.invoicedAmount || row.contractValue || 0),
    contractValue: Number(row.contractValue || 0),
    invoicedAmount: Number(row.invoicedAmount || 0),
    remainingAmount: Number(row.remainingAmount || 0),
    sourceTransaction: row.sourceTransaction || null,
    transaction: row.sourceTransaction || null,
  };
}

async function assertProductsAccess(companyId: string): Promise<NextResponse | null> {
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
    await auditForbiddenAccess('OperationalData', companyId, 'READ:products');
    return NextResponse.json(
      { error: 'Forbidden: Operational Dashboard page access denied' },
      { status: 403 }
    );
  }

  return null;
}

async function latestOpenSnapshotDate(companyId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ snapshotDate: Date }>>(Prisma.sql`
    SELECT MAX("snapshotDate") AS "snapshotDate"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
  `);
  return rows[0]?.snapshotDate ? utcDay(rows[0].snapshotDate) : null;
}

async function loadOpenLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  latestDate: Date | null;
}) {
  if (!params.latestDate) return [];
  const matchSql = customerMatchSql(params.customerId, params.customerName);
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT DISTINCT ON ("orderId", "lineId")
      "snapshotDate",
      "customerId",
      "customerName",
      "orderId",
      "lineId",
      "orderDate",
      "itemId",
      "itemName",
      "sku",
      "qtyOrdered",
      "qtyInvoiced",
      "unitPrice",
      "contractValue",
      "invoicedAmount",
      "remainingAmount",
      "sourceTransaction"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${params.companyId}
      AND "frequency" = 'daily'
      AND "snapshotDate" = ${params.latestDate}
      AND ${matchSql}
    ORDER BY "orderId", "lineId", "snapshotDate" DESC
  `);
}

async function loadFilledLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  latestDate: Date | null;
  startDate: Date;
  endDate: Date;
}) {
  const matchSql = customerMatchSql(params.customerId, params.customerName, 'f');
  const openExclude = params.latestDate
    ? Prisma.sql`
        AND NOT EXISTS (
          SELECT 1
          FROM "CustomerOrderLineSnapshot" s
          WHERE s."companyId" = ${params.companyId}
            AND s."frequency" = 'daily'
            AND s."snapshotDate" = ${params.latestDate}
            AND s."orderId" = f."orderId"
            AND s."lineId" = f."lineId"
            AND s."customerName" = f."customerName"
        )
      `
    : Prisma.empty;
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT *
    FROM (
      SELECT
        f."filledAsOf",
        f."customerId",
        f."customerName",
        f."orderId",
        f."lineId",
        f."orderDate",
        f."itemId",
        f."itemName",
        f."sku",
        f."qtyOrdered",
        f."qtyInvoiced",
        f."unitPrice",
        f."contractValue",
        f."invoicedAmount",
        f."remainingAmount",
        f."sourceTransaction"
      FROM "CustomerOrderLineFilled" f
      WHERE f."companyId" = ${params.companyId}
        AND ${matchSql}
        AND (
          (f."orderDate" IS NOT NULL AND f."orderDate" >= ${params.startDate} AND f."orderDate" <= ${params.endDate})
          OR (f."orderDate" IS NULL AND f."filledAsOf" >= ${params.startDate} AND f."filledAsOf" <= ${params.endDate})
        )
        ${openExclude}
      ORDER BY COALESCE(f."orderDate", f."filledAsOf") DESC, f."orderId" DESC, f."lineId" DESC
      LIMIT ${MAX_UNIQUE_LINES + 1}
    ) filled_lines
  `);
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsAccess(companyId);
    if (denied) return denied;

    await ensureCustomerOrderLineFilledTables();

    const view = String(request.nextUrl.searchParams.get('view') || 'lines').trim().toLowerCase();
    if (view === 'customers') {
      const customers = await prisma.$queryRaw<ProductRawCustomer[]>(Prisma.sql`
        SELECT
          NULLIF(TRIM(COALESCE("customerId", '')), '') AS "customerId",
          MAX("customerName") AS "customerName"
        FROM (
          SELECT "customerId", "customerName"
          FROM "CustomerOrderLineSnapshot"
          WHERE "companyId" = ${companyId}
            AND "frequency" = 'daily'
            AND TRIM(COALESCE("customerName", '')) <> ''
          UNION ALL
          SELECT "customerId", "customerName"
          FROM "CustomerOrderLineFilled"
          WHERE "companyId" = ${companyId}
            AND TRIM(COALESCE("customerName", '')) <> ''
        ) customers
        GROUP BY 1
        ORDER BY MAX("customerName") ASC
        LIMIT ${MAX_CUSTOMERS}
      `);

      return NextResponse.json({
        customers: customers.map((row) => {
          const customerId = String(row.customerId || '').trim();
          const customerName = String(row.customerName || '').trim();
          return {
            customerId,
            customerName,
            key: `${customerId}||${customerName}`,
            label: customerName || customerId || 'Unknown customer',
          };
        }),
      });
    }

    const customerId = String(request.nextUrl.searchParams.get('customerId') || '').trim();
    const customerName = String(request.nextUrl.searchParams.get('customerName') || '').trim();
    if (!customerId && !customerName) {
      return NextResponse.json({ error: 'Select a customer before loading raw order lines.' }, { status: 400 });
    }

    await ensureFilledHistory(companyId);

    const windowKind = String(request.nextUrl.searchParams.get('window') || 'recent').trim().toLowerCase();
    const beforeParam = String(request.nextUrl.searchParams.get('before') || '').trim();
    const recentEnd = yesterdayUtc();
    const recentStart = addUtcMonths(recentEnd, -RECENT_MONTHS);
    let startDate = recentStart;
    let endDate = recentEnd;
    let kind: 'recent' | 'older' = 'recent';

    if (windowKind === 'older') {
      const before = parseIsoDay(beforeParam) || recentStart;
      const olderWindow = olderWindowBefore(before);
      if (!olderWindow) {
        return NextResponse.json({
          openRecords: [],
          filledRecords: [],
          window: { kind: 'older', startDate: HISTORY_FLOOR, endDate: isoDay(before) },
          nextOlderWindow: null,
          historyFloor: HISTORY_FLOOR,
          truncated: false,
          hasMoreOlder: false,
        });
      }
      startDate = olderWindow.startDate;
      endDate = olderWindow.endDate;
      kind = 'older';
    }

    const nextOlderWindow = olderWindowBefore(startDate);
    const latestDate = await latestOpenSnapshotDate(companyId);
    const filledRows = await loadFilledLines({
      companyId,
      customerId,
      customerName,
      latestDate,
      startDate,
      endDate,
    });
    const truncated = filledRows.length > MAX_UNIQUE_LINES;
    const limitedFilled = truncated ? filledRows.slice(0, MAX_UNIQUE_LINES) : filledRows;

    const filledPayload = {
      filledRecords: limitedFilled.map((row) => mapOrderLineRecord(row, 'filled')),
      window: {
        kind,
        startDate: isoDay(startDate),
        endDate: isoDay(endDate),
      },
      nextOlderWindow: nextOlderWindow
        ? { startDate: isoDay(nextOlderWindow.startDate), endDate: isoDay(nextOlderWindow.endDate) }
        : null,
      historyFloor: HISTORY_FLOOR,
      truncated,
      hasMoreOlder: Boolean(nextOlderWindow),
      openSnapshotDate: latestDate ? isoDay(latestDate) : null,
    };

    if (kind === 'older') {
      return NextResponse.json({
        openRecords: [],
        ...filledPayload,
      });
    }

    const openRows = await loadOpenLines({
      companyId,
      customerId,
      customerName,
      latestDate,
    });

    return NextResponse.json({
      openRecords: openRows.map((row) => mapOrderLineRecord(row, 'open')),
      ...filledPayload,
    });
  } catch (error) {
    console.error('[product-raw] failed', error);
    return NextResponse.json({ error: 'Failed to load product raw data' }, { status: 500 });
  }
}
