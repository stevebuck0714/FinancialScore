import type { IndustryBriefSourceRecord } from '@/lib/industry-brief/types';
import { normalizeIndustrySectorCategory } from '@/lib/performance-analytics/industry-sector-category';

type CompanySourceContext = {
  name: string;
  industry: string;
  segment: string;
  location: string;
  sectorKey?: string | null;
  industryGroupName?: string | null;
  industryGroupDescription?: string | null;
  profileText?: string | null;
  productContext?: string | null;
  customerContext?: string | null;
};

type FredSeriesDefinition = {
  id: string;
  title: string;
  category: string;
  seriesId: string;
  url: string;
};

type BlsSeriesDefinition = {
  id: string;
  title: string;
  category: string;
  seriesId: string;
  unit: string;
  url: string;
};

type MetricCandidate<T> = T & {
  sectors?: Array<ReturnType<typeof normalizeIndustrySectorCategory>>;
  industryKeywords?: string[];
  productKeywords?: string[];
  customerKeywords?: string[];
  priority?: number;
};

class IndustryBriefSourceCollectionError extends Error {
  constructor(public readonly failures: string[]) {
    super(`Daily Industry Brief live source collection failed: ${failures.join(' | ')}`);
    this.name = 'IndustryBriefSourceCollectionError';
  }
}

const DEFAULT_FRED_SERIES: FredSeriesDefinition[] = [
  { id: 'fred-real-gdp', title: 'Real gross domestic product', category: 'Macro Demand', seriesId: 'GDPC1', url: 'https://fred.stlouisfed.org/series/GDPC1' },
  { id: 'fred-prime-rate', title: 'Bank prime loan rate', category: 'Interest Rates', seriesId: 'DPRIME', url: 'https://fred.stlouisfed.org/series/DPRIME' },
  { id: 'fred-small-business-optimism', title: 'Small business optimism index', category: 'Business Conditions', seriesId: 'NFCI', url: 'https://fred.stlouisfed.org/series/NFCI' },
];

const BAKERY_FRED_SERIES: FredSeriesDefinition[] = [
  { id: 'fred-industrial-production', title: 'Industrial production index', category: 'Manufacturing', seriesId: 'INDPRO', url: 'https://fred.stlouisfed.org/series/INDPRO' },
  { id: 'fred-grocery-spending', title: 'Food and beverage store sales', category: 'Demand', seriesId: 'MRTSSM445USN', url: 'https://fred.stlouisfed.org/series/MRTSSM445USN' },
  { id: 'fred-commercial-bakery-ppi', title: 'Commercial bakery producer price index', category: 'Input Costs', seriesId: 'PCU311812311812', url: 'https://fred.stlouisfed.org/series/PCU311812311812' },
];

