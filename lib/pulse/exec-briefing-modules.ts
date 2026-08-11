import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { mapModuleToDataType, resolveModuleKey, type OpsDataType } from '@/lib/operations/module-registry';
import {
  buildBillingCashMock,
  buildCommitmentsForecastMock,
  buildConstructionApMock,
  buildConstructionArMock,
  buildJobCostControlMock,
  buildProjectPortfolioMock,
} from '@/lib/operations/construction-mock-data';
import { normalizeIndustrySectorCategory } from '@/lib/performance-analytics/industry-sector-category';

type BriefingModuleProfile = {
  sectorCategory: string;
  sectorKey: string;
  moduleKeys: string[];
  moduleLabels: string[];
  dataTypes: OpsDataType[];
  genericSnapshots: {
    customers: boolean;
    products: boolean;
    inventory: boolean;
  };
  hasConstructionNativeModules: boolean;
  promptRules: {
    allowedOperationalTopics: string[];
    blockedOperationalTopics: string[];
    sectorGuidance: string;
  };
};

function normalizeSectorCategory(sectorCategory?: string | null): string {
  const raw = String(sectorCategory || '').trim();
  if (/^\d+$/.test(raw)) return raw.padStart(2, '0');

  const sectorKey = normalizeIndustrySectorCategory(raw);
  const bySectorKey: Record<string, string> = {
    DEFAULT: '01',
    AGRICULTURE: '11',
    MINING: '21',
    UTILITIES: '22',
    CONSTRUCTION: '23',
    MANUFACTURING: '32',
    WHOLESALE_TRADE: '42',
    RETAIL_TRADE: '45',
    TRANSPORTATION: '48',
    INFORMATION: '51',
    FINANCE_INSURANCE: '52',
    REAL_ESTATE: '53',
    PROFESSIONAL_SERVICES: '54',
    ADMIN_SUPPORT_WASTE: '56',
    EDUCATIONAL_SERVICES: '61',
    HEALTH_CARE_SOCIAL_ASSISTANCE: '62',
    ARTS_ENTERTAINMENT_RECREATION: '71',
    ACCOMMODATION_FOOD_SERVICES: '72',
    OTHER_SERVICES: '81',
  };
  return bySectorKey[sectorKey] || '01';
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function blockedTopicsFor(dataTypes: Set<OpsDataType>, moduleKeys: Set<string>): string[] {
  const blocked: string[] = [];
  if (!dataTypes.has('products')) blocked.push('generic product/service sales', 'product margin watchlists');
  if (!dataTypes.has('inventory')) blocked.push('inventory operations');
  if (!dataTypes.has('customers')) blocked.push('generic customer sales and customer concentration');
  if (!moduleKeys.has('job_cost_control')) blocked.push('job cost control');
  if (!moduleKeys.has('project_portfolio')) blocked.push('project portfolio');
  if (!moduleKeys.has('commitments_forecast')) blocked.push('commitments and forecast');
  if (!moduleKeys.has('billing_cash')) blocked.push('billing and cash by job');
  return blocked;
}

export function getExecBriefingModuleProfile(sectorCategory?: string | null): BriefingModuleProfile {
  const normalizedSectorCategory = normalizeSectorCategory(sectorCategory);
  const buckets = getTopLineBucketsForSector(normalizedSectorCategory);
  const moduleKeys = unique(buckets.map((bucket) => resolveModuleKey(bucket.key)).filter(Boolean));
  const moduleKeySet = new Set(moduleKeys);
  const dataTypes = unique(moduleKeys.map((moduleKey) => mapModuleToDataType(moduleKey)).filter(Boolean) as OpsDataType[]);
  const dataTypeSet = new Set(dataTypes);
  const moduleLabels = buckets.map((bucket) => bucket.label).filter(Boolean);
  const hasConstructionNativeModules = ['job_cost_control', 'project_portfolio', 'commitments_forecast', 'billing_cash', 'construction_ar', 'construction_ap'].some(
    (moduleKey) => moduleKeySet.has(moduleKey)
  );

  return {
    sectorCategory: normalizedSectorCategory,
    sectorKey: normalizeIndustrySectorCategory(normalizedSectorCategory),
    moduleKeys,
    moduleLabels,
    dataTypes,
    genericSnapshots: {
      customers: dataTypeSet.has('customers'),
      products: dataTypeSet.has('products'),
      inventory: dataTypeSet.has('inventory'),
    },
    hasConstructionNativeModules,
    promptRules: {
      allowedOperationalTopics: moduleLabels,
      blockedOperationalTopics: blockedTopicsFor(dataTypeSet, moduleKeySet),
      sectorGuidance:
        normalizedSectorCategory === '23'
          ? 'For Construction companies, prioritize project margin, job cost variance, EAC/forecast risk, commitments, change orders, billing/cash by job, retainage, and project-aware AR/AP. Do not analyze wholesale-style product sales, inventory, or generic customer sales unless those modules are explicitly enabled.'
          : `Use the operating modules configured for sector ${normalizedSectorCategory}: ${moduleLabels.join(', ')}.`,
    },
  };
}

function takeWorst<T>(rows: T[], score: (row: T) => number, limit: number): T[] {
  return [...rows].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function buildConstructionBriefingFacts(companyId: string) {
  const jobCost = buildJobCostControlMock(companyId);
  const portfolio = buildProjectPortfolioMock(companyId);
  const commitments = buildCommitmentsForecastMock(companyId);
  const billingCash = buildBillingCashMock(companyId);
  const constructionAr = buildConstructionArMock(companyId);
  const constructionAp = buildConstructionApMock(companyId);

  return {
    jobCostControl: {
      summary: jobCost.summary,
      marginWatch: takeWorst(jobCost.jobs, (job: any) => Math.max(0, 0.08 - Number(job.marginPct || 0)) * Math.max(1, Number(job.revisedContractValue || 0)), 6).map((job: any) => ({
        jobId: job.jobId,
        jobName: job.jobName,
        pmName: job.pmName,
        revisedContractValue: job.revisedContractValue,
        costToDate: job.costToDate,
        remainingCommitted: job.remainingCommitted,
        eac: job.eac,
        projectedProfit: job.projectedProfit,
        marginPct: job.marginPct,
        pctComplete: job.pctComplete,
      })),
      costTypeVariance: takeWorst(jobCost.costByType, (row: any) => Math.max(0, Number(row.variance || 0)), 8),
    },
    projectPortfolio: {
      summary: portfolio.summary,
      riskFlags: (portfolio as any).riskFlags?.slice?.(0, 10) || [],
      topJobs: (portfolio as any).topJobs?.slice?.(0, 5) || [],
      bottomJobs: (portfolio as any).bottomJobs?.slice?.(0, 5) || [],
      scheduleSlippageImpact: (portfolio as any).scheduleSlippageImpact?.slice?.(0, 8) || [],
    },
    commitmentsForecast: {
      summary: commitments.summary,
      eacForecast: takeWorst(commitments.eacForecast, (row: any) => Math.abs(Number(row.forecastVariance || row.variance || 0)), 8),
      commitmentExposure: takeWorst(commitments.commitmentExposure, (row: any) => Number(row.exposure || row.openAmount || row.remainingCommitted || 0), 8),
      changeOrders: takeWorst(commitments.changeOrders, (row: any) => Number(row.pendingCOs || row.approvedCOs || 0), 8),
    },
    billingCash: {
      summary: billingCash.summary,
      priority: billingCash.priority?.slice?.(0, 8) || [],
      billingCash: takeWorst(billingCash.billingCash, (row: any) => {
        const underBilled = Math.max(0, Number(row.costToDate || 0) - Number(row.billedToDate || 0));
        return Math.max(Math.abs(Number(row.netCashPosition || 0)), underBilled);
      }, 8),
      arByJob: takeWorst(billingCash.arByJob, (row: any) => Number(row.bucket90Plus || 0) + Number(row.totalAR || 0), 8),
    },
    constructionAr: {
      summary: constructionAr.summary,
      collectionsPriority: constructionAr.collectionsPriority?.slice?.(0, 8) || [],
      byProject: constructionAr.byProject?.slice?.(0, 8) || [],
    },
    constructionAp: {
      summary: constructionAp.summary,
      paymentPriority: constructionAp.paymentPriority?.slice?.(0, 8) || [],
      byProject: constructionAp.byProject?.slice?.(0, 8) || [],
    },
  };
}

const DAILY_OPS_MATERIAL_AMOUNT = 1000;
const DAILY_OPS_SHARE_THRESHOLD = 0.1;
const DAILY_OPS_DELTA_PCT = 0.03;

function asOpsNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateKeyOps(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function rowsOnDate(rows: any[], targetDate: string): any[] {
  if (!targetDate) return [];
  const onDate = (rows || []).filter((row) => dateKeyOps(row?.snapshotDate) === targetDate);
  const dailyOnly = onDate.filter((row) => String(row?.frequency || '').toLowerCase() === 'daily');
  return dailyOnly.length ? dailyOnly : onDate;
}

function volumeLabelsForSector(sectorKey: string): {
  salesClosedLabel: string;
  unitsSoldLabel: string;
  topCustomerLabel: string;
  topProductLabel: string;
} {
  switch (String(sectorKey || '').toUpperCase()) {
    case 'REAL_ESTATE':
      return {
        salesClosedLabel: 'contracts / closings',
        unitsSoldLabel: 'units / properties',
        topCustomerLabel: 'largest customer / tenant',
        topProductLabel: 'top property / offering',
      };
    case 'FINANCE_INSURANCE':
      return {
        salesClosedLabel: 'transactions closed',
        unitsSoldLabel: 'policies / loans funded',
        topCustomerLabel: 'largest account',
        topProductLabel: 'top product / offering',
      };
    case 'CONSTRUCTION':
      return {
        salesClosedLabel: 'billings / invoices',
        unitsSoldLabel: 'job billings',
        topCustomerLabel: 'largest customer / job owner',
        topProductLabel: 'top billed work type',
      };
    case 'ACCOMMODATION_FOOD_SERVICES':
      return {
        salesClosedLabel: 'checks / tickets closed',
        unitsSoldLabel: 'items sold',
        topCustomerLabel: 'largest guest / account',
        topProductLabel: 'top-selling item',
      };
    default:
      return {
        salesClosedLabel: 'sales closed',
        unitsSoldLabel: 'units sold',
        topCustomerLabel: 'largest customer / order',
        topProductLabel: 'top revenue product',
      };
  }
}

type DayNameTotal = {
  name: string;
  revenue: number;
  cogs: number;
  quantity: number;
  invoiceCount: number;
};

function aggregateDayByName(rows: any[], nameKey: 'itemName' | 'customerName'): DayNameTotal[] {
  const byName = new Map<string, DayNameTotal>();
  for (const row of rows || []) {
    const name = String(row?.[nameKey] || '').trim();
    if (!name) continue;
    const current = byName.get(name) || { name, revenue: 0, cogs: 0, quantity: 0, invoiceCount: 0 };
    current.revenue += asOpsNumber(row?.revenue);
    current.cogs += asOpsNumber(row?.cogs);
    current.quantity += asOpsNumber(row?.quantitySold);
    current.invoiceCount += asOpsNumber(row?.invoiceCount);
    byName.set(name, current);
  }
  return Array.from(byName.values()).sort((a, b) => b.revenue - a.revenue);
}

function summarizeDayOps(productRows: any[], customerRows: any[]) {
  const products = aggregateDayByName(productRows, 'itemName');
  const customers = aggregateDayByName(customerRows, 'customerName');
  const productRevenue = products.reduce((sum, row) => sum + row.revenue, 0);
  const customerRevenue = customers.reduce((sum, row) => sum + row.revenue, 0);
  return {
    products,
    customers,
    volume: {
      productCount: products.filter((row) => Math.abs(row.revenue) > 0.005 || Math.abs(row.quantity) > 0.005).length,
      customerCount: customers.filter((row) => Math.abs(row.revenue) > 0.005 || row.invoiceCount > 0).length,
      unitsSold: products.reduce((sum, row) => sum + row.quantity, 0),
      salesClosedCount: customers.reduce((sum, row) => sum + row.invoiceCount, 0),
      productRevenue,
      customerRevenue,
    },
  };
}

function isMaterialDailyOpsAmount(value: number, baseline = 0): boolean {
  if (!Number.isFinite(value)) return false;
  if (Math.abs(value) >= DAILY_OPS_MATERIAL_AMOUNT * 10) return true;
  if (Math.abs(baseline) > 0 && Math.abs(value / baseline) >= DAILY_OPS_DELTA_PCT) return true;
  return Math.abs(value) >= DAILY_OPS_MATERIAL_AMOUNT;
}

function isMaterialDailyOpsShare(revenue: number, dayRevenue: number): boolean {
  if (!(dayRevenue > 0) || !(revenue > 0)) return false;
  return revenue / dayRevenue >= DAILY_OPS_SHARE_THRESHOLD || revenue >= DAILY_OPS_MATERIAL_AMOUNT * 5;
}

function withDelta<T extends { name: string; revenue: number; quantity?: number; invoiceCount?: number }>(
  current: T | null,
  priorByName: Map<string, DayNameTotal>,
) {
  if (!current) return null;
  const prior = priorByName.get(current.name);
  const priorRevenue = prior?.revenue || 0;
  const revenueDelta = current.revenue - priorRevenue;
  return {
    ...current,
    priorRevenue,
    revenueDelta,
    revenueDeltaPct: priorRevenue ? revenueDelta / priorRevenue : null,
  };
}

export type DailyOperationsFacts = {
  asOfDate: string;
  priorDate: string | null;
  labels: ReturnType<typeof volumeLabelsForSector>;
  volume: {
    salesClosedCount: number | null;
    unitsSold: number | null;
    productCount: number | null;
    customerCount: number | null;
    priorSalesClosedCount: number | null;
    priorUnitsSold: number | null;
    salesClosedDelta: number | null;
    unitsSoldDelta: number | null;
  };
  topProducts: Array<{
    name: string;
    revenue: number;
    quantity: number;
    shareOfDayRevenue: number | null;
    priorRevenue: number;
    revenueDelta: number;
    revenueDeltaPct: number | null;
  }>;
  topCustomers: Array<{
    name: string;
    revenue: number;
    invoiceCount: number;
    shareOfDayRevenue: number | null;
    priorRevenue: number;
    revenueDelta: number;
    revenueDeltaPct: number | null;
  }>;
  notableExceptions: Array<{
    type: 'top_product' | 'top_customer' | 'volume';
    title: string;
    detail: string;
    amount: number;
  }>;
};

export function buildDailyOperationsFacts(params: {
  sectorKey: string;
  currentDate: string;
  priorDate?: string | null;
  dayRevenue: number;
  productRows: any[];
  customerRows: any[];
  includeProducts: boolean;
  includeCustomers: boolean;
}): DailyOperationsFacts | null {
  const currentDate = String(params.currentDate || '').trim();
  if (!currentDate) return null;
  if (!params.includeProducts && !params.includeCustomers) return null;

  const currentProducts = params.includeProducts ? rowsOnDate(params.productRows, currentDate) : [];
  const currentCustomers = params.includeCustomers ? rowsOnDate(params.customerRows, currentDate) : [];
  if (!currentProducts.length && !currentCustomers.length) return null;

  const priorDate = String(params.priorDate || '').trim() || null;
  const priorProducts = priorDate && params.includeProducts ? rowsOnDate(params.productRows, priorDate) : [];
  const priorCustomers = priorDate && params.includeCustomers ? rowsOnDate(params.customerRows, priorDate) : [];

  const current = summarizeDayOps(currentProducts, currentCustomers);
  const prior = summarizeDayOps(priorProducts, priorCustomers);
  const labels = volumeLabelsForSector(params.sectorKey);
  const dayRevenue = Math.max(0, asOpsNumber(params.dayRevenue) || current.volume.productRevenue || current.volume.customerRevenue);

  const priorProductByName = new Map(prior.products.map((row) => [row.name, row]));
  const priorCustomerByName = new Map(prior.customers.map((row) => [row.name, row]));

  const topProducts = current.products
    .slice(0, 5)
    .map((row) => {
      const withPrior = withDelta(row, priorProductByName);
      if (!withPrior) return null;
      const share = dayRevenue > 0 ? withPrior.revenue / dayRevenue : null;
      const material =
        isMaterialDailyOpsShare(withPrior.revenue, dayRevenue) ||
        isMaterialDailyOpsAmount(withPrior.revenueDelta, withPrior.priorRevenue) ||
        (withPrior.revenue >= DAILY_OPS_MATERIAL_AMOUNT && current.products[0]?.name === withPrior.name);
      if (!material) return null;
      return {
        name: withPrior.name,
        revenue: withPrior.revenue,
        quantity: withPrior.quantity,
        shareOfDayRevenue: share,
        priorRevenue: withPrior.priorRevenue,
        revenueDelta: withPrior.revenueDelta,
        revenueDeltaPct: withPrior.revenueDeltaPct,
      };
    })
    .filter(Boolean)
    .slice(0, 3) as DailyOperationsFacts['topProducts'];

  const topCustomers = current.customers
    .slice(0, 5)
    .map((row) => {
      const withPrior = withDelta(row, priorCustomerByName);
      if (!withPrior) return null;
      const share = dayRevenue > 0 ? withPrior.revenue / dayRevenue : null;
      const material =
        isMaterialDailyOpsShare(withPrior.revenue, dayRevenue) ||
        isMaterialDailyOpsAmount(withPrior.revenueDelta, withPrior.priorRevenue) ||
        (withPrior.revenue >= DAILY_OPS_MATERIAL_AMOUNT && current.customers[0]?.name === withPrior.name);
      if (!material) return null;
      return {
        name: withPrior.name,
        revenue: withPrior.revenue,
        invoiceCount: withPrior.invoiceCount,
        shareOfDayRevenue: share,
        priorRevenue: withPrior.priorRevenue,
        revenueDelta: withPrior.revenueDelta,
        revenueDeltaPct: withPrior.revenueDeltaPct,
      };
    })
    .filter(Boolean)
    .slice(0, 3) as DailyOperationsFacts['topCustomers'];

  const salesClosedDelta =
    params.includeCustomers && current.volume.salesClosedCount != null
      ? current.volume.salesClosedCount - (prior.volume.salesClosedCount || 0)
      : null;
  const unitsSoldDelta =
    params.includeProducts && current.volume.unitsSold != null
      ? current.volume.unitsSold - (prior.volume.unitsSold || 0)
      : null;

  const notableExceptions: DailyOperationsFacts['notableExceptions'] = [];
  for (const product of topProducts) {
    notableExceptions.push({
      type: 'top_product',
      title: labels.topProductLabel,
      detail: `${product.name}: $${Math.round(product.revenue).toLocaleString('en-US')}${
        product.quantity ? ` (${Math.round(product.quantity).toLocaleString('en-US')} units)` : ''
      }${product.shareOfDayRevenue != null ? ` / ${Math.round(product.shareOfDayRevenue * 100)}% of day revenue` : ''}`,
      amount: product.revenue,
    });
  }
  for (const customer of topCustomers) {
    notableExceptions.push({
      type: 'top_customer',
      title: labels.topCustomerLabel,
      detail: `${customer.name}: $${Math.round(customer.revenue).toLocaleString('en-US')}${
        customer.invoiceCount ? ` / ${customer.invoiceCount} ${labels.salesClosedLabel}` : ''
      }${customer.shareOfDayRevenue != null ? ` / ${Math.round(customer.shareOfDayRevenue * 100)}% of day revenue` : ''}`,
      amount: customer.revenue,
    });
  }

  const volumeMaterial =
    (salesClosedDelta != null && isMaterialDailyOpsAmount(salesClosedDelta, prior.volume.salesClosedCount || 0)) ||
    (unitsSoldDelta != null && isMaterialDailyOpsAmount(unitsSoldDelta, prior.volume.unitsSold || 0)) ||
    current.volume.salesClosedCount >= 5 ||
    current.volume.unitsSold >= 10;
  if (volumeMaterial && (params.includeCustomers || params.includeProducts)) {
    const parts: string[] = [];
    if (params.includeCustomers) {
      parts.push(`${current.volume.salesClosedCount.toLocaleString('en-US')} ${labels.salesClosedLabel}`);
      if (salesClosedDelta != null && priorDate) {
        parts.push(`${salesClosedDelta >= 0 ? '+' : ''}${salesClosedDelta.toLocaleString('en-US')} vs ${priorDate}`);
      }
    }
    if (params.includeProducts) {
      parts.push(`${Math.round(current.volume.unitsSold).toLocaleString('en-US')} ${labels.unitsSoldLabel}`);
      if (unitsSoldDelta != null && priorDate) {
        parts.push(`${unitsSoldDelta >= 0 ? '+' : ''}${Math.round(unitsSoldDelta).toLocaleString('en-US')} units vs ${priorDate}`);
      }
    }
    notableExceptions.push({
      type: 'volume',
      title: 'Daily volume',
      detail: parts.join('; '),
      amount: current.volume.customerRevenue || current.volume.productRevenue || 0,
    });
  }

  return {
    asOfDate: currentDate,
    priorDate,
    labels,
    volume: {
      salesClosedCount: params.includeCustomers ? current.volume.salesClosedCount : null,
      unitsSold: params.includeProducts ? current.volume.unitsSold : null,
      productCount: params.includeProducts ? current.volume.productCount : null,
      customerCount: params.includeCustomers ? current.volume.customerCount : null,
      priorSalesClosedCount: params.includeCustomers ? prior.volume.salesClosedCount : null,
      priorUnitsSold: params.includeProducts ? prior.volume.unitsSold : null,
      salesClosedDelta: params.includeCustomers ? salesClosedDelta : null,
      unitsSoldDelta: params.includeProducts ? unitsSoldDelta : null,
    },
    topProducts,
    topCustomers,
    notableExceptions: notableExceptions.slice(0, 6),
  };
}
