import { addEstCalendarDays, formatEstDate, previousEstCalendarDate } from '@/lib/time/eastern';

export const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const WARMUP_TIMEOUT_MS = 90_000;

export type ProductGroupReportWarmupResult = {
  ok: boolean;
  skipped?: boolean;
  year?: number;
  ms?: number;
  error?: string;
};

type OperationalTabWarmupResult = {
  ok: boolean;
  status?: number;
  ms?: number;
  error?: string;
};

export type AtlanticOperationalTabsWarmupResult = {
  ok: boolean;
  customers: OperationalTabWarmupResult;
  products: OperationalTabWarmupResult;
  groups: ProductGroupReportWarmupResult;
};

function baseUrl(): string {
  for (const value of [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.WORKER_BASE_URL,
    process.env.VERCEL_URL,
  ]) {
    const candidate = String(value || '').trim().replace(/\/+$/, '');
    if (candidate) return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  }
  return '';
}

/**
 * Rebuilds Atlantic's current-year Groups tab cache after its source import
 * completes. Groups are Atlantic-only, so this intentionally cannot warm an
 * arbitrary company's report through the cron authorization path.
 */
export async function warmAtlanticProductGroupReportCache(
  options: { baseUrl?: string } = {}
): Promise<ProductGroupReportWarmupResult> {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const origin = String(options.baseUrl || baseUrl()).trim().replace(/\/+$/, '');
  if (!cronSecret || !origin) {
    return {
      ok: false,
      skipped: true,
      error: 'CRON_SECRET and app base URL are required for product group report cache warmup.',
    };
  }

  const year = Number(formatEstDate().slice(0, 4));
  const url = new URL('/api/operational-data/product-groups', origin);
  url.search = new URLSearchParams({
    companyId: ATLANTIC_PRECISION_COMPANY_ID,
    year: String(year),
    refresh: '1',
    cacheWarmup: '1',
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    if (response.ok) {
      return { ok: true, year, ms: Date.now() - startedAt };
    }
    const payload = await response.json().catch(() => null);
    return {
      ok: false,
      year,
      ms: Date.now() - startedAt,
      error: String(payload?.error || response.statusText || `returned ${response.status}`).slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      year,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'warmup failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function warmOperationalTab(params: {
  origin: string;
  cronSecret: string;
  type: 'customers' | 'products';
  startDate: string;
  endDate: string;
  limit: string;
}): Promise<OperationalTabWarmupResult> {
  const url = new URL('/api/operational-data', params.origin);
  url.search = new URLSearchParams({
    companyId: ATLANTIC_PRECISION_COMPANY_ID,
    type: params.type,
    frequency: 'daily',
    startDate: params.startDate,
    endDate: params.endDate,
    limit: params.limit,
    sectorCategory: '42',
    cacheWarmup: '1',
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { authorization: `Bearer ${params.cronSecret}` },
    });
    if (response.ok) return { ok: true, status: response.status, ms: Date.now() - startedAt };
    const payload = await response.json().catch(() => null);
    return {
      ok: false,
      status: response.status,
      ms: Date.now() - startedAt,
      error: String(payload?.error || response.statusText || `returned ${response.status}`).slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'warmup failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Builds Atlantic's default 90-day Customers, Products, and Groups tab caches
 * concurrently once the nightly import has completed.
 */
export async function warmAtlanticOperationalTabsCaches(
  options: { baseUrl?: string } = {}
): Promise<AtlanticOperationalTabsWarmupResult> {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const origin = String(options.baseUrl || baseUrl()).trim().replace(/\/+$/, '');
  const unavailable = {
    ok: false,
    error: 'CRON_SECRET and app base URL are required for Atlantic operational tab cache warmup.',
  };
  if (!cronSecret || !origin) {
    return {
      ok: false,
      customers: unavailable,
      products: unavailable,
      groups: { ...unavailable, year: Number(formatEstDate().slice(0, 4)) },
    };
  }

  const endDate = previousEstCalendarDate();
  const startDate = addEstCalendarDays(endDate, -90);
  const [customers, products, groups] = await Promise.all([
    warmOperationalTab({ origin, cronSecret, type: 'customers', startDate, endDate, limit: '500' }),
    warmOperationalTab({ origin, cronSecret, type: 'products', startDate, endDate, limit: 'all' }),
    warmAtlanticProductGroupReportCache({ baseUrl: origin }),
  ]);
  return {
    ok: customers.ok && products.ok && groups.ok,
    customers,
    products,
    groups,
  };
}
