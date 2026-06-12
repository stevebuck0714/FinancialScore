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
  sales: 'Customers',
  products: 'Products',
};

const SECTOR_32_REPORTS_BY_MODULE: Record<string, OperationalHubReportDefinition[]> = {
  inventory: [
    { key: 'customersWipByCustomer', label: 'WIP / Open Production', group: 'Inventory' },
    { key: 'inventoryValueTrend', label: 'Value Trend', group: 'Inventory' },
    { key: 'inventoryMovement', label: 'Inventory Movement', group: 'Inventory' },
    { key: 'inventoryCurrentTable', label: 'Current Inventory Table', group: 'Inventory' },
    { key: 'inventoryDistribution', label: 'Value Distribution', group: 'Inventory' },
    { key: 'inventoryAgingObsolescenceV1', label: 'Inventory Aging & Obsolescence', group: 'Inventory' },
  ],
  sales: [
    { key: 'customersPlatoSalesMetricCards', label: 'Sales Metric Cards', group: 'Sales' },
    { key: 'customersPlatoSalesHistoryChart', label: 'Sales History Chart', group: 'Sales' },
    { key: 'customersPlatoSalesHistoryTables', label: 'Sales History Tables', group: 'Sales' },
    { key: 'customersGrossMarginHistoryChart', label: 'Gross Margin History Chart', group: 'Sales' },
    { key: 'customersGrossMarginHistoryTable', label: 'Gross Margin History Table', group: 'Sales' },
    { key: 'customersInvoiceVelocity', label: 'Revenue vs Invoice Velocity', group: 'Sales' },
  ],
  customers: [
    { key: 'customersTopByRevenue', label: 'Top Customers by Revenue', group: 'Customers' },
    { key: 'customersRevenueDistribution', label: 'Revenue Distribution by Customer', group: 'Customers' },
    { key: 'customersConcentrationRisk', label: 'Concentration Risk', group: 'Customers' },
    { key: 'customersRetentionProxy', label: 'Revenue Retention Proxy', group: 'Customers' },
    { key: 'customersAtRiskQueue', label: 'At-Risk Accounts Queue', group: 'Customers' },
  ],
};

const SECTOR_53_REPORTS_BY_MODULE: Record<string, OperationalHubReportDefinition[]> = {
  firm: [
    { key: 'firmDivisionScorecard', label: 'Division Scorecard', group: 'Firm' },
    { key: 'firmRevenueByDivision', label: 'Revenue by Division', group: 'Firm' },
    { key: 'firmRegionBreakout', label: 'Region Breakout', group: 'Firm' },
    { key: 'firmOfficeLeaderboard', label: 'Office Leaderboard', group: 'Firm' },
    { key: 'firmDivisionDetail', label: 'Division Detail', group: 'Firm' },
    { key: 'firmOfficeDivisionMatrix', label: 'Office / Division Matrix', group: 'Firm' },
    { key: 'firmAgentProducerLeaderboard', label: 'Agent / Producer Leaderboard', group: 'Firm' },
  ],
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
  residential_real_estate: [
    { key: 'residentialSalesRevenueScorecard', label: 'Sales & Revenue Scorecard', group: 'Residential Real Estate' },
    { key: 'residentialPipelineForecast', label: 'Pipeline & Forecast Report', group: 'Residential Real Estate' },
    { key: 'residentialAgentProductivityReport', label: 'Agent Productivity Report', group: 'Residential Real Estate' },
    { key: 'residentialCustomerAttachmentReport', label: 'Customer Attachment Report', group: 'Residential Real Estate' },
    { key: 'residentialRegionScorecard', label: 'Region Scorecard', group: 'Residential Real Estate' },
    { key: 'residentialOfficeLeaderboard', label: 'Office Leaderboard', group: 'Residential Real Estate' },
    { key: 'residentialAgentProductivity', label: 'Agent Productivity', group: 'Residential Real Estate' },
    { key: 'residentialClosingsPipeline', label: 'Closings / Pipeline', group: 'Residential Real Estate' },
  ],
  mortgage: [
    { key: 'mortgageProductionScorecard', label: 'Mortgage Production Scorecard', group: 'Mortgage' },
    { key: 'mortgagePipelineForecastReport', label: 'Loan Pipeline & Forecast Report', group: 'Mortgage' },
    { key: 'mortgageProductionRankingReport', label: 'Production Ranking Report', group: 'Mortgage' },
    { key: 'mortgageFunnelPullThroughReport', label: 'Funnel & Pull-Through Report', group: 'Mortgage' },
    { key: 'mortgageAttachmentReport', label: 'Mortgage Attachment Report', group: 'Mortgage' },
    { key: 'mortgageRegionScorecard', label: 'Region Scorecard', group: 'Mortgage' },
    { key: 'mortgageLoanPipeline', label: 'Loan Pipeline', group: 'Mortgage' },
    { key: 'mortgageOfficerProductivity', label: 'Loan Officer Productivity', group: 'Mortgage' },
    { key: 'mortgagePullThrough', label: 'Pull-Through / Close Rate', group: 'Mortgage' },
  ],
  title_company: [
    { key: 'titleProductionScorecard', label: 'Title Production Scorecard', group: 'Title Company' },
    { key: 'titleEscrowPipelineForecastReport', label: 'Escrow Pipeline & Forecast Report', group: 'Title Company' },
    { key: 'titleOfficeEscrowOfficerRankingReport', label: 'Office & Escrow Officer Ranking Report', group: 'Title Company' },
    { key: 'titleOperationalEfficiencyReport', label: 'Operational Efficiency Report', group: 'Title Company' },
    { key: 'titleAttachmentReport', label: 'Title Attachment Report', group: 'Title Company' },
  ],
  insurance_services: [
    { key: 'insuranceRegionScorecard', label: 'Region Scorecard', group: 'Insurance Services' },
    { key: 'insurancePolicyProduction', label: 'Policy Production', group: 'Insurance Services' },
    { key: 'insuranceProducerProductivity', label: 'Producer Productivity', group: 'Insurance Services' },
    { key: 'insuranceRetentionRenewals', label: 'Retention / Renewals', group: 'Insurance Services' },
  ],
  commercial_real_estate: [
    { key: 'commercialRegionScorecard', label: 'Region Scorecard', group: 'Commercial Real Estate' },
    { key: 'commercialDealPipeline', label: 'Deal Pipeline', group: 'Commercial Real Estate' },
    { key: 'commercialBrokerProductivity', label: 'Broker Productivity', group: 'Commercial Real Estate' },
    { key: 'commercialPropertyTypeMix', label: 'Property Type Mix', group: 'Commercial Real Estate' },
  ],
};

function normalizeSector(sectorCategory?: string | null): string {
  return String(sectorCategory || '').trim();
}

export function getOperationalHubDefaultModuleKeys(sectorCategory?: string | null): string[] {
  const sectorModules = getTopLineBucketsForSector(sectorCategory).map((bucket) => String(bucket.key || '').trim()).filter(Boolean);
  return Array.from(new Set(['dashboard', 'forecast', ...sectorModules, 'cash', 'daily_financials', 'loans', 'cap_table']));
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
  if (sector === '32' && SECTOR_32_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_32_REPORTS_BY_MODULE[moduleKey];
  }
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
