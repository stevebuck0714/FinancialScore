import { NextRequest, NextResponse } from 'next/server';
import { asForecastYear, assertProductsForecastAccess, ensureProductRevenueTables } from '@/lib/operations/product-revenue-actual-db';
import { loadProductGroupDataset } from '@/lib/operations/product-group-reports';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    await ensureProductRevenueTables();
    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const dataset = await loadProductGroupDataset({ companyId, year });
    return NextResponse.json(dataset);
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
    return NextResponse.json(
      { error: message || 'Failed to load group reports' },
      { status: 500 }
    );
  }
}
