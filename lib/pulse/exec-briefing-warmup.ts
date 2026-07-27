type BriefingPeriod = 'daily' | 'monthly' | 'quarterly' | 'annual';

type WarmDailyExecutiveBriefingOptions = {
  companyId: string;
  baseUrl?: string | null;
  force?: boolean;
  source?: string;
  timeoutMs?: number;
  periods?: BriefingPeriod[];
};

export type WarmDailyExecutiveBriefingResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  status?: number;
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function resolveBaseUrl(explicit?: string | null): string {
  const candidates = [
    explicit || '',
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

export async function warmDailyExecutiveBriefingCache(
  options: WarmDailyExecutiveBriefingOptions,
): Promise<WarmDailyExecutiveBriefingResult> {
  const companyId = String(options.companyId || '').trim();
  if (!companyId) return { ok: false, error: 'companyId is required' };

  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return { ok: false, skipped: true, error: 'CRON_SECRET is required to warm Daily Executive Briefing cache.' };
  }

  const baseUrl = resolveBaseUrl(options.baseUrl);
  if (!baseUrl) {
    return { ok: false, skipped: true, error: 'App base URL is required to warm Daily Executive Briefing cache.' };
  }

  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 240000));
  const defaultPeriods: BriefingPeriod[] = ['daily', 'monthly', 'quarterly', 'annual'];
  const periods: BriefingPeriod[] = options.periods?.length ? options.periods : defaultPeriods;
  const warmPeriod = async (period: BriefingPeriod): Promise<WarmDailyExecutiveBriefingResult> => {
    const url = new URL('/api/pulse/exec-briefing', baseUrl);
    url.searchParams.set('companyId', companyId);
    url.searchParams.set('period', period);
    if (options.force !== false) url.searchParams.set('force', 'true');
    if (options.source) url.searchParams.set('source', options.source);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
          ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.ok) return { ok: true, status: response.status };

      let details = response.statusText || `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        details = String(payload?.error || payload?.details || details);
      } catch {
        // Keep the HTTP status text when the response is not JSON.
      }
      return { ok: false, status: response.status, error: `${period}: ${details.slice(0, 500)}` };
    } catch (error: any) {
      const timedOut = error?.name === 'AbortError';
      return {
        ok: false,
        error: timedOut
          ? `${period}: Executive Briefing warm-up timed out after ${timeoutMs}ms.`
          : `${period}: ${String(error?.message || error).slice(0, 500)}`,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  const results = await Promise.all(periods.map((period) => warmPeriod(period)));
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) return { ok: true, status: 200 };
  return {
    ok: false,
    status: failed[0].status,
    error: failed.map((result) => result.error || `HTTP ${result.status || 'unknown'}`).join(' | ').slice(0, 500),
  };
}

export function scheduleDailyExecutiveBriefingWarmup(
  options: WarmDailyExecutiveBriefingOptions,
): void {
  setTimeout(() => {
    warmDailyExecutiveBriefingCache(options)
      .then((result) => {
        if (!result.ok) {
          console.warn('Daily Executive Briefing warm-up failed:', {
            companyId: options.companyId,
            source: options.source,
            error: result.error,
            skipped: result.skipped,
          });
        }
      })
      .catch((error) => {
        console.warn('Daily Executive Briefing warm-up failed:', error);
      });
  }, 0);
}
