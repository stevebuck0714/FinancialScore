import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  calcCbmFromInches,
  calcItemFreight,
  deriveShipmentType,
  DEFAULT_SGP_FREIGHT_ASSUMPTIONS,
  normalizeSgpFreightAssumptions,
  type SgpFreightAssumptions,
} from '@/lib/operational/sgp-freight-calc';
import { normalizeItemSku } from '@/lib/hts/item-duty-overlay';
import { normalizeOriginCode } from '@/lib/operational/apr-sgp-gmpa';
import { loadPrimaryVendorByItem } from '@/lib/operations/vendor-monthly-forecast-db';

export const EDITABLE_FREIGHT_FIELDS = [
  'vendorCoo',
  'qtyOnHand',
  'quantityOrdered',
  'orderMultiple',
  'orderMinimum',
  'heightIn',
  'widthIn',
  'lengthIn',
  'cbm',
  'unitWeight',
  'unitCost',
  'currentUnitCost',
  'plannerCode',
] as const;

export type EditableFreightField = (typeof EDITABLE_FREIGHT_FIELDS)[number];

/** Text fields where a user-entered value overrides Infor; clearing it falls back to Infor. */
export const OVERRIDE_FREIGHT_FIELDS = ['vendorCoo', 'plannerCode'] as const;

type OverrideFreightField = (typeof OVERRIDE_FREIGHT_FIELDS)[number];

const OVERRIDE_FALLBACK_COLUMNS: Record<OverrideFreightField, string> = {
  vendorCoo: 'spreadsheetVendorCoo',
  plannerCode: 'plannerCode',
};

function isOverrideField(field: EditableFreightField): field is OverrideFreightField {
  return (OVERRIDE_FREIGHT_FIELDS as readonly string[]).includes(field);
}

// Infor reports these as 0 when the item master has no value.
const ZERO_IS_BLANK = new Set<EditableFreightField>([
  'heightIn',
  'widthIn',
  'lengthIn',
  'cbm',
  'unitWeight',
  'orderMultiple',
  'unitCost',
  'currentUnitCost',
]);

