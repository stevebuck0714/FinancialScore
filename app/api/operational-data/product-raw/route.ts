import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import {
  ensureCustomerOrderLineFilledTables,
  isTrulyOpenSql,
  loadProductRawCustomers,
  type OpenBookWindow,
} from '@/lib/operations/product-order-filled';
import { previousEstCalendarDate, storedDayBoundsUtc, utcMidnightForEstDate } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RECENT_MONTHS = 24;
const OLDER_MONTHS = 24;
const MAX_UNIQUE_LINES = 8000;
const MAX_CUSTOMERS = 2000;
const HISTORY_FLOOR = '2018-01-01';

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = utcDay(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
    remainingQty: Math.max(Number(row.qtyOrdered || 0) - Math.max(Number(row.qtyShipped || 0), 0), 0),
    openRevenue: Math.max(Number(row.qtyOrdered || 0) - Math.max(Number(row.qtyShipped || 0), 0), 0) * Number(row.unitPrice || 0),
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

function customerExactSql(customerId: string, customerName: string, alias: string): Prisma.Sql {
  const idCol = Prisma.raw(`"${alias}"."customerId"`);
  const nameCol = Prisma.raw(`"${alias}"."customerName"`);
  if (customerId) return Prisma.sql`${idCol} = ${customerId}`;
  if (customerName) return Prisma.sql`${nameCol} = ${customerName}`;
  return Prisma.sql`FALSE`;
}

async function resolveCustomerOpenBook(params: {
  companyId: string;
  customerId: string;
  customerName: string;
}): Promise<OpenBookWindow | null> {
  const customerFilter = customerExactSql(params.customerId, params.customerName, 's');
  const maxRows = await prisma.$queryRaw<Array<{ maxDate: Date | null }>>(Prisma.sql`
    SELECT MAX(s."snapshotDate") AS "maxDate"
    FROM "CustomerOrderLineSnapshot" s
    WHERE s."companyId" = ${params.companyId}
      AND s."frequency" = 'daily'
      AND ${customerFilter}
  `);
  const maxDate = maxRows[0]?.maxDate;
  if (!maxDate) return null;
  return storedDayBoundsUtc(maxDate);
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

async function hydrateOpenDayFromCsi(params: {
  companyId: string;
  openBook: OpenBookWindow;
  rows: any[];
}): Promise<void> {
  if (params.rows.length === 0) return;
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
    const wanted = new Set(params.rows.map((row) => normalizeOrderLineKey(row.orderId, row.lineId)));
    const csiByLine = new Map<string, { shipped: number | null; stat: string | null }>();
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
      if (!wanted.has(key) || csiByLine.has(key)) continue;
      const shipped = payloadNumber(payload, ['QtyShipped', 'qtyShipped']);
      const stat = String(payload.Stat ?? payload.STAT ?? payload.stat ?? '').trim().toUpperCase() || null;
      csiByLine.set(key, { shipped, stat });
    }
    if (csiByLine.size === 0) return;
    const persist: Array<{ orderId: string; lineId: string; qtyShipped: number | null; lineStat: string | null }> = [];
    for (const row of params.rows) {
      const csi = csiByLine.get(normalizeOrderLineKey(row.orderId, row.lineId));
      if (!csi) continue;
      if (row?.qtyShipped == null || row?.qtyShipped === '') {
        if (csi.shipped != null) row.qtyShipped = csi.shipped;
      }
      if (!row.lineStat && csi.stat) row.lineStat = csi.stat;
      persist.push({
        orderId: String(row.orderId || ''),
        lineId: String(row.lineId || ''),
        qtyShipped: csi.shipped,
        lineStat: csi.stat,
      });
    }
    for (let i = 0; i < persist.length; i += 200) {
      const chunk = persist.slice(i, i + 200);
      const values = chunk.map(
        (row) =>
          Prisma.sql`(${row.orderId}, ${row.lineId}, ${row.qtyShipped}, ${row.lineStat})`
      );
      await prisma.$executeRaw(Prisma.sql`
        WITH src("orderId","lineId","qtyShipped","lineStat") AS (VALUES ${Prisma.join(values)})
        UPDATE "CustomerOrderLineSnapshot" s
        SET
          "qtyShipped" = COALESCE(src."qtyShipped", s."qtyShipped"),
          "lineStat" = COALESCE(NULLIF(TRIM(COALESCE(src."lineStat", '')), ''), s."lineStat")
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
    console.error('[product-raw] CSI open-day hydrate failed', error);
  }
}

async function stampOpenBookFromCsi(companyId: string, openBook: OpenBookWindow): Promise<void> {
  try {
    const rawRows = await (prisma as any).inforRawRecord.findMany({
      where: {
        companyId,
        businessDate: { gte: openBook.start, lt: openBook.end },
        miProgram: { in: ['SLCOITEMS', 'SLCoitems'] },
      },
      select: { payload: true },
      take: 40000,
    });
    if (rawRows.length === 0) return;
    const persist: Array<{ orderId: string; lineId: string; qtyShipped: number | null; lineStat: string | null }> = [];
    const seen = new Set<string>();
    for (const raw of rawRows) {
      const payload =
        raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
          ? (raw.payload as Record<string, unknown>)
          : null;
      if (!payload) continue;
      const orderId = String(payload.CoNum ?? payload.coNum ?? payload.CONUM ?? '').trim().replace(/^0+/, '') || '0';
      const line = String(payload.CoLine ?? payload.coLine ?? payload.COLINE ?? '1').trim();
      const release = String(payload.CoRelease ?? payload.coRelease ?? payload.CORELEASE ?? '0').trim();
      const lineId = `${line}-${release}`;
      const key = `${orderId}|${lineId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      persist.push({
        orderId,
        lineId,
        qtyShipped: payloadNumber(payload, ['QtyShipped', 'qtyShipped']),
        lineStat: String(payload.Stat ?? payload.STAT ?? payload.stat ?? '').trim().toUpperCase() || null,
      });
    }
    for (let i = 0; i < persist.length; i += 200) {
      const chunk = persist.slice(i, i + 200);
      const values = chunk.map(
        (row) => Prisma.sql`(${row.orderId}, ${row.lineId}, ${row.qtyShipped}, ${row.lineStat})`
      );
      await prisma.$executeRaw(Prisma.sql`
        WITH src("orderId","lineId","qtyShipped","lineStat") AS (VALUES ${Prisma.join(values)})
        UPDATE "CustomerOrderLineSnapshot" s
        SET
          "qtyShipped" = COALESCE(src."qtyShipped", s."qtyShipped"),
          "lineStat" = COALESCE(NULLIF(TRIM(COALESCE(src."lineStat", '')), ''), s."lineStat")
        FROM src
        WHERE s."companyId" = ${companyId}
          AND s."frequency" = 'daily'
          AND s."snapshotDate" >= ${openBook.start}
          AND s."snapshotDate" < ${openBook.end}
          AND COALESCE(NULLIF(REGEXP_REPLACE(TRIM(s."orderId"), '^0+', ''), ''), '0') = src."orderId"
          AND s."lineId" = src."lineId"
      `);
    }
  } catch (error) {
    console.error('[product-raw] CSI open-book stamp failed', error);
  }
}

async function loadOpenLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
}): Promise<{ rows: any[]; openAsOf: Date | null }> {
  const customerFilter = params.customerId
    ? Prisma.sql`s."customerId" = ${params.customerId}`
    : params.customerName
      ? Prisma.sql`s."customerName" = ${params.customerName}`
      : Prisma.sql`FALSE`;

  const maxRows = await prisma.$queryRaw<Array<{ maxDate: Date | null }>>(Prisma.sql`
    SELECT MAX(s."snapshotDate") AS "maxDate"
    FROM "CustomerOrderLineSnapshot" s
    WHERE s."companyId" = ${params.companyId}
      AND s."frequency" = 'daily'
      AND ${customerFilter}
  `);
  const maxDate = maxRows[0]?.maxDate;
  if (!maxDate) return { rows: [], openAsOf: null };

  const { start, end } = storedDayBoundsUtc(maxDate);

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
        s."lineStat",
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
        AND s."snapshotDate" >= ${start}
        AND s."snapshotDate" < ${end}
        AND ${customerFilter}
        AND GREATEST(COALESCE(s."qtyOrdered", 0) - COALESCE(s."qtyShipped", 0), 0) > 0.0001
        AND UPPER(COALESCE(s."lineStat", '')) NOT IN ('C', 'F')
      ORDER BY s."orderId", s."lineId", s."snapshotDate" DESC
    `);
    return { rows, openAsOf: start };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/qtyShipped|customerPn|lineStat/i.test(message)) throw error;
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
        AND s."snapshotDate" >= ${start}
        AND s."snapshotDate" < ${end}
        AND ${customerFilter}
        AND COALESCE(s."qtyOrdered", 0) > 0
      ORDER BY s."orderId", s."lineId", s."snapshotDate" DESC
    `);
    return { rows, openAsOf: start };
  }
}

