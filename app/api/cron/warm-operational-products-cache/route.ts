import { NextRequest, NextResponse } from 'next/server';
import { previousEstCalendarDate } from '@/lib/time/eastern';
import prisma from '@/lib/prisma';

// Atlantic Precision auto-pull is 2:00 AM EST.
// Vercel cron is UTC only. 09:15 UTC = 4:15 AM EST (5:15 AM EDT).
// 11:15 UTC = 6:15 AM EST (7:15 AM EDT) retries if the 2am pull is still transforming.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const PRODUCTS_LOOKBACK_DAYS = 90;
type WholesaleReportMode = 'margin' | 'raw' | 'vendor';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

function yesterdayEstIso(): string {
  return previousEstCalendarDate();
}

function startIsoFromEndDate(endDateIso: string): string {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(endDateIso)
    ? new Date(`${endDateIso}T00:00:00.000Z`)
    : new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - PRODUCTS_LOOKBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

async function latestDailyProductsEndIso(companyId: string): Promise<string> {
  const fallback = yesterdayEstIso();
  const latest = await prisma.productSalesSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  }).catch(() => null);
  const snapshotDate = latest?.snapshotDate instanceof Date
    ? latest.snapshotDate.toISOString().slice(0, 10)
    : '';
  return snapshotDate && snapshotDate <= fallback ? snapshotDate : fallback;
}

async function hasPendingInforTransforms(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT rc."id"
    FROM "InforRawCompleteness" rc
    INNER JOIN "InforSyncRun" sr
      ON sr.id = rc."syncRunId"
      AND sr.status IN ('done', 'failed', 'cancelled')
    WHERE rc.platform = 'INFOR_M3'
      AND rc."companyId" = ${companyId}
      AND rc."isComplete" = false
      AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function warmupOperationalRequest(params: {
  origin: string;
  cronSecret: string;
  companyId: string;
  type: 'products' | 'customers';
  startDate: string;
  endDate: string;
  limit: string;
  sectorCategory?: string | null;
  refreshWholesaleProducts?: boolean;
  reportMode?: WholesaleReportMode;
}): Promise<Record<string, unknown>> {
  const url = new URL('/api/operational-data', params.origin);
  url.searchParams.set('companyId', params.companyId);
  url.searchParams.set('type', params.type);
  url.searchParams.set('frequency', 'daily');
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  url.searchParams.set('limit', params.limit);
  url.searchParams.set('cacheWarmup', '1');
  if (params.sectorCategory) url.searchParams.set('sectorCategory', params.sectorCategory);
  if (params.refreshWholesaleProducts) url.searchParams.set('refreshWholesaleProducts', '1');
  if (params.reportMode) url.searchParams.set('reportMode', params.reportMode);

  const response = await fetch(url, {
    headers: params.cronSecret ? { authorization: `Bearer ${params.cronSecret}` } : {},
    cache: 'no-store',
  });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: String(payload?.error || payload?.message || response.statusText || 'Warmup failed').slice(0, 500),
    };
  }
  return { ok: true, status: response.status, reportMode: params.reportMode || null };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET is required' }, { status: 500 });
  }

  const companyId =
    String(request.nextUrl.searchParams.get('companyId') || '').trim() || ATLANTIC_PRECISION_COMPANY_ID;

  if (await hasPendingInforTransforms(companyId)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'pending_transforms_remaining',
      companyId,
    });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { industrySectorCategory: true },
  });
  const sectorCategory = String(company?.industrySectorCategory || '').trim() || null;
  const endDate = await latestDailyProductsEndIso(companyId);
  const startDate = startIsoFromEndDate(endDate);

  const customers = await warmupOperationalRequest({
    origin: request.nextUrl.origin,
    cronSecret,
    companyId,
    type: 'customers',
    startDate,
    endDate,
    limit: '500',
    sectorCategory,
  });
  const performanceProducts = await warmupOperationalRequest({
    origin: request.nextUrl.origin,
    cronSecret,
    companyId,
    type: 'products',
    startDate,
    endDate,
    limit: 'all',
    sectorCategory,
  });
  const wholesaleReport = sectorCategory === '42'
    ? Object.fromEntries(await Promise.all((['margin', 'raw', 'vendor'] as const).map(async (reportMode) => [
        reportMode,
        await warmupOperationalRequest({
          origin: request.nextUrl.origin,
          cronSecret,
          companyId,
          type: 'products',
          startDate,
          endDate,
          limit: 'all',
          sectorCategory,
          refreshWholesaleProducts: true,
          reportMode,
        }),
      ])))
    : { ok: true, skipped: true, reason: 'not_wholesale_trade' };

  const wholesaleOk = sectorCategory === '42'
    ? Object.values(wholesaleReport as Record<string, any>).every((result: any) => result?.ok)
    : true;

  return NextResponse.json({
    ok: Boolean(customers?.ok && performanceProducts?.ok && wholesaleOk),
    companyId,
    startDate,
    endDate,
    customers,
    performanceProducts,
    wholesaleReport,
  });
}
