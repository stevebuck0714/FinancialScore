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
  initialSyncStartDate: string;
};

type QuickBooksDesktopProgram = {
  dataDomain: string;
  qbEntity: string;
  enabled: boolean;
};

const newlyAddedDefaultProgramEntities = new Set([
  'BalanceSheetStandardReportQuery',
  'TrialBalanceReportQuery',
  'GeneralDetailReportQuery',
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
  'OtherNameQuery',
  'EntityQuery',
]);

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
  initialSyncStartDate: '',
};

const defaultPrograms: QuickBooksDesktopProgram[] = [
  { dataDomain: 'Chart of Accounts', qbEntity: 'AccountQuery', enabled: true },
  { dataDomain: 'Balance Sheet Standard Report', qbEntity: 'BalanceSheetStandardReportQuery', enabled: true },
  { dataDomain: 'Trial Balance Report', qbEntity: 'TrialBalanceReportQuery', enabled: true },
  { dataDomain: 'General Ledger Detail Report', qbEntity: 'GeneralDetailReportQuery', enabled: true },
  { dataDomain: 'AR Aging Summary Report', qbEntity: 'ARAgingSummaryReportQuery', enabled: true },
  { dataDomain: 'AP Aging Summary Report', qbEntity: 'APAgingSummaryReportQuery', enabled: true },
  { dataDomain: 'Other Names', qbEntity: 'OtherNameQuery', enabled: true },
  { dataDomain: 'Entities', qbEntity: 'EntityQuery', enabled: true },
  { dataDomain: 'Customers', qbEntity: 'CustomerQuery', enabled: true },
  { dataDomain: 'Vendors', qbEntity: 'VendorQuery', enabled: true },
  { dataDomain: 'Invoices', qbEntity: 'InvoiceQuery', enabled: true },
  { dataDomain: 'Bills', qbEntity: 'BillQuery', enabled: true },
  { dataDomain: 'Payments', qbEntity: 'ReceivePaymentQuery', enabled: true },
  { dataDomain: 'Items / Products', qbEntity: 'ItemQuery', enabled: true },
  { dataDomain: 'Sales Receipts', qbEntity: 'SalesReceiptQuery', enabled: true },
  { dataDomain: 'Deposits', qbEntity: 'DepositQuery', enabled: true },
  { dataDomain: 'Credit Memos', qbEntity: 'CreditMemoQuery', enabled: true },
  { dataDomain: 'Journal Entries', qbEntity: 'JournalEntryQuery', enabled: true },
  { dataDomain: 'Purchase Orders', qbEntity: 'PurchaseOrderQuery', enabled: true },
  { dataDomain: 'Checks', qbEntity: 'CheckQuery', enabled: true },
  { dataDomain: 'Vendor Credits', qbEntity: 'VendorCreditQuery', enabled: true },
  { dataDomain: 'Bill Payments - Checks', qbEntity: 'BillPaymentCheckQuery', enabled: true },
  { dataDomain: 'Bill Payments - Credit Cards', qbEntity: 'BillPaymentCreditCardQuery', enabled: true },
];