const FRED_CANDIDATES: Array<MetricCandidate<FredSeriesDefinition>> = [
  { id: 'fred-real-gdp', title: 'Real gross domestic product', category: 'Macro Demand', seriesId: 'GDPC1', url: 'https://fred.stlouisfed.org/series/GDPC1', priority: 5 },
  { id: 'fred-prime-rate', title: 'Bank prime loan rate', category: 'Interest Rates', seriesId: 'DPRIME', url: 'https://fred.stlouisfed.org/series/DPRIME', sectors: ['FINANCE_INSURANCE', 'REAL_ESTATE'], industryKeywords: ['bank', 'lending', 'finance', 'insurance', 'real estate'], priority: 4 },
  { id: 'fred-financial-conditions', title: 'National financial conditions index', category: 'Credit Conditions', seriesId: 'NFCI', url: 'https://fred.stlouisfed.org/series/NFCI', sectors: ['FINANCE_INSURANCE'], industryKeywords: ['bank', 'lending', 'finance', 'insurance', 'credit'], priority: 7 },
  { id: 'fred-diesel-price', title: 'U.S. diesel price', category: 'Transportation Costs', seriesId: 'GASDESW', url: 'https://fred.stlouisfed.org/series/GASDESW', sectors: ['TRANSPORTATION', 'WHOLESALE_TRADE', 'MANUFACTURING'], industryKeywords: ['transport', 'freight', 'logistics', 'wholesale', 'distribution'], productKeywords: ['freight', 'shipping', 'delivery'], priority: 7 },
  { id: 'fred-industrial-production', title: 'Industrial production index', category: 'Industrial Demand', seriesId: 'INDPRO', url: 'https://fred.stlouisfed.org/series/INDPRO', sectors: ['MANUFACTURING', 'WHOLESALE_TRADE'], industryKeywords: ['industrial', 'manufacturing', 'machinery', 'equipment', 'supplies'], productKeywords: ['industrial', 'tool', 'bearing', 'fastener', 'hose', 'safety', 'mro', 'maintenance', 'machinery'], priority: 9 },
  { id: 'fred-manufacturing-pmi', title: 'ISM manufacturing PMI', category: 'Manufacturing Demand', seriesId: 'NAPM', url: 'https://fred.stlouisfed.org/series/NAPM', sectors: ['MANUFACTURING', 'WHOLESALE_TRADE'], industryKeywords: ['industrial', 'manufacturing', 'machinery', 'supplies'], productKeywords: ['industrial', 'tool', 'bearing', 'fastener', 'machinery', 'mro'], priority: 9 },
  { id: 'fred-capacity-utilization', title: 'Capacity utilization: total industry', category: 'Industrial Activity', seriesId: 'TCU', url: 'https://fred.stlouisfed.org/series/TCU', sectors: ['MANUFACTURING', 'WHOLESALE_TRADE'], industryKeywords: ['industrial', 'manufacturing', 'machinery', 'supplies'], productKeywords: ['industrial', 'tool', 'bearing', 'fastener', 'machinery', 'mro'], priority: 8 },
  { id: 'fred-durable-goods-orders', title: 'Manufacturers new orders: durable goods', category: 'Customer Demand', seriesId: 'DGORDER', url: 'https://fred.stlouisfed.org/series/DGORDER', sectors: ['MANUFACTURING', 'WHOLESALE_TRADE'], industryKeywords: ['industrial', 'machinery', 'equipment', 'durable'], productKeywords: ['industrial', 'tool', 'bearing', 'fastener', 'machinery', 'equipment'], customerKeywords: ['manufacturer', 'industrial', 'machine'], priority: 8 },
  { id: 'fred-construction-spending', title: 'Total construction spending', category: 'Construction Demand', seriesId: 'TTLCONS', url: 'https://fred.stlouisfed.org/series/TTLCONS', sectors: ['CONSTRUCTION', 'WHOLESALE_TRADE'], industryKeywords: ['construction', 'building', 'contractor'], productKeywords: ['construction', 'building', 'hardware', 'lumber', 'pipe', 'electrical', 'plumbing'], priority: 7 },
  { id: 'fred-housing-starts', title: 'Housing starts', category: 'Construction Demand', seriesId: 'HOUST', url: 'https://fred.stlouisfed.org/series/HOUST', sectors: ['CONSTRUCTION', 'REAL_ESTATE', 'WHOLESALE_TRADE'], industryKeywords: ['construction', 'building'], productKeywords: ['construction', 'building', 'hardware', 'lumber'], priority: 6 },
  { id: 'fred-construction-materials-ppi', title: 'Construction materials producer price index', category: 'Input Costs', seriesId: 'WPUSI012011', url: 'https://fred.stlouisfed.org/series/WPUSI012011', sectors: ['CONSTRUCTION', 'WHOLESALE_TRADE'], industryKeywords: ['construction', 'building', 'materials'], productKeywords: ['construction', 'building', 'lumber', 'pipe', 'hardware'], priority: 6 },
  { id: 'fred-retail-sales', title: 'Retail and food services sales', category: 'Retail Demand', seriesId: 'RSAFS', url: 'https://fred.stlouisfed.org/series/RSAFS', sectors: ['RETAIL_TRADE', 'WHOLESALE_TRADE'], industryKeywords: ['retail', 'consumer'], productKeywords: ['apparel', 'clothing', 'consumer', 'retail'], priority: 7 },
  { id: 'fred-clothing-store-sales', title: 'Clothing and clothing accessories store sales', category: 'Apparel Demand', seriesId: 'MRTSSM448USN', url: 'https://fred.stlouisfed.org/series/MRTSSM448USN', sectors: ['RETAIL_TRADE'], industryKeywords: ['clothing', 'apparel', 'resale', 'consignment', 'used merchandise', 'thrift'], productKeywords: ['clothing', 'apparel', 'shoes', 'fashion', 'resale', 'used'], priority: 9 },
  { id: 'fred-consumer-sentiment', title: 'Consumer sentiment', category: 'Consumer Demand', seriesId: 'UMCSENT', url: 'https://fred.stlouisfed.org/series/UMCSENT', sectors: ['RETAIL_TRADE'], industryKeywords: ['retail', 'consumer'], productKeywords: ['apparel', 'clothing', 'consumer'], priority: 6 },
  { id: 'fred-food-services-sales', title: 'Food services and drinking places sales', category: 'Restaurant Demand', seriesId: 'MRTSSM722USN', url: 'https://fred.stlouisfed.org/series/MRTSSM722USN', sectors: ['ACCOMMODATION_FOOD_SERVICES'], industryKeywords: ['restaurant', 'food service', 'hospitality'], productKeywords: ['restaurant', 'food', 'beverage'], priority: 8 },
  { id: 'fred-food-away-from-home-cpi', title: 'Food away from home CPI', category: 'Pricing', seriesId: 'CUSR0000SEFV', url: 'https://fred.stlouisfed.org/series/CUSR0000SEFV', sectors: ['ACCOMMODATION_FOOD_SERVICES'], industryKeywords: ['restaurant', 'food service', 'hospitality'], productKeywords: ['restaurant', 'food', 'beverage'], priority: 7 },
  { id: 'fred-leisure-hospitality-employment', title: 'Leisure and hospitality employment', category: 'Labor', seriesId: 'USLAH', url: 'https://fred.stlouisfed.org/series/USLAH', sectors: ['ACCOMMODATION_FOOD_SERVICES'], industryKeywords: ['restaurant', 'food service', 'hospitality'], priority: 6 },
  { id: 'fred-existing-home-sales', title: 'Existing home sales', category: 'Real Estate Demand', seriesId: 'EXHOSLUSM495S', url: 'https://fred.stlouisfed.org/series/EXHOSLUSM495S', sectors: ['REAL_ESTATE'], industryKeywords: ['real estate', 'broker', 'property', 'housing'], productKeywords: ['property', 'housing', 'home'], priority: 8 },
  { id: 'fred-mortgage-rate', title: '30-year fixed mortgage rate', category: 'Interest Rates', seriesId: 'MORTGAGE30US', url: 'https://fred.stlouisfed.org/series/MORTGAGE30US', sectors: ['REAL_ESTATE'], industryKeywords: ['real estate', 'broker', 'property', 'housing'], productKeywords: ['property', 'housing', 'home'], priority: 8 },
  { id: 'fred-information-employment', title: 'Information services employment', category: 'Sector Demand', seriesId: 'USINFO', url: 'https://fred.stlouisfed.org/series/USINFO', sectors: ['INFORMATION'], industryKeywords: ['software', 'information', 'media', 'telecom', 'technology'], productKeywords: ['software', 'data', 'media', 'telecom'], priority: 7 },
  { id: 'fred-education-health-employment', title: 'Education and health services employment', category: 'Sector Demand', seriesId: 'USEHS', url: 'https://fred.stlouisfed.org/series/USEHS', sectors: ['EDUCATIONAL_SERVICES', 'HEALTH_CARE_SOCIAL_ASSISTANCE'], industryKeywords: ['education', 'school', 'training', 'health'], productKeywords: ['education', 'training', 'school'], priority: 6 },
  { id: 'fred-grocery-spending', title: 'Food and beverage store sales', category: 'Demand', seriesId: 'MRTSSM445USN', url: 'https://fred.stlouisfed.org/series/MRTSSM445USN', industryKeywords: ['bakery', 'food', 'grocery'], productKeywords: ['bread', 'bakery', 'food'], priority: 8 },
  { id: 'fred-commercial-bakery-ppi', title: 'Commercial bakery producer price index', category: 'Input Costs', seriesId: 'PCU311812311812', url: 'https://fred.stlouisfed.org/series/PCU311812311812', industryKeywords: ['bakery', 'bread'], productKeywords: ['bread', 'bakery'], priority: 9 },
  { id: 'fred-health-care-spending', title: 'Health care services PCE', category: 'Health Care Demand', seriesId: 'DHLCRG3Q086SBEA', url: 'https://fred.stlouisfed.org/series/DHLCRG3Q086SBEA', sectors: ['HEALTH_CARE_SOCIAL_ASSISTANCE'], industryKeywords: ['health', 'medical', 'clinical'], productKeywords: ['medical', 'clinical', 'health'], priority: 8 },
  { id: 'fred-health-care-employment', title: 'Health care employment', category: 'Medical Labor Demand', seriesId: 'CES6562000001', url: 'https://fred.stlouisfed.org/series/CES6562000001', sectors: ['HEALTH_CARE_SOCIAL_ASSISTANCE', 'ADMIN_SUPPORT_WASTE'], industryKeywords: ['health', 'medical', 'clinical', 'staff', 'scientist'], productKeywords: ['medical', 'clinical', 'scientist', 'lab'], priority: 7 },
  { id: 'fred-professional-scientific-employment', title: 'Professional, scientific, and technical services employment', category: 'Scientific Labor Demand', seriesId: 'CES6054000001', url: 'https://fred.stlouisfed.org/series/CES6054000001', sectors: ['PROFESSIONAL_SERVICES', 'ADMIN_SUPPORT_WASTE'], industryKeywords: ['scientific', 'technical', 'research', 'staff'], productKeywords: ['scientist', 'research', 'lab', 'technical'], priority: 7 },
  { id: 'fred-unemployment-rate', title: 'U.S. unemployment rate', category: 'Labor Availability', seriesId: 'UNRATE', url: 'https://fred.stlouisfed.org/series/UNRATE', sectors: ['ADMIN_SUPPORT_WASTE'], industryKeywords: ['staff', 'employment', 'recruit', 'professional employer', 'peo'], priority: 7 },
  { id: 'fred-professional-business-job-openings', title: 'Professional and business services job openings', category: 'Labor Demand', seriesId: 'JTS540099JOL', url: 'https://fred.stlouisfed.org/series/JTS540099JOL', sectors: ['ADMIN_SUPPORT_WASTE', 'PROFESSIONAL_SERVICES'], industryKeywords: ['staff', 'employment', 'recruit', 'professional employer', 'peo'], priority: 8 },
  { id: 'fred-temp-help-employment', title: 'Temporary help services employment', category: 'Staffing Demand', seriesId: 'TEMPHELPS', url: 'https://fred.stlouisfed.org/series/TEMPHELPS', sectors: ['ADMIN_SUPPORT_WASTE'], industryKeywords: ['staff', 'employment', 'recruit', 'temporary', 'peo'], priority: 9 },
];

