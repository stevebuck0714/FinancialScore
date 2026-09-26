import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  loadSpreadsheetDutyIdentities,
  normalizeOriginCode,
  readAprSgpGmpaWorkbook,
  skuLookupKeys,
  type AprSgpGmpaRow,
} from '@/lib/operational/apr-sgp-gmpa';

export const TRADE_PROGRAMS = ['none', 'usmca', 'other'] as const;
export const QTY_UNITS = ['piece', 'kg', 'lb', 'other'] as const;
export const RATE_SOURCES = ['spreadsheet', 'user', 'hts'] as const;

export type TradeProgram = (typeof TRADE_PROGRAMS)[number];
export type QtyUnit = (typeof QTY_UNITS)[number];
export type RateSource = (typeof RATE_SOURCES)[number];

export type CompanyItemDutyRow = {
  id: string;
  companyId: string;
  itemSku: string;
  itemDescription: string | null;
  vendorId: string | null;
  vendorName: string | null;
  htsCode: string | null;
  specialHtsCode: string | null;
  section301HtsCode: string | null;
  section232HtsCode: string | null;
  ieepaHtsCode: string | null;
  additionalHtsCode: string | null;
  countryOfOrigin: string | null;
  tradeProgram: TradeProgram;
  qtyUnit: QtyUnit;
  tariffHtsCode: string | null;
  dutyCode: string | null;
  dutyDescription: string | null;
  enteredValuePerPiece: number | null;
  enteredValueSource: string | null;
  spreadsheetDutyPerPiece: number | null;
  spreadsheetTariffPerPiece: number | null;
  dutyPerPiece: number | null;
  tariffPerPiece: number | null;
  dutyRatePct: number | null;
  specialRatePct: number | null;
  section301RatePct: number | null;
  section232RatePct: number | null;
  ieepaRatePct: number | null;
  additionalRatePct: number | null;
  tariffRatePct: number | null;
  rateSource: RateSource;
  identitySource: string;
  htsInputSource: string | null;
  lastSpreadsheetSeedAt: string | null;
  lastRateFetchedAt: string | null;
  lastRateAsOfDate: string | null;
  lastRateReleaseName: string | null;
  userEditedAt: string | null;
  updatedAt: string;
  needsHtsInput: boolean;
};

export type CompanyItemDutyPatch = {
  id?: string;
  itemSku?: string;
  itemDescription?: string | null;
  htsCode?: string | null;
  specialHtsCode?: string | null;
  section301HtsCode?: string | null;
  section232HtsCode?: string | null;
  ieepaHtsCode?: string | null;
  additionalHtsCode?: string | null;
  countryOfOrigin?: string | null;
  tradeProgram?: string | null;
  qtyUnit?: string | null;
  dutyCode?: string | null;
  enteredValuePerPiece?: number | null;
  dutyPerPiece?: number | null;
  tariffPerPiece?: number | null;
};

type DutyDbRow = {
  id: string;
  companyId: string;
  itemSku: string;
  itemDescription: string | null;
  htsCode: string | null;
  specialHtsCode: string | null;
  section301HtsCode: string | null;
  section232HtsCode: string | null;
  ieepaHtsCode: string | null;
  additionalHtsCode: string | null;
  countryOfOrigin: string | null;
  tradeProgram: string | null;
  qtyUnit: string | null;
  tariffHtsCode: string | null;
  dutyCode: string | null;
  dutyDescription: string | null;
  enteredValuePerPiece: number | null;
  enteredValueSource: string | null;
  spreadsheetDutyPerPiece: number | null;
  spreadsheetTariffPerPiece: number | null;
  dutyPerPiece: number | null;
  tariffPerPiece: number | null;
  dutyRatePct: number | null;
  specialRatePct: number | null;
  section301RatePct: number | null;
  section232RatePct: number | null;
  ieepaRatePct: number | null;
  additionalRatePct: number | null;
  tariffRatePct: number | null;
  rateSource: string;
  identitySource: string;
  htsInputSource: string | null;
  lastSpreadsheetSeedAt: Date | null;
  lastRateFetchedAt: Date | null;
  lastRateAsOfDate: Date | null;
  lastRateReleaseName: string | null;
  userEditedAt: Date | null;
  updatedAt: Date;
};

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureCompanyItemDutyTable(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyItemDuty" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "itemSku" TEXT NOT NULL,
          "itemDescription" TEXT,
          "htsCode" TEXT,
          "specialHtsCode" TEXT,
          "section301HtsCode" TEXT,
          "section232HtsCode" TEXT,
          "ieepaHtsCode" TEXT,
          "additionalHtsCode" TEXT,
          "countryOfOrigin" TEXT,
          "tradeProgram" TEXT DEFAULT 'none',
          "qtyUnit" TEXT DEFAULT 'piece',
          "enteredValuePerPiece" DOUBLE PRECISION,
          "enteredValueSource" TEXT,
          "spreadsheetDutyPerPiece" DOUBLE PRECISION,
          "spreadsheetTariffPerPiece" DOUBLE PRECISION,
          "dutyPerPiece" DOUBLE PRECISION,
          "tariffPerPiece" DOUBLE PRECISION,
          "dutyRatePct" DOUBLE PRECISION,
          "specialRatePct" DOUBLE PRECISION,
          "section301RatePct" DOUBLE PRECISION,
          "section232RatePct" DOUBLE PRECISION,
          "ieepaRatePct" DOUBLE PRECISION,
          "additionalRatePct" DOUBLE PRECISION,
          "tariffRatePct" DOUBLE PRECISION,
          "rateSource" TEXT NOT NULL DEFAULT 'spreadsheet',
          "identitySource" TEXT NOT NULL DEFAULT 'spreadsheet',
          "htsInputSource" TEXT,
          "lastSpreadsheetSeedAt" TIMESTAMP(3),
          "lastRateFetchedAt" TIMESTAMP(3),
          "userEditedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyItemDuty_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CompanyItemDuty_companyId_itemSku_key"
          ON "CompanyItemDuty"("companyId", "itemSku")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CompanyItemDuty_companyId_htsCode_idx"
          ON "CompanyItemDuty"("companyId", "htsCode")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CompanyItemDuty_companyId_identitySource_idx"
          ON "CompanyItemDuty"("companyId", "identitySource")
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "specialRatePct" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "section301RatePct" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "section232RatePct" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "ieepaRatePct" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "additionalRatePct" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "lastRateAsOfDate" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "lastRateReleaseName" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "tariffHtsCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "specialHtsCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "section301HtsCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "section232HtsCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "ieepaHtsCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "additionalHtsCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "dutyCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "dutyCodeSource" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "dutyDescription" TEXT`);
  // Program and Unit are user-owned independently of the HTS code. They used to share
  // "htsInputSource", so handing HTS ownership to Infor would have let the workbook
  // overwrite a user's trade program.
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "programInputSource" TEXT`);
}

export function normalizeItemSku(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeHtsCode(value: unknown): string | null {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (digits.length < 4 || digits.length > 10) return String(value ?? '').trim() || null;
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  if (digits.length <= 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8)}`;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asTradeProgram(value: unknown): TradeProgram {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (raw === 'usmca' || raw === 'cusma' || raw === 'nafta') return 'usmca';
  if (raw === 'other') return 'other';
  return 'none';
}

function asQtyUnit(value: unknown): QtyUnit {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'kg' || raw === 'kilogram' || raw === 'kilograms') return 'kg';
  if (raw === 'lb' || raw === 'lbs' || raw === 'pound' || raw === 'pounds') return 'lb';
  if (raw === 'other') return 'other';
  return 'piece';
}

