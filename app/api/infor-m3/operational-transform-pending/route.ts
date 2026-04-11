import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function POST(request: NextRequest) {
  try {
    const { requireSiteAdminAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
    const prisma = (await import('@/lib/prisma')).default;
    const { processPendingInforRawTransforms } = await import('@/lib/infor-m3/operational-sync');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const maxDaysPerTick = Math.min(50, asPositiveInt(body.maxDaysPerTick, 25));
    const maxTicks = Math.min(20, asPositiveInt(body.maxTicks, 6));
    const startedAt = Date.now();
    const hardStopMs = 270_000;

    let ticksRun = 0;
    let processedDays = 0;
    let failedDays = 0;
    const results: Array<{ companyId: string; syncRunId: string; businessDateIso: string; ok: boolean; errors: string[] }> = [];

    while (ticksRun < maxTicks && Date.now() - startedAt < hardStopMs) {
      const tick = await processPendingInforRawTransforms({
        companyId,
        maxDaysPerTick,
      });
      ticksRun += 1;
      processedDays += tick.processedDays;
      failedDays += tick.failedDays;
      if (tick.results.length > 0) {
        results.push(...tick.results);
      }
      // No more transform work ready for this company.
      if (tick.results.length === 0) break;
    }

    const pendingRows = await prisma.$queryRaw<Array<{ pending: number }>>`
      SELECT COUNT(*)::int AS pending
      FROM (
        SELECT rc."syncRunId", rc."businessDate"
        FROM "InforRawCompleteness" rc
        INNER JOIN "InforSyncRun" sr
          ON sr.id = rc."syncRunId"
          AND sr.status = 'done'
        WHERE rc.platform = 'INFOR_M3'
          AND rc."companyId" = ${companyId}
          AND rc."isComplete" = false
          AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
        GROUP BY rc."syncRunId", rc."businessDate"
      ) q
    `;
    const pendingRemaining = Number(pendingRows[0]?.pending || 0);

    return NextResponse.json({
      ok: true,
      companyId,
      ticksRun,
      maxTicks,
      maxDaysPerTick,
      processedDays,
      failedDays,
      pendingRemaining,
      done: pendingRemaining === 0,
      elapsedMs: Date.now() - startedAt,
      sample: results.slice(0, 50),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to process pending Infor raw transforms.',
        details: message,
      },
      { status }
    );
  }
}

