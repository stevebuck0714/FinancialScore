import OpenAI from 'openai';
import {
  getApiBaseUrl,
  getApiKey,
  getAiProviderOptions,
  resolveModelName,
} from '@/lib/ai-gateway';

type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function getOpenAiTimeoutMs(): number {
  const raw = process.env.OPENAI_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 45000;
  if (!Number.isFinite(parsed)) return 45000;
  // Keep within sane bounds; this endpoint is interactive.
  return Math.max(1000, Math.min(180000, Math.floor(parsed)));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} timed out after ${ms}ms`) as Error & { code?: string };
          err.code = 'ETIMEDOUT';
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractResponsesText(response: unknown): string {
  const responseRecord =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  if (typeof responseRecord.output_text === 'string' && responseRecord.output_text.trim()) {
    return responseRecord.output_text;
  }

  const output = responseRecord.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === 'output_text' && typeof c?.text === 'string' && c.text.trim()) {
          return c.text;
        }
        // Some variants return plain "text" blocks.
        if (c?.type === 'text') {
          if (typeof c?.text === 'string' && c.text.trim()) return c.text;
          if (typeof c?.text?.value === 'string' && c.text.value.trim()) return c.text.value;
        }
      }
    }
  }

  // Some SDK versions expose a "text" field.
  if (typeof responseRecord.text === 'string' && responseRecord.text.trim()) return responseRecord.text;

  return '';
}

function isLikelyResponsesOnlyModel(model: string): boolean {
  const m = String(model || '').trim().toLowerCase();
  // gpt-5.x and o-series are responses-only in many orgs/configurations.
  if (m.startsWith('gpt-5')) return true;
  if (m.startsWith('o')) return true; // e.g. o3, o4-mini
  return false;
}

async function createResponsesTextViaFetch(params: {
  model: string;
  instructions: string;
  input: string;
  temperature: number;
  maxTokens?: number;
}): Promise<{ text: string; finishReason?: string | null }> {
  const apiKey = getApiKey();
  const baseUrl = getApiBaseUrl();
  const providerOptions = getAiProviderOptions();
  const resolvedModel = resolveModelName(params.model);
  const timeoutMs = getOpenAiTimeoutMs();

  const basePayload: Record<string, unknown> = {
    model: resolvedModel,
    ...(params.instructions ? { instructions: params.instructions } : {}),
    input: params.input,
    ...(typeof params.maxTokens === 'number' ? { max_output_tokens: params.maxTokens } : {}),
    // Enforce JSON when the model supports structured outputs.
    // Responses API supports `text.format`; some SDKs/docs also mention `response_format`.
    text: { format: { type: 'json_object' } },
    response_format: { type: 'json_object' },
    ...(providerOptions ? { providerOptions } : {}),
  };

  const minimalMessagePayload: Record<string, unknown> = {
    model: resolvedModel,
    ...(params.instructions ? { instructions: params.instructions } : {}),
    // Canonical "messages" shape tends to produce more consistent output than a raw string input.
    input: [{ role: 'user', content: params.input }],
    ...(typeof params.maxTokens === 'number' ? { max_output_tokens: params.maxTokens } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  };

  const doRequest = async (payload: Record<string, unknown>) => {
    let res: Response;
    try {
      res = await withTimeout(
        fetch(`${baseUrl}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
        timeoutMs,
        'OpenAI responses request',
      );
    } catch (e: unknown) {
      // Normalize abort/timeout errors into something actionable.
      const msg = String((e as { message?: string })?.message || '');
      if ((e as { code?: string })?.code === 'ETIMEDOUT' || msg.toLowerCase().includes('timed out')) {
        const err = new Error(msg || `OpenAI responses request timed out after ${timeoutMs}ms`) as Error & { code?: string };
        err.code = 'ETIMEDOUT';
        throw err;
      }
      throw e;
    }
    const raw = await res.text().catch(() => '');
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    const requestId =
      res.headers.get('x-request-id') ||
      res.headers.get('x-openai-request-id') ||
      res.headers.get('x-requestid') ||
      null;
    return { res, raw, data, requestId };
  };

  const withoutTemperature = (p: Record<string, unknown>) => {
    const { temperature: _t, ...rest } = p;
    return rest;
  };
  const withoutResponseFormat = (p: Record<string, unknown>) => {
    const { response_format: _rf, ...rest } = p;
    return rest;
  };
  const withoutTextFormat = (p: Record<string, unknown>) => {
    const { text: _text, ...rest } = p;
    return rest;
  };

  // Try with temperature first, then retry without it when the model rejects it.
  let out = await doRequest({ ...basePayload, temperature: params.temperature });
  if (!out.res.ok) {
    const msg = String(out.data?.error?.message || out.raw || '');
    if (out.res.status === 400 && msg.includes("Unsupported parameter: 'temperature'")) {
      out = await doRequest(withoutTemperature(basePayload));
    } else if (out.res.status === 400 && msg.toLowerCase().includes('unsupported parameter')) {
      // Retry by removing unsupported knobs, preferring to keep at least one JSON-enforcing flag.
      if (msg.includes('response_format')) {
        const p1 = withoutResponseFormat({ ...basePayload, temperature: params.temperature });
        out = await doRequest(p1);
        if (!out.res.ok && String(out.data?.error?.message || out.raw || '').includes("Unsupported parameter: 'temperature'")) {
          out = await doRequest(withoutTemperature(p1));
        }
      } else if (msg.includes("'text'") || msg.includes('text.format') || msg.includes('text')) {
        const p1 = withoutTextFormat({ ...basePayload, temperature: params.temperature });
        out = await doRequest(p1);
        if (!out.res.ok && String(out.data?.error?.message || out.raw || '').includes("Unsupported parameter: 'temperature'")) {
          out = await doRequest(withoutTemperature(p1));
        }
      }

      // If still failing because of both, drop both formatting flags.
      if (!out.res.ok) {
        const p2 = withoutTextFormat(withoutResponseFormat({ ...basePayload, temperature: params.temperature }));
        out = await doRequest(p2);
        if (!out.res.ok && String(out.data?.error?.message || out.raw || '').includes("Unsupported parameter: 'temperature'")) {
          out = await doRequest(withoutTemperature(p2));
        }
      }
    }
  }

  if (!out.res.ok) {
    const msg = String(out.data?.error?.message || out.raw || `OpenAI responses error (${out.res.status})`);
    const err = new Error(msg) as Error & {
      status?: number;
      code?: string | null;
      type?: string | null;
      requestId?: string | null;
    };
    err.status = out.res.status;
    err.code = out.data?.error?.code ?? null;
    err.type = out.data?.error?.type ?? null;
    err.requestId = out.requestId;
    throw err;
  }

  let text = extractResponsesText(out.data);
  if (!text.trim()) {
    // Make this debuggable in production without logging sensitive prompt text.
    const output = Array.isArray(out.data?.output) ? out.data.output : [];
    const outputTypes = output.map((x: unknown) => String((x as { type?: string })?.type || 'unknown'));
    const contentTypes = output
      .flatMap((x: unknown) => (Array.isArray((x as { content?: unknown[] })?.content) ? (x as { content?: unknown[] }).content! : []))
      .map((c: unknown) => String((c as { type?: string })?.type || 'unknown'));

    // Some models can return a "reasoning-only" output item with no message/text.
    // When that happens, retry once with a minimal payload (no formatting flags) to
    // force a normal text response.
    if (outputTypes.length === 1 && outputTypes[0] === 'reasoning' && contentTypes.length === 0) {
      const retry1 = await doRequest(minimalMessagePayload);
      if (retry1.res.ok) {
        const retryText = extractResponsesText(retry1.data);
        if (retryText.trim()) {
          return {
            text: retryText,
            finishReason: retry1.data?.output?.[0]?.finish_reason ?? retry1.data?.finish_reason ?? null,
          };
        }
      }

      // Last attempt: request plain text output explicitly (still expects JSON because our prompt says so).
      const retry2 = await doRequest({ ...minimalMessagePayload, text: { format: { type: 'text' } } });
      if (retry2.res.ok) {
        const retryText = extractResponsesText(retry2.data);
        if (retryText.trim()) {
          return {
            text: retryText,
            finishReason: retry2.data?.output?.[0]?.finish_reason ?? retry2.data?.finish_reason ?? null,
          };
        }
      }

      const err = new Error(
        `Empty model response (responses). requestId=${out.requestId || 'unknown'} retry1=${retry1.requestId || 'unknown'} retry2=${retry2.requestId || 'unknown'} outputTypes=${JSON.stringify(
          outputTypes.slice(0, 8),
        )} contentTypes=${JSON.stringify(contentTypes.slice(0, 12))}`,
      ) as Error & { requestId?: string | null; retryRequestId?: string | null };
      err.requestId = out.requestId;
      err.retryRequestId = retry1.requestId || retry2.requestId || null;
      throw err;
    }

    if (process.env.OPENAI_DEBUG === 'true') {
      console.error('OpenAI responses: empty text', {
        model: params.model,
        requestId: out.requestId,
        status: out.res.status,
        outputTypes,
        contentTypes,
        hasOutputText: typeof out.data?.output_text === 'string' ? out.data.output_text.length : 0,
      });
    }

    const err = new Error(
      `Empty model response (responses). requestId=${out.requestId || 'unknown'} outputTypes=${JSON.stringify(
        outputTypes.slice(0, 8),
      )} contentTypes=${JSON.stringify(contentTypes.slice(0, 12))}`
    ) as Error & { requestId?: string | null };
    err.requestId = out.requestId;
    throw err;
  }
  const finishReason = out.data?.output?.[0]?.finish_reason ?? out.data?.finish_reason ?? null;
  return { text, finishReason };
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
  const timeoutMs = getOpenAiTimeoutMs();

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
    const r = await createResponsesTextViaFetch({
      model,
      instructions,
      input,
      temperature,
      maxTokens,
    });
    return { text: r.text, finishReason: r.finishReason ?? null, api: 'responses' };
  } catch (e: unknown) {
    // If the model is responses-only, do not fall back to chat.
    if (isLikelyResponsesOnlyModel(model)) throw e;
    // Otherwise, try chat completions.
  }

  const chatProviderOptions = getAiProviderOptions();
  const completion = await withTimeout(
    openai.chat.completions.create({
      model: resolveModelName(model),
      messages,
      temperature,
      ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
      // Helps JSON-heavy prompts; models that don't support it will error, but those
      // should be handled by the Responses path above.
      response_format: { type: 'json_object' } as { type: 'json_object' },
      ...(chatProviderOptions ? ({ providerOptions: chatProviderOptions } as Record<string, unknown>) : {}),
    } as Parameters<typeof openai.chat.completions.create>[0]),
    timeoutMs,
    'OpenAI chat request',
  );

  const text = completion.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Empty model response (chat)');
  const finishReason = completion.choices[0]?.finish_reason ?? null;
  return { text, finishReason, api: 'chat' };
}

