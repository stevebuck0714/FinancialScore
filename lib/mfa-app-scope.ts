import type { NextRequest } from 'next/server';

function normalizeHost(raw: string | undefined): string {
  return (raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function parseScopeList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getMfaAppScope(request: NextRequest): string {
  const explicitScope = (process.env.MFA_APP_SCOPE || '').trim().toLowerCase();
  if (explicitScope) {
    return explicitScope;
  }

  const configuredUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const configuredHost = normalizeHost(configuredUrl);
  if (configuredHost) {
    return configuredHost;
  }

  const requestHost = normalizeHost(request.nextUrl.hostname);
  return requestHost || 'unknown-app-scope';
}

export function getAcceptedMfaAppScopes(request: NextRequest): string[] {
  const canonicalScope = getMfaAppScope(request);
  const aliases = parseScopeList(process.env.MFA_APP_SCOPE_ALIASES);
  return Array.from(new Set([canonicalScope, ...aliases]));
}

const CUSTOMER_PRODUCTION_MFA_HOSTS = new Set(['dashboard.corelytics.com']);

/** MFA is required only on the live customer site, not staging/dev Vercel production aliases. */
export function isCustomerProductionMfaHost(request: NextRequest): boolean {
  return isCustomerProductionMfaHostname(request.nextUrl.hostname);
}

export function isCustomerProductionMfaHostname(hostname: string | null | undefined): boolean {
  return CUSTOMER_PRODUCTION_MFA_HOSTS.has(normalizeHost(hostname || '').replace(/:\d+$/, ''));
}

/** Host a plain Request was sent to, preferring the proxy-forwarded host. */
export function requestHostname(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const host = request.headers.get('host');
  if (host) return host;
  try {
    return new URL(request.url).hostname;
  } catch {
    return '';
  }
}

export function isMfaDisabledByEnv(): boolean {
  return process.env.DISABLE_MFA === 'true' || process.env.DISABLE_MFA_DEV === 'true';
}
