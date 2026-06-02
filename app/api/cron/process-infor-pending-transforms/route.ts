import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPERATIONAL_REPORT_MIN_DATE = '2024-01-01';

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

function yesterdayIsoUtc(): string {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

function defaultProductsStartIsoUtc(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate() - 1));
  const startDate = start.toISOString().slice(0, 10);
  return startDate < OPERATIONAL_REPORT_MIN_DATE ? OPERATIONAL_REPORT_MIN_DATE : startDate;
}

async function fetchProductCacheWarmup(params: {
  origin: string;
  cronSecret: string;
  companyId: string;
  startDate: string;
  endDate: string;
  limit: string;
  refreshWholesaleProducts?: boolean;
}): Promise<any> {
  const url = new URL('/api/operational-data', params.origin);
  url.searchParams.set('companyId', params.companyId);
  url.searchParams.set('type', 'products');
  url.searchParams.set('frequency', 'daily');
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  url.searchParams.set('limit', params.limit);
  url.searchParams.set('sectorCategory', '42');
  url.searchParams.set('cacheWarmup', '1');
  if (params.refreshWholesaleProducts) {
    url.searchParams.set('refreshWholesaleProducts', '1');
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
    records: Array.isArray(payload?.records) ? payload.records.length : null,
    wholesaleOrderLines: Array.isArray(payload?.summary?.wholesaleOrderLines)
      ? payload.summary.wholesaleOrderLines.length
      : null,
    wholesaleVendorPricingRows: Array.isArray(payload?.summary?.wholesaleVendorPricingRows)
      ? payload.summary.wholesaleVendorPricingRows.length
      : null,
  };
}

async function warmWholesaleProductCachesForCompany(params: {
  prisma: any;
  origin: string;
  cronSecret: string;
  companyId: string;
}): Promise<Record<string, unknown>> {
  const company = await params.prisma.company.findUnique({
    where: { id: params.companyId },
    select: { industrySectorCategory: true },
  });

  if (String(company?.industrySectorCategory || '').trim() !== '42') {
    return {
      companyId: params.companyId,
      ok: true,
      skipped: true,
      reason: 'not_wholesale_trade',
    };
  }

  const endDate = yesterdayIsoUtc();
  const wholesaleReport = await fetchProductCacheWarmup({
    origin: params.origin,
    cronSecret: params.cronSecret,
    companyId: params.companyId,
    startDate: OPERATIONAL_REPORT_MIN_DATE,
    endDate,
    limit: '5000',
    refreshWholesaleProducts: true,
  });
  const performanceProducts = await fetchProductCacheWarmup({
    origin: params.origin,
    cronSecret: params.cronSecret,
    companyId: params.companyId,
    startDate: defaultProductsStartIsoUtc(),
    endDate,
    limit: '500',
  });

  return {
    companyId: params.companyId,
    ok: Boolean(wholesaleReport?.ok && performanceProducts?.ok),
    wholesaleReport,
    performanceProducts,
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
          warmupResults.push(await warmWholesaleProductCachesForCompany({
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
