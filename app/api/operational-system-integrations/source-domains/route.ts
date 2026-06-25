import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';

export const dynamic = 'force-dynamic';

type EditableDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

const SOURCE_PROVIDERS: Record<string, string> = {
  ICE_ENCOMPASS: 'SPREADSHEET_UPLOAD',
};

const DEFAULT_DATA_DOMAINS: Record<string, EditableDataDomain[]> = {
  ICE_ENCOMPASS: [
    { dataDomain: 'Loans', sourceObject: 'Loan details and selected loan fields', enabled: true },
    { dataDomain: 'Loan Pipeline', sourceObject: 'Pipeline views, folders, milestones, dates, loan teams', enabled: true },
    { dataDomain: 'Milestones & Workflow', sourceObject: 'Application, processing, underwriting, closing, funding stages', enabled: true },
    { dataDomain: 'Conditions', sourceObject: 'Underwriting and closing condition status / lifecycle', enabled: true },
    { dataDomain: 'Documents / eFolder', sourceObject: 'Document packages, disclosures, attachments, metadata', enabled: true },
    { dataDomain: 'Compliance / Disclosures', sourceObject: 'LE / CD timing and TRID disclosure status', enabled: true },
    { dataDomain: 'Organizations & Users', sourceObject: 'Branches, users, roles, loan teams', enabled: true },
    { dataDomain: 'Webhooks', sourceObject: 'Loan, document, condition, task, org/user events', enabled: true },
  ],
};

function normalizeSourceCode(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeDataDomains(value: unknown, sourceCode: string): EditableDataDomain[] {
  const fallback = DEFAULT_DATA_DOMAINS[sourceCode] || [];
  if (!Array.isArray(value)) return fallback;

  const rows = value
    .map((row) => {
      const candidate = row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {};
      return {
        dataDomain: String(candidate.dataDomain || '').trim(),
        sourceObject: String(candidate.sourceObject || '').trim(),
        enabled: candidate.enabled !== false,
      };
    })
    .filter((row) => row.dataDomain || row.sourceObject);

  return rows.length > 0 ? rows : [{ dataDomain: '', sourceObject: '', enabled: true }];
}

function getMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readSourceDomains(metadata: Record<string, unknown>, sourceCode: string): unknown {
  const allDomains = getMetadataObject(metadata.operationalSourceDataDomains);
  return allDomains[sourceCode];
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const sourceCode = normalizeSourceCode(request.nextUrl.searchParams.get('sourceCode'));
    const provider = SOURCE_PROVIDERS[sourceCode];
    if (!provider) {
      return NextResponse.json({ ok: false, error: 'Unsupported operational source.' }, { status: 400 });
    }

    const connection = await getOperationalSystemConnection(companyId, provider, sourceCode);
    const metadata = getMetadataObject(connection?.connectionMetadata);
    const dataDomains = sanitizeDataDomains(readSourceDomains(metadata, sourceCode), sourceCode);

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode,
      dataDomains,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load operational source data domains';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const sourceCode = normalizeSourceCode(body.sourceCode);
    const provider = SOURCE_PROVIDERS[sourceCode];
    if (!provider) {
      return NextResponse.json({ ok: false, error: 'Unsupported operational source.' }, { status: 400 });
    }

    const existing = await getOperationalSystemConnection(companyId, provider, sourceCode);
    const existingMetadata = getMetadataObject(existing?.connectionMetadata);
    const existingAllDomains = getMetadataObject(existingMetadata.operationalSourceDataDomains);
    const dataDomains = sanitizeDataDomains(body.dataDomains, sourceCode);
    const nextMetadata = {
      ...existingMetadata,
      operationalSourceDataDomains: {
        ...existingAllDomains,
        [sourceCode]: dataDomains,
      },
      operationalSourceDataDomainsUpdatedAt: new Date().toISOString(),
    };

    await saveOperationalSystemConnection({
      companyId,
      provider,
      sourceCode,
      status: existing?.status || 'INACTIVE',
      authType: existing?.authType || null,
      accessToken: existing?.accessToken || null,
      refreshToken: existing?.refreshToken || null,
      tokenExpiresAt: existing?.tokenExpiresAt || null,
      baseUrl: existing?.baseUrl || null,
      lastSyncAt: existing?.lastSyncAt || null,
      autoSync: existing?.autoSync ?? false,
      syncFrequency: existing?.syncFrequency || 'manual',
      connectionMetadata: nextMetadata,
      errorMessage: existing?.errorMessage || null,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode,
      dataDomains,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save operational source data domains';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
