import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { HUBSPOT_SOURCE_CODE } from '@/lib/hubspot';
import { loadHubSpotSalesData } from '@/lib/crm/hubspot-sales';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    if (!await validateCompanyAccess(companyId)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const connection = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    if (!connection?.accessToken || connection.status !== 'ACTIVE') {
      return NextResponse.json({ ok: false, error: 'HubSpot is not connected for this company.' }, { status: 409 });
    }
    return NextResponse.json(await loadHubSpotSalesData({ accessToken: connection.accessToken, connectionMetadata: connection.connectionMetadata }));
  } catch (error: any) {
    const message = error?.message || 'Failed to load HubSpot sales data';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}
