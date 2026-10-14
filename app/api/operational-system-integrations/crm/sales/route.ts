import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { HUBSPOT_SOURCE_CODE } from '@/lib/hubspot';
import { HIGHLEVEL_SOURCE_CODE, highLevelCredentialsFromConnection } from '@/lib/highlevel';
import { loadHubSpotSalesData } from '@/lib/crm/hubspot-sales';
import { loadHighLevelSalesData } from '@/lib/crm/highlevel-sales';

export const dynamic = 'force-dynamic';

/** Sales tab data from whichever CRM the company has connected (HighLevel first, then HubSpot). */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    if (!await validateCompanyAccess(companyId)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const highLevel = await getOperationalSystemConnection(companyId, 'HIGHLEVEL', HIGHLEVEL_SOURCE_CODE);
    const highLevelCredentials = highLevel?.status === 'ACTIVE' ? highLevelCredentialsFromConnection(highLevel) : null;
    if (highLevelCredentials) {
      return NextResponse.json(await loadHighLevelSalesData(highLevelCredentials, highLevel?.connectionMetadata));
    }
    const hubSpot = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    if (hubSpot?.accessToken && hubSpot.status === 'ACTIVE') {
      return NextResponse.json(await loadHubSpotSalesData({ accessToken: hubSpot.accessToken, connectionMetadata: hubSpot.connectionMetadata }));
    }
    return NextResponse.json(
      { ok: false, code: 'CRM_NOT_CONNECTED', error: 'No CRM is connected for this company. Connect HubSpot or HighLevel under Operational data sources in Site Administration.' },
      { status: 409 }
    );
  } catch (error: any) {
    const message = error?.message || 'Failed to load CRM sales data';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}
