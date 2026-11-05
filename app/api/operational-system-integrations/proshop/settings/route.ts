import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getOperationalSystemConnection, saveOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { PROSHOP_LABEL, PROSHOP_SOURCE_CODE } from '@/lib/proshop';

export const dynamic = 'force-dynamic';

function metadata(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const value = connection?.connectionMetadata;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function response(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const settings = metadata(connection).proShopSettings;
  const configured = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  return {
    sourceCode: PROSHOP_SOURCE_CODE,
    status: connection?.status || 'NOT_CONNECTED',
    lastSyncAt: connection?.lastSyncAt || null,
    errorMessage: connection?.errorMessage || null,
    credentialsConfigured: Boolean(connection?.baseUrl && connection?.accessToken),
    baseUrl: connection?.baseUrl || '',
    apiKeyHeader: configured.apiKeyHeader === 'x-api-key' ? 'x-api-key' : 'authorization',
    syncFrequency: connection?.syncFrequency || 'daily',
    syncTime: typeof configured.syncTime === 'string' ? configured.syncTime : '08:00',
    initialSyncStartDate: typeof configured.initialSyncStartDate === 'string' ? configured.initialSyncStartDate : '',
    incrementalSync: configured.incrementalSync === 'NO' ? 'NO' : 'YES',
  };
}

function validHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    return NextResponse.json({ ok: true, companyId, ...response(await getOperationalSystemConnection(companyId, 'PROSHOP', PROSHOP_SOURCE_CODE)) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to load ProShop settings.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, 'PROSHOP', PROSHOP_SOURCE_CODE);
    const submittedBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const baseUrl = submittedBaseUrl ? validHttpsUrl(submittedBaseUrl) : existing?.baseUrl || null;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!baseUrl) return NextResponse.json({ ok: false, error: 'A valid HTTPS ProShop API Base URL is required.' }, { status: 400 });
    if (!apiKey && !existing?.accessToken) return NextResponse.json({ ok: false, error: 'A ProShop API key is required.' }, { status: 400 });
    const syncTime = typeof body.syncTime === 'string' && /^\d{2}:\d{2}$/.test(body.syncTime) ? body.syncTime : '08:00';
    await saveOperationalSystemConnection({
      companyId, provider: 'PROSHOP', sourceCode: PROSHOP_SOURCE_CODE, authType: 'API_KEY',
      status: 'ACTIVE', accessToken: apiKey || existing?.accessToken || null, refreshToken: null,
      tokenExpiresAt: null, baseUrl, autoSync: body.autoSync !== false,
      syncFrequency: ['daily', 'weekly', 'monthly'].includes(String(body.syncFrequency)) ? String(body.syncFrequency) : 'daily',
      connectionMetadata: {
        ...metadata(existing), sourceLabel: PROSHOP_LABEL, operationalPullTime: syncTime,
        proShopSettings: {
          apiKeyHeader: body.apiKeyHeader === 'x-api-key' ? 'x-api-key' : 'authorization',
          syncTime,
          initialSyncStartDate: typeof body.initialSyncStartDate === 'string' ? body.initialSyncStartDate : '',
          incrementalSync: body.incrementalSync === 'NO' ? 'NO' : 'YES',
        },
      },
      errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, ...response(await getOperationalSystemConnection(companyId, 'PROSHOP', PROSHOP_SOURCE_CODE)) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to save ProShop settings.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, 'PROSHOP', PROSHOP_SOURCE_CODE);
    await saveOperationalSystemConnection({
      companyId, provider: 'PROSHOP', sourceCode: PROSHOP_SOURCE_CODE, authType: 'API_KEY', status: 'INACTIVE',
      accessToken: null, refreshToken: null, tokenExpiresAt: null, baseUrl: existing?.baseUrl || null, lastSyncAt: existing?.lastSyncAt || null,
      autoSync: false, syncFrequency: 'manual', connectionMetadata: metadata(existing), errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, status: 'INACTIVE' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to disconnect ProShop.' }, { status: 400 });
  }
}
