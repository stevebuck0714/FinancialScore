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

function industryBriefAiTimeoutMs(stage: 'scan' | 'final'): number {
  const envName = stage === 'scan'
    ? 'INDUSTRY_BRIEF_SCAN_TIMEOUT_MS'
    : 'INDUSTRY_BRIEF_FINAL_TIMEOUT_MS';
  const fallback = stage === 'scan' ? 22000 : 60000;
  const parsed = Number(process.env[envName] || process.env.INDUSTRY_BRIEF_AI_TIMEOUT_MS || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5000, Math.min(80000, Math.floor(parsed)));
}

async function withIndustryBriefTimeout<T>(promise: Promise<T>, label: string, stage: 'scan' | 'final'): Promise<T> {
  const timeoutMs = industryBriefAiTimeoutMs(stage);
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

function valueList(value: unknown, fallback: unknown[] = []): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => Array.isArray(item) ? item : [item]);
  }
  return fallback;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = textValue(item);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function stringList(value: unknown, fallback: unknown[] = []): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  return validArray(value, fallback).map(textValue).filter(Boolean);
}

function scoreValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.find((item) => item === normalized) || null;
}

function oneOfAlias<T extends string>(
  value: unknown,
  allowed: readonly T[],
  aliases: Record<string, T>,
): T | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.find((item) => item === normalized) || aliases[normalized] || null;
}

function firstDefined(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return undefined;
}

function field(candidate: Record<string, unknown>, keys: string[]): unknown {
  return firstDefined(candidate, keys);
}

function normalizeHealthIndicators(value: unknown, fallback: DailyIndustryBrief['healthIndicators']): DailyIndustryBrief['healthIndicators'] {
  return valueList(value, fallback).map((item, index) => {
    const row = asObject(item);
    const label = textValue(row.label) || fallback[index]?.label || '';
    const score = scoreValue(row.score) ?? scoreValue(fallback[index]?.score);
    const trend = oneOfAlias(row.trend, ['improving', 'stable', 'tight', 'worsening'] as const, {
      better: 'improving',
      favorable: 'improving',
      flat: 'stable',
      mixed: 'stable',
      constrained: 'tight',
      pressure: 'worsening',
      deteriorating: 'worsening',
    }) || fallback[index]?.trend || null;
    const note = textValue(row.note) || fallback[index]?.note || '';
    if (!label || score == null || !trend || !note) return null;
    return {
      key: textValue(row.key) || fallback[index]?.key || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      label,
      score,
      trend,
      note,
    };
  }).filter((item): item is DailyIndustryBrief['healthIndicators'][number] => Boolean(item));
}

function normalizeMarketSignals(value: unknown, fallback: DailyIndustryBrief['marketSignals']): DailyIndustryBrief['marketSignals'] {
  return valueList(value, fallback).map((item, index) => {
    const row = asObject(item);
    const category = textValue(field(row, ['category', 'type', 'signalCategory', 'signal_category'])) || fallback[index]?.category || '';
    const title = textValue(field(row, ['title', 'signal', 'name', 'indicator'])) || fallback[index]?.title || '';
    const currentValue = textValue(field(row, ['currentValue', 'current_value', 'value', 'today', 'latestValue', 'latest_value'])) || fallback[index]?.currentValue || '';
    const trend = textValue(field(row, ['trend', 'direction', 'change'])) || fallback[index]?.trend || '';
    const impact = oneOfAlias(field(row, ['impact', 'expectedImpact', 'expected_impact', 'companyImpact', 'company_impact']), ['positive', 'neutral', 'negative'] as const, {
      favorable: 'positive',
      helpful: 'positive',
      opportunity: 'positive',
      mixed: 'neutral',
      watch: 'neutral',
      pressure: 'negative',
      adverse: 'negative',
      unfavorable: 'negative',
    }) || fallback[index]?.impact || null;
    const companyImplication = textValue(field(row, ['companyImplication', 'company_implication', 'implication', 'businessImplication', 'business_implication', 'whyItMatters', 'why_it_matters'])) || fallback[index]?.companyImplication || '';
    if (!category || !title || !currentValue || !trend || !impact || !companyImplication) return null;
    return {
      category,
      title,
      currentValue,
      trend,
      impact,
      companyImplication,
      sources: stringList(field(row, ['sources', 'source', 'evidence', 'citations']), fallback[index]?.sources || []),
    };
  }).filter((item): item is DailyIndustryBrief['marketSignals'][number] => Boolean(item));
}

