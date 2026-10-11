import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { normalizeOriginCode, skuLookupKeys } from '@/lib/operational/apr-sgp-gmpa';

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
  primaryCustomer: string | null;
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
  /** Infor item or vendor status is O or I. */
  inactive: boolean;
  inforDescription: string | null;
  descriptionOverridden: boolean;
  inforOrigin: string | null;
  originOverridden: boolean;
  inforValuePerPiece: number | null;
  valueOverridden: boolean;
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
  itemDescriptionOverride: string | null;
  enteredValueOverride: number | null;
  userEditedAt: Date | null;
  updatedAt: Date;
};

const DUTY_SELECT_COLUMNS = Prisma.raw(`
  "id", "companyId", "itemSku", "itemDescription", "htsCode", "specialHtsCode", "section301HtsCode", "section232HtsCode", "ieepaHtsCode", "additionalHtsCode", "countryOfOrigin", "tradeProgram", "qtyUnit",
  "tariffHtsCode", "dutyCode", "dutyDescription", "enteredValuePerPiece", "enteredValueSource", "spreadsheetDutyPerPiece", "spreadsheetTariffPerPiece",
  "dutyPerPiece", "tariffPerPiece", "dutyRatePct", "specialRatePct", "section301RatePct",
  "section232RatePct", "ieepaRatePct", "additionalRatePct", "tariffRatePct", "rateSource", "identitySource",
  "htsInputSource", "lastSpreadsheetSeedAt", "lastRateFetchedAt", "lastRateAsOfDate", "lastRateReleaseName",
  "itemDescriptionOverride", "enteredValueOverride", "userEditedAt", "updatedAt"
`);

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
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "itemDescriptionOverride" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "enteredValueOverride" DOUBLE PRECISION`);
}

/** Duties store ISO origin codes; the freight convention shows the United States as DOM. */
export function dutyOriginCode(value: unknown): string | null {
  const code = normalizeOriginCode(value);
  if (!code) return null;
  const upper = code.toUpperCase();
  return upper === 'DOM' ? 'US' : upper;
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
    primaryCustomer: null,
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
    inactive: false,
    inforDescription: null,
    descriptionOverridden: Boolean(String(row.itemDescriptionOverride || '').trim()),
    inforOrigin: null,
    originOverridden: false,
    inforValuePerPiece: null,
    valueOverridden: asNullableNumber(row.enteredValueOverride) != null,
  };
}

type SeedItem = {
  itemSku: string;
  itemDescription: string | null;
  identitySource: string;
};

async function insertIdentityItems(companyId: string, items: SeedItem[]): Promise<number> {
  if (!items.length) return 0;
  let written = 0;
  const chunkSize = 200;
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    const values = chunk.map((item) => Prisma.sql`(
      ${randomUUID()}, ${companyId}, ${item.itemSku}, ${item.itemDescription}, 'none', 'piece', 'hts', ${item.identitySource}, NOW(), NOW()
    )`);
    await prisma.$executeRaw`
      INSERT INTO "CompanyItemDuty" (
        "id", "companyId", "itemSku", "itemDescription", "tradeProgram", "qtyUnit", "rateSource", "identitySource",
        "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId", "itemSku") DO NOTHING
    `;
    written += chunk.length;
  }
  return written;
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
    if (!htsCode) continue;
    // Origin comes from the vendor address (applyDutyInforIdentity), not the item master.
    byItem.set(itemSku.toUpperCase(), { itemSku, htsCode, countryOfOrigin: null });
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
        identitySource,
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
  await insertIdentityItems(companyId, items);
  return { discovered: items.length };
}

export async function listCompanyItemDuties(
  companyId: string,
  filter: 'all' | 'needs_hts' = 'all'
): Promise<CompanyItemDutyRow[]> {
  const rows = await prisma.$queryRaw<DutyDbRow[]>`
    SELECT ${DUTY_SELECT_COLUMNS}
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

