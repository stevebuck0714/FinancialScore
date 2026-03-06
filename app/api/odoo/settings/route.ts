import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

type OdooSettings = {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
  apiKey: string;
  companyId: string;
  odooVersion: string;
  authMethod: 'PASSWORD' | 'API_KEY' | '';
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
};

type OdooProgram = {
  module: string;
  modelOrEndpoint: string;
};

const defaultSettings: OdooSettings = {
  baseUrl: '',
  database: '',
  username: '',
  password: '',
  apiKey: '',
  companyId: '',
  odooVersion: '',
  authMethod: 'PASSWORD',
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

const defaultPrograms: OdooProgram[] = [
  { module: 'Chart of Accounts', modelOrEndpoint: 'account.account' },
  { module: 'Customers', modelOrEndpoint: 'res.partner' },
  { module: 'Vendors', modelOrEndpoint: 'res.partner' },
  { module: 'AR', modelOrEndpoint: 'account.move (out_invoice)' },
  { module: 'AP', modelOrEndpoint: 'account.move (in_invoice)' },
  { module: 'Sales', modelOrEndpoint: 'sale.order' },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): OdooSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency);
  const authMethod = asString(src.authMethod);
  return {
    baseUrl: asString(src.baseUrl),
    database: asString(src.database),
    username: asString(src.username),
    password: asString(src.password),
    apiKey: asString(src.apiKey),
    companyId: asString(src.companyId),
    odooVersion: asString(src.odooVersion),
    authMethod: authMethod === 'API_KEY' ? 'API_KEY' : authMethod === 'PASSWORD' ? 'PASSWORD' : '',
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: asString(src.incrementalSync) === 'NO' ? 'NO' : asString(src.incrementalSync) === 'YES' ? 'YES' : '',
  };
}

function sanitizePrograms(value: unknown): OdooProgram[] {
  if (!Array.isArray(value)) return defaultPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        module: asString(src.module),
        modelOrEndpoint: asString(src.modelOrEndpoint),
      };
    })
    .filter((row) => row.module || row.modelOrEndpoint);
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
    if (String(company.accountingSystem || '').toUpperCase() !== 'ODOO') {
      return NextResponse.json(
        { ok: false, error: 'Odoo settings are only available for ODOO companies.' },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'ODOO',
        },
      },
      select: {
        status: true,
        syncFrequency: true,
        lastSyncAt: true,
        errorMessage: true,
        connectionMetadata: true,
      },
    });

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const legacySettings = {
      syncFrequency: typeof connection?.syncFrequency === 'string' ? connection.syncFrequency : defaultSettings.syncFrequency,
      syncTime: asString(metadata.operationalPullTime) || defaultSettings.syncTime,
      initialSyncStartDate: asString(metadata.initialSyncStartDate),
      incrementalSync: asString(metadata.incrementalSync),
    };
    const platformSettings =
      metadata.odooSettings &&
      typeof metadata.odooSettings === 'object' &&
      !Array.isArray(metadata.odooSettings)
        ? (metadata.odooSettings as Record<string, unknown>)
        : {};
    const settings = sanitizeSettings({
      ...legacySettings,
      ...platformSettings,
    });
    const programs = sanitizePrograms(metadata.odooPrograms || defaultPrograms);

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
    const message = error?.message || 'Failed to load Odoo settings';
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
    if (String(company.accountingSystem || '').toUpperCase() !== 'ODOO') {
      return NextResponse.json(
        { ok: false, error: 'Odoo settings are only available for ODOO companies.' },
        { status: 400 }
      );
    }

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const programs = sanitizePrograms(body.programs || defaultPrograms);

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'ODOO',
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
      odooSettings: settings,
      odooPrograms: programs,
      operationalPullTime: settings.syncTime || '08:00',
      operationalScheduleUpdatedAt: new Date().toISOString(),
      odooLastUpdatedAt: new Date().toISOString(),
    };
    const scheduleFrequency = settings.syncFrequency || 'daily';

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'ODOO',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion: existing?.platformVersion || 'odoo-1.0',
        status: existing?.status || 'INACTIVE',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'ODOO',
        status: 'INACTIVE',
        platformVersion: 'odoo-1.0',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Odoo settings saved for this company.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save Odoo settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
