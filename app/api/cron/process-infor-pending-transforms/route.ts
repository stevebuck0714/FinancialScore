import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authHeader = String(request.headers.get('authorization') || '').trim();
    const authorizedByCronSecret = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    let authorizedBySession = false;
    if (!authorizedByCronSecret) {
      try {
        const { requireAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
        const companyOverride = String(request.nextUrl.searchParams.get('companyId') || '').trim();
        if (companyOverride) {
          await requireAuthorizedInforCompany(request, { companyId: companyOverride });
          authorizedBySession = true;
        }
      } catch {
        authorizedBySession = false;
      }
    }
    if (!authorizedByCronSecret && !authorizedBySession) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
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
            AND sr.status = 'done'
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

    const startedAt = Date.now();
    const hardStopMs = 270_000;
    const allResults: Array<Record<string, unknown>> = [];

    for (const companyId of companies) {
      if (Date.now() - startedAt > hardStopMs) {
        allResults.push({ companyId, skipped: true, reason: 'timeBudget' });
        break;
      }

      try {
        const result = await processPendingInforRawTransforms({
          companyId,
          maxDaysPerTick: 1,
        });
        allResults.push({
          companyId,
          ok: true,
          processedDays: result.processedDays,
          failedDays: result.failedDays,
          results: result.results.slice(0, 10),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        allResults.push({ companyId, ok: false, error: message.slice(0, 500) });
      }
    }

    return NextResponse.json({
      ok: true,
      ran: true,
      companies: companies.length,
      elapsedMs: Date.now() - startedAt,
      results: allResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: 'Failed to process pending Infor transform cron tick.', details: message },
      { status: 500 }
    );
  }
}
