import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';
import { requireSiteAdmin } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

type StatusRow = {
  status: string | null;
  recordsImported: number | null;
  errorCount: number | null;
  createdAt: Date;
};

export async function GET(request: NextRequest) {
  try {
    await requireSiteAdmin();
    const companyId = getRequestedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });
    }
    const syncRunId = String(request.nextUrl.searchParams.get('syncRunId') || '').trim();
    if (!syncRunId) {
      return NextResponse.json({ error: 'syncRunId is required.' }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<StatusRow[]>`
      SELECT
        status,
        "recordsImported",
        "errorCount",
        "createdAt"
      FROM "ApiSyncLog"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
        AND ("errorDetails"->>'syncRunId') = ${syncRunId}
      ORDER BY "createdAt" DESC
      LIMIT 500
    `;

    const chunkCount = rows.length;
    const recordsCreated = rows.reduce((sum, row) => sum + Number(row.recordsImported || 0), 0);
    const warningCount = rows.reduce((sum, row) => sum + Number(row.errorCount || 0), 0);
    const lastRow = rows[0];
    const lastChunkAt = lastRow?.createdAt ? new Date(lastRow.createdAt).toISOString() : null;
    const lastStatusText = lastRow?.status ? String(lastRow.status) : null;
    const recentlyActive =
      typeof lastChunkAt === 'string' && Date.now() - new Date(lastChunkAt).getTime() <= 3 * 60 * 1000;

    return NextResponse.json({
      ok: true,
      companyId,
      syncRunId,
      chunkCount,
      recordsCreated,
      warningCount,
      lastChunkAt,
      lastStatusText,
      recentlyActive,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to read Infor M3 sync status',
        details: message,
      },
      { status }
    );
  }
}
