import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  htsQuoteIdentityKey,
  loadHtsQuotesByIdentity,
  pickQuoteForEventDate,
} from '@/lib/hts/dated-quotes';
import { normalizeHtsCode, normalizeItemSku, ensureCompanyItemDutyTable, type TradeProgram } from '@/lib/hts/item-duty-overlay';
import type { HtsRateQuoteRow } from '@/lib/hts/rate-quotes';
import { utcMidnightForEstDate } from '@/lib/time/eastern';

export const COGS_DUTIES_KEY = 'cogs_duties';
export const COGS_TARIFFS_KEY = 'cogs_tariffs';
const COGS_DONOR_KEYS = [
  'cogs_raw_materials_and_components',
  'cogs_product_cost',
  'cogs_materials',
];

export type MonthlyHtsDutyCogs = {
  monthKey: string;
  dutyAmount: number;
  tariffAmount: number;
  quantity: number;
  skuCount: number;
};

export type RebuildDutyApplicationsResult = {
  frequency: string | null;
  rows: number;
  dutyAmount: number;
  tariffAmount: number;
};

export type HtsDutyLineAmounts = {
  dutyRatePct: number | null;
  tariffRatePct: number | null;
  dutyPerPiece: number | null;
  tariffPerPiece: number | null;
  quoteAsOfDate: string | null;
  rateSource: 'hts' | 'overlay' | null;
};

type OverlayRateRow = {
  itemSku: string;
  htsCode: string | null;
  countryOfOrigin: string | null;
  tradeProgram: string | null;
  enteredValuePerPiece: number | null;
  dutyRatePct: number | null;
  specialRatePct: number | null;
  tariffRatePct: number | null;
  lastRateAsOfDate: Date | string | null;
};

type SalesQtyRow = {
  sku: string | null;
  eventDate: Date | string;
  qty: number | string | null;
};

let ensureOnce: Promise<void> | null = null;

