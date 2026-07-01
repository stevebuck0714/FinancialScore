export type AffiliateAddOnKey = 'dataRoom' | 'valuation' | 'digitalPresence' | 'customReports';

export type AffiliateAddOnDefault = {
  enabledByAdmin: boolean;
  includedInCore: boolean;
  pricing: {
    monthly: number;
    quarterly: number;
    annual: number;
  };
};

export type AffiliateAddOnDefaults = Record<AffiliateAddOnKey, AffiliateAddOnDefault>;

export const AFFILIATE_ADD_ON_KEYS: AffiliateAddOnKey[] = [
  'dataRoom',
  'valuation',
  'digitalPresence',
  'customReports',
];

const ZERO_PRICING = { monthly: 0, quarterly: 0, annual: 0 };

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePricing(value: unknown, fallback: { monthly: number; quarterly: number; annual: number }) {
  const source = asRecord(value);
  return {
    monthly: finiteNumber(source.monthly, fallback.monthly),
    quarterly: finiteNumber(source.quarterly, fallback.quarterly),
    annual: finiteNumber(source.annual, fallback.annual),
  };
}

export function normalizeAffiliateAddOnDefaults(
  raw: unknown,
  fallbackPricing?: Partial<Record<AffiliateAddOnKey, { monthly: number; quarterly: number; annual: number }>>,
): AffiliateAddOnDefaults {
  const source = asRecord(raw);
  return AFFILIATE_ADD_ON_KEYS.reduce((acc, key) => {
    const row = asRecord(source[key]);
    const pricingFallback = fallbackPricing?.[key] || ZERO_PRICING;
    acc[key] = {
      enabledByAdmin: Boolean(row.enabledByAdmin),
      includedInCore: Boolean(row.includedInCore),
      pricing: normalizePricing(row.pricing, pricingFallback),
    };
    return acc;
  }, {} as AffiliateAddOnDefaults);
}

export function buildCompanyAddOnAllocations(params: {
  addOnDefaults?: unknown;
  dataRoomPricing?: { monthly: number; quarterly: number; annual: number };
}): Record<AffiliateAddOnKey, Record<string, unknown>> {
  const defaults = normalizeAffiliateAddOnDefaults(params.addOnDefaults, {
    dataRoom: params.dataRoomPricing || ZERO_PRICING,
  });

  const toAllocation = (key: AffiliateAddOnKey) => {
    const item = defaults[key];
    const subscriptionStatus = item.enabledByAdmin && item.includedInCore ? 'active' : 'inactive';
    const subscription =
      item.enabledByAdmin && item.includedInCore
        ? { status: subscriptionStatus, source: 'affiliate_code' }
        : { status: subscriptionStatus };
    return {
      enabledByAdmin: item.enabledByAdmin,
      includedInCore: item.includedInCore,
      pricing: item.pricing,
      subscription,
    };
  };

  return {
    dataRoom: toAllocation('dataRoom'),
    valuation: toAllocation('valuation'),
    digitalPresence: toAllocation('digitalPresence'),
    customReports: toAllocation('customReports'),
  };
}
