import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { mapModuleToDataType, resolveModuleKey, type OpsDataType } from '@/lib/operations/module-registry';

export type ReportFieldCatalogItem = {
  field: string;
  label: string;
  source: 'MonthlyFinancial' | 'derived' | 'operational';
  format: 'currency' | 'percent' | 'number';
  moduleKey?: string;
  dataType?: OpsDataType;
  recordSet?: string;
  valueKey?: string;
  categoryKey?: string;
};

export const financialReportFields: ReportFieldCatalogItem[] = [
  { field: 'revenue', label: 'Revenue', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'cogsTotal', label: 'COGS', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'grossProfit', label: 'Gross Profit', source: 'derived', format: 'currency' },
  { field: 'grossMarginPct', label: 'Gross Margin %', source: 'derived', format: 'percent' },
  { field: 'expense', label: 'Operating Expense', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'ebitda', label: 'EBITDA', source: 'derived', format: 'currency' },
  { field: 'netIncome', label: 'Net Income', source: 'derived', format: 'currency' },
  { field: 'cash', label: 'Cash', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'ar', label: 'Accounts Receivable', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'ap', label: 'Accounts Payable', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'inventory', label: 'Inventory', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'loc', label: 'Line of Credit', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'totalAssets', label: 'Total Assets', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'totalLiab', label: 'Total Liabilities', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'totalEquity', label: 'Total Equity', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'nonOperatingIncome', label: 'Non-Operating Income', source: 'MonthlyFinancial', format: 'currency' },
  { field: 'nonOperatingExpense', label: 'Non-Operating Expense', source: 'MonthlyFinancial', format: 'currency' },
];

