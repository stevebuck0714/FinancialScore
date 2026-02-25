import type { NextRequest, NextResponse } from 'next/server';
import { getMfaCookieDomain } from '@/lib/mfa-cookie-domain';

const MFA_DEVICE_COOKIE_NAME = 'mfa_device_token';

export function getMfaDeviceCookieName(): string {
  return MFA_DEVICE_COOKIE_NAME;
}

export function getMfaDeviceCookieOptions(request: NextRequest, maxAgeSeconds: number) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = getMfaCookieDomain(request);

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: maxAgeSeconds,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

export function clearMfaDeviceCookie(response: NextResponse, request: NextRequest) {
  // Deleting with explicit scope avoids stale cookies when domain/path were set.
  response.cookies.set(
    MFA_DEVICE_COOKIE_NAME,
    '',
    getMfaDeviceCookieOptions(request, 0)
  );
}
