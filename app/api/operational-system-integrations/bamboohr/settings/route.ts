import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  isQuickBooksAccountingSystem,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';

export const dynamic = 'force-dynamic';
const SOURCE_CODE = 'BAMBOOHR_STANDARD';

type BambooHrSettings = {
  subdomain: string;
  baseUrl: string;
  apiKey: string;
  authType: 'API_KEY' | 'OAUTH' | '';
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
};

type BambooHrDataDomain = {
  dataDomain: string;
  bambooEntity: string;
  enabled: boolean;
};

const defaultSettings: BambooHrSettings = {
  subdomain: '',
  baseUrl: '',
  apiKey: '',
  authType: 'API_KEY',
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

const defaultDataDomains: BambooHrDataDomain[] = [
  { dataDomain: 'Employees', bambooEntity: 'employees/directory', enabled: true },
  { dataDomain: 'Departments', bambooEntity: 'meta/departments', enabled: true },
  { dataDomain: 'Locations', bambooEntity: 'meta/locations', enabled: true },
  { dataDomain: 'Job Information', bambooEntity: 'employees/job-info', enabled: true },
  { dataDomain: 'Time Off', bambooEntity: 'time_off/requests', enabled: false },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(subdomain: string, baseUrl: string): string {
  const trimmedBaseUrl = asString(baseUrl);
  if (trimmedBaseUrl) return trimmedBaseUrl;
  const trimmedSubdomain = asString(subdomain);
  if (!trimmedSubdomain) return '';
  return `https://api.bamboohr.com/api/gateway.php/${trimmedSubdomain}/v1`;
}

function sanitizeSettings(value: unknown, existingApiKey = ''): BambooHrSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency).toLowerCase();
  const authType = asString(src.authType).toUpperCase();
  const yesNo = (input: unknown): 'YES' | 'NO' | '' => {
    const normalized = asString(input).toUpperCase();
    if (normalized === 'YES') return 'YES';
    if (normalized === 'NO') return 'NO';
    return '';
  };
  const subdomain = asString(src.subdomain);
  const apiKey = asString(src.apiKey) || existingApiKey;

  return {
    subdomain,
    baseUrl: normalizeBaseUrl(subdomain, asString(src.baseUrl)),
    apiKey,
    authType: authType === 'OAUTH' ? 'OAUTH' : authType === 'API_KEY' ? 'API_KEY' : 'API_KEY',
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: yesNo(src.incrementalSync),
  };
}

function sanitizeDataDomains(value: unknown): BambooHrDataDomain[] {
  if (!Array.isArray(value)) return defaultDataDomains;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        dataDomain: asString(src.dataDomain),
        bambooEntity: asString(src.bambooEntity),
        enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
      };
    })
    .filter((row) => row.dataDomain || row.bambooEntity);
  return cleaned.length > 0 ? cleaned : defaultDataDomains;
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });

    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!isQuickBooksAccountingSystem(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'BambooHR settings are only available for QUICKBOOKS companies.' },
        { status: 400 }
      );
    }

    const connection = await getOperationalSystemConnection(companyId, 'BAMBOOHR', SOURCE_CODE);

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const platformSettings =
      metadata.bambooHrSettings && typeof metadata.bambooHrSettings === 'object' && !Array.isArray(metadata.bambooHrSettings)
        ? (metadata.bambooHrSettings as Record<string, unknown>)
        : {};

    const settings = sanitizeSettings(
      {
        syncFrequency: typeof connection?.syncFrequency === 'string' ? connection.syncFrequency : defaultSettings.syncFrequency,
        authType: connection?.authType || defaultSettings.authType,
        baseUrl: connection?.baseUrl || '',
        apiKey: connection?.accessToken || '',
        ...platformSettings,
      },
      connection?.accessToken || ''
    );
    const dataDomains = sanitizeDataDomains(metadata.bambooHrDataDomains || defaultDataDomains);

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode: SOURCE_CODE,
      status: connection?.status || 'NOT_CONNECTED',
      lastSyncAt: connection?.lastSyncAt || null,
      errorMessage: connection?.errorMessage || null,
      settings,
      dataDomains,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load BambooHR settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });

    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!isQuickBooksAccountingSystem(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'BambooHR settings are only available for QUICKBOOKS companies.' },
        { status: 400 }
      );
    }

    const existing = await getOperationalSystemConnection(companyId, 'BAMBOOHR', SOURCE_CODE);

    const settings = sanitizeSettings(body.settings || defaultSettings, existing?.accessToken || '');
    const dataDomains = sanitizeDataDomains(body.dataDomains || defaultDataDomains);
    const existingMetadata =
      existing?.connectionMetadata && typeof existing.connectionMetadata === 'object' && !Array.isArray(existing.connectionMetadata)
        ? (existing.connectionMetadata as Record<string, unknown>)
        : {};
    const mergedMetadata = {
      ...existingMetadata,
      bambooHrSettings: settings,
      bambooHrDataDomains: dataDomains,
      bambooHrLastUpdatedAt: new Date().toISOString(),
    };
    const scheduleFrequency = settings.syncFrequency || 'daily';

    await saveOperationalSystemConnection({
      companyId,
      provider: 'BAMBOOHR',
      sourceCode: SOURCE_CODE,
      authType: settings.authType || 'API_KEY',
      status: existing?.status || 'INACTIVE',
      accessToken: settings.apiKey || existing?.accessToken || null,
      baseUrl: settings.baseUrl || null,
      autoSync: true,
      syncFrequency: scheduleFrequency,
      connectionMetadata: mergedMetadata,
      errorMessage: null,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode: SOURCE_CODE,
      settings,
      dataDomains,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save BambooHR settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
