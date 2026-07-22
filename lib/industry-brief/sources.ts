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

const FRED_SERIES_BY_SECTOR: Partial<Record<ReturnType<typeof normalizeIndustrySectorCategory>, FredSeriesDefinition[]>> = {
  MANUFACTURING: [
    { id: 'fred-industrial-production', title: 'Industrial production index', category: 'Manufacturing', seriesId: 'INDPRO', url: 'https://fred.stlouisfed.org/series/INDPRO' },
    { id: 'fred-manufacturing-pmi', title: 'ISM manufacturing PMI', category: 'Manufacturing Demand', seriesId: 'NAPM', url: 'https://fred.stlouisfed.org/series/NAPM' },
    { id: 'fred-manufacturing-ppi', title: 'Manufacturing producer price index', category: 'Input Costs', seriesId: 'PCUOMFGOMFG', url: 'https://fred.stlouisfed.org/series/PCUOMFGOMFG' },
  ],
  CONSTRUCTION: [
    { id: 'fred-housing-starts', title: 'Housing starts', category: 'Construction Demand', seriesId: 'HOUST', url: 'https://fred.stlouisfed.org/series/HOUST' },
    { id: 'fred-construction-spending', title: 'Total construction spending', category: 'Construction Demand', seriesId: 'TTLCONS', url: 'https://fred.stlouisfed.org/series/TTLCONS' },
    { id: 'fred-construction-materials-ppi', title: 'Construction materials producer price index', category: 'Input Costs', seriesId: 'WPUSI012011', url: 'https://fred.stlouisfed.org/series/WPUSI012011' },
  ],
  RETAIL_TRADE: [
    { id: 'fred-retail-sales', title: 'Retail and food services sales', category: 'Retail Demand', seriesId: 'RSAFS', url: 'https://fred.stlouisfed.org/series/RSAFS' },
    { id: 'fred-consumer-sentiment', title: 'Consumer sentiment', category: 'Consumer Demand', seriesId: 'UMCSENT', url: 'https://fred.stlouisfed.org/series/UMCSENT' },
    { id: 'fred-retail-inventories', title: 'Retail inventories', category: 'Inventory', seriesId: 'RETAILIRSA', url: 'https://fred.stlouisfed.org/series/RETAILIRSA' },
  ],
  PROFESSIONAL_SERVICES: [
    { id: 'fred-services-pmi', title: 'ISM services PMI', category: 'Services Demand', seriesId: 'NMFCI', url: 'https://fred.stlouisfed.org/series/NMFCI' },
    { id: 'fred-real-gdp', title: 'Real gross domestic product', category: 'Macro Demand', seriesId: 'GDPC1', url: 'https://fred.stlouisfed.org/series/GDPC1' },
    { id: 'fred-prime-rate', title: 'Bank prime loan rate', category: 'Interest Rates', seriesId: 'DPRIME', url: 'https://fred.stlouisfed.org/series/DPRIME' },
  ],
  HEALTH_CARE_SOCIAL_ASSISTANCE: [
    { id: 'fred-health-care-spending', title: 'Health care services PCE', category: 'Health Care Demand', seriesId: 'DHLCRG3Q086SBEA', url: 'https://fred.stlouisfed.org/series/DHLCRG3Q086SBEA' },
    { id: 'fred-health-care-cpi', title: 'Medical care CPI', category: 'Pricing', seriesId: 'CPIMEDSL', url: 'https://fred.stlouisfed.org/series/CPIMEDSL' },
    { id: 'fred-prime-rate', title: 'Bank prime loan rate', category: 'Interest Rates', seriesId: 'DPRIME', url: 'https://fred.stlouisfed.org/series/DPRIME' },
  ],
  ACCOMMODATION_FOOD_SERVICES: [
    { id: 'fred-food-services-sales', title: 'Food services and drinking places sales', category: 'Restaurant Demand', seriesId: 'MRTSSM722USN', url: 'https://fred.stlouisfed.org/series/MRTSSM722USN' },
    { id: 'fred-food-away-from-home-cpi', title: 'Food away from home CPI', category: 'Pricing', seriesId: 'CUSR0000SEFV', url: 'https://fred.stlouisfed.org/series/CUSR0000SEFV' },
    { id: 'fred-leisure-hospitality-employment', title: 'Leisure and hospitality employment', category: 'Labor', seriesId: 'USLAH', url: 'https://fred.stlouisfed.org/series/USLAH' },
  ],
  REAL_ESTATE: [
    { id: 'fred-existing-home-sales', title: 'Existing home sales', category: 'Real Estate Demand', seriesId: 'EXHOSLUSM495S', url: 'https://fred.stlouisfed.org/series/EXHOSLUSM495S' },
    { id: 'fred-mortgage-rate', title: '30-year fixed mortgage rate', category: 'Interest Rates', seriesId: 'MORTGAGE30US', url: 'https://fred.stlouisfed.org/series/MORTGAGE30US' },
    { id: 'fred-housing-starts', title: 'Housing starts', category: 'Supply', seriesId: 'HOUST', url: 'https://fred.stlouisfed.org/series/HOUST' },
  ],
  ADMIN_SUPPORT_WASTE: [
    { id: 'fred-unemployment-rate', title: 'U.S. unemployment rate', category: 'Labor Availability', seriesId: 'UNRATE', url: 'https://fred.stlouisfed.org/series/UNRATE' },
    { id: 'fred-professional-business-job-openings', title: 'Professional and business services job openings', category: 'Labor Demand', seriesId: 'JTS540099JOL', url: 'https://fred.stlouisfed.org/series/JTS540099JOL' },
    { id: 'fred-temp-help-employment', title: 'Temporary help services employment', category: 'Staffing Demand', seriesId: 'TEMPHELPS', url: 'https://fred.stlouisfed.org/series/TEMPHELPS' },
  ],
};

