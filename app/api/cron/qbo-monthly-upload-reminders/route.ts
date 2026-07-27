import { NextRequest, NextResponse } from 'next/server';
import { runQboMonthlyUploadReminders } from '@/lib/qbo-monthly-upload-reminders';

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
  const startedAt = Date.now();
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim() || undefined;
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const resend = request.nextUrl.searchParams.get('resend') === 'true';
    const baseUrl = appBaseUrl(request);

    const result = await runQboMonthlyUploadReminders({
      companyId,
      dryRun,
      force,
      resend,
      uploadUrl: baseUrl || undefined,
    });

    return NextResponse.json({
      ...result,
      duration: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('QBO monthly upload reminder cron failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message || error || 'QBO monthly upload reminder cron failed'),
        duration: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
