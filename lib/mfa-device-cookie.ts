import type { NextRequest, NextResponse } from 'next/server';
import { getMfaCookieDomain } from '@/lib/mfa-cookie-domain';

const MFA_DEVICE_COOKIE_NAME = 'mfa_device_token';

function normalizeUserId(userId: string): string {
  // Cookie names can include alphanumerics and a limited punctuation set.
  // Keep a conservative subset to avoid invalid names.
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getMfaDeviceCookieName(userId?: string): string {
  if (!userId) return MFA_DEVICE_COOKIE_NAME;
  return `${MFA_DEVICE_COOKIE_NAME}_${normalizeUserId(userId)}`;
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

export function clearMfaDeviceCookie(
  response: NextResponse,
  request: NextRequest,
  userId?: string
) {
  // Deleting with explicit scope avoids stale cookies when domain/path were set.
  response.cookies.set(
    getMfaDeviceCookieName(userId),
    '',
    getMfaDeviceCookieOptions(request, 0)
  );
}
