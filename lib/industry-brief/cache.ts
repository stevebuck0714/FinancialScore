import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import { collectIndustryBriefSources } from '@/lib/industry-brief/sources';
import type { DailyIndustryBrief, IndustryBriefSourceRecord } from '@/lib/industry-brief/types';

export const INDUSTRY_BRIEF_CACHE_NAMESPACE = 'daily-industry-brief';
export const INDUSTRY_BRIEF_DATA_VERSION = 'v10-durable-source-cache';
export const INDUSTRY_BRIEF_CACHE_TTL_SECONDS = 6 * 60 * 60;

const SOURCE_CACHE_NAMESPACE = 'daily-industry-brief-sources';
const SOURCE_DATA_VERSION = 'v1-live-source-bundle';
const SOURCE_CACHE_TTL_SECONDS = 12 * 60 * 60;

export type IndustryBriefSourceContext = {
  name: string;
  industry: string;
  segment: string;
  location: string;
};

export type IndustryBriefSourceBundle = {
  collectedAt: string;
  context: IndustryBriefSourceContext;
  records: IndustryBriefSourceRecord[];
};

export function industryBriefDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function industryBriefCacheKey(companyId: string, dateKey = industryBriefDateKey()): string {
  return hashCacheParts([companyId, dateKey]);
}

function sourceCacheKey(companyId: string, dateKey = industryBriefDateKey()): string {
  return hashCacheParts([companyId, dateKey, 'sources']);
}

export async function readCachedIndustryBrief(companyId: string): Promise<DailyIndustryBrief | null> {
  return readDerivedApiCache<DailyIndustryBrief>({
    namespace: INDUSTRY_BRIEF_CACHE_NAMESPACE,
    cacheKey: industryBriefCacheKey(companyId),
    dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
  });
}

export async function writeCachedIndustryBrief(companyId: string, brief: DailyIndustryBrief): Promise<void> {
  await writeDerivedApiCache({
    namespace: INDUSTRY_BRIEF_CACHE_NAMESPACE,
    cacheKey: industryBriefCacheKey(companyId),
    dataVersion: INDUSTRY_BRIEF_DATA_VERSION,
    payload: brief,
    ttlSeconds: INDUSTRY_BRIEF_CACHE_TTL_SECONDS,
  });
}

export async function getCachedIndustryBriefSources(params: {
  companyId: string;
  context: IndustryBriefSourceContext;
  force?: boolean;
}): Promise<IndustryBriefSourceBundle> {
  const cacheKey = sourceCacheKey(params.companyId);
  if (!params.force) {
    const cached = await readDerivedApiCache<IndustryBriefSourceBundle>({
      namespace: SOURCE_CACHE_NAMESPACE,
      cacheKey,
      dataVersion: SOURCE_DATA_VERSION,
    });
    if (cached?.records?.length) return cached;
  }

  const records = await collectIndustryBriefSources(params.context);
  const bundle: IndustryBriefSourceBundle = {
    collectedAt: new Date().toISOString(),
    context: params.context,
    records,
  };
  await writeDerivedApiCache({
    namespace: SOURCE_CACHE_NAMESPACE,
    cacheKey,
    dataVersion: SOURCE_DATA_VERSION,
    payload: bundle,
    ttlSeconds: SOURCE_CACHE_TTL_SECONDS,
  });
  return bundle;
}
