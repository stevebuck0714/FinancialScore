import type { NextRequest } from 'next/server';

function normalizeHost(raw: string | undefined): string {
  return (raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function getMfaAppScope(request: NextRequest): string {
  const requestHost = normalizeHost(request.nextUrl.hostname);
  const configuredUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const configuredHost = normalizeHost(configuredUrl);

  // Prefer request host in runtime so each deployed app/domain scopes MFA correctly.
  return requestHost || configuredHost || 'unknown-app-scope';
}
