import { getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import type { DailyIndustryBrief, IndustryBriefSourceNote, IndustryBriefSourceRecord } from '@/lib/industry-brief/types';

type IndustryBriefAiConfig = {
  transport: string;
  finalModel: string;
  scanModel: string;
};

type FinancialFactInput = {
  revenueLastTwelveMonths: number;
  grossMarginPct: number | null;
  cogsPct: number | null;
  payrollPct: number | null;
  latestRevenueTrendPct: number | null;
};

function industryBriefAiTimeoutMs(): number {
  const parsed = Number(process.env.INDUSTRY_BRIEF_AI_TIMEOUT_MS || 22000);
  if (!Number.isFinite(parsed)) return 22000;
  return Math.max(5000, Math.min(30000, Math.floor(parsed)));
}

async function withIndustryBriefTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  const timeoutMs = industryBriefAiTimeoutMs();
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    // Some models still wrap JSON in prose/fences. Pull the outermost object.
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validArray(value: unknown, fallback: unknown[]): unknown[] {
  return Array.isArray(value) ? value : fallback;
}

function sourceNotesFromRecords(sourceRecords: IndustryBriefSourceRecord[]): IndustryBriefSourceNote[] {
  return sourceRecords.map((record) => ({
    name: `${record.provider}: ${record.title}`,
    status: 'live',
    note: [
      record.value ? `Value: ${record.value}.` : '',
      record.publishedAt ? `As of: ${record.publishedAt}.` : '',
      record.url ? `Source: ${record.url}.` : '',
      !record.url && record.citations?.length ? `Citations: ${record.citations.slice(0, 3).join(', ')}.` : '',
    ].filter(Boolean).join(' '),
  }));
}

function normalizeLiveSourceNotes(value: unknown): IndustryBriefSourceNote[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asObject(item);
    return {
      name: String(row.name || '').trim(),
      status: 'live' as const,
      note: String(row.note || '').trim(),
    };
  }).filter((item) => item.name && item.note);
}

function mergeAiBrief(
  base: DailyIndustryBrief,
  candidate: Record<string, unknown>,
  config: IndustryBriefAiConfig,
  sourceRecords: IndustryBriefSourceRecord[],
  stage: 'scan' | 'final',
): DailyIndustryBrief {
  const executiveSummary = asObject(candidate.executiveSummary);
  const recommendedActions = asObject(candidate.recommendedActions);
  const aiSourceNote: IndustryBriefSourceNote = {
    name: stage === 'scan' ? 'Industry Brief AI source scan' : 'Industry Brief AI synthesis',
    status: 'live',
    note: stage === 'scan'
      ? `Live source records classified with ${config.scanModel}.`
      : `Final synthesis generated with ${config.finalModel}. Source scanning model configured as ${config.scanModel}.`,
  };
  const candidateSourceNotes = normalizeLiveSourceNotes(candidate.sourceNotes);
  const requiredSourceNotes = sourceNotesFromRecords(sourceRecords);

  return {
    ...base,
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      ...base.executiveSummary,
      ...executiveSummary,
      bullets: validArray(executiveSummary.bullets, base.executiveSummary.bullets).map(String).slice(0, 5),
      expectedImpact60Days: validArray(
        executiveSummary.expectedImpact60Days,
        base.executiveSummary.expectedImpact60Days,
      ).map(String).slice(0, 6),
    },
    overallScore: Number.isFinite(Number(candidate.overallScore))
      ? Math.max(0, Math.min(100, Math.round(Number(candidate.overallScore))))
      : base.overallScore,
    healthIndicators: validArray(candidate.healthIndicators, base.healthIndicators) as DailyIndustryBrief['healthIndicators'],
    marketSignals: validArray(candidate.marketSignals, base.marketSignals) as DailyIndustryBrief['marketSignals'],
    growthOpportunities: validArray(candidate.growthOpportunities, base.growthOpportunities) as DailyIndustryBrief['growthOpportunities'],
    recommendedActions: {
      today: validArray(recommendedActions.today, base.recommendedActions.today).map(String).slice(0, 6),
      next30Days: validArray(recommendedActions.next30Days, base.recommendedActions.next30Days).map(String).slice(0, 6),
      next90Days: validArray(recommendedActions.next90Days, base.recommendedActions.next90Days).map(String).slice(0, 6),
    },
    riskMonitor: validArray(candidate.riskMonitor, base.riskMonitor) as DailyIndustryBrief['riskMonitor'],
    aiInsight: typeof candidate.aiInsight === 'string' && candidate.aiInsight.trim()
      ? candidate.aiInsight.trim()
      : base.aiInsight,
    sourceNotes: [
      ...requiredSourceNotes,
      ...candidateSourceNotes,
      ...base.sourceNotes.filter((source) => source.name !== aiSourceNote.name),
      aiSourceNote,
    ],
    aiMetadata: {
      aiGenerated: true,
      transport: config.transport,
      finalModel: config.finalModel,
      scanModel: config.scanModel,
    },
  };
}

