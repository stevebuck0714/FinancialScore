import OpenAI from 'openai';

export type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function extractResponsesText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const output = response?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === 'output_text' && typeof c?.text === 'string' && c.text.trim()) {
          return c.text;
        }
      }
    }
  }

  // Some SDK versions expose a "text" field.
  if (typeof response?.text === 'string' && response.text.trim()) return response.text;

  return '';
}

function looksLikeResponsesOnlyModelError(e: any): boolean {
  const msg = String(e?.message || '');
  return msg.includes('only supported in v1/responses') && msg.includes('v1/chat/completions');
}

/**
 * Produce a single assistant text output for a prompt. Uses Responses API first,
 * falls back to Chat Completions when needed.
 *
 * We intentionally do NOT rely on structured output params here; callers can
 * enforce JSON via prompt + their own parsing.
 */
export async function createModelText(params: {
  openai: OpenAI;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number; // chat max_tokens; mapped to responses max_output_tokens
}): Promise<{ text: string; finishReason?: string | null; api: 'responses' | 'chat' }> {
  const { openai, model, messages, temperature = 0.2, maxTokens } = params;

  // 1) Prefer Responses API (required for gpt-5.x and some newer models).
  // Responses expects `instructions` instead of `system` messages.
  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
    .trim();

  const nonSystem = messages.filter((m) => m.role !== 'system');
  const input =
    nonSystem.length === 1 && nonSystem[0]?.role === 'user'
      ? nonSystem[0].content
      : nonSystem.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  try {
    const response = await (openai as any).responses.create({
      model,
      ...(instructions ? { instructions } : {}),
      input,
      temperature,
      ...(typeof maxTokens === 'number' ? { max_output_tokens: maxTokens } : {}),
    });

    const text = extractResponsesText(response);
    if (!text.trim()) throw new Error('Empty model response (responses)');
    // Responses API doesn't always provide a finish reason in the same shape; best-effort.
    const finishReason = response?.output?.[0]?.finish_reason ?? response?.finish_reason ?? null;
    return { text, finishReason, api: 'responses' };
  } catch (e: any) {
    // If the model is responses-only, we must NOT fall back to chat.
    if (looksLikeResponsesOnlyModelError(e)) throw e;
    // Otherwise, try chat completions.
  }

  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    // Helps JSON-heavy prompts; models that don't support it will error, but those
    // should be handled by the Responses path above.
    response_format: { type: 'json_object' } as any,
  });

  const text = completion.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Empty model response (chat)');
  const finishReason = completion.choices[0]?.finish_reason ?? null;
  return { text, finishReason, api: 'chat' };
}

