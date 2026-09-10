import { NextRequest, NextResponse } from 'next/server';

import { parseHistoricalRebuildRange } from '@/lib/infor-m3/historical-rebuild';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { enqueueApHistoryRebuildRun, isInforSyncQueueEnabled } from '@/lib/infor-m3/sync-queue';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
    if (!company || !['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase())) {
      return NextResponse.json({ ok: false, error: 'Targeted ledger rebuilds are available only for Infor M3/CSI companies.' }, { status: 400 });
    }
    if (body.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Explicit confirmation is required to queue an AP history rebuild.' },
        { status: 400 },
      );
    }
    const site = String(body.site || '').trim();
    if (!site) return NextResponse.json({ ok: false, error: 'CSI site is required.' }, { status: 400 });
    const range = parseHistoricalRebuildRange(body);
    if (!isInforSyncQueueEnabled()) {
      return NextResponse.json(
        { ok: false, error: 'The Infor production queue is not enabled; rebuild was not queued.' },
        { status: 409 },
      );
    }
    const run = await enqueueApHistoryRebuildRun({
      companyId, site, startDate: range.startDate, endDate: range.endDate, workerBaseUrl: request.nextUrl.origin,
    });
    return NextResponse.json({
      ok: true, companyId, run,
      message: run.status === 'queued'
        ? 'AP rebuild queued behind an active Infor run.'
        : `AP rebuild queued for ${range.startDateIso} through ${range.endDateIso}.`,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    const status = details.includes('Unauthorized') ? 401 : details.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: 'Failed to queue AP history rebuild.', details },
      { status: /startDate|endDate|calendar date|Date range/.test(details) ? 400 : status },
    );
  }
}
