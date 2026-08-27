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

export const COGENT_SCIENTIFIC_COMPANY_IDS = new Set([
  // Production Cogent Scientific
  'cmowy17lw0000ig04fz6rq4zv',
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
  {
    key: 'hiringOpenJobs',
    label: 'Open Jobs',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'hiringApplicantPipeline',
    label: 'Applicant Pipeline',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'hiringFunnelByRole',
    label: 'Funnel by Role',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'hiringTimeToFillByJob',
    label: 'Time to Fill by Hire',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'hiringApplicantsByJob',
    label: 'Applicants by Job',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'hiringPostingPerformance',
    label: 'Posting Performance',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'hiringOnboardingPipeline',
    label: 'Onboarding / New Hires',
    tabKey: 'hiring',
    group: 'Hiring',
    sectorCategories: ['56'],
  },
  {
    key: 'lsWorkforceSummary',
    label: 'Workforce Summary',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsCompensationByRole',
    label: 'Compensation by Role',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsEmployeeCompensationRoster',
    label: 'Employee Compensation Roster',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsHeadcountByRole',
    label: 'Headcount by Role',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsHeadcountByDepartment',
    label: 'Headcount by Department',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsLocationPayTypeMix',
    label: 'Location / Pay Type Mix',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsBillRateLevelCoverage',
    label: 'Bill Rate Level Coverage',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'lsPtoBalances',
    label: 'PTO / Leave Balances',
    tabKey: 'labor_scheduling',
    group: 'Labor & Scheduling',
    sectorCategories: ['56'],
  },
  {
    key: 'rbBillRateLevelSummary',
    label: 'Bill Rate Level Summary',
    tabKey: 'revenue_billables',
    group: 'Revenue & Billables',
    sectorCategories: ['56'],
  },
  {
    key: 'rbEmployeesByBillRateLevel',
    label: 'Employees by Bill Rate Level',
    tabKey: 'revenue_billables',
    group: 'Revenue & Billables',
    sectorCategories: ['56'],
  },
  {
    key: 'rbEmployeesByMarketBillRateLevel',
    label: 'Employees by Market + Bill Rate Level',
    tabKey: 'revenue_billables',
    group: 'Revenue & Billables',
    sectorCategories: ['56'],
  },
  {
    key: 'rbEstimatedBillableEconomics',
    label: 'Estimated Billable Economics by Employee',
    tabKey: 'revenue_billables',
    group: 'Revenue & Billables',
    sectorCategories: ['56'],
  },
  {
    key: 'rbUnavailableRateInputs',
    label: 'Missing Rate Card / Hours Inputs',
    tabKey: 'revenue_billables',
    group: 'Revenue & Billables',
    sectorCategories: ['56'],
  },
  {
    key: 'ueUnitEconomicsInputs',
    label: 'Unit Economics Inputs',
    tabKey: 'unit_economics',
    group: 'Unit Economics',
    sectorCategories: ['56'],
  },
  {
    key: 'ueCostByBillRateLevel',
    label: 'Pay by Bill Rate Level',
    tabKey: 'unit_economics',
    group: 'Unit Economics',
    sectorCategories: ['56'],
  },
  {
    key: 'ueCostByRole',
    label: 'Total Pay by Role',
    tabKey: 'unit_economics',
    group: 'Unit Economics',
    sectorCategories: ['56'],
  },
  {
    key: 'ueCostByLocation',
    label: 'Pay by Location',
    tabKey: 'unit_economics',
    group: 'Unit Economics',
    sectorCategories: ['56'],
  },
  {
    key: 'ueMissingBillRateLevel',
    label: 'Missing Bill Rate Level / Next Inputs',
    tabKey: 'unit_economics',
    group: 'Unit Economics',
    sectorCategories: ['56'],
  },
];

const ATLANTIC_ONLY_VENDOR_REPORT_KEYS = new Set([
  'productsVendorPricing',
  'vendorsMonthlyForecast',
  'vendorsForecastRollup',
  'vendorsDutiesTariffs',
  'vendorsSgpFreight',
]);

const COGENT_ONLY_HIRING_REPORT_KEYS = new Set([
  'hiringOpenJobs',
  'hiringApplicantPipeline',
  'hiringFunnelByRole',
  'hiringTimeToFillByJob',
  'hiringApplicantsByJob',
  'hiringPostingPerformance',
  'hiringOnboardingPipeline',
]);

const COGENT_ONLY_LABOR_REPORT_KEYS = new Set([
  'lsWorkforceSummary',
  'lsCompensationByRole',
  'lsEmployeeCompensationRoster',
  'lsHeadcountByRole',
  'lsHeadcountByDepartment',
  'lsLocationPayTypeMix',
  'lsBillRateLevelCoverage',
  'lsPtoBalances',
]);

const COGENT_ONLY_REVENUE_REPORT_KEYS = new Set([
  'rbBillRateLevelSummary',
  'rbEmployeesByBillRateLevel',
  'rbEmployeesByMarketBillRateLevel',
  'rbEstimatedBillableEconomics',
  'rbUnavailableRateInputs',
]);

const COGENT_ONLY_UNIT_ECONOMICS_REPORT_KEYS = new Set([
  'ueUnitEconomicsInputs',
  'ueCostByBillRateLevel',
  'ueCostByRole',
  'ueCostByLocation',
  'ueMissingBillRateLevel',
]);

const COGENT_ONLY_REPORT_KEYS = new Set([
  ...COGENT_ONLY_HIRING_REPORT_KEYS,
  ...COGENT_ONLY_LABOR_REPORT_KEYS,
  ...COGENT_ONLY_REVENUE_REPORT_KEYS,
  ...COGENT_ONLY_UNIT_ECONOMICS_REPORT_KEYS,
]);

export const ATLANTIC_ONLY_VENDOR_REPORTS = COMPANY_REPORT_CATALOG.filter((report) =>
  ATLANTIC_ONLY_VENDOR_REPORT_KEYS.has(report.key)
);

export const COGENT_ONLY_HIRING_REPORTS = COMPANY_REPORT_CATALOG.filter((report) =>
  COGENT_ONLY_HIRING_REPORT_KEYS.has(report.key)
);

export const COGENT_ONLY_LABOR_REPORTS = COMPANY_REPORT_CATALOG.filter((report) =>
  COGENT_ONLY_LABOR_REPORT_KEYS.has(report.key)
);

export const COGENT_ONLY_REVENUE_REPORTS = COMPANY_REPORT_CATALOG.filter((report) =>
  COGENT_ONLY_REVENUE_REPORT_KEYS.has(report.key)
);

export const COGENT_ONLY_REPORTS = COMPANY_REPORT_CATALOG.filter((report) =>
  COGENT_ONLY_REPORT_KEYS.has(report.key)
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

export function isCogentScientificCompany(
  companyId?: string | null,
  companyName?: string | null
): boolean {
  if (COGENT_SCIENTIFIC_COMPANY_IDS.has(String(companyId || '').trim())) return true;
  const name = String(companyName || '').trim().toLowerCase();
  return name.includes('cogent');
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
  if (ATLANTIC_ONLY_VENDOR_REPORT_KEYS.has(report.key)) {
    return isAtlanticPrecisionCompany(args.companyId, args.companyName);
  }
  if (COGENT_ONLY_REPORT_KEYS.has(report.key)) {
    return isCogentScientificCompany(args.companyId, args.companyName);
  }
  return true;
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
  if (isCogentScientificCompany(args.companyId, args.companyName)) {
    COGENT_ONLY_REPORTS.forEach((report) => keys.push(report.key));
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