const DEFAULT_BLS_SERIES: BlsSeriesDefinition[] = [
  { id: 'bls-private-hourly-earnings', title: 'Private-sector hourly earnings', category: 'Labor', seriesId: 'CES0500000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES0500000003' },
  { id: 'bls-private-employment', title: 'Total private employment', category: 'Labor', seriesId: 'CES0500000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES0500000001' },
];

const BLS_CANDIDATES: Array<MetricCandidate<BlsSeriesDefinition>> = [
  { id: 'bls-private-hourly-earnings', title: 'Private-sector hourly earnings', category: 'Labor', seriesId: 'CES0500000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES0500000003', priority: 1 },
  { id: 'bls-wholesale-employment', title: 'Wholesale trade employment', category: 'Labor', seriesId: 'CES4142000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES4142000001', sectors: ['WHOLESALE_TRADE'], industryKeywords: ['wholesale', 'distribution', 'industrial supplies'], productKeywords: ['industrial', 'supplies', 'mro'], priority: 7 },
  { id: 'bls-transportation-warehousing-employment', title: 'Transportation and warehousing employment', category: 'Labor', seriesId: 'CES4300000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES4300000001', sectors: ['TRANSPORTATION'], industryKeywords: ['transport', 'freight', 'logistics', 'warehouse'], productKeywords: ['freight', 'shipping', 'delivery'], priority: 7 },
  { id: 'bls-manufacturing-hourly-earnings', title: 'Manufacturing production worker hourly earnings', category: 'Labor', seriesId: 'CEU3000000008', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CEU3000000008', sectors: ['MANUFACTURING', 'WHOLESALE_TRADE'], industryKeywords: ['industrial', 'manufacturing'], productKeywords: ['industrial', 'tool', 'machinery', 'mro'], priority: 5 },
  { id: 'bls-manufacturing-employment', title: 'Manufacturing employment', category: 'Labor', seriesId: 'CEU3000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CEU3000000001', sectors: ['MANUFACTURING', 'WHOLESALE_TRADE'], industryKeywords: ['industrial', 'manufacturing'], productKeywords: ['industrial', 'tool', 'machinery', 'mro'], priority: 6 },
  { id: 'bls-construction-employment', title: 'Construction employment', category: 'Labor', seriesId: 'CES2000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES2000000001', sectors: ['CONSTRUCTION', 'WHOLESALE_TRADE'], industryKeywords: ['construction', 'building'], productKeywords: ['construction', 'building', 'hardware', 'lumber'], priority: 6 },
  { id: 'bls-retail-employment', title: 'Retail trade employment', category: 'Labor', seriesId: 'CES4200000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES4200000001', sectors: ['RETAIL_TRADE'], industryKeywords: ['retail'], productKeywords: ['retail', 'apparel', 'clothing'], priority: 6 },
  { id: 'bls-professional-services-employment', title: 'Professional and business services employment', category: 'Labor', seriesId: 'CES6000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES6000000001', sectors: ['PROFESSIONAL_SERVICES', 'ADMIN_SUPPORT_WASTE'], industryKeywords: ['professional', 'staff', 'employment'], priority: 6 },
  { id: 'bls-health-care-employment', title: 'Education and health services employment', category: 'Labor', seriesId: 'CES6500000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES6500000001', sectors: ['HEALTH_CARE_SOCIAL_ASSISTANCE', 'ADMIN_SUPPORT_WASTE'], industryKeywords: ['health', 'medical', 'clinical'], productKeywords: ['medical', 'clinical', 'lab'], priority: 6 },
  { id: 'bls-admin-support-waste-hourly-earnings', title: 'Admin and support services hourly earnings', category: 'Labor', seriesId: 'CES6056000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES6056000003', sectors: ['ADMIN_SUPPORT_WASTE'], industryKeywords: ['staff', 'employment', 'peo'], priority: 6 },
  { id: 'bls-leisure-hospitality-employment', title: 'Leisure and hospitality employment', category: 'Labor', seriesId: 'CES7000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES7000000001', sectors: ['ACCOMMODATION_FOOD_SERVICES'], industryKeywords: ['restaurant', 'food service', 'hospitality'], priority: 6 },
  { id: 'bls-real-estate-employment', title: 'Real estate employment', category: 'Labor', seriesId: 'CES5553000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES5553000001', sectors: ['REAL_ESTATE'], industryKeywords: ['real estate', 'broker', 'property'], priority: 6 },
  { id: 'bls-information-employment', title: 'Information employment', category: 'Labor', seriesId: 'CES5000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES5000000001', sectors: ['INFORMATION'], industryKeywords: ['software', 'information', 'media', 'telecom', 'technology'], productKeywords: ['software', 'data', 'media', 'telecom'], priority: 6 },
  { id: 'bls-financial-activities-employment', title: 'Financial activities employment', category: 'Labor', seriesId: 'CES5500000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES5500000001', sectors: ['FINANCE_INSURANCE'], industryKeywords: ['bank', 'finance', 'insurance', 'credit'], priority: 6 },
];

const FRED_FETCH_TIMEOUT_MS = 30000;
const BLS_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_PERPLEXITY_FETCH_TIMEOUT_MS = 60000;

function fredApiKey(): string {
  return process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
}

function perplexityFetchTimeoutMs(): number {
  const parsed = Number(process.env.INDUSTRY_BRIEF_PERPLEXITY_TIMEOUT_MS || DEFAULT_PERPLEXITY_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_PERPLEXITY_FETCH_TIMEOUT_MS;
  return Math.max(30000, Math.min(90000, Math.floor(parsed)));
}

function oneYearAgo(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function latestNumericObservation(rows: any[]): { date: string; value: number } | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const value = Number(row?.value);
    const date = String(row?.date || '');
    if (date && Number.isFinite(value)) return { date, value };
  }
  return null;
}

function latestNumericHistory(rows: any[], limit = 12): Array<{ date: string; value: number }> {
  return rows
    .map((row) => ({
      date: String(row?.date || ''),
      value: Number(row?.value),
    }))
    .filter((row) => row.date && Number.isFinite(row.value))
    .slice(-limit);
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]}>"]+/g) || [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;]+$/, ''))));
}

