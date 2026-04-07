export type ExternalSearchHit = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

const SEARCH_TIMEOUT_MS = 6500;
const MAX_RESULTS = 5;
const CACHE_TTL_MS = 10 * 60 * 1000;
const externalSearchCache = new Map<string, { expiresAt: number; results: ExternalSearchHit[] }>();

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function braveSearch(query: string): Promise<ExternalSearchHit[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
  if (!apiKey) return [];

  const endpoint = process.env.BRAVE_SEARCH_API_URL || 'https://api.search.brave.com/res/v1/web/search';
  const url = new URL(endpoint);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(MAX_RESULTS));
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('country', 'us');

  const res = await fetchJsonWithTimeout(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    },
    SEARCH_TIMEOUT_MS,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Brave search failed (${res.status}): ${txt || res.statusText}`);
  }

  const data: any = await res.json();
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];

  return results
    .map((r: any) => ({
      title: r?.title ? String(r.title) : undefined,
      link: r?.url ? String(r.url) : undefined,
      snippet: r?.description ? String(r.description) : undefined,
      date: r?.page_age ? String(r.page_age) : undefined,
    }))
    .filter((r: ExternalSearchHit) => Boolean(r.link))
    .slice(0, MAX_RESULTS);
}

async function serpApiSearch(query: string): Promise<ExternalSearchHit[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [];

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('api_key', apiKey);

  const res = await fetchJsonWithTimeout(url.toString(), { method: 'GET' }, SEARCH_TIMEOUT_MS);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`SerpAPI search failed (${res.status}): ${txt || res.statusText}`);
  }

  const data: any = await res.json();
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return organic
    .map((r: any) => ({
      title: r?.title ? String(r.title) : undefined,
      link: r?.link ? String(r.link) : undefined,
      snippet: r?.snippet ? String(r.snippet) : undefined,
      date: r?.date ? String(r.date) : undefined,
    }))
    .filter((r: ExternalSearchHit) => Boolean(r.link))
    .slice(0, MAX_RESULTS);
}

export async function searchExternalWeb(query: string): Promise<ExternalSearchHit[]> {
  const cacheKey = query.trim().toLowerCase();
  const now = Date.now();
  const cached = externalSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    console.info('Ask Corelytics external search provider=cache', { count: cached.results.length });
    return cached.results;
  }

  try {
    const brave = await braveSearch(query);
    if (brave.length > 0) {
      console.info('Ask Corelytics external search provider=brave', { count: brave.length });
      externalSearchCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, results: brave });
      return brave;
    }
  } catch (error) {
    console.warn('Brave search unavailable; attempting fallback provider.', error);
  }

  try {
    const fallback = await serpApiSearch(query);
    if (fallback.length > 0) {
      console.info('Ask Corelytics external search provider=serpapi-fallback', { count: fallback.length });
      externalSearchCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, results: fallback });
    } else {
      console.info('Ask Corelytics external search provider=none', { count: 0 });
    }
    return fallback;
  } catch (error) {
    console.warn('Fallback web search failed.', error);
    console.info('Ask Corelytics external search provider=none', { count: 0 });
    return [];
  }
}
