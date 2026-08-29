import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { isAtlanticPrecisionCompany } from '@/lib/operations/company-specific-reports';
import { ensureProductRevenueTables, loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';
import {
  CONTRACT_PROGRAM_REVENUE_FIELD,
  PRODUCT_SALES_FORECAST_YEARS,
  lastProductAdjMonthKey,
  productAdjMonthsFromTotals,
} from '@/lib/operations/product-sales-forecast-feed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId parameter' }, { status: 400 });
    }

    await requireCompanyAccess(companyId);

    if (!isAtlanticPrecisionCompany(companyId)) {
      return NextResponse.json({
        fieldKey: CONTRACT_PROGRAM_REVENUE_FIELD,
        source: 'products-forecast-adj',
        hasProductForecast: false,
        lastAdjMonth: null,
        months: {},
      });
    }

    await ensureProductRevenueTables();
    const datasets = await Promise.all(
      PRODUCT_SALES_FORECAST_YEARS.map((year) => loadRevenueDataset({ companyId, year }))
    );

    const months: Record<string, number> = {};
    let hasProductForecast = false;
    for (const dataset of datasets) {
      if (Number(dataset.totals?.lineCount || dataset.companyLineCount || 0) > 0) {
        hasProductForecast = true;
      }
      Object.assign(months, productAdjMonthsFromTotals(dataset.year, dataset.totals?.months));
    }

    const lockedMonths = hasProductForecast ? months : {};
    return NextResponse.json({
      fieldKey: CONTRACT_PROGRAM_REVENUE_FIELD,
      source: 'products-forecast-adj',
      hasProductForecast,
      lastAdjMonth: lastProductAdjMonthKey(lockedMonths),
      months: lockedMonths,
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to load product sales feed');
    const status = message.startsWith('Forbidden') || message.includes('Access to this company denied')
      ? 403
      : message.startsWith('Unauthorized')
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