function contextSectorKey(context: CompanySourceContext) {
  if (context.sectorKey) return normalizeIndustrySectorCategory(context.sectorKey);
  const combined = `${context.industry} ${context.segment}`.toUpperCase();
  return normalizeIndustrySectorCategory(
    combined.includes('CONSTRUCTION') ? 'CONSTRUCTION'
      : combined.includes('RETAIL') ? 'RETAIL_TRADE'
        : combined.includes('HEALTH') ? 'HEALTH_CARE_SOCIAL_ASSISTANCE'
          : combined.includes('REAL ESTATE') ? 'REAL_ESTATE'
            : combined.includes('FOOD SERVICE') || combined.includes('RESTAURANT') ? 'ACCOMMODATION_FOOD_SERVICES'
              : combined.includes('MANUFACTUR') ? 'MANUFACTURING'
                : combined.includes('PROFESSIONAL') || combined.includes('SERVICES') ? 'PROFESSIONAL_SERVICES'
                  : context.industry
  );
}

function isBakeryContext(context: CompanySourceContext): boolean {
  const combined = `${context.name} ${context.segment}`.toLowerCase();
  return /baker|bakery|bread/.test(combined);
}

function isMedicalScienceStaffingContext(context: CompanySourceContext): boolean {
  const combined = [
    context.name,
    context.industry,
    context.segment,
    context.industryGroupName,
    context.industryGroupDescription,
    context.profileText,
  ].join(' ').toLowerCase();
  return /(medical|health ?care|clinical|laborator|scientist|scientific|biotech|pharma|research)/.test(combined)
    && /(staff|recruit|employment|professional employer|peo|sourcing|talent)/.test(combined);
}

