import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { runOperationalSyncRequest } from '@/lib/infor-m3/operational-sync-handler';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Thin HTTP wrapper around runOperationalSyncRequest.
 *
 * The actual sync logic lives in lib/infor-m3/operational-sync-handler.ts so it
 * can also be invoked in-process by the Render background worker
 * (lib/workers/sync-drain.ts -> lib/infor-m3/sync-queue.ts) without an HTTP
 * round-trip and without Vercel's 300s maxDuration cap.
 *
 * Auth: this route enforces site-admin + company access. The in-process worker
 * relies on the queue's worker secret and the trusted companyId stored on the
 * InforSyncTask row instead.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const { status, body: responseBody } = await runOperationalSyncRequest(body, companyId);
    return NextResponse.json(responseBody, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to run Infor M3 operational sync',
        details: message,
      },
      { status }
    );
  }
}
