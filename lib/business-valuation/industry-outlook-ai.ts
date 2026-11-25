import { getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import type { AiUsageTag } from '@/lib/ai-usage/record';
import { buildIndustryOutlookPrompt, cleanDraftText, extractDraftText, valuationOutlookModel, type IndustryOutlookInput } from './industry-outlook-prompt';

export async function draftIndustryOutlook(input: IndustryOutlookInput, usage: AiUsageTag): Promise<{ text: string; model: string }> {
  if (getAiTransport() === 'unconfigured') throw new Error('AI drafting is unavailable because no AI provider is configured.');
  const model = valuationOutlookModel();
  const prompt = buildIndustryOutlookPrompt(input);
  const result = await createModelText({
    openai: getOpenAiClient(),
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: 0.2,
    maxTokens: 1500,
    timeoutMs: 90000,
    usage,
  });
  const text = cleanDraftText(extractDraftText(result.text || ''));
  if (!text) throw new Error('The AI model returned an empty draft. Try again.');
  return { text, model };
}