function contextText(context: CompanySourceContext, scope: 'industry' | 'product' | 'customer' | 'all' = 'all'): string {
  const industry = [context.name, context.industry, context.segment, context.industryGroupName, context.industryGroupDescription, context.profileText].join(' ');
  const product = String(context.productContext || '');
  const customer = String(context.customerContext || '');
  if (scope === 'industry') return industry.toLowerCase();
  if (scope === 'product') return product.toLowerCase();
  if (scope === 'customer') return customer.toLowerCase();
  return [industry, product, customer].join(' ').toLowerCase();
}

function keywordScore(text: string, keywords: string[] | undefined, weight: number): number {
  if (!keywords?.length) return 0;
  return keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    return text.includes(normalized) ? score + weight : score;
  }, 0);
}

function candidateTargetScore<T>(candidate: MetricCandidate<T>, context: CompanySourceContext): number {
  const sector = contextSectorKey(context);
  let score = 0;
  if (candidate.sectors?.includes(sector)) score += 20;
  score += keywordScore(contextText(context, 'industry'), candidate.industryKeywords, 10);
  score += keywordScore(contextText(context, 'product'), candidate.productKeywords, 14);
  score += keywordScore(contextText(context, 'customer'), candidate.customerKeywords, 8);
  return score;
}