const FIELD_COLUMNS: Record<EditableFreightField, string> = {
  vendorCoo: 'vendorCooOverride',
  plannerCode: 'plannerCodeOverride',
  qtyOnHand: 'spreadsheetQtyOnHand',
  quantityOrdered: 'quantityOrdered',
  orderMultiple: 'orderMultiple',
  orderMinimum: 'orderMinimum',
  heightIn: 'heightIn',
  widthIn: 'widthIn',
  lengthIn: 'lengthIn',
  cbm: 'cbm',
  unitWeight: 'unitWeight',
  unitCost: 'unitCost',
  currentUnitCost: 'currentUnitCost',
};

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
  inInfor: boolean;
  /** Editable fields whose value comes from Infor; these are read-only on the page. */
  inforFields: EditableFreightField[];
  /** Override fields where the user-entered value is replacing Infor's. */
  overriddenFields: OverrideFreightField[];
  inforVendorCoo: string | null;
  inforPlannerCode: string | null;
  identitySource: string;
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
  vendorCoo?: string | null;
  qtyOnHand?: number | null;
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
  plannerCode?: string | null;
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
  spreadsheetVendorId: string | null;
  spreadsheetVendorName: string | null;
  spreadsheetVendorCoo: string | null;
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
  vendorCooOverride: string | null;
  plannerCodeOverride: string | null;
  identitySource: string | null;
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
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "manualEdits" JSONB`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "vendorCooOverride" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemFreight" ADD COLUMN IF NOT EXISTS "plannerCodeOverride" TEXT`);
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

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstPositive(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const parsed = asNullableNumber(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function itemKey(itemSku: unknown): string {
  return normalizeItemSku(itemSku).toUpperCase();
}

/** Two-letter origin code, with the United States shown as DOM to match the freight sheet convention. */
export function vendorCooCode(value: unknown): string | null {
  const code = normalizeOriginCode(value);
  if (!code) return null;
  const upper = code.toUpperCase();
  return upper === 'US' ? 'DOM' : upper;
}

type CsiItemFacts = {
  description: string | null;
  revision: string | null;
  qtyOnHand: number | null;
  nonNettableStock: number | null;
  safetyStock: number | null;
  allocatedQty: number | null;
  unitCost: number | null;
  currentUnitCost: number | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
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
    const itemSku = itemKey(payloadText(payload, ['Item', 'item', 'ITNO']));
    if (!itemSku) continue;
    result.set(itemSku, {
      description: payloadText(payload, ['Description', 'description', 'ITDS']),
      revision: payloadText(payload, ['Revision', 'revision', 'Rev']),
      qtyOnHand: payloadNumber(payload, ['DerQtyOnHand', 'QtyOnHand', 'qtyOnHand']),
      nonNettableStock: payloadNumber(payload, ['DerNonNettableStock', 'NonNettableStock']),
      safetyStock: payloadNumber(payload, ['DerSafetyStock', 'SafetyStock']),
      allocatedQty: payloadNumber(payload, ['DerQtyAllocCo', 'QtyAllocCo', 'AllocatedQty']),
      unitCost: payloadNumber(payload, ['UnitCost', 'AvgUCost', 'DerUnitCost', 'AvgMatlCost']),
      currentUnitCost: payloadNumber(payload, ['CurUCost', 'CurMatCost', 'CurMatlCost']),
      htsCode: payloadText(payload, ['HtsCode', 'HTSCode', 'Hts']),
      countryOfOrigin: payloadText(payload, ['Country', 'Origin', 'NAFTACountryOfOrigin']),
      productCode: payloadText(payload, ['ProductCode', 'PMTCode']),
      costType: payloadText(payload, ['CostType']),
      costMethod: payloadText(payload, ['CostMethod']),
      plannerCode: payloadText(payload, ['PlanCode', 'PlannerCode']),
      ratePerDay: payloadNumber(payload, ['RatePerDay']),
      leadTime: payloadNumber(payload, ['LeadTime']),
      materialStatus: payloadText(payload, ['Stat', 'Status', 'MaterialStatus']),
      reason: payloadText(payload, ['ReasonCode']),
      lastChange: payloadText(payload, ['ChangeDate']),
      sheetUser: payloadText(payload, ['StatusChgUserCode']),
      cbm: payloadNumber(payload, ['BoxCubicDim', 'CubicDim', 'CBM', 'Cbm']),
      unitWeight: payloadNumber(payload, ['UnitWeight', 'Weight', 'DerUnitWeight']),
      heightIn: payloadNumber(payload, ['Height', 'BoxHeight', 'HeightIn']),
      widthIn: payloadNumber(payload, ['Width', 'BoxWidth', 'WidthIn']),
      lengthIn: payloadNumber(payload, ['Length', 'BoxLength', 'LengthIn']),
      quantityOrdered: payloadNumber(payload, ['DerQtyOrdered', 'QtyOrdered', 'QuantityOrdered', 'OnOrder']),
      orderMultiple: payloadNumber(payload, ['OrderMult', 'OrderMultiple', 'LotSize', 'QtyMult']),
      orderMinimum: payloadNumber(payload, ['OrderMin', 'MinLotSize', 'OrderMinimum']),
    });
  }
  return result;
}

type VendorAddress = { vendorName: string | null; country: string | null; status: string | null };

/** Latest Infor vendor master (SLVendors) name, address country and status per vendor. */
async function loadVendorAddresses(companyId: string): Promise<Map<string, VendorAddress>> {
  const rows = await prisma.$queryRaw<Array<{ vendorId: string } & VendorAddress>>`
    SELECT DISTINCT ON (TRIM("vendorId"))
      TRIM("vendorId") AS "vendorId",
      "vendorName",
      NULLIF(TRIM("country"), '') AS "country",
      NULLIF(TRIM("status"), '') AS "status"
    FROM "VendorSnapshot"
    WHERE "companyId" = ${companyId}
    ORDER BY TRIM("vendorId"), "snapshotDate" DESC
  `.catch(() => []);
  const result = new Map<string, VendorAddress>();
  for (const row of rows) result.set(row.vendorId, { vendorName: row.vendorName, country: row.country, status: row.status });
  return result;
}

const INACTIVE_STATUSES = new Set(['O', 'I']);

function isInactiveStatus(value: string | null | undefined): boolean {
  return INACTIVE_STATUSES.has(String(value || '').trim().toUpperCase());
}

function inforNumber(field: EditableFreightField, value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  if (ZERO_IS_BLANK.has(field) && Number(value) === 0) return null;
  return Number(value);
}

type ResolvedVendor = { vendorId: string; vendorName: string; country: string | null };

function serializeFreight(
  row: FreightDbRow,
  csi: CsiItemFacts | null,
  vendor: ResolvedVendor | null,
  assumptions: SgpFreightAssumptions
): CompanyItemFreightRow {
  const inforFields: EditableFreightField[] = [];
  const pick = (field: EditableFreightField, inforValue: number | null | undefined, stored: unknown) => {
    const value = inforNumber(field, inforValue);
    if (value != null) {
      inforFields.push(field);
      return value;
    }
    return asNullableNumber(stored);
  };

  const qtyOnHand = pick('qtyOnHand', csi?.qtyOnHand, row.spreadsheetQtyOnHand);
  const quantityOrdered = pick('quantityOrdered', csi?.quantityOrdered, row.quantityOrdered);
  const orderMultiple = pick('orderMultiple', csi?.orderMultiple, row.orderMultiple);
  const orderMinimum = pick('orderMinimum', csi?.orderMinimum, row.orderMinimum);
  const heightIn = pick('heightIn', csi?.heightIn, row.heightIn);
  const widthIn = pick('widthIn', csi?.widthIn, row.widthIn);
  const lengthIn = pick('lengthIn', csi?.lengthIn, row.lengthIn);
  const unitWeight = pick('unitWeight', csi?.unitWeight, row.unitWeight);
  const unitCost = pick('unitCost', csi?.unitCost, row.unitCost);
  const currentUnitCost = pick('currentUnitCost', csi?.currentUnitCost, row.currentUnitCost);

  const inforCbm = inforNumber('cbm', csi?.cbm);
  let cbm: number | null;
  if (inforCbm != null) {
    inforFields.push('cbm');
    cbm = inforCbm;
  } else if (row.cbmIsManual) {
    cbm = asNullableNumber(row.cbm);
  } else {
    cbm = calcCbmFromInches(heightIn, widthIn, lengthIn) ?? asNullableNumber(row.cbm);
  }

  const overriddenFields: OverrideFreightField[] = [];
  const inforCoo = vendorCooCode(vendor?.country);
  const cooOverride = vendorCooCode(row.vendorCooOverride);
  if (cooOverride) overriddenFields.push('vendorCoo');
  const vendorCoo = cooOverride || inforCoo || vendorCooCode(row.spreadsheetVendorCoo);
  const inforPlannerCode = firstText(csi?.plannerCode);
  const plannerOverride = firstText(row.plannerCodeOverride);
  if (plannerOverride) overriddenFields.push('plannerCode');
  const shipmentType = deriveShipmentType(null, vendorCoo);
  const calculated = calcItemFreight({ cbm, shipmentType, unitCost, currentUnitCost, orderMultiple, assumptions });

  return {
    id: row.id,
    companyId: row.companyId,
    itemSku: row.itemSku,
    itemDescription: firstText(csi?.description, row.itemDescription),
    revision: firstText(csi?.revision, row.revision),
    quantityOrdered,
    orderMultiple,
    heightIn,
    widthIn,
    orderMinimum,
    lengthIn,
    cbm,
    cbmIsManual: inforCbm == null && (Boolean(row.cbmIsManual) || (!heightIn && !widthIn && !lengthIn && cbm != null)),
    unitWeight,
    unitCost,
    currentUnitCost,
    percentOfContainer: calculated.percentOfContainer,
    estimatedFreightCurrent: calculated.estimatedFreightCurrent,
    estimatedFreightFuture: calculated.estimatedFreightFuture,
    vendorId: vendor?.vendorId || null,
    vendorName: vendor?.vendorName || null,
    vendorCoo,
    shipmentType,
    htsCode: firstText(csi?.htsCode, row.htsCode),
    countryOfOrigin: firstText(csi?.countryOfOrigin, row.countryOfOrigin),
    qtyOnHand,
    productCode: firstText(csi?.productCode, row.productCode),
    costType: firstText(csi?.costType, row.costType),
    costMethod: firstText(csi?.costMethod, row.costMethod),
    plannerCode: firstText(plannerOverride, inforPlannerCode, row.plannerCode),
    ratePerDay: firstNumber(csi?.ratePerDay, asNullableNumber(row.ratePerDay)),
    leadTime: firstNumber(csi?.leadTime, asNullableNumber(row.leadTime)),
    materialStatus: firstText(csi?.materialStatus, row.materialStatus),
    reason: firstText(csi?.reason, row.reason),
    lastChange: firstText(csi?.lastChange, row.lastChange),
    sheetUser: firstText(csi?.sheetUser, row.sheetUser),
    nonNettableStock: firstNumber(csi?.nonNettableStock, asNullableNumber(row.nonNettableStock)),
    safetyStock: firstNumber(csi?.safetyStock, asNullableNumber(row.safetyStock)),
    allocatedQty: firstNumber(csi?.allocatedQty, asNullableNumber(row.allocatedQty)),
    inInfor: Boolean(csi),
    inforFields,
    overriddenFields,
    inforVendorCoo: inforCoo,
    inforPlannerCode,
    identitySource: csi ? 'infor' : row.identitySource || 'manual',
    userEditedAt: toIso(row.userEditedAt),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
  };
}

function emptyFreightRow(companyId: string, itemSku: string): FreightDbRow {
  return {
    id: `infor-slitems:${companyId}:${itemSku}`,
    companyId,
    itemSku,
    itemDescription: null,
    revision: null,
    quantityOrdered: null,
    orderMultiple: null,
    heightIn: null,
    widthIn: null,
    orderMinimum: null,
    lengthIn: null,
    cbm: null,
    cbmIsManual: false,
    unitWeight: null,
    unitCost: null,
    currentUnitCost: null,
    spreadsheetVendorId: null,
    spreadsheetVendorName: null,
    spreadsheetVendorCoo: null,
    htsCode: null,
    countryOfOrigin: null,
    spreadsheetQtyOnHand: null,
    productCode: null,
    costType: null,
    costMethod: null,
    plannerCode: null,
    ratePerDay: null,
    leadTime: null,
    materialStatus: null,
    reason: null,
    lastChange: null,
    sheetUser: null,
    nonNettableStock: null,
    safetyStock: null,
    allocatedQty: null,
    vendorCooOverride: null,
    plannerCodeOverride: null,
    identitySource: 'infor',
    userEditedAt: null,
    updatedAt: new Date(),
  };
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

/**
 * Rows are built from the Infor item master plus any stored row. `scope: 'page'` limits the
 * result to what the SGP Freight page lists: items that have a primary vendor, excluding
 * items whose Infor item or vendor status is "O" or "I" unless `includeInactive` is set.
 */
export async function listCompanyItemFreight(
  companyId: string,
  options: { scope?: 'all' | 'page'; includeInactive?: boolean } = {}
): Promise<CompanyItemFreightRow[]> {
  await ensureCompanyItemFreightTable();
  const rows = await prisma.$queryRaw<FreightDbRow[]>`
    SELECT
      "id", "companyId", "itemSku", "itemDescription", "revision",
      "quantityOrdered", "orderMultiple", "heightIn", "widthIn", "orderMinimum", "lengthIn",
      "cbm", "cbmIsManual", "unitWeight", "unitCost", "currentUnitCost",
      "spreadsheetVendorId", "spreadsheetVendorName", "spreadsheetVendorCoo",
      "htsCode", "countryOfOrigin",
      "spreadsheetQtyOnHand", "productCode", "costType", "costMethod", "plannerCode",
      "ratePerDay", "leadTime", "materialStatus", "reason", "lastChange", "sheetUser",
      "nonNettableStock", "safetyStock", "allocatedQty", "vendorCooOverride", "plannerCodeOverride", "identitySource",
      "userEditedAt", "updatedAt"
    FROM "CompanyItemFreight"
    WHERE "companyId" = ${companyId}
  `;
  const [vendorByItem, csiByItem, vendorAddresses, assumptions] = await Promise.all([
    loadPrimaryVendorByItem(companyId).catch(() => new Map<string, { vendorId: string; vendorName: string }>()),
    loadCsiItemFacts(companyId).catch(() => new Map<string, CsiItemFacts>()),
    loadVendorAddresses(companyId),
    getCompanyItemFreightSettings(companyId),
  ]);

  const storedByKey = new Map<string, FreightDbRow>();
  for (const row of rows) {
    const key = itemKey(row.itemSku);
    if (key) storedByKey.set(key, row);
  }
  const keys = new Set<string>([...csiByItem.keys(), ...storedByKey.keys()]);
  const pageOnly = options.scope === 'page';
  const result: CompanyItemFreightRow[] = [];
  for (const key of keys) {
    const stored = storedByKey.get(key) || emptyFreightRow(companyId, key);
    const csi = csiByItem.get(key) || null;
    const inforVendor = vendorByItem.get(key);
    const vendorId = firstText(inforVendor?.vendorId, stored.spreadsheetVendorId);
    const address = vendorId ? vendorAddresses.get(vendorId) : undefined;
    if (pageOnly) {
      if (!vendorId) continue;
      if (!options.includeInactive && (isInactiveStatus(csi?.materialStatus) || isInactiveStatus(address?.status))) continue;
    }
    const vendorName = inforVendor
      ? firstText(inforVendor.vendorName !== inforVendor.vendorId ? inforVendor.vendorName : null, address?.vendorName, inforVendor.vendorId)
      : firstText(stored.spreadsheetVendorName, address?.vendorName, vendorId);
    const vendor = vendorId ? { vendorId, vendorName: vendorName || vendorId, country: address?.country ?? null } : null;
    result.push(serializeFreight(stored, csi, vendor, assumptions));
  }
  return result.sort((left, right) =>
    left.itemSku.localeCompare(right.itemSku, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Saves manual values for fields Infor leaves blank. Fields Infor supplies are skipped, and
 * Infor takes over again as soon as it reports a value.
 */
export async function updateCompanyItemFreight(
  companyId: string,
  patches: CompanyItemFreightPatch[],
  editedBy: string | null
): Promise<{ updated: number; skipped: Array<{ itemSku: string; field: EditableFreightField }> }> {
  await ensureCompanyItemFreightTable();
  const current = await listCompanyItemFreight(companyId);
  const byId = new Map(current.map((row) => [row.id, row]));
  const byKey = new Map(current.map((row) => [itemKey(row.itemSku), row]));
  const skipped: Array<{ itemSku: string; field: EditableFreightField }> = [];
  let updated = 0;

  for (const patch of patches) {
    const row = byId.get(String(patch.id || '').trim()) || byKey.get(itemKey(patch.itemSku));
    if (!row) continue;
    const locked = new Set(row.inforFields);
    const assignments: Array<{ column: string; value: string | number | boolean | null }> = [];
    const editedFields: EditableFreightField[] = [];
    for (const field of EDITABLE_FREIGHT_FIELDS) {
      const raw = patch[field];
      if (raw === undefined) continue;
      if (locked.has(field)) {
        skipped.push({ itemSku: row.itemSku, field });
        continue;
      }
      if (isOverrideField(field)) {
        const value = field === 'vendorCoo' ? vendorCooCode(raw) : firstText(raw == null ? null : String(raw));
        assignments.push({ column: FIELD_COLUMNS[field], value });
        // Clearing removes the stored fallback too, so the cell shows Infor's value or stays blank.
        if (value == null) assignments.push({ column: OVERRIDE_FALLBACK_COLUMNS[field], value: null });
      } else {
        assignments.push({ column: FIELD_COLUMNS[field], value: asNullableNumber(raw) });
      }
      editedFields.push(field);
    }
    if (!assignments.length) continue;
    if (editedFields.includes('cbm')) {
      assignments.push({ column: 'cbmIsManual', value: true });
    } else if (editedFields.some((field) => field === 'heightIn' || field === 'widthIn' || field === 'lengthIn')) {
      assignments.push({ column: 'cbmIsManual', value: false });
    }

    const at = new Date().toISOString();
    const manualEdits = JSON.stringify(Object.fromEntries(editedFields.map((field) => [field, { by: editedBy, at }])));
    const columns = assignments.map((assignment) => Prisma.raw(`"${assignment.column}"`));
    const values = assignments.map((assignment) => Prisma.sql`${assignment.value}`);
    const updates = assignments.map((assignment) => Prisma.raw(`"${assignment.column}" = EXCLUDED."${assignment.column}"`));
    await prisma.$executeRaw`
      INSERT INTO "CompanyItemFreight" (
        "id", "companyId", "itemSku", "identitySource", "manualEdits", "userEditedAt", "createdAt", "updatedAt",
        ${Prisma.join(columns)}
      )
      VALUES (
        ${randomUUID()}, ${companyId}, ${row.itemSku}, ${row.inInfor ? 'infor' : 'manual'}, ${manualEdits}::jsonb, NOW(), NOW(), NOW(),
        ${Prisma.join(values)}
      )
      ON CONFLICT ("companyId", "itemSku")
      DO UPDATE SET
        ${Prisma.join(updates)},
        "manualEdits" = COALESCE("CompanyItemFreight"."manualEdits", '{}'::jsonb) || EXCLUDED."manualEdits",
        "userEditedAt" = NOW(),
        "updatedAt" = NOW()
    `;
    updated += 1;
  }

  return { updated, skipped };
}

export async function listCompanyItemMaterialCosts(companyId: string): Promise<Record<string, number>> {
  await ensureCompanyItemFreightTable();
  const rows = await prisma.$queryRaw<Array<{
    itemSku: string;
    unitCost: number | null;
    currentUnitCost: number | null;
  }>>`
    SELECT "itemSku", "unitCost", "currentUnitCost"
    FROM "CompanyItemFreight"
    WHERE "companyId" = ${companyId}
  `.catch(() => []);
  const csiByItem = await loadCsiItemFacts(companyId).catch(() => new Map<string, CsiItemFacts>());
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = itemKey(row.itemSku);
    if (!key) continue;
    const csi = csiByItem.get(key);
    const cost = firstPositive(
      firstPositive(csi?.currentUnitCost, row.currentUnitCost),
      firstPositive(csi?.unitCost, row.unitCost)
    );
    if (cost != null) result[key] = cost;
  }
  for (const [key, csi] of csiByItem.entries()) {
    if (result[key]) continue;
    const cost = firstPositive(csi.currentUnitCost, csi.unitCost);
    if (cost != null) result[key] = cost;
  }
  return result;
}