function openKeysCte(
  companyId: string,
  customerId: string,
  customerName: string,
  openBook: OpenBookWindow | null,
  withOpenFilters: boolean
): Prisma.Sql {
  if (!openBook) {
    return Prisma.sql`open_keys AS (
      SELECT NULL::text AS "orderId", NULL::text AS "lineId" WHERE FALSE
    )`;
  }
  const match = customerExactSql(customerId, customerName, 'o');
  const openFilters = withOpenFilters ? Prisma.sql`AND ${isTrulyOpenSql('o')}` : Prisma.empty;
  return Prisma.sql`open_keys AS (
    SELECT DISTINCT o."orderId", o."lineId"
    FROM "CustomerOrderLineSnapshot" o
    WHERE o."companyId" = ${companyId}
      AND o."frequency" = 'daily'
      AND o."snapshotDate" >= ${openBook.start}
      AND o."snapshotDate" < ${openBook.end}
      AND ${match}
      ${openFilters}
  )`;
}

async function queryFilledSql(query: Prisma.Sql): Promise<any[]> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', '20000', true)`;
        return tx.$queryRaw<any[]>(query);
      },
      { maxWait: 5000, timeout: 25000 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/statement timeout|canceling statement|Transaction API error|timed out/i.test(message)) {
      throw new Error('Filled order query timed out. Try again, or load a smaller date window.');
    }
    throw error;
  }
}