const defaultEnterprisePrograms: QuickBooksDesktopProgram[] = [
  { dataDomain: 'Chart of Accounts', qbEntity: 'AccountQuery', enabled: true },
  { dataDomain: 'Balance Sheet Standard Report', qbEntity: 'BalanceSheetStandardReportQuery', enabled: true },
  { dataDomain: 'Trial Balance Report', qbEntity: 'TrialBalanceReportQuery', enabled: true },
  { dataDomain: 'General Ledger Detail Report', qbEntity: 'GeneralDetailReportQuery', enabled: true },
  { dataDomain: 'AR Aging Summary Report', qbEntity: 'ARAgingSummaryReportQuery', enabled: true },
  { dataDomain: 'AP Aging Summary Report', qbEntity: 'APAgingSummaryReportQuery', enabled: true },
  { dataDomain: 'Other Names', qbEntity: 'OtherNameQuery', enabled: true },
  { dataDomain: 'Entities', qbEntity: 'EntityQuery', enabled: true },
  { dataDomain: 'Offices / Divisions', qbEntity: 'ClassQuery', enabled: true },
  { dataDomain: 'Customers / Jobs', qbEntity: 'CustomerQuery', enabled: true },
  { dataDomain: 'Customer Types', qbEntity: 'CustomerTypeQuery', enabled: true },
  { dataDomain: 'Job Types', qbEntity: 'JobTypeQuery', enabled: true },
  { dataDomain: 'Vendors', qbEntity: 'VendorQuery', enabled: true },
  { dataDomain: 'Vendor Types', qbEntity: 'VendorTypeQuery', enabled: true },
  { dataDomain: 'Employees / Agents', qbEntity: 'EmployeeQuery', enabled: true },
  { dataDomain: 'Sales Reps', qbEntity: 'SalesRepQuery', enabled: true },
  { dataDomain: 'Service / Product Items', qbEntity: 'ItemQuery', enabled: true },
  { dataDomain: 'Terms', qbEntity: 'TermsQuery', enabled: true },
  { dataDomain: 'Payment Methods', qbEntity: 'PaymentMethodQuery', enabled: true },
  { dataDomain: 'Sales Tax Codes', qbEntity: 'SalesTaxCodeQuery', enabled: true },
  { dataDomain: 'Invoices', qbEntity: 'InvoiceQuery', enabled: true },
  { dataDomain: 'Sales Receipts', qbEntity: 'SalesReceiptQuery', enabled: true },
  { dataDomain: 'Payments', qbEntity: 'ReceivePaymentQuery', enabled: true },
  { dataDomain: 'Deposits', qbEntity: 'DepositQuery', enabled: true },
  { dataDomain: 'Credit Memos', qbEntity: 'CreditMemoQuery', enabled: true },
  { dataDomain: 'Estimates', qbEntity: 'EstimateQuery', enabled: true },
  { dataDomain: 'Sales Orders', qbEntity: 'SalesOrderQuery', enabled: true },
  { dataDomain: 'Bills', qbEntity: 'BillQuery', enabled: true },
  { dataDomain: 'Bill Payments - Checks', qbEntity: 'BillPaymentCheckQuery', enabled: true },
  { dataDomain: 'Bill Payments - Credit Cards', qbEntity: 'BillPaymentCreditCardQuery', enabled: true },
  { dataDomain: 'Vendor Credits', qbEntity: 'VendorCreditQuery', enabled: true },
  { dataDomain: 'Checks', qbEntity: 'CheckQuery', enabled: true },
  { dataDomain: 'Credit Card Charges', qbEntity: 'CreditCardChargeQuery', enabled: true },
  { dataDomain: 'Purchase Orders', qbEntity: 'PurchaseOrderQuery', enabled: true },
  { dataDomain: 'Item Receipts', qbEntity: 'ItemReceiptQuery', enabled: true },
  { dataDomain: 'Journal Entries', qbEntity: 'JournalEntryQuery', enabled: true },
  { dataDomain: 'Transfers', qbEntity: 'TransferQuery', enabled: true },
  { dataDomain: 'Inventory Adjustments', qbEntity: 'InventoryAdjustmentQuery', enabled: true },
  { dataDomain: 'Inventory Sites', qbEntity: 'InventorySiteQuery', enabled: true },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function summarizeLatestWebConnectorSession(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const sessions = asRecord(metadata.quickbooksDesktopWebConnectorSessions);
  if (!sessions) return null;

  const lastRun = asRecord(metadata.quickbooksDesktopWebConnectorLastRun);
  const completedTicket = asString(lastRun?.ticket);
  const session = Object.values(sessions)
    .map(asRecord)
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .sort((a, b) => asString(b.updatedAt).localeCompare(asString(a.updatedAt)))[0];
  if (!session || asString(session.ticket) === completedTicket) return null;

  const requests = Array.isArray(session.requests) ? session.requests.map((value) => String(value || '')) : [];
  const currentIndex = Math.max(0, Number(session.currentIndex || 0));
  if (requests.length > 0 && currentIndex >= requests.length) return null;
  const responses = asRecord(session.responses) || {};
  const iterators = asRecord(session.iterators) || {};
  const currentRequest = requests[currentIndex] || '';
  const currentIterator = asRecord(iterators[currentRequest]);

  return {
    ticket: asString(session.ticket),
    createdAt: asString(session.createdAt) || null,
    updatedAt: asString(session.updatedAt) || null,
    currentIndex,
    requestCount: requests.length,
    currentRequest,
    dateRange: asRecord(session.dateRange),
    lastError: asString(session.lastError) || null,
    iteratorRemainingCount: Number(currentIterator?.remainingCount || 0) || null,
    currentPageCount: Number(currentIterator?.pageCount || 0) || null,
    recordCounts: Object.fromEntries(
      Object.entries(responses).map(([key, response]) => {
        const responseRecord = asRecord(response);
        const recordCount = Number(responseRecord?.recordCount || 0);
        return [
          key,
          recordCount || (Array.isArray(responseRecord?.records) ? (responseRecord?.records as unknown[]).length : 0),
        ];
      }),
    ),
  };
}

function summarizeBackfillJobs(metadata: Record<string, unknown>): Array<Record<string, unknown>> {
  const jobs = asRecord(metadata.quickbooksDesktopBackfillJobs);
  if (!jobs) return [];
  return Object.values(jobs)
    .map(asRecord)
    .filter((job): job is Record<string, unknown> => Boolean(job))
    .map((job) => ({
      id: asString(job.id),
      batchId: asString(job.batchId),
      status: asString(job.status) || 'unknown',
      requestName: asString(job.requestName),
      dateRange: asRecord(job.dateRange),
      createdAt: asString(job.createdAt) || null,
      updatedAt: asString(job.updatedAt) || null,
      startedAt: asString(job.startedAt) || null,
      completedAt: asString(job.completedAt) || null,
      failedAt: asString(job.failedAt) || null,
      recordCount: Number(job.recordCount || 0),
      pageCount: Number(job.pageCount || 0),
      iteratorRemainingCount: job.iteratorRemainingCount === null ? null : Number(job.iteratorRemainingCount || 0),
      lastError: asString(job.lastError) || null,
    }))
    .sort((a, b) => asString(a.createdAt).localeCompare(asString(b.createdAt)));
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
    initialSyncStartDate: asString(src.initialSyncStartDate),
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
        enabled: src.enabled !== false,
      };
    })
    .filter((row) => row.dataDomain || row.qbEntity);
  if (cleaned.length === 0) return fallbackPrograms;
  const existingEntities = new Set(cleaned.map((row) => row.qbEntity).filter(Boolean));
  const missingDefaults = fallbackPrograms.filter(
    (row) => row.qbEntity && newlyAddedDefaultProgramEntities.has(row.qbEntity) && !existingEntities.has(row.qbEntity),
  );
  return [...cleaned, ...missingDefaults];
}

