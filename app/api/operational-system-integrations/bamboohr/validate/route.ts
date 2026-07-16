import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  BAMBOOHR_SOURCE_CODE,
  assertBambooHrSettingsReady,
  defaultBambooHrDataDomains,
  defaultBambooHrSettings,
  fetchBambooHrJson,
  sanitizeBambooHrDataDomains,
  sanitizeBambooHrSettings,
} from '@/lib/bamboohr';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function loadValidatedCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true, name: true },
  });
  if (!company) {
    return { error: 'Company not found', status: 404 as const };
  }
  return { company };
}

export async function POST(request: NextRequest) {
  let companyId = '';
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const auth = await requireSiteAdminAuthorizedInforCompany(request, body);
    companyId = auth.companyId;

    const companyResult = await loadValidatedCompany(companyId);
    if ('error' in companyResult) {
      return NextResponse.json({ ok: false, error: companyResult.error }, { status: companyResult.status });
    }

    const existing = await getOperationalSystemConnection(companyId, 'BAMBOOHR', BAMBOOHR_SOURCE_CODE);
    const existingMetadata = asRecord(existing?.connectionMetadata);
    const existingSettings = asRecord(existingMetadata.bambooHrSettings);
    const settings = sanitizeBambooHrSettings(
      {
        ...defaultBambooHrSettings,
        ...existingSettings,
        syncFrequency: existing?.syncFrequency || existingSettings.syncFrequency || defaultBambooHrSettings.syncFrequency,
        authType: existing?.authType || existingSettings.authType || defaultBambooHrSettings.authType,
        baseUrl: existing?.baseUrl || existingSettings.baseUrl || '',
        apiKey: existing?.accessToken || existingSettings.apiKey || '',
        ...asRecord(body.settings),
      },
      existing?.accessToken || ''
    );
    const dataDomains = sanitizeBambooHrDataDomains(body.dataDomains || existingMetadata.bambooHrDataDomains || defaultBambooHrDataDomains);

    assertBambooHrSettingsReady(settings);
    const directory = await fetchBambooHrJson(settings, 'employees/directory');
    const employeeCount =
      directory.json && typeof directory.json === 'object' && Array.isArray((directory.json as Record<string, unknown>).employees)
        ? ((directory.json as Record<string, unknown>).employees as unknown[]).length
        : 0;
    const now = new Date();

    await saveOperationalSystemConnection({
      companyId,
      provider: 'BAMBOOHR',
      sourceCode: BAMBOOHR_SOURCE_CODE,
      authType: settings.authType || 'API_KEY',
      status: 'ACTIVE',
      accessToken: settings.apiKey,
      baseUrl: settings.baseUrl || null,
      autoSync: true,
      syncFrequency: settings.syncFrequency || 'daily',
      connectionMetadata: {
        ...existingMetadata,
        bambooHrSettings: settings,
        bambooHrDataDomains: dataDomains,
        bambooHrLastValidatedAt: now.toISOString(),
        bambooHrValidationSummary: {
          endpoint: 'employees/directory',
          employeeCount,
          httpStatus: directory.status,
        },
      },
      errorMessage: null,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: companyResult.company.name,
      status: 'ACTIVE',
      baseUrl: settings.baseUrl,
      endpoint: 'employees/directory',
      employeeCount,
      validatedAt: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to validate BambooHR connection';
    if (companyId) {
      const existing = await getOperationalSystemConnection(companyId, 'BAMBOOHR', BAMBOOHR_SOURCE_CODE).catch(() => null);
      if (existing) {
        await saveOperationalSystemConnection({
          companyId,
          provider: 'BAMBOOHR',
          sourceCode: BAMBOOHR_SOURCE_CODE,
          authType: existing.authType || 'API_KEY',
          status: 'ERROR',
          accessToken: existing.accessToken,
          baseUrl: existing.baseUrl,
          autoSync: false,
          syncFrequency: existing.syncFrequency || 'daily',
          connectionMetadata: existing.connectionMetadata,
          errorMessage: message.slice(0, 900),
        }).catch(() => undefined);
      }
    }
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
