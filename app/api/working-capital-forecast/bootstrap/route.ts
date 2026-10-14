import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { presentCompanyJson } from '@/lib/currency/api-response';
import { loadWorkingCapitalForecastBootstrap } from '@/lib/working-capital-forecast/bootstrap-data';
import type { ForecastBasisMode } from '@/lib/working-capital-forecast/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function asBasisMode(value: unknown): ForecastBasisMode {
  return value === 'accrual' ? 'accrual' : 'cash';
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    const basisMode = asBasisMode(searchParams.get('basisMode'));
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const bootstrap = await loadWorkingCapitalForecastBootstrap(companyId, basisMode);

    return NextResponse.json(
      await presentCompanyJson(request, companyId, {
        ok: true,
        companyId,
        basisMode,
        ...bootstrap,
      })
    );
  } catch (error: any) {
    const message = String(error?.message || 'Unknown error');
    if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('authentication')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('working-capital-forecast bootstrap failed:', error);
    return NextResponse.json(
      { error: 'Unable to load cash forecast inputs', details: message },
      { status: 500 },
    );
  }
}
