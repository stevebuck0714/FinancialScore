import { NextRequest, NextResponse } from 'next/server';
import {
  pullFoodReadyDomains,
  scheduleFoodReadyDomainPull,
  type FoodReadyDomainPullRequest,
} from '@/lib/operational-data/sources/foodready';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/foodready-domains
 *
 * Body: { companyId: string, request: FoodReadyDomainPullRequest }
 * Auth: header `x-cron-secret: $CRON_SECRET`. Started by the FoodReady sync for the domains it skipped
 * for time; when one request runs out of time it starts the next one with the domains left.
 */
export async function POST(request: NextRequest) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  const provided = String(request.headers.get('x-cron-secret') || '').trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = String(body.companyId || '').trim();
  const pull = body.request && typeof body.request === 'object' ? (body.request as FoodReadyDomainPullRequest) : null;
  const validWindow = Boolean(pull?.window && /^\d{4}-\d{2}-\d{2}$/.test(String(pull.window.startDate)) && /^\d{4}-\d{2}-\d{2}$/.test(String(pull.window.endDate)));
  if (!companyId || !pull || !Array.isArray(pull.endpoints) || !validWindow) {
    return NextResponse.json({ error: 'companyId and request { endpoints, window } are required' }, { status: 400 });
  }
  try {
    const result = await pullFoodReadyDomains(companyId, {
      endpoints: pull.endpoints.map(String),
      window: pull.window,
      step: Number(pull.step) || 1,
    });
    if (result.next) scheduleFoodReadyDomainPull(companyId, result.next, request.nextUrl.origin);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Domain pull failed' }, { status: 500 });
  }
}
