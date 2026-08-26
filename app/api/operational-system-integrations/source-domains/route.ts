import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import { DEFAULT_RAMQUEST_TITLE_DATA_DOMAINS, RAMQUEST_TITLE_SOURCE_CODE } from '@/lib/operational/ramquest-title';
import { DEFAULT_RSMEANS_PM_DATA_DOMAINS, RSMEANS_PM_SOURCE_CODE } from '@/lib/operational/rsmeans-pm';
import { DEFAULT_BUILDOUT_CRE_DATA_DOMAINS, BUILDOUT_CRE_SOURCE_CODE } from '@/lib/operational/buildout-cre';
import { DEFAULT_ISOLVED_PEOPLE_CLOUD_DATA_DOMAINS, ISOLVED_PEOPLE_CLOUD_SOURCE_CODE } from '@/lib/operational/isolved-people-cloud';

export const dynamic = 'force-dynamic';

type EditableDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

const SOURCE_PROVIDERS: Record<string, string> = {
  ICE_ENCOMPASS: 'SPREADSHEET_UPLOAD',
  LANTRAX_PROFIT_POWER: 'SPREADSHEET_UPLOAD',
  APPLIED_EPIC_INSURANCE_SERVICES: 'SPREADSHEET_UPLOAD',
  [RAMQUEST_TITLE_SOURCE_CODE]: 'SPREADSHEET_UPLOAD',
  [RSMEANS_PM_SOURCE_CODE]: 'SPREADSHEET_UPLOAD',
  [BUILDOUT_CRE_SOURCE_CODE]: 'SPREADSHEET_UPLOAD',
  [ISOLVED_PEOPLE_CLOUD_SOURCE_CODE]: 'ISOLVED',
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
  LANTRAX_PROFIT_POWER: [
    { dataDomain: 'Associates / Agent Roster', sourceObject: 'Agents, brokers, teams, status, production roles', enabled: true },
    { dataDomain: 'Branch Offices', sourceObject: 'Office hierarchy, regions, office assignments', enabled: true },
    { dataDomain: 'Listings / Inventory', sourceObject: 'Active, new, expired, withdrawn, and listing price records', enabled: true },
    { dataDomain: 'Listings Under Contract', sourceObject: 'Under-contract listings, contract dates, expected close dates', enabled: true },
    { dataDomain: 'Sales / Closings', sourceObject: 'Closed transactions, sides, closing dates, sales price, office, agent', enabled: true },
    { dataDomain: 'Clients', sourceObject: 'Buyer and seller records linked to transactions', enabled: true },
    { dataDomain: 'Commissions / GCI', sourceObject: 'Gross commission income, commission rate, listing/buyer side revenue', enabled: true },
    { dataDomain: 'Splits / Company Dollar', sourceObject: 'Commission splits, agent net, company dollar, franchise/referral/marketing fees', enabled: true },
    { dataDomain: 'Allocations', sourceObject: 'Commission allocations among agents and teams', enabled: true },
    { dataDomain: 'Closing Payments', sourceObject: 'Closing disbursements and payment history', enabled: true },
    { dataDomain: 'Escrow', sourceObject: 'Escrow balances and escrow transactions', enabled: true },
    { dataDomain: 'AR Import', sourceObject: 'Agent receivables and back-office charges', enabled: true },
    { dataDomain: 'Agent Recruiting / Retention', sourceObject: 'Associate start/end/status fields and office movement history', enabled: true },
    { dataDomain: 'Marketing / Lead Attribution', sourceObject: 'Marketing activity and campaign attribution where available', enabled: false },
    { dataDomain: 'Lookup Tables', sourceObject: 'Reference/master data for property type, status, source, office, role', enabled: true },
    { dataDomain: 'SSO', sourceObject: 'OAuth / SSO integration metadata', enabled: false },
    { dataDomain: 'Paging', sourceObject: 'Pagination controls for large API result sets', enabled: true },
  ],
  APPLIED_EPIC_INSURANCE_SERVICES: [
    { dataDomain: 'Clients / Customers', sourceObject: 'Customer and account records, retention, segmentation, concentration', enabled: true },
    { dataDomain: 'Contacts', sourceObject: 'CRM contacts linked to clients, policies, producers, and activities', enabled: true },
    { dataDomain: 'Policies', sourceObject: 'Policy records, effective dates, expiration dates, premium, carrier, producer, line of business', enabled: true },
    { dataDomain: 'Policy Transactions', sourceObject: 'New business, renewals, cancellations, endorsements, rewrites, and transaction history', enabled: true },
    { dataDomain: 'Renewals', sourceObject: 'Renewal pipeline, renewal dates, statuses, producer assignments, expected premium', enabled: true },
    { dataDomain: 'Claims', sourceObject: 'Claim records, loss dates, status, reserve/paid amounts, frequency and severity metrics', enabled: true },
    { dataDomain: 'Activities / Tasks', sourceObject: 'Workflow tasks, service activities, follow-ups, due dates, assignments, completion status', enabled: true },
    { dataDomain: 'Carriers', sourceObject: 'Carrier master data, appointments, production, policy counts, premium volume', enabled: true },
    { dataDomain: 'Producers / Agents', sourceObject: 'Producer roster, books of business, commission assignments, production and retention metrics', enabled: true },
    { dataDomain: 'Offices', sourceObject: 'Agency office, branch, and location hierarchy', enabled: true },
    { dataDomain: 'Departments', sourceObject: 'Department and profit center assignments for policies, producers, and accounting records', enabled: true },
    { dataDomain: 'Invoices', sourceObject: 'Billing records, invoice dates, due dates, balances, agency bill/direct bill indicators', enabled: true },
    { dataDomain: 'Payments', sourceObject: 'Cash receipts, payment applications, collections, reconciliation details', enabled: true },
    { dataDomain: 'Accounting', sourceObject: 'Revenue, receivables, commission income, producer commissions, trust accounting, general ledger extracts', enabled: true },
    { dataDomain: 'Attachments / Documents', sourceObject: 'Policy documents, client attachments, document metadata, retrieval/upload references', enabled: false },
    { dataDomain: 'Users / Security', sourceObject: 'Limited user, role, and permission metadata for administrative reporting', enabled: false },
  ],
  [RAMQUEST_TITLE_SOURCE_CODE]: DEFAULT_RAMQUEST_TITLE_DATA_DOMAINS,
  [RSMEANS_PM_SOURCE_CODE]: DEFAULT_RSMEANS_PM_DATA_DOMAINS,
  [BUILDOUT_CRE_SOURCE_CODE]: DEFAULT_BUILDOUT_CRE_DATA_DOMAINS,
  [ISOLVED_PEOPLE_CLOUD_SOURCE_CODE]: DEFAULT_ISOLVED_PEOPLE_CLOUD_DATA_DOMAINS,
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
