import { NextRequest, NextResponse } from 'next/server';
import {
  asForecastYear,
  assertProductsForecastAccess,
  ensureProductRevenueTables,
  loadProductGoalUpdate,
  loadProductMonthlyGoalsByYear,
  parseForecastYears,
  saveProductMonthlyRevenueGoals,
  saveProductMonthlyRevenueGoalsByYear,
} from '@/lib/operations/product-revenue-actual-db';
import { workbookUpdatedDate } from '@/lib/operations/product-revenue-actual';
import { scheduleOperationalCacheWarmupAfterSave } from '@/lib/operations/operational-cache-save-warmup';

export const dynamic = 'force-dynamic';
// Leaves room for the post-response operational cache rebuild.
export const maxDuration = 300;

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
    const extraYears = parseForecastYears(request.nextUrl.searchParams.get('years'));
    const snapshot = await loadProductGoalUpdate({ companyId, year });
    const monthlyGoalsByYear = extraYears.length
      ? await loadProductMonthlyGoalsByYear({ companyId, years: extraYears })
      : undefined;

    return NextResponse.json({
      ...snapshot,
      ...(monthlyGoalsByYear ? { monthlyGoalsByYear } : {}),
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

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    await ensureProductRevenueTables();

    const year = asForecastYear(body.year ?? request.nextUrl.searchParams.get('year'));
    const yearsBody = body.years && typeof body.years === 'object' && !Array.isArray(body.years)
      ? (body.years as Record<string, unknown>)
      : null;
    if (yearsBody) {
      const monthlyGoalsByYear = await saveProductMonthlyRevenueGoalsByYear({
        companyId,
        years: yearsBody,
      });
      scheduleOperationalCacheWarmupAfterSave(request, companyId, 'product-goals');
      const snapshot = await loadProductGoalUpdate({ companyId, year });
      return NextResponse.json({
        ok: true,
        ...snapshot,
        monthlyGoalsByYear,
        workbookUpdated: workbookUpdatedDate(snapshot.dataThru),
      });
    }

    const months = Array.isArray(body.months) ? body.months : body.monthlyRevenueGoals;
    if (!Array.isArray(months)) {
      return NextResponse.json({ error: 'months or years are required' }, { status: 400 });
    }

    const snapshot = await saveProductMonthlyRevenueGoals({ companyId, year, months });
    scheduleOperationalCacheWarmupAfterSave(request, companyId, 'product-goals');
    return NextResponse.json({
      ok: true,
      ...snapshot,
      workbookUpdated: workbookUpdatedDate(snapshot.dataThru),
    });
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
    return NextResponse.json(
      { error: message || 'Failed to save revenue goals' },
      { status: 500 }
    );
  }
}
