import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  isQuickBooksAccountingSystem,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  BAMBOOHR_SOURCE_CODE,
  defaultBambooHrDataDomains,
  defaultBambooHrSettings,
  sanitizeBambooHrDataDomains,
  sanitizeBambooHrSettings,
} from '@/lib/bamboohr';

export const dynamic = 'force-dynamic';
const SOURCE_CODE = BAMBOOHR_SOURCE_CODE;

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

    const settings = sanitizeBambooHrSettings(
      {
        syncFrequency: typeof connection?.syncFrequency === 'string' ? connection.syncFrequency : defaultBambooHrSettings.syncFrequency,
        authType: connection?.authType || defaultBambooHrSettings.authType,
        baseUrl: connection?.baseUrl || '',
        apiKey: connection?.accessToken || '',
        ...platformSettings,
      },
      connection?.accessToken || ''
    );
    const dataDomains = sanitizeBambooHrDataDomains(metadata.bambooHrDataDomains || defaultBambooHrDataDomains);

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

    const settings = sanitizeBambooHrSettings(body.settings || defaultBambooHrSettings, existing?.accessToken || '');
    const dataDomains = sanitizeBambooHrDataDomains(body.dataDomains || defaultBambooHrDataDomains);
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
