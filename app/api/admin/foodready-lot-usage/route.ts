import { NextRequest, NextResponse } from 'next/server';
import {
  pullFoodReadyLotUsage,
  scheduleFoodReadyLotUsagePull,
  type FoodReadyLotUsageCursor,
} from '@/lib/operational-data/sources/foodready';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/foodready-lot-usage
 *
 * Body: { companyId: string, cursor?: FoodReadyLotUsageCursor }
 * Auth: header `x-cron-secret: $CRON_SECRET`. Started by the FoodReady sync after it stores its rows;
 * when one request runs out of time it starts the next one with a cursor.
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
  const cursor = body.cursor && typeof body.cursor === 'object' ? (body.cursor as FoodReadyLotUsageCursor) : undefined;
  try {
    const result = await pullFoodReadyLotUsage(companyId, cursor);
    if (result.next) scheduleFoodReadyLotUsagePull(companyId, result.next, request.nextUrl.origin);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Lot usage pull failed' }, { status: 500 });
  }
}