function normalizeGrowthOpportunities(value: unknown, fallback: DailyIndustryBrief['growthOpportunities']): DailyIndustryBrief['growthOpportunities'] {
  return valueList(value, fallback).map((item, index) => {
    const row = asObject(item);
    const title = textValue(row.title) || fallback[index]?.title || '';
    const score = scoreValue(row.score) ?? scoreValue(fallback[index]?.score);
    const potentialAliases = {
      moderate: 'medium',
      mid: 'medium',
      medium_high: 'high',
      significant: 'high',
      large: 'high',
    } as const;
    const revenuePotential = oneOfAlias(row.revenuePotential, ['low', 'medium', 'high'] as const, potentialAliases) || fallback[index]?.revenuePotential || null;
    const marginPotential = oneOfAlias(row.marginPotential, ['low', 'medium', 'high'] as const, potentialAliases) || fallback[index]?.marginPotential || null;
    const urgency = oneOfAlias(row.urgency, ['today', 'this_week', '30_days', '90_days'] as const, {
      now: 'today',
      immediate: 'today',
      this_week: 'this_week',
      week: 'this_week',
      next_30_days: '30_days',
      thirty_days: '30_days',
      next_90_days: '90_days',
      ninety_days: '90_days',
    }) || fallback[index]?.urgency || null;
    const confidence = oneOfAlias(row.confidence, ['low', 'medium', 'high'] as const, {
      moderate: 'medium',
      medium_high: 'high',
      strong: 'high',
    }) || fallback[index]?.confidence || null;
    const whyNow = textValue(row.whyNow) || fallback[index]?.whyNow || '';
    const recommendedAction = textValue(row.recommendedAction) || fallback[index]?.recommendedAction || '';
    const owner = textValue(row.owner) || fallback[index]?.owner || '';
    const estimatedImpact = textValue(row.estimatedImpact) || fallback[index]?.estimatedImpact || '';
    const evidence = stringList(field(row, ['evidence', 'sources', 'source', 'citations', 'supportingEvidence', 'supporting_evidence']), fallback[index]?.evidence || []);
    if (!title || score == null || !revenuePotential || !marginPotential || !urgency || !confidence || !whyNow || !recommendedAction || !owner || !estimatedImpact || evidence.length === 0) return null;
    return {
      id: textValue(row.id) || fallback[index]?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title,
      score,
      revenuePotential,
      marginPotential,
      urgency,
      confidence,
      whyNow,
      recommendedAction,
      owner,
      estimatedImpact,
      evidence,
    };
  }).filter((item): item is DailyIndustryBrief['growthOpportunities'][number] => Boolean(item));
}

function normalizeRiskMonitor(value: unknown, fallback: DailyIndustryBrief['riskMonitor']): DailyIndustryBrief['riskMonitor'] {
  return valueList(value, fallback).map((item, index) => {
    const row = asObject(item);
    const risk = textValue(row.risk) || fallback[index]?.risk || '';
    const level = oneOfAlias(row.level, ['low', 'medium', 'high'] as const, {
      moderate: 'medium',
      elevated: 'high',
    }) || fallback[index]?.level || null;
    const note = textValue(row.note) || fallback[index]?.note || '';
    if (!risk || !level || !note) return null;
    return {
      risk,
      level,
      note,
    };
  }).filter((item): item is DailyIndustryBrief['riskMonitor'][number] => Boolean(item));
}

function containsPlaceholderText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    'industry indicator',
    'source-backed industry signal',
    'source-backed signal',
    'market signal',
    'see source notes',
    'source-backed growth opportunity',
    'industry risk',
  ].includes(normalized);
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

