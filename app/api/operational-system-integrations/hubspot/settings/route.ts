import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import { HUBSPOT_API_BASE_URL, HUBSPOT_SOURCE_CODE } from '@/lib/hubspot';

export const dynamic = 'force-dynamic';

function settingsResponse(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const metadata = connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
    ? connection.connectionMetadata as Record<string, unknown>
    : {};
  const configured = metadata.hubSpotSettings && typeof metadata.hubSpotSettings === 'object'
    ? metadata.hubSpotSettings as Record<string, unknown>
    : {};
  return {
    sourceCode: HUBSPOT_SOURCE_CODE,
    status: connection?.status || 'NOT_CONNECTED',
    lastSyncAt: connection?.lastSyncAt || null,
    errorMessage: connection?.errorMessage || null,
    tokenConfigured: Boolean(connection?.accessToken),
    autoSync: Boolean(connection?.autoSync),
    syncFrequency: connection?.syncFrequency || 'daily',
    syncTime: typeof configured.syncTime === 'string' ? configured.syncTime : '08:00',
    initialSyncStartDate: typeof configured.initialSyncStartDate === 'string' ? configured.initialSyncStartDate : '',
    incrementalSync: configured.incrementalSync === 'NO' ? 'NO' : 'YES',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const connection = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    return NextResponse.json({ ok: true, companyId, ...settingsResponse(connection) });
  } catch (error: any) {
    const message = error?.message || 'Failed to load HubSpot settings';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const token = typeof body.privateAppToken === 'string' ? body.privateAppToken.trim() : '';
    const existing = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    if (!token && !existing?.accessToken) {
      return NextResponse.json({ ok: false, error: 'A HubSpot service key is required.' }, { status: 400 });
    }

    await saveOperationalSystemConnection({
      companyId,
      provider: 'HUBSPOT',
      sourceCode: HUBSPOT_SOURCE_CODE,
      authType: 'SERVICE_KEY',
      status: 'ACTIVE',
      accessToken: token || existing?.accessToken || null,
      baseUrl: HUBSPOT_API_BASE_URL,
      autoSync: body.autoSync !== false,
      syncFrequency: ['daily', 'weekly', 'monthly'].includes(String(body.syncFrequency))
        ? String(body.syncFrequency)
        : 'daily',
      connectionMetadata: {
        ...(existing?.connectionMetadata || {}),
        sourceLabel: 'HubSpot',
        hubSpotSettings: {
          syncTime: typeof body.syncTime === 'string' ? body.syncTime : '08:00',
          initialSyncStartDate: typeof body.initialSyncStartDate === 'string' ? body.initialSyncStartDate : '',
          incrementalSync: body.incrementalSync === 'NO' ? 'NO' : 'YES',
        },
        operationalPullTime: typeof body.syncTime === 'string' ? body.syncTime : '08:00',
        hubSpotConfiguredAt: new Date().toISOString(),
      },
      errorMessage: null,
    });

    const saved = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    return NextResponse.json({ ok: true, companyId, ...settingsResponse(saved) });
  } catch (error: any) {
    const message = error?.message || 'Failed to save HubSpot settings';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    await saveOperationalSystemConnection({
      companyId,
      provider: 'HUBSPOT',
      sourceCode: HUBSPOT_SOURCE_CODE,
      authType: existing?.authType || 'SERVICE_KEY',
      status: 'INACTIVE',
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      baseUrl: HUBSPOT_API_BASE_URL,
      lastSyncAt: existing?.lastSyncAt || null,
      autoSync: false,
      syncFrequency: 'manual',
      connectionMetadata: {
        ...(existing?.connectionMetadata || {}),
        hubSpotDisconnectedAt: new Date().toISOString(),
      },
      errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, status: 'INACTIVE' });
  } catch (error: any) {
    const message = error?.message || 'Failed to disconnect HubSpot';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}
