import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { estimateCostBreakdownUsd } from '@/lib/ai-usage/pricing';

export const AI_USAGE_FEATURES = {
  ask_data: 'Ask Corelytics',
  ask_document: 'Ask Corelytics (documents)',
  period_review: 'Period Review',
  financial_score_insights: 'Corelytics Score insights',
  custom_reports: 'Custom Reports',
  exec_briefing: 'Executive Briefing',
  market_context: 'Market Context',
  web_research: 'Web Research',
  document_embeddings: 'Document indexing & search',
  industry_brief: 'Industry Brief',
  system_check: 'System checks',
  other: 'Other AI',
} as const;

export type AiUsageFeature = keyof typeof AI_USAGE_FEATURES;

/** System-generated or included usage: tracked for cost, never counted toward a customer's allowance. */
const NON_BILLABLE_FEATURES = new Set<AiUsageFeature>(['financial_score_insights', 'exec_briefing', 'industry_brief', 'system_check']);

export type AiUsageTag = {
  feature: AiUsageFeature;
  companyId?: string | null;
  userId?: string | null;
  route?: string;
  /** Set false for background runs (cron warmups) of an otherwise billable feature. */
  billable?: boolean;
};

export type AiUsageCounts = {
  requests: number;
  promptTokens: number;
  cachedPromptTokens: number;
  cacheWriteTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  /** Cost reported by the gateway/provider, when present. */
  reportedCostUsd: number | null;
};

