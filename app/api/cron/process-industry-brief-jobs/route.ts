import { NextRequest, NextResponse } from 'next/server';
import { processIndustryBriefJobs } from '@/lib/industry-brief/job-processor';

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
  const limit = Number(request.nextUrl.searchParams.get('limit') || 1);
  const result = await processIndustryBriefJobs(limit);
  return NextResponse.json({ ok: true, ...result });
}
