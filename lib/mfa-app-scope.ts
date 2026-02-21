import type { NextRequest } from 'next/server';

function normalizeHost(raw: string | undefined): string {
  return (raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
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
