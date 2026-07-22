import { normalizeIndustrySectorCategory } from '@/lib/performance-analytics/industry-sector-category';
import type { DailyIndustryBrief } from '@/lib/industry-brief/types';

type CompanyInput = {
  id: string;
  name: string;
  industrySector?: number | null;
  industryGroupName?: string | null;
  industryGroupDescription?: string | null;
  profileText?: string | null;
  accountingSystem?: string | null;
  industrySectorCategory?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  subscriptionMonthlyPrice?: number | null;
};

type FinancialFactInput = {
  revenueLastTwelveMonths: number;
  grossMarginPct: number | null;
  cogsPct: number | null;
  payrollPct: number | null;
  latestRevenueTrendPct: number | null;
};

type BriefContext = {
  company: CompanyInput;
  financialFacts: FinancialFactInput;
  today?: Date;
};

function currencyCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Not yet available';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function locationLabel(company: CompanyInput): string {
  const parts = [company.addressCity, company.addressState]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Primary operating region';
}

function resolveIndustry(company: CompanyInput): { industry: string; segment: string; sectorKey: string } {
  const sectorKey = normalizeIndustrySectorCategory(company.industrySectorCategory || company.accountingSystem || '');
  const name = company.name.toLowerCase();
  const industryGroupName = String(company.industryGroupName || '').trim();
  const profileText = `${industryGroupName} ${company.industryGroupDescription || ''} ${company.profileText || ''}`.toLowerCase();
  const segment = industryGroupName || 'Core operating segment';

  if (sectorKey === 'MANUFACTURING' || /baker|bread|bakery/.test(name)) {
    return {
      industry: 'Manufacturing',
      segment: /baker|bread|bakery/.test(name) ? 'Commercial bread production' : 'Specialty manufacturing',
      sectorKey: 'MANUFACTURING',
    };
  }
  if (sectorKey === 'CONSTRUCTION') {
    return { industry: 'Construction', segment: 'Project-based construction services', sectorKey };
  }
  if (sectorKey === 'RETAIL_TRADE') {
    return { industry: 'Retail Trade', segment: 'Regional retail operations', sectorKey };
  }
  if (sectorKey === 'ADMIN_SUPPORT_WASTE') {
    return {
      industry: 'Administration, Business Support and Waste Management Services',
      segment: /professional employer|peo|staff|recruit|employment/.test(profileText) ? segment : 'Business support services',
      sectorKey,
    };
  }
  if (sectorKey === 'PROFESSIONAL_SERVICES') {
    return { industry: 'Professional Services', segment, sectorKey };
  }
  if (sectorKey === 'HEALTH_CARE_SOCIAL_ASSISTANCE') {
    return { industry: 'Health Care and Social Assistance', segment, sectorKey };
  }
  if (sectorKey === 'REAL_ESTATE') {
    return { industry: 'Real Estate', segment, sectorKey };
  }
  if (sectorKey === 'ACCOMMODATION_FOOD_SERVICES') {
    return { industry: 'Accommodation and Food Services', segment, sectorKey };
  }
  return { industry: 'Business Services', segment: 'Core operating segment', sectorKey };
}

export function buildDailyIndustryBriefShell(context: BriefContext): DailyIndustryBrief {
  const now = context.today || new Date();
  const briefDate = now.toISOString().slice(0, 10);
  const profile = resolveIndustry(context.company);
  const location = locationLabel(context.company);

  return {
    generatedAt: now.toISOString(),
    briefDate,
    company: {
      id: context.company.id,
      name: context.company.name,
      revenueLabel: currencyCompact(context.financialFacts.revenueLastTwelveMonths),
      industry: profile.industry,
      segment: profile.segment,
      location,
    },
    executiveSummary: {
      status: 'watch',
      headline: '',
      bullets: [],
      expectedImpact60Days: [],
    },
    overallScore: 0,
    healthIndicators: [],
    marketSignals: [],
    growthOpportunities: [],
    recommendedActions: {
      today: [],
      next30Days: [],
      next90Days: [],
    },
    riskMonitor: [],
    aiInsight: '',
    industryOutlook: [],
    sourceNotes: [],
  };
}
