import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { industryBriefDateKey } from '@/lib/industry-brief/cache';
import { enqueueIndustryBriefJob } from '@/lib/industry-brief/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type CompanyRow = {
  id: string;
};

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
  const limit = Math.floor(Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 250), 1), 500));
  const force = request.nextUrl.searchParams.get('force') === 'true';
  const briefDate = industryBriefDateKey();

  const companies = await prisma.$queryRawUnsafe<CompanyRow[]>(
    `SELECT "id"
     FROM "Company"
     WHERE ($1::text = '' OR "id" = $1)
       AND COALESCE(NULLIF(TRIM("industrySectorCategory"), ''), '') <> ''
       AND COALESCE(NULLIF(TRIM("addressCity"), ''), '') <> ''
       AND COALESCE(NULLIF(TRIM("addressState"), ''), '') <> ''
       AND COALESCE("subscriptionStatus", 'active') <> 'cancelled'
     ORDER BY "id" ASC
     LIMIT $2`,
    companyId,
    limit,
  );

  const results = [];
  for (const company of companies) {
    try {
      const job = await enqueueIndustryBriefJob({
        companyId: company.id,
        briefDate,
        source: 'daily-industry-brief-scheduled',
        requeueDone: force,
      });
      results.push({
        companyId: company.id,
        ok: true,
        status: job.status,
        source: job.source,
      });
    } catch (error) {
      results.push({
        companyId: company.id,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return NextResponse.json({
    ok: failed === 0,
    briefDate,
    companiesMatched: companies.length,
    jobsEnqueued: results.filter((result) => result.ok && result.status === 'queued').length,
    jobsAlreadyDone: results.filter((result) => result.ok && result.status === 'done').length,
    jobsFailed: failed,
    results,
    duration: Date.now() - startedAt,
  });
}
