import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

type AcumaticaSettings = {
  tenantId: string;
  instanceUrl: string;
  companyCode: string;
  branch: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  endpointName: string;
  endpointVersion: string;
  contractBasedApiPath: string;
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
};

type AcumaticaProgram = {
  module: string;
  endpointOrEntity: string;
};

const defaultSettings: AcumaticaSettings = {
  tenantId: '',
  instanceUrl: '',
  companyCode: '',
  branch: '',
  clientId: '',
  clientSecret: '',
  username: '',
  password: '',
  endpointName: '',
  endpointVersion: '',
  contractBasedApiPath: '',
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

const defaultPrograms: AcumaticaProgram[] = [
  { module: 'Chart of Accounts', endpointOrEntity: 'GLAccounts' },
  { module: 'Customers', endpointOrEntity: 'Customers' },
  { module: 'Vendors', endpointOrEntity: 'Vendors' },
  { module: 'AR', endpointOrEntity: 'ARInvoices' },
  { module: 'AP', endpointOrEntity: 'APBills' },
  { module: 'Sales', endpointOrEntity: 'SalesOrders' },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): AcumaticaSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency);
  return {
    tenantId: asString(src.tenantId),
    instanceUrl: asString(src.instanceUrl),
    companyCode: asString(src.companyCode),
    branch: asString(src.branch),
    clientId: asString(src.clientId),
    clientSecret: asString(src.clientSecret),
    username: asString(src.username),
    password: asString(src.password),
    endpointName: asString(src.endpointName),
    endpointVersion: asString(src.endpointVersion),
    contractBasedApiPath: asString(src.contractBasedApiPath),
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: asString(src.incrementalSync) === 'NO' ? 'NO' : asString(src.incrementalSync) === 'YES' ? 'YES' : '',
  };
}

function sanitizePrograms(value: unknown): AcumaticaProgram[] {
  if (!Array.isArray(value)) return defaultPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        module: asString(src.module),
        endpointOrEntity: asString(src.endpointOrEntity),
      };
    })
    .filter((row) => row.module || row.endpointOrEntity);
  return cleaned.length > 0 ? cleaned : defaultPrograms;
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
    if (String(company.accountingSystem || '').toUpperCase() !== 'ACUMATICA') {
      return NextResponse.json(
        { ok: false, error: 'Acumatica settings are only available for ACUMATICA companies.' },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'ACUMATICA',
        },
      },
      select: {
        status: true,
        lastSyncAt: true,
        errorMessage: true,
        connectionMetadata: true,
      },
    });

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const settings = sanitizeSettings(metadata.acumaticaSettings || defaultSettings);
    const programs = sanitizePrograms(metadata.acumaticaPrograms || defaultPrograms);

    return NextResponse.json({
      ok: true,
      companyId,
      status: connection?.status || 'NOT_CONNECTED',
      lastSyncAt: connection?.lastSyncAt || null,
      errorMessage: connection?.errorMessage || null,
      settings,
      programs,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load Acumatica settings';
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
    if (String(company.accountingSystem || '').toUpperCase() !== 'ACUMATICA') {
      return NextResponse.json(
        { ok: false, error: 'Acumatica settings are only available for ACUMATICA companies.' },
        { status: 400 }
      );
    }

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const programs = sanitizePrograms(body.programs || defaultPrograms);

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'ACUMATICA',
        },
      },
      select: {
        status: true,
        platformVersion: true,
        connectionMetadata: true,
      },
    });

    const existingMetadata =
      existing?.connectionMetadata && typeof existing.connectionMetadata === 'object' && !Array.isArray(existing.connectionMetadata)
        ? (existing.connectionMetadata as Record<string, unknown>)
        : {};

    const mergedMetadata = {
      ...existingMetadata,
      acumaticaSettings: settings,
      acumaticaPrograms: programs,
      acumaticaLastUpdatedAt: new Date().toISOString(),
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'ACUMATICA',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion: existing?.platformVersion || 'acumatica-1.0',
        status: existing?.status || 'INACTIVE',
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'ACUMATICA',
        status: 'INACTIVE',
        platformVersion: 'acumatica-1.0',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Acumatica settings saved for this company.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save Acumatica settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
