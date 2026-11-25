import { type AiUsageTag, emptyAiUsageCounts, recordAiUsage, usageFromResponse } from '@/lib/ai-usage/record';
import {
  INDUSTRY_RESEARCH_SYSTEM,
  industryResearchQuestions,
  mergeResearch,
  perplexityDate,
  type IndustryOutlookInput,
  type IndustryResearch,
  type ResearchReply,
} from './industry-outlook-prompt';

const RESEARCH_MODEL = 'sonar-pro';
const RESEARCH_TIMEOUT_MS = 60000;

async function askPerplexity(apiKey: string, title: string, prompt: string, valuationDate: string, usage: AiUsageTag): Promise<ResearchReply> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      messages: [
        { role: 'system', content: INDUSTRY_RESEARCH_SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      search_before_date_filter: perplexityDate(valuationDate),
    }),
    signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => ({}));
  void recordAiUsage({
    tag: usage,
    model: `perplexity/${RESEARCH_MODEL}`,
    outcome: response.ok ? 'ok' : 'error',
    counts: usageFromResponse(result) ?? emptyAiUsageCounts(),
  });
  if (!response.ok) throw new Error(result?.error?.message || `Perplexity research failed (${response.status})`);
  const urls: string[] = Array.isArray(result?.citations) ? result.citations.map((item: unknown) => String(item || '').trim()) : [];
  const details: Array<Record<string, unknown>> = Array.isArray(result?.search_results) ? result.search_results : [];
  return {
    title,
    content: String(result?.choices?.[0]?.message?.content || ''),
    citations: urls.map((url, index) => {
      const detail = details.find((item) => item?.url === url) || details[index];
      const date = String(detail?.date || '').slice(0, 10);
      return { url, title: detail?.title ? String(detail.title) : null, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null };
    }),
  };
}

/** Researches the industry on the web as of the valuation date. Returns null when research is unavailable. */
export async function researchIndustry(
  input: Pick<IndustryOutlookInput, 'companyName' | 'industryName' | 'industryCode' | 'location' | 'valuationDate'>,
  usage: AiUsageTag,
): Promise<{ research: IndustryResearch | null; failures: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) return { research: null, failures: ['PERPLEXITY_API_KEY is not configured'] };
  const questions = industryResearchQuestions(input);
  const settled = await Promise.allSettled(questions.map((question) => askPerplexity(apiKey, question.title, question.prompt, input.valuationDate, usage)));
  const replies = settled.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []));
  const failures = settled.flatMap((item, index) => (item.status === 'rejected' ? [`${questions[index].title}: ${item.reason instanceof Error ? item.reason.message : String(item.reason)}`] : []));
  if (replies.length === 0) return { research: null, failures };
  return { research: mergeResearch(replies, input.valuationDate), failures };
}
