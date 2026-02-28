import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';

export type SectorLayoutConfig = {
  version: number;
  layoutId: string;
  modules: string[];
};

export function getDefaultSectorLayoutConfig(sectorCategory: string): SectorLayoutConfig {
  const modules = getTopLineBucketsForSector(sectorCategory).map((bucket) => bucket.key);
  return {
    version: 2,
    layoutId: `sector-${sectorCategory}`,
    modules,
  };
}

export function isLegacyOpsDefaultConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  const modules = (config as { modules?: unknown }).modules;
  if (!Array.isArray(modules)) return false;
  return modules.length === 1 && String(modules[0]).trim().toLowerCase() === 'ops-default';
}
