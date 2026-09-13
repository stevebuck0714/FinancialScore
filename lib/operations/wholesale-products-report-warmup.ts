import prisma from '@/lib/prisma';
import { addEstCalendarDays, previousEstCalendarDate } from '@/lib/time/eastern';

// Every wholesale Products/Vendors screen asks for one of these modes. Warming
// only 'vendor' left Product Margin Analysis and Raw Data to pay the full cold
// build inside a user request.
const WHOLESALE_REPORT_MODES = ['vendor', 'margin', 'raw'] as const;
type WholesaleReportMode = (typeof WHOLESALE_REPORT_MODES)[number];

const PER_MODE_TIMEOUT_MS = 90_000;
const TOTAL_BUDGET_MS = 260_000;

export type WholesaleReportWarmupResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  window?: { startDate: string; endDate: string };
  modes?: Array<{ mode: WholesaleReportMode; ok: boolean; ms: number; error?: string }>;
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

const isDateKey = (value: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

// The derived cache key includes the exact start and end dates, so the warmup
// only helps if it rebuilds the window the dashboard actually requests. The
// dashboard loads the company's saved range and always pins the end date to
// yesterday EST, so anchoring the warmup to the latest snapshot date missed by
// a day or more and every user request landed on a cold cache.
async function resolveReportWindow(companyId: string): Promise<{ startDate: string; endDate: string }> {
  const endDate = previousEstCalendarDate();
  const rows = await prisma.$queryRaw<Array<{ preferences: unknown }>>`
    SELECT preferences FROM "OpsDashboardPreference" WHERE "companyId" = ${companyId}
  `.catch(() => [] as Array<{ preferences: unknown }>);
  const preferences = rows.length > 0 && rows[0]?.preferences && typeof rows[0].preferences === 'object'
    ? (rows[0].preferences as Record<string, unknown>)
    : null;
  const savedRange = preferences && preferences.dateRange && typeof preferences.dateRange === 'object'
    ? (preferences.dateRange as Record<string, unknown>)
    : null;
  // The dashboard ignores a stored range unless the user pressed Save.
  const savedStart = savedRange && savedRange.manualSave === true && isDateKey(savedRange.startDate)
    ? String(savedRange.startDate)
    : '';
  const startDate = savedStart && savedStart <= endDate ? savedStart : addEstCalendarDays(endDate, -90);
  return { startDate, endDate };
}

async function warmMode(params: {
  companyId: string;
  origin: string;
  cronSecret: string;
  mode: WholesaleReportMode;
  startDate: string;
  endDate: string;
  timeoutMs: number;
}): Promise<{ mode: WholesaleReportMode; ok: boolean; ms: number; error?: string }> {
  const url = new URL('/api/operational-data', params.origin);
  url.search = new URLSearchParams({
    companyId: params.companyId,
    type: 'products',
    frequency: 'daily',
    startDate: params.startDate,
    endDate: params.endDate,
    limit: 'all',
    sectorCategory: '42',
    reportMode: params.mode,
    refreshWholesaleProducts: '1',
    cacheWarmup: '1',
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { authorization: `Bearer ${params.cronSecret}`, 'x-cron-secret': params.cronSecret },
    });
    return response.ok
      ? { mode: params.mode, ok: true, ms: Date.now() - startedAt }
      : { mode: params.mode, ok: false, ms: Date.now() - startedAt, error: `returned ${response.status}` };
  } catch (error) {
    return {
      mode: params.mode,
      ok: false,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'warmup failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function warmWholesaleProductsReportCache(companyId: string): Promise<WholesaleReportWarmupResult> {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const origin = baseUrl();
  if (!cronSecret || !origin) {
    return { ok: false, skipped: true, error: 'CRON_SECRET and app base URL are required for wholesale report cache warmup.' };
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { industrySectorCategory: true },
  }).catch(() => null);
  if (String(company?.industrySectorCategory || '').trim() !== '42') {
    return { ok: true, skipped: true };
  }

  const reportWindow = await resolveReportWindow(companyId);
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const modes: Array<{ mode: WholesaleReportMode; ok: boolean; ms: number; error?: string }> = [];
  for (const mode of WHOLESALE_REPORT_MODES) {
    const remaining = deadline - Date.now();
    if (remaining <= 5_000) {
      modes.push({ mode, ok: false, ms: 0, error: 'skipped: warmup budget exhausted' });
      continue;
    }
    modes.push(await warmMode({
      companyId,
      origin,
      cronSecret,
      mode,
      startDate: reportWindow.startDate,
      endDate: reportWindow.endDate,
      timeoutMs: Math.min(PER_MODE_TIMEOUT_MS, remaining),
    }));
  }

  const failed = modes.filter((entry) => !entry.ok);
  return {
    ok: failed.length === 0,
    window: reportWindow,
    modes,
    ...(failed.length > 0
      ? { error: failed.map((entry) => `${entry.mode}: ${entry.error || 'failed'}`).join('; ') }
      : {}),
  };
}
