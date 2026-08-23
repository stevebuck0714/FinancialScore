import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import { ensureCustomerOrderLineFilledTables, ensureFilledHistory, resolveOpenBookWindow, type OpenBookWindow } from '@/lib/operations/product-order-filled';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RECENT_MONTHS = 24;
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
  const idMatch = customerId
    ? Prisma.sql`NULLIF(TRIM(COALESCE(${customerIdCol}, '')), '') = ${customerId}`
    : null;
  const nameMatch = customerName ? Prisma.sql`${customerNameCol} = ${customerName}` : null;
  if (idMatch && nameMatch) return Prisma.sql`(${idMatch} OR ${nameMatch})`;
  if (idMatch) return idMatch;
  if (nameMatch) return nameMatch;
  return Prisma.sql`FALSE`;
}

function sameCustomerSql(leftAlias: string, rightAlias: string): Prisma.Sql {
  const leftId = Prisma.raw(`"${leftAlias}"."customerId"`);
  const rightId = Prisma.raw(`"${rightAlias}"."customerId"`);
  const leftName = Prisma.raw(`"${leftAlias}"."customerName"`);
  const rightName = Prisma.raw(`"${rightAlias}"."customerName"`);
  return Prisma.sql`(
    (
      NULLIF(TRIM(COALESCE(${leftId}, '')), '') IS NOT NULL
      AND NULLIF(TRIM(COALESCE(${leftId}, '')), '') = NULLIF(TRIM(COALESCE(${rightId}, '')), '')
    )
    OR ${leftName} = ${rightName}
  )`;
}

