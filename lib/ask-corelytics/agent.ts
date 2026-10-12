import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import { getAiProviderOptions, isUsingGateway, resolveModelName } from '@/lib/ai-gateway';
import { formatEstDate } from '@/lib/time/eastern';
import { ASK_DATA_TOOL_DEFINITIONS, executeAskDataTool } from '@/lib/ask-corelytics/data-tools';

type Source = { url: string; title?: string; publishedDate?: string | null; snippet?: string };

export type AskAgentOutput = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{ text: string; citations: Array<{ url: string; title?: string; publishedDate?: string | null }> }>;
  howThisImpactsUs: string;
  sources: Source[];
  needsClarification: boolean;
  toolCalls: number;
};

export type AskPartialAnswer = { shortAnswer: string; longAnswer: string };

const MAX_ROUNDS = 12;
const MAX_TOOL_RESULT_CHARS = 20_000;
const MAX_CONTEXT_CHARS = 40_000;
const MAX_ANSWER_TOKENS = 4000;
/** Thinking tokens count against max_tokens, so leave room for the answer when reasoning is on. */
const MAX_TOKENS_WITH_REASONING = 32_000;
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const PARTIAL_EMIT_INTERVAL_MS = 250;
const RECENT_MONTHS_IN_CONTEXT = 13;

/** ASK_REASONING_EFFORT (gateway only); unset or invalid leaves the provider default. */
function askReasoningEffort(): (typeof REASONING_EFFORTS)[number] | null {
  if (!isUsingGateway()) return null;
  const value = String(process.env.ASK_REASONING_EFFORT || '').trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(value) ? (value as (typeof REASONING_EFFORTS)[number]) : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const SECTION_MARKERS = ['SHORT ANSWER', 'LONG ANSWER', 'BULLETS', 'IMPACT', 'NEEDS CLARIFICATION'] as const;
const SECTION_LINE = /^[\s#*>]*(SHORT ANSWER|LONG ANSWER|BULLETS|IMPACT|NEEDS CLARIFICATION)\**\s*:\s*\**\s*(.*)$/;

function parseSections(text: string): Partial<Record<(typeof SECTION_MARKERS)[number], string>> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(SECTION_LINE);
    if (match) {
      current = match[1];
      sections[current] = match[2] ? [match[2]] : [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]));
}

