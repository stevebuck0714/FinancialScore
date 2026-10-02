import { NextRequest, NextResponse } from 'next/server';
import { ingestDailyFinancialSnapshots } from '@/lib/financial/daily-financial-ingest';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const platform = String(body?.platform || 'SCHEDULED_INTEGRATION').trim();
    const runId = String(body?.runId || '').trim() || null;
    const inputRecords = Array.isArray(body?.records) ? body.records : [body];
    const mappedLines = Array.isArray(body?.mappedLines) ? body.mappedLines : [];

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    // Scheduled workers authenticate with CRON_SECRET. The Data Mapping UI
    // uses the signed-in user's session and must not be rejected merely
    // because a cron secret is configured.
    if (!isAuthorized(request)) {
      try {
        await requireAuth();
      } catch {
        return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
      }
      if (!(await validateCompanyAccess(companyId))) {
        return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
      }
    }

    const result = await ingestDailyFinancialSnapshots({
      companyId,
      platform,
      runId,
      frequency: String(body?.frequency || 'daily'),
      records: inputRecords,
      mappedLines,
    });
    if (result.error?.includes('Run prisma migrate')) {
      return NextResponse.json({ error: result.error }, { status: 501 });
    }

    return NextResponse.json({
      success: result.success,
      companyId,
      recordsIngested: result.ingested,
      skipped: result.skipped,
      error: result.error || null,
    });
  } catch (error: any) {
    console.error('Failed to ingest daily financial snapshots:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
