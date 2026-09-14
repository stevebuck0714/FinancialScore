import { NextRequest, NextResponse } from 'next/server';
import {
  asForecastYear,
  assertProductsForecastAccess,
  ensureProductRevenueTables,
} from '@/lib/operations/product-revenue-actual-db';
import { loadProductYtdGapDataset } from '@/lib/operations/product-ytd-gap';
import { withProductReportCache } from '@/lib/operations/product-report-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const refresh = ['1', 'true', 'yes'].includes(
      String(request.nextUrl.searchParams.get('refresh') || '').trim().toLowerCase()
    );
    const includeComparison = ['1', 'true', 'yes'].includes(
      String(request.nextUrl.searchParams.get('comparison') || '').trim().toLowerCase()
    );

    const { payload } = await withProductReportCache({
      namespace: 'product-ytd-gap',
      companyId,
      // Cache the expensive three-year comparison separately from the normal
      // YTD/annual payload so it is calculated only when its tab is opened.
      // v6/v3 use posted Infor invoice-line facts for actual revenue.
      keyParts: [includeComparison ? 'ytd-comparison-v3' : 'ytd-gap-v6', year],
      refresh,
      build: async () => {
        await ensureProductRevenueTables();
        return loadProductYtdGapDataset({ companyId, year, includeComparison });
      },
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
    return NextResponse.json(
      { error: message || 'Failed to load YTD gap analysis' },
      { status: 500 }
    );
  }
}
