import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  if (process.env.MFA_DEBUG_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const token = request.cookies.get('mfa_device_token')?.value || '';

  return NextResponse.json({
    host: request.nextUrl.hostname,
    hasMfaDeviceToken: Boolean(token),
    tokenLength: token.length,
    cookieNames: request.cookies.getAll().map(cookie => cookie.name)
  });
}