function industryOutlookFromRecords(sourceRecords: IndustryBriefSourceRecord[]): DailyIndustryBrief['industryOutlook'] {
  return sourceRecords.map((record) => ({
    id: record.id,
    provider: record.provider,
    category: record.category,
    title: record.title,
    value: record.value,
    publishedAt: record.publishedAt,
    summary: record.summary,
    citations: record.citations || [],
  })).filter((item) => item.category && item.title && item.summary);
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
  const industryOutlook = industryOutlookFromRecords(sourceRecords);
  const healthIndicators = normalizeHealthIndicators(
    field(candidate, ['healthIndicators', 'health_indicators', 'industryHealthScore', 'industry_health_score']),
    base.healthIndicators,
  );
  const marketSignals = normalizeMarketSignals(
    field(candidate, ['marketSignals', 'market_signals', 'signals']),
    base.marketSignals,
  );
  const growthOpportunities = normalizeGrowthOpportunities(
    field(candidate, ['growthOpportunities', 'growth_opportunities', 'opportunities', 'topOpportunities', 'top_opportunities']),
    base.growthOpportunities,
  );
  const riskMonitor = normalizeRiskMonitor(
    field(candidate, ['riskMonitor', 'risk_monitor', 'businessRiskMonitor', 'business_risk_monitor', 'risks']),
    base.riskMonitor,
  );
  const computedOverallScore = healthIndicators.length > 0
    ? Math.round(healthIndicators.reduce((sum, indicator) => sum + indicator.score, 0) / healthIndicators.length)
    : null;

  return {
    ...base,
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      ...base.executiveSummary,
      ...executiveSummary,
      status: oneOf(executiveSummary.status, ['stable', 'watch', 'risk'] as const) || base.executiveSummary.status,
      headline: textValue(executiveSummary.headline) || base.executiveSummary.headline,
      bullets: stringList(executiveSummary.bullets, base.executiveSummary.bullets).slice(0, 5),
      expectedImpact60Days: validArray(
        executiveSummary.expectedImpact60Days,
        base.executiveSummary.expectedImpact60Days,
      ).map(textValue).filter(Boolean).slice(0, 6),
    },
    overallScore: computedOverallScore ?? (Number.isFinite(Number(candidate.overallScore))
      ? Math.max(0, Math.min(100, Math.round(Number(candidate.overallScore))))
      : base.overallScore),
    healthIndicators,
    marketSignals,
    growthOpportunities,
    recommendedActions: {
      today: stringList(recommendedActions.today, base.recommendedActions.today).slice(0, 6),
      next30Days: stringList(recommendedActions.next30Days, base.recommendedActions.next30Days).slice(0, 6),
      next90Days: stringList(recommendedActions.next90Days, base.recommendedActions.next90Days).slice(0, 6),
    },
    riskMonitor,
    aiInsight: textValue(candidate.aiInsight)
      ? textValue(candidate.aiInsight)
      : base.aiInsight,
    industryOutlook,
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
  if (stage === 'final' && brief.healthIndicators.length === 0) missing.push('healthIndicators');
  if (stage === 'final' && brief.marketSignals.length === 0) missing.push('marketSignals');
  if (stage === 'final' && brief.growthOpportunities.length === 0) missing.push('growthOpportunities');
  if (stage === 'final' && brief.recommendedActions.today.length === 0) missing.push('recommendedActions.today');
  if (stage === 'final' && brief.riskMonitor.length === 0) missing.push('riskMonitor');
  if (stage === 'final' && !brief.aiInsight.trim()) missing.push('aiInsight');
  if (brief.industryOutlook.length === 0) missing.push('industryOutlook');
  if (brief.sourceNotes.length === 0) missing.push('sourceNotes');
  const placeholderFields = [
    ...brief.healthIndicators.flatMap((item, index) => [
      [item.label, `healthIndicators[${index}].label`],
      [item.note, `healthIndicators[${index}].note`],
    ] as Array<[string, string]>),
    ...brief.marketSignals.flatMap((item, index) => [
      [item.category, `marketSignals[${index}].category`],
      [item.title, `marketSignals[${index}].title`],
      [item.currentValue, `marketSignals[${index}].currentValue`],
    ] as Array<[string, string]>),
    ...brief.growthOpportunities.map((item, index) => [item.title, `growthOpportunities[${index}].title`] as [string, string]),
    ...brief.riskMonitor.map((item, index) => [item.risk, `riskMonitor[${index}].risk`] as [string, string]),
  ].filter(([value]) => containsPlaceholderText(value)).map(([, field]) => field);
  if (placeholderFields.length > 0) {
    missing.push(`placeholder content not allowed: ${placeholderFields.join(', ')}`);
  }
  if (missing.length > 0) {
    throw new Error(`Industry Brief ${stage} output is incomplete: ${missing.join(', ')}.`);
  }
}

