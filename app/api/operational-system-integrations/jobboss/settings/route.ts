import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getOperationalSystemConnection, saveOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { JOBBOSS_API_BASE_URL, JOBBOSS_LABEL, JOBBOSS_SOURCE_CODE } from '@/lib/jobboss';

export const dynamic = 'force-dynamic';

function metadata(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const value = connection?.connectionMetadata;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function response(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const settings = metadata(connection).jobBossSettings;
  const configured = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  return {
    sourceCode: JOBBOSS_SOURCE_CODE,
    status: connection?.status || 'NOT_CONNECTED',
    lastSyncAt: connection?.lastSyncAt || null,
    errorMessage: connection?.errorMessage || null,
    credentialsConfigured: Boolean(connection?.accessToken && connection?.refreshToken),
    syncFrequency: connection?.syncFrequency || 'daily',
    syncTime: typeof configured.syncTime === 'string' ? configured.syncTime : '08:00',
    initialSyncStartDate: typeof configured.initialSyncStartDate === 'string' ? configured.initialSyncStartDate : '',
    incrementalSync: configured.incrementalSync === 'NO' ? 'NO' : 'YES',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    return NextResponse.json({ ok: true, companyId, ...response(await getOperationalSystemConnection(companyId, 'JOBBOSS', JOBBOSS_SOURCE_CODE)) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to load JobBOSS² settings.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, 'JOBBOSS', JOBBOSS_SOURCE_CODE);
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
    if ((!clientId && !existing?.accessToken) || (!clientSecret && !existing?.refreshToken)) {
      return NextResponse.json({ ok: false, error: 'JobBOSS² OAuth Client ID and Client Secret are required.' }, { status: 400 });
    }
    const syncTime = typeof body.syncTime === 'string' && /^\d{2}:\d{2}$/.test(body.syncTime) ? body.syncTime : '08:00';
    await saveOperationalSystemConnection({
      companyId, provider: 'JOBBOSS', sourceCode: JOBBOSS_SOURCE_CODE, authType: 'OAUTH_CLIENT_CREDENTIALS',
      status: 'ACTIVE', accessToken: clientId || existing?.accessToken || null, refreshToken: clientSecret || existing?.refreshToken || null,
      tokenExpiresAt: null, baseUrl: JOBBOSS_API_BASE_URL, autoSync: body.autoSync !== false,
      syncFrequency: ['daily', 'weekly', 'monthly'].includes(String(body.syncFrequency)) ? String(body.syncFrequency) : 'daily',
      connectionMetadata: {
        ...metadata(existing), sourceLabel: JOBBOSS_LABEL, operationalPullTime: syncTime,
        jobBossSettings: { syncTime, initialSyncStartDate: typeof body.initialSyncStartDate === 'string' ? body.initialSyncStartDate : '', incrementalSync: body.incrementalSync === 'NO' ? 'NO' : 'YES' },
      },
      errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, ...response(await getOperationalSystemConnection(companyId, 'JOBBOSS', JOBBOSS_SOURCE_CODE)) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to save JobBOSS² settings.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, 'JOBBOSS', JOBBOSS_SOURCE_CODE);
    await saveOperationalSystemConnection({
      companyId, provider: 'JOBBOSS', sourceCode: JOBBOSS_SOURCE_CODE, authType: 'OAUTH_CLIENT_CREDENTIALS', status: 'INACTIVE',
      accessToken: null, refreshToken: null, tokenExpiresAt: null, baseUrl: JOBBOSS_API_BASE_URL, lastSyncAt: existing?.lastSyncAt || null,
      autoSync: false, syncFrequency: 'manual', connectionMetadata: metadata(existing), errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, status: 'INACTIVE' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to disconnect JobBOSS².' }, { status: 400 });
  }
}