/** Drops a trailing line that is only the start of a section marker still being streamed. */
function dropPartialMarkerLine(text: string): string {
  const lastBreak = text.lastIndexOf('\n');
  const lastLine = text.slice(lastBreak + 1).replace(/^[\s#*>]+/, '');
  if (!lastLine || !/^[A-Z][A-Z ]*:?$/.test(lastLine)) return text;
  const isMarkerPrefix = SECTION_MARKERS.some((marker) => `${marker}:`.startsWith(lastLine));
  return isMarkerPrefix ? text.slice(0, Math.max(0, lastBreak)) : text;
}

function buildPartialAnswer(content: string): AskPartialAnswer | null {
  if (!/SHORT ANSWER\**\s*:/.test(content)) return null;
  const sections = parseSections(dropPartialMarkerLine(content));
  const shortAnswer = sections['SHORT ANSWER'] || '';
  if (!shortAnswer) return null;
  return { shortAnswer, longAnswer: sections['LONG ANSWER'] || '' };
}

type ParsedAnswer = {
  shortAnswer: string;
  longAnswer: string;
  bullets: Array<{ text: string; source: 'financials' | 'operations' }>;
  howThisImpactsUs: string;
  needsClarification: boolean;
};

function parseFinalAnswer(content: string): ParsedAnswer | null {
  const sections = parseSections(content);
  if (sections['SHORT ANSWER']) {
    const bullets = String(sections.BULLETS || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .map((line) => {
        const tag = line.match(/^\[(financials|operations)\]\s*/i);
        return {
          text: tag ? line.slice(tag[0].length).trim() : line,
          source: (tag?.[1].toLowerCase() === 'operations' ? 'operations' : 'financials') as 'financials' | 'operations',
        };
      })
      .filter((bullet) => bullet.text);
    return {
      shortAnswer: sections['SHORT ANSWER'],
      longAnswer: sections['LONG ANSWER'] || '',
      bullets,
      howThisImpactsUs: sections.IMPACT || '',
      needsClarification: /^\s*(yes|true)\b/i.test(sections['NEEDS CLARIFICATION'] || ''),
    };
  }

  const parsed = parseJsonObject(content);
  if (!parsed || typeof parsed.shortAnswer !== 'string' || !parsed.shortAnswer.trim()) return null;
  const rawBullets = Array.isArray(parsed.citedBullets) ? parsed.citedBullets : [];
  return {
    shortAnswer: parsed.shortAnswer.trim(),
    longAnswer: String(parsed.longAnswer || '').trim(),
    bullets: rawBullets
      .map((b: any) => ({
        text: String(typeof b === 'string' ? b : b?.text || '').trim(),
        source: (String(b?.source || '').toLowerCase() === 'operations' ? 'operations' : 'financials') as 'financials' | 'operations',
      }))
      .filter((bullet) => bullet.text),
    howThisImpactsUs: String(parsed.howThisImpactsUs || '').trim(),
    needsClarification: parsed.needsClarification === true,
  };
}

function formatAnswerText(answer: { shortAnswer: string; longAnswer?: string; howThisImpactsUs?: string }): string {
  return [
    'SHORT ANSWER:',
    answer.shortAnswer,
    ...(answer.longAnswer ? ['LONG ANSWER:', answer.longAnswer] : []),
    ...(answer.howThisImpactsUs ? ['IMPACT:', answer.howThisImpactsUs] : []),
  ].join('\n');
}

function buildSystemPrompt(params: { companyName: string; todayEst: string; datasetsPreloaded: boolean }) {
  return [
    `You are Corelytics, an expert financial and operational analyst for ${params.companyName || 'this company'}.`,
    `Today is ${params.todayEst} (Eastern Time). Interpret relative dates ("last month", "YTD", "this September") against this date.`,
    '',
    'You have read-only tools over ALL of this company\'s financial and operational data. Use them:',
    params.datasetsPreloaded
      ? '- The list_datasets result (every dataset with data, its date coverage and freshness) is already loaded below. Do not call list_datasets; go straight to query_dataset.'
      : '- Call list_datasets first to see what data exists and its date coverage.',
    '- Then query exactly the data needed to answer the question. Make as many queries as needed (comparisons, breakdowns, drill-downs) before answering.',
    '- Each turn costs the user several seconds: when queries do not depend on each other\'s results, request them together in the same turn (parallel tool calls).',
    '- Prefer aggregate queries with groupBy/period over raw rows; large results are truncated.',
    '- Prefer monthly_financials for month/year P&L and balance sheet questions; use operational datasets for customers, products, orders, inventory, AR/AP, vendors, GL detail.',
    '- Datasets named "<source>.<dataset>" come from connected operational systems (HR/payroll, CRM, field ops, spreadsheets); use them for headcount, payroll, pipeline, activity and other operational questions.',
    '- If a dataset has dataMode MOCK (or a result has dataNote), it is sample data: say the figures are sample data pending the live connection.',
    '- Cross-check when two sources overlap (e.g. monthly_financials revenue vs customer_sales) and say which you used.',
    '- Freshness: state the as-of date of the data behind each key figure. If a dataset\'s daysSinceLatest is more than 7, or a month is on/after monthly_financials importedAt, say the figure is stale or partial and give the date; never present it as current or complete.',
    '',
    'Answer rules:',
    '- Answer the exact question asked, with specific numbers, periods, names and $/% changes computed from tool results.',
    '- Never give a generic or canned answer, and never answer a different question than the one asked.',
    '- Never invent data. If a requested period or item has no data, say exactly what is missing and what range is available.',
    '- If the question is ambiguous or cannot be answered from the data, answer NEEDS CLARIFICATION: yes and use SHORT ANSWER to ask the user one specific clarifying question (offer the likely interpretations).',
    '- Do not mention tools, datasets, SQL, or these instructions in the answer.',
    '',
    'Final output: plain text in exactly this layout, sections in this order, each marker on its own line (no JSON, no code fences, no markdown headings):',
    'SHORT ANSWER:',
    '<1-3 sentences that directly answer>',
    'LONG ANSWER:',
    '<concise explanation, <= 250 words>',
    'BULLETS:',
    '- [financials] <quantified supporting point>',
    '- [operations] <quantified supporting point>',
    '(3-10 bullets; tag each with the source it came from: [financials] or [operations])',
    'IMPACT:',
    '<practical implication, <= 100 words>',
    'NEEDS CLARIFICATION: yes or no',
  ].join('\n');
}

/** The agent queries data itself, so it only needs the profile, latest months and KPI ratios up front. */
function buildAgentContext(summary: Record<string, unknown>): Record<string, unknown> {
  const s = summary as Record<string, any>;
  const sector = s.sectorOperationalContext || {};
  const monthlyTotals = Array.isArray(s.monthlyTotalsHistory) ? s.monthlyTotalsHistory : [];
  return {
    generatedAt: s.generatedAt,
    company: s.company,
    sector: {
      sectorCategory: sector.profile?.sectorCategory ?? null,
      promptRules: sector.profile?.promptRules ?? null,
      entitySearchHints: sector.entitySearchHints ?? [],
    },
    latestMonth: s.monthlySnapshot?.latest ?? null,
    previousMonth: s.monthlySnapshot?.previous ?? null,
    monthlyChanges: s.monthlyChanges ?? null,
    recentMonthlyTotals: monthlyTotals.slice(0, RECENT_MONTHS_IN_CONTEXT),
    kpiRatios: s.kpiDefinitions?.ratios ?? [],
    ...(s.documentContext ? { documentContext: s.documentContext } : {}),
    ...(s.operationalWorkbookData ? { operationalWorkbookData: s.operationalWorkbookData } : {}),
  };
}

const MAX_THREAD_TURNS = 6;
const MAX_THREAD_ANSWER_CHARS = 4_000;

function toThreadMessages(conversationContext: unknown): {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  runningSummary: string;
} {
  const ctx = (conversationContext || {}) as { recentTurns?: unknown; runningSummary?: unknown };
  const turns = Array.isArray(ctx.recentTurns) ? ctx.recentTurns.slice(-MAX_THREAD_TURNS) : [];
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  for (const turn of turns as Array<Record<string, unknown>>) {
    const priorQuestion = String(turn?.question || '').trim();
    const shortAnswer = String(turn?.shortAnswer || '').trim();
    if (!priorQuestion || !shortAnswer) continue;
    messages.push({ role: 'user', content: `Question: ${priorQuestion}` });
    messages.push({
      role: 'assistant',
      content: formatAnswerText({
        shortAnswer,
        longAnswer: String(turn?.longAnswer || '').slice(0, MAX_THREAD_ANSWER_CHARS),
        howThisImpactsUs: String(turn?.howThisImpactsUs || ''),
      }),
    });
  }
  return { messages, runningSummary: String(ctx.runningSummary || '').trim() };
}

function humanizeDatasetName(name: string): string {
  const leaf = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
  return leaf.replace(/[_-]+/g, ' ').trim() || 'company data';
}

function describeToolCall(name: string, rawArgs: string): { label: string; dataset?: string } {
  if (name === 'list_datasets') return { label: 'Reviewing available data' };
  if (name === 'get_loans_and_covenants') return { label: 'Reviewing loans and covenants' };
  if (name === 'get_product_revenue') return { label: 'Loading product revenue' };
  if (name === 'query_dataset') {
    let dataset = '';
    try {
      dataset = String(JSON.parse(rawArgs || '{}')?.dataset || '');
    } catch {
      dataset = '';
    }
    return { label: `Querying ${humanizeDatasetName(dataset)}`, dataset: dataset || undefined };
  }
  return { label: 'Querying company data' };
}

type ReasoningDetail = Record<string, unknown> & { type?: string; index?: number };

/** Streamed reasoning_details arrive as fragments per block index; rebuild whole blocks so signatures stay valid. */
function mergeReasoningDetails(target: ReasoningDetail[], fragments: unknown[]) {
  for (const raw of fragments) {
    if (!raw || typeof raw !== 'object') continue;
    const fragment = raw as ReasoningDetail;
    const existing =
      typeof fragment.index === 'number'
        ? target.find((d) => d.index === fragment.index && d.type === fragment.type)
        : target.length > 0 && target[target.length - 1].type === fragment.type
          ? target[target.length - 1]
          : undefined;
    if (!existing) {
      target.push({ ...fragment });
      continue;
    }
    for (const key of ['text', 'summary', 'data']) {
      if (typeof fragment[key] === 'string') existing[key] = `${String(existing[key] ?? '')}${fragment[key]}`;
    }
    for (const key of ['signature', 'id', 'format']) {
      if (fragment[key]) existing[key] = fragment[key];
    }
  }
}

type StreamedRound = {
  content: string;
  toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  reasoning: string;
  reasoningDetails: ReasoningDetail[];
  finishReason: string | null;
  usage:
    | (OpenAI.Completions.CompletionUsage & {
        prompt_tokens_details?: { cached_tokens?: number };
        completion_tokens_details?: { reasoning_tokens?: number };
      })
    | null;
};

async function streamRound(
  openai: OpenAI,
  body: Record<string, unknown>,
  requestOptions: OpenAI.RequestOptions,
  onContent: (content: string) => void,
): Promise<StreamedRound> {
  const stream = (await openai.chat.completions.create(
    { ...body, stream: true, stream_options: { include_usage: true } } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    requestOptions,
  )) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

  const round: StreamedRound = { content: '', toolCalls: [], reasoning: '', reasoningDetails: [], finishReason: null, usage: null };
  for await (const chunk of stream) {
    if (chunk.usage) round.usage = chunk.usage as StreamedRound['usage'];
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) round.finishReason = choice.finish_reason;
    const delta = (choice.delta || {}) as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
      reasoning?: unknown;
      reasoning_details?: unknown;
    };
    if (typeof delta.reasoning === 'string') round.reasoning += delta.reasoning;
    if (Array.isArray(delta.reasoning_details)) mergeReasoningDetails(round.reasoningDetails, delta.reasoning_details);
    for (const call of delta.tool_calls || []) {
      const index = typeof call.index === 'number' ? call.index : round.toolCalls.length;
      const acc = (round.toolCalls[index] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (call.id) acc.id = call.id;
      if (call.function?.name && !acc.function.name) acc.function.name = call.function.name;
      if (call.function?.arguments) acc.function.arguments += call.function.arguments;
    }
    if (typeof delta.content === 'string' && delta.content) {
      round.content += delta.content;
      onContent(round.content);
    }
  }
  round.toolCalls = round.toolCalls.filter((call) => call && call.function.name);
  return round;
}

export async function runAskDataAgent(params: {
  openai: OpenAI;
  model: string;
  companyId: string;
  companyName: string;
  question: string;
  contextSummary: Record<string, unknown>;
  datasets?: unknown[] | null;
  conversationContext?: unknown;
  sources: Source[];
  deadlineMs: number;
  onProgress?: (message: string) => void;
  onPartialAnswer?: (partial: AskPartialAnswer | null) => void;
}): Promise<AskAgentOutput | null> {
  const { openai, companyId, question, sources } = params;
  const progress = (message: string) => {
    try {
      params.onProgress?.(message);
    } catch {
      // Progress is best-effort; a closed client stream must not break the answer.
    }
  };
  const emitPartial = (partial: AskPartialAnswer | null) => {
    try {
      params.onPartialAnswer?.(partial);
    } catch {
      // Partial answers are best-effort, like progress.
    }
  };
  const financialSource = sources.find((s) => /data review/i.test(String(s.title || ''))) || sources[0];
  const operationsSource = sources.find((s) => /operations/i.test(String(s.title || ''))) || financialSource;
  if (!financialSource) return null;

  const datasetsPreloaded = Array.isArray(params.datasets);
  const tools = datasetsPreloaded
    ? ASK_DATA_TOOL_DEFINITIONS.filter((tool) => tool.function.name !== 'list_datasets')
    : ASK_DATA_TOOL_DEFINITIONS;
  const contextJson = JSON.stringify(buildAgentContext(params.contextSummary)).slice(0, MAX_CONTEXT_CHARS);
  const thread = toThreadMessages(params.conversationContext);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [
        buildSystemPrompt({ companyName: params.companyName, todayEst: formatEstDate(), datasetsPreloaded }),
        '',
        'Background context (company profile, sector rules, latest months, KPI ratios vs industry benchmarks). Use the tools for anything beyond this:',
        contextJson,
        ...(datasetsPreloaded ? ['', 'list_datasets result:', JSON.stringify(params.datasets)] : []),
        ...(thread.runningSummary
          ? ['', 'Summary of older turns in this thread:', thread.runningSummary]
          : []),
      ].join('\n'),
    },
    ...thread.messages,
    {
      role: 'user',
      content: thread.messages.length > 0
        ? `Follow-up question: ${question}\n\nResolve references like "that", "it", "those", "same period", or "why" against the earlier turns in this conversation. Re-query data as needed rather than repeating earlier numbers unverified.`
        : `Question: ${question}`,
    },
  ];

  const providerOptions = getAiProviderOptions({ promptCaching: true });
  const affinityHeaders = isUsingGateway() ? { 'x-session-affinity': `ask-${randomUUID()}` } : undefined;
  const reasoningEffort = askReasoningEffort();
  const model = resolveModelName(params.model);
  const agentStartedAt = Date.now();
  let toolCalls = 0;
  let llmMsTotal = 0;
  let toolMsTotal = 0;
  let firstAnswerTextMs: number | null = null;
  const logSummary = (outcome: string, rounds: number) => {
    console.log('Ask agent: finished', {
      outcome,
      model,
      reasoningEffort: reasoningEffort || 'default',
      datasetsPreloaded,
      contextChars: contextJson.length,
      rounds,
      toolCalls,
      llmMs: llmMsTotal,
      toolMs: toolMsTotal,
      firstAnswerTextMs,
      totalMs: Date.now() - agentStartedAt,
    });
  };

  progress('Analyzing your question');

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const remaining = params.deadlineMs - Date.now();
    if (remaining < 15_000) {
      logSummary('deadline', round);
      return null;
    }
    const isLastRound = round === MAX_ROUNDS - 1 || remaining < 45_000;

    const llmStartedAt = Date.now();
    let partialShown = false;
    let lastPartialAt = 0;
    const result = await streamRound(
      openai,
      {
        model,
        messages,
        tools,
        tool_choice: isLastRound ? 'none' : 'auto',
        max_tokens: reasoningEffort && reasoningEffort !== 'none' ? MAX_TOKENS_WITH_REASONING : MAX_ANSWER_TOKENS,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      },
      { timeout: Math.max(10_000, remaining - 5_000), ...(affinityHeaders ? { headers: affinityHeaders } : {}) },
      (content) => {
        const now = Date.now();
        if (now - lastPartialAt < PARTIAL_EMIT_INTERVAL_MS) return;
        const partial = buildPartialAnswer(content);
        if (!partial) return;
        if (firstAnswerTextMs === null) firstAnswerTextMs = now - agentStartedAt;
        lastPartialAt = now;
        partialShown = true;
        emitPartial(partial);
      },
    );
    const llmMs = Date.now() - llmStartedAt;
    llmMsTotal += llmMs;

    const roundLog = {
      round: round + 1,
      llmMs,
      promptTokens: result.usage?.prompt_tokens ?? null,
      cachedPromptTokens: result.usage?.prompt_tokens_details?.cached_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      reasoningTokens: result.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      finishReason: result.finishReason,
    };

    if (result.toolCalls.length > 0) {
      if (partialShown) emitPartial(null);
      // The gateway's reasoning fields must go back with the tool-call turn so thinking models
      // can continue their reasoning after the tool results.
      messages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls,
        ...(result.reasoning ? { reasoning: result.reasoning } : {}),
        ...(result.reasoningDetails.length > 0 ? { reasoning_details: result.reasoningDetails } : {}),
      } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);
      const described = result.toolCalls.map((call) => describeToolCall(call.function.name, call.function.arguments));
      const labels = [...new Set(described.map((d) => d.label))];
      progress(labels.length > 3 ? `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more` : labels.join(', '));

      const toolStartedAt = Date.now();
      const toolTimings: Array<{ name: string; dataset?: string; ms: number; chars: number }> = [];
      const results = await Promise.all(
        result.toolCalls.map(async (call, index) => {
          toolCalls += 1;
          const callStartedAt = Date.now();
          const toolResult = await executeAskDataTool(companyId, call.function.name, call.function.arguments);
          let content = JSON.stringify(toolResult);
          toolTimings.push({ name: call.function.name, dataset: described[index].dataset, ms: Date.now() - callStartedAt, chars: content.length });
          if (content.length > MAX_TOOL_RESULT_CHARS) {
            content = `${content.slice(0, MAX_TOOL_RESULT_CHARS)}... [truncated; narrow the query with filters, groupBy, or a smaller limit]`;
          }
          return { role: 'tool' as const, tool_call_id: call.id, content };
        }),
      );
      const toolMs = Date.now() - toolStartedAt;
      toolMsTotal += toolMs;
      console.log('Ask agent: round', { ...roundLog, toolMs, toolCalls: toolTimings });
      messages.push(...results);
      progress('Analyzing results');
      continue;
    }

    console.log('Ask agent: round', { ...roundLog, toolCalls: [] });
    const parsed = parseFinalAnswer(result.content);
    if (!parsed) {
      if (partialShown) emitPartial(null);
      logSummary('unparseable_answer', round + 1);
      return null;
    }
    logSummary('answered', round + 1);

    return {
      shortAnswer: parsed.shortAnswer,
      longAnswer: parsed.longAnswer,
      citedBullets: parsed.bullets.map((bullet) => {
        const src = bullet.source === 'operations' ? operationsSource : financialSource;
        return { text: bullet.text, citations: [{ url: src.url, title: src.title, publishedDate: src.publishedDate ?? null }] };
      }),
      howThisImpactsUs: parsed.howThisImpactsUs,
      sources,
      needsClarification: parsed.needsClarification,
      toolCalls,
    };
  }
  logSummary('max_rounds', MAX_ROUNDS);
  return null;
}