function buildFinalSystemPrompt(): string {
  return [
    'You are Corelytics Daily Industry Brief, a CFO-grade market analyst and growth strategist for small and mid-market businesses.',
    'You receive compact live evidence and company financial facts. Produce a concise source-backed dashboard brief without inventing unverifiable facts.',
    'Return JSON only. Do not add markdown. Do not include prose outside JSON.',
    'Return only the requested dashboard analysis fields. The application attaches source notes and detailed outlook records separately.',
    'Rank opportunities by revenue potential, margin potential, fit with company capabilities, urgency, required investment, and confidence.',
    'Every opportunity must be actionable: include why now, recommended action, owner, estimated impact, and evidence.',
    'Only use provided live sources and Corelytics financial facts. If evidence is weak, lower confidence instead of filling gaps.',
  ].join('\n');
}

function compactFinalEvidence(sourceRecords: IndustryBriefSourceRecord[]): Array<Record<string, unknown>> {
  return sourceRecords.map((record) => ({
    provider: record.provider,
    category: record.category,
    title: record.title,
    value: record.value,
    publishedAt: record.publishedAt,
    summary: record.summary.slice(0, 450),
    url: record.url,
    citations: record.citations?.slice(0, 1),
  }));
}

function buildFinalUserPrompt(
  base: DailyIndustryBrief,
  sourceRecords: IndustryBriefSourceRecord[],
  financialFacts?: FinancialFactInput,
): string {
  return JSON.stringify({
    task: 'Return a compact JSON object with the dashboard analysis fields for a DailyIndustryBrief.',
    constraints: [
      'Do not fabricate live commodity/news values beyond the provided base brief.',
      'Make growth opportunities specific to the company, industry, location, and financial context in the base brief.',
      'Always include executiveSummary.headline and executiveSummary.bullets.',
      'Include exactly 4 healthIndicators.',
      'Include exactly 4 marketSignals.',
      'Include exactly 2 growthOpportunities.',
      'Keep recommendedActions practical and near-term with 1 today, 2 next30Days, and 1 next90Days.',
      'Include exactly 2 riskMonitor items.',
      'Keep aiInsight to one short source-backed paragraph.',
      'Do not include industryOutlook or sourceNotes; the application attaches those directly from live source records.',
    ],
    requiredShape: 'executiveSummary{status,headline,bullets,expectedImpact60Days}, overallScore, healthIndicators[{key,label,score,trend,note}], marketSignals[{category,title,currentValue,trend,impact,companyImplication,sources}], growthOpportunities[{id,title,score,revenuePotential,marginPotential,urgency,confidence,whyNow,recommendedAction,owner,estimatedImpact,evidence}], recommendedActions{today,next30Days,next90Days}, riskMonitor[{risk,level,note}], aiInsight',
    company: base.company,
    briefDate: base.briefDate,
    financialFacts: financialFacts || null,
    liveEvidence: compactFinalEvidence(sourceRecords),
  });
}

function buildJsonRepairSystemPrompt(): string {
  return [
    'You repair Corelytics Daily Industry Brief AI output into valid JSON.',
    'Return exactly one JSON object and nothing else.',
    'Do not use markdown fences, comments, ellipses, or prose outside JSON.',
    'Use the original task and live evidence to produce the same complete dashboard analysis if the prior output was malformed or truncated.',
    'Do not invent facts outside the supplied original task, company facts, and live evidence.',
  ].join('\n');
}

function buildJsonRepairUserPrompt(originalTask: string, priorOutput: string, validationError?: string): string {
  return JSON.stringify({
    task: 'Return a single valid JSON object for the DailyIndustryBrief dashboard analysis fields.',
    requiredShape: 'executiveSummary{status,headline,bullets,expectedImpact60Days}, overallScore, healthIndicators[{key,label,score,trend,note}], marketSignals[{category,title,currentValue,trend,impact,companyImplication,sources}], growthOpportunities[{id,title,score,revenuePotential,marginPotential,urgency,confidence,whyNow,recommendedAction,owner,estimatedImpact,evidence}], recommendedActions{today,next30Days,next90Days}, riskMonitor[{risk,level,note}], aiInsight',
    originalTask: JSON.parse(originalTask),
    priorMalformedOutput: String(priorOutput || '').slice(0, 12000),
    validationError: validationError || null,
    constraints: [
      'Return JSON only.',
      'Include exactly 4 healthIndicators, 4 marketSignals, 2 growthOpportunities, and 2 riskMonitor items.',
      'Keep recommendedActions to 1 today, 2 next30Days, and 1 next90Days.',
      'Do not include industryOutlook or sourceNotes.',
    ],
  });
}