function asRateSource(value: unknown): RateSource {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'user' || raw === 'hts') return raw;
  return 'spreadsheet';
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  const time = value.getTime();
  return Number.isFinite(time) ? value.toISOString() : null;
}

export function serializeCompanyItemDuty(row: DutyDbRow): CompanyItemDutyRow {
  const htsCode = String(row.htsCode || '').trim() || null;
  return {
    id: row.id,
    companyId: row.companyId,
    itemSku: row.itemSku,
    itemDescription: row.itemDescription,
    vendorId: null,
    vendorName: null,
    htsCode,
    specialHtsCode: String(row.specialHtsCode || '').trim() || null,
    section301HtsCode: String(row.section301HtsCode || '').trim() || null,
    section232HtsCode: String(row.section232HtsCode || '').trim() || null,
    ieepaHtsCode: String(row.ieepaHtsCode || '').trim() || null,
    additionalHtsCode: String(row.additionalHtsCode || '').trim() || null,
    countryOfOrigin: String(row.countryOfOrigin || '').trim() || null,
    tradeProgram: asTradeProgram(row.tradeProgram),
    qtyUnit: asQtyUnit(row.qtyUnit),
    tariffHtsCode: String(row.tariffHtsCode || '').trim() || null,
    dutyCode: String(row.dutyCode || '').trim() || null,
    dutyDescription: String(row.dutyDescription || '').trim() || null,
    enteredValuePerPiece: asNullableNumber(row.enteredValuePerPiece),
    enteredValueSource: row.enteredValueSource,
    spreadsheetDutyPerPiece: asNullableNumber(row.spreadsheetDutyPerPiece),
    spreadsheetTariffPerPiece: asNullableNumber(row.spreadsheetTariffPerPiece),
    dutyPerPiece: asNullableNumber(row.dutyPerPiece),
    tariffPerPiece: asNullableNumber(row.tariffPerPiece),
    dutyRatePct: asNullableNumber(row.dutyRatePct),
    specialRatePct: asNullableNumber(row.specialRatePct),
    section301RatePct: asNullableNumber(row.section301RatePct),
    section232RatePct: asNullableNumber(row.section232RatePct),
    ieepaRatePct: asNullableNumber(row.ieepaRatePct),
    additionalRatePct: asNullableNumber(row.additionalRatePct),
    tariffRatePct: asNullableNumber(row.tariffRatePct),
    rateSource: asRateSource(row.rateSource),
    identitySource: row.identitySource || 'spreadsheet',
    htsInputSource: row.htsInputSource,
    lastSpreadsheetSeedAt: toIso(row.lastSpreadsheetSeedAt),
    lastRateFetchedAt: toIso(row.lastRateFetchedAt),
    lastRateAsOfDate:
      typeof row.lastRateAsOfDate === 'string'
        ? String(row.lastRateAsOfDate).slice(0, 10) || null
        : toIso(row.lastRateAsOfDate)?.slice(0, 10) || null,
    lastRateReleaseName: row.lastRateReleaseName,
    userEditedAt: toIso(row.userEditedAt),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
    needsHtsInput: !htsCode,
  };
}

type SeedItem = {
  itemSku: string;
  itemDescription: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  dutyCode: string | null;
  dutyDescription: string | null;
  tradeProgram: TradeProgram;
  qtyUnit: QtyUnit;
  enteredValuePerPiece: number | null;
  dutyPerPiece: number | null;
  tariffPerPiece: number | null;
  identitySource: string;
  htsInputSource: string | null;
};

function firstNonNullNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function aggregateSgpRows(rows: AprSgpGmpaRow[]): SeedItem[] {
  const bySku = new Map<string, SeedItem>();
  for (const row of rows) {
    const itemSku = normalizeItemSku(row.itemId);
    if (!itemSku) continue;
    const next: SeedItem = {
      itemSku,
      itemDescription: null,
      // Transitional: the workbook still supplies HTS and origin for items Infor has not
      // classified. Infor is applied afterwards and wins, so this only fills gaps. Remove
      // both fields here at the cutover to Infor-only classification.
      htsCode: normalizeHtsCode(row.htsCode),
      countryOfOrigin: normalizeOriginCode(row.countryOfOrigin),
      dutyCode: null,
      dutyDescription: null,
      tradeProgram: asTradeProgram(row.tradeProgram),
      qtyUnit: asQtyUnit(row.qtyUnit),
      enteredValuePerPiece: firstNonNullNumber(row.updatedMaterialCost, row.sgpMaterialCost),
      dutyPerPiece: firstNonNullNumber(row.projectedDutiesPerPiece, row.sgpDutiesPerPiece),
      tariffPerPiece: firstNonNullNumber(row.projectedTariffPerPiece, row.sgpTariffPerPiece),
      identitySource: 'spreadsheet',
      htsInputSource: normalizeHtsCode(row.htsCode) ? 'spreadsheet' : null,
    };
    const existing = bySku.get(itemSku);
    if (!existing) {
      bySku.set(itemSku, next);
      continue;
    }
    bySku.set(itemSku, {
      ...existing,
      htsCode: existing.htsCode || next.htsCode,
      countryOfOrigin: existing.countryOfOrigin || next.countryOfOrigin,
      tradeProgram: existing.tradeProgram === 'none' ? next.tradeProgram : existing.tradeProgram,
      qtyUnit: existing.qtyUnit === 'piece' ? next.qtyUnit : existing.qtyUnit,
      enteredValuePerPiece: existing.enteredValuePerPiece ?? next.enteredValuePerPiece,
      dutyPerPiece: existing.dutyPerPiece ?? next.dutyPerPiece,
      tariffPerPiece: existing.tariffPerPiece ?? next.tariffPerPiece,
      htsInputSource: existing.htsInputSource || next.htsInputSource,
    });
  }
  return Array.from(bySku.values());
}

async function upsertSeedItems(companyId: string, items: SeedItem[], mode: 'spreadsheet' | 'identity'): Promise<number> {
  if (!items.length) return 0;
  let written = 0;
  const chunkSize = 200;
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    const values = chunk.map((item) => Prisma.sql`(
      ${randomUUID()},
      ${companyId},
      ${item.itemSku},
      ${item.itemDescription},
      ${item.htsCode},
      ${item.countryOfOrigin},
      ${item.dutyCode},
      ${item.dutyDescription},
      ${item.tradeProgram},
      ${item.qtyUnit},
      ${item.enteredValuePerPiece},
      ${mode === 'spreadsheet' ? 'spreadsheet' : null},
      ${item.dutyPerPiece},
      ${item.tariffPerPiece},
      ${item.dutyPerPiece},
      ${item.tariffPerPiece},
      ${mode === 'spreadsheet' ? 'spreadsheet' : 'spreadsheet'},
      ${item.identitySource},
      ${item.htsInputSource},
      ${mode === 'spreadsheet' ? new Date() : null},
      NOW(),
      NOW()
    )`);
    if (mode === 'spreadsheet') {
      await prisma.$executeRaw`
        INSERT INTO "CompanyItemDuty" (
          "id", "companyId", "itemSku", "itemDescription", "htsCode", "countryOfOrigin", "dutyCode", "dutyDescription",
          "tradeProgram", "qtyUnit",
          "enteredValuePerPiece", "enteredValueSource", "spreadsheetDutyPerPiece", "spreadsheetTariffPerPiece",
          "dutyPerPiece", "tariffPerPiece", "rateSource", "identitySource", "htsInputSource",
          "lastSpreadsheetSeedAt", "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("companyId", "itemSku")
        DO UPDATE SET
          "itemDescription" = COALESCE("CompanyItemDuty"."itemDescription", EXCLUDED."itemDescription"),
          "htsCode" = CASE
            WHEN COALESCE("CompanyItemDuty"."htsInputSource", '') = 'user' THEN "CompanyItemDuty"."htsCode"
            ELSE COALESCE(NULLIF("CompanyItemDuty"."htsCode", ''), EXCLUDED."htsCode")
          END,
          "countryOfOrigin" = CASE
            WHEN COALESCE("CompanyItemDuty"."htsInputSource", '') = 'user' THEN "CompanyItemDuty"."countryOfOrigin"
            ELSE COALESCE(NULLIF("CompanyItemDuty"."countryOfOrigin", ''), EXCLUDED."countryOfOrigin")
          END,
          "dutyCode" = CASE
            WHEN COALESCE("CompanyItemDuty"."dutyCodeSource", '') = 'user' THEN "CompanyItemDuty"."dutyCode"
            ELSE COALESCE(NULLIF(EXCLUDED."dutyCode", ''), "CompanyItemDuty"."dutyCode")
          END,
          "dutyDescription" = COALESCE(NULLIF(EXCLUDED."dutyDescription", ''), "CompanyItemDuty"."dutyDescription"),
          "tradeProgram" = CASE
            WHEN COALESCE("CompanyItemDuty"."programInputSource", '') = 'user' THEN "CompanyItemDuty"."tradeProgram"
            WHEN EXCLUDED."tradeProgram" IS NOT NULL AND EXCLUDED."tradeProgram" <> 'none' THEN EXCLUDED."tradeProgram"
            ELSE "CompanyItemDuty"."tradeProgram"
          END,
          "qtyUnit" = CASE
            WHEN COALESCE("CompanyItemDuty"."programInputSource", '') = 'user' THEN "CompanyItemDuty"."qtyUnit"
            WHEN EXCLUDED."qtyUnit" IS NOT NULL AND EXCLUDED."qtyUnit" <> 'piece' THEN EXCLUDED."qtyUnit"
            ELSE COALESCE("CompanyItemDuty"."qtyUnit", EXCLUDED."qtyUnit")
          END,
          "enteredValuePerPiece" = COALESCE("CompanyItemDuty"."enteredValuePerPiece", EXCLUDED."enteredValuePerPiece"),
          "enteredValueSource" = COALESCE("CompanyItemDuty"."enteredValueSource", EXCLUDED."enteredValueSource"),
          "spreadsheetDutyPerPiece" = EXCLUDED."spreadsheetDutyPerPiece",
          "spreadsheetTariffPerPiece" = EXCLUDED."spreadsheetTariffPerPiece",
          "dutyPerPiece" = CASE
            WHEN "CompanyItemDuty"."rateSource" IN ('user', 'hts') THEN "CompanyItemDuty"."dutyPerPiece"
            ELSE EXCLUDED."dutyPerPiece"
          END,
          "tariffPerPiece" = CASE
            WHEN "CompanyItemDuty"."rateSource" IN ('user', 'hts') THEN "CompanyItemDuty"."tariffPerPiece"
            ELSE EXCLUDED."tariffPerPiece"
          END,
          "htsInputSource" = COALESCE("CompanyItemDuty"."htsInputSource", EXCLUDED."htsInputSource"),
          "lastSpreadsheetSeedAt" = NOW(),
          "updatedAt" = NOW()
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO "CompanyItemDuty" (
          "id", "companyId", "itemSku", "itemDescription", "htsCode", "countryOfOrigin", "dutyCode", "dutyDescription",
          "tradeProgram", "qtyUnit",
          "enteredValuePerPiece", "enteredValueSource", "spreadsheetDutyPerPiece", "spreadsheetTariffPerPiece",
          "dutyPerPiece", "tariffPerPiece", "rateSource", "identitySource", "htsInputSource",
          "lastSpreadsheetSeedAt", "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("companyId", "itemSku") DO NOTHING
      `;
    }
    written += chunk.length;
  }
  return written;
}

