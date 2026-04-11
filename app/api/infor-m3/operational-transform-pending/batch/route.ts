import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let prisma: any;
  let transformInforM3RawRun: any;
  let Prisma: any;

  try {
    const { requireSiteAdminAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    prisma = (await import('@/lib/prisma')).default;
    const opSync = await import('@/lib/infor-m3/operational-sync');
    transformInforM3RawRun = opSync.transformInforM3RawRun;
    Prisma = (await import('@prisma/client')).Prisma;

    const hardStopMs = 260_000;
    const taskBudgetMs = 120_000;
    let totalProcessed = 0;
    let totalFailed = 0;
    let stoppedBy = 'drained';
    const sample: Array<Record<string, unknown>> = [];

    while (Date.now() - startedAt < hardStopMs) {
      if (Date.now() - startedAt + taskBudgetMs + 10_000 > hardStopMs) {
        stoppedBy = 'timeBudget';
        break;
      }

      const rows = await prisma.$queryRaw`
        SELECT
          rc."syncRunId",
          rc."businessDate",
          sr."frequency"
        FROM "InforRawCompleteness" rc
        INNER JOIN "InforSyncRun" sr
          ON sr.id = rc."syncRunId"
          AND sr.status IN ('done', 'failed', 'cancelled')
        WHERE rc.platform = 'INFOR_M3'
          AND rc."companyId" = ${companyId}
          AND rc."isComplete" = false
          AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
        GROUP BY rc."syncRunId", rc."businessDate", sr."frequency"
        ORDER BY rc."businessDate" ASC
        LIMIT 1
      `;

      if (!rows || rows.length === 0) {
        stoppedBy = 'drained';
        break;
      }

      const row = rows[0] as { syncRunId: string; businessDate: Date; frequency: string | null };
      const businessDateIso = new Date(row.businessDate).toISOString().slice(0, 10);
      const freqRaw = String(row.frequency || '').trim().toLowerCase();
      const frequency = freqRaw === 'weekly' ? 'weekly' : freqRaw === 'monthly' ? 'monthly' : 'daily';

      try {
        const result = await transformInforM3RawRun({
          companyId,
          syncRunId: String(row.syncRunId),
          frequency,
          businessDateIso,
          maxBusinessDates: 1,
          batchSize: 5,
        });

        if (result.success) {
          totalProcessed += 1;
          sample.push({ date: businessDateIso, ok: true, records: result.recordsCreated });
        } else {
          totalFailed += 1;
          sample.push({ date: businessDateIso, ok: false, errors: result.errors?.slice(0, 2) });
        }
      } catch (err) {
        totalFailed += 1;
        sample.push({ date: businessDateIso, ok: false, error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' });
      }
    }

    return NextResponse.json({
      ok: true,
      companyId,
      totalProcessed,
      totalFailed,
      stoppedBy,
      elapsedMs: Date.now() - startedAt,
      done: totalProcessed === 0 && totalFailed === 0 && stoppedBy === 'drained',
      sample: sample.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message.slice(0, 500), elapsedMs: Date.now() - startedAt },
      { status }
    );
  }
}
