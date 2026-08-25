import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  calcCbmFromInches,
  calcItemFreight,
  deriveShipmentType,
  parseSgpFreightWorkbook,
  DEFAULT_SGP_FREIGHT_ASSUMPTIONS,
  normalizeSgpFreightAssumptions,
  type ParsedSgpFreightRow,
  type SgpFreightAssumptions,
} from '@/lib/operational/apr-sgp-freight';
import { normalizeHtsCode, normalizeItemSku } from '@/lib/hts/item-duty-overlay';
import { loadPrimaryVendorByItem } from '@/lib/operations/vendor-monthly-forecast-db';
import { APR_SGP_GMPA_SOURCE_CODE } from '@/lib/operational/apr-sgp-gmpa';
import * as XLSX from 'xlsx';

export type CompanyItemFreightRow = {
  id: string;
  companyId: string;
  itemSku: string;
  itemDescription: string | null;
  revision: string | null;
  quantityOrdered: number | null;
  orderMultiple: number | null;
  heightIn: number | null;
  widthIn: number | null;
  orderMinimum: number | null;
  lengthIn: number | null;
  cbm: number | null;
  cbmIsManual: boolean;
  unitWeight: number | null;
  unitCost: number | null;
  currentUnitCost: number | null;
  percentOfContainer: number | null;
  estimatedFreightCurrent: number | null;
  estimatedFreightFuture: number | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorCoo: string | null;
  shipmentType: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  qtyOnHand: number | null;
  productCode: string | null;
  costType: string | null;
  costMethod: string | null;
  plannerCode: string | null;
  ratePerDay: number | null;
  leadTime: number | null;
  materialStatus: string | null;
  reason: string | null;
  lastChange: string | null;
  sheetUser: string | null;
  nonNettableStock: number | null;
  safetyStock: number | null;
  allocatedQty: number | null;
  identitySource: string;
  lastSpreadsheetSeedAt: string | null;
  userEditedAt: string | null;
  updatedAt: string;
};

export type CompanyItemFreightSettings = SgpFreightAssumptions & {
  userEditedAt: string | null;
  lastSpreadsheetSeedAt: string | null;
};

export type CompanyItemFreightPatch = {
  id?: string;
  itemSku?: string;
  quantityOrdered?: number | null;
  orderMultiple?: number | null;
  heightIn?: number | null;
  widthIn?: number | null;
  orderMinimum?: number | null;
  lengthIn?: number | null;
  cbm?: number | null;
  unitWeight?: number | null;
  unitCost?: number | null;
  currentUnitCost?: number | null;
};