export async function seedCompanyItemDutiesFromParsedRows(
  companyId: string,
  rows: AprSgpGmpaRow[]
): Promise<{ itemCount: number; seeded: number }> {
  const items = aggregateSgpRows(rows);
  const seeded = await upsertSeedItems(companyId, items, 'spreadsheet');
  return { itemCount: items.length, seeded };
}

export async function seedCompanyItemDutiesFromSgp(companyId: string): Promise<{ itemCount: number; seeded: number }> {
  const workbook = await readAprSgpGmpaWorkbook(companyId);
  return seedCompanyItemDutiesFromParsedRows(companyId, workbook?.rows || []);
}

async function loadDutySkuResolver(companyId: string): Promise<(itemSkuRaw: unknown) => string[]> {
  const dutySkus = await prisma.$queryRaw<Array<{ itemSku: string }>>`
    SELECT "itemSku" FROM "CompanyItemDuty" WHERE "companyId" = ${companyId}
  `.catch(() => []);
  const canonicalSkuByUpper = new Map(
    (dutySkus || []).map((row) => [normalizeItemSku(row.itemSku).toUpperCase(), normalizeItemSku(row.itemSku)])
  );
  const dutySkusByLookupKey = new Map<string, string[]>();
  for (const row of dutySkus || []) {
    const itemSku = canonicalSkuByUpper.get(normalizeItemSku(row.itemSku).toUpperCase()) || normalizeItemSku(row.itemSku);
    if (!itemSku) continue;
    for (const key of skuLookupKeys(itemSku)) {
      const list = dutySkusByLookupKey.get(key) || [];
      if (!list.includes(itemSku)) list.push(itemSku);
      dutySkusByLookupKey.set(key, list);
    }
  }
  return (itemSkuRaw: unknown): string[] => {
    const normalizedSku = normalizeItemSku(itemSkuRaw);
    if (!normalizedSku) return [];
    for (const key of skuLookupKeys(normalizedSku)) {
      const hits = dutySkusByLookupKey.get(key);
      if (hits?.length) return hits;
    }
    const exact = canonicalSkuByUpper.get(normalizedSku.toUpperCase());
    return exact ? [exact] : [normalizedSku];
  };
}

// The workbook supplies the duty code, plus HTS and origin for the transition period until
// classification is Infor-only. The description is not taken from here: the HTS import owns
// that column and rewrites it per quote.
async function overlayDutyHtsFromSpreadsheetSources(companyId: string): Promise<number> {
  const [identities, freightRows, matchingDutySkus] = await Promise.all([
    loadSpreadsheetDutyIdentities(companyId).catch((error) => {
      console.warn('Duty spreadsheet identity load failed:', error);
      return [];
    }),
    prisma.$queryRaw<Array<{ itemSku: string | null; htsCode: string | null; countryOfOrigin: string | null }>>`
      SELECT "itemSku", "htsCode", "countryOfOrigin"
      FROM "CompanyItemFreight"
      WHERE "companyId" = ${companyId}
        AND (
          COALESCE(NULLIF("htsCode", ''), '') <> ''
          OR COALESCE(NULLIF("countryOfOrigin", ''), '') <> ''
        )
    `.catch(() => []),
    loadDutySkuResolver(companyId),
  ]);
  const bySku = new Map<string, SeedItem>();
  const add = (itemSkuRaw: unknown, htsCodeRaw: unknown, originRaw: unknown, dutyCodeRaw?: unknown) => {
    const htsCode = normalizeHtsCode(htsCodeRaw);
    const countryOfOrigin = normalizeOriginCode(originRaw);
    const dutyCode = String(dutyCodeRaw || '').trim().toUpperCase() || null;
    if (!htsCode && !countryOfOrigin && !dutyCode) return;
    for (const itemSku of matchingDutySkus(itemSkuRaw)) {
      const existing = bySku.get(itemSku.toUpperCase());
      if (!existing) {
        bySku.set(itemSku.toUpperCase(), {
          itemSku,
          itemDescription: null,
          htsCode,
          countryOfOrigin,
          dutyCode,
          dutyDescription: null,
          tradeProgram: 'none',
          qtyUnit: 'piece',
          enteredValuePerPiece: null,
          dutyPerPiece: null,
          tariffPerPiece: null,
          identitySource: 'spreadsheet',
          htsInputSource: htsCode ? 'spreadsheet' : null,
        });
        continue;
      }
      existing.htsCode = existing.htsCode || htsCode;
      existing.countryOfOrigin = existing.countryOfOrigin || countryOfOrigin;
      existing.dutyCode = existing.dutyCode || dutyCode;
      existing.htsInputSource = existing.htsInputSource || (htsCode ? 'spreadsheet' : null);
    }
  };
  for (const row of identities) add(row.itemSku, row.htsCode, row.countryOfOrigin, row.dutyCode);
  for (const row of freightRows || []) add(row.itemSku, row.htsCode, row.countryOfOrigin);
  const items = Array.from(bySku.values());
  if (!items.length) return 0;
  return upsertSeedItems(companyId, items, 'spreadsheet');
}

