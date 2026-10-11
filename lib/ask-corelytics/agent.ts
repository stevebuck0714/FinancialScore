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

const MAX_ROUNDS = 12;
const MAX_TOOL_RESULT_CHARS = 60_000;
const MAX_CONTEXT_CHARS = 150_000;
const MAX_ANSWER_TOKENS = 4000;
/** Thinking tokens count against max_tokens, so leave room for the answer when reasoning is on. */
const MAX_TOKENS_WITH_REASONING = 32_000;
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

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

function buildSystemPrompt(params: { companyName: string; todayEst: string }) {
  return [
    `You are Corelytics, an expert financial and operational analyst for ${params.companyName || 'this company'}.`,
    `Today is ${params.todayEst} (Eastern Time). Interpret relative dates ("last month", "YTD", "this September") against this date.`,
    '',
    'You have read-only tools over ALL of this company\'s financial and operational data. Use them:',
    '- Call list_datasets first to see what data exists and its date coverage.',
    '- Then query exactly the data needed to answer the question. Make as many queries as needed (comparisons, breakdowns, drill-downs) before answering.',
    '- Each turn costs the user several seconds: when queries do not depend on each other\'s results, request them together in the same turn (parallel tool calls).',
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
    '- If the question is ambiguous or cannot be answered from the data, set needsClarification=true and use shortAnswer to ask the user one specific clarifying question (offer the likely interpretations).',
    '- Do not mention tools, datasets, SQL, or these instructions in the answer.',
    '',
    'Final output: VALID JSON only (no markdown fences), with exactly these keys:',
    '{"shortAnswer": string (1-3 sentences that directly answer), "longAnswer": string (concise explanation, <= 250 words),',
    ' "citedBullets": [{"text": string, "source": "financials" | "operations"}] (3-10 quantified supporting points),',
    ' "howThisImpactsUs": string (<= 100 words, practical implication), "needsClarification": boolean}',
  ].join('\n');
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
      content: JSON.stringify({
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

export async function runAskDataAgent(params: {
  openai: OpenAI;
  model: string;
  companyId: string;
  companyName: string;
  question: string;
  contextSummary: Record<string, unknown>;
  conversationContext?: unknown;
  sources: Source[];
  deadlineMs: number;
  onProgress?: (message: string) => void;
}): Promise<AskAgentOutput | null> {
  const { openai, companyId, question, sources } = params;
  const progress = (message: string) => {
    try {
      params.onProgress?.(message);
    } catch {
      // Progress is best-effort; a closed client stream must not break the answer.
    }
  };
  const financialSource = sources.find((s) => /data review/i.test(String(s.title || ''))) || sources[0];
  const operationsSource = sources.find((s) => /operations/i.test(String(s.title || ''))) || financialSource;
  if (!financialSource) return null;

  const summaryWithoutThread: Record<string, unknown> = { ...params.contextSummary };
  delete summaryWithoutThread.conversationContext;
  const contextJson = JSON.stringify(summaryWithoutThread).slice(0, MAX_CONTEXT_CHARS);
  const thread = toThreadMessages(params.conversationContext);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [
        buildSystemPrompt({ companyName: params.companyName, todayEst: formatEstDate() }),
        '',
        'Background context (pre-computed summary: company profile, sector context, KPI ratios vs industry benchmarks, recent trends). Use the tools for anything beyond this:',
        contextJson,
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
  const logSummary = (outcome: string, rounds: number) => {
    console.log('Ask agent: finished', {
      outcome,
      model,
      reasoningEffort: reasoningEffort || 'default',
      rounds,
      toolCalls,
      llmMs: llmMsTotal,
      toolMs: toolMsTotal,
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
    const completion = await openai.chat.completions.create(
      {
        model,
        messages,
        tools: ASK_DATA_TOOL_DEFINITIONS,
        tool_choice: isLastRound ? 'none' : 'auto',
        max_tokens: reasoningEffort && reasoningEffort !== 'none' ? MAX_TOKENS_WITH_REASONING : MAX_ANSWER_TOKENS,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(providerOptions ? ({ providerOptions } as Record<string, unknown>) : {}),
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { timeout: Math.max(10_000, remaining - 5_000), ...(affinityHeaders ? { headers: affinityHeaders } : {}) },
    );
    const llmMs = Date.now() - llmStartedAt;
    llmMsTotal += llmMs;

    const message = completion.choices[0]?.message;
    const calls = (message?.tool_calls || []).filter((c) => c.type === 'function');
    const usage = completion.usage as
      | (OpenAI.Completions.CompletionUsage & {
          prompt_tokens_details?: { cached_tokens?: number };
          completion_tokens_details?: { reasoning_tokens?: number };
        })
      | undefined;
    const roundLog = {
      round: round + 1,
      llmMs,
      promptTokens: usage?.prompt_tokens ?? null,
      cachedPromptTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
      finishReason: completion.choices[0]?.finish_reason ?? null,
    };

    if (!message) {
      console.log('Ask agent: round', { ...roundLog, toolCalls: [] });
      logSummary('empty_message', round + 1);
      return null;
    }

    if (calls.length > 0) {
      // The gateway's reasoning fields must go back with the tool-call turn so thinking models
      // can continue their reasoning after the tool results.
      const { reasoning, reasoning_details: reasoningDetails } = message as typeof message & { reasoning?: unknown; reasoning_details?: unknown };
      messages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: calls,
        ...(reasoning !== undefined ? { reasoning } : {}),
        ...(reasoningDetails !== undefined ? { reasoning_details: reasoningDetails } : {}),
      } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);
      const described = calls.map((call) => describeToolCall(call.function.name, call.function.arguments));
      const labels = [...new Set(described.map((d) => d.label))];
      progress(labels.length > 3 ? `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more` : labels.join(', '));

      const toolStartedAt = Date.now();
      const toolTimings: Array<{ name: string; dataset?: string; ms: number; chars: number }> = [];
      const results = await Promise.all(
        calls.map(async (call, index) => {
          toolCalls += 1;
          const callStartedAt = Date.now();
          const result = await executeAskDataTool(companyId, call.function.name, call.function.arguments);
          let content = JSON.stringify(result);
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
    const parsed = parseJsonObject(String(message.content || ''));
    if (!parsed || typeof parsed.shortAnswer !== 'string' || !parsed.shortAnswer.trim()) {
      logSummary('unparseable_answer', round + 1);
      return null;
    }
    logSummary('answered', round + 1);

    const bullets = Array.isArray(parsed.citedBullets) ? parsed.citedBullets : [];
    const citedBullets = bullets
      .map((b: any) => {
        const text = String(typeof b === 'string' ? b : b?.text || '').trim();
        if (!text) return null;
        const src = String(b?.source || '').toLowerCase() === 'operations' ? operationsSource : financialSource;
        return { text, citations: [{ url: src.url, title: src.title, publishedDate: src.publishedDate ?? null }] };
      })
      .filter(Boolean) as AskAgentOutput['citedBullets'];

    return {
      shortAnswer: parsed.shortAnswer.trim(),
      longAnswer: String(parsed.longAnswer || '').trim(),
      citedBullets,
      howThisImpactsUs: String(parsed.howThisImpactsUs || '').trim(),
      sources,
      needsClarification: parsed.needsClarification === true,
      toolCalls,
    };
  }
  logSummary('max_rounds', MAX_ROUNDS);
  return null;
}
