import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function parseCompanyList(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authHeader = String(request.headers.get('authorization') || '').trim();
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const configuredCompanies = parseCompanyList(String(process.env.INFOR_PENDING_REPLAY_COMPANIES || ''));
    if (configuredCompanies.length === 0) {
      return NextResponse.json({
        ok: true,
        ran: false,
        message: 'No companies configured. Set INFOR_PENDING_REPLAY_COMPANIES.',
      });
    }

    const origin = new URL(request.url).origin;
    const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
    const workerSecret = String(process.env.CRON_SECRET || '').trim();
    const results: Array<Record<string, unknown>> = [];

    for (const companyId of configuredCompanies) {
      const response = await fetch(`${origin}/api/infor-m3/operational-transform-pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(workerSecret ? { 'x-infor-sync-worker-secret': workerSecret } : {}),
          ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
        },
        body: JSON.stringify({
          companyId,
          runUntilDrained: false,
          maxTicks: 1,
          maxDaysPerTick: 1,
          requeueFailed: true,
          maxAttempts: 8,
        }),
        cache: 'no-store',
      });
      const text = await response.text().catch(() => '');
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { bodyStart: text.slice(0, 300) };
      }
      results.push({
        companyId,
        status: response.status,
        ok: response.ok,
        response: parsed,
      });
    }

    return NextResponse.json({
      ok: true,
      ran: true,
      companies: configuredCompanies.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to process pending Infor transform cron tick.',
        details: message,
      },
      { status: 500 }
    );
  }
}