function mapOrderLineRecord(row: any, status: 'open' | 'filled') {
  const customerPn = String(row.customerPn || row.customerPartNumber || row.custItem || row.CustItem || '').trim();
  const customerGroup = String(row.customerGroup || '').trim();
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
    customerGroup: customerGroup || null,
    customerPn: customerPn || null,
    customerPartNumber: customerPn || null,
    custItem: customerPn || null,
    orderId: row.orderId || null,
    lineId: row.lineId || null,
    itemId: row.itemId || row.sku || row.itemName || null,
    sku: row.sku || row.itemId || row.itemName || null,
    itemName: row.itemName || row.itemId || row.sku || null,
    quantitySold: Number(row.qtyInvoiced || row.qtyOrdered || 0),
    qtyOrdered: Number(row.qtyOrdered || 0),
    qtyShipped: row.qtyShipped == null || row.qtyShipped === '' ? null : Number(row.qtyShipped),
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

type LineIdentity = { customerPn: string; customerGroup: string };

function itemIdentityKey(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function mergeLineIdentity(map: Map<string, LineIdentity>, item: unknown, customerPn?: unknown, customerGroup?: unknown) {
  const key = itemIdentityKey(item);
  if (!key) return;
  const current = map.get(key) || { customerPn: '', customerGroup: '' };
  const pn = String(customerPn || '').trim();
  const group = String(customerGroup || '').trim();
  if (!current.customerPn && pn) current.customerPn = pn;
  if (!current.customerGroup && group) current.customerGroup = group;
  map.set(key, current);
}

async function loadCustomerLineIdentity(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  includeRawCsi?: boolean;
}): Promise<Map<string, LineIdentity>> {
  const byItem = new Map<string, LineIdentity>();
  const matchRevenue = customerMatchSql(params.customerId, params.customerName);

  try {
    const revenueRows = await prisma.$queryRaw<Array<{ itemSku: string; customerPartNumber: string | null; customerGroup: string | null }>>(Prisma.sql`
      SELECT "itemSku", MAX("customerPartNumber") AS "customerPartNumber", MAX("customerGroup") AS "customerGroup"
      FROM "ProductRevenueLine"
      WHERE "companyId" = ${params.companyId}
        AND ${matchRevenue}
      GROUP BY 1
    `);
    for (const row of revenueRows) mergeLineIdentity(byItem, row.itemSku, row.customerPartNumber, row.customerGroup);
  } catch {
    // Table may not exist yet in some environments.
  }

  try {
    const forecastRows = await prisma.$queryRaw<Array<{ itemSku: string; customerPartNumber: string | null; customerGroup: string | null }>>(Prisma.sql`
      SELECT "itemSku", MAX("customerPartNumber") AS "customerPartNumber", MAX("customerGroup") AS "customerGroup"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${params.companyId}
        AND ${matchRevenue}
      GROUP BY 1
    `);
    for (const row of forecastRows) mergeLineIdentity(byItem, row.itemSku, row.customerPartNumber, row.customerGroup);
  } catch {
    // Forecast table is optional for Raw Data.
  }

  if (params.includeRawCsi && params.customerId) {
    try {
      const rawRows = await prisma.$queryRaw<Array<{ item: string | null; custitem: string | null }>>(Prisma.sql`
        SELECT payload->>'Item' AS item, payload->>'CustItem' AS custitem
        FROM "InforRawRecord"
        WHERE "companyId" = ${params.companyId}
          AND UPPER(COALESCE("miProgram", '')) = 'SLCUSTOMERITEMS'
          AND payload->>'CustNum' = ${params.customerId}
          AND NULLIF(TRIM(COALESCE(payload->>'CustItem', '')), '') IS NOT NULL
        LIMIT 5000
      `);
      for (const row of rawRows) mergeLineIdentity(byItem, row.item, row.custitem, null);
    } catch {
      // Raw CSI lookup is best-effort for historical snapshots.
    }
  }

  return byItem;
}

function applyLineIdentity(row: any, identityByItem: Map<string, LineIdentity>) {
  const identity =
    identityByItem.get(itemIdentityKey(row.sku)) ||
    identityByItem.get(itemIdentityKey(row.itemId)) ||
    identityByItem.get(itemIdentityKey(row.itemName));
  if (!row.customerPn && identity?.customerPn) {
    row.customerPn = identity.customerPn;
    row.customerPartNumber = identity.customerPn;
    row.custItem = identity.customerPn;
  }
  if (!row.customerGroup && identity?.customerGroup) {
    row.customerGroup = identity.customerGroup;
  }
  return row;
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

async function resolveCustomerOpenBook(params: {
  companyId: string;
  customerId: string;
  customerName: string;
}): Promise<OpenBookWindow | null> {
  const matchSql = customerMatchSql(params.customerId, params.customerName, 's');
  const rows = await prisma.$queryRaw<Array<{ start: Date; end: Date }>>(Prisma.sql`
    WITH customer_days AS (
      SELECT DATE_TRUNC('day', s."snapshotDate") AS day_start, COUNT(*)::int AS n
      FROM "CustomerOrderLineSnapshot" s
      WHERE s."companyId" = ${params.companyId}
        AND s."frequency" = 'daily'
        AND ${matchSql}
      GROUP BY 1
    ),
    latest AS (
      SELECT MAX(day_start) AS max_day FROM customer_days
    ),
    ranked AS (
      SELECT d.day_start, d.n, MAX(d.n) OVER () AS max_n
      FROM customer_days d
      CROSS JOIN latest
      WHERE latest.max_day IS NOT NULL
        AND d.day_start >= latest.max_day - INTERVAL '21 days'
    )
    SELECT day_start AS start, (day_start + INTERVAL '1 day') AS end
    FROM ranked
    WHERE n >= GREATEST((max_n * 0.5)::int, 1)
    ORDER BY day_start DESC
    LIMIT 1
  `);
  const start = rows[0]?.start;
  const end = rows[0]?.end;
  if (!start || !end) return null;
  return { start, end };
}

function payloadNumber(payload: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!payload) return null;
  for (const key of keys) {
    const raw = payload[key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeOrderLineKey(orderId: unknown, lineId: unknown): string {
  const token = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '0';
    const num = Number(raw);
    return Number.isFinite(num) ? String(num) : raw.toUpperCase();
  };
  const [linePart, releasePart] = String(lineId || '').split('-');
  return `${token(orderId)}|${token(linePart)}-${token(releasePart)}`;
}

async function hydrateQtyShippedFromOpenDay(params: {
  companyId: string;
  openBook: OpenBookWindow;
  rows: any[];
}): Promise<void> {
  const missing = params.rows.filter((row) => row?.qtyShipped == null || row?.qtyShipped === '');
  if (missing.length === 0) return;
  try {
    const rawRows = await (prisma as any).inforRawRecord.findMany({
      where: {
        companyId: params.companyId,
        businessDate: { gte: params.openBook.start, lt: params.openBook.end },
        miProgram: { in: ['SLCOITEMS', 'SLCoitems'] },
      },
      select: { payload: true },
      take: 40000,
    });
    if (rawRows.length === 0) return;
    const wanted = new Set(missing.map((row) => normalizeOrderLineKey(row.orderId, row.lineId)));
    const shippedByLine = new Map<string, number>();
    for (const raw of rawRows) {
      const payload =
        raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
          ? (raw.payload as Record<string, unknown>)
          : null;
      if (!payload) continue;
      const orderId = payload.CoNum ?? payload.coNum ?? payload.CONUM;
      const line = payload.CoLine ?? payload.coLine ?? payload.COLINE ?? '1';
      const release = payload.CoRelease ?? payload.coRelease ?? payload.CORELEASE ?? '0';
      const key = normalizeOrderLineKey(orderId, `${line}-${release}`);
      if (!wanted.has(key) || shippedByLine.has(key)) continue;
      const shipped = payloadNumber(payload, ['QtyShipped', 'qtyShipped']);
      if (shipped == null) continue;
      shippedByLine.set(key, shipped);
    }
    if (shippedByLine.size === 0) return;
    const persist: Array<{ orderId: string; lineId: string; qtyShipped: number }> = [];
    for (const row of params.rows) {
      if (row?.qtyShipped != null && row?.qtyShipped !== '') continue;
      const shipped = shippedByLine.get(normalizeOrderLineKey(row.orderId, row.lineId));
      if (shipped == null) continue;
      row.qtyShipped = shipped;
      persist.push({
        orderId: String(row.orderId || ''),
        lineId: String(row.lineId || ''),
        qtyShipped: shipped,
      });
    }
    for (let i = 0; i < persist.length; i += 200) {
      const chunk = persist.slice(i, i + 200);
      const values = chunk.map(
        (row) => Prisma.sql`(${row.orderId}, ${row.lineId}, ${Number(row.qtyShipped)})`
      );
      await prisma.$executeRaw(Prisma.sql`
        WITH src("orderId","lineId","qtyShipped") AS (VALUES ${Prisma.join(values)})
        UPDATE "CustomerOrderLineSnapshot" s
        SET "qtyShipped" = src."qtyShipped"
        FROM src
        WHERE s."companyId" = ${params.companyId}
          AND s."frequency" = 'daily'
          AND s."snapshotDate" >= ${params.openBook.start}
          AND s."snapshotDate" < ${params.openBook.end}
          AND s."orderId" = src."orderId"
          AND s."lineId" = src."lineId"
      `);
    }
  } catch (error) {
    console.error('[product-raw] qty shipped day hydrate failed', error);
  }
}

async function hydrateFilledQtyShippedFromSnapshots(params: {
  companyId: string;
  rows: any[];
}): Promise<void> {
  const missing = params.rows.filter((row) => row?.qtyShipped == null || row?.qtyShipped === '');
  if (missing.length === 0) return;
  const orderIds = Array.from(new Set(missing.map((row) => String(row?.orderId || '').trim()).filter(Boolean)));
  if (orderIds.length === 0) return;
  try {
    const snapshotRows = await prisma.$queryRaw<Array<{ orderId: string; lineId: string; qtyShipped: number }>>(Prisma.sql`
      SELECT DISTINCT ON (s."orderId", s."lineId")
        s."orderId",
        s."lineId",
        s."qtyShipped"
      FROM "CustomerOrderLineSnapshot" s
      WHERE s."companyId" = ${params.companyId}
        AND s."frequency" = 'daily'
        AND s."orderId" IN (${Prisma.join(orderIds.map((id) => Prisma.sql`${id}`))})
        AND s."qtyShipped" IS NOT NULL
      ORDER BY s."orderId", s."lineId", s."snapshotDate" DESC
    `);
    const shippedByLine = new Map(
      snapshotRows.map((row) => [normalizeOrderLineKey(row.orderId, row.lineId), Number(row.qtyShipped)])
    );
    for (const row of params.rows) {
      if (row?.qtyShipped != null && row?.qtyShipped !== '') continue;
      const shipped = shippedByLine.get(normalizeOrderLineKey(row.orderId, row.lineId));
      if (shipped != null) row.qtyShipped = shipped;
    }
  } catch (error) {
    console.error('[product-raw] filled qty shipped snapshot hydrate failed', error);
  }
}

async function loadOpenLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
}): Promise<{ rows: any[]; openAsOf: Date | null }> {
  const openBook = await resolveCustomerOpenBook(params);
  if (!openBook) return { rows: [], openAsOf: null };
  const matchSql = customerMatchSql(params.customerId, params.customerName, 's');
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT DISTINCT ON (s."orderId", s."lineId")
      s."snapshotDate",
      s."customerId",
      s."customerName",
      s."orderId",
      s."lineId",
      s."orderDate",
      s."itemId",
      s."itemName",
      s."sku",
      s."customerPn",
      s."qtyOrdered",
      s."qtyShipped",
      s."qtyInvoiced",
      s."unitPrice",
      s."contractValue",
      s."invoicedAmount",
      s."remainingAmount",
      s."sourceTransaction"
    FROM "CustomerOrderLineSnapshot" s
    WHERE s."companyId" = ${params.companyId}
      AND s."frequency" = 'daily'
      AND s."snapshotDate" >= ${openBook.start}
      AND s."snapshotDate" < ${openBook.end}
      AND ${matchSql}
      AND NOT EXISTS (
        SELECT 1
        FROM "CustomerOrderLineFilled" f
        WHERE f."companyId" = ${params.companyId}
          AND f."orderId" = s."orderId"
          AND f."lineId" = s."lineId"
          AND ${sameCustomerSql('f', 's')}
      )
    ORDER BY s."orderId", s."lineId", s."snapshotDate" DESC
  `);
    await hydrateQtyShippedFromOpenDay({ companyId: params.companyId, openBook, rows });
    return { rows, openAsOf: openBook.start };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/qtyShipped|customerPn/i.test(message)) throw error;
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT ON (s."orderId", s."lineId")
        s."snapshotDate",
        s."customerId",
        s."customerName",
        s."orderId",
        s."lineId",
        s."orderDate",
        s."itemId",
        s."itemName",
        s."sku",
        s."qtyOrdered",
        s."qtyInvoiced",
        s."unitPrice",
        s."contractValue",
        s."invoicedAmount",
        s."remainingAmount",
        s."sourceTransaction"
      FROM "CustomerOrderLineSnapshot" s
      WHERE s."companyId" = ${params.companyId}
        AND s."frequency" = 'daily'
        AND s."snapshotDate" >= ${openBook.start}
        AND s."snapshotDate" < ${openBook.end}
        AND ${matchSql}
        AND NOT EXISTS (
          SELECT 1
          FROM "CustomerOrderLineFilled" f
          WHERE f."companyId" = ${params.companyId}
            AND f."orderId" = s."orderId"
            AND f."lineId" = s."lineId"
            AND ${sameCustomerSql('f', 's')}
        )
      ORDER BY s."orderId", s."lineId", s."snapshotDate" DESC
    `);
    await hydrateQtyShippedFromOpenDay({ companyId: params.companyId, openBook, rows });
    return { rows, openAsOf: openBook.start };
  }
}