async function loadFilledFromTable(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  openBook: OpenBookWindow | null;
  startDate: Date;
  endExclusive: Date;
}): Promise<any[]> {
  const matchSql = customerExactSql(params.customerId, params.customerName, 'f');
  const query = (extraCols: Prisma.Sql, withOpenFilters: boolean) => Prisma.sql`
    WITH ${openKeysCte(params.companyId, params.customerId, params.customerName, params.openBook, withOpenFilters)}
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
        ${extraCols}
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
        AND f."filledAsOf" >= ${params.startDate}
        AND f."filledAsOf" < ${params.endExclusive}
        AND NOT EXISTS (
          SELECT 1 FROM open_keys k
          WHERE k."orderId" = f."orderId" AND k."lineId" = f."lineId"
        )
      ORDER BY COALESCE(f."orderDate", f."filledAsOf") DESC, f."orderId" DESC, f."lineId" DESC
      LIMIT ${MAX_UNIQUE_LINES + 1}
    ) filled_lines
  `;
  try {
    return await queryFilledSql(query(Prisma.sql`f."customerPn", f."qtyShipped", f."lineStat",`, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/qtyShipped|customerPn|lineStat/i.test(message)) throw error;
    return queryFilledSql(query(Prisma.empty, false));
  }
}

async function loadFilledFromSnapshots(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  openBook: OpenBookWindow | null;
  startDate: Date;
  endExclusive: Date;
}): Promise<any[]> {
  const matchSql = customerExactSql(params.customerId, params.customerName, 's');
  const query = (extraCols: Prisma.Sql, withOpenFilters: boolean) => Prisma.sql`
    WITH ${openKeysCte(params.companyId, params.customerId, params.customerName, params.openBook, withOpenFilters)}
    SELECT *
    FROM (
      SELECT DISTINCT ON (s."orderId", s."lineId")
        s."snapshotDate" AS "filledAsOf",
        s."customerId",
        s."customerName",
        s."orderId",
        s."lineId",
        s."orderDate",
        s."itemId",
        s."itemName",
        s."sku",
        ${extraCols}
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
        AND ${matchSql}
        AND s."snapshotDate" >= ${params.startDate}
        AND s."snapshotDate" < ${params.endExclusive}
        AND NOT EXISTS (
          SELECT 1 FROM open_keys k
          WHERE k."orderId" = s."orderId" AND k."lineId" = s."lineId"
        )
      ORDER BY s."orderId", s."lineId", s."snapshotDate" DESC
    ) last_seen
    ORDER BY COALESCE(last_seen."orderDate", last_seen."filledAsOf") DESC, last_seen."orderId" DESC, last_seen."lineId" DESC
    LIMIT ${MAX_UNIQUE_LINES + 1}
  `;
  try {
    return await queryFilledSql(query(Prisma.sql`s."customerPn", s."qtyShipped", s."lineStat",`, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/qtyShipped|customerPn|lineStat/i.test(message)) throw error;
    return queryFilledSql(query(Prisma.empty, false));
  }
}

async function loadFilledLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  openBook: OpenBookWindow | null;
  startDate: Date;
  endExclusive: Date;
}) {
  try {
    const fromTable = await loadFilledFromTable(params);
    if (fromTable.length > 0) return fromTable;
  } catch (error) {
    console.error('[product-raw] filled table query failed', error);
  }
  return loadFilledFromSnapshots(params);
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
      const customers = (await loadProductRawCustomers(companyId)).slice(0, MAX_CUSTOMERS);

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
      const [{ rows: openRows, openAsOf }, identityByItem] = await Promise.all([
        loadOpenLines({
          companyId,
          customerId,
          customerName,
        }),
        loadCustomerLineIdentity({
          companyId,
          customerId,
          customerName,
        }),
      ]);
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

    await ensureCustomerOrderLineFilledTables();

    const openBook = await resolveCustomerOpenBook({ companyId, customerId, customerName });
    const beforeParam = String(request.nextUrl.searchParams.get('before') || '').trim();
    const recentEnd = utcMidnightForEstDate(previousEstCalendarDate());
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

    const endExclusive = addUtcDays(utcDay(endDate), 1);
    const nextOlderWindow = olderWindowBefore(startDate);
    const [identityByItem, filledRows] = await Promise.all([
      loadCustomerLineIdentity({ companyId, customerId, customerName }),
      loadFilledLines({
        companyId,
        customerId,
        customerName,
        openBook,
        startDate,
        endExclusive,
      }),
    ]);
    const truncated = filledRows.length > MAX_UNIQUE_LINES;
    const limitedFilled = truncated ? filledRows.slice(0, MAX_UNIQUE_LINES) : filledRows;

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
