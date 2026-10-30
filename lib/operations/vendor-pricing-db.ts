import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { normalizeItemSku } from '@/lib/hts/item-duty-overlay';
import { loadCsiItemFacts } from '@/lib/operations/item-freight-overlay';
import {
  ensureVendorMonthlyForecastTables,
  loadPrimaryVendorByItem,
} from '@/lib/operations/vendor-monthly-forecast-db';
import {
  VENDOR_PRICING_APPROVAL_STATUSES,
  VENDOR_PRICING_DATE_FIELDS,
  VENDOR_PRICING_EDIT_FIELDS,
  VENDOR_PRICING_MTO_OPTIONS,
  VENDOR_PRICING_NUMBER_FIELDS,
  emptyVendorPricingEdits,
  partWeightKgFromInfor,
  pickCurrentVendorContract,
  type VendorPricingEdits,
  type VendorPricingRow,
} from '@/lib/operations/vendor-pricing';
import { formatEstDate } from '@/lib/time/eastern';

let ensureTableOnce: Promise<void> | null = null;

export async function ensureVendorPricingTable(): Promise<void> {
  if (!ensureTableOnce) {
    ensureTableOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "VendorPricingLine" (
          "companyId" TEXT NOT NULL,
          "itemSku" TEXT NOT NULL,
          "vendorId" TEXT NOT NULL,
          "subsupplier" TEXT,
          "mtoOverride" TEXT,
          "newCost" DOUBLE PRECISION,
          "approvalStatus" TEXT,
          "material" TEXT,
          "currentMaterialCost" DOUBLE PRECISION,
          "newMaterialCost" DOUBLE PRECISION,
          "partWeightKgOverride" DOUBLE PRECISION,
          "startDate" DATE,
          "endDate" DATE,
          "requiredLoadDate" DATE,
          "updatedBy" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "VendorPricingLine_pkey" PRIMARY KEY ("companyId", "itemSku", "vendorId")
        )
      `);
    })().catch((error) => {
      ensureTableOnce = null;
      throw error;
    });
  }
  await ensureTableOnce;
}

function itemKey(value: unknown): string {
  return normalizeItemSku(value).toUpperCase();
}

function pairKey(itemSku: string, vendorId: string): string {
  return `${itemKey(itemSku)}||${String(vendorId || '').trim().toUpperCase()}`;
}

function payloadText(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const text = String(payload[key] ?? '').trim();
    if (text) return text;
  }
  return '';
}

function payloadNumber(payload: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (value == null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function dateTokenToIso(value: unknown): string | null {
  const match = String(value ?? '').replace(/\s+/g, '').match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export type CurrentVendorContract = {
  itemSku: string;
  vendorId: string;
  vendorName: string;
  effectiveDate: string | null;
  contractCost: number | null;
};

/** Contract price in effect today (EST) per item/vendor, from Infor SLItemVendPrices. */
export async function loadCurrentVendorContracts(companyId: string): Promise<Map<string, CurrentVendorContract>> {
  const result = new Map<string, CurrentVendorContract>();
  // Price feeds are deltas over the newest full load.
  const fullLoads = await prisma.$queryRaw<Array<{ businessDate: Date }>>(Prisma.sql`
    SELECT "businessDate"
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND "platform" IN ('INFOR_M3', 'INFOR_CSI')
      AND "miProgram" = 'SLItemVendPrices'
      AND "businessDate" IS NOT NULL
    GROUP BY "businessDate"
    HAVING COUNT(*) >= 100
    ORDER BY "businessDate" DESC
    LIMIT 1
  `).catch(() => []);
  const baseline = fullLoads[0]?.businessDate;
  if (!baseline) return result;

  const rawRows = await prisma.inforRawRecord.findMany({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      miProgram: 'SLItemVendPrices',
      businessDate: { gte: baseline },
    },
    select: { payload: true },
    orderBy: [{ businessDate: 'asc' }, { fetchedAt: 'asc' }, { createdAt: 'asc' }],
    take: 50000,
  });

  type PriceRow = CurrentVendorContract & { status: string };
  const latestByRow = new Map<string, PriceRow>();
  for (const raw of rawRows) {
    const payload = raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
      ? (raw.payload as Record<string, unknown>)
      : null;
    if (!payload) continue;
    const itemSku = payloadText(payload, 'Item', '_ItemId');
    const vendorId = payloadText(payload, 'VendNum');
    if (!itemSku || !vendorId) continue;
    const effectDate = payloadText(payload, 'EffectDate', 'RecordDate');
    const rowKey = payloadText(payload, 'RowPointer') || `${pairKey(itemSku, vendorId)}||${effectDate}`;
    latestByRow.set(rowKey, {
      itemSku,
      vendorId,
      vendorName: payloadText(payload, 'VendAddrName', 'VendaddrName'),
      effectiveDate: dateTokenToIso(effectDate),
      contractCost: payloadNumber(payload, 'BrkCostConv_1', 'BrkCost_1'),
      status: payloadText(payload, 'Stat'),
    });
  }

  const groups = new Map<string, PriceRow[]>();
  for (const row of latestByRow.values()) {
    const key = pairKey(row.itemSku, row.vendorId);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const today = formatEstDate();
  for (const [key, group] of groups) {
    const { current } = pickCurrentVendorContract(group, today);
    const { status: _status, ...contract } = current;
    result.set(key, contract);
  }
  return result;
}

type ForecastFacts = { qty: number; mto: string | null };

/** Monthly Forecast totals for the year, keyed by upper-cased, trimmed item SKU. */
export async function loadForecastFactsByItem(companyId: string, year: number): Promise<Map<string, ForecastFacts>> {
  const result = new Map<string, ForecastFacts>();
  try {
    await ensureVendorMonthlyForecastTables();
    const rows = await prisma.$queryRaw<Array<{ itemSku: string; qty: number | null; hasMto: boolean; hasPlanned: boolean }>>`
      SELECT UPPER(TRIM(l."itemSku")) AS "itemSku",
             SUM(COALESCE((
               SELECT SUM(CASE WHEN m.value ~ '^-?[0-9.]+$' THEN m.value::float8 ELSE 0 END)
               FROM jsonb_each_text(l."forecastQty") m
             ), 0))::float8 AS "qty",
             BOOL_OR(l."productionType" = 'MTO') AS "hasMto",
             BOOL_OR(l."productionType" = 'Planned') AS "hasPlanned"
      FROM "VendorMonthlyForecastLine" l
      WHERE l."companyId" = ${companyId} AND l."year" = ${year}
      GROUP BY UPPER(TRIM(l."itemSku"))
    `;
    for (const row of rows) {
      result.set(row.itemSku, {
        qty: Number(row.qty) || 0,
        mto: row.hasMto ? 'Y' : row.hasPlanned ? 'N' : null,
      });
    }
  } catch (error) {
    console.warn('Vendor pricing: monthly forecast unavailable', error);
  }
  return result;
}

type StoredEditRow = Omit<VendorPricingEdits, 'startDate' | 'endDate' | 'requiredLoadDate'> & {
  itemSku: string;
  vendorId: string;
  startDate: Date | null;
  endDate: Date | null;
  requiredLoadDate: Date | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

async function loadStoredEdits(companyId: string): Promise<Map<string, StoredEditRow>> {
  await ensureVendorPricingTable();
  const rows = await prisma.$queryRaw<StoredEditRow[]>`
    SELECT "itemSku", "vendorId", "subsupplier", "mtoOverride", "newCost", "approvalStatus", "material",
           "currentMaterialCost", "newMaterialCost", "partWeightKgOverride", "startDate", "endDate",
           "requiredLoadDate", "updatedAt", "updatedBy"
    FROM "VendorPricingLine"
    WHERE "companyId" = ${companyId}
  `;
  return new Map(rows.map((row) => [pairKey(row.itemSku, row.vendorId), row]));
}

function isoDay(value: Date | null): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : null;
}

/** One row per Infor item with its primary (rank 1) vendor. */
export async function listVendorPricingRows(companyId: string, forecastYear: number): Promise<VendorPricingRow[]> {
  const [primaryVendors, contracts, itemFacts, forecast, edits] = await Promise.all([
    loadPrimaryVendorByItem(companyId),
    loadCurrentVendorContracts(companyId),
    loadCsiItemFacts(companyId).catch(() => new Map()),
    loadForecastFactsByItem(companyId, forecastYear),
    loadStoredEdits(companyId),
  ]);

  const rows: VendorPricingRow[] = [];
  for (const [item, vendor] of primaryVendors) {
    const key = pairKey(item, vendor.vendorId);
    const contract = contracts.get(key);
    const facts = itemFacts.get(item);
    const itemForecast = forecast.get(item);
    const stored = edits.get(key);
    const base = emptyVendorPricingEdits();
    if (stored) {
      for (const field of VENDOR_PRICING_EDIT_FIELDS) {
        const value = stored[field as keyof StoredEditRow];
        (base as Record<string, unknown>)[field] = VENDOR_PRICING_DATE_FIELDS.has(field)
          ? isoDay(value as Date | null)
          : value ?? null;
      }
    }
    rows.push({
      ...base,
      itemSku: contract?.itemSku || item,
      vendorId: vendor.vendorId,
      vendorName: contract?.vendorName || vendor.vendorName,
      currentCost: contract?.contractCost ?? null,
      currentCostEffectiveDate: contract?.effectiveDate ?? null,
      forecastQty: itemForecast ? itemForecast.qty : null,
      inforMto: itemForecast?.mto ?? null,
      inforPartWeightKg: partWeightKgFromInfor(facts?.unitWeight, facts?.orderMultiple),
      updatedAt: stored?.updatedAt ? stored.updatedAt.toISOString() : null,
      updatedBy: stored?.updatedBy ?? null,
    });
  }
  return rows.sort((a, b) =>
    a.itemSku.localeCompare(b.itemSku, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export type VendorPricingPatch = Partial<VendorPricingEdits> & { itemSku: string; vendorId: string };

function cleanText(value: unknown, maxLength = 200): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return text || null;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function cleanDate(value: unknown): string | null {
  const text = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function sanitizeVendorPricingPatch(raw: Record<string, unknown>): VendorPricingPatch | null {
  const itemSku = itemKey(raw.itemSku);
  const vendorId = String(raw.vendorId ?? '').trim();
  if (!itemSku || !vendorId) return null;
  const patch: VendorPricingPatch = { itemSku, vendorId };
  for (const field of VENDOR_PRICING_EDIT_FIELDS) {
    if (!(field in raw)) continue;
    const value = raw[field];
    let cleaned: string | number | null;
    if (VENDOR_PRICING_NUMBER_FIELDS.has(field)) cleaned = cleanNumber(value);
    else if (VENDOR_PRICING_DATE_FIELDS.has(field)) cleaned = cleanDate(value);
    else cleaned = cleanText(value);
    if (field === 'approvalStatus' && cleaned != null && !(VENDOR_PRICING_APPROVAL_STATUSES as readonly string[]).includes(String(cleaned))) {
      cleaned = null;
    }
    if (field === 'mtoOverride' && cleaned != null && !(VENDOR_PRICING_MTO_OPTIONS as readonly string[]).includes(String(cleaned))) {
      cleaned = null;
    }
    (patch as Record<string, unknown>)[field] = cleaned;
  }
  return patch;
}

/** Writes the full set of typed fields for each patched item/vendor. */
export async function saveVendorPricingEdits(
  companyId: string,
  patches: VendorPricingPatch[],
  editor: string | null
): Promise<number> {
  await ensureVendorPricingTable();
  let saved = 0;
  for (const patch of patches) {
    const edits = { ...emptyVendorPricingEdits(), ...patch };
    await prisma.$executeRaw`
      INSERT INTO "VendorPricingLine" (
        "companyId", "itemSku", "vendorId", "subsupplier", "mtoOverride", "newCost", "approvalStatus",
        "material", "currentMaterialCost", "newMaterialCost", "partWeightKgOverride", "startDate",
        "endDate", "requiredLoadDate", "updatedBy", "updatedAt"
      ) VALUES (
        ${companyId}, ${patch.itemSku}, ${patch.vendorId}, ${edits.subsupplier}, ${edits.mtoOverride},
        ${edits.newCost}, ${edits.approvalStatus}, ${edits.material}, ${edits.currentMaterialCost},
        ${edits.newMaterialCost}, ${edits.partWeightKgOverride}, ${edits.startDate}::date,
        ${edits.endDate}::date, ${edits.requiredLoadDate}::date, ${editor}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("companyId", "itemSku", "vendorId") DO UPDATE SET
        "subsupplier" = EXCLUDED."subsupplier",
        "mtoOverride" = EXCLUDED."mtoOverride",
        "newCost" = EXCLUDED."newCost",
        "approvalStatus" = EXCLUDED."approvalStatus",
        "material" = EXCLUDED."material",
        "currentMaterialCost" = EXCLUDED."currentMaterialCost",
        "newMaterialCost" = EXCLUDED."newMaterialCost",
        "partWeightKgOverride" = EXCLUDED."partWeightKgOverride",
        "startDate" = EXCLUDED."startDate",
        "endDate" = EXCLUDED."endDate",
        "requiredLoadDate" = EXCLUDED."requiredLoadDate",
        "updatedBy" = EXCLUDED."updatedBy",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
    saved += 1;
  }
  return saved;
}

/** Approved new costs per item/vendor, used as Vendor Contracts' "Vendor Pricing Sheet". */
export async function loadApprovedVendorNewCosts(companyId: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    await ensureVendorPricingTable();
    const rows = await prisma.$queryRaw<Array<{ itemSku: string; vendorId: string; newCost: number }>>`
      SELECT "itemSku", "vendorId", "newCost"
      FROM "VendorPricingLine"
      WHERE "companyId" = ${companyId} AND "approvalStatus" = 'Approved' AND "newCost" IS NOT NULL
    `;
    for (const row of rows) result.set(pairKey(row.itemSku, row.vendorId), Number(row.newCost));
  } catch (error) {
    console.warn('Vendor pricing: approved new costs unavailable', error);
  }
  return result;
}

export function vendorPricingPairKey(itemSku: string, vendorId: string): string {
  return pairKey(itemSku, vendorId);
}
