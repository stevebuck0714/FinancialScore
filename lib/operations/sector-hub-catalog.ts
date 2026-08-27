import type { OperationalHubCustomTab } from '@/lib/operations/operational-hub-overlay';

export type SectorCatalogCompanyEntry = {
  companyId: string;
  companyName: string;
  sectorCategory: string;
  customTabs: OperationalHubCustomTab[];
};

export type SectorCatalogTab = OperationalHubCustomTab & {
  sourceCompanyNames: string[];
};

export function collectSectorHubCatalog(
  entries: SectorCatalogCompanyEntry[],
  args: { sectorCategory?: string | null; excludeCompanyId?: string | null }
): { tabs: SectorCatalogTab[] } {
  const sector = String(args.sectorCategory || '').trim();
  const excludeCompanyId = String(args.excludeCompanyId || '').trim();
  if (!sector) return { tabs: [] };

  const tabByKey = new Map<string, SectorCatalogTab>();

  entries.forEach((entry) => {
    if (String(entry.sectorCategory || '').trim() !== sector) return;
    if (excludeCompanyId && String(entry.companyId || '').trim() === excludeCompanyId) return;
    const companyName = String(entry.companyName || '').trim();

    (entry.customTabs || []).forEach((tab) => {
      const key = String(tab.key || '').trim();
      if (!key) return;
      const existing = tabByKey.get(key);
      if (existing) {
        if (companyName && !existing.sourceCompanyNames.includes(companyName)) {
          existing.sourceCompanyNames.push(companyName);
        }
        return;
      }
      tabByKey.set(key, {
        ...tab,
        sourceCompanyNames: companyName ? [companyName] : [],
      });
    });
  });

  return {
    tabs: Array.from(tabByKey.values()).sort((a, b) => a.label.localeCompare(b.label)),
  };
}