function hasRequiredQuickBooksDesktopSetup(
  settings: QuickBooksDesktopSettings,
  credentials: Record<string, unknown>
): boolean {
  const requiredKeys: Array<keyof QuickBooksDesktopSettings> = [
    'integrationType',
    'applicationName',
    'ownerId',
    'fileId',
    'webConnectorUsername',
    'desktopEditionYear',
    'countryVersion',
    'companyFilePath',
    'hostMachineName',
  ];
  if (requiredKeys.some((key) => !asString(settings[key]))) return false;
  if (settings.integrationType === 'WEB_CONNECTOR' && !asString(settings.soapEndpointUrl)) return false;
  return Boolean(asString(credentials.webConnectorPasswordEncrypted));
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
    const effectiveStatus =
      connection?.status === 'ACTIVE' && !hasRequiredQuickBooksDesktopSetup(settings, existingCredentials)
        ? 'INACTIVE'
        : connection?.status || 'NOT_CONNECTED';

    return NextResponse.json({
      ok: true,
      companyId,
      status: effectiveStatus,
      lastSyncAt: connection?.lastSyncAt || null,
      errorMessage: connection?.errorMessage || null,
      queuedDateRange: asRecord(metadata.quickbooksDesktopQueuedDateRange),
      webConnectorLastRun: asRecord(metadata.quickbooksDesktopWebConnectorLastRun),
      webConnectorActiveSession: summarizeLatestWebConnectorSession(metadata),
      backfillJobs: summarizeBackfillJobs(metadata),
      detailBackfillJobs: summarizeBackfillJobs({
        quickbooksDesktopBackfillJobs: metadata.quickbooksDesktopDetailBackfillJobs,
      }),
      detailBackfillLastRun: asRecord(metadata.quickbooksDesktopDetailBackfillLastRun),
      lastWebConnectorSyncAt: asString(metadata.quickbooksDesktopLastWebConnectorSyncAt) || null,
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
    const isCurrentlyConnected = existing?.status === 'ACTIVE';

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
        status: isCurrentlyConnected ? 'ACTIVE' : 'INACTIVE',
        autoSync: isCurrentlyConnected,
        syncFrequency: scheduleFrequency,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'INACTIVE',
        platformVersion,
        autoSync: false,
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
