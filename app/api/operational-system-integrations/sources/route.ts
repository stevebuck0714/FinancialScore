import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  deleteOperationalSystemConnection,
  getOperationalSystemConnection,
  listOperationalSystemConnections,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import { COGENT_RATE_CARD_LABEL, COGENT_RATE_CARD_SOURCE_CODE } from '@/lib/operational/cogent-rate-card';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';

export const dynamic = 'force-dynamic';

type SourceDefinition = {
  provider: 'BAMBOOHR' | 'SPREADSHEET_UPLOAD';
  sourceCode: string;
  label: string;
  sectorCategories: string[];
};

const SOURCE_DEFINITIONS: SourceDefinition[] = [
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'CREWTRACKS', label: 'Crewtracks', sectorCategories: ['23'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'HILTI', label: 'Hilti', sectorCategories: ['23'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'ICE_ENCOMPASS', label: 'ICE Encompass', sectorCategories: ['53'] },
  { provider: 'BAMBOOHR', sourceCode: 'BAMBOOHR_STANDARD', label: 'BambooHR', sectorCategories: ['56'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: COGENT_RATE_CARD_SOURCE_CODE, label: COGENT_RATE_CARD_LABEL, sectorCategories: ['56'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'PLATOS_CLOSET_STORE_VISIT', label: 'MONTHLY STORE VISIT REPORT', sectorCategories: ['45'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'PLATOS_INVENTORY', label: 'Monthly Inventory Report', sectorCategories: ['45'] },
];

function getSourceDefinition(sourceCode: string): SourceDefinition | null {
  return SOURCE_DEFINITIONS.find((source) => source.sourceCode === sourceCode) || null;
}

function isSourceAvailableForSector(source: SourceDefinition, industrySectorCategory: string | null | undefined): boolean {
  const sectorCategory = String(industrySectorCategory || '').trim();
  return source.sectorCategories.includes(sectorCategory);
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
        return {
          provider: connection.provider,
          sourceCode: connection.sourceCode,
          label: source?.label || connection.sourceCode,
          status: connection.status,
          lastSyncAt: connection.lastSyncAt,
          errorMessage: connection.errorMessage,
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
      autoSync: existing?.autoSync ?? false,
      syncFrequency: existing?.syncFrequency || 'manual',
      connectionMetadata: {
        ...(existing?.connectionMetadata || {}),
        sourceLabel: source.label,
        sourceCreatedAt: (existing?.connectionMetadata || {}).sourceCreatedAt || new Date().toISOString(),
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
