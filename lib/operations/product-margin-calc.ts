export const DEFAULT_SGP_OPERATING_EXPENSE_PCT = 25.51;

export type ProductMarginItemOverlay = {
  materialCost: number | null;
  unitCost: number | null;
  currentUnitCost: number | null;
  tariffPerPiece: number | null;
  dutyPerPiece: number | null;
  freightPerPiece: number | null;
};

export function productMarginSkuKey(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function lookupProductMarginOverlay(
  overlays: Record<string, ProductMarginItemOverlay> | null | undefined,
  sku: unknown
): ProductMarginItemOverlay | null {
  const key = productMarginSkuKey(sku);
  if (!key || !overlays) return null;
  return overlays[key] || null;
}

export function normalizeOperatingExpensePct(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999.9999) return null;
  return Math.round(parsed * 10000) / 10000;
}

export function sgpOperatingExpenseDollars(
  materialCost: number | null | undefined,
  operatingExpensePct: number | null | undefined
): number | null {
  if (materialCost == null || !Number.isFinite(Number(materialCost))) return null;
  if (operatingExpensePct == null || !Number.isFinite(Number(operatingExpensePct))) return null;
  return Number(materialCost) * (Number(operatingExpensePct) / 100);
}
