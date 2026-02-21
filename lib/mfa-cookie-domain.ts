import type { NextRequest } from 'next/server';

function normalizeHost(raw: string | undefined): string {
  return (raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function parseUrlHost(rawUrl: string | undefined): string {
  const value = (rawUrl || '').trim();
  if (!value) return '';

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return normalizeHost(value);
  }
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function getMfaCookieDomain(request: NextRequest): string | undefined {
  const explicitDomain = normalizeHost(process.env.MFA_COOKIE_DOMAIN);
  if (explicitDomain) return explicitDomain;

  const configuredHost = parseUrlHost(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL);
  const requestHost = normalizeHost(request.nextUrl.hostname);
  const host = configuredHost || requestHost;

  if (!host || host === 'localhost' || isIpAddress(host) || host.endsWith('.vercel.app')) {
    return undefined;
  }

  return host.startsWith('www.') ? host.slice(4) : host;
}
