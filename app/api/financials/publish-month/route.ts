import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { publishMonthFromDailySnapshots } from '@/lib/financial/publish-month-service';

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const month = String(body?.month || '').trim();
    const force = Boolean(body?.force);

    if (!companyId || !month) {
      return NextResponse.json({ error: 'companyId and month (YYYY-MM) are required' }, { status: 400 });
    }

    const cronAuthorized = isCronAuthorized(request);
    let actingUserId: string | null = null;

    if (!cronAuthorized) {
      try {
        const context = await requireCompanyAccess(companyId);
        actingUserId = context.userId;
      } catch {
        return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
      }
    }

    const result = await publishMonthFromDailySnapshots({
      companyId,
      month,
      force,
      actingUserId,
    });
    if (!result.success) {
      const error = String(result.error || 'Failed to publish month');
      if (error.includes('Forbidden')) return NextResponse.json({ error }, { status: 403 });
      if (error.includes('Invalid month format') || error.includes('required')) return NextResponse.json({ error }, { status: 400 });
      if (error.includes('No daily financial snapshots')) return NextResponse.json({ error }, { status: 404 });
      if (error.includes('Month is locked')) return NextResponse.json({ error }, { status: 409 });
      if (error.includes('Run prisma migrate')) return NextResponse.json({ error }, { status: 501 });
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to publish month from daily financial snapshots:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
