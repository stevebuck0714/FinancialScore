import {
  claimNextIndustryBriefJob,
  completeIndustryBriefJob,
  failIndustryBriefJob,
  type IndustryBriefJob,
} from '@/lib/industry-brief/jobs';
import { generateAndCacheDailyIndustryBrief } from '@/lib/industry-brief/service';

export type IndustryBriefJobProcessResult = {
  processed: number;
  completed: number;
  failed: number;
  jobs: Array<{
    id: string;
    companyId: string;
    status: 'done' | 'failed';
    error?: string;
  }>;
};

async function processOne(job: IndustryBriefJob): Promise<IndustryBriefJobProcessResult['jobs'][number]> {
  try {
    const brief = await generateAndCacheDailyIndustryBrief({
      companyId: job.companyId,
    });
    await completeIndustryBriefJob(job, {
      generatedAt: brief.generatedAt,
      briefDate: brief.briefDate,
      source: job.source,
    });
    return { id: job.id, companyId: job.companyId, status: 'done' };
  } catch (error) {
    await failIndustryBriefJob(job, error);
    return {
      id: job.id,
      companyId: job.companyId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function processIndustryBriefJobs(limit = 1): Promise<IndustryBriefJobProcessResult> {
  const jobs: IndustryBriefJobProcessResult['jobs'] = [];
  const max = Math.max(1, Math.min(5, Math.floor(limit)));
  for (let index = 0; index < max; index += 1) {
    const job = await claimNextIndustryBriefJob();
    if (!job) break;
    jobs.push(await processOne(job));
  }
  return {
    processed: jobs.length,
    completed: jobs.filter((job) => job.status === 'done').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    jobs,
  };
}
