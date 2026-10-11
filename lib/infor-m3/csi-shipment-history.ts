import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import {
  emptyMonthQtyMap,
  forecastActualsExactKey,
  forecastActualsItemKey,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import { formatEstDate } from '@/lib/time/eastern';

/**
 * SLCoShips is the CSI shipment log: one row per shipment of an order line,
 * with its ship date. It carries years of history, unlike the daily
 * SLCoitems snapshots, so monthly shipped units come from here when pulled.
 */
const SHIPMENT_PROPERTIES = [
  'CoNum',
  'CoLine',
  'CoRelease',
  'DateSeq',
  'ShipDate',
  'CoiOrCoihItem',
  'CoiItem',
  'CoiCustItem',
  'CoCustNum',
  'CoCustSeq',
  'HcoCustNum',
  'CadrName',
  'QtyShipped',
  'QtyReturned',
  'Price',
  'PackNum',
  'RecordDate',
  'RowPointer',
];
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_MONTH = 300;
const UPSERT_CHUNK = 500;

export type CsiProgramSettings = {
  programName: string | null;
  servicePrefix: string | null;
  mongooseConfig: string | null;
  site: string | null;
};

/** Service path, Mongoose configuration and site of the company's working CSI sync programs. */
export async function loadWorkingCsiProgramSettings(companyId: string): Promise<CsiProgramSettings> {
  const rows = await prisma.$queryRaw<Array<{ bySystem: unknown; global: unknown }>>`
    SELECT
      "connectionMetadata"->'accountingProgramsBySystem' AS "bySystem",
      "connectionMetadata"->'accountingPrograms' AS "global"
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;
  const bySystem = rows[0]?.bySystem && typeof rows[0].bySystem === 'object' ? (rows[0].bySystem as Record<string, unknown>) : {};
  const programs = [
    ...(Array.isArray(bySystem.INFOR_CSI) ? (bySystem.INFOR_CSI as unknown[]) : []),
    ...(Array.isArray(rows[0]?.global) ? (rows[0].global as unknown[]) : []),
  ].filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const withPath = programs.filter((row) => /\/ido\/load\//i.test(text(row.endpointPath)) && row.enabled !== false);
  const preferred =
    withPath.find((row) => text(row.miProgram).toUpperCase() === 'SLCOITEMS') ||
    withPath.find((row) => text(row.miProgram).toUpperCase() === 'SLCOS') ||
    withPath[0];
  if (!preferred) return { programName: null, servicePrefix: null, mongooseConfig: null, site: null };
  const path = text(preferred.endpointPath);
  return {
    programName: text(preferred.miProgram) || null,
    servicePrefix: path.slice(0, path.search(/\/ido\/load\//i)) || null,
    mongooseConfig: text(preferred.mongooseConfig) || null,
    site: text(preferred.site) || null,
  };
}

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureCsiShipmentTables(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "InforShipmentFact" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "sourceKey" TEXT NOT NULL,
          "orderId" TEXT NOT NULL DEFAULT '',
          "orderLine" TEXT NOT NULL DEFAULT '',
          "orderRelease" TEXT NOT NULL DEFAULT '',
          "dateSeq" TEXT NOT NULL DEFAULT '',
          "shipDate" DATE NOT NULL,
          "customerId" TEXT,
          "customerSeq" TEXT,
          "customerName" TEXT NOT NULL DEFAULT '',
          "itemSku" TEXT NOT NULL DEFAULT '',
          "customerPartNumber" TEXT NOT NULL DEFAULT '',
          "qtyShipped" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "qtyReturned" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "price" DOUBLE PRECISION,
          "packNum" TEXT,
          "recordDate" TIMESTAMP(3),
          "pulledAt" TIMESTAMP(3) NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "InforShipmentFact_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "InforShipmentFact_source_key"
          ON "InforShipmentFact"("companyId", "sourceKey")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "InforShipmentFact_company_shipDate_idx"
          ON "InforShipmentFact"("companyId", "shipDate")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "InforShipmentPullMonth" (
          "companyId" TEXT NOT NULL,
          "monthStart" DATE NOT NULL,
          "rowCount" INTEGER NOT NULL DEFAULT 0,
          "pulledAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "InforShipmentPullMonth_pkey" PRIMARY KEY ("companyId", "monthStart")
        )
      `);
      // Last ship date saved contiguously from the first of the month.
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "InforShipmentPullMonth" ADD COLUMN IF NOT EXISTS "coveredThrough" DATE
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  return ensureTablesOnce;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return value == null ? '' : String(value).trim();
}

