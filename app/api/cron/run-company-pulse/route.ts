import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateCompanyPulse } from '@/lib/company-pulse/generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type PulseCronResult = {
  companyId: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  alerts?: number;
  executiveBriefingWarmed?: boolean;
  executiveBriefingError?: string;
  error?: string;
};

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

async function hasUnsettledImports(companyId: string): Promise<boolean> {
  const [inforRuns, inforTasks, rawCompleteness] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM "InforSyncRun"
       WHERE "companyId" = $1
         AND "status" IN ('queued', 'running')`,
      companyId
    ).catch(() => [{ count: '0' }]),
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM "InforSyncTask"
       WHERE "companyId" = $1
         AND "status" IN ('pending', 'leased')`,
      companyId
    ).catch(() => [{ count: '0' }]),
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM "InforRawCompleteness"
       WHERE "companyId" = $1
         AND "isComplete" = FALSE
         AND COALESCE("statusMessage", '') NOT LIKE 'raw_missing:%'`,
      companyId
    ).catch(() => [{ count: '0' }]),
  ]);

  return (
    Number(inforRuns[0]?.count || 0) > 0 ||
    Number(inforTasks[0]?.count || 0) > 0 ||
    Number(rawCompleteness[0]?.count || 0) > 0
  );
}

async function resolveCompanyIds(request: NextRequest): Promise<string[]> {
  const companyOverride = String(request.nextUrl.searchParams.get('companyId') || '').trim();
  if (companyOverride) return [companyOverride];

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 25), 1), 100);
  const rows = await prisma.accountingConnection.findMany({
    where: {
      status: 'ACTIVE',
      autoSync: true,
    },
    select: { companyId: true },
    distinct: ['companyId'],
    orderBy: { companyId: 'asc' },
    take: limit,
  });
  return rows.map((row) => row.companyId);
}

async function warmDailyExecutiveBriefing(request: NextRequest, companyId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return { ok: false, error: 'CRON_SECRET is required to warm Daily Executive Briefing cache.' };
  }

  const url = new URL('/api/pulse/exec-briefing', request.url);
  url.searchParams.set('companyId', companyId);
  url.searchParams.set('force', 'true');

  const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${cronSecret}`,
      ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
    },
    cache: 'no-store',
  });

  if (response.ok) return { ok: true };

  let details = response.statusText || `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    details = String(payload?.error || payload?.details || details);
  } catch {
    // Keep the status text when the response is not JSON.
  }
  return { ok: false, error: details.slice(0, 500) };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyIds = await resolveCompanyIds(request);
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const results: PulseCronResult[] = [];

    for (const companyId of companyIds) {
      try {
        if (!force && await hasUnsettledImports(companyId)) {
          results.push({
            companyId,
            ok: true,
            skipped: true,
            reason: 'imports_not_settled',
          });
          continue;
        }

        const generated = await generateCompanyPulse(companyId, {
          actorEmail: 'company-pulse-cron',
        });
        const briefingWarmup = await warmDailyExecutiveBriefing(request, companyId);
        results.push({
          companyId,
          ok: briefingWarmup.ok,
          alerts: generated.alerts.filter((alert) => alert.status !== 'resolved' && alert.isActive !== false).length,
          executiveBriefingWarmed: briefingWarmup.ok,
          executiveBriefingError: briefingWarmup.error,
        });
      } catch (error: any) {
        results.push({
          companyId,
          ok: false,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }

    const failed = results.filter((result) => !result.ok).length;
    return NextResponse.json({
      success: failed === 0,
      companiesProcessed: results.length,
      companiesFailed: failed,
      results,
      duration: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Company Pulse cron failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error), duration: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
