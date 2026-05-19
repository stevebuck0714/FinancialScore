import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  BAMBOOHR_SOURCE_CODE,
  assertBambooHrSettingsReady,
  defaultBambooHrSettings,
  probeBambooHrEndpoints,
  sanitizeBambooHrSettings,
} from '@/lib/bamboohr';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
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

    assertBambooHrSettingsReady(settings);
    const results = await probeBambooHrEndpoints(settings);

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      probedAt: new Date().toISOString(),
      available: results.filter((result) => result.ok),
      unavailable: results.filter((result) => !result.ok),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query BambooHR available domains';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
