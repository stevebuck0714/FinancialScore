import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  deleteOperationalSystemConnection,
  getOperationalSystemConnection,
  listOperationalSystemConnections,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import { DEFAULT_ISOLVED_PEOPLE_CLOUD_DATA_DOMAINS, ISOLVED_PEOPLE_CLOUD_SOURCE_CODE } from '@/lib/operational/isolved-people-cloud';
import {
  OPERATIONAL_SOURCE_DEFINITIONS as SOURCE_DEFINITIONS,
  getOperationalSourceDefinition as getSourceDefinition,
  type OperationalSourceDefinition as SourceDefinition,
} from '@/lib/operational/source-definitions';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';

export const dynamic = 'force-dynamic';

function isSourceAvailableForSector(source: SourceDefinition, industrySectorCategory: string | null | undefined): boolean {
  const sectorCategory = String(industrySectorCategory || '').trim();
  return source.sectorCategories.includes(sectorCategory);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeFrequency(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') return normalized;
  if (normalized === 'manual' || normalized === 'off') return 'manual';
  return 'manual';
}

function normalizePullTime(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '08:00';
}

function isApiScheduledSource(source: SourceDefinition | null): boolean {
  return source?.provider === 'BAMBOOHR' || source?.provider === 'HUBSPOT' || source?.provider === 'ISOLVED';
}

async function getValidatedCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true, industrySector: true, industrySectorCategory: true },
  });
  if (!company) {
    throw new Error('Company not found');
  }
  return {
    ...company,
    industrySectorCategory: resolveCompanyIndustrySectorCategory(company),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const company = await getValidatedCompany(companyId);
    const connections = await listOperationalSystemConnections(companyId);

    const availableSources = SOURCE_DEFINITIONS
      .filter((source) => isSourceAvailableForSector(source, company.industrySectorCategory))
      .map((source) => ({
        provider: source.provider,
        sourceCode: source.sourceCode,
        label: source.label,
      }));

    return NextResponse.json({
      ok: true,
      companyId,
      availableSources,
      selectedSources: connections.map((connection) => {
        const source = getSourceDefinition(connection.sourceCode);
        const metadata = asRecord(connection.connectionMetadata);
        return {
          provider: connection.provider,
          sourceCode: connection.sourceCode,
          label: source?.label || connection.sourceCode,
          status: connection.status,
          lastSyncAt: connection.lastSyncAt,
          errorMessage: connection.errorMessage,
          scheduleEnabled: isApiScheduledSource(source),
          autoSync: connection.autoSync,
          syncFrequency: connection.syncFrequency || 'manual',
          syncTime: normalizePullTime(metadata.operationalPullTime),
        };
      }),
    });
  } catch (error: any) {
    console.error('Failed to load operational sources:', error);
    const message = error?.message || 'Failed to load operational sources';
    const status =
      message.includes('Company not found') ? 404 : message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const company = await getValidatedCompany(companyId);
    const sourceCode = String(body.sourceCode || '').trim().toUpperCase();
    const source = getSourceDefinition(sourceCode);
    if (!source) {
      return NextResponse.json({ ok: false, error: 'Unknown operational source.' }, { status: 400 });
    }
    if (!isSourceAvailableForSector(source, company.industrySectorCategory)) {
      return NextResponse.json({ ok: false, error: `${source.label} is not available for this company's sector.` }, { status: 400 });
    }

    const existing = await getOperationalSystemConnection(companyId, source.provider, source.sourceCode);
    const existingMetadata = asRecord(existing?.connectionMetadata);
    const existingAllDomains = asRecord(existingMetadata.operationalSourceDataDomains);

    await saveOperationalSystemConnection({
      companyId,
      provider: source.provider,
      sourceCode: source.sourceCode,
      status: existing?.status || 'INACTIVE',
      authType: existing?.authType || null,
      accessToken: existing?.accessToken || null,
      refreshToken: existing?.refreshToken || null,
      tokenExpiresAt: existing?.tokenExpiresAt || null,
      baseUrl: existing?.baseUrl || null,
      lastSyncAt: existing?.lastSyncAt || null,
      autoSync: isApiScheduledSource(source) ? (existing?.autoSync ?? true) : false,
      syncFrequency: isApiScheduledSource(source) ? (existing?.syncFrequency || 'daily') : 'manual',
      connectionMetadata: {
        ...existingMetadata,
        sourceLabel: source.label,
        ...(isApiScheduledSource(source)
          ? { operationalPullTime: existingMetadata.operationalPullTime || '08:00' }
          : {}),
        ...(source.sourceCode === ISOLVED_PEOPLE_CLOUD_SOURCE_CODE
          ? {
              operationalSourceDataDomains: {
                ...existingAllDomains,
                [source.sourceCode]: Array.isArray(existingAllDomains[source.sourceCode])
                  ? existingAllDomains[source.sourceCode]
                  : DEFAULT_ISOLVED_PEOPLE_CLOUD_DATA_DOMAINS,
              },
            }
          : {}),
        sourceCreatedAt: existingMetadata.sourceCreatedAt || new Date().toISOString(),
      },
      errorMessage: existing?.errorMessage || null,
    });

    return NextResponse.json({ ok: true, companyId, sourceCode });
  } catch (error: any) {
    const message = error?.message || 'Failed to add operational source';
    const status =
      message.includes('Company not found') ? 404 : message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    await getValidatedCompany(companyId);
    const sourceCode = String(body.sourceCode || '').trim().toUpperCase();
    const source = getSourceDefinition(sourceCode);
    if (!source) {
      return NextResponse.json({ ok: false, error: 'Unknown operational source.' }, { status: 400 });
    }

    const existing = await getOperationalSystemConnection(companyId, source.provider, source.sourceCode);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Operational source is not selected for this company.' }, { status: 404 });
    }
    if (!isApiScheduledSource(source)) {
      return NextResponse.json(
        { ok: false, error: `${source.label} is a manual upload source and does not support scheduled sync.` },
        { status: 400 }
      );
    }

    const syncFrequency = normalizeFrequency(body.syncFrequency);
    const syncTime = normalizePullTime(body.syncTime);
    const autoSync = Boolean(body.autoSync) && syncFrequency !== 'manual';
    const metadata = asRecord(existing.connectionMetadata);

    await saveOperationalSystemConnection({
      companyId,
      provider: source.provider,
      sourceCode: source.sourceCode,
      status: existing.status,
      authType: existing.authType,
      accessToken: existing.accessToken,
      refreshToken: existing.refreshToken,
      tokenExpiresAt: existing.tokenExpiresAt,
      baseUrl: existing.baseUrl,
      lastSyncAt: existing.lastSyncAt,
      autoSync,
      syncFrequency,
      connectionMetadata: {
        ...metadata,
        sourceLabel: source.label,
        operationalPullTime: syncTime,
        operationalScheduleUpdatedAt: new Date().toISOString(),
      },
      errorMessage: existing.errorMessage,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode,
      autoSync,
      syncFrequency,
      syncTime,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save operational source schedule';
    const status =
      message.includes('Company not found') ? 404 : message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    await getValidatedCompany(companyId);
    const sourceCode = String(body.sourceCode || '').trim().toUpperCase();
    const source = getSourceDefinition(sourceCode);
    if (!source) {
      return NextResponse.json({ ok: false, error: 'Unknown operational source.' }, { status: 400 });
    }

    await deleteOperationalSystemConnection(companyId, source.provider, source.sourceCode);

    return NextResponse.json({ ok: true, companyId, sourceCode });
  } catch (error: any) {
    const message = error?.message || 'Failed to remove operational source';
    const status =
      message.includes('Company not found') ? 404 : message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
