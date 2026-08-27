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

export const ISOLVED_HUB_REPORT_NAME_SUFFIX = 'isolved';
const ISOLVED_HUB_REPORT_MODULES = new Set(['payroll']);

export function isIsolvedHubReportModule(moduleKey: string): boolean {
  return ISOLVED_HUB_REPORT_MODULES.has(String(moduleKey || '').trim());
}

export function withIsolvedHubReportName(label: string): string {
  const trimmed = String(label || '').trim();
  if (!trimmed) return trimmed;
  if (new RegExp(`\\s${ISOLVED_HUB_REPORT_NAME_SUFFIX}$`, 'i').test(trimmed)) return trimmed;
  return `${trimmed} ${ISOLVED_HUB_REPORT_NAME_SUFFIX}`;
}

export function withoutIsolvedHubReportName(label: string): string {
  const trimmed = String(label || '').trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(new RegExp(`\\s${ISOLVED_HUB_REPORT_NAME_SUFFIX}$`, 'i'), '').trim();
}

const REPORTS_BY_DATA_GROUP: Record<string, OperationalHubReportDefinition[]> = {
  Customers: [
    { key: 'customersTop10MonthlyTrend', label: 'Top 10 Customers Monthly Trend', group: 'Customers' },
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

export const RETAIL_ONLY_PRODUCT_REPORT_KEYS = new Set([
  'productsRetailForecasting',
  'productsMerchandiseProfitability',
]);

const SECTOR_23_REPORTS_BY_MODULE: Record<string, OperationalHubReportDefinition[]> = {
  construction_inventory: [
    { key: 'constructionInventoryKpis', label: 'Inventory KPI Cards', group: 'Inventory' },
    { key: 'hiltiAssetsByCategory', label: 'Equipment & Tools by Category', group: 'Inventory' },
    { key: 'hiltiAssetsByJob', label: 'Equipment & Tools by Job', group: 'Inventory' },
    { key: 'hiltiMaintenanceQueue', label: 'Equipment Maintenance & Compliance Queue', group: 'Inventory' },
    { key: 'hiltiIdleAssets', label: 'Idle / Underutilized Equipment', group: 'Inventory' },
    { key: 'constructionMaterialsByCategory', label: 'Materials by Category', group: 'Inventory' },
    { key: 'constructionMaterialsByJob', label: 'Materials by Job', group: 'Inventory' },
    { key: 'constructionMaterialsReorderQueue', label: 'Materials Reorder Queue', group: 'Inventory' },
    { key: 'constructionMaterialsAging', label: 'Materials Aging', group: 'Inventory' },
    { key: 'hiltiAssetRegister', label: 'Equipment Asset Register', group: 'Inventory' },
  ],
  job_cost_control: [
    { key: 'crewtracksKpis', label: 'Crewtracks KPI Cards', group: 'Job Cost Control' },
    { key: 'crewtracksCrewProductivity', label: 'Crew Productivity', group: 'Job Cost Control' },
    { key: 'crewtracksJobProductivity', label: 'Job Productivity', group: 'Job Cost Control' },
    { key: 'crewtracksExceptions', label: 'Crew Exceptions', group: 'Job Cost Control' },
    { key: 'crewtracksRecentTime', label: 'Recent Crew Time', group: 'Job Cost Control' },
  ],
  project_portfolio: [
    { key: 'projectPortfolioScheduleVsBudget', label: 'Schedule vs Budget', group: 'Project Portfolio' },
  ],
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
    { key: 'customersTop10MonthlyTrend', label: 'Top 10 Customers Monthly Trend', group: 'Customers' },
    { key: 'customersTopByRevenue', label: 'Top Customers by Revenue', group: 'Customers' },
    { key: 'customersRevenueDistribution', label: 'Revenue Distribution by Customer', group: 'Customers' },
    { key: 'customersConcentrationRisk', label: 'Concentration Risk', group: 'Customers' },
    { key: 'customersRetentionProxy', label: 'Revenue Retention Proxy', group: 'Customers' },
    { key: 'customersAtRiskQueue', label: 'At-Risk Accounts Queue', group: 'Customers' },
  ],
  vendors: [
    { key: 'vendorsCatalogPurchaseHistory', label: 'Vendor catalog & purchase history', group: 'Vendors' },
    { key: 'vendorsItemVolumePricing6mo', label: '6-month item volume and pricing', group: 'Vendors' },
    { key: 'vendorsPaymentHistoryByMonth', label: 'Payment history by month', group: 'Vendors' },
    { key: 'vendorsConcentration', label: 'Vendor concentration', group: 'Vendors' },
    { key: 'vendorsPriceChangeTracker', label: 'Price-change tracker', group: 'Vendors' },
    { key: 'vendorsSpendByItemCategory', label: 'Spend by item category', group: 'Vendors' },
  ],
};

const SECTOR_62_REPORTS_BY_MODULE: Record<string, OperationalHubReportDefinition[]> = {
  patients_encounters: [
    { key: 'patientsTestOrdersByRegion', label: 'Test Orders by Region', group: 'Patients / Encounters' },
    { key: 'patientsTestOrdersByProductService', label: 'Test Orders by Product / Service', group: 'Patients / Encounters' },
    { key: 'patientsCompletedTestsByRegion', label: 'Completed Tests by Region', group: 'Patients / Encounters' },
    { key: 'patientsCompletedTestsByProductService', label: 'Completed Tests by Product / Service', group: 'Patients / Encounters' },
    { key: 'patientsTatByRegionAndProduct', label: 'Turnaround Time by Region and Product / Service', group: 'Patients / Encounters' },
    { key: 'patientsBacklogByRegionAndProduct', label: 'Open Test Backlog by Region and Product / Service', group: 'Patients / Encounters' },
    { key: 'patientsRejectionRateByRegion', label: 'Sample Rejection Rate by Region', group: 'Patients / Encounters' },
    { key: 'patientsPositiveDetectionByProduct', label: 'Positive Detection Rate by Product / Service', group: 'Patients / Encounters' },
  ],
  services_procedures: [
    { key: 'servicesRevenueByRegionAndProduct', label: 'Revenue by Region and Product / Service', group: 'Services / Procedures' },
    { key: 'servicesGrossMarginByRegionAndProduct', label: 'Gross Margin by Region and Product / Service', group: 'Services / Procedures' },
    { key: 'servicesCostPerTestByProduct', label: 'Cost per Test by Product / Service', group: 'Services / Procedures' },
    { key: 'servicesVolumeByRegionAndProduct', label: 'Test Volume by Region and Product / Service', group: 'Services / Procedures' },
    { key: 'servicesOncologyVsWomensHealthByRegion', label: "Oncology vs Women's Health by Region", group: 'Services / Procedures' },
    { key: 'servicesBiopharmaRevenueByRegion', label: 'Biopharma Revenue by Region', group: 'Services / Procedures' },
    { key: 'servicesAiBioinformaticsRevenueByRegion', label: 'AI / Bioinformatics Revenue by Region', group: 'Services / Procedures' },
    { key: 'servicesAssayTrendByRegion', label: 'Assay Trend by Region', group: 'Services / Procedures' },
  ],
  staffing_providers: [
    { key: 'staffingLabUtilizationByRegion', label: 'Laboratory Utilization by Region', group: 'Staffing / Providers' },
    { key: 'staffingLabUtilizationByProductService', label: 'Laboratory Utilization by Product / Service', group: 'Staffing / Providers' },
    { key: 'staffingSequencingCapacityByRegion', label: 'Sequencing Capacity by Region', group: 'Staffing / Providers' },
    { key: 'staffingSequencingCapacityByProduct', label: 'Sequencing Capacity by Product / Service', group: 'Staffing / Providers' },
    { key: 'staffingTestsPerFteByRegion', label: 'Tests per FTE by Region', group: 'Staffing / Providers' },
    { key: 'staffingTatByLabAndRegion', label: 'TAT by Laboratory and Region', group: 'Staffing / Providers' },
    { key: 'staffingThroughputByDepartmentProduct', label: 'Testing Department Throughput by Product / Service', group: 'Staffing / Providers' },
    { key: 'staffingUtilizationExceptionsByRegion', label: 'Utilization Exceptions by Region', group: 'Staffing / Providers' },
  ],
  payors_customers: [
    { key: 'customersRevenueByHospitalNetwork', label: 'Revenue by Hospital Network', group: 'Payors / Customers' },
    { key: 'customersAccountsByCountry', label: 'Hospital Accounts by Country', group: 'Payors / Customers' },
    { key: 'customersPipelineBySegment', label: 'Sales Pipeline by Customer Segment', group: 'Payors / Customers' },
    { key: 'customersConcentrationBySegment', label: 'Customer Concentration by Segment', group: 'Payors / Customers' },
    { key: 'customersCollectionsBySegment', label: 'Cash Collections by Segment', group: 'Payors / Customers' },
    { key: 'customersGovernmentPrograms', label: 'Government Screening Programs', group: 'Payors / Customers' },
    { key: 'customersPharmaResearchAccounts', label: 'Pharma / Research Accounts', group: 'Payors / Customers' },
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
    { key: 'mortgageCycleTimeByMilestone', label: 'Cycle-Time by Milestone', group: 'Mortgage' },
    { key: 'mortgageOperationalBottlenecks', label: 'Conditions & Document Bottlenecks', group: 'Mortgage' },
    { key: 'mortgageLoanPipelineDetail', label: 'Loan Pipeline Detail', group: 'Mortgage' },
    { key: 'mortgageAttachmentReport', label: 'Mortgage Attachment Report', group: 'Mortgage' },
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
  property_management: [
    { key: 'propertyManagementRegionScorecard', label: 'Region Scorecard', group: 'Property Management' },
    { key: 'propertyManagementPortfolioPipeline', label: 'Portfolio Pipeline', group: 'Property Management' },
    { key: 'propertyManagerProductivity', label: 'Property Manager Productivity', group: 'Property Management' },
    { key: 'propertyManagementOperatingMetrics', label: 'Operating Metrics', group: 'Property Management' },
  ],
};

const SECTOR_54_REPORTS_BY_MODULE: Record<string, OperationalHubReportDefinition[]> = {
  todays_operations: [
    { key: 'bureauTodayKpis', label: "Today's Operations", group: "Today's Operations" },
    { key: 'bureauNeedsAttention', label: 'Needs Attention Today', group: "Today's Operations" },
    { key: 'bureauTodayRuns', label: 'Payrolls Due Today', group: "Today's Operations" },
    { key: 'bureauProcessorWorkloadToday', label: 'Processor Workload Today', group: "Today's Operations" },
  ],
  payroll_performance: [
    { key: 'bureauPerfScorecard', label: 'Payroll Performance Scorecard', group: 'Payroll Performance' },
    { key: 'bureauPerfDelaySources', label: 'Delay Sources', group: 'Payroll Performance' },
    { key: 'bureauClientQualityRanking', label: 'Client Service-Quality Ranking', group: 'Payroll Performance' },
  ],
  processor_capacity: [
    { key: 'bureauProcessorCapacity', label: 'Processor Capacity', group: 'Processor Capacity' },
    { key: 'bureauWorkloadForecast', label: 'Next Two Weeks Workload Forecast', group: 'Processor Capacity' },
    { key: 'bureauProcessorNextWeek', label: 'Processor Load — Next Two Weeks', group: 'Processor Capacity' },
  ],
  client_economics: [
    { key: 'bureauCostToServe', label: 'Cost to Serve', group: 'Client Economics' },
    { key: 'bureauCostToServeStack', label: 'Cost-to-Serve Stack', group: 'Client Economics' },
    { key: 'bureauImplementationCost', label: 'Implementation Cost vs Fee', group: 'Client Economics' },
    { key: 'bureauBillingsByCustomer', label: 'Billings by Customer', group: 'Client Economics' },
    { key: 'bureauBillingsByType', label: 'Billings by Customer Type', group: 'Client Economics' },
    { key: 'bureauBillingsBySize', label: 'Billings by Customer Size', group: 'Client Economics' },
    { key: 'bureauProfitByCustomer', label: 'Profitability by Customer', group: 'Client Economics' },
    { key: 'bureauClientHealth', label: 'Client Health', group: 'Client Economics' },
    { key: 'bureauAccountManagers', label: 'Account Managers', group: 'Client Economics' },
  ],
  payroll: [
    { key: 'payrollClientCensus', label: 'Client / Company Census', group: 'Payroll' },
    { key: 'payrollRunScorecard', label: 'Payroll Run Scorecard', group: 'Payroll' },
    { key: 'payrollGrossToNet', label: 'Gross-to-Net Summary', group: 'Payroll' },
    { key: 'payrollEarningsByCode', label: 'Earnings by Code', group: 'Payroll' },
    { key: 'payrollDeductionsByCode', label: 'Deductions by Code', group: 'Payroll' },
    { key: 'payrollTaxWithholdings', label: 'Tax Withholdings', group: 'Payroll' },
    { key: 'payrollDirectDepositMix', label: 'Direct Deposit Mix', group: 'Payroll' },
    { key: 'payrollPayGroupCalendar', label: 'Pay Groups / Calendar', group: 'Payroll' },
    { key: 'payrollGlExportJournal', label: 'GL Export / Payroll Journal', group: 'Payroll' },
    { key: 'payrollOnTimeProcessing', label: 'On-Time Processing', group: 'Payroll' },
    { key: 'payrollBenefitsEnrollments', label: 'Benefits Enrollments', group: 'Payroll' },
  ],
  time_utilization: [
    { key: 'lsWorkforceSummary', label: 'Workforce Summary', group: 'Workforce / Time' },
    { key: 'lsCompensationByRole', label: 'Compensation by Role', group: 'Workforce / Time' },
    { key: 'lsEmployeeCompensationRoster', label: 'Employee Compensation Roster', group: 'Workforce / Time' },
    { key: 'lsHeadcountByRole', label: 'Headcount by Role', group: 'Workforce / Time' },
    { key: 'lsHeadcountByDepartment', label: 'Headcount by Department', group: 'Workforce / Time' },
    { key: 'lsLocationPayTypeMix', label: 'Location / Pay Type Mix', group: 'Workforce / Time' },
    { key: 'lsUtilizationPct', label: 'Utilization % (billable vs paid hours)', group: 'Workforce / Time' },
    { key: 'lsOvertimeAnalysis', label: 'Overtime Analysis', group: 'Workforce / Time' },
    { key: 'lsPtoBalances', label: 'PTO / Leave Balances', group: 'Workforce / Time' },
  ],
  hiring: [
    { key: 'hiringOpenJobs', label: 'Open Jobs', group: 'Hiring' },
    { key: 'hiringApplicantPipeline', label: 'Applicant Pipeline', group: 'Hiring' },
    { key: 'hiringFunnelByRole', label: 'Funnel by Role', group: 'Hiring' },
    { key: 'hiringTimeToFillByJob', label: 'Time to Fill by Hire', group: 'Hiring' },
    { key: 'hiringApplicantsByJob', label: 'Applicants by Job', group: 'Hiring' },
    { key: 'hiringPostingPerformance', label: 'Posting Performance', group: 'Hiring' },
    { key: 'hiringOnboardingPipeline', label: 'Onboarding / New Hires', group: 'Hiring' },
  ],
};

function normalizeSector(sectorCategory?: string | null): string {
  return String(sectorCategory || '').trim();
}

export function getOperationalHubDefaultModuleKeys(sectorCategory?: string | null): string[] {
  const sector = normalizeSector(sectorCategory);
  const sectorModules = getTopLineBucketsForSector(sectorCategory).map((bucket) => String(bucket.key || '').trim()).filter(Boolean);
  const withVendors =
    ['32', '42'].includes(sector) && !sectorModules.includes('vendors')
      ? (() => {
          const productsIdx = sectorModules.findIndex((module) => module === 'products_skus' || module === 'products');
          if (productsIdx < 0) return [...sectorModules, 'vendors'];
          return [...sectorModules.slice(0, productsIdx + 1), 'vendors', ...sectorModules.slice(productsIdx + 1)];
        })()
      : sectorModules;
  return Array.from(new Set(['dashboard', 'forecast', ...withVendors, 'cash', 'daily_financials', 'loans', 'cap_table']));
}

export function getOperationalHubModuleLabel(moduleKey: string, sectorCategory?: string | null): string {
  if (moduleKey === 'dashboard') return 'Overview';
  if (moduleKey === 'forecast') return 'Forecast';
  const sector = normalizeSector(sectorCategory);
  if ((sector === '32' || sector === '42') && moduleKey === 'products_skus') return 'Products';
  if ((sector === '32' || sector === '42') && moduleKey === 'vendors') return 'Vendors';
  if (sector === '54' && moduleKey === 'todays_operations') return "Today's Operations";
  if (sector === '54' && moduleKey === 'payroll_performance') return 'Payroll Performance';
  if (sector === '54' && moduleKey === 'processor_capacity') return 'Processor Capacity';
  if (sector === '54' && moduleKey === 'client_economics') return 'Client Economics';
  if (sector === '54' && moduleKey === 'time_utilization') return 'Workforce / Time';
  if (sector === '54' && moduleKey === 'hiring') return 'Hiring / Onboarding';
  return getModuleLabel(moduleKey) || moduleKey.replace(/_/g, ' ');
}

function sectorModuleReportMap(sector: string): Record<string, OperationalHubReportDefinition[]> | null {
  if (sector === '23') return SECTOR_23_REPORTS_BY_MODULE;
  if (sector === '32') return SECTOR_32_REPORTS_BY_MODULE;
  if (sector === '62') return SECTOR_62_REPORTS_BY_MODULE;
  if (sector === '53') return SECTOR_53_REPORTS_BY_MODULE;
  if (sector === '54') return SECTOR_54_REPORTS_BY_MODULE;
  return null;
}

export function hasExplicitSectorModuleReports(sectorCategory: string | null | undefined, moduleKey: string): boolean {
  const map = sectorModuleReportMap(normalizeSector(sectorCategory));
  return Boolean(map && Object.prototype.hasOwnProperty.call(map, String(moduleKey || '').trim()));
}

export function getOperationalHubDefaultReportsForModule(
  moduleKey: string,
  sectorCategory?: string | null
): OperationalHubReportDefinition[] {
  const sector = normalizeSector(sectorCategory);
  if (sector === '23' && SECTOR_23_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_23_REPORTS_BY_MODULE[moduleKey];
  }
  if (sector === '32' && SECTOR_32_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_32_REPORTS_BY_MODULE[moduleKey];
  }
  if (sector === '62' && SECTOR_62_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_62_REPORTS_BY_MODULE[moduleKey];
  }
  if (sector === '53' && SECTOR_53_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_53_REPORTS_BY_MODULE[moduleKey];
  }
  if (sector === '54' && SECTOR_54_REPORTS_BY_MODULE[moduleKey]) {
    return SECTOR_54_REPORTS_BY_MODULE[moduleKey].map((report) => ({
      ...report,
      label: isIsolvedHubReportModule(moduleKey) ? withIsolvedHubReportName(report.label) : report.label,
    }));
  }
  if (moduleKey === 'vendors') {
    return [];
  }
  const dataType = mapModuleToDataType(moduleKey);
  const group = dataType ? DATA_TYPE_GROUP[dataType] : null;
  const reports = group ? REPORTS_BY_DATA_GROUP[group] || [] : [];
  if (sector === '45') return reports;
  return reports.filter((report) => !RETAIL_ONLY_PRODUCT_REPORT_KEYS.has(report.key));
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
