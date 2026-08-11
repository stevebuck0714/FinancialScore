import { NextRequest, NextResponse } from 'next/server';
import { runMorningSmoke } from '@/lib/morning-smoke';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
    const report = await runMorningSmoke({
      baseUrl: appBaseUrl(request),
      sendEmail: !skipEmail,
    });

    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Morning smoke cron failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: message || 'Morning smoke cron failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