const operationalTemplates: Record<string, Omit<ReportFieldCatalogItem, 'moduleKey' | 'dataType'>[]> = {
  cash: [
    { field: 'op.cash.cashBalance', label: 'Cash Balance', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'cashBalance' },
  ],
  'ar-aging': [
    { field: 'op.ar-aging.totalAR', label: 'Total AR', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'totalAR' },
    { field: 'op.ar-aging.days90plus', label: 'AR 90+ Days', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'days90plus' },
  ],
  'ap-aging': [
    { field: 'op.ap-aging.totalAP', label: 'Total AP', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'totalAP' },
    { field: 'op.ap-aging.days90plus', label: 'AP 90+ Days', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'days90plus' },
  ],
  customers: [
    { field: 'op.customers.revenue', label: 'Customer Revenue', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'revenue' },
    { field: 'op.customers.invoiceCount', label: 'Customer Invoice Count', source: 'operational', format: 'number', recordSet: 'records', valueKey: 'invoiceCount' },
  ],
  'customers-sites': [
    { field: 'op.customers-sites.revenue', label: 'Customer / Site Revenue', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'revenue' },
    { field: 'op.customers-sites.invoiceCount', label: 'Customer / Site Activity Count', source: 'operational', format: 'number', recordSet: 'records', valueKey: 'invoiceCount' },
  ],
  products: [
    { field: 'op.products.revenue', label: 'Product / Service Revenue', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'revenue' },
    { field: 'op.products.grossMarginPct', label: 'Product / Service Gross Margin %', source: 'operational', format: 'percent', recordSet: 'records', valueKey: 'grossMarginPct' },
  ],
  inventory: [
    { field: 'op.inventory.assetValue', label: 'Inventory Value', source: 'operational', format: 'currency', recordSet: 'records', valueKey: 'assetValue' },
    { field: 'op.inventory.qtyOnHand', label: 'Quantity On Hand', source: 'operational', format: 'number', recordSet: 'records', valueKey: 'qtyOnHand' },
  ],
  'job-cost-control': [
    { field: 'op.job-cost-control.actual', label: 'Job Cost Actual', source: 'operational', format: 'currency', recordSet: 'costByType', valueKey: 'actual', categoryKey: 'costType' },
    { field: 'op.job-cost-control.budget', label: 'Job Cost Budget', source: 'operational', format: 'currency', recordSet: 'costByType', valueKey: 'budget', categoryKey: 'costType' },
    { field: 'op.job-cost-control.committed', label: 'Job Cost Committed', source: 'operational', format: 'currency', recordSet: 'costByType', valueKey: 'committed', categoryKey: 'costType' },
    { field: 'op.job-cost-control.variance', label: 'Job Cost Variance', source: 'operational', format: 'currency', recordSet: 'costByType', valueKey: 'variance', categoryKey: 'costType' },
    { field: 'op.job-cost-control.dailyCost', label: 'Daily Job Cost', source: 'operational', format: 'currency', recordSet: 'dailyCost', valueKey: 'dailyCost', categoryKey: 'costType' },
    { field: 'op.job-cost-control.dailyBudget', label: 'Daily Job Budget', source: 'operational', format: 'currency', recordSet: 'dailyCost', valueKey: 'dailyBudget', categoryKey: 'costType' },
    { field: 'op.job-cost-control.crewLaborHours', label: 'Crewtracks Labor Hours', source: 'operational', format: 'number', recordSet: 'crewtracksByCrew', valueKey: 'laborHours' },
    { field: 'op.job-cost-control.crewOvertimeHours', label: 'Crewtracks Overtime Hours', source: 'operational', format: 'number', recordSet: 'crewtracksByCrew', valueKey: 'overtimeHours' },
    { field: 'op.job-cost-control.crewUnitsCompleted', label: 'Crewtracks Units Completed', source: 'operational', format: 'number', recordSet: 'crewtracksByCrew', valueKey: 'unitsCompleted' },
    { field: 'op.job-cost-control.crewProductivityPerHour', label: 'Crewtracks Productivity per Hour', source: 'operational', format: 'number', recordSet: 'crewtracksByCrew', valueKey: 'productivityPerHour' },
    { field: 'op.job-cost-control.crewVariancePct', label: 'Crewtracks Productivity Variance %', source: 'operational', format: 'percent', recordSet: 'crewtracksByCrew', valueKey: 'variancePct' },
  ],
  hiring: [
    { field: 'op.hiring.openJobs', label: 'Open Jobs', source: 'operational', format: 'number', recordSet: 'jobs', valueKey: 'openJobs' },
    { field: 'op.hiring.totalApplicants', label: 'Total Applicants', source: 'operational', format: 'number', recordSet: 'jobs', valueKey: 'totalApplicantsCount' },
    { field: 'op.hiring.activeApplicants', label: 'Active Applicants', source: 'operational', format: 'number', recordSet: 'jobs', valueKey: 'activeApplicantsCount' },
    { field: 'op.hiring.newApplicants', label: 'New Applicants', source: 'operational', format: 'number', recordSet: 'jobs', valueKey: 'newApplicantsCount' },
    { field: 'op.hiring.applications', label: 'Applications', source: 'operational', format: 'number', recordSet: 'applications', valueKey: 'applicationCount', categoryKey: 'status' },
  ],
  payroll: [
    { field: 'op.payroll.grossPay', label: 'Gross Pay', source: 'operational', format: 'currency', recordSet: 'payrollRuns', valueKey: 'grossPay' },
    { field: 'op.payroll.netPay', label: 'Net Pay', source: 'operational', format: 'currency', recordSet: 'payrollRuns', valueKey: 'netPay' },
    { field: 'op.payroll.taxWithheld', label: 'Tax Withheld', source: 'operational', format: 'currency', recordSet: 'payrollRuns', valueKey: 'taxWithheld' },
    { field: 'op.payroll.employeeCount', label: 'Employees Paid', source: 'operational', format: 'number', recordSet: 'payrollRuns', valueKey: 'employeeCount' },
  ],
  'payroll-bureau-ops': [
    { field: 'op.payroll-bureau-ops.revenue', label: 'Client Annual Billing', source: 'operational', format: 'currency', recordSet: 'clients', valueKey: 'revenue' },
    { field: 'op.payroll-bureau-ops.profit', label: 'Client Profit', source: 'operational', format: 'currency', recordSet: 'clients', valueKey: 'profit' },
    { field: 'op.payroll-bureau-ops.marginPct', label: 'Client Margin %', source: 'operational', format: 'percent', recordSet: 'clients', valueKey: 'marginPct' },
  ],
  'labor-scheduling': [
    { field: 'op.labor.headcount', label: 'Headcount', source: 'operational', format: 'number', recordSet: 'headcountByRole', valueKey: 'headcount' },
    { field: 'op.labor.utilizationPct', label: 'Utilization %', source: 'operational', format: 'percent', recordSet: 'utilizationByRole', valueKey: 'utilizationPct' },
    { field: 'op.labor.overtimeHours', label: 'Overtime Hours', source: 'operational', format: 'number', recordSet: 'overtimeAnalysis', valueKey: 'overtimeHours' },
  ],
  'project-portfolio': [
    { field: 'op.project-portfolio.marginPct', label: 'Project Margin %', source: 'operational', format: 'percent', recordSet: 'jobs', valueKey: 'marginPct' },
    { field: 'op.project-portfolio.projectedProfit', label: 'Projected Profit', source: 'operational', format: 'currency', recordSet: 'jobs', valueKey: 'projectedProfit' },
  ],
  'commitments-forecast': [
    { field: 'op.commitments-forecast.forecastVariance', label: 'Forecast Variance', source: 'operational', format: 'currency', recordSet: 'eacForecast', valueKey: 'forecastVariance' },
    { field: 'op.commitments-forecast.exposure', label: 'Commitment Exposure', source: 'operational', format: 'currency', recordSet: 'commitmentExposure', valueKey: 'exposure' },
  ],
  'billing-cash': [
    { field: 'op.billing-cash.netCashPosition', label: 'Net Cash Position by Job', source: 'operational', format: 'currency', recordSet: 'billingCash', valueKey: 'netCashPosition' },
    { field: 'op.billing-cash.totalAR', label: 'AR by Job', source: 'operational', format: 'currency', recordSet: 'arByJob', valueKey: 'totalAR' },
  ],
  'construction-ar': [
    { field: 'op.construction-ar.totalAR', label: 'Construction AR by Project', source: 'operational', format: 'currency', recordSet: 'byProject', valueKey: 'totalAR' },
  ],
  'construction-ap': [
    { field: 'op.construction-ap.totalAP', label: 'Construction AP by Project', source: 'operational', format: 'currency', recordSet: 'byProject', valueKey: 'totalAP' },
  ],
  'hilti-inventory': [
    { field: 'op.hilti.assetCount', label: 'Hilti Assets by Category', source: 'operational', format: 'number', recordSet: 'byCategory', valueKey: 'assetCount' },
    { field: 'op.hilti.replacementValue', label: 'Hilti Replacement Value', source: 'operational', format: 'currency', recordSet: 'byCategory', valueKey: 'replacementValue' },
    { field: 'op.hilti.utilizationPct', label: 'Hilti Utilization %', source: 'operational', format: 'percent', recordSet: 'byCategory', valueKey: 'avgUtilizationPct' },
    { field: 'op.hilti.serviceDueCount', label: 'Hilti Service Due Count', source: 'operational', format: 'number', recordSet: 'byCategory', valueKey: 'serviceDueCount' },
    { field: 'op.hilti.idleDays', label: 'Hilti Idle Days', source: 'operational', format: 'number', recordSet: 'idleAssets', valueKey: 'idleDays' },
    { field: 'op.construction-materials.inventoryValue', label: 'Materials Inventory Value', source: 'operational', format: 'currency', recordSet: 'materialsByCategory', valueKey: 'inventoryValue' },
    { field: 'op.construction-materials.qtyOnHand', label: 'Materials Quantity On Hand', source: 'operational', format: 'number', recordSet: 'materialsByCategory', valueKey: 'qtyOnHand' },
    { field: 'op.construction-materials.lowStockCount', label: 'Materials Low Stock Count', source: 'operational', format: 'number', recordSet: 'materialsByCategory', valueKey: 'lowStockCount' },
    { field: 'op.construction-materials.agingCount', label: 'Materials Aging Count', source: 'operational', format: 'number', recordSet: 'materialsByCategory', valueKey: 'agingCount' },
  ],
};

export function getReportDataCatalog(sectorCategory?: string | null): ReportFieldCatalogItem[] {
  const buckets = getTopLineBucketsForSector(sectorCategory);
  const operationalFields = buckets.flatMap((bucket) => {
    const moduleKey = resolveModuleKey(bucket.key);
    const dataType = mapModuleToDataType(moduleKey);
    if (!dataType) return [];
    const templates = operationalTemplates[dataType] || [];
    return templates.map((template) => ({
      ...template,
      moduleKey,
      dataType,
    }));
  });

  const byField = new Map<string, ReportFieldCatalogItem>();
  [...financialReportFields, ...operationalFields].forEach((field) => {
    byField.set(field.field, field);
  });
  return Array.from(byField.values());
}

export function getFieldCatalogItem(field: string, sectorCategory?: string | null): ReportFieldCatalogItem | undefined {
  return getReportDataCatalog(sectorCategory).find((item) => item.field === field);
}
