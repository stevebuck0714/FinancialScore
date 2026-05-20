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
