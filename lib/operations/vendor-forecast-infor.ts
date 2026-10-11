import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  forecastActualsExactKey,
  forecastActualsItemKey,
  normalizeMonthQtyMap,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import { estMonthIndex, estYear, formatEstDate } from '@/lib/time/eastern';
import {
  effectiveVendorForecastQty,
  ensureVendorMonthlyForecastTables,
  isEmptyQtySource,
  loadPrimaryVendorByItem,
  loadVendorForecastSettings,
  parseForecastOverrideQty,
  sumMonthQty,
  vendorForecastBaseQty,
} from '@/lib/operations/vendor-monthly-forecast-db';

const INFOR_PLATFORMS = Prisma.sql`"platform" IN ('INFOR_M3', 'INFOR_CSI')`;
const OPEN_LINE_STATUSES = new Set(['O', 'P']);
const BOOKED_LINE_STATUSES = ['O', 'P', 'F', 'C'];

type OrderLineRow = {
  customerId: string;
  customerName: string | null;
  itemSku: string;
  customerPartNumber: string;
  stat: string;
  dueYear: number | null;
  dueMonth: number | null;
  qtyOrdered: number;
  qtyShipped: number;
};

type Pair = { customerId: string; customerName: string; itemSku: string; customerPartNumber: string };

type ExistingRow = {
  id: string;
  vendorId: string;
  vendorName: string;
  customerId: string;
  customerName: string;
  customerPartNumber: string;
  itemSku: string;
  forecastQty: Prisma.JsonValue;
  inforForecastQty: Prisma.JsonValue;
  forecastOverrideQty: Prisma.JsonValue;
  annualBaseQty: number | null;
  sortOrder: number;
};

/** Months whose quantity still follows Infor; earlier months keep the value they closed with. */
export function openForecastMonths(year: number, now: Date = new Date()): number[] {
  const currentYear = estYear(now);
  if (year < currentYear) return [];
  const first = year > currentYear ? 1 : estMonthIndex(now) + 1;
  return Array.from({ length: 13 - first }, (_, index) => first + index);
}

async function latestOrderLineLoad(companyId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ businessDate: Date | null }>>(Prisma.sql`
    SELECT MAX("businessDate") AS "businessDate"
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId} AND ${INFOR_PLATFORMS} AND "miProgram" = 'SLCoitems'
  `);
  return rows[0]?.businessDate ?? null;
}

function cleanCustomerName(derived: string | null): string | null {
  const text = String(derived || '').trim();
  if (!text) return null;
  const parts = text.split(/\s+-\s+/);
  return (parts.length > 1 ? parts.slice(1).join(' - ') : text).trim() || null;
}

/**
 * Order lines from the newest SLCoitems load. The customer lives on the order
 * header (SLCos); the line's own CustNum is blank.
 */
