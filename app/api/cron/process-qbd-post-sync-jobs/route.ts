import { NextRequest, NextResponse } from 'next/server';
import { processQuickBooksDesktopPostSyncJobs } from '@/lib/quickbooks-desktop/post-sync-jobs';

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim() || undefined;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 3), 1), 10);
  const result = await processQuickBooksDesktopPostSyncJobs(limit, companyId);
  return NextResponse.json({ ok: true, ...result });
}
