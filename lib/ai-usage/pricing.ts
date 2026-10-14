/**
 * Provider list prices in USD per 1M tokens, used only when the provider/gateway response
 * does not report a cost. Update when vendor pricing changes; unknown models record no cost.
 */
type ModelPrice = { input: number; cachedInput?: number; cacheWrite?: number; output: number };

const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5.5': { input: 4, cachedInput: 0.2, cacheWrite: 5, output: 20 },
  'gpt-4.1': { input: 2, cachedInput: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  sonar: { input: 1, output: 1 },
  'sonar-pro': { input: 3, output: 15 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

function priceForModel(model: string): ModelPrice | null {
  const key = String(model || '').trim().toLowerCase();
  const bare = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
  return MODEL_PRICES[bare] ?? null;
}

/** promptTokens includes cached and cache-write tokens (OpenAI-compatible usage convention). */
export function estimateCostUsd(
  model: string,
  tokens: { promptTokens: number; cachedPromptTokens: number; cacheWriteTokens: number; completionTokens: number },
): number | null {
  const price = priceForModel(model);
  if (!price) return null;
  const cached = Math.min(tokens.cachedPromptTokens, tokens.promptTokens);
  const written = Math.min(tokens.cacheWriteTokens, tokens.promptTokens - cached);
  const fresh = tokens.promptTokens - cached - written;
  const usd =
    fresh * price.input +
    cached * (price.cachedInput ?? price.input) +
    written * (price.cacheWrite ?? price.input) +
    tokens.completionTokens * price.output;
  return usd / 1_000_000;
}
