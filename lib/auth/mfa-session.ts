import { NextResponse, type NextRequest } from 'next/server';
import { encode, getToken } from 'next-auth/jwt';

const SESSION_COOKIE_NAME = 'next-auth.session-token';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function authSecret(): string {
  return String(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '').trim();
}

async function readSessionToken(request: NextRequest) {
  const secret = authSecret();
  if (!secret || !request.cookies.get(SESSION_COOKIE_NAME)) return null;
  return getToken({ req: request, secret, cookieName: SESSION_COOKIE_NAME, salt: SESSION_COOKIE_NAME }).catch(() => null);
}

/**
 * MFA routes take a `userId` in the body; only the browser that already passed
 * the password step for that same user may act on it.
 */
export async function rejectUnlessSessionUser(request: NextRequest, userId: unknown): Promise<NextResponse | null> {
  const token = await readSessionToken(request);
  if (token?.id && typeof userId === 'string' && token.id === userId) return null;
  return NextResponse.json({ error: 'Sign in again to continue' }, { status: 401 });
}

/**
 * Clears `mfaPending` on the caller's session once the server has confirmed MFA
 * (or that MFA is not required). Only the session belonging to `userId` is
 * changed, so a code for one account can never unlock another account's session.
 */
export async function markSessionMfaVerified(request: NextRequest, response: NextResponse, userId: string): Promise<boolean> {
  const secret = authSecret();
  const token = await readSessionToken(request);
  if (!token || token.id !== userId) return false;
  if (!token.mfaPending) return true;

  const value = await encode({
    token: { ...token, mfaPending: false },
    secret,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  response.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return true;
}
