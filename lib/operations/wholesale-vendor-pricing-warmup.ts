import prisma from '@/lib/prisma';
import { addEstCalendarDays, formatEstDate, previousEstCalendarDate } from '@/lib/time/eastern';

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

export async function warmWholesaleVendorPricingCache(companyId: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const origin = baseUrl();
  if (!cronSecret || !origin) {
    return { ok: false, skipped: true, error: 'CRON_SECRET and app base URL are required for vendor pricing cache warmup.' };
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { industrySectorCategory: true },
  }).catch(() => null);
  if (String(company?.industrySectorCategory || '').trim() !== '42') {
    return { ok: true, skipped: true };
  }

  const fallbackEndDate = previousEstCalendarDate();
  const latest = await prisma.productSalesSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    select: { snapshotDate: true },
    orderBy: { snapshotDate: 'desc' },
  }).catch(() => null);
  const latestDate = latest?.snapshotDate instanceof Date ? formatEstDate(latest.snapshotDate) : '';
  const endDate = latestDate && latestDate <= fallbackEndDate ? latestDate : fallbackEndDate;
  const url = new URL('/api/operational-data', origin);
  url.search = new URLSearchParams({
    companyId,
    type: 'products',
    frequency: 'daily',
    startDate: addEstCalendarDays(endDate, -90),
    endDate,
    limit: 'all',
    sectorCategory: '42',
    reportMode: 'vendor',
    refreshWholesaleProducts: '1',
    cacheWarmup: '1',
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { authorization: `Bearer ${cronSecret}`, 'x-cron-secret': cronSecret },
    });
    return response.ok ? { ok: true } : { ok: false, error: `Vendor pricing warmup returned ${response.status}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Vendor pricing warmup failed.' };
  } finally {
    clearTimeout(timeout);
  }
}
