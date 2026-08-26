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

function insertModuleAfter(modules: string[], afterKey: string, newKey: string): string[] {
  if (modules.includes(newKey)) return modules;
  const idx = modules.indexOf(afterKey);
  if (idx >= 0) {
    return [...modules.slice(0, idx + 1), newKey, ...modules.slice(idx + 1)];
  }
  return [...modules, newKey];
}

function insertModuleBefore(modules: string[], beforeKey: string, newKey: string): string[] {
  if (modules.includes(newKey)) return modules;
  const idx = modules.indexOf(beforeKey);
  if (idx >= 0) {
    return [...modules.slice(0, idx), newKey, ...modules.slice(idx)];
  }
  return [...modules, newKey];
}

const SECTOR_54_BUREAU_MODULES = [
  'todays_operations',
  'payroll_performance',
  'processor_capacity',
  'client_economics',
] as const;

export function mergeIsolvedSector54LayoutModules(config: SectorLayoutConfig): SectorLayoutConfig {
  const modules = Array.isArray(config.modules)
    ? config.modules.map((module) => String(module || '').trim()).filter(Boolean)
    : [];
  const withPayroll = insertModuleAfter(modules, 'ap', 'payroll');
  const withHiring = insertModuleAfter(withPayroll, 'time_utilization', 'hiring');
  let withBureau = withHiring;
  if (withBureau.includes('payroll')) {
    for (const key of [...SECTOR_54_BUREAU_MODULES].reverse()) {
      withBureau = insertModuleBefore(withBureau, 'payroll', key);
    }
  } else {
    let afterKey = 'ap';
    for (const key of SECTOR_54_BUREAU_MODULES) {
      withBureau = insertModuleAfter(withBureau, afterKey, key);
      afterKey = key;
    }
  }
  return {
    ...config,
    modules: withBureau,
  };
}
