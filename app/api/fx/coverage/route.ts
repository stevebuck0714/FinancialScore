import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getCompanyFxCoverage } from '@/lib/fx/coverage';
import { ensureCompanyReportingRates } from '@/lib/fx/sync';

/**
 * GET /api/fx/coverage?companyId=...
 * Admin/diagnostics: FX history coverage for the company's reporting pair.
 *
 * POST /api/fx/coverage { companyId } — trigger 3-year backfill for the pair.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = request.nextUrl.searchParams.get('companyId') || '';
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'FX_COVERAGE_READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const coverage = await getCompanyFxCoverage(companyId);
    return NextResponse.json({ success: true, coverage });
  } catch (error: any) {
    const status = error?.status || error?.statusCode || 500;
    return NextResponse.json(
      { error: error?.message || 'Failed to load FX coverage' },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'FX_COVERAGE_BACKFILL');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await ensureCompanyReportingRates(companyId);
    const coverage = await getCompanyFxCoverage(companyId);
    return NextResponse.json({
      success: true,
      backfill: result,
      coverage,
    });
  } catch (error: any) {
    const status = error?.status || error?.statusCode || 500;
    return NextResponse.json(
      { error: error?.message || 'Failed to backfill FX rates' },
      { status }
    );
  }
}
