import { NextRequest, NextResponse } from 'next/server';
import { syncLatestEstEodRates, listActiveCurrencyPairs, backfillCurrencyPair } from '@/lib/fx';

/**
 * Daily FX EOD cron — queued on EST calendar.
 * Vercel schedule is UTC; default 11:15 UTC ≈ 06:15 EST / 07:15 EDT.
 * Loads Frankfurter rates for the prior America/New_York calendar day.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backfill = request.nextUrl.searchParams.get('backfill') === 'true';
    if (backfill) {
      const pairs = await listActiveCurrencyPairs();
      const results = [];
      for (const pair of pairs) {
        results.push(await backfillCurrencyPair(pair.fromCurrency, pair.toCurrency));
      }
      return NextResponse.json({
        success: true,
        mode: 'backfill',
        pairs: pairs.length,
        results,
      });
    }

    const result = await syncLatestEstEodRates();
    return NextResponse.json({
      success: result.errors.length === 0,
      mode: 'daily_eod_est',
      timezone: 'America/New_York',
      ...result,
    });
  } catch (error: any) {
    console.error('FX EOD cron failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
