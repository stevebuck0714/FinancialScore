import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { encryptOAuthToken } from '@/lib/encryption';
import {
  getQuickBooksDesktopFamilyLabel,
  getQuickBooksDesktopVariant,
  isQuickBooksDesktopFamily,
} from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

type QuickBooksDesktopSettings = {
  integrationType: 'WEB_CONNECTOR' | 'SDK' | '';
  applicationName: string;
  soapEndpointUrl: string;
  supportUrl: string;
  ownerId: string;
  fileId: string;
  webConnectorUsername: string;
  webConnectorPassword: string;
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
  webConnectorPassword: '',
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
  { dataDomain: 'Vendors', qbEntity: 'VendorQuery' },
  { dataDomain: 'Invoices', qbEntity: 'InvoiceQuery' },
  { dataDomain: 'Bills', qbEntity: 'BillQuery' },
  { dataDomain: 'Payments', qbEntity: 'ReceivePaymentQuery' },
];

const defaultEnterprisePrograms: QuickBooksDesktopProgram[] = [
  { dataDomain: 'Chart of Accounts', qbEntity: 'AccountQuery' },
  { dataDomain: 'Offices / Divisions', qbEntity: 'ClassQuery' },
  { dataDomain: 'Customers / Jobs', qbEntity: 'CustomerQuery' },
  { dataDomain: 'Customer Types', qbEntity: 'CustomerTypeQuery' },
  { dataDomain: 'Job Types', qbEntity: 'JobTypeQuery' },
  { dataDomain: 'Vendors', qbEntity: 'VendorQuery' },
  { dataDomain: 'Vendor Types', qbEntity: 'VendorTypeQuery' },
  { dataDomain: 'Employees / Agents', qbEntity: 'EmployeeQuery' },
  { dataDomain: 'Sales Reps', qbEntity: 'SalesRepQuery' },
  { dataDomain: 'Service / Product Items', qbEntity: 'ItemQuery' },
  { dataDomain: 'Terms', qbEntity: 'TermsQuery' },
  { dataDomain: 'Payment Methods', qbEntity: 'PaymentMethodQuery' },
  { dataDomain: 'Sales Tax Codes', qbEntity: 'SalesTaxCodeQuery' },
  { dataDomain: 'Invoices', qbEntity: 'InvoiceQuery' },
  { dataDomain: 'Sales Receipts', qbEntity: 'SalesReceiptQuery' },
  { dataDomain: 'Payments', qbEntity: 'ReceivePaymentQuery' },
  { dataDomain: 'Deposits', qbEntity: 'DepositQuery' },
  { dataDomain: 'Credit Memos', qbEntity: 'CreditMemoQuery' },
  { dataDomain: 'Estimates', qbEntity: 'EstimateQuery' },
  { dataDomain: 'Sales Orders', qbEntity: 'SalesOrderQuery' },
  { dataDomain: 'Bills', qbEntity: 'BillQuery' },
  { dataDomain: 'Bill Payments - Checks', qbEntity: 'BillPaymentCheckQuery' },
  { dataDomain: 'Bill Payments - Credit Cards', qbEntity: 'BillPaymentCreditCardQuery' },
  { dataDomain: 'Vendor Credits', qbEntity: 'VendorCreditQuery' },
  { dataDomain: 'Checks', qbEntity: 'CheckQuery' },
  { dataDomain: 'Credit Card Charges', qbEntity: 'CreditCardChargeQuery' },
  { dataDomain: 'Purchase Orders', qbEntity: 'PurchaseOrderQuery' },
  { dataDomain: 'Item Receipts', qbEntity: 'ItemReceiptQuery' },
  { dataDomain: 'Journal Entries', qbEntity: 'JournalEntryQuery' },
  { dataDomain: 'Transfers', qbEntity: 'TransferQuery' },
  { dataDomain: 'Inventory Adjustments', qbEntity: 'InventoryAdjustmentQuery' },
  { dataDomain: 'Inventory Sites', qbEntity: 'InventorySiteQuery' },
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
    webConnectorPassword: asString(src.webConnectorPassword),
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

function getDefaultPrograms(accountingSystem: unknown): QuickBooksDesktopProgram[] {
  return getQuickBooksDesktopVariant(accountingSystem) === 'ENTERPRISE' ? defaultEnterprisePrograms : defaultPrograms;
}

function sanitizePrograms(value: unknown, fallbackPrograms: QuickBooksDesktopProgram[] = defaultPrograms): QuickBooksDesktopProgram[] {
  if (!Array.isArray(value)) return fallbackPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        dataDomain: asString(src.dataDomain),
        qbEntity: asString(src.qbEntity),
      };
    })
    .filter((row) => row.dataDomain || row.qbEntity);
  return cleaned.length > 0 ? cleaned : fallbackPrograms;
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
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop-family settings are only available for QuickBooks Desktop or QuickBooks Enterprise companies.' },
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
    };
    const platformSettings =
      metadata.quickbooksDesktopSettings &&
      typeof metadata.quickbooksDesktopSettings === 'object' &&
      !Array.isArray(metadata.quickbooksDesktopSettings)
        ? (metadata.quickbooksDesktopSettings as Record<string, unknown>)
        : {};
    const settings = sanitizeSettings({
      ...legacySettings,
      ...platformSettings,
    });
    const existingCredentials =
      metadata.quickbooksDesktopCredentials &&
      typeof metadata.quickbooksDesktopCredentials === 'object' &&
      !Array.isArray(metadata.quickbooksDesktopCredentials)
        ? (metadata.quickbooksDesktopCredentials as Record<string, unknown>)
        : {};
    const webConnectorPasswordSet = Boolean(asString(existingCredentials.webConnectorPasswordEncrypted));
    const fallbackPrograms = getDefaultPrograms(company.accountingSystem);
    const programs = sanitizePrograms(metadata.quickbooksDesktopPrograms || fallbackPrograms, fallbackPrograms);

    return NextResponse.json({
      ok: true,
      companyId,
      status: connection?.status || 'NOT_CONNECTED',
      lastSyncAt: connection?.lastSyncAt || null,
      errorMessage: connection?.errorMessage || null,
      settings: {
        ...settings,
        webConnectorPassword: '',
        webConnectorPasswordSet,
      },
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
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop-family settings are only available for QuickBooks Desktop or QuickBooks Enterprise companies.' },
        { status: 400 }
      );
    }

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const webConnectorPassword = settings.webConnectorPassword;
    const settingsToStore = {
      ...settings,
      webConnectorPassword: '',
    };
    const fallbackPrograms = getDefaultPrograms(company.accountingSystem);
    const programs = sanitizePrograms(body.programs || fallbackPrograms, fallbackPrograms);
    const variant = getQuickBooksDesktopVariant(company.accountingSystem);

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
    const existingCredentials =
      existingMetadata.quickbooksDesktopCredentials &&
      typeof existingMetadata.quickbooksDesktopCredentials === 'object' &&
      !Array.isArray(existingMetadata.quickbooksDesktopCredentials)
        ? (existingMetadata.quickbooksDesktopCredentials as Record<string, unknown>)
        : {};
    const quickbooksDesktopCredentials = webConnectorPassword
      ? {
          ...existingCredentials,
          webConnectorUsername: settings.webConnectorUsername,
          webConnectorPasswordEncrypted: encryptOAuthToken(webConnectorPassword),
          webConnectorPasswordUpdatedAt: new Date().toISOString(),
        }
      : {
          ...existingCredentials,
          webConnectorUsername: settings.webConnectorUsername,
        };

    const mergedMetadata = {
      ...existingMetadata,
      quickbooksDesktopSettings: settingsToStore,
      quickbooksDesktopCredentials,
      quickbooksDesktopPrograms: programs,
      quickbooksDesktopVariant: variant,
      operationalPullTime: settingsToStore.syncTime || '08:00',
      operationalScheduleUpdatedAt: new Date().toISOString(),
      quickbooksDesktopLastUpdatedAt: new Date().toISOString(),
    };
    const scheduleFrequency = settingsToStore.syncFrequency || 'daily';
    const platformVersion = existing?.platformVersion || (variant === 'ENTERPRISE' ? 'qb-enterprise-1.0' : 'qb-desktop-1.0');

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion,
        status: existing?.status || 'INACTIVE',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'INACTIVE',
        platformVersion,
        autoSync: true,
        syncFrequency: scheduleFrequency,
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: `${getQuickBooksDesktopFamilyLabel(company.accountingSystem)} settings saved for this company.`,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save QuickBooks Desktop settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
