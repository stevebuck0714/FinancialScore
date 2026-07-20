import type { IndustryBriefSourceRecord } from '@/lib/industry-brief/types';

type CompanySourceContext = {
  name: string;
  industry: string;
  segment: string;
  location: string;
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

const FRED_SERIES: FredSeriesDefinition[] = [
  {
    id: 'fred-industrial-production',
    title: 'Industrial production index',
    category: 'Manufacturing',
    seriesId: 'INDPRO',
    url: 'https://fred.stlouisfed.org/series/INDPRO',
  },
  {
    id: 'fred-grocery-spending',
    title: 'Food and beverage store sales',
    category: 'Demand',
    seriesId: 'MRTSSM445USN',
    url: 'https://fred.stlouisfed.org/series/MRTSSM445USN',
  },
  {
    id: 'fred-commercial-bakery-ppi',
    title: 'Commercial bakery producer price index',
    category: 'Input Costs',
    seriesId: 'PCU311812311812',
    url: 'https://fred.stlouisfed.org/series/PCU311812311812',
  },
];

const BLS_SERIES: BlsSeriesDefinition[] = [
  {
    id: 'bls-manufacturing-hourly-earnings',
    title: 'Manufacturing production worker hourly earnings',
    category: 'Labor',
    seriesId: 'CEU3000000008',
    unit: 'USD/hour',
    url: 'https://data.bls.gov/timeseries/CEU3000000008',
  },
  {
    id: 'bls-manufacturing-employment',
    title: 'Manufacturing employment',
    category: 'Labor',
    seriesId: 'CEU3000000001',
    unit: 'thousands of employees',
    url: 'https://data.bls.gov/timeseries/CEU3000000001',
  },
];

const FRED_FETCH_TIMEOUT_MS = 8000;
const BLS_FETCH_TIMEOUT_MS = 8000;
const PERPLEXITY_FETCH_TIMEOUT_MS = 15000;

function fredApiKey(): string {
  return process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
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

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]}>"]+/g) || [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;]+$/, ''))));
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

async function collectFredSources(): Promise<IndustryBriefSourceRecord[]> {
  const apiKey = fredApiKey();
  if (!apiKey) throw new Error('FRED_API_KEY is required for Daily Industry Brief source scan.');

  return Promise.all(FRED_SERIES.map(async (series) => {
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
    };
  }));
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

async function collectBlsSources(): Promise<IndustryBriefSourceRecord[]> {
  const year = new Date().getUTCFullYear();
  const response = await fetchWithTimeout(
    'https://api.bls.gov/publicAPI/v2/timeseries/data/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: BLS_SERIES.map((series) => series.seriesId),
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
  return BLS_SERIES.map((definition) => {
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
    };
  });
}

async function collectPerplexitySource(context: CompanySourceContext): Promise<IndustryBriefSourceRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY || '';
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is required for Daily Industry Brief competitor/news scan.');

  const prompt = [
    `Company: ${context.name}`,
    `Industry: ${context.industry}`,
    `Segment: ${context.segment}`,
    `Location: ${context.location}`,
    '',
    'Find current source-backed market, competitor, customer-channel, regulatory, or local economic developments that could affect revenue growth, pricing, cost, or EBITDA over the next 90 days.',
    'Prioritize sources with direct relevance to the company industry, segment, and geography. Include citations. Do not estimate private company revenue or employee counts unless an authoritative source states them.',
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
          { role: 'system', content: 'You are a source-first business research analyst. Return concise notes with citations and uncertainty labels.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1400,
      }),
    },
    PERPLEXITY_FETCH_TIMEOUT_MS,
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
    collectFredSources(),
    collectBlsSources(),
    collectPerplexitySource(context),
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
