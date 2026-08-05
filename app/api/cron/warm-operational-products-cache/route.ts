import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

function dateKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET is required' }, { status: 500 });
  }

  const companyId =
    String(request.nextUrl.searchParams.get('companyId') || '').trim() || ATLANTIC_PRECISION_COMPANY_ID;

  // Match Ops defaults: endDate=yesterday, startDate=endDate-90, frequency=daily, limit=all.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);

  const params = new URLSearchParams({
    companyId,
    type: 'products',
    frequency: 'daily',
    startDate: dateKeyUtc(start),
    endDate: dateKeyUtc(end),
    limit: 'all',
    cacheWarmup: '1',
  });

  const url = new URL(`/api/operational-data?${params.toString()}`, request.nextUrl.origin);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: cronSecret ? { authorization: `Bearer ${cronSecret}` } : {},
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        companyId,
        status: response.status,
        error: payload?.error || payload?.message || 'Warmup failed',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    companyId,
    warmed: { type: 'products', frequency: 'daily', startDate: params.get('startDate'), endDate: params.get('endDate'), limit: 'all' },
  });
}

