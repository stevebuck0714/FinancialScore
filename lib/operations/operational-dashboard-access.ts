import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import {
  getModuleLabel,
  isLoansDefaultEnabledForCompany,
  mapModuleToDataType,
  resolveModuleKey,
  type OpsDataType,
} from '@/lib/operations/module-registry';
import { getOperationalHubDefaultModuleKeys, getOperationalHubModuleLabel } from '@/lib/operations/operational-hub-layout';
import { getHubTabSource, parseOperationalHubCustomTabs, type HubTabSource } from '@/lib/operations/operational-hub-overlay';
import { isAtlanticPrecisionCompany } from '@/lib/operations/company-specific-reports';
import { getSectorMasterTabKeys, getSectorMasterTabLabel } from '@/lib/operations/sector-master-tabs';

export type OperationalDashboardModuleAccess = {
  key: string;
  label: string;
};

export type OperationalHubCompanyLike = {
  id?: string | null;
  name?: string | null;
  industrySectorCategory?: string | null;
  userDefinedAllocations?: unknown;
};

export type OperationalHubTabCategory = {
  moduleKey: string;
  label: string;
  source: HubTabSource;
};

export function getCompanyOperationalHubSettings(company: OperationalHubCompanyLike | null | undefined): Record<string, any> {
  const uda = company?.userDefinedAllocations as Record<string, any> | null | undefined;
  const hub = uda && typeof uda === 'object' && !Array.isArray(uda) ? uda.operationalHub : null;
  return hub && typeof hub === 'object' && !Array.isArray(hub) ? hub : {};
}

export function getCompanyOperationalHubSections(company: OperationalHubCompanyLike | null | undefined): Record<string, any> {
  const sections = getCompanyOperationalHubSettings(company).sections;
  return sections && typeof sections === 'object' && !Array.isArray(sections) ? sections : {};
}

/** Module key of the CRM Sales tab (HubSpot, HighLevel, ...). */
export const CRM_SALES_MODULE_KEY = 'hubspot_sales';
export const CRM_SALES_TAB_SECTION_KEY = `tab:${CRM_SALES_MODULE_KEY}`;

/** Sector sales tabs that the single CRM "Sales" tab replaces when it is on. */
const CRM_SALES_REPLACED_MODULE_KEYS = ['sales', 'sales_pipeline'];

export type OperationalHubTabOptions = {
  /** Company has a CRM source selected, so the Sales tab is offered in any sector. */
  hasCrmSource?: boolean;
};

/** Sales is switched on in tab customization automatically when a CRM source is added. */
export function isCrmSalesTabSwitchedOn(sections: Record<string, any> | null | undefined): boolean {
  return sections?.[CRM_SALES_TAB_SECTION_KEY] === true;
}

/**
 * Puts the CRM Sales tab into a tab list, taking the place of any sector
 * Sales / Sales Pipeline tab so the company only ever has one Sales tab.
 */
export function withCrmSalesTab(moduleKeys: string[], include: boolean): string[] {
  if (!include) return moduleKeys;
  const result: string[] = [];
  let placed = false;
  moduleKeys.forEach((key) => {
    if (key === CRM_SALES_MODULE_KEY || CRM_SALES_REPLACED_MODULE_KEYS.includes(key)) {
      if (!placed) result.push(CRM_SALES_MODULE_KEY);
      placed = true;
      return;
    }
    result.push(key);
  });
  if (placed) return result;
  const trailingIdx = result.findIndex((key) => key === 'daily_financials' || key === 'loans');
  return trailingIdx < 0
    ? [...result, CRM_SALES_MODULE_KEY]
    : [...result.slice(0, trailingIdx), CRM_SALES_MODULE_KEY, ...result.slice(trailingIdx)];
}

/** Tab categories offered by Site Admin tab customization for a company. */
export function getOperationalHubTabCategories(
  company: OperationalHubCompanyLike | null | undefined,
  options: OperationalHubTabOptions = {}
): OperationalHubTabCategory[] {
  const sectorCategory = String(company?.industrySectorCategory || '').trim();
  const isAtlanticCompany = isAtlanticPrecisionCompany(company?.id, company?.name);
  const customTabs = parseOperationalHubCustomTabs(getCompanyOperationalHubSettings(company)).filter((tab) => {
    if (!isAtlanticCompany) return true;
    return !['group', 'cap table'].includes(tab.label.trim().toLowerCase());
  });
  const customTabKeys = customTabs.map((tab) => tab.key);
  const liveKeys = (() => {
    const keys = getOperationalHubDefaultModuleKeys(sectorCategory);
    if (!isAtlanticCompany || keys.includes('groups')) return keys;
    const productsIdx = keys.findIndex((module) => module === 'products_skus' || module === 'products');
    if (productsIdx < 0) return [...keys, 'groups'];
    return [...keys.slice(0, productsIdx + 1), 'groups', ...keys.slice(productsIdx + 1)];
  })();
  const masterKeys = getSectorMasterTabKeys(sectorCategory);
  const extraKeys = liveKeys.filter((key) => !masterKeys.includes(key) && !customTabKeys.includes(key));
  const includeCrmSales =
    Boolean(options.hasCrmSource) || isCrmSalesTabSwitchedOn(getCompanyOperationalHubSections(company));
  const orderedKeys = [
    ...withCrmSalesTab([...masterKeys, ...extraKeys], includeCrmSales),
    ...customTabKeys.filter((key) => !liveKeys.includes(key) && !masterKeys.includes(key)),
  ];
  const seen = new Set<string>();
  return orderedKeys
    .filter((moduleKey) => {
      if (!moduleKey || seen.has(moduleKey)) return false;
      seen.add(moduleKey);
      return true;
    })
    .map((moduleKey) => {
      const source = getHubTabSource({ sectorCategory, moduleKey, customTabKeys });
      const customTab = customTabs.find((tab) => tab.key === moduleKey);
      const label =
        customTab?.label ||
        (moduleKey === CRM_SALES_MODULE_KEY ? 'Sales' : null) ||
        (source === 'master' ? getSectorMasterTabLabel(sectorCategory, moduleKey) : null) ||
        getOperationalHubModuleLabel(moduleKey, sectorCategory);
      return { moduleKey, label, source };
    });
}

export function isOperationalHubTabDefaultEnabled(moduleKey: string, companyId: string | null | undefined): boolean {
  const key = moduleKey.startsWith('tab:') ? moduleKey.slice(4) : moduleKey;
  const dataType = mapModuleToDataType(key);
  if (dataType === 'cap-table') return false;
  if (key === 'loans' || dataType === 'loans') return isLoansDefaultEnabledForCompany(companyId);
  return true;
}

/** Tab categories switched on for the company in Site Admin tab customization. */
export function getEnabledOperationalDashboardModulesForCompany(
  company: OperationalHubCompanyLike | null | undefined,
  options: OperationalHubTabOptions = {}
): OperationalDashboardModuleAccess[] {
  const sections = getCompanyOperationalHubSections(company);
  return uniqueModules(
    getOperationalHubTabCategories(company, options)
      .filter((tab) => {
        const explicit = sections[`tab:${tab.moduleKey}`];
        return explicit === undefined
          ? isOperationalHubTabDefaultEnabled(tab.moduleKey, company?.id)
          : explicit !== false;
      })
      .map((tab) => ({ key: tab.moduleKey, label: tab.label }))
  );
}

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
  if (normalizedModuleKey === 'groups' || normalizedModuleKey === 'projections') {
    return access.includes(normalizedModuleKey) || access.includes('products_skus') || access.includes('products');
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
