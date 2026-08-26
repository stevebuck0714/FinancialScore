import prisma from '@/lib/prisma';
import {
  describeAiConfig,
  getAiTransport,
  getOpenAiClient,
  resolveModelName,
} from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { sendMorningSmokeReport } from '@/lib/email';

export type SmokeCheckStatus = 'pass' | 'fail' | 'warn';

export type SmokeCheckResult = {
  id: string;
  name: string;
  status: SmokeCheckStatus;
  detail: string;
  durationMs: number;
};

export type MorningSmokeReport = {
  ok: boolean;
  ranAt: string;
  durationMs: number;
  baseUrl: string;
  checks: SmokeCheckResult[];
  summary: {
    passed: number;
    failed: number;
    warned: number;
  };
  email: {
    sent: boolean;
    reason?: string;
  };
};

const MODEL_ENV_KEYS = [
  'OPENAI_MODEL',
  'OPENAI_MODEL_ASK',
  'OPENAI_MODEL_DOCS',
  'OPENAI_MODEL_EXEC_BRIEFING',
  'OPENAI_MODEL_INDUSTRY_BRIEF_FINAL',
  'OPENAI_MODEL_INDUSTRY_BRIEF_SCAN',
  'OPENAI_MODEL_WEB_RESEARCH',
  'OPENAI_MODEL_BUSINESS_CONTEXT',
  'OPENAI_MODEL_CUSTOM_REPORTS',
  'OPENAI_EMBEDDING_MODEL',
] as const;

const REQUIRED_MODEL_ENV_KEYS = new Set([
  'OPENAI_MODEL_INDUSTRY_BRIEF_FINAL',
  'OPENAI_MODEL_INDUSTRY_BRIEF_SCAN',
]);

const SMOKE_RECIPIENT = 'support@corelytics.com';

function appBaseUrl(fallbackOrigin?: string): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    fallbackOrigin ||
    ''
  ).replace(/\/+$/, '');
}