function validateCompleteBrief(brief: DailyIndustryBrief, stage: 'scan' | 'final') {
  const missing: string[] = [];
  if (stage === 'final' && !brief.executiveSummary.headline.trim()) missing.push('executiveSummary.headline');
  if (stage === 'final' && brief.executiveSummary.bullets.length === 0) missing.push('executiveSummary.bullets');
  if (brief.healthIndicators.length === 0) missing.push('healthIndicators');
  if (brief.marketSignals.length === 0) missing.push('marketSignals');
  if (brief.growthOpportunities.length === 0) missing.push('growthOpportunities');
  if (brief.recommendedActions.today.length === 0) missing.push('recommendedActions.today');
  if (brief.riskMonitor.length === 0) missing.push('riskMonitor');
  if (!brief.aiInsight.trim()) missing.push('aiInsight');
  if (brief.sourceNotes.length === 0) missing.push('sourceNotes');
  if (missing.length > 0) {
    throw new Error(`Industry Brief ${stage} output is incomplete: ${missing.join(', ')}.`);
  }
}

function buildFinalSystemPrompt(): string {
  return [
    'You are Corelytics Daily Industry Brief, a CFO-grade market analyst and growth strategist for small and mid-market businesses.',
    'You receive a source-backed base brief created from live source records. Improve the wording, prioritization, and growth-opportunity ranking without inventing unverifiable facts.',
    'Preserve the JSON schema exactly. Do not add markdown. Do not include prose outside JSON.',
    'Rank opportunities by revenue potential, margin potential, fit with company capabilities, urgency, required investment, and confidence.',
    'Every opportunity must be actionable: include why now, recommended action, owner, estimated impact, and evidence.',
    'Only use provided live sources and Corelytics financial facts. If evidence is weak, lower confidence instead of filling gaps.',
  ].join('\n');
}

function buildFinalUserPrompt(base: DailyIndustryBrief, sourceRecords: IndustryBriefSourceRecord[]): string {
  return JSON.stringify({
    task: 'Return an improved DailyIndustryBrief JSON object. Keep the exact top-level shape and field meanings.',
    constraints: [
      'Do not fabricate live commodity/news values beyond the provided base brief.',
      'Make growth opportunities specific to the company, industry, location, and financial context in the base brief.',
      'Keep executiveSummary concise.',
      'Keep growthOpportunities to 2-5 items.',
      'Keep recommendedActions practical and near-term.',
    ],
    baseBrief: base,
    liveSourceRecords: sourceRecords,
  });
}

function buildScanSystemPrompt(): string {
  return [
    'You are Corelytics Daily Industry Brief source scanner.',
    'You classify real external source records and Corelytics company facts into an actionable DailyIndustryBrief JSON object.',
    'Do not invent source values, competitors, local developments, regulations, or commodity movements.',
    'If a statement is not supported by the provided source records or company facts, omit it; however every required schema array must contain source-backed items.',
    'Growth opportunities must be specific, revenue-oriented, and tied to evidence.',
    'Return JSON only. Preserve the DailyIndustryBrief schema exactly. Include every top-level field from the shell.',
  ].join('\n');
}

