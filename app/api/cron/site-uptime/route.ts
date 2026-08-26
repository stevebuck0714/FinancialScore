import { NextRequest, NextResponse } from 'next/server';
import { runSiteUptime } from '@/lib/site-uptime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

function appBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    request.nextUrl.origin ||
    ''
  ).replace(/\/+$/, '');
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const skipEmail = request.nextUrl.searchParams.get('skipEmail') === 'true';
    const report = await runSiteUptime({
      baseUrl: appBaseUrl(request),
      sendEmail: !skipEmail,
    });
    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Site uptime cron failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: message || 'Site uptime cron failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
