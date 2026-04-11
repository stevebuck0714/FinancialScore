import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const { requireSiteAdminAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const { processPendingInforRawTransforms } = await import('@/lib/infor-m3/operational-sync');

    const hardStopMs = 270_000;
    let totalProcessed = 0;
    let totalFailed = 0;
    let tickCount = 0;

    while (Date.now() - startedAt < hardStopMs) {
      tickCount += 1;
      const result = await processPendingInforRawTransforms({
        companyId,
        maxDaysPerTick: 1,
      });
      totalProcessed += result.processedDays;
      totalFailed += result.failedDays;
      if (result.processedDays === 0 && result.failedDays === 0) break;
    }

    return NextResponse.json({
      ok: true,
      companyId,
      tickCount,
      totalProcessed,
      totalFailed,
      elapsedMs: Date.now() - startedAt,
      done: totalProcessed === 0 && totalFailed === 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message, elapsedMs: Date.now() - startedAt },
      { status }
    );
  }
}
