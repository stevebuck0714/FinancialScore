import { parseAssignedCompanyReports, parseOperationalHubConfig } from '@/lib/operations/operational-hub-overlay';

export type CompanyReportTemplate = {
  key: string;
  label: string;
  tabKey: string;
  group: string;
  sectorCategories: string[];
};

export const ATLANTIC_PRECISION_COMPANY_IDS = new Set([
  // Production Atlantic Precision Resource
  'cmmcp278j0002kz0439rlixdj',
]);

export const REAL_ESTATE_DIVERSIFIED_COMPANY_IDS = new Set([
  // DEV / QBE onboarding company used by the Executive Report demo
  'cmqb6e66i0003qhzgu451he2b',
]);

export const COMPANY_REPORT_CATALOG: CompanyReportTemplate[] = [
  {
    key: 'realEstateExecutiveReport',
    label: 'Executive Report',
    tabKey: 'dashboard',
    group: 'Overview',
    sectorCategories: ['53'],
  },
  {
    key: 'productsProductMarginAnalysis',
    label: 'Product Margin Analysis',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsWholesaleRawData',
    label: 'Raw Data',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsRevenueForecast',
    label: 'Monthly Forecast',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsForecastRollup',
    label: 'Forecast Rollup',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsMonthlyRevenue',
    label: 'Monthly Revenue',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsRevenueRollup',
    label: 'Revenue Rollup',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsGoalUpdate',
    label: 'Goal Update',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsPerformance',
    label: 'Performance',
    tabKey: 'products_skus',
    group: 'Products',
    sectorCategories: ['42'],
  },
  {
    key: 'productsVendorPricing',
    label: 'Vendor Pricing',
    tabKey: 'vendors',
    group: 'Vendors',
    sectorCategories: ['42'],
  },
  {
    key: 'vendorsMonthlyForecast',
    label: 'Monthly Forecast',
    tabKey: 'vendors',
    group: 'Vendors',
    sectorCategories: ['42'],
  },
  {
    key: 'vendorsForecastRollup',
    label: 'Forecast Rollup',
    tabKey: 'vendors',
    group: 'Vendors',
    sectorCategories: ['42'],
  },
  {
    key: 'vendorsDutiesTariffs',
    label: 'Duties & Tariffs',
    tabKey: 'vendors',
    group: 'Vendors',
    sectorCategories: ['42'],
  },
  {
    key: 'vendorsSgpFreight',
    label: 'SGP Freight',
    tabKey: 'vendors',
    group: 'Vendors',
    sectorCategories: ['42'],
  },
];

const ATLANTIC_ONLY_VENDOR_REPORT_KEYS = new Set([
  'productsVendorPricing',
  'vendorsMonthlyForecast',
  'vendorsForecastRollup',
  'vendorsDutiesTariffs',
  'vendorsSgpFreight',
]);

export const ATLANTIC_ONLY_VENDOR_REPORTS = COMPANY_REPORT_CATALOG.filter((report) =>
  ATLANTIC_ONLY_VENDOR_REPORT_KEYS.has(report.key)
);

const COMPANY_REPORT_KEY_SET = new Set(COMPANY_REPORT_CATALOG.map((report) => report.key));

export function isAtlanticPrecisionCompany(
  companyId?: string | null,
  companyName?: string | null
): boolean {
  if (ATLANTIC_PRECISION_COMPANY_IDS.has(String(companyId || '').trim())) return true;
  const name = String(companyName || '').trim().toLowerCase();
  return name.includes('atlantic precision');
}

export function isRealEstateDiversifiedCompany(
  companyId?: string | null,
  companyName?: string | null
): boolean {
  if (REAL_ESTATE_DIVERSIFIED_COMPANY_IDS.has(String(companyId || '').trim())) return true;
  const name = String(companyName || '').trim().toLowerCase();
  return name.includes('real estate diversified');
}

export function isCompanySpecificReportKey(reportKey: string): boolean {
  return COMPANY_REPORT_KEY_SET.has(String(reportKey || '').trim());
}

export function isCompanySpecificReportForSector(
  reportKey: string,
  sectorCategory?: string | null
): boolean {
  const template = getCompanyReportTemplate(reportKey);
  if (!template) return false;
  const sector = String(sectorCategory || '').trim();
  if (!sector) return false;
  return template.sectorCategories.includes(sector);
}

export function isAtlanticOnlyVendorReportKey(reportKey: string): boolean {
  return ATLANTIC_ONLY_VENDOR_REPORTS.some((report) => report.key === reportKey);
}

export function getCompanyReportTemplate(reportKey: string): CompanyReportTemplate | null {
  const key = String(reportKey || '').trim();
  return COMPANY_REPORT_CATALOG.find((report) => report.key === key) || null;
}

export function getCompanyReportCatalogForSector(sectorCategory?: string | null): CompanyReportTemplate[] {
  const sector = String(sectorCategory || '').trim();
  if (!sector) return [];
  return COMPANY_REPORT_CATALOG.filter((report) => report.sectorCategories.includes(sector));
}