function scanSourceRecords(sourceRecords: IndustryBriefSourceRecord[]): IndustryBriefSourceRecord[] {
  return sourceRecords.map((record) => ({
    ...record,
    summary: record.summary.slice(0, 1800),
    citations: record.citations?.slice(0, 5),
  }));
}

function buildScanUserPrompt(params: {
  shell: DailyIndustryBrief;
  sourceRecords: IndustryBriefSourceRecord[];
  financialFacts: FinancialFactInput;
}): string {
  return JSON.stringify({
    task: 'Create a complete DailyIndustryBrief JSON object from the provided shell, live source records, and financial facts.',
    constraints: [
      'Use the shell company identity and date fields exactly.',
      'Set sourceNotes only for live source records and AI source processing.',
      'Create at least 5 healthIndicators covering demand, input costs, labor, transportation, and local economy.',
      'Create at least 5 marketSignals classified into categories such as demand, competitor, regulation, commodity, labor, local economy, transportation, and revenue opportunity.',
      'Create at least 2 growthOpportunities with evidence from liveSourceRecords and Corelytics financial facts.',
      'recommendedActions.today, recommendedActions.next30Days, and recommendedActions.next90Days must each contain at least 1 item.',
      'riskMonitor must contain at least 3 items.',
      'aiInsight must be a concise paragraph.',
      'Do not fill missing data with modeled assumptions.',
    ],
    shell: params.shell,
    financialFacts: params.financialFacts,
    liveSourceRecords: scanSourceRecords(params.sourceRecords),
  });
}

export async function synthesizeIndustryBriefWithAi(params: {
  baseBrief: DailyIndustryBrief;
  sourceRecords: IndustryBriefSourceRecord[];
  config: IndustryBriefAiConfig;
}): Promise<DailyIndustryBrief> {
  if (params.config.transport === 'unconfigured') {
    throw new Error('Industry Brief AI synthesis is unavailable because AI transport is not configured.');
  }

  const openai = getOpenAiClient();
  const result = await withIndustryBriefTimeout(
    createModelText({
      openai,
      model: params.config.finalModel,
      messages: [
        { role: 'system', content: buildFinalSystemPrompt() },
        { role: 'user', content: buildFinalUserPrompt(params.baseBrief, params.sourceRecords) },
      ],
      temperature: 0.2,
      maxTokens: 5000,
    }),
    'Industry Brief final AI synthesis',
  );
  const parsed = extractJsonObject(result.text);
  if (!parsed) {
    throw new Error('Industry Brief AI returned non-JSON output.');
  }
  const brief = mergeAiBrief(params.baseBrief, parsed, params.config, params.sourceRecords, 'final');
  validateCompleteBrief(brief, 'final');
  return brief;
}

export async function scanIndustryBriefSourcesWithAi(params: {
  shell: DailyIndustryBrief;
  sourceRecords: IndustryBriefSourceRecord[];
  financialFacts: FinancialFactInput;
  config: IndustryBriefAiConfig;
}): Promise<DailyIndustryBrief> {
  if (params.config.transport === 'unconfigured') {
    throw new Error('Industry Brief source scan is unavailable because AI transport is not configured.');
  }
  if (params.sourceRecords.length === 0) {
    throw new Error('Industry Brief source scan requires live source records.');
  }

  const openai = getOpenAiClient();
  const result = await withIndustryBriefTimeout(
    createModelText({
      openai,
      model: params.config.scanModel,
      messages: [
        { role: 'system', content: buildScanSystemPrompt() },
        { role: 'user', content: buildScanUserPrompt(params) },
      ],
      temperature: 0.1,
      maxTokens: 6500,
    }),
    'Industry Brief source classification',
  );
  const parsed = extractJsonObject(result.text);
  if (!parsed) {
    throw new Error('Industry Brief source scan returned non-JSON output.');
  }
  const brief = mergeAiBrief(params.shell, parsed, params.config, params.sourceRecords, 'scan');
  validateCompleteBrief(brief, 'scan');
  return brief;
}
