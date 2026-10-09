import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdmin } from '@/lib/tenant-security';
import { getCompanyOperationalCoverage } from '@/lib/operational-data/coverage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireSiteAdmin();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    return NextResponse.json(await getCompanyOperationalCoverage(companyId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load operational data coverage';
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
