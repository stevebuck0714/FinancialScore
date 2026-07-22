import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  INDUSTRY_BRIEF_DATA_VERSION,
  readCachedIndustryBrief,
} from '@/lib/industry-brief/cache';
import { enqueueIndustryBriefJob, getIndustryBriefJob } from '@/lib/industry-brief/jobs';
import { processIndustryBriefJobForCompany } from '@/lib/industry-brief/job-processor';
import { loadIndustryBriefCompany } from '@/lib/industry-brief/service';
import { warmDailyIndustryBriefCache } from '@/lib/industry-brief/warmup';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authHeader = String(request.headers.get('authorization') || '').trim();
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function GET(request: NextRequest) {
  try {
    const authorizedByCron = isCronAuthorized(request);
    if (!authorizedByCron) {
      await requireAuth();
    }
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const refreshStatus = request.nextUrl.searchParams.get('refreshStatus') === 'true';
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    if (!authorizedByCron) {
      const allowed = await validateCompanyAccess(companyId);
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (!force && !refreshStatus) {
      const cached = await readCachedIndustryBrief(companyId);
      if (cached) return NextResponse.json(cached);
    }

    try {
      await loadIndustryBriefCompany(companyId);
    } catch (companyError) {
      const message = companyError instanceof Error ? companyError.message : String(companyError);
      return NextResponse.json(
        { error: message },
        { status: message === 'Company not found' ? 404 : 422 },
      );
    }

    if (!authorizedByCron && refreshStatus) {
      const existingJob = await getIndustryBriefJob(companyId).catch(() => null);
      if (existingJob?.status === 'failed') {
        return NextResponse.json(
          {
            status: 'failed',
            message: 'Daily Industry Brief refresh failed.',
            jobStatus: existingJob.status,
            attempts: existingJob.attemptCount,
            error: existingJob.errorMessage || 'Refresh failed.',
            dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
          },
          { status: 503 },
        );
      }
      if (existingJob?.status === 'queued' || existingJob?.status === 'running') {
        return NextResponse.json(
          {
            status: 'generating',
            message: 'Daily Industry Brief refresh is still running.',
            jobStatus: existingJob.status,
            attempts: existingJob.attemptCount,
            error: existingJob.errorMessage,
            dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
          },
          { status: 202 },
        );
      }
      const cached = await readCachedIndustryBrief(companyId);
      if (cached) return NextResponse.json(cached);
      return NextResponse.json(
        {
          status: 'generating',
          message: 'Daily Industry Brief refresh is queued or waiting for cached output.',
          jobStatus: existingJob?.status || null,
          dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
        },
        { status: 202 },
      );
    }

    if (!authorizedByCron && force) {
      const job = await enqueueIndustryBriefJob({
        companyId,
        source: 'industry-brief-manual-refresh',
        requeueDone: true,
        forceSources: true,
      });
      processIndustryBriefJobForCompany(companyId).catch((error) => {
        console.warn('Daily Industry Brief manual refresh processor kick failed:', {
          companyId,
          error: String(error?.message || error).slice(0, 500),
        });
      });
      return NextResponse.json(
        {
          status: 'generating',
          message: 'Daily Industry Brief refresh is running in the background. The current cached brief will remain available until refresh completes.',
          jobStatus: job.status,
          attempts: job.attemptCount,
          error: job.errorMessage,
          dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
        },
        { status: 202 },
      );
    }

    if (!force && !authorizedByCron) {
      const existingJob = await getIndustryBriefJob(companyId).catch(() => null);
      if (existingJob?.status === 'failed') {
        return NextResponse.json(
          {
            status: 'failed',
            message: 'Daily Industry Brief generation failed.',
            jobStatus: existingJob.status,
            attempts: existingJob.attemptCount,
            error: existingJob.errorMessage || 'Generation failed.',
            dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
          },
          { status: 503 },
        );
      }
      const job = await enqueueIndustryBriefJob({
        companyId,
        source: 'industry-brief-cache-miss',
      });
      processIndustryBriefJobForCompany(companyId).catch((error) => {
        console.warn('Daily Industry Brief same-company processor kick failed:', {
          companyId,
          error: String(error?.message || error).slice(0, 500),
        });
      });
      return NextResponse.json(
        {
          status: 'generating',
          message: 'Daily Industry Brief is being generated from live sources. Please check again shortly.',
          jobStatus: job.status,
          attempts: job.attemptCount,
          error: job.errorMessage,
          dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
        },
        { status: 202 },
      );
    }

    try {
      const warmup = await warmDailyIndustryBriefCache({
        companyId,
        force,
        source: authorizedByCron ? 'industry-brief-cron-force' : 'industry-brief-force',
      });
      if (!warmup.ok) {
        return NextResponse.json(
          { error: warmup.error || 'Industry Brief unavailable: generation failed.' },
          { status: 503 },
        );
      }
      const cached = await readCachedIndustryBrief(companyId);
      if (cached) return NextResponse.json(cached);
      return NextResponse.json(
        { error: 'Industry Brief generation completed but cache was not available.' },
        { status: 503 },
      );
    } catch (aiError) {
      const aiMessage = aiError instanceof Error ? aiError.message : String(aiError);
      console.error('Daily Industry Brief AI synthesis failed.', {
        companyId,
        error: aiMessage,
      });
      const job = await getIndustryBriefJob(companyId).catch(() => null);
      return NextResponse.json(
        { error: aiMessage || 'Industry Brief unavailable: AI synthesis failed.', jobStatus: job?.status || null },
        { status: 503 },
      );
    }
  } catch (error: any) {
    const message = error?.message || 'Failed to load daily industry brief';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
