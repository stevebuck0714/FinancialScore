import type OpenAI from 'openai';
import { getAiProviderOptions, resolveModelName } from '@/lib/ai-gateway';
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
    '- Prefer monthly_financials for month/year P&L and balance sheet questions; use operational datasets for customers, products, orders, inventory, AR/AP, vendors, GL detail.',
    '- Datasets named "<source>.<dataset>" come from connected operational systems (HR/payroll, CRM, field ops, spreadsheets); use them for headcount, payroll, pipeline, activity and other operational questions.',
    '- If a dataset has dataMode MOCK (or a result has dataNote), it is sample data: say the figures are sample data pending the live connection.',
    '- Cross-check when two sources overlap (e.g. monthly_financials revenue vs customer_sales) and say which you used.',
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
}): Promise<AskAgentOutput | null> {
  const { openai, companyId, question, sources } = params;
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

  const providerOptions = getAiProviderOptions();
  let toolCalls = 0;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const remaining = params.deadlineMs - Date.now();
    if (remaining < 15_000) return null;
    const isLastRound = round === MAX_ROUNDS - 1 || remaining < 45_000;

    const completion = await openai.chat.completions.create(
      {
        model: resolveModelName(params.model),
        messages,
        tools: ASK_DATA_TOOL_DEFINITIONS,
        tool_choice: isLastRound ? 'none' : 'auto',
        max_tokens: 4000,
        ...(providerOptions ? ({ providerOptions } as Record<string, unknown>) : {}),
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { timeout: Math.max(10_000, remaining - 5_000) },
    );

    const message = completion.choices[0]?.message;
    if (!message) return null;
    const calls = (message.tool_calls || []).filter((c) => c.type === 'function');

    if (calls.length > 0) {
      messages.push({ role: 'assistant', content: message.content || null, tool_calls: calls });
      const results = await Promise.all(
        calls.map(async (call) => {
          toolCalls += 1;
          const result = await executeAskDataTool(companyId, call.function.name, call.function.arguments);
          let content = JSON.stringify(result);
          if (content.length > MAX_TOOL_RESULT_CHARS) {
            content = `${content.slice(0, MAX_TOOL_RESULT_CHARS)}... [truncated; narrow the query with filters, groupBy, or a smaller limit]`;
          }
          return { role: 'tool' as const, tool_call_id: call.id, content };
        }),
      );
      messages.push(...results);
      continue;
    }

    const parsed = parseJsonObject(String(message.content || ''));
    if (!parsed || typeof parsed.shortAnswer !== 'string' || !parsed.shortAnswer.trim()) return null;

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
  return null;
}
