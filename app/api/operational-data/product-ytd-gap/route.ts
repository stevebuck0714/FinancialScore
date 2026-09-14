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

    const { payload } = await withProductReportCache({
      namespace: 'product-ytd-gap',
      companyId,
      // The annual and comparison views extend the response shape; do not
      // serve an older payload that lacks projected or historical values.
      keyParts: ['ytd-gap-v3', year],
      refresh,
      build: async () => {
        await ensureProductRevenueTables();
        return loadProductYtdGapDataset({ companyId, year });
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