function num(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : 0;
}

/** CSI date strings look like '20260628 10:16:51.000'; the calendar date is kept as-is. */
function csiCalendarDate(value: string): string | null {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function csiTimestamp(value: string): Date | null {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]));
}

type ShipmentRow = {
  sourceKey: string;
  orderId: string;
  orderLine: string;
  orderRelease: string;
  dateSeq: string;
  shipDate: string;
  customerId: string | null;
  customerSeq: string | null;
  customerName: string;
  itemSku: string;
  customerPartNumber: string;
  qtyShipped: number;
  qtyReturned: number;
  price: number | null;
  packNum: string | null;
  recordDate: Date | null;
};

function toShipmentRow(record: Record<string, unknown>): ShipmentRow | null {
  const shipDate = csiCalendarDate(text(record, 'ShipDate'));
  if (!shipDate) return null;
  const orderId = text(record, 'CoNum');
  const orderLine = text(record, 'CoLine');
  const orderRelease = text(record, 'CoRelease');
  const dateSeq = text(record, 'DateSeq');
  const rowPointer = text(record, 'RowPointer');
  const sourceKey = rowPointer || [orderId, orderLine, orderRelease, dateSeq, text(record, 'ShipDate')].join('|');
  const priceRaw = record.Price == null || record.Price === '' ? NaN : Number(record.Price);
  return {
    sourceKey,
    orderId,
    orderLine,
    orderRelease,
    dateSeq,
    shipDate,
    customerId: text(record, 'CoCustNum') || text(record, 'HcoCustNum') || null,
    customerSeq: text(record, 'CoCustSeq') || null,
    customerName: text(record, 'CadrName'),
    itemSku: text(record, 'CoiOrCoihItem') || text(record, 'CoiItem'),
    customerPartNumber: text(record, 'CoiCustItem'),
    qtyShipped: num(record, 'QtyShipped'),
    qtyReturned: num(record, 'QtyReturned'),
    price: Number.isFinite(priceRaw) ? priceRaw : null,
    packNum: text(record, 'PackNum') || null,
    recordDate: csiTimestamp(text(record, 'RecordDate')),
  };
}

