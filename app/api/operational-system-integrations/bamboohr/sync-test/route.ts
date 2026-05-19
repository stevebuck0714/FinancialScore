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
  sanitizeBambooHrDataDomains,
  sanitizeBambooHrSettings,
  testBambooHrDataDomain,
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
    const enabledDomains = dataDomains.filter((domain) => domain.enabled);
    if (enabledDomains.length === 0) {
      return NextResponse.json({ ok: false, error: 'Enable at least one BambooHR data domain before running a sync test.' }, { status: 400 });
    }

    assertBambooHrSettingsReady(settings);

    const results = [];
    for (const domain of enabledDomains) {
      results.push(await testBambooHrDataDomain(settings, domain));
    }

    const failedResults = results.filter((result) => !result.ok);
    const totalRecordsRead = results.reduce((sum, result) => sum + result.count, 0);
    const success = failedResults.length === 0;
    const now = new Date();
    const errorMessage = success
      ? null
      : failedResults
          .map((result) => `${result.dataDomain || result.bambooEntity}: ${result.error || 'failed'}`)
          .join(' | ')
          .slice(0, 900);

    await saveOperationalSystemConnection({
      companyId,
      provider: 'BAMBOOHR',
      sourceCode: BAMBOOHR_SOURCE_CODE,
      authType: settings.authType || 'API_KEY',
      status: success ? 'ACTIVE' : 'ERROR',
      accessToken: settings.apiKey,
      baseUrl: settings.baseUrl || null,
      lastSyncAt: success ? now : existing?.lastSyncAt || null,
      autoSync: true,
      syncFrequency: settings.syncFrequency || 'daily',
      connectionMetadata: {
        ...existingMetadata,
        bambooHrSettings: settings,
        bambooHrDataDomains: dataDomains,
        bambooHrLastSyncTestAt: now.toISOString(),
        bambooHrLastSyncTestSummary: {
          totalRecordsRead,
          enabledDomainCount: enabledDomains.length,
          failedDomainCount: failedResults.length,
          results,
        },
      },
      errorMessage,
    });

    return NextResponse.json({
      ok: success,
      companyId,
      companyName: companyResult.company.name,
      status: success ? 'ACTIVE' : 'ERROR',
      testedAt: now.toISOString(),
      totalRecordsRead,
      results,
      errors: failedResults.map((result) => result.error).filter(Boolean),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run BambooHR sync test';
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
          lastSyncAt: existing.lastSyncAt,
          autoSync: existing.autoSync,
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
