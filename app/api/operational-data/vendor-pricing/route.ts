import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/tenant-security';
import { assertVendorsForecastAccess } from '@/lib/operations/vendor-monthly-forecast-db';
import {
  listVendorPricingRows,
  sanitizeVendorPricingPatch,
  saveVendorPricingEdits,
  type VendorPricingPatch,
} from '@/lib/operations/vendor-pricing-db';
import { scheduleOperationalCacheWarmupAfterSave } from '@/lib/operations/operational-cache-save-warmup';
import { estYear } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PATCHES_PER_SAVE = 2000;

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    const forecastYear = estYear();
    const rows = await listVendorPricingRows(companyId, forecastYear);
    return NextResponse.json({ ok: true, companyId, forecastYear, rows });
  } catch (error) {
    console.error('Vendor pricing list failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load vendor pricing' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (rawRows.length > MAX_PATCHES_PER_SAVE) {
      return NextResponse.json({ error: `Save at most ${MAX_PATCHES_PER_SAVE} rows at a time.` }, { status: 400 });
    }
    const patches = rawRows
      .filter((raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw))
      .map(sanitizeVendorPricingPatch)
      .filter((patch): patch is VendorPricingPatch => patch != null);
    if (!patches.length) return NextResponse.json({ error: 'rows are required' }, { status: 400 });

    const editor = await requireAuth().catch(() => null);
    const saved = await saveVendorPricingEdits(companyId, patches, editor?.email || editor?.userId || null);
    scheduleOperationalCacheWarmupAfterSave(request, companyId, 'vendor-pricing');

    const forecastYear = estYear();
    const rows = await listVendorPricingRows(companyId, forecastYear);
    return NextResponse.json({ ok: true, companyId, forecastYear, saved, rows });
  } catch (error) {
    console.error('Vendor pricing save failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save vendor pricing' },
      { status: 500 }
    );
  }
}
