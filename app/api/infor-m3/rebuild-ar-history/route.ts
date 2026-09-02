import { NextRequest, NextResponse } from 'next/server';

import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { enqueueArHistoryRebuildRun, isInforSyncQueueEnabled } from '@/lib/infor-m3/sync-queue';

export const dynamic = 'force-dynamic';

const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    if (companyId !== ATLANTIC_PRECISION_COMPANY_ID) {
      return NextResponse.json(
        { ok: false, error: 'This controlled AR history rebuild is currently limited to Atlantic Precision.' },
        { status: 403 },
      );
    }
    if (body.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Explicit confirmation is required to queue the Atlantic AR history rebuild.' },
        { status: 400 },
      );
    }
    const site = String(body.site || '').trim();
    if (!site) {
      return NextResponse.json({ ok: false, error: 'CSI site is required.' }, { status: 400 });
    }
    if (!isInforSyncQueueEnabled()) {
      return NextResponse.json(
        { ok: false, error: 'The Infor production queue is not enabled; rebuild was not queued.' },
        { status: 409 },
      );
    }

    const run = await enqueueArHistoryRebuildRun({
      companyId,
      site,
      workerBaseUrl: request.nextUrl.origin,
    });
    return NextResponse.json({
      ok: true,
      companyId,
      run,
      message:
        run.status === 'queued'
          ? 'Atlantic AR rebuild queued behind an active Infor run.'
          : 'Atlantic AR rebuild queued for the production worker.',
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    const status = details.includes('Unauthorized') ? 401 : details.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: 'Failed to queue Atlantic AR history rebuild.', details },
      { status },
    );
  }
}
