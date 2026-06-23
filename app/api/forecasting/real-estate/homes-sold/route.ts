import { NextRequest, NextResponse } from 'next/server';
import { forecastRealEstateHomesSold } from '@/lib/forecasting/real-estate-homes-sold';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = forecastRealEstateHomesSold({
      homesSoldValues: Array.isArray(body?.homesSoldValues) ? body.homesSoldValues : [],
      mortgageRateValues: Array.isArray(body?.mortgageRateValues) ? body.mortgageRateValues : [],
      periods: body?.periods,
      monthlyRateChangePct: body?.monthlyRateChangePct,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Real estate homes-sold forecast failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to forecast homes sold' },
      { status: 500 },
    );
  }
}
