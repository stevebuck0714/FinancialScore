import { enqueueIndustryBriefJob, completeIndustryBriefJob, failIndustryBriefJob } from '@/lib/industry-brief/jobs';
import { generateAndCacheDailyIndustryBrief } from '@/lib/industry-brief/service';

type WarmDailyIndustryBriefOptions = {
  companyId: string;
  baseUrl?: string | null;
  force?: boolean;
  source?: string;
  timeoutMs?: number;
};

export type WarmDailyIndustryBriefResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  status?: number;
};

export async function warmDailyIndustryBriefCache(
  options: WarmDailyIndustryBriefOptions,
): Promise<WarmDailyIndustryBriefResult> {
  const companyId = String(options.companyId || '').trim();
  if (!companyId) return { ok: false, error: 'companyId is required' };

  const job = await enqueueIndustryBriefJob({
    companyId,
    source: options.source || 'daily-industry-brief-warmup',
  });
  try {
    const brief = await generateAndCacheDailyIndustryBrief({
      companyId,
      forceSources: options.force === true,
    });
    await completeIndustryBriefJob(job, {
      generatedAt: brief.generatedAt,
      briefDate: brief.briefDate,
      source: options.source || 'daily-industry-brief-warmup',
    });
    return { ok: true, status: 200 };
  } catch (error) {
    await failIndustryBriefJob(job, error).catch(() => undefined);
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