type InforDutyIdentity = { itemSku: string; htsCode: string | null; countryOfOrigin: string | null };

const SLITEMS_PROGRAMS = ['SLItems', 'SLITEMS'];
const SLITEMS_PLATFORMS = ['INFOR_M3', 'INFOR_CSI'];
// A full SLItems snapshot is thousands of rows, so a day below this is a delta that has to
// be layered onto the last full snapshot rather than read on its own.
const SLITEMS_FULL_SNAPSHOT_MIN_ROWS = 100;

// SLItems is the system of record for HTS classification and country of origin. Filters use
// exact program and platform values so the (companyId, businessDate, module, miProgram)
// index applies; matching case-insensitively here forces a full scan of every raw record
// this company has ever synced.
async function loadInforItemDutyIdentities(companyId: string): Promise<InforDutyIdentity[]> {
  const rawDelegate = (prisma as any).inforRawRecord;
  if (!rawDelegate?.findMany) return [];
  const where = {
    companyId,
    platform: { in: SLITEMS_PLATFORMS },
    miProgram: { in: SLITEMS_PROGRAMS },
    businessDate: { not: null },
  };
  const days: Array<{ businessDate: Date | null; _count: { _all: number } }> = await rawDelegate
    .groupBy({
      by: ['businessDate'],
      where,
      _count: { _all: true },
      orderBy: { businessDate: 'desc' },
      take: 30,
    })
    .catch((error: unknown) => {
      console.warn('Infor SLItems business date scan failed:', error);
      return [];
    });

  // Newest first, stopping at the most recent full snapshot: anything older is superseded.
  const selectedDates: Date[] = [];
  for (const day of days) {
    if (!day.businessDate) continue;
    selectedDates.push(day.businessDate);
    if ((day._count?._all || 0) >= SLITEMS_FULL_SNAPSHOT_MIN_ROWS) break;
  }
  if (!selectedDates.length) return [];

  const rows: Array<{ businessDate: Date | null; payload: unknown }> = await rawDelegate
    .findMany({
      where: { ...where, businessDate: { in: selectedDates } },
      select: { businessDate: true, payload: true },
      orderBy: [{ businessDate: 'desc' }, { fetchedAt: 'desc' }],
      take: 60000,
    })
    .catch((error: unknown) => {
      console.warn('Infor SLItems duty identity load failed:', error);
      return [];
    });

  const byItem = new Map<string, InforDutyIdentity>();
  for (const row of rows) {
    const payload = row?.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : null;
    if (!payload) continue;
    const itemSku = normalizeItemSku(payload.Item ?? payload.item);
    if (!itemSku) continue;
    // Rows arrive newest first, so the first sighting of an item wins.
    if (byItem.has(itemSku.toUpperCase())) continue;
    const htsCode = normalizeHtsCode(payload.HtsCode ?? payload.HTSCode ?? payload.Hts);
    const countryOfOrigin = normalizeOriginCode(payload.Country ?? payload.Origin);
    if (!htsCode && !countryOfOrigin) continue;
    byItem.set(itemSku.toUpperCase(), { itemSku, htsCode, countryOfOrigin });
  }
  return Array.from(byItem.values());
}