type FreightDbRow = {
  id: string;
  companyId: string;
  itemSku: string;
  itemDescription: string | null;
  revision: string | null;
  quantityOrdered: number | null;
  orderMultiple: number | null;
  heightIn: number | null;
  widthIn: number | null;
  orderMinimum: number | null;
  lengthIn: number | null;
  cbm: number | null;
  cbmIsManual: boolean | null;
  unitWeight: number | null;
  unitCost: number | null;
  currentUnitCost: number | null;
  spreadsheetCbm: number | null;
  spreadsheetFreightCurrent: number | null;
  spreadsheetFreightFuture: number | null;
  spreadsheetVendorId: string | null;
  spreadsheetVendorName: string | null;
  spreadsheetVendorCoo: string | null;
  shipmentType: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  spreadsheetQtyOnHand: number | null;
  productCode: string | null;
  costType: string | null;
  costMethod: string | null;
  plannerCode: string | null;
  ratePerDay: number | null;
  leadTime: number | null;
  materialStatus: string | null;
  reason: string | null;
  lastChange: string | null;
  sheetUser: string | null;
  nonNettableStock: number | null;
  safetyStock: number | null;
  allocatedQty: number | null;
  identitySource: string | null;
  lastSpreadsheetSeedAt: Date | null;
  userEditedAt: Date | null;
  updatedAt: Date;
};

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureCompanyItemFreightTable(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyItemFreight" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "itemSku" TEXT NOT NULL,
          "itemDescription" TEXT,
          "revision" TEXT,
          "quantityOrdered" DOUBLE PRECISION,
          "orderMultiple" DOUBLE PRECISION,
          "heightIn" DOUBLE PRECISION,
          "widthIn" DOUBLE PRECISION,
          "orderMinimum" DOUBLE PRECISION,
          "lengthIn" DOUBLE PRECISION,
          "cbm" DOUBLE PRECISION,
          "cbmIsManual" BOOLEAN NOT NULL DEFAULT FALSE,
          "unitWeight" DOUBLE PRECISION,
          "unitCost" DOUBLE PRECISION,
          "currentUnitCost" DOUBLE PRECISION,
          "spreadsheetCbm" DOUBLE PRECISION,
          "spreadsheetFreightCurrent" DOUBLE PRECISION,
          "spreadsheetFreightFuture" DOUBLE PRECISION,
          "spreadsheetVendorId" TEXT,
          "spreadsheetVendorName" TEXT,
          "spreadsheetVendorCoo" TEXT,
          "shipmentType" TEXT,
          "htsCode" TEXT,
          "countryOfOrigin" TEXT,
          "identitySource" TEXT NOT NULL DEFAULT 'spreadsheet',
          "lastSpreadsheetSeedAt" TIMESTAMP(3),
          "userEditedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyItemFreight_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CompanyItemFreight_companyId_itemSku_key"
          ON "CompanyItemFreight"("companyId", "itemSku")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CompanyItemFreight_companyId_idx"
          ON "CompanyItemFreight"("companyId")
      `);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "spreadsheetQtyOnHand" DOUBLE PRECISION`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "productCode" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "costType" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "costMethod" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "plannerCode" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "ratePerDay" DOUBLE PRECISION`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "leadTime" DOUBLE PRECISION`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "materialStatus" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "reason" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "lastChange" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "sheetUser" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "nonNettableStock" DOUBLE PRECISION`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "safetyStock" DOUBLE PRECISION`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "allocatedQty" DOUBLE PRECISION`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyItemFreightSettings" (
          "companyId" TEXT NOT NULL,
          "domesticRateCurrent" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
          "domesticRateIncrease" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
          "averageShipmentCost" DOUBLE PRECISION NOT NULL DEFAULT 10000,
          "estimatedFreightCost" DOUBLE PRECISION NOT NULL DEFAULT 10000,
          "freightCostIncrease" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "containerCbm" DOUBLE PRECISION NOT NULL DEFAULT 55,
          "userEditedAt" TIMESTAMP(3),
          "lastSpreadsheetSeedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyItemFreightSettings_pkey" PRIMARY KEY ("companyId")
        )
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  const time = value.getTime();
  return Number.isFinite(time) ? value.toISOString() : null;
}

function effectiveCbm(row: Pick<FreightDbRow, 'cbm' | 'cbmIsManual' | 'heightIn' | 'widthIn' | 'lengthIn'>): number | null {
  if (row.cbmIsManual) return asNullableNumber(row.cbm);
  return calcCbmFromInches(row.heightIn, row.widthIn, row.lengthIn) ?? asNullableNumber(row.cbm);
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value == null || value === undefined) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function serializeFreight(
  row: FreightDbRow,
  extras: {
    vendorId?: string | null;
    vendorName?: string | null;
    htsCode?: string | null;
    countryOfOrigin?: string | null;
    qtyOnHand?: number | null;
    itemDescription?: string | null;
    revision?: string | null;
    unitCost?: number | null;
    currentUnitCost?: number | null;
    productCode?: string | null;
    materialStatus?: string | null;
    heightIn?: number | null;
    widthIn?: number | null;
    lengthIn?: number | null;
    cbm?: number | null;
    unitWeight?: number | null;
    quantityOrdered?: number | null;
    orderMultiple?: number | null;
    orderMinimum?: number | null;
  },
  assumptions: SgpFreightAssumptions
): CompanyItemFreightRow {
  const userOwned = Boolean(row.userEditedAt);
  const heightIn = userOwned ? asNullableNumber(row.heightIn) : firstNumber(asNullableNumber(row.heightIn), extras?.heightIn);
  const widthIn = userOwned ? asNullableNumber(row.widthIn) : firstNumber(asNullableNumber(row.widthIn), extras?.widthIn);
  const lengthIn = userOwned ? asNullableNumber(row.lengthIn) : firstNumber(asNullableNumber(row.lengthIn), extras?.lengthIn);
  const cbm = effectiveCbm({ ...row, heightIn, widthIn, lengthIn }) ?? (userOwned ? null : extras?.cbm ?? null);
  const origin = firstText(row.countryOfOrigin, extras?.countryOfOrigin);
  const vendorCoo = firstText(row.spreadsheetVendorCoo);
  const unitCost = userOwned ? asNullableNumber(row.unitCost) : firstNumber(asNullableNumber(row.unitCost), extras?.unitCost);
  const currentUnitCost = userOwned
    ? asNullableNumber(row.currentUnitCost)
    : firstNumber(asNullableNumber(row.currentUnitCost), extras?.currentUnitCost);
  const shipmentType = deriveShipmentType(row.shipmentType, row.spreadsheetVendorCoo || origin);
  const calculated = calcItemFreight({
    cbm,
    shipmentType,
    unitCost,
    currentUnitCost,
    orderMultiple: userOwned
      ? asNullableNumber(row.orderMultiple)
      : firstNumber(asNullableNumber(row.orderMultiple), extras?.orderMultiple),
    assumptions,
  });
  return {
    id: row.id,
    companyId: row.companyId,
    itemSku: row.itemSku,
    itemDescription: firstText(extras?.itemDescription, row.itemDescription),
    revision: firstText(row.revision, extras?.revision),
    quantityOrdered: userOwned
      ? asNullableNumber(row.quantityOrdered)
      : firstNumber(asNullableNumber(row.quantityOrdered), extras?.quantityOrdered),
    orderMultiple: userOwned
      ? asNullableNumber(row.orderMultiple)
      : firstNumber(asNullableNumber(row.orderMultiple), extras?.orderMultiple),
    heightIn,
    widthIn,
    orderMinimum: userOwned
      ? asNullableNumber(row.orderMinimum)
      : firstNumber(asNullableNumber(row.orderMinimum), extras?.orderMinimum),
    lengthIn,
    cbm,
    cbmIsManual: Boolean(row.cbmIsManual) || (!heightIn && !widthIn && !lengthIn && cbm != null),
    unitWeight: userOwned
      ? asNullableNumber(row.unitWeight)
      : firstNumber(asNullableNumber(row.unitWeight), extras?.unitWeight),
    unitCost,
    currentUnitCost,
    percentOfContainer: calculated.percentOfContainer,
    estimatedFreightCurrent: calculated.estimatedFreightCurrent,
    estimatedFreightFuture: calculated.estimatedFreightFuture,
    vendorId: firstText(row.spreadsheetVendorId, extras?.vendorId),
    vendorName: firstText(row.spreadsheetVendorName, extras?.vendorName),
    vendorCoo,
    shipmentType,
    htsCode: firstText(row.htsCode, extras?.htsCode),
    countryOfOrigin: origin,
    qtyOnHand: firstNumber(extras?.qtyOnHand, asNullableNumber(row.spreadsheetQtyOnHand)),
    productCode: firstText(row.productCode, extras?.productCode),
    costType: firstText(row.costType),
    costMethod: firstText(row.costMethod),
    plannerCode: firstText(row.plannerCode),
    ratePerDay: asNullableNumber(row.ratePerDay),
    leadTime: asNullableNumber(row.leadTime),
    materialStatus: firstText(row.materialStatus, extras?.materialStatus),
    reason: firstText(row.reason),
    lastChange: firstText(row.lastChange),
    sheetUser: firstText(row.sheetUser),
    nonNettableStock: asNullableNumber(row.nonNettableStock),
    safetyStock: asNullableNumber(row.safetyStock),
    allocatedQty: asNullableNumber(row.allocatedQty),
    identitySource: row.identitySource || 'spreadsheet',
    lastSpreadsheetSeedAt: toIso(row.lastSpreadsheetSeedAt),
    userEditedAt: toIso(row.userEditedAt),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
  };
}

async function upsertFreightRows(companyId: string, rows: ParsedSgpFreightRow[], mode: 'spreadsheet' | 'identity'): Promise<number> {
  if (!rows.length) return 0;
  const chunkSize = 150;
  let written = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const values = chunk.map((row) => {
      const itemSku = normalizeItemSku(row.itemSku);
      const cbm = row.cbm ?? calcCbmFromInches(row.heightIn, row.widthIn, row.lengthIn);
      return Prisma.sql`(
        ${randomUUID()},
        ${companyId},
        ${itemSku},
        ${row.itemDescription},
        ${row.revision},
        ${row.quantityOrdered},
        ${row.orderMultiple},
        ${row.heightIn},
        ${row.widthIn},
        ${row.orderMinimum},
        ${row.lengthIn},
        ${cbm},
        FALSE,
        ${row.unitWeight},
        ${row.unitCost},
        ${row.currentUnitCost},
        ${cbm},
        ${row.estimatedFreightCurrent},
        ${row.estimatedFreightFuture},
        ${row.vendorId},
        ${row.vendorName},
        ${row.vendorCoo},
        ${row.shipmentType},
        ${normalizeHtsCode(row.htsCode)},
        ${row.countryOfOrigin},
        ${row.qtyOnHand},
        ${row.productCode},
        ${row.costType},
        ${row.costMethod},
        ${row.plannerCode},
        ${row.ratePerDay},
        ${row.leadTime},
        ${row.materialStatus},
        ${row.reason},
        ${row.lastChange},
        ${row.sheetUser},
        ${row.nonNettableStock},
        ${row.safetyStock},
        ${row.allocatedQty},
        ${mode},
        ${mode === 'spreadsheet' ? new Date() : null},
        NOW(),
        NOW()
      )`;
    });
    if (mode === 'spreadsheet') {
      await prisma.$executeRaw`
        INSERT INTO "CompanyItemFreight" (
          "id", "companyId", "itemSku", "itemDescription", "revision",
          "quantityOrdered", "orderMultiple", "heightIn", "widthIn", "orderMinimum", "lengthIn",
          "cbm", "cbmIsManual", "unitWeight", "unitCost", "currentUnitCost",
          "spreadsheetCbm", "spreadsheetFreightCurrent", "spreadsheetFreightFuture",
          "spreadsheetVendorId", "spreadsheetVendorName", "spreadsheetVendorCoo",
          "shipmentType", "htsCode", "countryOfOrigin",
          "spreadsheetQtyOnHand", "productCode", "costType", "costMethod", "plannerCode",
          "ratePerDay", "leadTime", "materialStatus", "reason", "lastChange", "sheetUser",
          "nonNettableStock", "safetyStock", "allocatedQty", "identitySource",
          "lastSpreadsheetSeedAt", "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("companyId", "itemSku")
        DO UPDATE SET
          "itemDescription" = COALESCE("CompanyItemFreight"."itemDescription", EXCLUDED."itemDescription"),
          "revision" = COALESCE("CompanyItemFreight"."revision", EXCLUDED."revision"),
          "quantityOrdered" = COALESCE("CompanyItemFreight"."quantityOrdered", EXCLUDED."quantityOrdered"),
          "orderMultiple" = COALESCE("CompanyItemFreight"."orderMultiple", EXCLUDED."orderMultiple"),
          "heightIn" = COALESCE("CompanyItemFreight"."heightIn", EXCLUDED."heightIn"),
          "widthIn" = COALESCE("CompanyItemFreight"."widthIn", EXCLUDED."widthIn"),
          "orderMinimum" = COALESCE("CompanyItemFreight"."orderMinimum", EXCLUDED."orderMinimum"),
          "lengthIn" = COALESCE("CompanyItemFreight"."lengthIn", EXCLUDED."lengthIn"),
          "cbm" = COALESCE("CompanyItemFreight"."cbm", EXCLUDED."cbm"),
          "unitWeight" = COALESCE("CompanyItemFreight"."unitWeight", EXCLUDED."unitWeight"),
          "unitCost" = COALESCE("CompanyItemFreight"."unitCost", EXCLUDED."unitCost"),
          "currentUnitCost" = COALESCE("CompanyItemFreight"."currentUnitCost", EXCLUDED."currentUnitCost"),
          "spreadsheetCbm" = COALESCE("CompanyItemFreight"."spreadsheetCbm", EXCLUDED."spreadsheetCbm"),
          "spreadsheetFreightCurrent" = COALESCE("CompanyItemFreight"."spreadsheetFreightCurrent", EXCLUDED."spreadsheetFreightCurrent"),
          "spreadsheetFreightFuture" = COALESCE("CompanyItemFreight"."spreadsheetFreightFuture", EXCLUDED."spreadsheetFreightFuture"),
          "spreadsheetVendorId" = COALESCE("CompanyItemFreight"."spreadsheetVendorId", EXCLUDED."spreadsheetVendorId"),
          "spreadsheetVendorName" = COALESCE("CompanyItemFreight"."spreadsheetVendorName", EXCLUDED."spreadsheetVendorName"),
          "spreadsheetVendorCoo" = COALESCE("CompanyItemFreight"."spreadsheetVendorCoo", EXCLUDED."spreadsheetVendorCoo"),
          "shipmentType" = COALESCE("CompanyItemFreight"."shipmentType", EXCLUDED."shipmentType"),
          "htsCode" = COALESCE("CompanyItemFreight"."htsCode", EXCLUDED."htsCode"),
          "countryOfOrigin" = COALESCE("CompanyItemFreight"."countryOfOrigin", EXCLUDED."countryOfOrigin"),
          "spreadsheetQtyOnHand" = COALESCE("CompanyItemFreight"."spreadsheetQtyOnHand", EXCLUDED."spreadsheetQtyOnHand"),
          "productCode" = COALESCE("CompanyItemFreight"."productCode", EXCLUDED."productCode"),
          "costType" = COALESCE("CompanyItemFreight"."costType", EXCLUDED."costType"),
          "costMethod" = COALESCE("CompanyItemFreight"."costMethod", EXCLUDED."costMethod"),
          "plannerCode" = COALESCE("CompanyItemFreight"."plannerCode", EXCLUDED."plannerCode"),
          "ratePerDay" = COALESCE("CompanyItemFreight"."ratePerDay", EXCLUDED."ratePerDay"),
          "leadTime" = COALESCE("CompanyItemFreight"."leadTime", EXCLUDED."leadTime"),
          "materialStatus" = COALESCE("CompanyItemFreight"."materialStatus", EXCLUDED."materialStatus"),
          "reason" = COALESCE("CompanyItemFreight"."reason", EXCLUDED."reason"),
          "lastChange" = COALESCE("CompanyItemFreight"."lastChange", EXCLUDED."lastChange"),
          "sheetUser" = COALESCE("CompanyItemFreight"."sheetUser", EXCLUDED."sheetUser"),
          "nonNettableStock" = COALESCE("CompanyItemFreight"."nonNettableStock", EXCLUDED."nonNettableStock"),
          "safetyStock" = COALESCE("CompanyItemFreight"."safetyStock", EXCLUDED."safetyStock"),
          "allocatedQty" = COALESCE("CompanyItemFreight"."allocatedQty", EXCLUDED."allocatedQty"),
          "identitySource" = 'spreadsheet',
          "lastSpreadsheetSeedAt" = NOW(),
          "updatedAt" = NOW()
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO "CompanyItemFreight" (
          "id", "companyId", "itemSku", "itemDescription", "revision",
          "quantityOrdered", "orderMultiple", "heightIn", "widthIn", "orderMinimum", "lengthIn",
          "cbm", "cbmIsManual", "unitWeight", "unitCost", "currentUnitCost",
          "spreadsheetCbm", "spreadsheetFreightCurrent", "spreadsheetFreightFuture",
          "spreadsheetVendorId", "spreadsheetVendorName", "spreadsheetVendorCoo",
          "shipmentType", "htsCode", "countryOfOrigin",
          "spreadsheetQtyOnHand", "productCode", "costType", "costMethod", "plannerCode",
          "ratePerDay", "leadTime", "materialStatus", "reason", "lastChange", "sheetUser",
          "nonNettableStock", "safetyStock", "allocatedQty", "identitySource",
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getCompanyItemFreightSettings(companyId: string): Promise<CompanyItemFreightSettings> {
  await ensureCompanyItemFreightTable();
  const rows = await prisma.$queryRaw<Array<{
    domesticRateCurrent: number | null;
    domesticRateIncrease: number | null;
    averageShipmentCost: number | null;
    estimatedFreightCost: number | null;
    freightCostIncrease: number | null;
    containerCbm: number | null;
    userEditedAt: Date | null;
    lastSpreadsheetSeedAt: Date | null;
  }>>`
    SELECT
      "domesticRateCurrent", "domesticRateIncrease", "averageShipmentCost",
      "estimatedFreightCost", "freightCostIncrease", "containerCbm",
      "userEditedAt", "lastSpreadsheetSeedAt"
    FROM "CompanyItemFreightSettings"
    WHERE "companyId" = ${companyId}
    LIMIT 1
  `.catch(() => []);
  const row = rows[0];
  return {
    ...normalizeSgpFreightAssumptions(row || DEFAULT_SGP_FREIGHT_ASSUMPTIONS),
    userEditedAt: toIso(row?.userEditedAt),
    lastSpreadsheetSeedAt: toIso(row?.lastSpreadsheetSeedAt),
  };
}

export async function seedCompanyItemFreightSettings(
  companyId: string,
  assumptions: SgpFreightAssumptions | null | undefined
): Promise<CompanyItemFreightSettings> {
  await ensureCompanyItemFreightTable();
  const next = normalizeSgpFreightAssumptions(assumptions || DEFAULT_SGP_FREIGHT_ASSUMPTIONS);
  await prisma.$executeRaw`
    INSERT INTO "CompanyItemFreightSettings" (
      "companyId", "domesticRateCurrent", "domesticRateIncrease", "averageShipmentCost",
      "estimatedFreightCost", "freightCostIncrease", "containerCbm",
      "lastSpreadsheetSeedAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${companyId}, ${next.domesticRateCurrent}, ${next.domesticRateIncrease}, ${next.averageShipmentCost},
      ${next.estimatedFreightCost}, ${next.freightCostIncrease}, ${next.containerCbm},
      NOW(), NOW(), NOW()
    )
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "domesticRateCurrent" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN EXCLUDED."domesticRateCurrent" ELSE "CompanyItemFreightSettings"."domesticRateCurrent" END,
      "domesticRateIncrease" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN EXCLUDED."domesticRateIncrease" ELSE "CompanyItemFreightSettings"."domesticRateIncrease" END,
      "averageShipmentCost" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN EXCLUDED."averageShipmentCost" ELSE "CompanyItemFreightSettings"."averageShipmentCost" END,
      "estimatedFreightCost" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN EXCLUDED."estimatedFreightCost" ELSE "CompanyItemFreightSettings"."estimatedFreightCost" END,
      "freightCostIncrease" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN EXCLUDED."freightCostIncrease" ELSE "CompanyItemFreightSettings"."freightCostIncrease" END,
      "containerCbm" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN EXCLUDED."containerCbm" ELSE "CompanyItemFreightSettings"."containerCbm" END,
      "lastSpreadsheetSeedAt" = CASE WHEN "CompanyItemFreightSettings"."userEditedAt" IS NULL THEN NOW() ELSE "CompanyItemFreightSettings"."lastSpreadsheetSeedAt" END,
      "updatedAt" = NOW()
  `;
  return getCompanyItemFreightSettings(companyId);
}

export async function updateCompanyItemFreightSettings(
  companyId: string,
  patch: Partial<SgpFreightAssumptions>
): Promise<CompanyItemFreightSettings> {
  await ensureCompanyItemFreightTable();
  const current = await getCompanyItemFreightSettings(companyId);
  const next = normalizeSgpFreightAssumptions({ ...current, ...patch });
  await prisma.$executeRaw`
    INSERT INTO "CompanyItemFreightSettings" (
      "companyId", "domesticRateCurrent", "domesticRateIncrease", "averageShipmentCost",
      "estimatedFreightCost", "freightCostIncrease", "containerCbm",
      "userEditedAt", "lastSpreadsheetSeedAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${companyId}, ${next.domesticRateCurrent}, ${next.domesticRateIncrease}, ${next.averageShipmentCost},
      ${next.estimatedFreightCost}, ${next.freightCostIncrease}, ${next.containerCbm},
      NOW(), ${current.lastSpreadsheetSeedAt ? new Date(current.lastSpreadsheetSeedAt) : null}, NOW(), NOW()
    )
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "domesticRateCurrent" = EXCLUDED."domesticRateCurrent",
      "domesticRateIncrease" = EXCLUDED."domesticRateIncrease",
      "averageShipmentCost" = EXCLUDED."averageShipmentCost",
      "estimatedFreightCost" = EXCLUDED."estimatedFreightCost",
      "freightCostIncrease" = EXCLUDED."freightCostIncrease",
      "containerCbm" = EXCLUDED."containerCbm",
      "userEditedAt" = NOW(),
      "updatedAt" = NOW()
  `;
  return getCompanyItemFreightSettings(companyId);
}

export async function seedCompanyItemFreightFromRows(
  companyId: string,
  rows: ParsedSgpFreightRow[],
  assumptions?: SgpFreightAssumptions | null
): Promise<{ itemCount: number; seeded: number }> {
  await ensureCompanyItemFreightTable();
  const seeded = await upsertFreightRows(companyId, rows, 'spreadsheet');
  await seedCompanyItemFreightSettings(companyId, assumptions || DEFAULT_SGP_FREIGHT_ASSUMPTIONS);
  return { itemCount: rows.length, seeded };
}

async function loadStoredFreightParse(companyId: string): Promise<{ rows: ParsedSgpFreightRow[]; assumptions: SgpFreightAssumptions }> {
  const { getOperationalSystemConnection } = await import('@/lib/operational/operational-system-connections');
  const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
  const metadata = asRecord(connection?.connectionMetadata);
  const stored = asRecord(metadata.aprSgpFreightParsed);
  const storedRows = Array.isArray(stored.rows) ? (stored.rows as ParsedSgpFreightRow[]) : [];
  const storedAssumptions = stored.assumptions
    ? normalizeSgpFreightAssumptions(stored.assumptions)
    : DEFAULT_SGP_FREIGHT_ASSUMPTIONS;

  const upload = asRecord(metadata.aprSgpGmpaWorkbookUpload);
  const blobCandidates = [
    String(upload.blobUrl || '').trim(),
    ...((await prisma.companyDocument.findMany({
      where: { companyId },
      select: { blobUrl: true, originalFileName: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => [])) as Array<{ blobUrl: string | null; originalFileName: string | null }>)
      .filter((doc) => /gmpa|sgp|freight/i.test(String(doc.originalFileName || '')))
      .map((doc) => String(doc.blobUrl || '').trim()),
  ].filter(Boolean);

  for (const blobUrl of blobCandidates) {
    try {
      const response = await fetch(blobUrl, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) continue;
      const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer', cellDates: true });
      const parsed = parseSgpFreightWorkbook(workbook);
      if (parsed?.rows.length) {
        return { rows: parsed.rows, assumptions: parsed.assumptions };
      }
    } catch (error) {
      console.warn('SGP Freight workbook re-parse failed:', error);
    }
  }
  return { rows: storedRows, assumptions: storedAssumptions };
}

export async function seedCompanyItemFreightFromSgp(companyId: string): Promise<{ itemCount: number; seeded: number }> {
  const parsed = await loadStoredFreightParse(companyId);
  return seedCompanyItemFreightFromRows(companyId, parsed.rows, parsed.assumptions);
}

type CsiItemFacts = {
  description: string | null;
  revision: string | null;
  qtyOnHand: number | null;
  unitCost: number | null;
  currentUnitCost: number | null;
  productCode: string | null;
  materialStatus: string | null;
  cbm: number | null;
  unitWeight: number | null;
  heightIn: number | null;
  widthIn: number | null;
  lengthIn: number | null;
  quantityOrdered: number | null;
  orderMultiple: number | null;
  orderMinimum: number | null;
};

function payloadText(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text && text.toLowerCase() !== 'unknown item' && !/^#n\/?a$/i.test(text)) return text;
  }
  return null;
}

function payloadNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (value == null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function loadCsiItemFacts(companyId: string): Promise<Map<string, CsiItemFacts>> {
  const result = new Map<string, CsiItemFacts>();
  const rawDelegate = (prisma as any).inforRawRecord;
  if (!rawDelegate?.findMany) return result;

  const latest = await rawDelegate.findFirst({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      miProgram: { in: ['SLItems', 'SLITEMS'] },
    },
    select: { businessDate: true },
    orderBy: [{ businessDate: 'desc' }, { fetchedAt: 'desc' }, { createdAt: 'desc' }],
  }).catch(() => null);
  if (!latest?.businessDate) return result;

  const rows = await rawDelegate.findMany({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      miProgram: { in: ['SLItems', 'SLITEMS'] },
      businessDate: latest.businessDate,
    },
    select: { payload: true },
    take: 50000,
  }).catch(() => []);

  for (const row of rows as Array<{ payload?: Record<string, unknown> }>) {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : null;
    if (!payload) continue;
    const itemSku = normalizeItemSku(payloadText(payload, ['Item', 'item', 'ITNO'])).toUpperCase();
    if (!itemSku) continue;
    result.set(itemSku, {
      description: payloadText(payload, ['Description', 'description', 'ITDS']),
      revision: payloadText(payload, ['Revision', 'revision', 'Rev']),
      qtyOnHand: payloadNumber(payload, ['DerQtyOnHand', 'QtyOnHand', 'qtyOnHand']),
      unitCost: payloadNumber(payload, ['UnitCost', 'AvgUCost', 'DerUnitCost', 'AvgMatlCost']),
      currentUnitCost: payloadNumber(payload, ['CurUCost', 'CurMatCost', 'CurMatlCost']),
      productCode: payloadText(payload, ['ProductCode', 'PMTCode']),
      materialStatus: payloadText(payload, ['Stat', 'Status', 'MaterialStatus']),
      cbm: payloadNumber(payload, ['BoxCubicDim', 'CubicDim', 'CBM', 'Cbm']),
      unitWeight: payloadNumber(payload, ['UnitWeight', 'Weight', 'DerUnitWeight']),
      heightIn: payloadNumber(payload, ['Height', 'BoxHeight', 'HeightIn']),
      widthIn: payloadNumber(payload, ['Width', 'BoxWidth', 'WidthIn']),
      lengthIn: payloadNumber(payload, ['Length', 'BoxLength', 'LengthIn']),
      quantityOrdered: payloadNumber(payload, ['QtyOrdered', 'QuantityOrdered', 'OnOrder']),
      orderMultiple: payloadNumber(payload, ['OrderMultiple', 'LotSize', 'QtyMult']),
      orderMinimum: payloadNumber(payload, ['OrderMin', 'MinLotSize', 'OrderMinimum']),
    });
  }
  return result;
}

export async function listCompanyItemFreight(companyId: string): Promise<CompanyItemFreightRow[]> {
  const rows = await prisma.$queryRaw<FreightDbRow[]>`
    SELECT
      "id", "companyId", "itemSku", "itemDescription", "revision",
      "quantityOrdered", "orderMultiple", "heightIn", "widthIn", "orderMinimum", "lengthIn",
      "cbm", "cbmIsManual", "unitWeight", "unitCost", "currentUnitCost",
      "spreadsheetCbm", "spreadsheetFreightCurrent", "spreadsheetFreightFuture",
      "spreadsheetVendorId", "spreadsheetVendorName", "spreadsheetVendorCoo",
      "shipmentType", "htsCode", "countryOfOrigin",
      "spreadsheetQtyOnHand", "productCode", "costType", "costMethod", "plannerCode",
      "ratePerDay", "leadTime", "materialStatus", "reason", "lastChange", "sheetUser",
      "nonNettableStock", "safetyStock", "allocatedQty", "identitySource",
      "lastSpreadsheetSeedAt", "userEditedAt", "updatedAt"
    FROM "CompanyItemFreight"
    WHERE "companyId" = ${companyId}
    ORDER BY "itemSku" ASC
  `;
  const [vendorByItem, csiByItem, assumptions] = await Promise.all([
    loadPrimaryVendorByItem(companyId).catch(() => new Map()),
    loadCsiItemFacts(companyId).catch(() => new Map()),
    getCompanyItemFreightSettings(companyId),
  ]);
  return rows.map((row) => {
    const key = normalizeItemSku(row.itemSku).toUpperCase();
    const vendor = vendorByItem.get(key) || vendorByItem.get(row.itemSku);
    const csi = csiByItem.get(key);
    return serializeFreight(row, {
      vendorId: vendor?.vendorId || null,
      vendorName: vendor?.vendorName || null,
      qtyOnHand: csi?.qtyOnHand ?? null,
      itemDescription: csi?.description || null,
      revision: csi?.revision || null,
      productCode: csi?.productCode || null,
      materialStatus: csi?.materialStatus || null,
      heightIn: csi?.heightIn ?? null,
      widthIn: csi?.widthIn ?? null,
      lengthIn: csi?.lengthIn ?? null,
      cbm: csi?.cbm ?? null,
      unitWeight: csi?.unitWeight ?? null,
      quantityOrdered: csi?.quantityOrdered ?? null,
      orderMultiple: csi?.orderMultiple ?? null,
      orderMinimum: csi?.orderMinimum ?? null,
      unitCost: csi?.unitCost ?? null,
      currentUnitCost: csi?.currentUnitCost ?? null,
    }, assumptions);
  });
}

export async function refreshCompanyItemFreight(companyId: string): Promise<{ spreadsheetItems: number; discovered: number }> {
  await ensureCompanyItemFreightTable();
  const seeded = await seedCompanyItemFreightFromSgp(companyId);
  if (seeded.itemCount > 0) {
    await prisma.$executeRaw`
      DELETE FROM "CompanyItemFreight"
      WHERE "companyId" = ${companyId}
        AND "lastSpreadsheetSeedAt" IS NULL
        AND "userEditedAt" IS NULL
    `;
  }
  return { spreadsheetItems: seeded.itemCount, discovered: 0 };
}

export async function updateCompanyItemFreight(
  companyId: string,
  patches: CompanyItemFreightPatch[]
): Promise<CompanyItemFreightRow[]> {
  for (const patch of patches) {
    const id = String(patch.id || '').trim();
    const itemSku = normalizeItemSku(patch.itemSku);
    if (!id && !itemSku) continue;

    const quantityOrdered = patch.quantityOrdered === undefined ? undefined : asNullableNumber(patch.quantityOrdered);
    const orderMultiple = patch.orderMultiple === undefined ? undefined : asNullableNumber(patch.orderMultiple);
    const heightIn = patch.heightIn === undefined ? undefined : asNullableNumber(patch.heightIn);
    const widthIn = patch.widthIn === undefined ? undefined : asNullableNumber(patch.widthIn);
    const orderMinimum = patch.orderMinimum === undefined ? undefined : asNullableNumber(patch.orderMinimum);
    const lengthIn = patch.lengthIn === undefined ? undefined : asNullableNumber(patch.lengthIn);
    const unitWeight = patch.unitWeight === undefined ? undefined : asNullableNumber(patch.unitWeight);
    const unitCost = patch.unitCost === undefined ? undefined : asNullableNumber(patch.unitCost);
    const currentUnitCost = patch.currentUnitCost === undefined ? undefined : asNullableNumber(patch.currentUnitCost);
    const cbmPatched = patch.cbm !== undefined;
    const cbm = cbmPatched ? asNullableNumber(patch.cbm) : undefined;

    await prisma.$executeRaw`
      UPDATE "CompanyItemFreight"
      SET
        "quantityOrdered" = CASE WHEN ${quantityOrdered !== undefined} THEN ${quantityOrdered} ELSE "quantityOrdered" END,
        "orderMultiple" = CASE WHEN ${orderMultiple !== undefined} THEN ${orderMultiple} ELSE "orderMultiple" END,
        "heightIn" = CASE WHEN ${heightIn !== undefined} THEN ${heightIn} ELSE "heightIn" END,
        "widthIn" = CASE WHEN ${widthIn !== undefined} THEN ${widthIn} ELSE "widthIn" END,
        "orderMinimum" = CASE WHEN ${orderMinimum !== undefined} THEN ${orderMinimum} ELSE "orderMinimum" END,
        "lengthIn" = CASE WHEN ${lengthIn !== undefined} THEN ${lengthIn} ELSE "lengthIn" END,
        "cbmIsManual" = CASE
          WHEN ${cbmPatched} THEN TRUE
          WHEN ${heightIn !== undefined || widthIn !== undefined || lengthIn !== undefined} THEN FALSE
          ELSE "cbmIsManual"
        END,
        "cbm" = CASE
          WHEN ${cbmPatched} THEN ${cbm}
          ELSE "cbm"
        END,
        "unitWeight" = CASE WHEN ${unitWeight !== undefined} THEN ${unitWeight} ELSE "unitWeight" END,
        "unitCost" = CASE WHEN ${unitCost !== undefined} THEN ${unitCost} ELSE "unitCost" END,
        "currentUnitCost" = CASE WHEN ${currentUnitCost !== undefined} THEN ${currentUnitCost} ELSE "currentUnitCost" END,
        "userEditedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "companyId" = ${companyId}
        AND (
          (${id.length > 0} AND "id" = ${id || null})
          OR (${itemSku.length > 0} AND "itemSku" = ${itemSku || null})
        )
    `;
  }

  const dimensionPatches = patches.filter(
    (patch) => patch.cbm === undefined && (patch.heightIn !== undefined || patch.widthIn !== undefined || patch.lengthIn !== undefined)
  );
  for (const patch of dimensionPatches) {
    const id = String(patch.id || '').trim();
    const itemSku = normalizeItemSku(patch.itemSku);
    const current = await prisma.$queryRaw<Array<{ heightIn: number | null; widthIn: number | null; lengthIn: number | null }>>`
      SELECT "heightIn", "widthIn", "lengthIn"
      FROM "CompanyItemFreight"
      WHERE "companyId" = ${companyId}
        AND (
          (${id.length > 0} AND "id" = ${id || null})
          OR (${itemSku.length > 0} AND "itemSku" = ${itemSku || null})
        )
      LIMIT 1
    `;
    const nextCbm = calcCbmFromInches(current[0]?.heightIn ?? null, current[0]?.widthIn ?? null, current[0]?.lengthIn ?? null);
    if (nextCbm == null) continue;
    await prisma.$executeRaw`
      UPDATE "CompanyItemFreight"
      SET "cbm" = ${nextCbm}, "updatedAt" = NOW()
      WHERE "companyId" = ${companyId}
        AND "cbmIsManual" = FALSE
        AND (
          (${id.length > 0} AND "id" = ${id || null})
          OR (${itemSku.length > 0} AND "itemSku" = ${itemSku || null})
        )
    `;
  }

  return listCompanyItemFreight(companyId);
}
