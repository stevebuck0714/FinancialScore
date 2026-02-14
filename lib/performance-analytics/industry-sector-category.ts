export const ANALYTICS_SECTOR_KEYS = [
  'DEFAULT',
  'AGRICULTURE',
  'MINING',
  'UTILITIES',
  'CONSTRUCTION',
  'MANUFACTURING',
  'WHOLESALE_TRADE',
  'RETAIL_TRADE',
  'TRANSPORTATION',
  'INFORMATION',
  'FINANCE_INSURANCE',
  'REAL_ESTATE',
  'PROFESSIONAL_SERVICES',
  'ADMIN_SUPPORT_WASTE',
  'EDUCATIONAL_SERVICES',
  'HEALTH_CARE_SOCIAL_ASSISTANCE',
  'ARTS_ENTERTAINMENT_RECREATION',
  'ACCOMMODATION_FOOD_SERVICES',
  'OTHER_SERVICES',
] as const;

const NAICS_TO_ANALYTICS_SECTOR_KEY: Record<string, (typeof ANALYTICS_SECTOR_KEYS)[number]> = {
  '01': 'DEFAULT',
  '11': 'AGRICULTURE',
  '21': 'MINING',
  '22': 'UTILITIES',
  '23': 'CONSTRUCTION',
  '32': 'MANUFACTURING',
  '42': 'WHOLESALE_TRADE',
  '45': 'RETAIL_TRADE',
  '48': 'TRANSPORTATION',
  '51': 'INFORMATION',
  '52': 'FINANCE_INSURANCE',
  '53': 'REAL_ESTATE',
  '54': 'PROFESSIONAL_SERVICES',
  '56': 'ADMIN_SUPPORT_WASTE',
  '61': 'EDUCATIONAL_SERVICES',
  '62': 'HEALTH_CARE_SOCIAL_ASSISTANCE',
  '71': 'ARTS_ENTERTAINMENT_RECREATION',
  '72': 'ACCOMMODATION_FOOD_SERVICES',
  '81': 'OTHER_SERVICES',
};

export function normalizeIndustrySectorCategory(
  industrySectorCategory: string | null | undefined
): (typeof ANALYTICS_SECTOR_KEYS)[number] {
  if (!industrySectorCategory || typeof industrySectorCategory !== 'string') return 'DEFAULT';

  const trimmed = industrySectorCategory.trim();
  if (!trimmed) return 'DEFAULT';

  const fromNaics = NAICS_TO_ANALYTICS_SECTOR_KEY[trimmed];
  if (fromNaics) return fromNaics;

  const normalizedLegacy = trimmed
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if ((ANALYTICS_SECTOR_KEYS as readonly string[]).includes(normalizedLegacy)) {
    return normalizedLegacy as (typeof ANALYTICS_SECTOR_KEYS)[number];
  }

  return 'DEFAULT';
}
