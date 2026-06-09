import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { getModuleLabel, mapModuleToDataType } from '@/lib/operations/module-registry';

export type OperationalHubReportDefinition = {
  key: string;
  label: string;
  group: string;
};

export type OperationalHubCategoryDefinition = {
  key: string;
  label: string;
  reports: OperationalHubReportDefinition[];
};

const REPORTS_BY_DATA_GROUP: Record<string, OperationalHubReportDefinition[]> = {
  Customers: [
    { key: 'customersWipByCustomer', label: 'WIP by Customer (Unbilled)', group: 'Customers' },
    { key: 'customersTopByRevenue', label: 'Top Customers by Revenue', group: 'Customers' },
    { key: 'customersRevenueDistribution', label: 'Revenue Distribution by Customer', group: 'Customers' },
    { key: 'customersPlatoSalesMetricCards', label: 'Sales Metric Cards', group: 'Customers' },
    { key: 'customersPlatoSalesHistoryChart', label: 'Sales History Chart', group: 'Customers' },
    { key: 'customersPlatoSalesHistoryTables', label: 'Sales / Buys History Tables', group: 'Customers' },
    { key: 'customersGrossMarginHistoryChart', label: 'Gross Margin History Chart', group: 'Customers' },
    { key: 'customersGrossMarginHistoryTable', label: 'Gross Margin History Table', group: 'Customers' },
    { key: 'customersConcentrationRisk', label: 'Concentration Risk', group: 'Customers' },
    { key: 'customersRetentionProxy', label: 'Revenue Retention Proxy', group: 'Customers' },
    { key: 'customersInvoiceVelocity', label: 'Revenue vs Invoice Velocity', group: 'Customers' },
    { key: 'customersAtRiskQueue', label: 'At-Risk Accounts Queue', group: 'Customers' },
  ],
  Products: [
    { key: 'productsPerformance', label: 'Performance', group: 'Products' },
    { key: 'productsRetailForecasting', label: 'Retail Forecasting / Monthly Inventory Report', group: 'Products' },
    { key: 'productsMerchandiseProfitability', label: 'Merchandise Profitability', group: 'Products' },
    { key: 'productsPriceCostComparison', label: 'Weekly Price-Cost Comparison', group: 'Products' },
    { key: 'productsPareto', label: 'Top Products Pareto', group: 'Products' },
    { key: 'productsScatter', label: 'Profitability Scatter', group: 'Products' },
    { key: 'productsScopeSelector', label: 'Scope Selector', group: 'Products' },
    { key: 'productsPriceCostTrend', label: 'Price-Cost Trend', group: 'Products' },
    { key: 'productsPriceCostWaterfall', label: 'Price-Cost Waterfall', group: 'Products' },
    { key: 'productsLossPrevention', label: 'Loss Prevention', group: 'Products' },
    { key: 'productsBottomLossMakers', label: 'Bottom Products (Loss Makers)', group: 'Products' },
    { key: 'productsFreightOtherTracker', label: 'Freight/Other Tracker', group: 'Products' },
  ],
};

const DATA_TYPE_GROUP: Record<string, string> = {
  customers: 'Customers',
  products: 'Products',
};

const SECTOR_53_REPORTS_BY_MODULE: Record<string, OperationalHubReportDefinition[]> = {
  units_properties: [
    { key: 'propertiesOccupancyVacancy', label: 'Occupancy / Vacancy', group: 'Units / Properties' },
    { key: 'propertiesUnitAvailability', label: 'Unit Availability', group: 'Units / Properties' },
    { key: 'propertiesRentRollSummary', label: 'Rent Roll Summary', group: 'Units / Properties' },
    { key: 'propertiesLeaseExpirationSchedule', label: 'Lease Expiration Schedule', group: 'Units / Properties' },
    { key: 'propertiesMoveInsMoveOuts', label: 'Move-Ins / Move-Outs', group: 'Units / Properties' },
    { key: 'propertiesRentalRateTrend', label: 'Rental Rate Trend', group: 'Units / Properties' },
    { key: 'propertiesPropertyPerformance', label: 'Property Performance', group: 'Units / Properties' },
    { key: 'propertiesUnitMixPerformance', label: 'Unit Mix Performance', group: 'Units / Properties' },
    { key: 'propertiesDelinquencyByProperty', label: 'Delinquency by Property', group: 'Units / Properties' },
    { key: 'propertiesRenewalPipeline', label: 'Renewal Pipeline', group: 'Units / Properties' },
  ],
  maintenance_work_orders: [
    { key: 'maintenanceOpenWorkOrders', label: 'Open Work Orders', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceWorkOrderAging', label: 'Work Order Aging', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceBacklogByPriority', label: 'Backlog by Priority', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceCompletionTrend', label: 'Completion Trend', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceResponseTimeSla', label: 'Response Time / SLA', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceCostByPropertyUnit', label: 'Cost by Property / Unit', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceVendorPerformance', label: 'Vendor Performance', group: 'Maintenance / Work Orders' },
    { key: 'maintenanceRepeatIssues', label: 'Repeat Issues', group: 'Maintenance / Work Orders' },
  ],
  commercial_property_types: [
    { key: 'commercialPropertyRetailActivity', label: 'Retail Property Activity', group: 'Commercial Property Types' },
    { key: 'commercialPropertyOfficeActivity', label: 'Office Property Activity', group: 'Commercial Property Types' },
    { key: 'commercialPropertyIndustrialActivity', label: 'Industrial Property Activity', group: 'Commercial Property Types' },
    { key: 'commercialPropertyMultifamilyActivity', label: 'Multifamily Property Activity', group: 'Commercial Property Types' },
    { key: 'commercialPropertyLandDevelopmentPipeline', label: 'Land & Development Pipeline', group: 'Commercial Property Types' },
    { key: 'commercialPropertyDealPipelineByType', label: 'Deal Pipeline by Property Type', group: 'Commercial Property Types' },
    { key: 'commercialPropertyRevenueMixByType', label: 'Revenue Mix by Property Type', group: 'Commercial Property Types' },
    { key: 'commercialPropertyCommissionsByType', label: 'Commission / Fee Pipeline by Property Type', group: 'Commercial Property Types' },
    { key: 'commercialPropertyMarketCompsByType', label: 'Market Comps by Property Type', group: 'Commercial Property Types' },
    { key: 'commercialPropertyAdvisoryEngagements', label: 'Advisory Engagements by Property Type', group: 'Commercial Property Types' },
  ],
};

