import { NextRequest, NextResponse } from 'next/server';
import { warmDailyExecutiveBriefingCache } from '@/lib/pulse/exec-briefing-warmup';
import { addEstCalendarDays, formatEstDate, previousEstCalendarDate } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPERATIONAL_REPORT_MIN_DATE = '2024-01-01';
const PRODUCTS_PERFORMANCE_LOOKBACK_DAYS = 90;
type WholesaleProductsReportMode = 'margin' | 'raw' | 'vendor';

async function hasPendingInforTransformsForCompany(prisma: any, companyId: string): Promise<boolean> {
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

function yesterdayEstIso(): string {
  return previousEstCalendarDate();
}

function productsStartIsoFromEndDate(endDateIso: string): string {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(endDateIso) ? endDateIso : yesterdayEstIso();
  return addEstCalendarDays(end, -PRODUCTS_PERFORMANCE_LOOKBACK_DAYS);
}

async function latestDailyProductsEndIsoUtc(prisma: any, companyId: string): Promise<string> {
  const fallback = yesterdayEstIso();
  const latest = await prisma.productSalesSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  }).catch(() => null);
  const snapshotDate = latest?.snapshotDate instanceof Date
    ? formatEstDate(latest.snapshotDate)
    : '';
  return snapshotDate && snapshotDate <= fallback ? snapshotDate : fallback;
}

