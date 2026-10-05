import prisma from '@/lib/prisma';
import { addEstCalendarDays, formatEstDate, previousEstCalendarDate } from '@/lib/time/eastern';

export const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const WARMUP_TIMEOUT_MS = 90_000;
const CUSTOMER_CONCENTRATION_WARMUP_TIMEOUT_MS = 180_000;

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

type AtlanticOperationalCacheType =
  | 'customers'
  | 'products'
  | 'inventory'
  | 'ar-aging'
  | 'ap-aging'
  | 'cash'
  | 'daily-financials';

export type AtlanticOperationalTabsWarmupResult = {
  ok: boolean;
  customers: OperationalTabWarmupResult;
  products: OperationalTabWarmupResult;
  inventory: OperationalTabWarmupResult;
  arAging: OperationalTabWarmupResult;
  apAging: OperationalTabWarmupResult;
  cash: OperationalTabWarmupResult;
  dailyFinancials: OperationalTabWarmupResult;
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
  type: AtlanticOperationalCacheType;
  frequency: OperationalWarmupFrequency;
  startDate: string;
  endDate: string;
  limit: string;
  refreshConcentration?: boolean;
  timeoutMs?: number;
}): Promise<OperationalTabWarmupResult> {
  const url = new URL('/api/operational-data', params.origin);
  url.search = new URLSearchParams({
    companyId: ATLANTIC_PRECISION_COMPANY_ID,
    type: params.type,
    frequency: params.frequency,
    startDate: params.startDate,
    endDate: params.endDate,
    limit: params.limit,
    sectorCategory: '42',
    cacheWarmup: '1',
    ...(params.refreshConcentration ? { refreshConcentration: '1' } : {}),
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? WARMUP_TIMEOUT_MS);
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

type OperationalWarmupFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * Mirrors how the Operations page picks its range: a manually saved company
 * range keeps its start date and frequency but always ends yesterday (EST);
 * otherwise the page shows the last 90 days, daily.
 */
async function resolveAtlanticOperationalRange(): Promise<{
  frequency: OperationalWarmupFrequency;
  startDate: string;
  endDate: string;
}> {
  const endDate = previousEstCalendarDate();
  const fallback = { frequency: 'daily' as const, startDate: addEstCalendarDays(endDate, -90), endDate };
  try {
    const rows = await prisma.$queryRaw<Array<{ preferences: any }>>`
      SELECT preferences FROM "OpsDashboardPreference" WHERE "companyId" = ${ATLANTIC_PRECISION_COMPANY_ID}
    `;
    const saved = rows[0]?.preferences?.dateRange;
    const frequency = saved?.frequency;
    const startDate = String(saved?.startDate || '');
    if (
      saved?.manualSave !== true ||
      !['daily', 'weekly', 'monthly'].includes(frequency) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      startDate <= '2000-01-02'
    ) {
      return fallback;
    }
    return { frequency, startDate: startDate > endDate ? endDate : startDate, endDate };
  } catch {
    return fallback;
  }
}

/**
 * Builds the Atlantic operational-page caches for the range the page will
 * request, once the source import has completed, so the first user to open
 * any operational page gets a ready payload.
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
      inventory: unavailable,
      arAging: unavailable,
      apAging: unavailable,
      cash: unavailable,
      dailyFinancials: unavailable,
      groups: { ...unavailable, year: Number(formatEstDate().slice(0, 4)) },
    };
  }

  const { frequency, startDate, endDate } = await resolveAtlanticOperationalRange();
  const [
    customers,
    products,
    inventory,
    arAging,
    apAging,
    cash,
    dailyFinancials,
    groups,
  ] = await Promise.all([
    // Customer concentration has its own cache and is embedded into the
    // Customers payload, so build it before the Customers page cache.
    warmOperationalTab({
      origin,
      cronSecret,
      type: 'customers',
      frequency,
      startDate,
      endDate,
      limit: '500',
      refreshConcentration: true,
      timeoutMs: CUSTOMER_CONCENTRATION_WARMUP_TIMEOUT_MS,
    }).then(async (concentration) => {
      const customersPage = await warmOperationalTab({
        origin,
        cronSecret,
        type: 'customers',
        frequency,
        startDate,
        endDate,
        limit: '500',
        timeoutMs: CUSTOMER_CONCENTRATION_WARMUP_TIMEOUT_MS,
      });
      return {
        ...customersPage,
        ok: concentration.ok && customersPage.ok,
        error: [concentration.error && `concentration: ${concentration.error}`, customersPage.error]
          .filter(Boolean)
          .join(' | ') || undefined,
      };
    }),
    warmOperationalTab({ origin, cronSecret, type: 'products', frequency, startDate, endDate, limit: '500' }),
    warmOperationalTab({ origin, cronSecret, type: 'inventory', frequency, startDate, endDate, limit: '1000' }),
    warmOperationalTab({ origin, cronSecret, type: 'ar-aging', frequency, startDate, endDate, limit: '1000' }),
    warmOperationalTab({ origin, cronSecret, type: 'ap-aging', frequency, startDate, endDate, limit: '1000' }),
    warmOperationalTab({ origin, cronSecret, type: 'cash', frequency, startDate, endDate, limit: '1000' }),
    warmOperationalTab({ origin, cronSecret, type: 'daily-financials', frequency, startDate, endDate, limit: '1000' }),
    warmAtlanticProductGroupReportCache({ baseUrl: origin }),
  ]);
  return {
    ok:
      customers.ok &&
      products.ok &&
      inventory.ok &&
      arAging.ok &&
      apAging.ok &&
      cash.ok &&
      dailyFinancials.ok &&
      groups.ok,
    customers,
    products,
    inventory,
    arAging,
    apAging,
    cash,
    dailyFinancials,
    groups,
  };
}
