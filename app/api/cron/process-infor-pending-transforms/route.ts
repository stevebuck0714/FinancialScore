import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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

    const maxDaysPerRun = 10;
    let totalProcessed = 0;
    let totalFailed = 0;
    let tickCount = 0;
    const allResults: Array<Record<string, unknown>> = [];

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

    return NextResponse.json({
      ok: true,
      ran: true,
      companies: companies.length,
      tickCount,
      totalProcessed,
      totalFailed,
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
