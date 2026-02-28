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
