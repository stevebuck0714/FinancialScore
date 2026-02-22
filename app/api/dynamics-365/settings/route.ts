import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

type DynamicsSettings = {
  tenantId: string;
  environmentUrl: string;
  legalEntity: string;
  region: string;
  clientId: string;
  clientSecret: string;
  authorityUrl: string;
  scope: string;
  redirectUri: string;
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
};

type DynamicsProgram = {
  module: string;
  entityOrEndpoint: string;
};

const defaultSettings: DynamicsSettings = {
  tenantId: '',
  environmentUrl: '',
  legalEntity: '',
  region: '',
  clientId: '',
  clientSecret: '',
  authorityUrl: '',
  scope: '',
  redirectUri: '',
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

const defaultPrograms: DynamicsProgram[] = [
  { module: 'Accounts', entityOrEndpoint: 'accounts' },
  { module: 'Customers', entityOrEndpoint: 'customers' },
  { module: 'Vendors', entityOrEndpoint: 'vendors' },
  { module: 'AR', entityOrEndpoint: 'customerledgerentries' },
  { module: 'AP', entityOrEndpoint: 'vendorledgerentries' },
  { module: 'Sales', entityOrEndpoint: 'salesinvoices' },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): DynamicsSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency);
  return {
    tenantId: asString(src.tenantId),
    environmentUrl: asString(src.environmentUrl),
    legalEntity: asString(src.legalEntity),
    region: asString(src.region),
    clientId: asString(src.clientId),
    clientSecret: asString(src.clientSecret),
    authorityUrl: asString(src.authorityUrl),
    scope: asString(src.scope),
    redirectUri: asString(src.redirectUri),
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: asString(src.incrementalSync) === 'NO' ? 'NO' : asString(src.incrementalSync) === 'YES' ? 'YES' : '',
  };
}

function sanitizePrograms(value: unknown): DynamicsProgram[] {
  if (!Array.isArray(value)) return defaultPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        module: asString(src.module),
        entityOrEndpoint: asString(src.entityOrEndpoint),
      };
    })
    .filter((row) => row.module || row.entityOrEndpoint);
  return cleaned.length > 0 ? cleaned : defaultPrograms;
}

function isDynamicsCompany(system: unknown): boolean {
  const normalized = String(system || '').toUpperCase();
  return normalized === 'DYNAMICS' || normalized === 'DYNAMICS365';
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
    if (!isDynamicsCompany(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Dynamics settings are only available for Dynamics companies.' },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'DYNAMICS365',
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
    const settings = sanitizeSettings(metadata.dynamicsSettings || defaultSettings);
    const programs = sanitizePrograms(metadata.dynamicsPrograms || defaultPrograms);

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
    const message = error?.message || 'Failed to load Dynamics settings';
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
    if (!isDynamicsCompany(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Dynamics settings are only available for Dynamics companies.' },
        { status: 400 }
      );
    }

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const programs = sanitizePrograms(body.programs || defaultPrograms);

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'DYNAMICS365',
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
      dynamicsSettings: settings,
      dynamicsPrograms: programs,
      dynamicsLastUpdatedAt: new Date().toISOString(),
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'DYNAMICS365',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion: existing?.platformVersion || 'dynamics-1.0',
        status: existing?.status || 'INACTIVE',
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'DYNAMICS365',
        status: 'INACTIVE',
        platformVersion: 'dynamics-1.0',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Dynamics settings saved for this company.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save Dynamics settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
