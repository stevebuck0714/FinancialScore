import { NextRequest, NextResponse } from 'next/server';
import { runDataLoadWatchdog } from '@/lib/data-load-watchdog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim() || undefined;
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const result = await runDataLoadWatchdog({ companyId, limit });
    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Data load watchdog failed:', error);
    return NextResponse.json(
      { ok: false, error: String(error?.message || error || 'Data load watchdog failed') },
      { status: 500 },
    );
  }
}