export function emptyAiUsageCounts(): AiUsageCounts {
  return { requests: 0, promptTokens: 0, cachedPromptTokens: 0, cacheWriteTokens: 0, completionTokens: 0, reasoningTokens: 0, reportedCostUsd: null };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function reportedCost(usage: Record<string, any>, body?: Record<string, any> | null): number | null {
  const candidates = [
    usage?.cost,
    usage?.cost?.total_cost,
    body?.providerMetadata?.gateway?.cost,
    body?.provider_metadata?.gateway?.cost,
  ];
  for (const value of candidates) {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** Reads Chat Completions, Responses API, Perplexity and embeddings usage blocks. */
export function usageFromResponse(body: unknown): AiUsageCounts | null {
  const record = body && typeof body === 'object' ? (body as Record<string, any>) : null;
  const usage = record?.usage && typeof record.usage === 'object' ? (record.usage as Record<string, any>) : null;
  if (!usage) return null;
  const isResponsesApi = usage.input_tokens !== undefined || usage.output_tokens !== undefined;
  const promptDetails = (isResponsesApi ? usage.input_tokens_details : usage.prompt_tokens_details) || {};
  const completionDetails = (isResponsesApi ? usage.output_tokens_details : usage.completion_tokens_details) || {};
  return {
    requests: 1,
    promptTokens: num(isResponsesApi ? usage.input_tokens : usage.prompt_tokens),
    cachedPromptTokens: num(promptDetails.cached_tokens),
    cacheWriteTokens: num(promptDetails.cache_write_tokens ?? usage.cache_creation_input_tokens),
    completionTokens: num(isResponsesApi ? usage.output_tokens : usage.completion_tokens),
    reasoningTokens: num(completionDetails.reasoning_tokens),
    reportedCostUsd: reportedCost(usage, record),
  };
}

export function addAiUsageCounts(target: AiUsageCounts, add: AiUsageCounts | null): AiUsageCounts {
  if (!add) return target;
  target.requests += add.requests;
  target.promptTokens += add.promptTokens;
  target.cachedPromptTokens += add.cachedPromptTokens;
  target.cacheWriteTokens += add.cacheWriteTokens;
  target.completionTokens += add.completionTokens;
  target.reasoningTokens += add.reasoningTokens;
  if (add.reportedCostUsd !== null) target.reportedCostUsd = (target.reportedCostUsd ?? 0) + add.reportedCostUsd;
  return target;
}

let ensurePromise: Promise<void> | null = null;

export async function ensureAiUsageTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT,
          "userId" TEXT,
          "feature" TEXT NOT NULL,
          "route" TEXT,
          "model" TEXT NOT NULL,
          "outcome" TEXT NOT NULL,
          "billable" BOOLEAN NOT NULL,
          "requests" INTEGER NOT NULL,
          "promptTokens" INTEGER NOT NULL,
          "cachedPromptTokens" INTEGER NOT NULL,
          "cacheWriteTokens" INTEGER NOT NULL,
          "completionTokens" INTEGER NOT NULL,
          "reasoningTokens" INTEGER NOT NULL,
          "totalTokens" INTEGER NOT NULL,
          "costUsd" DOUBLE PRECISION,
          "costSource" TEXT,
          "metadata" JSONB,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AiUsageEvent_company_created_idx"
        ON "AiUsageEvent"("companyId", "createdAt")
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AiUsageEvent"
        ADD COLUMN IF NOT EXISTS "inputCostUsd" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "outputCostUsd" DOUBLE PRECISION
      `);
      await backfillAiUsageCostBreakdowns();
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

function splitUsageCost(params: {
  model: string;
  promptTokens: number;
  cachedPromptTokens: number;
  cacheWriteTokens: number;
  completionTokens: number;
  costUsd: number | null;
}): { inputCostUsd: number; outputCostUsd: number } | null {
  const counts = {
    promptTokens: params.promptTokens,
    cachedPromptTokens: params.cachedPromptTokens,
    cacheWriteTokens: params.cacheWriteTokens,
    completionTokens: params.completionTokens,
  };
  const estimated = estimateCostBreakdownUsd(params.model, counts);
  const estimatedTotal = estimated?.totalCostUsd ?? 0;
  if (estimated) {
    const scale = params.costUsd !== null && estimatedTotal > 0 ? params.costUsd / estimatedTotal : 1;
    return {
      inputCostUsd: estimated.inputCostUsd * scale,
      outputCostUsd: estimated.outputCostUsd * scale,
    };
  }
  const totalTokens = params.promptTokens + params.completionTokens;
  if (params.costUsd === null || totalTokens <= 0) return null;
  return {
    inputCostUsd: params.costUsd * (params.promptTokens / totalTokens),
    outputCostUsd: params.costUsd * (params.completionTokens / totalTokens),
  };
}

async function backfillAiUsageCostBreakdowns(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    model: string;
    promptTokens: number;
    cachedPromptTokens: number;
    cacheWriteTokens: number;
    completionTokens: number;
    costUsd: number | null;
  }>>`
    SELECT "id", "model", "promptTokens", "cachedPromptTokens", "cacheWriteTokens", "completionTokens", "costUsd"
    FROM "AiUsageEvent"
    WHERE "costUsd" IS NOT NULL
      AND ("inputCostUsd" IS NULL OR "outputCostUsd" IS NULL)
  `;
  for (const row of rows) {
    const split = splitUsageCost({
      model: row.model,
      promptTokens: Number(row.promptTokens || 0),
      cachedPromptTokens: Number(row.cachedPromptTokens || 0),
      cacheWriteTokens: Number(row.cacheWriteTokens || 0),
      completionTokens: Number(row.completionTokens || 0),
      costUsd: row.costUsd === null ? null : Number(row.costUsd),
    });
    if (!split) continue;
    await prisma.$executeRaw`
      UPDATE "AiUsageEvent"
      SET "inputCostUsd" = ${split.inputCostUsd}, "outputCostUsd" = ${split.outputCostUsd}
      WHERE "id" = ${row.id}
    `;
  }
}

/**
 * Records one AI interaction (all model requests it made). Never throws; prompt and answer
 * text are never stored. Failed interactions are tracked for cost but are not billable.
 */
export async function recordAiUsage(params: {
  tag: AiUsageTag;
  model: string;
  outcome: string;
  counts: AiUsageCounts;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { tag, model, outcome, counts } = params;
  if (counts.requests === 0) return;
  try {
    const billable =
      Boolean(tag.companyId) && !NON_BILLABLE_FEATURES.has(tag.feature) && tag.billable !== false && outcome === 'ok';
    const estimated = estimateCostBreakdownUsd(model, counts);
    const costUsd = counts.reportedCostUsd ?? estimated?.totalCostUsd ?? null;
    const costSource = counts.reportedCostUsd !== null ? 'reported' : estimated !== null ? 'price_table' : null;
    const split = splitUsageCost({
      model,
      promptTokens: counts.promptTokens,
      cachedPromptTokens: counts.cachedPromptTokens,
      cacheWriteTokens: counts.cacheWriteTokens,
      completionTokens: counts.completionTokens,
      costUsd,
    });
    const inputCostUsd = split?.inputCostUsd ?? null;
    const outputCostUsd = split?.outputCostUsd ?? null;
    await ensureAiUsageTable();
    await prisma.$executeRaw`
      INSERT INTO "AiUsageEvent" (
        "id", "companyId", "userId", "feature", "route", "model", "outcome", "billable", "requests",
        "promptTokens", "cachedPromptTokens", "cacheWriteTokens", "completionTokens", "reasoningTokens",
        "totalTokens", "costUsd", "inputCostUsd", "outputCostUsd", "costSource", "metadata"
      ) VALUES (
        ${randomUUID()}, ${tag.companyId ?? null}, ${tag.userId ?? null}, ${tag.feature}, ${tag.route ?? null},
        ${model}, ${outcome}, ${billable}, ${counts.requests}, ${counts.promptTokens}, ${counts.cachedPromptTokens},
        ${counts.cacheWriteTokens}, ${counts.completionTokens}, ${counts.reasoningTokens},
        ${counts.promptTokens + counts.completionTokens}, ${costUsd}, ${inputCostUsd}, ${outputCostUsd}, ${costSource},
        ${params.metadata ? JSON.stringify(params.metadata) : null}::jsonb
      )
    `;
  } catch (error) {
    console.error('AI usage: failed to record', error instanceof Error ? error.message : error);
  }
}
