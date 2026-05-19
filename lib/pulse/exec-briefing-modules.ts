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
