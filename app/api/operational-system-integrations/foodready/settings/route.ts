import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getOperationalSystemConnection, saveOperationalSystemConnection } from '@/lib/operational/operational-system-connections';

const SOURCE_CODE = 'FOODREADY_AI';
const PROVIDER = 'SPREADSHEET_UPLOAD';

export const dynamic = 'force-dynamic';

function metadata(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const value = connection?.connectionMetadata;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function response(connection: Awaited<ReturnType<typeof getOperationalSystemConnection>>) {
  const settings = metadata(connection).foodReadySettings;
  const configured = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  return {
    sourceCode: SOURCE_CODE,
    status: connection?.status || 'NOT_CONNECTED',
    credentialsConfigured: Boolean(connection?.baseUrl && connection?.accessToken),
    baseUrl: connection?.baseUrl || '',
    tenantId: typeof configured.tenantId === 'string' ? configured.tenantId : '',
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
    return NextResponse.json({ ok: true, companyId, ...response(await getOperationalSystemConnection(companyId, PROVIDER, SOURCE_CODE)) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to load FoodReady settings.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, PROVIDER, SOURCE_CODE);
    const submittedBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const baseUrl = submittedBaseUrl ? validHttpsUrl(submittedBaseUrl) : existing?.baseUrl || null;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!baseUrl) return NextResponse.json({ ok: false, error: 'A valid HTTPS FoodReady API Base URL is required.' }, { status: 400 });
    if (!apiKey && !existing?.accessToken) return NextResponse.json({ ok: false, error: 'A FoodReady API key is required.' }, { status: 400 });

    await saveOperationalSystemConnection({
      companyId,
      provider: PROVIDER,
      sourceCode: SOURCE_CODE,
      authType: 'API_KEY',
      status: 'ACTIVE',
      accessToken: apiKey || existing?.accessToken || null,
      refreshToken: null,
      tokenExpiresAt: null,
      baseUrl,
      autoSync: false,
      syncFrequency: 'manual',
      connectionMetadata: {
        ...metadata(existing),
        sourceLabel: 'FoodReady AI',
        foodReadySettings: {
          tenantId: typeof body.tenantId === 'string' ? body.tenantId.trim() : '',
        },
      },
      errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, ...response(await getOperationalSystemConnection(companyId, PROVIDER, SOURCE_CODE)) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to save FoodReady settings.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const existing = await getOperationalSystemConnection(companyId, PROVIDER, SOURCE_CODE);
    await saveOperationalSystemConnection({
      companyId,
      provider: PROVIDER,
      sourceCode: SOURCE_CODE,
      authType: 'API_KEY',
      status: 'INACTIVE',
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      baseUrl: existing?.baseUrl || null,
      lastSyncAt: existing?.lastSyncAt || null,
      autoSync: false,
      syncFrequency: 'manual',
      connectionMetadata: metadata(existing),
      errorMessage: null,
    });
    return NextResponse.json({ ok: true, companyId, status: 'INACTIVE' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to disconnect FoodReady.' }, { status: 400 });
  }
}
