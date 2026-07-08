type ScheduleQuickBooksDesktopPostSyncReprocessOptions = {
  companyId: string;
  source?: string;
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

export function scheduleQuickBooksDesktopPostSyncReprocess(
  options: ScheduleQuickBooksDesktopPostSyncReprocessOptions,
): void {
  setTimeout(async () => {
    const companyId = String(options.companyId || '').trim();
    if (!companyId) return;

    const baseUrl = resolveBaseUrl();
    if (!baseUrl) {
      console.warn('QBD post-sync financial reprocess skipped: app base URL is not configured.', {
        companyId,
        source: options.source,
      });
      return;
    }

    const url = new URL('/api/financials/reprocess-mappings', baseUrl);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 240000);
    try {
      const cronSecret = String(process.env.CRON_SECRET || '').trim();
      const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cronSecret ? { authorization: `Bearer ${cronSecret}` } : {}),
          ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
        },
        body: JSON.stringify({
          companyId,
          mode: 'through',
          source: options.source || 'qbd-web-connector-finalize',
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        let details = response.statusText || `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          details = String(payload?.error || payload?.message || payload?.details || details);
        } catch {
          // Keep HTTP status text when the response is not JSON.
        }
        console.warn('QBD post-sync financial reprocess failed:', {
          companyId,
          source: options.source,
          status: response.status,
          error: details.slice(0, 500),
        });
      }
    } catch (error: any) {
      console.warn('QBD post-sync financial reprocess failed:', {
        companyId,
        source: options.source,
        error: String(error?.message || error).slice(0, 500),
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }, 0);
}