async function fetchOperationalCacheWarmup(params: {
  origin: string;
  cronSecret: string;
  companyId: string;
  type: 'customers' | 'products';
  startDate: string;
  endDate: string;
  limit: string;
  sectorCategory?: string | null;
  refreshWholesaleProducts?: boolean;
  reportMode?: WholesaleProductsReportMode;
}): Promise<any> {
  const url = new URL('/api/operational-data', params.origin);
  url.searchParams.set('companyId', params.companyId);
  url.searchParams.set('type', params.type);
  url.searchParams.set('frequency', 'daily');
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  url.searchParams.set('limit', params.limit);
  url.searchParams.set('cacheWarmup', '1');
  if (params.sectorCategory) {
    url.searchParams.set('sectorCategory', params.sectorCategory);
  }
  if (params.refreshWholesaleProducts) {
    url.searchParams.set('refreshWholesaleProducts', '1');
  }
  if (params.reportMode) {
    url.searchParams.set('reportMode', params.reportMode);
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${params.cronSecret}`,
    },
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
      error: String(payload?.error || payload?.details || response.statusText || 'Warmup request failed').slice(0, 500),
    };
  }

  return {
    ok: true,
    status: response.status,
    type: params.type,
    records: Array.isArray(payload?.records) ? payload.records.length : null,
    wholesaleOrderLines: Array.isArray(payload?.summary?.wholesaleOrderLines)
      ? payload.summary.wholesaleOrderLines.length
      : null,
    wholesaleVendorPricingRows: Array.isArray(payload?.summary?.wholesaleVendorPricingRows)
      ? payload.summary.wholesaleVendorPricingRows.length
      : null,
    wholesaleReportMode: payload?.summary?.wholesaleReportMode || params.reportMode || null,
  };
}

async function fetchMasterDataCacheWarmup(params: {
  origin: string;
  companyId: string;
}): Promise<any> {
  const url = new URL('/api/master-data', params.origin);
  url.searchParams.set('companyId', params.companyId);
  url.searchParams.set('scope', 'published');
  url.searchParams.set('cacheWarmup', '1');

  const response = await fetch(url, { cache: 'no-store' });
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
      error: String(payload?.error || payload?.details || response.statusText || 'Warmup request failed').slice(0, 500),
    };
  }

  return {
    ok: true,
    status: response.status,
    months: Number.isFinite(Number(payload?.months)) ? Number(payload.months) : null,
  };
}

async function warmReportCachesForCompany(params: {
  prisma: any;
  origin: string;
  cronSecret: string;
  companyId: string;
}): Promise<Record<string, unknown>> {
  const company = await params.prisma.company.findUnique({
    where: { id: params.companyId },
    select: { industrySectorCategory: true },
  });

  const endDate = await latestDailyProductsEndIsoUtc(params.prisma, params.companyId);
  const sectorCategory = String(company?.industrySectorCategory || '').trim() || null;
  const customers = await fetchOperationalCacheWarmup({
    origin: params.origin,
    cronSecret: params.cronSecret,
    companyId: params.companyId,
    type: 'customers',
    startDate: OPERATIONAL_REPORT_MIN_DATE,
    endDate,
    limit: '500',
    sectorCategory,
  });
  const performanceProducts = await fetchOperationalCacheWarmup({
    origin: params.origin,
    cronSecret: params.cronSecret,
    companyId: params.companyId,
    type: 'products',
    startDate: productsStartIsoFromEndDate(endDate),
    endDate,
    limit: 'all',
    sectorCategory,
  });
  const wholesaleReport = sectorCategory === '42'
    ? Object.fromEntries(await Promise.all((['margin', 'raw', 'vendor'] as const).map(async (reportMode) => [
        reportMode,
        await fetchOperationalCacheWarmup({
          origin: params.origin,
          cronSecret: params.cronSecret,
          companyId: params.companyId,
          type: 'products',
          startDate: productsStartIsoFromEndDate(endDate),
          endDate,
          limit: 'all',
          sectorCategory,
          refreshWholesaleProducts: true,
          reportMode,
        }),
      ])))
    : {
        ok: true,
        skipped: true,
        reason: 'not_wholesale_trade',
      };
  const masterData = await fetchMasterDataCacheWarmup({
    origin: params.origin,
    companyId: params.companyId,
  });
  const executiveBriefing = await warmDailyExecutiveBriefingCache({
    companyId: params.companyId,
    baseUrl: params.origin,
    source: 'infor-pending-transform-snapshot-complete',
  });

  return {
    companyId: params.companyId,
    ok: Boolean(
      customers?.ok &&
      performanceProducts?.ok &&
      masterData?.ok &&
      executiveBriefing?.ok &&
      (
        sectorCategory === '42'
          ? Object.values(wholesaleReport as Record<string, any>).every((result: any) => result?.ok)
          : (wholesaleReport as any)?.ok
      )
    ),
    customers,
    performanceProducts,
    wholesaleReport,
    masterData,
    executiveBriefing,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authHeader = String(request.headers.get('authorization') || '').trim();
    const authorizedByCronSecret = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    let authorizedBySession = false;
    let sessionAuthError = '';
    if (!authorizedByCronSecret) {
      try {
        const { requireSiteAdminAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
        const companyOverride = String(request.nextUrl.searchParams.get('companyId') || '').trim();
        if (companyOverride) {
          await requireSiteAdminAuthorizedInforCompany(request, { companyId: companyOverride });
          authorizedBySession = true;
        } else {
          sessionAuthError = 'No companyId query param for session auth.';
        }
      } catch (e) {
        sessionAuthError = e instanceof Error ? e.message : 'Unknown session auth error';
        authorizedBySession = false;
      }
    }
    if (!authorizedByCronSecret && !authorizedBySession) {
      return NextResponse.json({ ok: false, error: 'Unauthorized', sessionAuthError, hasCronSecret: Boolean(cronSecret), authHeader: authHeader ? 'present' : 'missing' }, { status: 401 });
    }

    const prisma = (await import('@/lib/prisma')).default;
    const { processPendingInforRawTransforms } = await import('@/lib/infor-m3/operational-sync');

    const companyOverride = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    let companies: string[];

    if (companyOverride) {
      companies = [companyOverride];
    } else {
      const envCompanies = String(process.env.INFOR_PENDING_REPLAY_COMPANIES || '').trim();
      if (envCompanies) {
        companies = envCompanies.split(',').map((v) => v.trim()).filter(Boolean);
      } else {
        const rows = await prisma.$queryRaw<Array<{ companyId: string }>>`
          SELECT DISTINCT rc."companyId"
          FROM "InforRawCompleteness" rc
          INNER JOIN "InforSyncRun" sr
            ON sr.id = rc."syncRunId"
            AND sr.status IN ('done', 'failed', 'cancelled')
          WHERE rc.platform = 'INFOR_M3'
            AND rc."isComplete" = false
            AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
          LIMIT 10
        `;
        companies = rows.map((r) => r.companyId);
      }
    }

    if (companies.length === 0) {
      return NextResponse.json({ ok: true, ran: false, message: 'No companies with pending transforms found.' });
    }

    const maxDaysPerRun = 2;
    let totalProcessed = 0;
    let totalFailed = 0;
    let tickCount = 0;
    const allResults: Array<Record<string, unknown>> = [];
    const processedCompanyIds = new Set<string>();

    for (const companyId of companies) {
      while (tickCount < maxDaysPerRun) {
        tickCount += 1;
        try {
          const result = await processPendingInforRawTransforms({
            companyId,
            maxDaysPerTick: 1,
          });
          totalProcessed += result.processedDays;
          totalFailed += result.failedDays;
          if (result.results.some((row) => row.ok)) {
            processedCompanyIds.add(companyId);
          }
          if (result.processedDays === 0 && result.failedDays === 0) break;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          allResults.push({ companyId, ok: false, error: message.slice(0, 500) });
          break;
        }
      }
      allResults.push({
        companyId,
        ok: true,
        processedDays: totalProcessed,
        failedDays: totalFailed,
      });
    }

    const warmupResults: Array<Record<string, unknown>> = [];
    if (cronSecret && processedCompanyIds.size > 0) {
      for (const companyId of processedCompanyIds) {
        try {
          const hasPendingTransforms = await hasPendingInforTransformsForCompany(prisma, companyId);
          if (hasPendingTransforms) {
            warmupResults.push({
              companyId,
              ok: true,
              skipped: true,
              reason: 'pending_transforms_remaining',
            });
            continue;
          }
          warmupResults.push(await warmReportCachesForCompany({
            prisma,
            origin: request.nextUrl.origin,
            cronSecret,
            companyId,
          }));
        } catch (error) {
          warmupResults.push({
            companyId,
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown warmup error',
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ran: true,
      companies: companies.length,
      tickCount,
      totalProcessed,
      totalFailed,
      warmupResults,
      elapsedMs: Date.now() - startedAt,
      results: allResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: 'Failed to process pending Infor transform cron tick.', details: message, elapsedMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