// Runs last so Infor outranks both the workbook and a page entry: HTS is never pushed back
// to Infor, so an Infor code is the closest thing to the item master's own answer. Items
// Infor has no HtsCode for are untouched, leaving the workbook value or user input standing.
export async function overlayDutyIdentityFromInfor(companyId: string): Promise<number> {
  const [identities, matchingDutySkus] = await Promise.all([
    loadInforItemDutyIdentities(companyId),
    loadDutySkuResolver(companyId),
  ]);
  if (!identities.length) return 0;
  const bySku = new Map<string, InforDutyIdentity>();
  for (const identity of identities) {
    for (const itemSku of matchingDutySkus(identity.itemSku)) {
      const key = itemSku.toUpperCase();
      const existing = bySku.get(key);
      if (!existing) {
        bySku.set(key, { itemSku, htsCode: identity.htsCode, countryOfOrigin: identity.countryOfOrigin });
        continue;
      }
      existing.htsCode = existing.htsCode || identity.htsCode;
      existing.countryOfOrigin = existing.countryOfOrigin || identity.countryOfOrigin;
    }
  }
  const items = Array.from(bySku.values());
  if (!items.length) return 0;
  let updated = 0;
  const chunkSize = 500;
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    const values = Prisma.join(
      chunk.map(
        (item) => Prisma.sql`(${item.itemSku.toUpperCase()}::text, ${item.htsCode}::text, ${item.countryOfOrigin}::text)`
      )
    );
    const rows = await prisma
      .$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "CompanyItemDuty" AS d
        SET
          "htsCode" = COALESCE(v."htsCode", d."htsCode"),
          "countryOfOrigin" = COALESCE(v."countryOfOrigin", d."countryOfOrigin"),
          "htsInputSource" = CASE WHEN v."htsCode" IS NOT NULL THEN 'infor' ELSE d."htsInputSource" END,
          "updatedAt" = NOW()
        FROM (VALUES ${values}) AS v("itemSku", "htsCode", "countryOfOrigin")
        WHERE d."companyId" = ${companyId}
          AND upper(btrim(d."itemSku")) = v."itemSku"
          AND (
            (v."htsCode" IS NOT NULL AND v."htsCode" <> COALESCE(d."htsCode", ''))
            OR (v."countryOfOrigin" IS NOT NULL AND v."countryOfOrigin" <> COALESCE(d."countryOfOrigin", ''))
            OR (v."htsCode" IS NOT NULL AND COALESCE(d."htsInputSource", '') <> 'infor')
          )
        RETURNING d."id"
      `)
      .catch((error) => {
        console.warn('Infor duty identity overlay failed:', error);
        return [] as Array<{ id: string }>;
      });
    updated += rows.length;
  }
  return updated;
}

async function loadIdentitySkus(companyId: string): Promise<SeedItem[]> {
  const [sales, inventory, forecast, revenue, infor] = await Promise.all([
    prisma.$queryRaw<Array<{ sku: string | null; name: string | null }>>(Prisma.sql`
      SELECT DISTINCT "sku", "itemName" AS name
      FROM "ProductSalesSnapshot"
      WHERE "companyId" = ${companyId}
        AND COALESCE(NULLIF("sku", ''), NULLIF("itemName", '')) IS NOT NULL
    `).catch(() => []),
    prisma.$queryRaw<Array<{ sku: string | null; name: string | null }>>(Prisma.sql`
      SELECT DISTINCT "sku", "itemName" AS name
      FROM "InventorySnapshot"
      WHERE "companyId" = ${companyId}
        AND COALESCE(NULLIF("sku", ''), NULLIF("itemName", '')) IS NOT NULL
    `).catch(() => []),
    prisma.$queryRaw<Array<{ sku: string | null; name: string | null }>>(Prisma.sql`
      SELECT DISTINCT "itemSku" AS sku, NULL::text AS name
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId}
        AND NULLIF("itemSku", '') IS NOT NULL
    `).catch(() => []),
    prisma.$queryRaw<Array<{ sku: string | null; name: string | null }>>(Prisma.sql`
      SELECT DISTINCT "itemSku" AS sku, NULL::text AS name
      FROM "ProductRevenueLine"
      WHERE "companyId" = ${companyId}
        AND NULLIF("itemSku", '') IS NOT NULL
    `).catch(() => []),
    prisma.$queryRaw<Array<{ sku: string | null; name: string | null }>>(Prisma.sql`
      SELECT DISTINCT "itemNumber" AS sku, "description" AS name
      FROM "InforItemOverviewCache"
      WHERE "companyId" = ${companyId}
        AND NULLIF("itemNumber", '') IS NOT NULL
    `).catch(() => []),
  ]);

  const bySku = new Map<string, SeedItem>();
  const add = (skuRaw: string | null | undefined, name: string | null | undefined, identitySource: string) => {
    const itemSku = normalizeItemSku(skuRaw);
    if (!itemSku) return;
    const description = String(name || '').trim() || null;
    const existing = bySku.get(itemSku);
    if (!existing) {
      bySku.set(itemSku, {
        itemSku,
        itemDescription: description && description.toLowerCase() !== 'unknown item' ? description : null,
        htsCode: null,
        countryOfOrigin: null,
        dutyCode: null,
        dutyDescription: null,
        tradeProgram: 'none',
        qtyUnit: 'piece',
        enteredValuePerPiece: null,
        dutyPerPiece: null,
        tariffPerPiece: null,
        identitySource,
        htsInputSource: null,
      });
      return;
    }
    if (!existing.itemDescription && description && description.toLowerCase() !== 'unknown item') {
      existing.itemDescription = description;
    }
  };

  for (const row of sales) add(row.sku, row.name, 'sales');
  for (const row of inventory) add(row.sku, row.name, 'inventory');
  for (const row of forecast) add(row.sku, row.name, 'forecast');
  for (const row of revenue) add(row.sku, row.name, 'revenue');
  for (const row of infor) add(row.sku, row.name, 'infor');
  return Array.from(bySku.values());
}

export async function syncCompanyItemDutyIdentities(companyId: string): Promise<{ discovered: number }> {
  const items = await loadIdentitySkus(companyId);
  await upsertSeedItems(companyId, items, 'identity');
  return { discovered: items.length };
}

export async function listCompanyItemDuties(
  companyId: string,
  filter: 'all' | 'needs_hts' = 'all'
): Promise<CompanyItemDutyRow[]> {
  const rows = await prisma.$queryRaw<DutyDbRow[]>`
    SELECT
      "id", "companyId", "itemSku", "itemDescription", "htsCode", "specialHtsCode", "section301HtsCode", "section232HtsCode", "ieepaHtsCode", "additionalHtsCode", "countryOfOrigin", "tradeProgram", "qtyUnit",
      "tariffHtsCode", "dutyCode", "dutyDescription", "enteredValuePerPiece", "enteredValueSource", "spreadsheetDutyPerPiece", "spreadsheetTariffPerPiece",
      "dutyPerPiece", "tariffPerPiece", "dutyRatePct", "specialRatePct", "section301RatePct",
      "section232RatePct", "ieepaRatePct", "additionalRatePct", "tariffRatePct", "rateSource", "identitySource",
      "htsInputSource", "lastSpreadsheetSeedAt", "lastRateFetchedAt", "lastRateAsOfDate", "lastRateReleaseName", "userEditedAt", "updatedAt"
    FROM "CompanyItemDuty"
    WHERE "companyId" = ${companyId}
      ${filter === 'needs_hts' ? Prisma.sql`AND COALESCE(NULLIF("htsCode", ''), '') = ''` : Prisma.empty}
    ORDER BY
      CASE WHEN COALESCE(NULLIF("htsCode", ''), '') = '' THEN 0 ELSE 1 END,
      "itemSku" ASC
  `;
  return rows.map(serializeCompanyItemDuty);
}

// One Save marked every row user-owned because the field was submitted rather than changed,
// which freezes HTS and origin against both Infor and the workbook. Stored values are left
// alone; only the false claim of ownership is released, so the next refresh can update them.
// A genuine edit sets the flag again.
export async function clearDutyHtsUserOwnership(companyId: string): Promise<number> {
  await ensureCompanyItemDutyTable();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "CompanyItemDuty"
    SET "htsInputSource" = NULL, "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND COALESCE("htsInputSource", '') = 'user'
    RETURNING "id"
  `;
  return rows.length;
}

