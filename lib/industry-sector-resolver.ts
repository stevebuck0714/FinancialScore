export function resolveCompanyIndustrySectorCategory(
  company: { industrySectorCategory?: unknown } | null | undefined,
): string {
  const savedCategory = String(company?.industrySectorCategory ?? '').trim();
  return savedCategory;
}