async function loadOrderLines(companyId: string, businessDate: Date, year: number): Promise<OrderLineRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    customerId: string;
    customerName: string | null;
    itemSku: string;
    customerPartNumber: string;
    stat: string;
    due: string | null;
    qtyOrdered: number | null;
    qtyShipped: number | null;
  }>>(Prisma.sql`
    WITH lines AS (
      SELECT DISTINCT ON (TRIM(r.payload->>'CoNum'), r.payload->>'CoLine', r.payload->>'CoRelease')
        TRIM(r.payload->>'CoNum') AS co,
        UPPER(TRIM(r.payload->>'Item')) AS item,
        TRIM(COALESCE(r.payload->>'CustItem', '')) AS cust_item,
        UPPER(TRIM(COALESCE(r.payload->>'Stat', ''))) AS stat,
        r.payload->>'DueDate' AS due,
        CASE WHEN r.payload->>'QtyOrdered' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (r.payload->>'QtyOrdered')::double precision ELSE 0 END AS qty_ordered,
        CASE WHEN r.payload->>'QtyShipped' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (r.payload->>'QtyShipped')::double precision ELSE 0 END AS qty_shipped
      FROM "InforRawRecord" r
      WHERE r."companyId" = ${companyId}
        AND r."platform" IN ('INFOR_M3', 'INFOR_CSI')
        AND r."miProgram" = 'SLCoitems'
        AND r."businessDate" = ${businessDate}
      ORDER BY TRIM(r.payload->>'CoNum'), r.payload->>'CoLine', r.payload->>'CoRelease', r."fetchedAt" DESC
    ),
    booked AS (
      SELECT * FROM lines
      WHERE item <> ''
        AND stat IN (${Prisma.join(BOOKED_LINE_STATUSES)})
        AND (stat IN ('O', 'P') OR LEFT(COALESCE(due, ''), 4) = ${String(year)})
    ),
    hdr AS (
      SELECT DISTINCT ON (TRIM(h.payload->>'CoNum'))
        TRIM(h.payload->>'CoNum') AS co,
        TRIM(COALESCE(h.payload->>'CustNum', '')) AS cust,
        h.payload->>'DerCustNoName' AS cust_name
      FROM "InforRawRecord" h
      WHERE h."companyId" = ${companyId}
        AND h."platform" IN ('INFOR_M3', 'INFOR_CSI')
        AND h."miProgram" = 'SLCos'
        AND TRIM(h.payload->>'CoNum') IN (SELECT co FROM booked)
      ORDER BY TRIM(h.payload->>'CoNum'), h."businessDate" DESC, h."fetchedAt" DESC
    )
    SELECT hdr.cust AS "customerId", hdr.cust_name AS "customerName", b.item AS "itemSku",
           b.cust_item AS "customerPartNumber", b.stat, b.due, b.qty_ordered AS "qtyOrdered", b.qty_shipped AS "qtyShipped"
    FROM booked b
    JOIN hdr ON hdr.co = b.co
    WHERE hdr.cust <> ''
  `);
  return rows.map((row) => {
    const due = String(row.due || '');
    const dueYear = /^\d{8}/.test(due) ? Number(due.slice(0, 4)) : null;
    const dueMonth = /^\d{8}/.test(due) ? Number(due.slice(4, 6)) : null;
    return {
      customerId: row.customerId,
      customerName: cleanCustomerName(row.customerName),
      itemSku: row.itemSku,
      customerPartNumber: row.customerPartNumber,
      stat: row.stat,
      dueYear,
      dueMonth,
      qtyOrdered: Number(row.qtyOrdered) || 0,
      qtyShipped: Number(row.qtyShipped) || 0,
    };
  });
}

