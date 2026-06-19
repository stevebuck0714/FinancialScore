import { INDUSTRY_SECTORS, SECTOR_CATEGORIES } from '@/data/industrySectors';

export function resolveSectorCategoryFromIndustrySector(industrySector: unknown): string | null {
  const raw = String(industrySector ?? '').trim();
  if (!raw) return null;

  const industryId = Number(raw);
  if (Number.isFinite(industryId)) {
    const industry = INDUSTRY_SECTORS.find((item: any) => Number(item.id) === industryId);
    if (industry?.sectorCode != null) return String(industry.sectorCode);
  }

  const category = SECTOR_CATEGORIES.find((item: any) => String(item.code) === raw);
  return category ? raw : null;
}

export function resolveCompanyIndustrySectorCategory(
  company: { industrySector?: unknown; industrySectorCategory?: unknown } | null | undefined,
  fallback?: unknown,
): string {
  const derivedFromIndustry = resolveSectorCategoryFromIndustrySector(company?.industrySector);
  if (derivedFromIndustry) return derivedFromIndustry;

  const savedCategory = String(company?.industrySectorCategory ?? '').trim();
  if (savedCategory) return savedCategory;

  return String(fallback || '01');
}
