// Authoritative catalog of EBITDA / SDE adjustment line items. Shared by the
// API (validation + grouping) and the UI (cards + assignment picker). Keep
// keys stable — they're persisted in AccountMapping.sdeAdjustmentLineItem.

export type SdeBucket = 'OWNER_COMP' | 'PERSONAL' | 'NON_RECURRING' | 'ONE_TIME_REVENUE';

export type AdjustmentLineItem = {
  key: string;
  label: string;
};

export const SDE_BUCKETS: SdeBucket[] = [
  'OWNER_COMP',
  'PERSONAL',
  'NON_RECURRING',
  'ONE_TIME_REVENUE',
];

export const SDE_BUCKET_LABELS: Record<SdeBucket, string> = {
  OWNER_COMP: '1. Owner Compensation Adjustment',
  PERSONAL: '2. Personal / Discretionary Expenses',
  NON_RECURRING: '3. Non-Recurring Expenses',
  ONE_TIME_REVENUE: '4. One-Time Revenue',
};

export const SDE_BUCKET_SHORT_LABELS: Record<SdeBucket, string> = {
  OWNER_COMP: 'Owner Comp',
  PERSONAL: 'Personal',
  NON_RECURRING: 'Non-Recurring',
  ONE_TIME_REVENUE: 'One-Time Rev',
};

// Keys here mirror the original sdeManualInputs field names so any downstream
// code that reads the manual-input system stays compatible.
export const SDE_LINE_ITEMS: Record<SdeBucket, AdjustmentLineItem[]> = {
  OWNER_COMP: [
    { key: 'ownerSalary', label: 'Owner salary' },
    { key: 'ownersDraw', label: 'Owners Draw' },
    { key: 'marketReplacementSalary', label: 'Market replacement salary' },
    { key: 'ownerCompOther', label: 'Other' },
  ],
  PERSONAL: [
    { key: 'personalTravel', label: 'personal travel' },
    { key: 'familyPayroll', label: 'family payroll' },
    { key: 'autoLeases', label: 'auto leases' },
    { key: 'mealsEntertainment', label: 'meals & entertainment' },
    { key: 'clubDues', label: 'club dues' },
    { key: 'personalOther', label: 'Other' },
  ],
  NON_RECURRING: [
    { key: 'legalSettlements', label: 'legal settlements' },
    { key: 'majorRepairs', label: 'major repairs' },
    { key: 'consulting', label: 'consulting' },
    { key: 'erpInstall', label: 'ERP install' },
    { key: 'relocation', label: 'relocation' },
    { key: 'nonRecurringOther', label: 'Other' },
  ],
  ONE_TIME_REVENUE: [
    { key: 'assetSales', label: 'asset sales' },
    { key: 'insuranceProceeds', label: 'insurance proceeds' },
    { key: 'oneTimeContract', label: 'one-time contract' },
    { key: 'oneTimeRevenueOther', label: 'Other' },
  ],
};

const VALID_LINE_KEYS_BY_BUCKET: Record<SdeBucket, Set<string>> = {
  OWNER_COMP: new Set(SDE_LINE_ITEMS.OWNER_COMP.map((l) => l.key)),
  PERSONAL: new Set(SDE_LINE_ITEMS.PERSONAL.map((l) => l.key)),
  NON_RECURRING: new Set(SDE_LINE_ITEMS.NON_RECURRING.map((l) => l.key)),
  ONE_TIME_REVENUE: new Set(SDE_LINE_ITEMS.ONE_TIME_REVENUE.map((l) => l.key)),
};

export function isValidBucket(value: unknown): value is SdeBucket {
  return typeof value === 'string' && (SDE_BUCKETS as string[]).includes(value);
}

export function isValidLineItem(bucket: SdeBucket, key: unknown): key is string {
  if (typeof key !== 'string' || key.length === 0) return false;
  return VALID_LINE_KEYS_BY_BUCKET[bucket].has(key);
}

export function lineItemLabel(bucket: SdeBucket, key: string | null): string | null {
  if (!key) return null;
  const item = SDE_LINE_ITEMS[bucket].find((l) => l.key === key);
  return item?.label ?? null;
}
