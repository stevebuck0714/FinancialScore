import { NextRequest, NextResponse } from 'next/server';
import { assertVendorsForecastAccess } from '@/lib/operations/vendor-monthly-forecast-db';
import { loadVendorItemOrderHistory } from '@/lib/operations/vendor-item-order-history';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    const history = await loadVendorItemOrderHistory(companyId);
    if (!history || history.vendors.length === 0) {
      return NextResponse.json({ hasData: false, vendors: [], items: [], selectedVendorId: '', syncRunId: null });
    }
    const requestedVendorId = String(request.nextUrl.searchParams.get('vendorId') || '').trim();
    const selectedVendorId = history.itemsByVendor[requestedVendorId] ? requestedVendorId : history.vendors[0].vendorId;
    return NextResponse.json({
      hasData: true,
      syncRunId: history.syncRunId,
      syncedAt: history.builtAt,
      vendors: history.vendors,
      selectedVendorId,
      items: history.itemsByVendor[selectedVendorId] || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load vendor item order history' }, { status: 500 });
  }
}
