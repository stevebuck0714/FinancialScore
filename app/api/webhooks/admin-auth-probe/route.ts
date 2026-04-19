import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint for the /api/admin/* CRON_SECRET header bypass.
 *
 * Lives under /api/webhooks/* so the existing public-route allowlist in
 * middleware.ts lets it through without any session check (we want to
 * observe the server-side env + headers without the middleware being able
 * to interfere). Returns LENGTHS only — never echoes the secret.
 *
 * Call exactly the way you'd call /api/admin/rebuild-cash-snapshots:
 *   curl -X POST https://dashboard.corelytics.com/api/webhooks/admin-auth-probe \
 *     -H "x-cron-secret: $secret"
 *
 * Compare envCronSecretLen vs headerCronSecretLen and matchesEnvCronSecret.
 *
 * Safe to leave deployed: no secret values are returned, no DB access, no
 * side effects. Remove later if desired.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const envCronSecret = String(process.env.CRON_SECRET || '');
  const headerCronSecret = String(request.headers.get('x-cron-secret') || '');

  return NextResponse.json({
    ok: true,
    runtime: {
      vercelEnv: process.env.VERCEL_ENV || null,
      nodeEnv: process.env.NODE_ENV || null,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
    },
    envCronSecretPresent: envCronSecret.length > 0,
    envCronSecretLen: envCronSecret.length,
    headerCronSecretPresent: headerCronSecret.length > 0,
    headerCronSecretLen: headerCronSecret.length,
    matchesEnvCronSecret:
      envCronSecret.length > 0 &&
      headerCronSecret.length > 0 &&
      headerCronSecret === envCronSecret,
    receivedHeaders: Array.from(request.headers.keys()).sort(),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
