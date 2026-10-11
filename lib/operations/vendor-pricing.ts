export const VENDOR_PRICING_APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'MTO'] as const;
export type VendorPricingApprovalStatus = (typeof VENDOR_PRICING_APPROVAL_STATUSES)[number];

export const VENDOR_PRICING_MTO_OPTIONS = ['Y', 'N'] as const;

export const POUNDS_TO_KG = 0.45359237;

/** Fields the user types; everything else on the page comes from Infor or is calculated. */
export type VendorPricingEdits = {
  subsupplier: string | null;
  mtoOverride: string | null;
  newCost: number | null;
  approvalStatus: string | null;
  material: string | null;
  currentMaterialCost: number | null;
  newMaterialCost: number | null;
  partWeightKgOverride: number | null;
  startDate: string | null;
  endDate: string | null;
  requiredLoadDate: string | null;
};

export const VENDOR_PRICING_EDIT_FIELDS: Array<keyof VendorPricingEdits> = [
  'subsupplier',
  'mtoOverride',
  'newCost',
  'approvalStatus',
  'material',
  'currentMaterialCost',
  'newMaterialCost',
  'partWeightKgOverride',
  'startDate',
  'endDate',
  'requiredLoadDate',
];

export const VENDOR_PRICING_NUMBER_FIELDS = new Set<keyof VendorPricingEdits>([
  'newCost',
  'currentMaterialCost',
  'newMaterialCost',
  'partWeightKgOverride',
]);

export const VENDOR_PRICING_DATE_FIELDS = new Set<keyof VendorPricingEdits>([
  'startDate',
  'endDate',
  'requiredLoadDate',
]);

export type VendorPricingRow = VendorPricingEdits & {
  itemSku: string;
  vendorId: string;
  vendorName: string;
  currentCost: number | null;
  currentCostEffectiveDate: string | null;
  forecastQty: number | null;
  inforMto: string | null;
  inforPartWeightKg: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function emptyVendorPricingEdits(): VendorPricingEdits {
  return {
    subsupplier: null,
    mtoOverride: null,
    newCost: null,
    approvalStatus: null,
    material: null,
    currentMaterialCost: null,
    newMaterialCost: null,
    partWeightKgOverride: null,
    startDate: null,
    endDate: null,
    requiredLoadDate: null,
  };
}

/** Infor UnitWeight is pounds per order quantity; convert to kilograms per piece. */
export function partWeightKgFromInfor(unitWeightLbs: number | null | undefined, orderMultiple: number | null | undefined): number | null {
  const weight = Number(unitWeightLbs);
  const multiple = Number(orderMultiple);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(multiple) || multiple <= 0) return null;
  return (weight / multiple) * POUNDS_TO_KG;
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return (to - from) / from;
}

function perKg(cost: number | null, weightKg: number | null): number | null {
  if (cost == null || weightKg == null || !(weightKg > 0)) return null;
  return cost / weightKg;
}

export type VendorPricingCalculated = {
  mto: string | null;
  partWeightKg: number | null;
  pctChange: number | null;
  pctChangeMaterial: number | null;
  priceChange: number | null;
  currentUsdPerKg: number | null;
  newUsdPerKg: number | null;
  pctChangeUsdPerKg: number | null;
};

export function calculateVendorPricing(row: VendorPricingRow): VendorPricingCalculated {
  const partWeightKg = row.partWeightKgOverride ?? row.inforPartWeightKg;
  const currentUsdPerKg = perKg(row.currentCost, partWeightKg);
  const newUsdPerKg = perKg(row.newCost, partWeightKg);
  return {
    mto: row.mtoOverride || row.inforMto,
    partWeightKg,
    pctChange: pctChange(row.currentCost, row.newCost),
    pctChangeMaterial: pctChange(row.currentMaterialCost, row.newMaterialCost),
    priceChange:
      row.currentMaterialCost != null && row.newMaterialCost != null && partWeightKg != null
        ? (row.newMaterialCost - row.currentMaterialCost) * partWeightKg
        : null,
    currentUsdPerKg,
    newUsdPerKg,
    pctChangeUsdPerKg: pctChange(currentUsdPerKg, newUsdPerKg),
  };
}

/**
 * The contract in effect on `today`: the newest active ('A') price already
 * effective, else the newest already effective, else the newest overall.
 */
export function pickCurrentVendorContract<T extends { effectiveDate: string | null; status?: string | null }>(
  group: T[],
  today: string
): { current: T; byNewest: T[] } {
  const byNewest = [...group].sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')));
  const inEffect = byNewest.filter((row) => !row.effectiveDate || row.effectiveDate <= today);
  const current =
    inEffect.find((row) => String(row.status || '').toUpperCase() === 'A') ||
    inEffect[0] ||
    byNewest[0];
  return { current, byNewest };
}
