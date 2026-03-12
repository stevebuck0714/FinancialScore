import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

type QuickBooksDesktopSettings = {
  integrationType: 'WEB_CONNECTOR' | 'SDK' | '';
  applicationName: string;
  soapEndpointUrl: string;
  supportUrl: string;
  ownerId: string;
  fileId: string;
  webConnectorUsername: string;
  pollingIntervalMinutes: string;
  permissionScope: 'READ_ONLY' | 'READ_WRITE' | '';
  unattendedAccessRequired: 'YES' | 'NO' | '';
  desktopEditionYear: string;
  countryVersion: string;
  companyFilePath: string;
  hostMachineName: string;
  hostOnlineForSync: 'YES' | 'NO' | '';
  syncDirection: 'QB_TO_PLATFORM' | 'TWO_WAY' | '';
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
};

type QuickBooksDesktopProgram = {
  dataDomain: string;
  qbEntity: string;
};

const defaultSettings: QuickBooksDesktopSettings = {
  integrationType: 'WEB_CONNECTOR',
  applicationName: '',
  soapEndpointUrl: '',
  supportUrl: '',
  ownerId: '',
  fileId: '',
  webConnectorUsername: '',
  pollingIntervalMinutes: '60',
  permissionScope: 'READ_ONLY',
  unattendedAccessRequired: 'YES',
  desktopEditionYear: '',
  countryVersion: '',
  companyFilePath: '',
  hostMachineName: '',
  hostOnlineForSync: 'YES',
  syncDirection: 'QB_TO_PLATFORM',
  syncFrequency: 'daily',
  syncTime: '08:00',
};

const defaultPrograms: QuickBooksDesktopProgram[] = [
  { dataDomain: 'Chart of Accounts', qbEntity: 'AccountQuery' },
  { dataDomain: 'Customers', qbEntity: 'CustomerQuery' },
  { dataDomain: 'Inventory (Advanced)', qbEntity: '' },
  { dataDomain: 'Items/Products', qbEntity: 'ItemQuery' },
  { dataDomain: 'Sales Receipts', qbEntity: 'SalesReceiptQuery' },
  { dataDomain: 'Accounts Receivable Aging', qbEntity: 'AgingReportQuery' },
  { dataDomain: 'Accounts Payable Aging', qbEntity: 'AgingReportQuery' },
  { dataDomain: 'Products/Items', qbEntity: 'ItemQuery' },
  { dataDomain: 'Vendors', qbEntity: 'VendorQuery' },
  { dataDomain: 'Invoices', qbEntity: 'InvoiceQuery' },
  { dataDomain: 'Bills', qbEntity: 'BillQuery' },
  { dataDomain: 'Payments', qbEntity: 'ReceivePaymentQuery' },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): QuickBooksDesktopSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    integrationType:
      asString(src.integrationType) === 'SDK'
        ? 'SDK'
        : asString(src.integrationType) === 'WEB_CONNECTOR'
          ? 'WEB_CONNECTOR'
          : '',
    applicationName: asString(src.applicationName),
    soapEndpointUrl: asString(src.soapEndpointUrl),
    supportUrl: asString(src.supportUrl),
    ownerId: asString(src.ownerId),
    fileId: asString(src.fileId),
    webConnectorUsername: asString(src.webConnectorUsername),
    pollingIntervalMinutes: asString(src.pollingIntervalMinutes) || '60',
    permissionScope:
      asString(src.permissionScope) === 'READ_WRITE'
        ? 'READ_WRITE'
        : asString(src.permissionScope) === 'READ_ONLY'
          ? 'READ_ONLY'
          : '',
    unattendedAccessRequired:
      asString(src.unattendedAccessRequired) === 'NO'
        ? 'NO'
        : asString(src.unattendedAccessRequired) === 'YES'
          ? 'YES'
          : '',
    desktopEditionYear: asString(src.desktopEditionYear),
    countryVersion: asString(src.countryVersion),
    companyFilePath: asString(src.companyFilePath),
    hostMachineName: asString(src.hostMachineName),
    hostOnlineForSync:
      asString(src.hostOnlineForSync) === 'NO'
        ? 'NO'
        : asString(src.hostOnlineForSync) === 'YES'
          ? 'YES'
          : '',
    syncDirection:
      asString(src.syncDirection) === 'TWO_WAY'
        ? 'TWO_WAY'
        : asString(src.syncDirection) === 'QB_TO_PLATFORM'
          ? 'QB_TO_PLATFORM'
          : '',
    syncFrequency:
      asString(src.syncFrequency) === 'weekly'
        ? 'weekly'
        : asString(src.syncFrequency) === 'monthly'
          ? 'monthly'
          : asString(src.syncFrequency) === 'daily'
            ? 'daily'
            : '',
    syncTime: asString(src.syncTime) || '08:00',
  };
}

function sanitizePrograms(value: unknown): QuickBooksDesktopProgram[] {
  if (!Array.isArray(value)) return defaultPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        dataDomain: asString(src.dataDomain),
        qbEntity: asString(src.qbEntity),
      };
    })
    .filter((row) => row.dataDomain || row.qbEntity);
  if (cleaned.length === 0) return defaultPrograms;

  const existingDomains = new Set(cleaned.map((row) => row.dataDomain.trim().toLowerCase()).filter(Boolean));
  const missingDefaults = defaultPrograms.filter(
    (row) => row.dataDomain && !existingDomains.has(row.dataDomain.trim().toLowerCase())
  );
  return [...cleaned, ...missingDefaults];
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
    if (company.accountingSystem !== 'QUICKBOOKS_DESKTOP') {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop settings are only available for QUICKBOOKS_DESKTOP companies.' },
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
        lastSyncAt: true,
        errorMessage: true,
        connectionMetadata: true,
      },
    });

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const settings = sanitizeSettings(metadata.quickbooksDesktopSettings || defaultSettings);
    const programs = sanitizePrograms(metadata.quickbooksDesktopPrograms || defaultPrograms);

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
    const message = error?.message || 'Failed to load QuickBooks Desktop settings';
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
    if (company.accountingSystem !== 'QUICKBOOKS_DESKTOP') {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop settings are only available for QUICKBOOKS_DESKTOP companies.' },
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
      quickbooksDesktopSettings: settings,
      quickbooksDesktopPrograms: programs,
      operationalPullTime: settings.syncTime || '08:00',
      operationalScheduleUpdatedAt: new Date().toISOString(),
      quickbooksDesktopLastUpdatedAt: new Date().toISOString(),
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
        platformVersion: existing?.platformVersion || 'qb-desktop-1.0',
        status: existing?.status || 'INACTIVE',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'INACTIVE',
        platformVersion: 'qb-desktop-1.0',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'QuickBooks Desktop settings saved for this company.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save QuickBooks Desktop settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
