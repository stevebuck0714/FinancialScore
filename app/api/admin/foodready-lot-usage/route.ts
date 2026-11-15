import { NextRequest, NextResponse } from 'next/server';
import { pullFoodReadyLotUsage } from '@/lib/operational-data/sources/foodready';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/foodready-lot-usage
 *
 * Body: { companyId: string }
 * Auth: header `x-cron-secret: $CRON_SECRET`. Started by the FoodReady sync after it stores its rows.
 */
export async function POST(request: NextRequest) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  const provided = String(request.headers.get('x-cron-secret') || '').trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = String(body.companyId || '').trim();
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  try {
    const result = await pullFoodReadyLotUsage(companyId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Lot usage pull failed' }, { status: 500 });
  }
}