async function loadFilledLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  openBook: OpenBookWindow | null;
  startDate: Date;
  endDate: Date;
}) {
  const matchSql = customerMatchSql(params.customerId, params.customerName, 'f');
  const openExclude = params.openBook
    ? Prisma.sql`
        AND NOT EXISTS (
          SELECT 1
          FROM "CustomerOrderLineSnapshot" s
          WHERE s."companyId" = ${params.companyId}
            AND s."frequency" = 'daily'
            AND s."snapshotDate" >= ${params.openBook.start}
            AND s."snapshotDate" < ${params.openBook.end}
            AND s."orderId" = f."orderId"
            AND s."lineId" = f."lineId"
            AND ${sameCustomerSql('f', 's')}
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
        f."customerPn",
        f."qtyOrdered",
        f."qtyShipped",
        f."qtyInvoiced",
        f."unitPrice",
        f."contractValue",
        f."invoicedAmount",
        f."remainingAmount",
        f."sourceTransaction"
      FROM "CustomerOrderLineFilled" f
      WHERE f."companyId" = ${params.companyId}
        AND ${matchSql}
        AND COALESCE(f."filledAsOf", f."orderDate") >= ${params.startDate}
        AND COALESCE(f."filledAsOf", f."orderDate") <= ${params.endDate}
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

    const windowKind = String(request.nextUrl.searchParams.get('window') || 'recent').trim().toLowerCase();
    const wantsFilled = view === 'filled' || (view !== 'open' && windowKind === 'older');

    if (!wantsFilled) {
      const identityByItem = await loadCustomerLineIdentity({ companyId, customerId, customerName });
      const { rows: openRows, openAsOf } = await loadOpenLines({
        companyId,
        customerId,
        customerName,
      });
      return NextResponse.json({
        openRecords: openRows
          .map((row) => mapOrderLineRecord(row, 'open'))
          .map((row) => applyLineIdentity(row, identityByItem)),
        filledRecords: [],
        openAsOf: openAsOf ? isoDay(openAsOf) : null,
        window: null,
        nextOlderWindow: null,
        historyFloor: HISTORY_FLOOR,
        truncated: false,
        hasMoreOlder: false,
      });
    }

    await ensureFilledHistory(companyId);
    const openBook = await resolveOpenBookWindow(companyId);
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
    const identityByItem = await loadCustomerLineIdentity({ companyId, customerId, customerName });
    const filledRows = await loadFilledLines({
      companyId,
      customerId,
      customerName,
      openBook,
      startDate,
      endDate,
    });
    const truncated = filledRows.length > MAX_UNIQUE_LINES;
    const limitedFilled = truncated ? filledRows.slice(0, MAX_UNIQUE_LINES) : filledRows;
    await hydrateFilledQtyShippedFromSnapshots({ companyId, rows: limitedFilled });

    return NextResponse.json({
      openRecords: [],
      filledRecords: limitedFilled
        .map((row) => mapOrderLineRecord(row, 'filled'))
        .map((row) => applyLineIdentity(row, identityByItem)),
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
    });
  } catch (error) {
    console.error('[product-raw] failed', error);
    const message = error instanceof Error ? error.message.split('\n')[0].slice(0, 280) : 'Failed to load product raw data';
    return NextResponse.json({ error: message || 'Failed to load product raw data' }, { status: 500 });
  }
}