function normalizeSector(sectorCategory?: string | null): string {
  return String(sectorCategory || '').trim();
}

export function getOperationalHubDefaultModuleKeys(sectorCategory?: string | null): string[] {
  const sectorModules = getTopLineBucketsForSector(sectorCategory).map((bucket) => String(bucket.key || '').trim()).filter(Boolean);
  return Array.from(new Set(['dashboard', 'forecast', ...sectorModules, 'cash', 'daily_financials', 'loans', 'cap_table']));
}

function getSectorBucketModuleKeys(sectorCategory?: string | null): string[] {
  return getTopLineBucketsForSector(sectorCategory).map((bucket) => String(bucket.key || '').trim()).filter(Boolean);
}

export function hasStaleOperationalHubSectorTabOverrides(
  sectorCategory?: string | null,
  sections?: Record<string, any> | null
): boolean {
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return false;
  const sectorModules = getSectorBucketModuleKeys(sectorCategory);
  if (sectorModules.length === 0) return false;
  const tabKeys = sectorModules.map((moduleKey) => `tab:${moduleKey}`);
  const hasExplicitSectorTabOverride = tabKeys.some((key) => Object.prototype.hasOwnProperty.call(sections, key));
  if (!hasExplicitSectorTabOverride) return false;
  return tabKeys.every((key) => sections[key] === false);
}

export function getOperationalHubSectionsForSector(
  sectorCategory?: string | null,
  sections?: Record<string, any> | null
): Record<string, any> {
  const safeSections =
    sections && typeof sections === 'object' && !Array.isArray(sections)
      ? sections
      : {};
  if (!hasStaleOperationalHubSectorTabOverrides(sectorCategory, safeSections)) return safeSections;
  const next = { ...safeSections };
  getSectorBucketModuleKeys(sectorCategory).forEach((moduleKey) => {
    delete next[`tab:${moduleKey}`];
  });
  return next;
}

export function getOperationalHubModuleLabel(moduleKey: string, sectorCategory?: string | null): string {
  if (moduleKey === 'dashboard') return 'Overview';
  if (moduleKey === 'forecast') return 'Forecast';
  if (normalizeSector(sectorCategory) === '42' && moduleKey === 'products_skus') return 'Products';
  return getModuleLabel(moduleKey) || moduleKey.replace(/_/g, ' ');
}

export function getOperationalHubDefaultReportsForModule(
  moduleKey: string,
  sectorCategory?: string | null
): OperationalHubReportDefinition[] {
  const sector = normalizeSector(sectorCategory);
  if (sector === '53' && SECTOR_53_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_53_REPORTS_BY_MODULE[moduleKey];
  }
  const dataType = mapModuleToDataType(moduleKey);
  const group = dataType ? DATA_TYPE_GROUP[dataType] : null;
  return group ? REPORTS_BY_DATA_GROUP[group] || [] : [];
}

export function getOperationalHubDefaultCategories(sectorCategory?: string | null): OperationalHubCategoryDefinition[] {
  return getOperationalHubDefaultModuleKeys(sectorCategory).map((moduleKey) => ({
    key: moduleKey,
    label: getOperationalHubModuleLabel(moduleKey, sectorCategory),
    reports: getOperationalHubDefaultReportsForModule(moduleKey, sectorCategory).map((report) => ({
      ...report,
      group: getOperationalHubModuleLabel(moduleKey, sectorCategory),
    })),
  }));
}
