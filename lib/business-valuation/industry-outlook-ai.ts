import { getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import type { AiUsageTag } from '@/lib/ai-usage/record';
import type { OutlookWebSource } from './outlook';
import { researchIndustry } from './industry-research';
import {
  buildIndustryOutlookPrompt,
  cleanDraftText,
  extractDraftText,
  finalizeCitations,
  valuationOutlookModel,
  type IndustryOutlookInput,
} from './industry-outlook-prompt';

export async function draftIndustryOutlook(
  input: IndustryOutlookInput,
  usage: AiUsageTag,
): Promise<{ text: string; model: string; sources: OutlookWebSource[]; researchFailures: string[] }> {
  if (getAiTransport() === 'unconfigured') throw new Error('AI drafting is unavailable because no AI provider is configured.');
  const { research, failures } = await researchIndustry(input, usage);
  if (failures.length) console.warn('Business valuation industry research incomplete:', failures);
  const model = valuationOutlookModel();
  const prompt = buildIndustryOutlookPrompt({ ...input, research });
  const result = await createModelText({
    openai: getOpenAiClient(),
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: 0.2,
    maxTokens: 3000,
    timeoutMs: 150000,
    usage,
  });
  const draft = cleanDraftText(extractDraftText(result.text || ''));
  if (!draft) throw new Error('The AI model returned an empty draft. Try again.');
  const { text, sources } = finalizeCitations(draft, research?.sources || []);
  return { text, model, sources, researchFailures: failures };
}