function hasCandidateTarget<T>(candidate: MetricCandidate<T>): boolean {
  return Boolean(
    candidate.sectors?.length
    || candidate.industryKeywords?.length
    || candidate.productKeywords?.length
    || candidate.customerKeywords?.length
  );
}

function selectRankedCandidates<T extends { seriesId: string }>(
  candidates: Array<MetricCandidate<T>>,
  context: CompanySourceContext,
  limit: number,
): T[] {
  const ranked = candidates
    .map((candidate) => {
      const targetScore = candidateTargetScore(candidate, context);
      return {
        candidate,
        targetScore,
        score: targetScore + (candidate.priority || 0),
      };
    })
    .filter(({ candidate, targetScore }) => !hasCandidateTarget(candidate) || targetScore > 0)
    .sort((a, b) => b.score - a.score);
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const { candidate, score } of ranked) {
    if (score <= 1 && selected.length >= Math.min(2, limit)) continue;
    if (seen.has(candidate.seriesId)) continue;
    seen.add(candidate.seriesId);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function fredSeriesForContext(context: CompanySourceContext): FredSeriesDefinition[] {
  if (isBakeryContext(context)) return BAKERY_FRED_SERIES;
  const selected = selectRankedCandidates(FRED_CANDIDATES, context, isMedicalScienceStaffingContext(context) ? 5 : 4);
  return selected.length > 0 ? selected : DEFAULT_FRED_SERIES;
}

function blsSeriesForContext(context: CompanySourceContext): BlsSeriesDefinition[] {
  const selected = selectRankedCandidates(BLS_CANDIDATES, context, 2);
  return selected.length > 0 ? selected : DEFAULT_BLS_SERIES;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function retrySource<T>(label: string, attempts: number, work: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work(attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || !/(timed out|HTTP 429|HTTP 5\d\d|request did not succeed)/i.test(message)) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed.`);
}

async function collectFredSeries(series: FredSeriesDefinition): Promise<IndustryBriefSourceRecord> {
  const apiKey = fredApiKey();
  const params = new URLSearchParams({
    series_id: series.seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'asc',
    observation_start: oneYearAgo(),
  });
  const response = await retrySource(`FRED source ${series.seriesId}`, 2, () => fetchWithTimeout(
    `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`,
    { next: { revalidate: 60 * 60 * 6 } },
    FRED_FETCH_TIMEOUT_MS,
    `FRED source ${series.seriesId}`,
  ));
  if (!response.ok) {
    throw new Error(`FRED source ${series.seriesId} failed with HTTP ${response.status}.`);
  }
  const data = await response.json();
  const observations = Array.isArray(data?.observations) ? data.observations : [];
  const latest = latestNumericObservation(observations);
  if (!latest) throw new Error(`FRED source ${series.seriesId} returned no numeric observations.`);
  return {
    id: series.id,
    provider: 'FRED',
    category: series.category,
    title: series.title,
    value: String(latest.value),
    publishedAt: latest.date,
    url: series.url,
    summary: `${series.title}: ${latest.value} as of ${latest.date}.`,
    citations: [series.url],
    history: latestNumericHistory(observations),
  };
}

export async function collectFredIndustryBriefSources(context: CompanySourceContext): Promise<IndustryBriefSourceRecord[]> {
  const apiKey = fredApiKey();
  if (!apiKey) throw new Error('FRED_API_KEY is required for Daily Industry Brief source scan.');
  const seriesDefinitions = fredSeriesForContext(context);

  const results = await Promise.allSettled(seriesDefinitions.map((series) => collectFredSeries(series)));
  const records = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (records.length > 0) return records;
  const failures = results.flatMap((result) => result.status === 'rejected'
    ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
    : []);
  throw new Error(failures.join(' | ') || 'FRED source scan returned no live sources.');
}

function blsObservationDate(row: any): string {
  const year = String(row?.year || '').trim();
  const period = String(row?.period || '').trim();
  const month = Number(period.replace(/^M/i, ''));
  if (!/^\d{4}$/.test(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function latestBlsObservation(series: any): { periodName: string; year: string; value: string } | null {
  const rows = Array.isArray(series?.data) ? series.data : [];
  for (const row of rows) {
    const period = String(row?.period || '');
    const value = String(row?.value || '').trim();
    if (period !== 'M13' && value) {
      return {
        periodName: String(row?.periodName || period),
        year: String(row?.year || ''),
        value,
      };
    }
  }
  return null;
}

function blsHistory(series: any, unit: string): Array<{ date: string; value: number; label: string }> {
  const rows = Array.isArray(series?.data) ? series.data : [];
  return rows
    .map((row) => {
      const date = blsObservationDate(row);
      const value = Number(String(row?.value || '').trim());
      const periodName = String(row?.periodName || row?.period || '').trim();
      const year = String(row?.year || '').trim();
      return {
        date,
        value,
        label: [periodName, year].filter(Boolean).join(' '),
      };
    })
    .filter((row) => row.date && Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12)
    .map((row) => ({
      ...row,
      label: unit ? `${row.label} (${unit})` : row.label,
    }));
}

export async function collectBlsIndustryBriefSources(context: CompanySourceContext): Promise<IndustryBriefSourceRecord[]> {
  const year = new Date().getUTCFullYear();
  const seriesDefinitions = blsSeriesForContext(context);
  const response = await retrySource('BLS source scan', 2, () => fetchWithTimeout(
    'https://api.bls.gov/publicAPI/v2/timeseries/data/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: seriesDefinitions.map((series) => series.seriesId),
        startyear: String(year - 1),
        endyear: String(year),
      }),
      next: { revalidate: 60 * 60 * 6 },
    },
    BLS_FETCH_TIMEOUT_MS,
    'BLS source scan',
  ));
  if (!response.ok) throw new Error(`BLS source scan failed with HTTP ${response.status}.`);
  const data = await response.json();
  if (String(data?.status || '').toUpperCase() !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS source scan failed: ${Array.isArray(data?.message) ? data.message.join('; ') : 'request did not succeed'}`);
  }
  const seriesRows = Array.isArray(data?.Results?.series) ? data.Results.series : [];
  const records: IndustryBriefSourceRecord[] = seriesDefinitions.flatMap((definition) => {
    const row = seriesRows.find((item: any) => String(item?.seriesID || '') === definition.seriesId);
    const latest = latestBlsObservation(row);
    if (!latest) return [];
    return [{
      id: definition.id,
      provider: 'BLS',
      category: definition.category,
      title: definition.title,
      value: `${latest.value} ${definition.unit}`,
      publishedAt: `${latest.periodName} ${latest.year}`,
      url: definition.url,
      summary: `${definition.title}: ${latest.value} ${definition.unit} for ${latest.periodName} ${latest.year}.`,
      citations: [definition.url],
      unit: definition.unit,
      history: blsHistory(row, definition.unit),
    }];
  });
  if (records.length === 0) throw new Error(`BLS source scan returned no observations for ${seriesDefinitions.map((series) => series.seriesId).join(', ')}.`);
  return records;
}

