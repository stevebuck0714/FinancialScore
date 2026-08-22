import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RECENT_MONTHS = 12;
const OLDER_MONTHS = 24;
const MAX_UNIQUE_LINES = 8000;
const MAX_CUSTOMERS = 2000;

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

function customerMatchSql(customerId: string, customerName: string): Prisma.Sql {
  if (customerId) {
    return Prisma.sql`NULLIF(TRIM(COALESCE("customerId", '')), '') = ${customerId}`;
  }
  return Prisma.sql`"customerName" = ${customerName}`;
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

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsAccess(companyId);
    if (denied) return denied;

    const view = String(request.nextUrl.searchParams.get('view') || 'lines').trim().toLowerCase();
    if (view === 'customers') {
      const customers = await prisma.$queryRaw<ProductRawCustomer[]>(Prisma.sql`
        SELECT
          NULLIF(TRIM(COALESCE("customerId", '')), '') AS "customerId",
          MAX("customerName") AS "customerName"
        FROM "CustomerOrderLineSnapshot"
        WHERE "companyId" = ${companyId}
          AND "frequency" = 'daily'
          AND TRIM(COALESCE("customerName", '')) <> ''
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

    const windowKind = String(request.nextUrl.searchParams.get('window') || 'recent').trim().toLowerCase();
    const beforeParam = String(request.nextUrl.searchParams.get('before') || '').trim();
    const recentEnd = yesterdayUtc();
    const recentStart = addUtcMonths(recentEnd, -RECENT_MONTHS);
    let startDate = recentStart;
    let endDate = recentEnd;
    let kind: 'recent' | 'older' = 'recent';

    if (windowKind === 'older') {
      const before = parseIsoDay(beforeParam) || recentStart;
      endDate = utcDay(before);
      endDate.setUTCDate(endDate.getUTCDate() - 1);
      startDate = addUtcMonths(before, -OLDER_MONTHS);
      if (endDate.getTime() < startDate.getTime()) {
        return NextResponse.json({
          records: [],
          window: { kind: 'older', startDate: isoDay(startDate), endDate: isoDay(endDate) },
          truncated: false,
          hasMoreOlder: false,
        });
      }
      kind = 'older';
    }

    const matchSql = customerMatchSql(customerId, customerName);
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
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
      WHERE "companyId" = ${companyId}
        AND "frequency" = 'daily'
        AND ${matchSql}
        AND (
          ("orderDate" IS NOT NULL AND "orderDate" >= ${startDate} AND "orderDate" <= ${endDate})
          OR ("snapshotDate" >= ${startDate} AND "snapshotDate" <= ${endDate})
        )
      ORDER BY "orderId", "lineId", "snapshotDate" DESC
      LIMIT ${MAX_UNIQUE_LINES + 1}
    `);

    const truncated = rows.length > MAX_UNIQUE_LINES;
    const limitedRows = truncated ? rows.slice(0, MAX_UNIQUE_LINES) : rows;
    const olderExists = await prisma.$queryRaw<Array<{ has_older: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM "CustomerOrderLineSnapshot"
        WHERE "companyId" = ${companyId}
          AND "frequency" = 'daily'
          AND ${matchSql}
          AND COALESCE("orderDate", "snapshotDate") < ${startDate}
        LIMIT 1
      ) AS has_older
    `);

    return NextResponse.json({
      records: limitedRows.map((row) => ({
        source: 'customer-order-line',
        snapshotDate: row.snapshotDate,
        date: row.orderDate || row.snapshotDate,
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
      })),
      window: {
        kind,
        startDate: isoDay(startDate),
        endDate: isoDay(endDate),
      },
      truncated,
      hasMoreOlder: olderExists[0]?.has_older === true || String(olderExists[0]?.has_older) === 't',
    });
  } catch (error) {
    console.error('[product-raw] failed', error);
    return NextResponse.json({ error: 'Failed to load product raw data' }, { status: 500 });
  }
}
