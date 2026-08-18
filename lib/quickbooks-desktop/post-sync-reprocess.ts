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

function monthKeysInclusive(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
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

    let details = response.statusText || `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      const failed = payload?.ok === false || payload?.success === false;
      details = String(payload?.error || payload?.message || payload?.details || details);
      if (response.ok && !failed) return { ok: true, status: response.status };
      return { ok: false, status: response.status, error: details.slice(0, 500) };
    } catch {
      if (response.ok) return { ok: true, status: response.status };
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
  const rebuildMonths = monthKeysInclusive(startDate, endDate);
  const targetMonth = rebuildMonths[rebuildMonths.length - 1] || monthKey(endDate || startDate);
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  const commonHeaders = {
    'content-type': 'application/json',
    ...(cronSecret ? { authorization: `Bearer ${cronSecret}`, 'x-infor-sync-worker-secret': cronSecret } : {}),
    ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
  };

  const dailyUrl = new URL('/api/financials/reprocess-mappings', baseUrl);
  let dailyFinancials: PostSyncStepResult = targetMonth
    ? { ok: true }
    : { ok: false, error: 'targetMonth is required for QBD daily financial rebuild.' };
  for (const month of rebuildMonths.length ? rebuildMonths : targetMonth ? [targetMonth] : []) {
    dailyFinancials = await postJson(
      dailyUrl,
      {
        companyId,
        targetMonth: month,
        mode: 'single',
        dailyOnly: true,
        source: options.source || 'qbd-web-connector-finalize',
      },
      commonHeaders,
      180000,
    );
    if (!dailyFinancials.ok) break;
  }
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
