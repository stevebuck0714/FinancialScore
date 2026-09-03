import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { getModuleLabel, mapModuleToDataType, resolveModuleKey, type OpsDataType } from '@/lib/operations/module-registry';

export type OperationalDashboardModuleAccess = {
  key: string;
  label: string;
};

const ALWAYS_AVAILABLE_OPERATIONAL_MODULES: OperationalDashboardModuleAccess[] = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'daily_financials', label: 'Daily Financials' },
  { key: 'loans', label: 'Loans' },
  { key: 'cap_table', label: 'Cap Table' },
];

const DATA_TYPE_ALIASES: Record<string, string[]> = {
  ap: ['ap-aging'],
};

function uniqueModules(modules: OperationalDashboardModuleAccess[]): OperationalDashboardModuleAccess[] {
  const seen = new Set<string>();
  const result: OperationalDashboardModuleAccess[] = [];

  modules.forEach((module) => {
    const key = resolveModuleKey(module.key);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({
      key,
      label: module.label || getModuleLabel(key) || key.replace(/_/g, ' '),
    });
  });

  return result;
}

export function getOperationalDashboardModulesForSector(
  sectorCategory?: string | null
): OperationalDashboardModuleAccess[] {
  const sectorModules = getTopLineBucketsForSector(sectorCategory).map((bucket) => ({
    key: resolveModuleKey(bucket.key),
    label: bucket.label || getModuleLabel(bucket.key),
  }));

  return uniqueModules([...ALWAYS_AVAILABLE_OPERATIONAL_MODULES, ...sectorModules]);
}

export function normalizeOperationalDashboardAccess(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  return Array.from(
    new Set(
      raw
        .map((moduleKey) => resolveModuleKey(String(moduleKey || '').trim()))
        .filter(Boolean)
    )
  );
}

export function isOperationalModuleAllowed(rawAccess: unknown, moduleKey: string): boolean {
  const access = normalizeOperationalDashboardAccess(rawAccess);
  if (!access) return true;

  const normalizedModuleKey = resolveModuleKey(moduleKey);
  if (!normalizedModuleKey) return true;
  // Group is an Atlantic reporting view of product data, not a separately
  // configurable access-right. It follows the existing Products permission.
  if (normalizedModuleKey === 'groups') {
    return access.includes('groups') || access.includes('products_skus') || access.includes('products');
  }
  return access.includes(normalizedModuleKey);
}

export function isOperationalDataTypeAllowed(rawAccess: unknown, dataType: string | null | undefined): boolean {
  const access = normalizeOperationalDashboardAccess(rawAccess);
  if (!access) return true;

  const normalizedDataType = String(dataType || '').trim();
  if (!normalizedDataType || normalizedDataType === 'summary') return access.length > 0;

  const candidateDataTypes = [normalizedDataType, ...(DATA_TYPE_ALIASES[normalizedDataType] || [])];
  return access.some((moduleKey) => {
    const moduleDataType = mapModuleToDataType(moduleKey);
    return moduleDataType ? candidateDataTypes.includes(moduleDataType as OpsDataType) : false;
  });
}
