import prisma from '@/lib/prisma';
import { ensureCompanyItemDutyTable, listCompanyItemDuties } from '@/lib/hts/item-duty-overlay';
import { listCompanyItemFreight, listCompanyItemMaterialCosts } from '@/lib/operations/item-freight-overlay';
import {
  DEFAULT_SGP_OPERATING_EXPENSE_PCT,
  normalizeOperatingExpensePct,
  productMarginSkuKey,
  type ProductMarginItemOverlay,
} from '@/lib/operations/product-margin-calc';

export { DEFAULT_SGP_OPERATING_EXPENSE_PCT, normalizeOperatingExpensePct, sgpOperatingExpenseDollars } from '@/lib/operations/product-margin-calc';
export type { ProductMarginItemOverlay };

export type CompanyProductMarginSettings = {
  companyId: string;
  operatingExpensePct: number;
  itemMaterialCosts: Record<string, number>;
  itemOverlays: Record<string, ProductMarginItemOverlay>;
};

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureCompanyProductMarginSettingsTable(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyProductMarginSettings" (
          "companyId" TEXT NOT NULL,
          "operatingExpensePct" DOUBLE PRECISION NOT NULL DEFAULT 25.51,
          "userEditedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyProductMarginSettings_pkey" PRIMARY KEY ("companyId")
        )
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositive(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

export async function listProductMarginItemOverlays(companyId: string): Promise<Record<string, ProductMarginItemOverlay>> {
  const [freightRows, dutyRows, csiMaterialCosts] = await Promise.all([
    listCompanyItemFreight(companyId).catch(() => []),
    ensureCompanyItemDutyTable()
      .then(() => listCompanyItemDuties(companyId, 'all'))
      .catch(() => []),
    listCompanyItemMaterialCosts(companyId).catch(() => ({}) as Record<string, number>),
  ]);

  const overlays = new Map<string, ProductMarginItemOverlay>();
  const ensureOverlay = (sku: string): ProductMarginItemOverlay => {
    const existing = overlays.get(sku);
    if (existing) return existing;
    const created: ProductMarginItemOverlay = {
      materialCost: null,
      unitCost: null,
      currentUnitCost: null,
      tariffPerPiece: null,
      dutyPerPiece: null,
      freightPerPiece: null,
    };
    overlays.set(sku, created);
    return created;
  };

  for (const row of freightRows) {
    const sku = productMarginSkuKey(row.itemSku);
    if (!sku) continue;
    const overlay = ensureOverlay(sku);
    overlay.unitCost = finiteNumber(row.unitCost);
    overlay.currentUnitCost = finiteNumber(row.currentUnitCost);
    overlay.materialCost = firstPositive(row.unitCost, row.currentUnitCost);
    overlay.freightPerPiece = finiteNumber(row.estimatedFreightCurrent);
  }

  for (const [sku, cost] of Object.entries(csiMaterialCosts)) {
    const key = productMarginSkuKey(sku);
    if (!key) continue;
    const overlay = ensureOverlay(key);
    if (overlay.materialCost == null) overlay.materialCost = firstPositive(cost);
    if (overlay.unitCost == null) overlay.unitCost = finiteNumber(cost);
  }

  for (const row of dutyRows) {
    const sku = productMarginSkuKey(row.itemSku);
    if (!sku) continue;
    const overlay = ensureOverlay(sku);
    overlay.tariffPerPiece = finiteNumber(row.tariffPerPiece);
    overlay.dutyPerPiece = finiteNumber(row.dutyPerPiece);
    if (overlay.materialCost == null) overlay.materialCost = firstPositive(row.enteredValuePerPiece);
  }

  return Object.fromEntries(overlays.entries());
}

export async function getCompanyProductMarginSettings(companyId: string): Promise<CompanyProductMarginSettings> {
  await ensureCompanyProductMarginSettingsTable();
  const rows = await prisma.$queryRaw<Array<{ operatingExpensePct: number }>>`
    SELECT "operatingExpensePct"
    FROM "CompanyProductMarginSettings"
    WHERE "companyId" = ${companyId}
    LIMIT 1
  `;
  const operatingExpensePct =
    normalizeOperatingExpensePct(rows[0]?.operatingExpensePct) ?? DEFAULT_SGP_OPERATING_EXPENSE_PCT;
  const itemOverlays = await listProductMarginItemOverlays(companyId).catch(() => ({}));
  const itemMaterialCosts = Object.fromEntries(
    Object.entries(itemOverlays)
      .filter(([, overlay]) => overlay.materialCost != null && overlay.materialCost > 0)
      .map(([sku, overlay]) => [sku, Number(overlay.materialCost)])
  );
  return { companyId, operatingExpensePct, itemMaterialCosts, itemOverlays };
}

export async function updateCompanyProductMarginSettings(
  companyId: string,
  operatingExpensePctInput: unknown
): Promise<CompanyProductMarginSettings> {
  const operatingExpensePct = normalizeOperatingExpensePct(operatingExpensePctInput);
  if (operatingExpensePct == null) {
    throw new Error('Operating Expenses % must be a number from 0 to 999.9999.');
  }
  await ensureCompanyProductMarginSettingsTable();
  await prisma.$executeRaw`
    INSERT INTO "CompanyProductMarginSettings" (
      "companyId", "operatingExpensePct", "userEditedAt", "createdAt", "updatedAt"
    )
    VALUES (${companyId}, ${operatingExpensePct}, NOW(), NOW(), NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "operatingExpensePct" = EXCLUDED."operatingExpensePct",
      "userEditedAt" = NOW(),
      "updatedAt" = NOW()
  `;
  return { companyId, operatingExpensePct, itemMaterialCosts: {}, itemOverlays: {} };
}
