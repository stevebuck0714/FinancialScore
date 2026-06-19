import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import {
  getOperationalSystemConnection,
  isQuickBooksAccountingSystem,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';

export const dynamic = 'force-dynamic';

const SOURCE_CODE = 'PLATOS_CLOSET_STORE_VISIT';
const RETAIL_SECTOR_CODE = '45';

type PlatosClosetSettings = {
  templateName: string;
  acceptedFileType: '.xlsx' | '.csv' | '';
  uploadFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  uploadMode: 'REPLACE' | 'APPEND' | '';
  requiredSheetsText: string;
  workbookPath: string;
};

type PlatosClosetDataDomain = {
  dataDomain: string;
  workbookSection: string;
  enabled: boolean;
};

const defaultSettings: PlatosClosetSettings = {
  templateName: 'MONTHLY STORE VISIT REPORT',
  acceptedFileType: '.xlsx',
  uploadFrequency: 'monthly',
  syncTime: '08:00',
  initialSyncStartDate: '',
  uploadMode: 'REPLACE',
  requiredSheetsText: 'YTD Key Performance Indicators; YTD Key Indicator',
  workbookPath: 'docs/Store Visit MARCH.xlsx',
};

const defaultDataDomains: PlatosClosetDataDomain[] = [
  { dataDomain: 'Store KPIs', workbookSection: 'YTD Key Performance Indicators', enabled: true },
  { dataDomain: 'Sales Trends', workbookSection: 'YTD Key Performance Indicators', enabled: true },
  { dataDomain: 'Buy Trends', workbookSection: 'YTD Key Performance Indicators', enabled: true },
  { dataDomain: 'Loss Prevention', workbookSection: 'YTD Key Performance Indicators', enabled: true },
  { dataDomain: 'Marketing', workbookSection: 'YTD Key Performance Indicators', enabled: false },
  { dataDomain: 'Product Category Performance', workbookSection: 'YTD Key Indicator', enabled: true },
  { dataDomain: 'Cost Metrics', workbookSection: 'YTD Key Indicator', enabled: true },
  { dataDomain: 'Order Metrics', workbookSection: 'YTD Key Indicator', enabled: true },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): PlatosClosetSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const uploadFrequency = asString(src.uploadFrequency).toLowerCase();
  const uploadMode = asString(src.uploadMode).toUpperCase();
  const acceptedFileType = asString(src.acceptedFileType).toLowerCase();

  return {
    templateName: asString(src.templateName) || defaultSettings.templateName,
    acceptedFileType: acceptedFileType === '.csv' ? '.csv' : acceptedFileType === '.xlsx' ? '.xlsx' : defaultSettings.acceptedFileType,
    uploadFrequency:
      uploadFrequency === 'daily' || uploadFrequency === 'weekly' || uploadFrequency === 'monthly' ? uploadFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    uploadMode: uploadMode === 'APPEND' ? 'APPEND' : uploadMode === 'REPLACE' ? 'REPLACE' : 'REPLACE',
    requiredSheetsText: asString(src.requiredSheetsText) || defaultSettings.requiredSheetsText,
    workbookPath: asString(src.workbookPath) || defaultSettings.workbookPath,
  };
}

function sanitizeDataDomains(value: unknown): PlatosClosetDataDomain[] {
  if (!Array.isArray(value)) return defaultDataDomains;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        dataDomain: asString(src.dataDomain),
        workbookSection: asString(src.workbookSection),
        enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
      };
    })
    .filter((row) => row.dataDomain || row.workbookSection);
  return cleaned.length > 0 ? cleaned : defaultDataDomains;
}

async function getValidatedCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true, industrySector: true, industrySectorCategory: true },
  });
  if (!company) {
    throw new Error('Company not found');
  }
  if (!isQuickBooksAccountingSystem(company.accountingSystem)) {
    throw new Error('MONTHLY STORE VISIT REPORT settings are only available for QUICKBOOKS companies.');
  }
  if (resolveCompanyIndustrySectorCategory(company) !== RETAIL_SECTOR_CODE) {
    throw new Error('MONTHLY STORE VISIT REPORT is limited to Retail companies.');
  }
  return company;
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    await getValidatedCompany(companyId);

    const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', SOURCE_CODE);

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const platformSettings =
      metadata.platosClosetSettings && typeof metadata.platosClosetSettings === 'object' && !Array.isArray(metadata.platosClosetSettings)
        ? (metadata.platosClosetSettings as Record<string, unknown>)
        : {};

    const settings = sanitizeSettings({
      uploadFrequency: typeof connection?.syncFrequency === 'string' ? connection.syncFrequency : defaultSettings.uploadFrequency,
      ...platformSettings,
    });
    const dataDomains = sanitizeDataDomains(metadata.platosClosetDataDomains || defaultDataDomains);

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode: SOURCE_CODE,
      status: connection?.status || 'NOT_CONNECTED',
      lastSyncAt: connection?.lastSyncAt || null,
      errorMessage: connection?.errorMessage || null,
      settings,
      dataDomains,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load MONTHLY STORE VISIT REPORT settings';
    const status = message.includes('Company not found') ? 404 : message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    await getValidatedCompany(companyId);

    const existing = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', SOURCE_CODE);

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const dataDomains = sanitizeDataDomains(body.dataDomains || defaultDataDomains);
    const existingMetadata =
      existing?.connectionMetadata && typeof existing.connectionMetadata === 'object' && !Array.isArray(existing.connectionMetadata)
        ? (existing.connectionMetadata as Record<string, unknown>)
        : {};
    const mergedMetadata = {
      ...existingMetadata,
      platosClosetSettings: settings,
      platosClosetDataDomains: dataDomains,
      platosClosetLastUpdatedAt: new Date().toISOString(),
    };
    const scheduleFrequency = settings.uploadFrequency || 'monthly';

    await saveOperationalSystemConnection({
      companyId,
      provider: 'SPREADSHEET_UPLOAD',
      sourceCode: SOURCE_CODE,
      status: existing?.status || 'INACTIVE',
      autoSync: false,
      syncFrequency: scheduleFrequency,
      connectionMetadata: mergedMetadata,
      errorMessage: null,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      sourceCode: SOURCE_CODE,
      settings,
      dataDomains,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save MONTHLY STORE VISIT REPORT settings';
    const status = message.includes('Company not found') ? 404 : message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