// Duty and tariff dollars come only from the HTS rate import; amounts the SGP workbook seeded
// are dropped. User-entered amounts (rateSource 'user') are kept.
async function clearSpreadsheetDutyAmounts(companyId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "CompanyItemDuty"
    SET
      "spreadsheetDutyPerPiece" = NULL,
      "spreadsheetTariffPerPiece" = NULL,
      "dutyPerPiece" = CASE WHEN "rateSource" = 'spreadsheet' THEN NULL ELSE "dutyPerPiece" END,
      "tariffPerPiece" = CASE WHEN "rateSource" = 'spreadsheet' THEN NULL ELSE "tariffPerPiece" END,
      "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND (
        "spreadsheetDutyPerPiece" IS NOT NULL
        OR "spreadsheetTariffPerPiece" IS NOT NULL
        OR ("rateSource" = 'spreadsheet' AND ("dutyPerPiece" IS NOT NULL OR "tariffPerPiece" IS NOT NULL))
      )
    RETURNING "id"
  `;
  return rows.length;
}

/**
 * Makes Infor the source of the item list and identity: adds a row for every Infor item with a
 * primary vendor, then writes the effective description (override, else Infor), origin (shared
 * COO override, else the vendor address country) and customs value (override, else Infor unit
 * cost). Values are stored because the HTS rate lookup and duty COGS read them from this table.
 */
export async function applyDutyInforIdentity(companyId: string): Promise<{ inforItems: number; updated: number }> {
  const { loadCsiItemFacts, loadVendorAddresses, loadCooOverrides, inforUnitCost } = await import(
    '@/lib/operations/item-freight-overlay'
  );
  const { loadPrimaryVendorByItem } = await import('@/lib/operations/vendor-monthly-forecast-db');
  const [csiByItem, vendorByItem, vendorAddresses, cooOverrides] = await Promise.all([
    loadCsiItemFacts(companyId),
    loadPrimaryVendorByItem(companyId).catch(() => new Map<string, { vendorId: string; vendorName: string }>()),
    loadVendorAddresses(companyId),
    loadCooOverrides(companyId),
  ]);
  if (!csiByItem.size) return { inforItems: 0, updated: 0 };

  const identities: Array<{ itemSku: string; description: string | null; origin: string | null; cost: number | null }> = [];
  for (const [key, csi] of csiByItem.entries()) {
    const vendorId = vendorByItem.get(key)?.vendorId;
    if (!vendorId) continue;
    const origin = dutyOriginCode(cooOverrides.get(key)) || dutyOriginCode(vendorAddresses.get(vendorId)?.country);
    identities.push({ itemSku: key, description: csi.description, origin, cost: inforUnitCost(csi) });
  }
  await insertIdentityItems(
    companyId,
    identities.map((item) => ({ itemSku: item.itemSku, itemDescription: item.description, identitySource: 'infor' }))
  );

  let updated = 0;
  const chunkSize = 500;
  for (let index = 0; index < identities.length; index += chunkSize) {
    const chunk = identities.slice(index, index + chunkSize);
    const values = Prisma.join(
      chunk.map(
        (item) =>
          Prisma.sql`(${item.itemSku}::text, ${item.description}::text, ${item.origin}::text, ${item.cost}::double precision)`
      )
    );
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "CompanyItemDuty" AS d
      SET
        "itemDescription" = COALESCE(NULLIF(d."itemDescriptionOverride", ''), v."description", d."itemDescription"),
        "countryOfOrigin" = COALESCE(v."origin", d."countryOfOrigin"),
        "enteredValuePerPiece" = COALESCE(d."enteredValueOverride", v."cost", d."enteredValuePerPiece"),
        "enteredValueSource" = CASE
          WHEN d."enteredValueOverride" IS NOT NULL THEN 'user'
          WHEN v."cost" IS NOT NULL THEN 'infor'
          ELSE d."enteredValueSource"
        END,
        "identitySource" = 'infor',
        "updatedAt" = NOW()
      FROM (VALUES ${values}) AS v("itemSku", "description", "origin", "cost")
      WHERE d."companyId" = ${companyId}
        AND upper(btrim(d."itemSku")) = v."itemSku"
        AND (
          COALESCE(NULLIF(d."itemDescriptionOverride", ''), v."description", d."itemDescription") IS DISTINCT FROM d."itemDescription"
          OR COALESCE(v."origin", d."countryOfOrigin") IS DISTINCT FROM d."countryOfOrigin"
          OR COALESCE(d."enteredValueOverride", v."cost", d."enteredValuePerPiece") IS DISTINCT FROM d."enteredValuePerPiece"
          OR d."identitySource" IS DISTINCT FROM 'infor'
        )
      RETURNING d."id"
    `);
    updated += rows.length;
  }
  return { inforItems: identities.length, updated };
}