export async function refreshCompanyItemDuties(companyId: string): Promise<{
  spreadsheetItems: number;
  discovered: number;
}> {
  await ensureCompanyItemDutyTable();
  await loadSpreadsheetDutyIdentities(companyId).catch((error) => {
    console.warn('Duty spreadsheet identity preload failed:', error);
    return [];
  });
  const seeded = await seedCompanyItemDutiesFromSgp(companyId);
  const identities = await syncCompanyItemDutyIdentities(companyId);
  const overlaid = await overlayDutyHtsFromSpreadsheetSources(companyId).catch((error) => {
    console.warn('Duty spreadsheet HTS overlay failed:', error);
    return 0;
  });
  await overlayDutyIdentityFromInfor(companyId).catch((error) => {
    console.warn('Duty Infor HTS overlay failed:', error);
    return 0;
  });
  return { spreadsheetItems: Math.max(seeded.itemCount, overlaid), discovered: identities.discovered };
}

export async function updateCompanyItemDuties(
  companyId: string,
  patches: CompanyItemDutyPatch[]
): Promise<CompanyItemDutyRow[]> {
  const updatedIds: string[] = [];
  for (const patch of patches) {
    const id = String(patch.id || '').trim();
    const itemSku = normalizeItemSku(patch.itemSku);
    if (!id && !itemSku) continue;

    const htsCode = patch.htsCode === undefined ? undefined : normalizeHtsCode(patch.htsCode);
    const specialHtsCode = patch.specialHtsCode === undefined ? undefined : normalizeHtsCode(patch.specialHtsCode);
    const section301HtsCode = patch.section301HtsCode === undefined ? undefined : normalizeHtsCode(patch.section301HtsCode);
    const section232HtsCode = patch.section232HtsCode === undefined ? undefined : normalizeHtsCode(patch.section232HtsCode);
    const ieepaHtsCode = patch.ieepaHtsCode === undefined ? undefined : normalizeHtsCode(patch.ieepaHtsCode);
    const additionalHtsCode = patch.additionalHtsCode === undefined ? undefined : normalizeHtsCode(patch.additionalHtsCode);
    const countryOfOrigin =
      patch.countryOfOrigin === undefined ? undefined : String(patch.countryOfOrigin || '').trim() || null;
    const tradeProgram = patch.tradeProgram === undefined ? undefined : asTradeProgram(patch.tradeProgram);
    const qtyUnit = patch.qtyUnit === undefined ? undefined : asQtyUnit(patch.qtyUnit);
    const dutyCode = patch.dutyCode === undefined ? undefined : String(patch.dutyCode || '').trim().toUpperCase() || null;
    const enteredValuePerPiece =
      patch.enteredValuePerPiece === undefined ? undefined : asNullableNumber(patch.enteredValuePerPiece);
    const dutyPerPiece = patch.dutyPerPiece === undefined ? undefined : asNullableNumber(patch.dutyPerPiece);
    const tariffPerPiece = patch.tariffPerPiece === undefined ? undefined : asNullableNumber(patch.tariffPerPiece);
    const itemDescription =
      patch.itemDescription === undefined ? undefined : String(patch.itemDescription || '').trim() || null;
    // The report saves every visible row, not just edited ones, so ownership has to
    // follow an actual value change. Marking a field 'user' on submission alone would
    // freeze it against the Infor and spreadsheet refreshes for good.
    const htsIdentityChanged = Prisma.sql`(
      (${htsCode !== undefined} AND COALESCE(${htsCode ?? null}::text, '') <> COALESCE("htsCode", ''))
      OR (${specialHtsCode !== undefined} AND COALESCE(${specialHtsCode ?? null}::text, '') <> COALESCE("specialHtsCode", ''))
      OR (${section301HtsCode !== undefined} AND COALESCE(${section301HtsCode ?? null}::text, '') <> COALESCE("section301HtsCode", ''))
      OR (${section232HtsCode !== undefined} AND COALESCE(${section232HtsCode ?? null}::text, '') <> COALESCE("section232HtsCode", ''))
      OR (${ieepaHtsCode !== undefined} AND COALESCE(${ieepaHtsCode ?? null}::text, '') <> COALESCE("ieepaHtsCode", ''))
      OR (${additionalHtsCode !== undefined} AND COALESCE(${additionalHtsCode ?? null}::text, '') <> COALESCE("additionalHtsCode", ''))
      OR (${countryOfOrigin !== undefined} AND COALESCE(${countryOfOrigin ?? null}::text, '') <> COALESCE("countryOfOrigin", ''))
    )`;
    const programChanged = Prisma.sql`(
      (${tradeProgram !== undefined} AND COALESCE(${tradeProgram ?? null}::text, '') <> COALESCE("tradeProgram", ''))
      OR (${qtyUnit !== undefined} AND COALESCE(${qtyUnit ?? null}::text, '') <> COALESCE("qtyUnit", ''))
    )`;
    const dutyCodeChanged = Prisma.sql`(
      ${dutyCode !== undefined} AND COALESCE(${dutyCode ?? null}::text, '') <> COALESCE("dutyCode", '')
    )`;
    const enteredValueChanged = Prisma.sql`(
      ${enteredValuePerPiece !== undefined}
      AND COALESCE(${enteredValuePerPiece ?? null}::double precision, -1) <> COALESCE("enteredValuePerPiece", -1)
    )`;
    const rateChanged = Prisma.sql`(
      (${dutyPerPiece !== undefined} AND COALESCE(${dutyPerPiece ?? null}::double precision, -1) <> COALESCE("dutyPerPiece", -1))
      OR (${tariffPerPiece !== undefined} AND COALESCE(${tariffPerPiece ?? null}::double precision, -1) <> COALESCE("tariffPerPiece", -1))
    )`;

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "CompanyItemDuty"
      SET
        "itemDescription" = CASE WHEN ${itemDescription !== undefined} THEN ${itemDescription} ELSE "itemDescription" END,
        "htsCode" = CASE WHEN ${htsCode !== undefined} THEN ${htsCode} ELSE "htsCode" END,
        "specialHtsCode" = CASE WHEN ${specialHtsCode !== undefined} THEN ${specialHtsCode} ELSE "specialHtsCode" END,
        "section301HtsCode" = CASE WHEN ${section301HtsCode !== undefined} THEN ${section301HtsCode} ELSE "section301HtsCode" END,
        "section232HtsCode" = CASE WHEN ${section232HtsCode !== undefined} THEN ${section232HtsCode} ELSE "section232HtsCode" END,
        "ieepaHtsCode" = CASE WHEN ${ieepaHtsCode !== undefined} THEN ${ieepaHtsCode} ELSE "ieepaHtsCode" END,
        "additionalHtsCode" = CASE WHEN ${additionalHtsCode !== undefined} THEN ${additionalHtsCode} ELSE "additionalHtsCode" END,
        "countryOfOrigin" = CASE WHEN ${countryOfOrigin !== undefined} THEN ${countryOfOrigin} ELSE "countryOfOrigin" END,
        "tradeProgram" = CASE WHEN ${tradeProgram !== undefined} THEN ${tradeProgram} ELSE "tradeProgram" END,
        "qtyUnit" = CASE WHEN ${qtyUnit !== undefined} THEN ${qtyUnit} ELSE "qtyUnit" END,
        "dutyCode" = CASE WHEN ${dutyCode !== undefined} THEN ${dutyCode} ELSE "dutyCode" END,
        "dutyCodeSource" = CASE WHEN ${dutyCodeChanged} THEN 'user' ELSE "dutyCodeSource" END,
        "enteredValuePerPiece" = CASE WHEN ${enteredValuePerPiece !== undefined} THEN ${enteredValuePerPiece} ELSE "enteredValuePerPiece" END,
        "enteredValueSource" = CASE WHEN ${enteredValueChanged} THEN 'user' ELSE "enteredValueSource" END,
        "dutyPerPiece" = CASE WHEN ${dutyPerPiece !== undefined} THEN ${dutyPerPiece} ELSE "dutyPerPiece" END,
        "tariffPerPiece" = CASE WHEN ${tariffPerPiece !== undefined} THEN ${tariffPerPiece} ELSE "tariffPerPiece" END,
        "rateSource" = CASE WHEN ${rateChanged} THEN 'user' ELSE "rateSource" END,
        "htsInputSource" = CASE WHEN ${htsIdentityChanged} THEN 'user' ELSE "htsInputSource" END,
        "programInputSource" = CASE WHEN ${programChanged} THEN 'user' ELSE "programInputSource" END,
        "userEditedAt" = CASE
          WHEN ${htsIdentityChanged} OR ${programChanged} OR ${dutyCodeChanged} OR ${enteredValueChanged} OR ${rateChanged}
          THEN NOW()
          ELSE "userEditedAt"
        END,
        "updatedAt" = NOW()
      WHERE "companyId" = ${companyId}
        AND (
          (${id} <> '' AND "id" = ${id})
          OR (${itemSku} <> '' AND "itemSku" = ${itemSku})
        )
      RETURNING "id"
    `;
    if (rows[0]?.id) updatedIds.push(rows[0].id);
  }

  if (!updatedIds.length) return [];
  const rows = await prisma.$queryRaw<DutyDbRow[]>`
    SELECT
      "id", "companyId", "itemSku", "itemDescription", "htsCode", "specialHtsCode", "section301HtsCode", "section232HtsCode", "ieepaHtsCode", "additionalHtsCode", "countryOfOrigin", "tradeProgram", "qtyUnit",
      "tariffHtsCode", "dutyCode", "dutyDescription", "enteredValuePerPiece", "enteredValueSource", "spreadsheetDutyPerPiece", "spreadsheetTariffPerPiece",
      "dutyPerPiece", "tariffPerPiece", "dutyRatePct", "specialRatePct", "section301RatePct",
      "section232RatePct", "ieepaRatePct", "additionalRatePct", "tariffRatePct", "rateSource", "identitySource",
      "htsInputSource", "lastSpreadsheetSeedAt", "lastRateFetchedAt", "lastRateAsOfDate", "lastRateReleaseName", "userEditedAt", "updatedAt"
    FROM "CompanyItemDuty"
    WHERE "companyId" = ${companyId}
      AND "id" IN (${Prisma.join(updatedIds.map((id) => Prisma.sql`${id}`))})
    ORDER BY "itemSku" ASC
  `;
  return rows.map(serializeCompanyItemDuty);
}
