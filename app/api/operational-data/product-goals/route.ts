import { NextRequest, NextResponse } from 'next/server';
import {
  asForecastYear,
  assertProductsForecastAccess,
  ensureProductRevenueTables,
  loadProductGoalUpdate,
} from '@/lib/operations/product-revenue-actual-db';
import { workbookUpdatedDate } from '@/lib/operations/product-revenue-actual';

export const dynamic = 'force-dynamic';

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
    const snapshot = await loadProductGoalUpdate({ companyId, year });

    return NextResponse.json({
      ...snapshot,
      workbookUpdated: workbookUpdatedDate(snapshot.dataThru),
    });
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
    return NextResponse.json(
      { error: message || 'Failed to load Goal Update' },
      { status: 500 }
    );
  }
}
