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
      // HTS and origin are Infor's alone. The workbook is not a fallback for them: an
      // item Infor has not classified stays blank so it shows up as needing user input
      // instead of silently carrying a stale workbook code.
      htsCode: null,
      countryOfOrigin: null,
      dutyCode: null,
      dutyDescription: null,
      tradeProgram: asTradeProgram(row.tradeProgram),
      qtyUnit: asQtyUnit(row.qtyUnit),
      enteredValuePerPiece: firstNonNullNumber(row.updatedMaterialCost, row.sgpMaterialCost),
      dutyPerPiece: firstNonNullNumber(row.projectedDutiesPerPiece, row.sgpDutiesPerPiece),
      tariffPerPiece: firstNonNullNumber(row.projectedTariffPerPiece, row.sgpTariffPerPiece),
      identitySource: 'spreadsheet',
      htsInputSource: null,
    };
    const existing = bySku.get(itemSku);
    if (!existing) {
      bySku.set(itemSku, next);
      continue;
    }
    bySku.set(itemSku, {
      ...existing,
      tradeProgram: existing.tradeProgram === 'none' ? next.tradeProgram : existing.tradeProgram,
      qtyUnit: existing.qtyUnit === 'piece' ? next.qtyUnit : existing.qtyUnit,
      enteredValuePerPiece: existing.enteredValuePerPiece ?? next.enteredValuePerPiece,
      dutyPerPiece: existing.dutyPerPiece ?? next.dutyPerPiece,
      tariffPerPiece: existing.tariffPerPiece ?? next.tariffPerPiece,
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

// The workbook contributes the duty code only. HTS and origin come from Infor, and the
// description comes from the HTS import, so the stored freight HTS column is no longer read
// here either: it holds workbook values and was why Duties disagreed with Infor.
async function overlayDutyCodesFromSpreadsheet(companyId: string): Promise<number> {
  const [identities, matchingDutySkus] = await Promise.all([
    loadSpreadsheetDutyIdentities(companyId).catch((error) => {
      console.warn('Duty spreadsheet identity load failed:', error);
      return [];
    }),
    loadDutySkuResolver(companyId),
  ]);
  const bySku = new Map<string, SeedItem>();
  const add = (itemSkuRaw: unknown, dutyCodeRaw: unknown) => {
    const dutyCode = String(dutyCodeRaw || '').trim().toUpperCase() || null;
    if (!dutyCode) return;
    for (const itemSku of matchingDutySkus(itemSkuRaw)) {
      const existing = bySku.get(itemSku.toUpperCase());
      if (!existing) {
        bySku.set(itemSku.toUpperCase(), {
          itemSku,
          itemDescription: null,
          htsCode: null,
          countryOfOrigin: null,
          dutyCode,
          dutyDescription: null,
          tradeProgram: 'none',
          qtyUnit: 'piece',
          enteredValuePerPiece: null,
          dutyPerPiece: null,
          tariffPerPiece: null,
          identitySource: 'spreadsheet',
          htsInputSource: null,
        });
        continue;
      }
      existing.dutyCode = existing.dutyCode || dutyCode;
    }
  };
  for (const row of identities) add(row.itemSku, row.dutyCode);
  const items = Array.from(bySku.values());
  if (!items.length) return 0;
  return upsertSeedItems(companyId, items, 'spreadsheet');
}

type InforDutyIdentity = { itemSku: string; htsCode: string | null; countryOfOrigin: string | null };

// SLItems is the system of record for HTS classification and country of origin. Read the
// newest record per item rather than only the newest business date, so this is correct
// whether Infor sends a full nightly snapshot or a small delta. The window is bounded so
// the scan does not grow with sync history.
async function loadInforItemDutyIdentities(companyId: string): Promise<InforDutyIdentity[]> {
  const rows = await prisma
    .$queryRaw<Array<{ item: string | null; hts: string | null; country: string | null }>>(Prisma.sql`
      SELECT DISTINCT ON (upper(btrim("payload"->>'Item')))
        "payload"->>'Item' AS item,
        "payload"->>'HtsCode' AS hts,
        COALESCE(NULLIF("payload"->>'Country', ''), NULLIF("payload"->>'Origin', '')) AS country
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND upper(COALESCE("miProgram", '')) = 'SLITEMS'
        AND "businessDate" IS NOT NULL
        AND "businessDate" >= (
          SELECT MAX("businessDate") - INTERVAL '30 days'
          FROM "InforRawRecord"
          WHERE "companyId" = ${companyId}
            AND upper(COALESCE("miProgram", '')) = 'SLITEMS'
        )
        AND NULLIF(btrim(COALESCE("payload"->>'Item', '')), '') IS NOT NULL
      ORDER BY upper(btrim("payload"->>'Item')), "businessDate" DESC, "fetchedAt" DESC
    `)
    .catch((error) => {
      console.warn('Infor SLItems duty identity load failed:', error);
      return [] as Array<{ item: string | null; hts: string | null; country: string | null }>;
    });
  const identities: InforDutyIdentity[] = [];
  for (const row of rows || []) {
    const itemSku = normalizeItemSku(row.item);
    if (!itemSku) continue;
    const htsCode = normalizeHtsCode(row.hts);
    const countryOfOrigin = normalizeOriginCode(row.country);
    if (!htsCode && !countryOfOrigin) continue;
    identities.push({ itemSku, htsCode, countryOfOrigin });
  }
  return identities;
}

// Runs after the spreadsheet overlay so Infor wins over the workbook. Where Infor has no
// classification the workbook seeds it, and the user fills what is still blank; because HTS
// is never pushed back to Infor, a value typed on the page stands until Infor itself carries
// one, at which point Infor is authoritative again. Nothing here touches an item Infor has
// no HtsCode for.
async function overlayDutyIdentityFromInfor(companyId: string): Promise<number> {
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
      "id", "companyId", "itemSku", "itemDescription", "htsCode", "countryOfOrigin", "tradeProgram", "qtyUnit",
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

// Every stored HTS predates Infor being the source: it was seeded from the workbook and
// then flagged user-owned wholesale by a single Save, so none of it can be trusted or told
// apart. This clears the classification so the following refresh repopulates it from Infor
// alone, leaving the rest genuinely blank for user input rather than workbook-derived. The
// description goes with it because the HTS import owns that and rewrites it per quote.
export async function clearDutyHtsIdentity(companyId: string): Promise<number> {
  await ensureCompanyItemDutyTable();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "CompanyItemDuty"
    SET
      "htsCode" = NULL,
      "countryOfOrigin" = NULL,
      "htsInputSource" = NULL,
      "dutyDescription" = NULL,
      "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND (
        COALESCE("htsCode", '') <> ''
        OR COALESCE("countryOfOrigin", '') <> ''
        OR COALESCE("dutyDescription", '') <> ''
        OR "htsInputSource" IS NOT NULL
      )
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
  const overlaid = await overlayDutyCodesFromSpreadsheet(companyId).catch((error) => {
    console.warn('Duty spreadsheet duty-code overlay failed:', error);
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
      "id", "companyId", "itemSku", "itemDescription", "htsCode", "countryOfOrigin", "tradeProgram", "qtyUnit",
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