async function timedCheck(
  id: string,
  name: string,
  run: () => Promise<{ status: SmokeCheckStatus; detail: string }>,
): Promise<SmokeCheckResult> {
  const started = Date.now();
  try {
    const result = await run();
    return { id, name, status: result.status, detail: result.detail, durationMs: Date.now() - started };
  } catch (error) {
    return {
      id,
      name,
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }
}

async function fetchGatewayModelIds(): Promise<Set<string>> {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gateway model catalog HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = new Set<string>();
  for (const row of Array.isArray(body.data) ? body.data : []) {
    const id = String(row?.id || '').trim();
    if (id) ids.add(id);
  }
  if (ids.size === 0) {
    throw new Error('Gateway model catalog returned zero models');
  }
  return ids;
}

async function httpCheck(
  baseUrl: string,
  path: string,
  opts?: { expectStatuses?: number[]; timeoutMs?: number },
): Promise<{ status: SmokeCheckStatus; detail: string }> {
  if (!baseUrl) {
    return { status: 'fail', detail: 'App base URL is not configured' };
  }
  const expectStatuses = opts?.expectStatuses || [200];
  const timeoutMs = opts?.timeoutMs || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/html' },
    });
    const ok = expectStatuses.includes(res.status);
    return {
      status: ok ? 'pass' : 'fail',
      detail: `HTTP ${res.status} (expected ${expectStatuses.join(' or ')})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'fail', detail: message.includes('abort') ? `Timed out after ${timeoutMs}ms` : message };
  } finally {
    clearTimeout(timer);
  }
}

export async function runMorningSmoke(options?: {
  baseUrl?: string;
  sendEmail?: boolean;
}): Promise<MorningSmokeReport> {
  const startedAt = Date.now();
  const ranAt = new Date().toISOString();
  const baseUrl = appBaseUrl(options?.baseUrl);
  const sendEmail = options?.sendEmail !== false;
  const checks: SmokeCheckResult[] = [];

  checks.push(
    await timedCheck('db-ping', 'Database connectivity', async () => {
      await prisma.$queryRaw`SELECT 1`;
      const companyCount = await prisma.company.count();
      return { status: 'pass', detail: `Database reachable; companies=${companyCount}` };
    }),
  );

  checks.push(
    await timedCheck('app-home', 'App home page', () =>
      httpCheck(baseUrl, '/', { expectStatuses: [200, 307, 308], timeoutMs: 25000 }),
    ),
  );

  checks.push(
    await timedCheck('auth-session', 'Auth session endpoint', () =>
      httpCheck(baseUrl, '/api/auth/session', { expectStatuses: [200], timeoutMs: 20000 }),
    ),
  );

  checks.push(
    await timedCheck('check-db', 'Public DB health endpoint', () =>
      httpCheck(baseUrl, '/api/check-db', { expectStatuses: [200], timeoutMs: 25000 }),
    ),
  );

  checks.push(
    await timedCheck('public-up', 'Public uptime probe', () =>
      httpCheck(baseUrl, '/api/public/up', { expectStatuses: [200], timeoutMs: 20000 }),
    ),
  );

  checks.push(
    await timedCheck('exec-briefing-route', 'Exec briefing route registered', () =>
      httpCheck(baseUrl, '/api/pulse/exec-briefing', { expectStatuses: [401, 403], timeoutMs: 20000 }),
    ),
  );

  checks.push(
    await timedCheck('industry-brief-route', 'Industry brief route registered', () =>
      httpCheck(baseUrl, '/api/industry-brief', { expectStatuses: [401, 403], timeoutMs: 20000 }),
    ),
  );

  checks.push(
    await timedCheck('ai-transport', 'AI transport configuration', async () => {
      const transport = getAiTransport();
      const cfg = describeAiConfig();
      if (transport === 'unconfigured') {
        return { status: 'fail', detail: 'No AI provider configured (gateway or OPENAI_API_KEY)' };
      }
      return {
        status: 'pass',
        detail: `transport=${transport}; baseUrl=${cfg.baseUrl}; zdr=${cfg.zdrEnforced}; defaultHint=${cfg.defaultModelHint}`,
      };
    }),
  );

  checks.push(
    await timedCheck('ai-model-catalog', 'Configured OpenAI models vs Gateway catalog', async () => {
      const configured: Array<{ env: string; value: string; resolved: string }> = [];
      const missingRequired: string[] = [];

      for (const env of MODEL_ENV_KEYS) {
        const value = String(process.env[env] || '').trim();
        if (!value) {
          if (REQUIRED_MODEL_ENV_KEYS.has(env)) missingRequired.push(env);
          continue;
        }
        configured.push({ env, value, resolved: resolveModelName(value) });
      }

      if (missingRequired.length > 0) {
        return {
          status: 'fail',
          detail: `Missing required model env: ${missingRequired.join(', ')}`,
        };
      }

      if (configured.length === 0) {
        return {
          status: 'warn',
          detail: 'No OPENAI_MODEL* env vars set; code will fall back to gpt-4o defaults where allowed',
        };
      }

      const catalog = await fetchGatewayModelIds();
      const missing = configured.filter((row) => !catalog.has(row.resolved));
      if (missing.length > 0) {
        return {
          status: 'fail',
          detail: `Not in Gateway catalog: ${missing
            .map((row) => `${row.env}=${row.value} → ${row.resolved}`)
            .join('; ')}`,
        };
      }

      return {
        status: 'pass',
        detail: `Validated ${configured.length} model(s): ${configured
          .map((row) => `${row.env}=${row.resolved}`)
          .join(', ')}`,
      };
    }),
  );

  checks.push(
    await timedCheck('ai-live-call', 'Live AI smoke call', async () => {
      const transport = getAiTransport();
      if (transport === 'unconfigured') {
        return { status: 'fail', detail: 'AI transport unconfigured; skipped live call' };
      }
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      const openai = getOpenAiClient();
      const resp = await createModelText({
        openai,
        model,
        messages: [
          {
            role: 'user',
            content: 'Reply with JSON only: {"ok":true}',
          },
        ],
        temperature: 0,
        maxTokens: 40,
        timeoutMs: 45000,
      });
      const text = String(resp.text || '').trim();
      if (!text) {
        return { status: 'fail', detail: `Empty AI response via ${resp.api} model=${resolveModelName(model)}` };
      }
      return {
        status: 'pass',
        detail: `api=${resp.api}; model=${resolveModelName(model)}; bytes=${text.length}`,
      };
    }),
  );

  const summary = {
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    warned: checks.filter((c) => c.status === 'warn').length,
  };
  const ok = summary.failed === 0;
  const durationMs = Date.now() - startedAt;

  let emailResult: MorningSmokeReport['email'] = { sent: false, reason: 'Email skipped' };
  if (sendEmail) {
    const mail = await sendMorningSmokeReport({
      to: SMOKE_RECIPIENT,
      ok,
      ranAt,
      durationMs,
      baseUrl,
      checks,
      summary,
    });
    emailResult = {
      sent: Boolean(mail.success),
      reason: mail.success ? undefined : String(mail.reason || mail.error || 'Email send failed'),
    };
  }

  return {
    ok,
    ranAt,
    durationMs,
    baseUrl,
    checks,
    summary,
    email: emailResult,
  };
}