const DEFAULT_BLS_SERIES: BlsSeriesDefinition[] = [
  { id: 'bls-private-hourly-earnings', title: 'Private-sector hourly earnings', category: 'Labor', seriesId: 'CES0500000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES0500000003' },
  { id: 'bls-private-employment', title: 'Total private employment', category: 'Labor', seriesId: 'CES0500000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES0500000001' },
];

const BLS_SERIES_BY_SECTOR: Partial<Record<ReturnType<typeof normalizeIndustrySectorCategory>, BlsSeriesDefinition[]>> = {
  MANUFACTURING: [
    { id: 'bls-manufacturing-hourly-earnings', title: 'Manufacturing production worker hourly earnings', category: 'Labor', seriesId: 'CEU3000000008', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CEU3000000008' },
    { id: 'bls-manufacturing-employment', title: 'Manufacturing employment', category: 'Labor', seriesId: 'CEU3000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CEU3000000001' },
  ],
  CONSTRUCTION: [
    { id: 'bls-construction-hourly-earnings', title: 'Construction hourly earnings', category: 'Labor', seriesId: 'CES2000000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES2000000003' },
    { id: 'bls-construction-employment', title: 'Construction employment', category: 'Labor', seriesId: 'CES2000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES2000000001' },
  ],
  RETAIL_TRADE: [
    { id: 'bls-retail-hourly-earnings', title: 'Retail trade hourly earnings', category: 'Labor', seriesId: 'CES4200000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES4200000003' },
    { id: 'bls-retail-employment', title: 'Retail trade employment', category: 'Labor', seriesId: 'CES4200000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES4200000001' },
  ],
  PROFESSIONAL_SERVICES: [
    { id: 'bls-professional-services-hourly-earnings', title: 'Professional and business services hourly earnings', category: 'Labor', seriesId: 'CES6000000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES6000000003' },
    { id: 'bls-professional-services-employment', title: 'Professional and business services employment', category: 'Labor', seriesId: 'CES6000000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES6000000001' },
  ],
  HEALTH_CARE_SOCIAL_ASSISTANCE: [
    { id: 'bls-health-care-hourly-earnings', title: 'Health care hourly earnings', category: 'Labor', seriesId: 'CES6500000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES6500000003' },
    { id: 'bls-health-care-employment', title: 'Education and health services employment', category: 'Labor', seriesId: 'CES6500000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES6500000001' },
  ],
  ADMIN_SUPPORT_WASTE: [
    { id: 'bls-admin-support-waste-hourly-earnings', title: 'Admin and support services hourly earnings', category: 'Labor', seriesId: 'CES6056000003', unit: 'USD/hour', url: 'https://data.bls.gov/timeseries/CES6056000003' },
    { id: 'bls-admin-support-waste-employment', title: 'Admin and support services employment', category: 'Labor', seriesId: 'CES6056000001', unit: 'thousands of employees', url: 'https://data.bls.gov/timeseries/CES6056000001' },
  ],
};

const MEDICAL_SCIENCE_FRED_SERIES: FredSeriesDefinition[] = [
  { id: 'fred-health-care-employment', title: 'Health care employment', category: 'Medical Labor Demand', seriesId: 'CES6562000001', url: 'https://fred.stlouisfed.org/series/CES6562000001' },
  { id: 'fred-professional-scientific-employment', title: 'Professional, scientific, and technical services employment', category: 'Scientific Labor Demand', seriesId: 'CES6054000001', url: 'https://fred.stlouisfed.org/series/CES6054000001' },
];

const FRED_FETCH_TIMEOUT_MS = 8000;
const BLS_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_PERPLEXITY_FETCH_TIMEOUT_MS = 30000;

function fredApiKey(): string {
  return process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
}

function perplexityFetchTimeoutMs(): number {
  const parsed = Number(process.env.INDUSTRY_BRIEF_PERPLEXITY_TIMEOUT_MS || DEFAULT_PERPLEXITY_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_PERPLEXITY_FETCH_TIMEOUT_MS;
  return Math.max(10000, Math.min(45000, Math.floor(parsed)));
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

function fredSeriesForContext(context: CompanySourceContext): FredSeriesDefinition[] {
  if (isBakeryContext(context)) return BAKERY_FRED_SERIES;
  const sector = contextSectorKey(context);
  const baseSeries = FRED_SERIES_BY_SECTOR[sector] || DEFAULT_FRED_SERIES;
  if (!isMedicalScienceStaffingContext(context)) return baseSeries;
  const seen = new Set(baseSeries.map((series) => series.seriesId));
  return [
    ...baseSeries,
    ...MEDICAL_SCIENCE_FRED_SERIES.filter((series) => !seen.has(series.seriesId)),
  ];
}

function blsSeriesForContext(context: CompanySourceContext): BlsSeriesDefinition[] {
  const sector = contextSectorKey(context);
  return BLS_SERIES_BY_SECTOR[sector] || DEFAULT_BLS_SERIES;
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

export async function collectFredIndustryBriefSources(context: CompanySourceContext): Promise<IndustryBriefSourceRecord[]> {
  const apiKey = fredApiKey();
  if (!apiKey) throw new Error('FRED_API_KEY is required for Daily Industry Brief source scan.');
  const seriesDefinitions = fredSeriesForContext(context);

  return Promise.all(seriesDefinitions.map(async (series) => {
    const params = new URLSearchParams({
      series_id: series.seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'asc',
      observation_start: oneYearAgo(),
    });
    const response = await fetchWithTimeout(
      `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`,
      { next: { revalidate: 60 * 60 * 6 } },
      FRED_FETCH_TIMEOUT_MS,
      `FRED source ${series.seriesId}`,
    );
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
  }));
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
  const response = await fetchWithTimeout(
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
  );
  if (!response.ok) throw new Error(`BLS source scan failed with HTTP ${response.status}.`);
  const data = await response.json();
  if (String(data?.status || '').toUpperCase() !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS source scan failed: ${Array.isArray(data?.message) ? data.message.join('; ') : 'request did not succeed'}`);
  }
  const seriesRows = Array.isArray(data?.Results?.series) ? data.Results.series : [];
  return seriesDefinitions.map((definition) => {
    const row = seriesRows.find((item: any) => String(item?.seriesID || '') === definition.seriesId);
    const latest = latestBlsObservation(row);
    if (!latest) throw new Error(`BLS source ${definition.seriesId} returned no observations.`);
    return {
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
    };
  });
}

export async function collectPerplexityIndustryBriefSource(context: CompanySourceContext): Promise<IndustryBriefSourceRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY || '';
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is required for Daily Industry Brief competitor/news scan.');

  const prompt = [
    `Company: ${context.name}`,
    `Industry: ${context.industry}`,
    `Segment: ${context.segment}`,
    context.industryGroupName ? `Detailed industry: ${context.industryGroupName}` : '',
    context.industryGroupDescription ? `Detailed industry description: ${context.industryGroupDescription}` : '',
    `Location: ${context.location}`,
    '',
    'Research current, source-backed developments for BOTH the broader U.S. industry outlook and the company-local market.',
    'Required broad industry coverage: industry demand, input commodities or ingredients, energy/fuel, freight/transportation, labor, regulation, consumer/channel trends, and competitor or capacity signals.',
    'Required local coverage: metro/state economic conditions, customer-channel demand, local labor availability, weather or operating risks, and nearby competitor/customer expansion where source-backed.',
    'Return research evidence only: concise cited notes organized by category, with source URLs or citations.',
    'Do not recommend actions, score opportunities, write an executive summary, or infer what the company should do.',
    'Do not estimate private company revenue or employee counts unless an authoritative source states them.',
  ].join('\n');

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
          { role: 'system', content: 'You are a source-first business research analyst. Return concise evidence notes with citations and uncertainty labels. Do not provide strategic recommendations.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 900,
      }),
    },
    perplexityFetchTimeoutMs(),
    'Perplexity source scan',
  );
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
  if (failures.length > 0) {
    throw new IndustryBriefSourceCollectionError(failures);
  }

  const fredSources = results[0].status === 'fulfilled' ? results[0].value : [];
  const blsSources = results[1].status === 'fulfilled' ? results[1].value : [];
  const perplexitySource = results[2].status === 'fulfilled' ? results[2].value : null;
  const sources = [...fredSources, ...blsSources, ...(perplexitySource ? [perplexitySource] : [])];
  if (sources.length < 3) throw new Error('Daily Industry Brief source scan returned too few live sources.');
  return sources;
}