function nonJsonSnippet(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function repairFinalJson(params: {
  openai: ReturnType<typeof getOpenAiClient>;
  model: string;
  finalUserPrompt: string;
  priorOutput: string;
  timeoutMs: number;
  validationError?: string;
}): Promise<Record<string, unknown>> {
  const repaired = await withIndustryBriefTimeout(
    createModelText({
      openai: params.openai,
      model: params.model,
      messages: [
        { role: 'system', content: buildJsonRepairSystemPrompt() },
        { role: 'user', content: buildJsonRepairUserPrompt(params.finalUserPrompt, params.priorOutput, params.validationError) },
      ],
      temperature: 0.1,
      maxTokens: 3000,
      timeoutMs: params.timeoutMs + 5000,
    }),
    'Industry Brief final JSON repair',
    'final',
  );
  const parsed = extractJsonObject(repaired.text);
  if (!parsed) {
    throw new Error(`Industry Brief AI returned non-JSON output after repair. finishReason=${repaired.finishReason || 'unknown'} snippet="${nonJsonSnippet(repaired.text)}"`);
  }
  return parsed;
}

function buildScanSystemPrompt(): string {
  return [
    'You are Corelytics Daily Industry Brief source scanner.',
    'You classify real external source records and Corelytics company facts for a downstream final synthesis model.',
    'Do not invent source values, competitors, local developments, regulations, or commodity movements.',
    'If a statement is not supported by the provided source records or company facts, omit it.',
    'Return JSON only. You may return a partial DailyIndustryBrief object; the final model will complete dashboard sections.',
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
    task: 'Classify the provided live source records for later DailyIndustryBrief synthesis. Return only source-backed fields you can support.',
    constraints: [
      'Use the shell company identity and date fields exactly.',
      'Set sourceNotes only for live source records and AI source processing.',
      'Prefer marketSignals and riskMonitor only when directly source-backed.',
      'Growth opportunities are optional at scan stage; include them only if evidence is strong.',
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
  financialFacts?: FinancialFactInput;
}): Promise<DailyIndustryBrief> {
  if (params.config.transport === 'unconfigured') {
    throw new Error('Industry Brief AI synthesis is unavailable because AI transport is not configured.');
  }

  const openai = getOpenAiClient();
  const timeoutMs = industryBriefAiTimeoutMs('final');
  const finalUserPrompt = buildFinalUserPrompt(params.baseBrief, params.sourceRecords, params.financialFacts);
  const result = await withIndustryBriefTimeout(
    createModelText({
      openai,
      model: params.config.finalModel,
      messages: [
        { role: 'system', content: buildFinalSystemPrompt() },
        { role: 'user', content: finalUserPrompt },
      ],
      temperature: 0.2,
      maxTokens: 3000,
      timeoutMs: timeoutMs + 5000,
    }),
    'Industry Brief final AI synthesis',
    'final',
  );
  let parsed = extractJsonObject(result.text);
  if (!parsed) {
    parsed = await repairFinalJson({
      openai,
      model: params.config.finalModel,
      finalUserPrompt,
      priorOutput: result.text,
      timeoutMs,
    });
  }
  let brief = mergeAiBrief(params.baseBrief, parsed, params.config, params.sourceRecords, 'final');
  try {
    validateCompleteBrief(brief, 'final');
  } catch (error) {
    const validationMessage = error instanceof Error ? error.message : String(error);
    const repairedParsed = await repairFinalJson({
        openai,
        model: params.config.finalModel,
        finalUserPrompt,
        priorOutput: JSON.stringify(parsed),
        timeoutMs,
        validationError: validationMessage,
      });
    brief = mergeAiBrief(params.baseBrief, repairedParsed, params.config, params.sourceRecords, 'final');
    validateCompleteBrief(brief, 'final');
  }
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
  const timeoutMs = industryBriefAiTimeoutMs('scan');
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
      timeoutMs: timeoutMs + 5000,
    }),
    'Industry Brief source classification',
    'scan',
  );
  const parsed = extractJsonObject(result.text);
  if (!parsed) {
    throw new Error('Industry Brief source scan returned non-JSON output.');
  }
  const brief = mergeAiBrief(params.shell, parsed, params.config, params.sourceRecords, 'scan');
  validateCompleteBrief(brief, 'scan');
  return brief;
}
