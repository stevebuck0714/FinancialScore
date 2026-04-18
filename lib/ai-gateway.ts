/**
 * Centralized AI provider config.
 *
 * When AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN on Vercel) is set, all model
 * calls route through Vercel AI Gateway with per-request Zero Data Retention
 * (ZDR) enforced. This means prompts/outputs are NOT retained by upstream
 * providers like OpenAI for any abuse-monitoring window.
 *
 * When neither is set, we fall back to direct OpenAI using OPENAI_API_KEY,
 * which preserves original behavior (used during local dev when no gateway
 * key is provisioned).
 *
 * Reference: https://vercel.com/docs/ai-gateway/capabilities/zdr
 */
import OpenAI from 'openai';

const VERCEL_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
const OPENAI_DIRECT_BASE_URL = 'https://api.openai.com/v1';

export type AiTransport = 'gateway' | 'openai-direct' | 'unconfigured';

function pickGatewayKey(): string | null {
  const k = process.env.AI_GATEWAY_API_KEY?.trim();
  if (k) return k;
  // VERCEL_OIDC_TOKEN is auto-injected on Vercel deployments and works as a
  // gateway credential without any extra configuration.
  const oidc = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (oidc) return oidc;
  return null;
}

export function getAiTransport(): AiTransport {
  if (pickGatewayKey()) return 'gateway';
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai-direct';
  return 'unconfigured';
}

export function isUsingGateway(): boolean {
  return getAiTransport() === 'gateway';
}

export function getApiBaseUrl(): string {
  return isUsingGateway() ? VERCEL_AI_GATEWAY_BASE_URL : OPENAI_DIRECT_BASE_URL;
}

export function getApiKey(): string {
  const k = pickGatewayKey();
  if (k) return k;
  const oai = process.env.OPENAI_API_KEY?.trim();
  if (oai) return oai;
  throw new Error(
    'No AI provider key configured. Set AI_GATEWAY_API_KEY (preferred) or OPENAI_API_KEY.'
  );
}

/**
 * Gateway model strings need a provider prefix (e.g. `openai/gpt-4o`).
 * If we are routing through the gateway and the caller passed a bare model
 * name without a `/`, default the provider to OpenAI so existing env values
 * (`OPENAI_MODEL=gpt-4o`) keep working transparently.
 */
export function resolveModelName(model: string): string {
  const m = String(model || '').trim();
  if (!m) return m;
  if (!isUsingGateway()) return m;
  if (m.includes('/')) return m;
  return `openai/${m}`;
}

/**
 * Provider-options blob to attach to every AI request when going via the
 * gateway. Per-request ZDR is free on Pro/Enterprise plans and means the
 * gateway only routes to providers with a ZDR agreement.
 */
export function getAiProviderOptions(): Record<string, unknown> | undefined {
  if (!isUsingGateway()) return undefined;
  return {
    gateway: {
      zeroDataRetention: true,
    },
  };
}

/**
 * Construct an OpenAI SDK client pointed at the right base URL. Use this
 * everywhere instead of `new OpenAI({ apiKey })`.
 */
export function getOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: getApiBaseUrl(),
  });
}

/** For diagnostics endpoints that want to report the active config. */
export function describeAiConfig(): {
  transport: AiTransport;
  baseUrl: string;
  zdrEnforced: boolean;
  defaultModelHint: string;
} {
  const transport = getAiTransport();
  return {
    transport,
    baseUrl: getApiBaseUrl(),
    zdrEnforced: transport === 'gateway',
    defaultModelHint: resolveModelName(process.env.OPENAI_MODEL || 'gpt-4o'),
  };
}