export async function ensureCompanyItemDutyApplicationTable(): Promise<void> {
  if (!ensureOnce) {
    ensureOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyItemDutyApplication" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "itemSku" TEXT NOT NULL,
          "eventDate" TIMESTAMP(3) NOT NULL,
          "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "enteredValuePerPiece" DOUBLE PRECISION,
          "dutyRatePct" DOUBLE PRECISION,
          "tariffRatePct" DOUBLE PRECISION,
          "dutyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "tariffAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "quoteAsOfDate" TIMESTAMP(3),
          "rateSource" TEXT NOT NULL DEFAULT 'hts',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyItemDutyApplication_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CompanyItemDutyApplication_companyId_itemSku_eventDate_key"
          ON "CompanyItemDutyApplication"("companyId", "itemSku", "eventDate")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CompanyItemDutyApplication_companyId_eventDate_idx"
          ON "CompanyItemDutyApplication"("companyId", "eventDate")
      `);
    })().catch((error) => {
      ensureOnce = null;
      throw error;
    });
  }
  await ensureOnce;
}

function asYmd(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const ymd = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
  }
  if (!Number.isFinite(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function skuKey(value: unknown): string {
  return normalizeItemSku(value).toUpperCase();
}

function asTradeProgram(value: unknown): TradeProgram {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'usmca' || raw === 'cusma' || raw === 'nafta') return 'usmca';
  if (raw === 'other') return 'other';
  return 'none';
}

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function originKey(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function money(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function dutyRatePctForProgram(
  rates: { dutyRatePct?: number | null; specialRatePct?: number | null },
  tradeProgram: TradeProgram
): number | null {
  const pct = tradeProgram === 'usmca' ? rates.specialRatePct : rates.dutyRatePct;
  return asFiniteNumber(pct);
}

function amountsFromRates(params: {
  enteredValuePerPiece: number | null;
  dutyRatePct: number | null;
  tariffRatePct: number | null;
  quoteAsOfDate: string | null;
  rateSource: 'hts' | 'overlay';
}): HtsDutyLineAmounts | null {
  const dutyPerPiece =
    params.enteredValuePerPiece == null || params.dutyRatePct == null
      ? null
      : money((params.enteredValuePerPiece * params.dutyRatePct) / 100);
  const tariffPerPiece =
    params.enteredValuePerPiece == null || params.tariffRatePct == null
      ? null
      : money((params.enteredValuePerPiece * params.tariffRatePct) / 100);
  if (dutyPerPiece == null && tariffPerPiece == null) return null;
  return {
    dutyRatePct: params.dutyRatePct,
    tariffRatePct: params.tariffRatePct,
    dutyPerPiece,
    tariffPerPiece,
    quoteAsOfDate: params.quoteAsOfDate,
    rateSource: params.rateSource,
  };
}

function amountsForOverlay(
  overlay: OverlayRateRow,
  quotesByIdentity: Map<string, HtsRateQuoteRow[]>,
  eventDate: string | null
): HtsDutyLineAmounts | null {
  const htsCode = normalizeHtsCode(overlay.htsCode);
  const tradeProgram = asTradeProgram(overlay.tradeProgram);
  const enteredValuePerPiece = asFiniteNumber(overlay.enteredValuePerPiece);
  const lastRateAsOfDate = asYmd(overlay.lastRateAsOfDate);
  const lookupDate = eventDate || lastRateAsOfDate;

  if (htsCode) {
    const quotes =
      quotesByIdentity.get(htsQuoteIdentityKey(htsCode, originKey(overlay.countryOfOrigin), tradeProgram)) || [];
    const quote = pickQuoteForEventDate(quotes, lookupDate);
    if (quote) {
      return amountsFromRates({
        enteredValuePerPiece,
        dutyRatePct: dutyRatePctForProgram(quote, tradeProgram),
        tariffRatePct: asFiniteNumber(quote.tariffRatePct),
        quoteAsOfDate: quote.asOfDate,
        rateSource: 'hts',
      });
    }
  }

  if (lastRateAsOfDate) {
    return amountsFromRates({
      enteredValuePerPiece,
      dutyRatePct: dutyRatePctForProgram(overlay, tradeProgram),
      tariffRatePct: asFiniteNumber(overlay.tariffRatePct),
      quoteAsOfDate: lastRateAsOfDate,
      rateSource: 'overlay',
    });
  }
  return null;
}

async function loadOverlayRows(companyId: string): Promise<OverlayRateRow[]> {
  return prisma.$queryRaw<OverlayRateRow[]>`
    SELECT
      "itemSku", "htsCode", "countryOfOrigin", "tradeProgram", "enteredValuePerPiece",
      "dutyRatePct", "specialRatePct", "tariffRatePct", "lastRateAsOfDate"
    FROM "CompanyItemDuty"
    WHERE "companyId" = ${companyId}
      AND (
        COALESCE(NULLIF("htsCode", ''), '') <> ''
        OR "dutyRatePct" IS NOT NULL
        OR "specialRatePct" IS NOT NULL
        OR "tariffRatePct" IS NOT NULL
      )
  `;
}

export async function createHtsDutyApplicator(companyId: string): Promise<{
  attach: <T extends Record<string, unknown>>(records: T[]) => T[];
}> {
  await ensureCompanyItemDutyTable();
  await ensureCompanyItemDutyApplicationTable();
  const overlays = await loadOverlayRows(companyId);
  const overlayBySku = new Map<string, OverlayRateRow>();
  for (const overlay of overlays) {
    const key = skuKey(overlay.itemSku);
    if (key && !overlayBySku.has(key)) overlayBySku.set(key, overlay);
  }
  const quotesByIdentity = await loadHtsQuotesByIdentity(
    overlays.map((row) => normalizeHtsCode(row.htsCode) || '').filter(Boolean)
  );

  return {
    attach<T extends Record<string, unknown>>(records: T[]): T[] {
      if (!records.length || !overlayBySku.size) return records;
      return records.map((record) => {
        const overlay =
          overlayBySku.get(skuKey(record.sku)) ||
          overlayBySku.get(skuKey(record.itemId)) ||
          overlayBySku.get(skuKey(record.itemName)) ||
          overlayBySku.get(skuKey(record.item));
        if (!overlay) return record;
        const eventDate =
          asYmd(record.orderDate as Date | string | null | undefined) ||
          asYmd(record.shipDate as Date | string | null | undefined) ||
          asYmd(record.snapshotDate as Date | string | null | undefined) ||
          asYmd(record.date as Date | string | null | undefined);
        const amounts = amountsForOverlay(overlay, quotesByIdentity, eventDate);
        if (!amounts) return record;
        return {
          ...record,
          ...(amounts.dutyPerPiece != null ? { currentImpactOfDutiesPerPiece: amounts.dutyPerPiece } : {}),
          ...(amounts.tariffPerPiece != null ? { currentImpactOfTariffPerPiece: amounts.tariffPerPiece } : {}),
          htsDutyPerPiece: amounts.dutyPerPiece,
          htsTariffPerPiece: amounts.tariffPerPiece,
          htsQuoteAsOfDate: amounts.quoteAsOfDate,
          htsRateSource: amounts.rateSource,
        };
      });
    },
  };
}

async function loadDutyActivityRows(companyId: string): Promise<{ frequency: string | null; rows: SalesQtyRow[] }> {
  const orderRows = await prisma
    .$queryRaw<SalesQtyRow[]>`
      SELECT
        COALESCE(NULLIF("sku", ''), NULLIF("itemId", ''), "itemName") AS sku,
        to_char(COALESCE("orderDate", "snapshotDate"), 'YYYY-MM-DD') AS "eventDate",
        SUM("qtyInvoiced") AS qty
      FROM (
        SELECT DISTINCT ON ("orderId", "lineId")
          "sku", "itemId", "itemName", "qtyInvoiced", "orderDate", "snapshotDate"
        FROM "CustomerOrderLineSnapshot"
        WHERE "companyId" = ${companyId}
        ORDER BY "orderId", "lineId", "snapshotDate" DESC
      ) latest
      WHERE COALESCE("qtyInvoiced", 0) <> 0
        AND COALESCE(NULLIF("sku", ''), NULLIF("itemId", ''), "itemName") IS NOT NULL
      GROUP BY 1, 2
    `
    .catch(() => []);
  if (orderRows.length) return { frequency: 'order-lines', rows: orderRows };

  const frequency = await pickSalesFrequency(companyId);
  if (!frequency) return { frequency: null, rows: [] };

  const sales = await prisma.$queryRaw<SalesQtyRow[]>`
    SELECT sku, "eventDate", qty
    FROM (
      SELECT DISTINCT ON (COALESCE(NULLIF("sku", ''), "itemName"), to_char("snapshotDate", 'YYYY-MM'))
        COALESCE(NULLIF("sku", ''), "itemName") AS sku,
        to_char("snapshotDate", 'YYYY-MM-DD') AS "eventDate",
        "quantitySold" AS qty
      FROM "ProductSalesSnapshot"
      WHERE "companyId" = ${companyId}
        AND "frequency" = ${frequency}
      ORDER BY COALESCE(NULLIF("sku", ''), "itemName"), to_char("snapshotDate", 'YYYY-MM'), "snapshotDate" DESC
    ) latest
    WHERE COALESCE(qty, 0) <> 0
  `;
  return { frequency, rows: sales };
}

async function pickSalesFrequency(companyId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ frequency: string; n: number }>>`
    SELECT "frequency", COUNT(*)::int AS n
    FROM "ProductSalesSnapshot"
    WHERE "companyId" = ${companyId}
    GROUP BY "frequency"
    ORDER BY
      CASE WHEN "frequency" = 'daily' THEN 0 WHEN "frequency" = 'monthly' THEN 1 ELSE 2 END,
      n DESC
    LIMIT 1
  `;
  return rows[0]?.frequency || null;
}

export async function rebuildCompanyItemDutyApplications(
  companyId: string
): Promise<RebuildDutyApplicationsResult> {
  await ensureCompanyItemDutyTable();
  await ensureCompanyItemDutyApplicationTable();
  const overlays = await loadOverlayRows(companyId);
  if (!overlays.length) {
    await prisma.$executeRaw`DELETE FROM "CompanyItemDutyApplication" WHERE "companyId" = ${companyId}`;
    return { frequency: null, rows: 0, dutyAmount: 0, tariffAmount: 0 };
  }

  const overlayBySku = new Map<string, OverlayRateRow>();
  for (const overlay of overlays) {
    const key = skuKey(overlay.itemSku);
    if (key) overlayBySku.set(key, overlay);
  }
  const quotesByIdentity = await loadHtsQuotesByIdentity(
    overlays.map((row) => normalizeHtsCode(row.htsCode) || '').filter(Boolean)
  );
  const activity = await loadDutyActivityRows(companyId);
  if (!activity.rows.length) {
    await prisma.$executeRaw`DELETE FROM "CompanyItemDutyApplication" WHERE "companyId" = ${companyId}`;
    return { frequency: activity.frequency, rows: 0, dutyAmount: 0, tariffAmount: 0 };
  }

  const sales = activity.rows;

  type ApplicationRow = {
    itemSku: string;
    eventDate: Date;
    quantity: number;
    enteredValuePerPiece: number | null;
    dutyRatePct: number | null;
    tariffRatePct: number | null;
    dutyAmount: number;
    tariffAmount: number;
    quoteAsOfDate: Date | null;
    rateSource: string;
  };
  const applications: ApplicationRow[] = [];
  let dutyTotal = 0;
  let tariffTotal = 0;

  for (const sale of sales) {
    const overlay = overlayBySku.get(skuKey(sale.sku));
    if (!overlay) continue;
    const eventYmd = asYmd(sale.eventDate);
    if (!eventYmd) continue;
    const amounts = amountsForOverlay(overlay, quotesByIdentity, eventYmd);
    if (!amounts) continue;
    const quantity = asFiniteNumber(sale.qty) || 0;
    const dutyAmount = amounts.dutyPerPiece == null ? 0 : money(amounts.dutyPerPiece * quantity);
    const tariffAmount = amounts.tariffPerPiece == null ? 0 : money(amounts.tariffPerPiece * quantity);
    if (dutyAmount === 0 && tariffAmount === 0) continue;
    dutyTotal += dutyAmount;
    tariffTotal += tariffAmount;
    applications.push({
      itemSku: overlay.itemSku,
      eventDate: utcMidnightForEstDate(eventYmd),
      quantity,
      enteredValuePerPiece: asFiniteNumber(overlay.enteredValuePerPiece),
      dutyRatePct: amounts.dutyRatePct,
      tariffRatePct: amounts.tariffRatePct,
      dutyAmount,
      tariffAmount,
      quoteAsOfDate: amounts.quoteAsOfDate ? utcMidnightForEstDate(amounts.quoteAsOfDate) : null,
      rateSource: amounts.rateSource || 'hts',
    });
  }

  await prisma.$executeRaw`DELETE FROM "CompanyItemDutyApplication" WHERE "companyId" = ${companyId}`;
  const chunkSize = 200;
  for (let index = 0; index < applications.length; index += chunkSize) {
    const chunk = applications.slice(index, index + chunkSize);
    const values = chunk.map(
      (row) => Prisma.sql`(
        ${randomUUID()},
        ${companyId},
        ${row.itemSku},
        ${row.eventDate},
        ${row.quantity},
        ${row.enteredValuePerPiece},
        ${row.dutyRatePct},
        ${row.tariffRatePct},
        ${row.dutyAmount},
        ${row.tariffAmount},
        ${row.quoteAsOfDate},
        ${row.rateSource},
        NOW(),
        NOW()
      )`
    );
    await prisma.$executeRaw`
      INSERT INTO "CompanyItemDutyApplication" (
        "id", "companyId", "itemSku", "eventDate", "quantity", "enteredValuePerPiece",
        "dutyRatePct", "tariffRatePct", "dutyAmount", "tariffAmount", "quoteAsOfDate",
        "rateSource", "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
    `;
  }

  return {
    frequency: activity.frequency,
    rows: applications.length,
    dutyAmount: money(dutyTotal),
    tariffAmount: money(tariffTotal),
  };
}

export async function loadMonthlyHtsDutyCogs(companyId: string): Promise<Map<string, MonthlyHtsDutyCogs>> {
  await ensureCompanyItemDutyApplicationTable();
  const rows = await prisma.$queryRaw<
    Array<{
      monthKey: string;
      dutyAmount: number | string | null;
      tariffAmount: number | string | null;
      quantity: number | string | null;
      skuCount: number | string | null;
    }>
  >`
    SELECT
      to_char("eventDate" AT TIME ZONE 'UTC', 'YYYY-MM') AS "monthKey",
      SUM("dutyAmount") AS "dutyAmount",
      SUM("tariffAmount") AS "tariffAmount",
      SUM("quantity") AS quantity,
      COUNT(DISTINCT "itemSku") AS "skuCount"
    FROM "CompanyItemDutyApplication"
    WHERE "companyId" = ${companyId}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const byMonth = new Map<string, MonthlyHtsDutyCogs>();
  for (const row of rows) {
    const monthKey = String(row.monthKey || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    byMonth.set(monthKey, {
      monthKey,
      dutyAmount: Number(row.dutyAmount || 0),
      tariffAmount: Number(row.tariffAmount || 0),
      quantity: Number(row.quantity || 0),
      skuCount: Number(row.skuCount || 0),
    });
  }
  return byMonth;
}

function hasGlAmount(breakdown: Record<string, unknown>, key: string): boolean {
  return Math.abs(Number(breakdown[key] || 0)) > 0.005;
}

export function overlayHtsDutyCogs(
  breakdown: Record<string, unknown> | null | undefined,
  monthly: MonthlyHtsDutyCogs | null | undefined
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(breakdown && typeof breakdown === 'object' ? breakdown : {}) };
  if (!monthly) return next;
  const addDuty = hasGlAmount(next, COGS_DUTIES_KEY) ? 0 : Math.max(0, Number(monthly.dutyAmount || 0));
  const addTariff = hasGlAmount(next, COGS_TARIFFS_KEY) ? 0 : Math.max(0, Number(monthly.tariffAmount || 0));
  const addTotal = addDuty + addTariff;
  if (addTotal <= 0) return next;

  const donorKey = COGS_DONOR_KEYS.find((key) => Number(next[key] || 0) > 0);
  if (!donorKey) return next;

  let remaining = Number(next[donorKey] || 0);
  if (addDuty > 0) {
    const take = Math.min(remaining, addDuty);
    next[COGS_DUTIES_KEY] = money(take);
    remaining -= take;
  }
  if (addTariff > 0) {
    const take = Math.min(remaining, addTariff);
    next[COGS_TARIFFS_KEY] = money(take);
    remaining -= take;
  }
  next[donorKey] = money(remaining);
  return next;
}