export async function refreshCompanyItemDuties(companyId: string): Promise<{ discovered: number }> {
  await ensureCompanyItemDutyTable();
  await clearSpreadsheetDutyAmounts(companyId).catch((error) => {
    console.warn('Duty spreadsheet amount cleanup failed:', error);
    return 0;
  });
  const identity = await applyDutyInforIdentity(companyId).catch((error) => {
    console.warn('Duty Infor identity apply failed:', error);
    return { inforItems: 0, updated: 0 };
  });
  await overlayDutyIdentityFromInfor(companyId).catch((error) => {
    console.warn('Duty Infor HTS overlay failed:', error);
    return 0;
  });
  return { discovered: identity.inforItems };
}

/**
 * Description, origin and value are overrides: a submitted value wins over Infor and a submitted
 * blank clears the override so Infor applies again. Origin is the per-item COO override shared
 * with SGP Freight. Callers must send only fields the user changed.
 */
export async function updateCompanyItemDuties(
  companyId: string,
  patches: CompanyItemDutyPatch[],
  editedBy: string | null = null
): Promise<CompanyItemDutyRow[]> {
  const updatedIds: string[] = [];
  const cooPatches: Array<{ itemSku: string; vendorCoo: string | null }> = [];
  let identityTouched = false;
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
    const countryOfOrigin = patch.countryOfOrigin === undefined ? undefined : dutyOriginCode(patch.countryOfOrigin);
    const tradeProgram = patch.tradeProgram === undefined ? undefined : asTradeProgram(patch.tradeProgram);
    const qtyUnit = patch.qtyUnit === undefined ? undefined : asQtyUnit(patch.qtyUnit);
    const dutyCode = patch.dutyCode === undefined ? undefined : String(patch.dutyCode || '').trim().toUpperCase() || null;
    const enteredValuePerPiece =
      patch.enteredValuePerPiece === undefined ? undefined : asNullableNumber(patch.enteredValuePerPiece);
    const dutyPerPiece = patch.dutyPerPiece === undefined ? undefined : asNullableNumber(patch.dutyPerPiece);
    const tariffPerPiece = patch.tariffPerPiece === undefined ? undefined : asNullableNumber(patch.tariffPerPiece);
    const itemDescription =
      patch.itemDescription === undefined ? undefined : String(patch.itemDescription || '').trim() || null;
    if (itemDescription !== undefined || countryOfOrigin !== undefined || enteredValuePerPiece !== undefined) {
      identityTouched = true;
    }
    // Ownership follows an actual value change, so re-submitting an unchanged value does not
    // freeze a field against the Infor refresh.
    const htsIdentityChanged = Prisma.sql`(
      (${htsCode !== undefined} AND COALESCE(${htsCode ?? null}::text, '') <> COALESCE("htsCode", ''))
      OR (${specialHtsCode !== undefined} AND COALESCE(${specialHtsCode ?? null}::text, '') <> COALESCE("specialHtsCode", ''))
      OR (${section301HtsCode !== undefined} AND COALESCE(${section301HtsCode ?? null}::text, '') <> COALESCE("section301HtsCode", ''))
      OR (${section232HtsCode !== undefined} AND COALESCE(${section232HtsCode ?? null}::text, '') <> COALESCE("section232HtsCode", ''))
      OR (${ieepaHtsCode !== undefined} AND COALESCE(${ieepaHtsCode ?? null}::text, '') <> COALESCE("ieepaHtsCode", ''))
      OR (${additionalHtsCode !== undefined} AND COALESCE(${additionalHtsCode ?? null}::text, '') <> COALESCE("additionalHtsCode", ''))
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

    const rows = await prisma.$queryRaw<Array<{ id: string; itemSku: string }>>`
      UPDATE "CompanyItemDuty"
      SET
        "itemDescriptionOverride" = CASE WHEN ${itemDescription !== undefined} THEN ${itemDescription ?? null}::text ELSE "itemDescriptionOverride" END,
        "itemDescription" = CASE WHEN ${itemDescription !== undefined} THEN COALESCE(${itemDescription ?? null}::text, "itemDescription") ELSE "itemDescription" END,
        "htsCode" = CASE WHEN ${htsCode !== undefined} THEN ${htsCode} ELSE "htsCode" END,
        "specialHtsCode" = CASE WHEN ${specialHtsCode !== undefined} THEN ${specialHtsCode} ELSE "specialHtsCode" END,
        "section301HtsCode" = CASE WHEN ${section301HtsCode !== undefined} THEN ${section301HtsCode} ELSE "section301HtsCode" END,
        "section232HtsCode" = CASE WHEN ${section232HtsCode !== undefined} THEN ${section232HtsCode} ELSE "section232HtsCode" END,
        "ieepaHtsCode" = CASE WHEN ${ieepaHtsCode !== undefined} THEN ${ieepaHtsCode} ELSE "ieepaHtsCode" END,
        "additionalHtsCode" = CASE WHEN ${additionalHtsCode !== undefined} THEN ${additionalHtsCode} ELSE "additionalHtsCode" END,
        "countryOfOrigin" = CASE WHEN ${countryOfOrigin !== undefined} THEN COALESCE(${countryOfOrigin ?? null}::text, "countryOfOrigin") ELSE "countryOfOrigin" END,
        "tradeProgram" = CASE WHEN ${tradeProgram !== undefined} THEN ${tradeProgram} ELSE "tradeProgram" END,
        "qtyUnit" = CASE WHEN ${qtyUnit !== undefined} THEN ${qtyUnit} ELSE "qtyUnit" END,
        "dutyCode" = CASE WHEN ${dutyCode !== undefined} THEN ${dutyCode} ELSE "dutyCode" END,
        "dutyCodeSource" = CASE WHEN ${dutyCodeChanged} THEN 'user' ELSE "dutyCodeSource" END,
        "enteredValueOverride" = CASE WHEN ${enteredValuePerPiece !== undefined} THEN ${enteredValuePerPiece ?? null}::double precision ELSE "enteredValueOverride" END,
        "enteredValuePerPiece" = CASE WHEN ${enteredValuePerPiece !== undefined} THEN COALESCE(${enteredValuePerPiece ?? null}::double precision, "enteredValuePerPiece") ELSE "enteredValuePerPiece" END,
        "enteredValueSource" = CASE WHEN ${enteredValuePerPiece != null} THEN 'user' ELSE "enteredValueSource" END,
        "dutyPerPiece" = CASE WHEN ${dutyPerPiece !== undefined} THEN ${dutyPerPiece} ELSE "dutyPerPiece" END,
        "tariffPerPiece" = CASE WHEN ${tariffPerPiece !== undefined} THEN ${tariffPerPiece} ELSE "tariffPerPiece" END,
        "rateSource" = CASE WHEN ${rateChanged} THEN 'user' ELSE "rateSource" END,
        "htsInputSource" = CASE WHEN ${htsIdentityChanged} THEN 'user' ELSE "htsInputSource" END,
        "programInputSource" = CASE WHEN ${programChanged} THEN 'user' ELSE "programInputSource" END,
        "userEditedAt" = CASE
          WHEN ${htsIdentityChanged} OR ${programChanged} OR ${dutyCodeChanged} OR ${enteredValueChanged} OR ${rateChanged}
            OR ${itemDescription !== undefined} OR ${countryOfOrigin !== undefined}
          THEN NOW()
          ELSE "userEditedAt"
        END,
        "updatedAt" = NOW()
      WHERE "companyId" = ${companyId}
        AND (
          (${id} <> '' AND "id" = ${id})
          OR (${itemSku} <> '' AND "itemSku" = ${itemSku})
        )
      RETURNING "id", "itemSku"
    `;
    if (rows[0]?.id) {
      updatedIds.push(rows[0].id);
      if (countryOfOrigin !== undefined) cooPatches.push({ itemSku: rows[0].itemSku, vendorCoo: countryOfOrigin });
    }
  }

  if (cooPatches.length) {
    const { updateCompanyItemFreight } = await import('@/lib/operations/item-freight-overlay');
    await updateCompanyItemFreight(companyId, cooPatches, editedBy);
  }
  // Re-applies Infor so a cleared override falls back to Infor's value right away.
  if (identityTouched) await applyDutyInforIdentity(companyId);

  if (!updatedIds.length) return [];
  const rows = await prisma.$queryRaw<DutyDbRow[]>`
    SELECT ${DUTY_SELECT_COLUMNS}
    FROM "CompanyItemDuty"
    WHERE "companyId" = ${companyId}
      AND "id" IN (${Prisma.join(updatedIds.map((id) => Prisma.sql`${id}`))})
    ORDER BY "itemSku" ASC
  `;
  return rows.map(serializeCompanyItemDuty);
}