function catalogVisibleForCompany(
  report: CompanyReportTemplate,
  args: { companyId?: string | null; companyName?: string | null }
): boolean {
  if (!ATLANTIC_ONLY_VENDOR_REPORT_KEYS.has(report.key)) return true;
  return isAtlanticPrecisionCompany(args.companyId, args.companyName);
}

function grandfatherAssignedReportKeys(args: {
  companyId?: string | null;
  companyName?: string | null;
}): string[] {
  const keys: string[] = [];
  if (isRealEstateDiversifiedCompany(args.companyId, args.companyName)) {
    keys.push('realEstateExecutiveReport');
  }
  if (isAtlanticPrecisionCompany(args.companyId, args.companyName)) {
    COMPANY_REPORT_CATALOG.forEach((report) => {
      if (report.sectorCategories.includes('42')) keys.push(report.key);
    });
  }
  return keys;
}

export function resolveAssignedCompanyReportKeys(args: {
  companyId?: string | null;
  companyName?: string | null;
  hubConfig?: unknown;
  sections?: Record<string, any> | null;
}): Set<string> {
  const hub = parseOperationalHubConfig(args.hubConfig);
  const sections =
    args.sections && typeof args.sections === 'object' && !Array.isArray(args.sections)
      ? args.sections
      : hub.sections && typeof hub.sections === 'object' && !Array.isArray(hub.sections)
        ? hub.sections
        : {};
  const assigned = new Set<string>([
    ...parseAssignedCompanyReports(hub),
    ...grandfatherAssignedReportKeys(args),
  ]);
  COMPANY_REPORT_CATALOG.forEach((report) => {
    if (sections[report.key] === true) assigned.add(report.key);
  });
  return assigned;
}

function catalogTabMatches(reportTabKey: string, moduleKey: string): boolean {
  if (reportTabKey === moduleKey) return true;
  const productTabs = new Set(['products', 'products_skus']);
  return productTabs.has(reportTabKey) && productTabs.has(moduleKey);
}

export function getAssignedCompanyCatalogReports(args: {
  companyId?: string | null;
  companyName?: string | null;
  sectorCategory?: string | null;
  hubConfig?: unknown;
  sections?: Record<string, any> | null;
  tabKey?: string | null;
}): CompanyReportTemplate[] {
  const assigned = resolveAssignedCompanyReportKeys(args);
  const tabKey = String(args.tabKey || '').trim();
  return getCompanyReportCatalogForSector(args.sectorCategory).filter((report) => {
    if (!catalogVisibleForCompany(report, args)) return false;
    if (!assigned.has(report.key)) return false;
    if (tabKey && !catalogTabMatches(report.tabKey, tabKey)) return false;
    return true;
  });
}

export function getUnassignedCompanyCatalogReports(args: {
  companyId?: string | null;
  companyName?: string | null;
  sectorCategory?: string | null;
  hubConfig?: unknown;
  sections?: Record<string, any> | null;
  tabKey?: string | null;
}): CompanyReportTemplate[] {
  const assigned = resolveAssignedCompanyReportKeys(args);
  const tabKey = String(args.tabKey || '').trim();
  return getCompanyReportCatalogForSector(args.sectorCategory).filter((report) => {
    if (!catalogVisibleForCompany(report, args)) return false;
    if (assigned.has(report.key)) return false;
    if (tabKey && !catalogTabMatches(report.tabKey, tabKey)) return false;
    return true;
  });
}

export function getUnassignedCompanyCatalogTabs(args: {
  companyId?: string | null;
  companyName?: string | null;
  sectorCategory?: string | null;
  hubConfig?: unknown;
  sections?: Record<string, any> | null;
}): Array<{ tabKey: string; label: string }> {
  const seen = new Map<string, string>();
  getUnassignedCompanyCatalogReports(args).forEach((report) => {
    if (!seen.has(report.tabKey)) seen.set(report.tabKey, report.group);
  });
  return Array.from(seen.entries()).map(([tabKey, label]) => ({ tabKey, label }));
}

export function isAssignedCompanyReportEnabled(args: {
  reportKey: string;
  companyId?: string | null;
  companyName?: string | null;
  hubConfig?: unknown;
  sections?: Record<string, any> | null;
}): boolean {
  const reportKey = String(args.reportKey || '').trim();
  if (!isCompanySpecificReportKey(reportKey)) return false;
  if (!resolveAssignedCompanyReportKeys(args).has(reportKey)) return false;
  const hub = parseOperationalHubConfig(args.hubConfig);
  const sections =
    args.sections && typeof args.sections === 'object' && !Array.isArray(args.sections)
      ? args.sections
      : hub.sections && typeof hub.sections === 'object' && !Array.isArray(hub.sections)
        ? hub.sections
        : {};
  const value = sections[reportKey];
  return value === undefined ? true : value !== false;
}