async function loadRecentShipmentPairs(companyId: string): Promise<Pair[]> {
  const since = new Date(Date.UTC(estYear(), estMonthIndex() - 12, 1));
  try {
    return await prisma.$queryRaw<Pair[]>(Prisma.sql`
      SELECT DISTINCT
        TRIM("customerId") AS "customerId",
        '' AS "customerName",
        UPPER(TRIM("itemSku")) AS "itemSku",
        TRIM(COALESCE("customerPartNumber", '')) AS "customerPartNumber"
      FROM "InforShipmentFact"
      WHERE "companyId" = ${companyId}
        AND "shipDate" >= ${since}
        AND COALESCE(TRIM("customerId"), '') <> ''
        AND COALESCE(TRIM("itemSku"), '') <> ''
    `);
  } catch (error) {
    if (/InforShipmentFact" does not exist/i.test(error instanceof Error ? error.message : String(error))) return [];
    throw error;
  }
}

async function loadInforCustomerNames(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<Array<{ customerId: string; name: string }>>(Prisma.sql`
    SELECT DISTINCT ON (TRIM(payload->>'CustNum'))
      TRIM(payload->>'CustNum') AS "customerId",
      TRIM(payload->>'Name') AS name
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND ${INFOR_PLATFORMS}
      AND "miProgram" = 'SLCustomers'
      AND COALESCE(TRIM(payload->>'CustNum'), '') <> ''
      AND COALESCE(TRIM(payload->>'Name'), '') <> ''
    ORDER BY TRIM(payload->>'CustNum'), "businessDate" DESC, "fetchedAt" DESC
  `);
  const result = new Map<string, string>();
  for (const row of rows) result.set(forecastActualsItemKey(row.customerId, ''), row.name);
  return result;
}

function customerKey(customerId: string): string {
  return forecastActualsItemKey(customerId, '');
}

function addQty(map: Map<string, MonthQtyMap>, key: string, month: number, qty: number) {
  if (!qty) return;
  const current = map.get(key) || {};
  current[String(month)] = (Number(current[String(month)]) || 0) + qty;
  map.set(key, current);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function newForecastId(): string {
  return `vmf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Rebuilds the vendor forecast rows from Infor: customer/item rows from open
 * orders and the last 12 months of shipments, vendor from the item's primary
 * vendor, and each open month's quantity from the order book (open lines at
 * ordered quantity, filled lines at shipped quantity, by due month). Closed
 * months, user overrides, and team/CSR/group/status columns are kept.
 */
export async function refreshVendorForecastFromInfor(companyId: string, year: number): Promise<{
  refreshed: boolean;
  sourceDate: Date | null;
  updated: number;
  inserted: number;
}> {
  const months = openForecastMonths(year);
  const sourceDate = await latestOrderLineLoad(companyId);
  if (!sourceDate || months.length === 0) return { refreshed: false, sourceDate, updated: 0, inserted: 0 };

  const [orderLines, shipmentPairs, customerNames, vendorByItem, existing] = await Promise.all([
    loadOrderLines(companyId, sourceDate, year),
    loadRecentShipmentPairs(companyId),
    loadInforCustomerNames(companyId),
    loadPrimaryVendorByItem(companyId),
    prisma.$queryRawUnsafe<ExistingRow[]>(
      `SELECT "id", "vendorId", "vendorName", "customerId", "customerName", "customerPartNumber", "itemSku",
              "forecastQty", "inforForecastQty", "forecastOverrideQty", "annualBaseQty", "sortOrder"
         FROM "VendorMonthlyForecastLine"
        WHERE "companyId" = $1 AND "year" = $2`,
      companyId,
      year
    ),
  ]);

  const bookByExact = new Map<string, MonthQtyMap>();
  const bookByItem = new Map<string, MonthQtyMap>();
  const candidates = new Map<string, Pair>();
  const headerNames = new Map<string, string>();
  for (const line of orderLines) {
    const exactKey = forecastActualsExactKey(line.customerId, line.itemSku, line.customerPartNumber);
    if (line.customerName) headerNames.set(customerKey(line.customerId), line.customerName);
    if (OPEN_LINE_STATUSES.has(line.stat) && !candidates.has(exactKey)) {
      candidates.set(exactKey, {
        customerId: line.customerId,
        customerName: line.customerName || '',
        itemSku: line.itemSku,
        customerPartNumber: line.customerPartNumber,
      });
    }
    if (line.dueYear !== year || !line.dueMonth || line.dueMonth < 1 || line.dueMonth > 12) continue;
    const qty = OPEN_LINE_STATUSES.has(line.stat) ? line.qtyOrdered : line.qtyShipped;
    addQty(bookByExact, exactKey, line.dueMonth, qty);
    addQty(bookByItem, forecastActualsItemKey(line.customerId, line.itemSku), line.dueMonth, qty);
  }
  for (const pair of shipmentPairs) {
    const exactKey = forecastActualsExactKey(pair.customerId, pair.itemSku, pair.customerPartNumber);
    if (!candidates.has(exactKey)) candidates.set(exactKey, pair);
  }

  const existingExact = new Set<string>();
  const existingItemCounts = new Map<string, number>();
  const takenKeys = new Set<string>();
  for (const row of existing) {
    existingExact.add(forecastActualsExactKey(row.customerId, row.itemSku, row.customerPartNumber));
    const itemKey = forecastActualsItemKey(row.customerId, row.itemSku);
    existingItemCounts.set(itemKey, (existingItemCounts.get(itemKey) || 0) + 1);
    takenKeys.add(`${row.vendorId}||${row.customerId}||${row.itemSku}||${row.customerPartNumber}`);
  }

  // SLCustomers holds one record per ship-to, so the order header's name is the reliable one.
  const nameFor = (customerId: string, fallback: string) =>
    headerNames.get(customerKey(customerId)) || customerNames.get(customerKey(customerId)) || fallback || customerId;

  const updates: Array<{
    id: string;
    vendorId: string;
    vendorName: string;
    customerName: string;
    inforForecastQty: MonthQtyMap;
    forecastQty: MonthQtyMap;
    annualBaseQty: number;
  }> = [];
  for (const row of existing) {
    const exactKey = forecastActualsExactKey(row.customerId, row.itemSku, row.customerPartNumber);
    const itemKey = forecastActualsItemKey(row.customerId, row.itemSku);
    const book = bookByExact.get(exactKey)
      || (existingItemCounts.get(itemKey) === 1 ? bookByItem.get(itemKey) : undefined)
      || {};
    const base = vendorForecastBaseQty(row);
    for (const month of months) base[String(month)] = Number(book[String(month)]) || 0;
    const overrides = parseForecastOverrideQty(row.forecastOverrideQty);
    const effective = effectiveVendorForecastQty(base, overrides);

    let vendorId = row.vendorId;
    let vendorName = row.vendorName;
    const inforVendor = vendorByItem.get(String(row.itemSku || '').trim().toUpperCase());
    if (inforVendor && inforVendor.vendorId !== row.vendorId) {
      const nextKey = `${inforVendor.vendorId}||${row.customerId}||${row.itemSku}||${row.customerPartNumber}`;
      if (!takenKeys.has(nextKey)) {
        takenKeys.delete(`${row.vendorId}||${row.customerId}||${row.itemSku}||${row.customerPartNumber}`);
        takenKeys.add(nextKey);
        vendorId = inforVendor.vendorId;
        vendorName = inforVendor.vendorName;
      }
    } else if (inforVendor && inforVendor.vendorName && inforVendor.vendorName !== row.vendorName) {
      vendorName = inforVendor.vendorName;
    }
    const customerName = nameFor(row.customerId, row.customerName);
    const annualBaseQty = sumMonthQty(effective);

    if (
      vendorId === row.vendorId &&
      vendorName === row.vendorName &&
      customerName === row.customerName &&
      !isEmptyQtySource(row.inforForecastQty) &&
      sameJson(base, normalizeMonthQtyMap(row.inforForecastQty)) &&
      sameJson(effective, normalizeMonthQtyMap(row.forecastQty)) &&
      Number(row.annualBaseQty) === annualBaseQty
    ) continue;
    updates.push({ id: row.id, vendorId, vendorName, customerName, inforForecastQty: base, forecastQty: effective, annualBaseQty });
  }

  let nextSort = existing.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1;
  const inserts: Array<Pair & { id: string; vendorId: string; vendorName: string; qty: MonthQtyMap; sortOrder: number }> = [];
  for (const [exactKey, pair] of candidates) {
    if (existingExact.has(exactKey)) continue;
    if (existingItemCounts.get(forecastActualsItemKey(pair.customerId, pair.itemSku)) === 1) continue;
    const vendor = vendorByItem.get(pair.itemSku);
    if (!vendor) continue;
    const uniqueKey = `${vendor.vendorId}||${pair.customerId}||${pair.itemSku}||${pair.customerPartNumber}`;
    if (takenKeys.has(uniqueKey)) continue;
    takenKeys.add(uniqueKey);
    const book = bookByExact.get(exactKey) || {};
    const qty = normalizeMonthQtyMap({});
    for (const month of months) qty[String(month)] = Number(book[String(month)]) || 0;
    inserts.push({
      ...pair,
      customerName: nameFor(pair.customerId, pair.customerName),
      id: newForecastId(),
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      qty,
      sortOrder: nextSort++,
    });
  }

  const now = new Date();
  for (let offset = 0; offset < updates.length; offset += 150) {
    const chunk = updates.slice(offset, offset + 150);
    const params: unknown[] = [];
    const values = chunk.map((row, index) => {
      const base = index * 7;
      params.push(
        row.id,
        row.vendorId,
        row.vendorName,
        row.customerName,
        JSON.stringify(row.inforForecastQty),
        JSON.stringify(row.forecastQty),
        row.annualBaseQty
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6}::jsonb, $${base + 7}::double precision)`;
    });
    params.push(now);
    await prisma.$executeRawUnsafe(
      `UPDATE "VendorMonthlyForecastLine" AS t
          SET "vendorId" = v.vendor_id,
              "vendorName" = v.vendor_name,
              "customerName" = v.customer_name,
              "inforForecastQty" = v.infor_qty,
              "forecastQty" = v.forecast_qty,
              "annualBaseQty" = v.annual_qty,
              "updatedAt" = $${params.length}
         FROM (VALUES ${values.join(', ')}) AS v(id, vendor_id, vendor_name, customer_name, infor_qty, forecast_qty, annual_qty)
        WHERE t."id" = v.id`,
      ...params
    );
  }

  for (let offset = 0; offset < inserts.length; offset += 100) {
    const chunk = inserts.slice(offset, offset + 100);
    const params: unknown[] = [];
    const values = chunk.map((row, index) => {
      const base = index * 13;
      params.push(
        row.id,
        companyId,
        year,
        row.vendorId,
        row.vendorName,
        row.customerId,
        row.customerName,
        row.customerPartNumber,
        row.itemSku,
        sumMonthQty(row.qty),
        JSON.stringify(row.qty),
        row.sortOrder,
        now
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::jsonb, $${base + 11}::jsonb, '{}'::jsonb, $${base + 12}, $${base + 13}, $${base + 13})`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VendorMonthlyForecastLine" (
         "id", "companyId", "year", "vendorId", "vendorName", "customerId", "customerName", "customerPartNumber",
         "itemSku", "annualBaseQty", "forecastQty", "inforForecastQty", "actualQty", "sortOrder", "createdAt", "updatedAt"
       ) VALUES ${values.join(', ')}
       ON CONFLICT ("companyId", "year", "vendorId", "customerId", "itemSku", "customerPartNumber") DO NOTHING`,
      ...params
    );
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "VendorMonthlyForecastSettings" ("companyId", "year", "inforSourceDate", "inforRefreshedAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT ("companyId", "year") DO UPDATE SET
       "inforSourceDate" = EXCLUDED."inforSourceDate",
       "inforRefreshedAt" = EXCLUDED."inforRefreshedAt",
       "updatedAt" = EXCLUDED."updatedAt"`,
    companyId,
    year,
    sourceDate,
    now
  );

  return { refreshed: true, sourceDate, updated: updates.length, inserted: inserts.length };
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Refreshes when a newer Infor order-line load has arrived or the last refresh
 * was on an earlier EST day (so a new month starts following Infor).
 */
export async function ensureVendorForecastFromInfor(companyId: string, year: number): Promise<void> {
  if (openForecastMonths(year).length === 0) return;
  const key = `${companyId}|${year}`;
  const running = inFlight.get(key);
  if (running) {
    await running.catch(() => undefined);
    return;
  }
  const task = (async () => {
    await ensureVendorMonthlyForecastTables();
    const [settings, sourceDate] = await Promise.all([
      loadVendorForecastSettings(companyId, year),
      latestOrderLineLoad(companyId),
    ]);
    if (!sourceDate) return;
    const sameSource = settings?.inforSourceDate?.getTime() === sourceDate.getTime();
    const sameDay = settings?.inforRefreshedAt ? formatEstDate(settings.inforRefreshedAt) === formatEstDate() : false;
    if (sameSource && sameDay) return;
    await refreshVendorForecastFromInfor(companyId, year);
  })();
  inFlight.set(key, task);
  try {
    await task;
  } finally {
    inFlight.delete(key);
  }
}
