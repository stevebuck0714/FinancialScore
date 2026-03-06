import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

type QuickBooksOnlineSettings = {
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  operationalSyncMode: 'BACKFILL' | 'INCREMENTAL';
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
  webhookEnabled: 'YES' | 'NO' | '';
  cdcEnabled: 'YES' | 'NO' | '';
  reconciliationEnabled: 'YES' | 'NO' | '';
};

type QuickBooksOnlineProgram = {
  dataDomain: string;
  qboEntity: string;
  enabled: boolean;
};

const defaultSettings: QuickBooksOnlineSettings = {
  syncFrequency: 'daily',
  syncTime: '08:00',
  operationalSyncMode: 'BACKFILL',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
  webhookEnabled: 'YES',
  cdcEnabled: 'YES',
  reconciliationEnabled: 'YES',
};

const defaultPrograms: QuickBooksOnlineProgram[] = [
  { dataDomain: 'Customers', qboEntity: 'Customer', enabled: true },
  { dataDomain: 'Vendors', qboEntity: 'Vendor', enabled: true },
  { dataDomain: 'Products', qboEntity: 'Item', enabled: true },
  { dataDomain: 'AR', qboEntity: 'Invoice', enabled: true },
  { dataDomain: 'AR Payments', qboEntity: 'Payment', enabled: true },
  { dataDomain: 'AP', qboEntity: 'Bill', enabled: true },
  { dataDomain: 'AP Payments', qboEntity: 'BillPayment', enabled: true },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): QuickBooksOnlineSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency).toLowerCase();
  const yesNo = (input: unknown): 'YES' | 'NO' | '' => {
    const normalized = asString(input).toUpperCase();
    if (normalized === 'YES') return 'YES';
    if (normalized === 'NO') return 'NO';
    return '';
  };

  return {
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    operationalSyncMode: asString(src.operationalSyncMode).toUpperCase() === 'INCREMENTAL' ? 'INCREMENTAL' : 'BACKFILL',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: yesNo(src.incrementalSync),
    webhookEnabled: yesNo(src.webhookEnabled),
    cdcEnabled: yesNo(src.cdcEnabled),
    reconciliationEnabled: yesNo(src.reconciliationEnabled),
  };
}

function sanitizePrograms(value: unknown): QuickBooksOnlineProgram[] {
  if (!Array.isArray(value)) return defaultPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        dataDomain: asString(src.dataDomain),
        qboEntity: asString(src.qboEntity),
        enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
      };
    })
    .filter((row) => row.dataDomain || row.qboEntity);
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
    if (String(company.accountingSystem || '').toUpperCase() !== 'QUICKBOOKS') {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Online settings are only available for QUICKBOOKS companies.' },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
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
      operationalSyncMode: asString(metadata.operationalSyncMode) || defaultSettings.operationalSyncMode,
      initialSyncStartDate: asString(metadata.initialSyncStartDate),
      incrementalSync: asString(metadata.incrementalSync),
      webhookEnabled: asString(metadata.webhookEnabled),
      cdcEnabled: asString(metadata.cdcEnabled),
      reconciliationEnabled: asString(metadata.reconciliationEnabled),
    };
    const platformSettings =
      metadata.quickbooksOnlineSettings &&
      typeof metadata.quickbooksOnlineSettings === 'object' &&
      !Array.isArray(metadata.quickbooksOnlineSettings)
        ? (metadata.quickbooksOnlineSettings as Record<string, unknown>)
        : {};
    const settings = sanitizeSettings({
      ...legacySettings,
      ...platformSettings,
    });
    const programs = sanitizePrograms(metadata.quickbooksOnlinePrograms || defaultPrograms);

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
    const message = error?.message || 'Failed to load QuickBooks Online settings';
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
    if (String(company.accountingSystem || '').toUpperCase() !== 'QUICKBOOKS') {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Online settings are only available for QUICKBOOKS companies.' },
        { status: 400 }
      );
    }

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const programs = sanitizePrograms(body.programs || defaultPrograms);

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
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
      quickbooksOnlineSettings: settings,
      quickbooksOnlinePrograms: programs,
      operationalPullTime: settings.syncTime || '08:00',
      operationalSyncMode: settings.operationalSyncMode,
      operationalScheduleUpdatedAt: new Date().toISOString(),
      quickbooksOnlineLastUpdatedAt: new Date().toISOString(),
    };
    const scheduleFrequency = settings.syncFrequency || 'daily';

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion: existing?.platformVersion || 'qbo-1.0',
        status: existing?.status || 'INACTIVE',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'INACTIVE',
        platformVersion: 'qbo-1.0',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'QuickBooks Online settings saved for this company.',
      settings,
      programs,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save QuickBooks Online settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