async function upsertShipments(companyId: string, rows: ShipmentRow[], pulledAt: Date): Promise<void> {
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const values = chunk.map((row) => Prisma.sql`(
      ${randomUUID()}, ${companyId}, ${row.sourceKey}, ${row.orderId}, ${row.orderLine}, ${row.orderRelease},
      ${row.dateSeq}, ${row.shipDate}::date, ${row.customerId}, ${row.customerSeq}, ${row.customerName},
      ${row.itemSku}, ${row.customerPartNumber}, ${row.qtyShipped}, ${row.qtyReturned}, ${row.price},
      ${row.packNum}, ${row.recordDate}, ${pulledAt}, ${pulledAt}, ${pulledAt}
    )`);
    await prisma.$executeRaw`
      INSERT INTO "InforShipmentFact" (
        "id", "companyId", "sourceKey", "orderId", "orderLine", "orderRelease", "dateSeq", "shipDate",
        "customerId", "customerSeq", "customerName", "itemSku", "customerPartNumber", "qtyShipped",
        "qtyReturned", "price", "packNum", "recordDate", "pulledAt", "createdAt", "updatedAt"
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId", "sourceKey") DO UPDATE SET
        "orderId" = EXCLUDED."orderId",
        "orderLine" = EXCLUDED."orderLine",
        "orderRelease" = EXCLUDED."orderRelease",
        "dateSeq" = EXCLUDED."dateSeq",
        "shipDate" = EXCLUDED."shipDate",
        "customerId" = EXCLUDED."customerId",
        "customerSeq" = EXCLUDED."customerSeq",
        "customerName" = EXCLUDED."customerName",
        "itemSku" = EXCLUDED."itemSku",
        "customerPartNumber" = EXCLUDED."customerPartNumber",
        "qtyShipped" = EXCLUDED."qtyShipped",
        "qtyReturned" = EXCLUDED."qtyReturned",
        "price" = EXCLUDED."price",
        "packNum" = EXCLUDED."packNum",
        "recordDate" = EXCLUDED."recordDate",
        "pulledAt" = EXCLUDED."pulledAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  }
}

function monthKey(year: number, monthIndex: number): string {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return date.toISOString().slice(0, 7);
}

function nextMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return monthKey(year, month);
}

type InforRequest = {
  credentials: NonNullable<Awaited<ReturnType<typeof getInforM3CredentialsWithOptionalEnvFallback>>['credentials']>;
  servicePrefix: string;
  headers: Record<string, string>;
};

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

/** Saves every shipment with ShipDate in [start, endExclusive). */
async function pullShipmentRange(
  companyId: string,
  request: InforRequest,
  start: string,
  endExclusive: string,
  pulledAt: Date
): Promise<{ rowCount: number; pages: number }> {
  const query = new URLSearchParams({
    properties: SHIPMENT_PROPERTIES.join(','),
    filter: `(ShipDate >= '${start}' and ShipDate < '${endExclusive}')`,
    recordCap: String(PAGE_SIZE),
    loadtype: 'FIRST',
  });
  const basePath = `${request.servicePrefix}/ido/load/SLCoShips`;
  let bookmark: string | null = null;
  let pages = 0;
  let rowCount = 0;
  while (pages < MAX_PAGES_PER_MONTH) {
    if (bookmark) {
      query.set('loadtype', 'NEXT');
      query.set('bookmark', bookmark);
    }
    const result = await callInforIonApi(request.credentials, `${basePath}?${query.toString()}`, {
      timeoutMs: 60_000,
      headers: request.headers,
      meta: { programId: 'SLCoShips', sourcePath: 'csi-shipment-history-pull' },
    });
    pages += 1;
    const body = result.body && typeof result.body === 'object' ? (result.body as Record<string, unknown>) : {};
    const message = String(body.Message || '').trim();
    if (!result.ok || body.Success === false) {
      throw new Error(`Infor SLCoShips ${start}..${endExclusive} failed: HTTP ${result.status} ${message}`.trim());
    }
    const items = Array.isArray(body.Items) ? (body.Items as Array<Record<string, unknown>>) : [];
    const rows = items.map(toShipmentRow).filter((row): row is ShipmentRow => row !== null);
    await upsertShipments(companyId, rows, pulledAt);
    rowCount += rows.length;
    const more = String(body.MoreRowsExist ?? '').toLowerCase() === 'true';
    bookmark = typeof body.Bookmark === 'string' && body.Bookmark.trim() ? body.Bookmark.trim() : null;
    if (!more || !bookmark || items.length === 0) break;
  }
  if (pages >= MAX_PAGES_PER_MONTH) {
    throw new Error(`Infor SLCoShips ${start}..${endExclusive} exceeded ${MAX_PAGES_PER_MONTH} pages.`);
  }
  return { rowCount, pages };
}

/**
 * Full pull of one month. Removes shipments Infor no longer has in that month
 * and records the month as covered from its first day through `today` (or month end).
 */
async function pullShipmentMonth(
  companyId: string,
  request: InforRequest,
  month: string,
  today: string = formatEstDate()
): Promise<{ rowCount: number; pages: number }> {
  const start = `${month}-01`;
  const endExclusive = `${nextMonthKey(month)}-01`;
  const pulledAt = new Date();
  const result = await pullShipmentRange(companyId, request, start, endExclusive, pulledAt);
  await prisma.$executeRaw`
    DELETE FROM "InforShipmentFact"
    WHERE "companyId" = ${companyId}
      AND "shipDate" >= ${start}::date
      AND "shipDate" < ${endExclusive}::date
      AND "pulledAt" < ${pulledAt}
  `;
  const coveredThrough = minDate(addDays(endExclusive, -1), today);
  await prisma.$executeRaw`
    INSERT INTO "InforShipmentPullMonth" ("companyId", "monthStart", "rowCount", "pulledAt", "coveredThrough")
    VALUES (${companyId}, ${start}::date, ${result.rowCount}, ${pulledAt}, ${coveredThrough}::date)
    ON CONFLICT ("companyId", "monthStart") DO UPDATE SET
      "rowCount" = EXCLUDED."rowCount",
      "pulledAt" = EXCLUDED."pulledAt",
      "coveredThrough" = EXCLUDED."coveredThrough"
  `;
  return result;
}

async function buildInforRequest(companyId: string): Promise<InforRequest | null> {
  const { credentials } = await getInforM3CredentialsWithOptionalEnvFallback(companyId, 'INFOR_CSI');
  if (!credentials) return null;
  const settings = await loadWorkingCsiProgramSettings(companyId);
  if (!settings.servicePrefix) return null;
  const headers: Record<string, string> = {};
  if (settings.mongooseConfig) headers['X-Infor-MongooseConfig'] = settings.mongooseConfig;
  if (settings.site) headers['X-Infor-Site'] = settings.site;
  return { credentials, servicePrefix: settings.servicePrefix, headers };
}

async function loadMonthCoverage(
  companyId: string,
  month: string
): Promise<{ pulledAt: Date; coveredThrough: string | null } | null> {
  const rows = await prisma.$queryRaw<Array<{ pulledAt: Date; coveredThrough: string | null }>>`
    SELECT "pulledAt", "coveredThrough"::text AS "coveredThrough"
    FROM "InforShipmentPullMonth"
    WHERE "companyId" = ${companyId} AND "monthStart" = ${`${month}-01`}::date
  `;
  return rows[0] ?? null;
}

function monthIsFinal(month: string, coverage: { pulledAt: Date; coveredThrough: string | null } | null): boolean {
  if (!coverage?.coveredThrough) return false;
  const monthEnd = addDays(`${nextMonthKey(month)}-01`, -1);
  // Pulled at least 5 hours past UTC midnight after month end, i.e. after the month ended in EST.
  const finalAfter = new Date(`${nextMonthKey(month)}-01T05:00:00Z`);
  return coverage.coveredThrough >= monthEnd && coverage.pulledAt >= finalAfter;
}

const NIGHTLY_WINDOW_DAYS = 3;
const FINALIZE_PREVIOUS_MONTH_THROUGH_DAY = 3;

export type NightlyShipmentSyncResult = {
  ok: boolean;
  skipped?: string;
  previousMonth?: { month: string; rows: number } | null;
  currentMonth?: { month: string; mode: 'window' | 'full'; rows: number };
  error?: string;
};

/**
 * Nightly SLCoShips step. Saves the last three days of shipments; re-pulls all
 * of last month during the first days of a month (or until it is final), and
 * re-pulls the current month in full whenever its coverage has a gap.
 */
export async function runNightlyCsiShipmentSync(companyId: string): Promise<NightlyShipmentSyncResult> {
  try {
    const request = await buildInforRequest(companyId);
    if (!request) return { ok: true, skipped: 'no CSI connection' };
    await ensureCsiShipmentTables();
    const today = formatEstDate();
    const currentMonth = today.slice(0, 7);
    const [year, monthNumber] = currentMonth.split('-').map(Number);
    const previousMonth = monthKey(year, monthNumber - 2);

    let previous: NightlyShipmentSyncResult['previousMonth'] = null;
    const previousCoverage = await loadMonthCoverage(companyId, previousMonth);
    if (Number(today.slice(8, 10)) <= FINALIZE_PREVIOUS_MONTH_THROUGH_DAY || !monthIsFinal(previousMonth, previousCoverage)) {
      const result = await pullShipmentMonth(companyId, request, previousMonth, today);
      previous = { month: previousMonth, rows: result.rowCount };
    }

    const windowStart = addDays(today, -NIGHTLY_WINDOW_DAYS);
    const coverage = await loadMonthCoverage(companyId, currentMonth);
    const contiguous =
      coverage?.coveredThrough != null && coverage.coveredThrough >= addDays(windowStart, -1);
    if (!contiguous || windowStart < `${currentMonth}-01`) {
      const result = await pullShipmentMonth(companyId, request, currentMonth, today);
      return { ok: true, previousMonth: previous, currentMonth: { month: currentMonth, mode: 'full', rows: result.rowCount } };
    }
    const pulledAt = new Date();
    const result = await pullShipmentRange(companyId, request, windowStart, addDays(today, 1), pulledAt);
    await prisma.$executeRaw`
      UPDATE "InforShipmentPullMonth"
      SET "coveredThrough" = GREATEST("coveredThrough", ${today}::date),
          "pulledAt" = ${pulledAt}
      WHERE "companyId" = ${companyId} AND "monthStart" = ${`${currentMonth}-01`}::date
    `;
    return { ok: true, previousMonth: previous, currentMonth: { month: currentMonth, mode: 'window', rows: result.rowCount } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type ShipmentHistoryPullResult = {
  ok: boolean;
  months: Array<{ month: string; rows: number; pages: number }>;
  nextMonth: string | null;
  error: string | null;
};

/**
 * Pulls SLCoShips month by month from `fromMonth` (YYYY-MM) through `throughMonth`,
 * stopping when the time budget is spent. `nextMonth` is where to resume.
 */
export async function pullCsiShipmentHistory(params: {
  companyId: string;
  fromMonth: string;
  throughMonth: string;
  budgetMs: number;
}): Promise<ShipmentHistoryPullResult> {
  await ensureCsiShipmentTables();
  const request = await buildInforRequest(params.companyId);
  if (!request) {
    return { ok: false, months: [], nextMonth: params.fromMonth, error: 'Infor CSI credentials or sync programs are unavailable.' };
  }
  const startedAt = Date.now();
  const months: ShipmentHistoryPullResult['months'] = [];
  let month = params.fromMonth;
  while (month <= params.throughMonth) {
    if (Date.now() - startedAt > params.budgetMs) {
      return { ok: true, months, nextMonth: month, error: null };
    }
    try {
      const result = await pullShipmentMonth(params.companyId, request, month);
      months.push({ month, rows: result.rowCount, pages: result.pages });
    } catch (error) {
      return { ok: false, months, nextMonth: month, error: error instanceof Error ? error.message : String(error) };
    }
    month = nextMonthKey(month);
  }
  return { ok: true, months, nextMonth: null, error: null };
}

export type CsiShipmentMonthlyActuals = {
  /**
   * Months (1-12) of `year` whose shipments are used: months pulled in full after
   * they ended, plus the current EST month (month to date) once it has coverage.
   */
  months: Set<number>;
  /** Latest ship date covered by those months, YYYY-MM-DD. */
  coveredThrough: string | null;
  byExact: Map<string, MonthQtyMap>;
  byItem: Map<string, MonthQtyMap>;
};

function addQty(map: Map<string, MonthQtyMap>, key: string, month: number, qty: number) {
  if (!key || month < 1 || month > 12 || !Number.isFinite(qty) || qty === 0) return;
  const current = map.get(key) || emptyMonthQtyMap();
  current[String(month)] = (Number(current[String(month)]) || 0) + qty;
  map.set(key, current);
}

function customerFilterSql(customerId?: string, customerName?: string): Prisma.Sql {
  const id = String(customerId || '').trim();
  const name = String(customerName || '').trim();
  const idMatch = id
    ? Prisma.sql`COALESCE(NULLIF(LTRIM(TRIM(COALESCE("customerId", '')), '0'), ''), '0') = ${id.replace(/^0+/, '') || '0'}`
    : null;
  const nameMatch = name ? Prisma.sql`UPPER(TRIM("customerName")) = UPPER(${name})` : null;
  if (idMatch && nameMatch) return Prisma.sql`(${idMatch} OR ${nameMatch})`;
  return idMatch || nameMatch || Prisma.sql`TRUE`;
}

/** Monthly shipped units for `year` from pulled SLCoShips, keyed like the other Infor actuals. */
export async function loadCsiShipmentMonthlyActuals(params: {
  companyId: string;
  year: number;
  customerId?: string;
  customerName?: string;
}): Promise<CsiShipmentMonthlyActuals> {
  const empty: CsiShipmentMonthlyActuals = { months: new Set(), coveredThrough: null, byExact: new Map(), byItem: new Map() };
  try {
    await ensureCsiShipmentTables();
    const pulls = await prisma.$queryRaw<Array<{ monthStart: string; pulledAt: Date; coveredThrough: string | null }>>`
      SELECT "monthStart"::text AS "monthStart", "pulledAt", "coveredThrough"::text AS "coveredThrough"
      FROM "InforShipmentPullMonth"
      WHERE "companyId" = ${params.companyId}
        AND EXTRACT(YEAR FROM "monthStart")::int = ${params.year}
    `;
    const currentMonth = formatEstDate().slice(0, 7);
    const usable = pulls.filter((pull) => {
      const month = pull.monthStart.slice(0, 7);
      if (month === currentMonth) return pull.coveredThrough != null;
      return monthIsFinal(month, pull);
    });
    if (usable.length === 0) return empty;
    const months = new Set(usable.map((pull) => Number(pull.monthStart.slice(5, 7))));
    const start = `${params.year}-01-01`;
    const end = `${params.year + 1}-01-01`;
    const rows = await prisma.$queryRaw<Array<{
      customerId: string | null;
      itemSku: string | null;
      customerPn: string | null;
      month: number;
      qty: number | null;
    }>>(Prisma.sql`
      SELECT "customerId", "itemSku", "customerPartNumber" AS "customerPn",
             EXTRACT(MONTH FROM "shipDate")::int AS month,
             SUM("qtyShipped")::double precision AS qty
      FROM "InforShipmentFact"
      WHERE "companyId" = ${params.companyId}
        AND "shipDate" >= ${start}::date
        AND "shipDate" < ${end}::date
        AND ${customerFilterSql(params.customerId, params.customerName)}
      GROUP BY 1, 2, 3, 4
    `);
    const byExact = new Map<string, MonthQtyMap>();
    const byItem = new Map<string, MonthQtyMap>();
    for (const row of rows) {
      const month = Number(row.month);
      if (!months.has(month)) continue;
      const qty = Number(row.qty || 0);
      const customerId = String(row.customerId || '');
      const itemSku = String(row.itemSku || '');
      addQty(byExact, forecastActualsExactKey(customerId, itemSku, String(row.customerPn || '')), month, qty);
      addQty(byItem, forecastActualsItemKey(customerId, itemSku), month, qty);
    }
    const coveredThrough = usable
      .map((pull) => pull.coveredThrough)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;
    return { months, coveredThrough, byExact, byItem };
  } catch (error) {
    // The tables are created on the first pull; before that there is nothing to read.
    if (/InforShipment\w+" does not exist/i.test(error instanceof Error ? error.message : String(error))) return empty;
    console.error('[csi-shipments] monthly actuals failed', error);
    return empty;
  }
}

/** Cache fingerprint for report caches that include shipment actuals. */
export async function loadCsiShipmentFingerprint(companyId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ pulledAt: Date | null }>>`
      SELECT MAX("pulledAt") AS "pulledAt" FROM "InforShipmentPullMonth" WHERE "companyId" = ${companyId}
    `;
    return rows[0]?.pulledAt ? rows[0].pulledAt.toISOString() : null;
  } catch {
    return null;
  }
}
