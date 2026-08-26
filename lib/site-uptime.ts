import { isProductionSite } from '@/lib/db-security';
import { sendSiteUptimeAlert } from '@/lib/email';

export type SiteUptimeCheck = {
  id: string;
  name: string;
  status: 'pass' | 'fail';
  detail: string;
};

export type SiteUptimeReport = {
  ok: boolean;
  skipped?: boolean;
  ranAt: string;
  durationMs: number;
  baseUrl: string;
  checks: SiteUptimeCheck[];
  email: {
    sent: boolean;
    reason?: string;
  };
};

const ALERT_RECIPIENT = 'support@corelytics.com';
const PRODUCTION_UPTIME_BASE_URL = 'https://dashboard.corelytics.com';

function appBaseUrl(fallbackOrigin?: string): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    fallbackOrigin ||
    ''
  ).replace(/\/+$/, '');
}

function hostFromUrl(url: string): string {
  return String(url || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

function isNonProductionUptimeHost(url: string): boolean {
  const host = hostFromUrl(url);
  return host.includes('staging') || host.endsWith('.vercel.app') || host.includes('localhost');
}

async function fetchCheck(
  baseUrl: string,
  path: string,
  opts?: { expectStatuses?: number[]; requireJsonOk?: boolean; timeoutMs?: number },
): Promise<SiteUptimeCheck> {
  const id = path === '/' ? 'home' : path.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  const name = path === '/' ? 'Home page' : path;
  if (!baseUrl) {
    return { id, name, status: 'fail', detail: 'App base URL is not configured' };
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
    if (!expectStatuses.includes(res.status)) {
      return { id, name, status: 'fail', detail: `HTTP ${res.status} (expected ${expectStatuses.join(' or ')})` };
    }
    if (opts?.requireJsonOk) {
      const body = (await res.json()) as { ok?: boolean };
      if (!body?.ok) {
        return { id, name, status: 'fail', detail: 'Probe returned ok=false' };
      }
    }
    return { id, name, status: 'pass', detail: `HTTP ${res.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      name,
      status: 'fail',
      detail: message.includes('abort') ? `Timed out after ${timeoutMs}ms` : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runSiteUptime(options?: {
  baseUrl?: string;
  sendEmail?: boolean;
}): Promise<SiteUptimeReport> {
  const startedAt = Date.now();
  const ranAt = new Date().toISOString();
  const configuredUrl = appBaseUrl(options?.baseUrl);
  const sendEmail = options?.sendEmail !== false;

  // Staging Vercel projects also have VERCEL_ENV=production. Do not probe or
  // email unless this is the customer production site.
  if (!isProductionSite() || isNonProductionUptimeHost(configuredUrl)) {
    return {
      ok: true,
      skipped: true,
      ranAt,
      durationMs: Date.now() - startedAt,
      baseUrl: configuredUrl,
      checks: [],
      email: { sent: false, reason: 'Site uptime checks dashboard.corelytics.com only' },
    };
  }

  const baseUrl = PRODUCTION_UPTIME_BASE_URL;

  const checks = [
    await fetchCheck(baseUrl, '/api/public/up', {
      expectStatuses: [200],
      requireJsonOk: true,
      timeoutMs: 20000,
    }),
    await fetchCheck(baseUrl, '/', {
      expectStatuses: [200, 307, 308],
      timeoutMs: 25000,
    }),
  ];

  const ok = checks.every((check) => check.status === 'pass');
  const durationMs = Date.now() - startedAt;
  let email: SiteUptimeReport['email'] = { sent: false, reason: 'Email skipped' };

  if (sendEmail && !ok) {
    const mail = await sendSiteUptimeAlert({
      to: ALERT_RECIPIENT,
      ranAt,
      durationMs,
      baseUrl,
      checks,
    });
    email = {
      sent: Boolean(mail.success),
      reason: mail.success ? undefined : String(mail.reason || mail.error || 'Email send failed'),
    };
  } else if (ok) {
    email = { sent: false, reason: 'All checks passed' };
  }

  return { ok, ranAt, durationMs, baseUrl, checks, email };
}
