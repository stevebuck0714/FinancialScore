type ScheduleQuickBooksDesktopPostSyncReprocessOptions = {
  companyId: string;
  source?: string;
  startDate?: string | null;
  endDate?: string | null;
};

type PostSyncStepResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function resolveBaseUrl(): string {
  const candidates = [
    process.env.NEXTAUTH_URL || '',
    process.env.NEXT_PUBLIC_APP_URL || '',
    process.env.WORKER_BASE_URL || '',
    process.env.VERCEL_URL || '',
  ];
  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function parseDate(value: unknown): string {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? '' : text;
}

function monthKey(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : '';
}

async function postJson(
  url: URL,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<PostSyncStepResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.ok) return { ok: true, status: response.status };

    let details = response.statusText || `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      details = String(payload?.error || payload?.message || payload?.details || details);
    } catch {
      // Keep HTTP status text when the response is not JSON.
    }
    return { ok: false, status: response.status, error: details.slice(0, 500) };
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    return {
      ok: false,
      error: timedOut
        ? `Timed out after ${timeoutMs}ms.`
        : String(error?.message || error).slice(0, 500),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function runQuickBooksDesktopPostSyncReprocess(
  options: ScheduleQuickBooksDesktopPostSyncReprocessOptions,
): Promise<{ dailyFinancials: PostSyncStepResult; arApAging: PostSyncStepResult | null }> {
  const companyId = String(options.companyId || '').trim();
  if (!companyId) {
    return {
      dailyFinancials: { ok: false, error: 'companyId is required' },
      arApAging: null,
    };
  }

  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    const result = { ok: false, error: 'App base URL is not configured.' };
    console.warn('QBD post-sync reprocess skipped:', {
      companyId,
      source: options.source,
      error: result.error,
    });
    return { dailyFinancials: result, arApAging: null };
  }

  const startDate = parseDate(options.startDate);
  const endDate = parseDate(options.endDate);
  const targetMonth = monthKey(endDate || startDate);
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  const commonHeaders = {
    'content-type': 'application/json',
    ...(cronSecret ? { authorization: `Bearer ${cronSecret}`, 'x-infor-sync-worker-secret': cronSecret } : {}),
    ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
  };

  const dailyUrl = new URL('/api/financials/reprocess-mappings', baseUrl);
  const dailyFinancials = await postJson(
    dailyUrl,
    {
      companyId,
      mode: targetMonth ? 'only' : 'through',
      ...(targetMonth ? { targetMonth } : {}),
      source: options.source || 'qbd-web-connector-finalize',
    },
    commonHeaders,
    180000,
  );
  if (!dailyFinancials.ok) {
    console.warn('QBD post-sync daily financial rebuild failed:', {
      companyId,
      source: options.source,
      targetMonth: targetMonth || null,
      status: dailyFinancials.status,
      error: dailyFinancials.error,
    });
  }

  let arApAging: PostSyncStepResult | null = null;
  if (startDate && endDate) {
    const agingUrl = new URL('/api/quickbooks-desktop/rebuild-ar-ap-aging', baseUrl);
    arApAging = await postJson(
      agingUrl,
      { companyId, startDate, endDate },
      commonHeaders,
      90000,
    );
    if (!arApAging.ok) {
      console.warn('QBD post-sync AR/AP rebuild failed:', {
        companyId,
        source: options.source,
        startDate,
        endDate,
        status: arApAging.status,
        error: arApAging.error,
      });
    }
  }

  return { dailyFinancials, arApAging };
}

export function scheduleQuickBooksDesktopPostSyncReprocess(
  options: ScheduleQuickBooksDesktopPostSyncReprocessOptions,
): void {
  setTimeout(() => {
    runQuickBooksDesktopPostSyncReprocess(options).catch((error) => {
      console.warn('QBD post-sync reprocess failed:', {
        companyId: options.companyId,
        source: options.source,
        error: String(error?.message || error).slice(0, 500),
      });
    });
  }, 0);
}