export async function collectPerplexityIndustryBriefSource(context: CompanySourceContext): Promise<IndustryBriefSourceRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY || '';
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is required for Daily Industry Brief competitor/news scan.');

  const buildPrompt = (retry = false) => [
    `Company: ${context.name}`,
    `Industry: ${context.industry}`,
    `Segment: ${context.segment}`,
    context.industryGroupName ? `Detailed industry: ${context.industryGroupName}` : '',
    context.productContext ? `Known products/items: ${context.productContext}` : '',
    context.customerContext ? `Known customers/channels: ${context.customerContext}` : '',
    `Location: ${context.location}`,
    '',
    retry
      ? 'Return 6 current, cited evidence bullets only: 3 industry/customer-demand bullets, 2 local-market bullets, and 1 competitor/regulatory/labor bullet.'
      : 'Return 8 current, cited evidence bullets only: industry demand, customer/channel demand, input or operating cost, labor, regulation, local market, and competitor/capacity signals.',
    'Use only source-backed facts from authoritative or clearly identified sources.',
    'Each bullet must include the source name or URL/citation. Prefer recent sources from the last 30 days when available.',
    'Do not recommend actions, score opportunities, write an executive summary, or infer what the company should do.',
    'Do not estimate private company revenue or employee counts unless an authoritative source states them.',
  ].filter(Boolean).join('\n');

  const requestPerplexity = async (retry = false) => {
    const response = await fetchWithTimeout(
      'https://api.perplexity.ai/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
          messages: [
            { role: 'system', content: 'You retrieve source-backed business evidence. Return concise cited facts only. Do not provide strategy or recommendations.' },
            { role: 'user', content: buildPrompt(retry) },
          ],
          temperature: 0.1,
          max_tokens: retry ? 450 : 650,
        }),
      },
      perplexityFetchTimeoutMs(),
      retry ? 'Perplexity focused retry source scan' : 'Perplexity source scan',
    );
    return response;
  };

  let response: Response;
  try {
    response = await requestPerplexity(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/timed out/i.test(message)) throw error;
    response = await requestPerplexity(true);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Perplexity source scan failed with HTTP ${response.status}.`);
  }
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  const citations = Array.isArray(data?.citations)
    ? data.citations.map((citation: unknown) => String(citation || '').trim()).filter(Boolean)
    : [];
  const sourceUrls = citations.length > 0 ? citations : extractUrls(content);
  if (!content || sourceUrls.length === 0) {
    throw new Error('Perplexity source scan returned no cited research.');
  }
  return {
    id: 'perplexity-market-competitor-news',
    provider: 'Perplexity',
    category: 'News and Competitive Data',
    title: 'Live market, competitor, and opportunity scan',
    publishedAt: new Date().toISOString(),
    summary: content,
    citations: sourceUrls,
  };
}

export async function collectIndustryBriefSources(context: CompanySourceContext): Promise<IndustryBriefSourceRecord[]> {
  const results = await Promise.allSettled([
    collectFredIndustryBriefSources(context),
    collectBlsIndustryBriefSources(context),
    collectPerplexityIndustryBriefSource(context),
  ]);
  const labels = ['FRED', 'BLS', 'Perplexity'];
  const failures = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return [`${labels[index]}: ${message}`];
  });
  const fredSources = results[0].status === 'fulfilled' ? results[0].value : [];
  const blsSources = results[1].status === 'fulfilled' ? results[1].value : [];
  const perplexitySource = results[2].status === 'fulfilled' ? results[2].value : null;
  const sources = [...fredSources, ...blsSources, ...(perplexitySource ? [perplexitySource] : [])];
  const providerCount = new Set(sources.map((source) => source.provider)).size;
  if (sources.length >= 3 && providerCount >= 2) return sources;
  if (failures.length > 0) {
    throw new IndustryBriefSourceCollectionError(failures);
  }
  if (sources.length < 3) throw new Error('Daily Industry Brief source scan returned too few live sources.');
  if (providerCount < 2) throw new Error('Daily Industry Brief source scan returned too few live source providers.');
  return sources;
}
