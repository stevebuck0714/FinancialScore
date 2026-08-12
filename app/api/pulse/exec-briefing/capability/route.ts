import { NextRequest, NextResponse } from 'next/server';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { resolveDailyBriefingCapability } from '@/lib/pulse/daily-briefing-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = request.nextUrl.searchParams.get('companyId') || '';
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_EXEC_BRIEFING_CAPABILITY_READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const capability = await resolveDailyBriefingCapability(companyId);
    return NextResponse.json(
      {
        ok: true,
        companyId,
        ...capability,
        showDailyTab: capability.isQuickBooksOnline ? capability.supportsDaily : true,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to resolve daily briefing capability:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to resolve daily briefing capability' },
      { status: 500 }
    );
  }
}
