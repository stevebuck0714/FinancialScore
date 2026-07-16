import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getQuickBooksDesktopFamilyLabel, isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateQuickBooksDesktopSetup(metadata: Record<string, unknown>): string[] {
  const settings = asRecord(metadata.quickbooksDesktopSettings);
  const credentials = asRecord(metadata.quickbooksDesktopCredentials);
  const requiredFields: Array<[string, string]> = [
    ['integrationType', 'Integration Type'],
    ['applicationName', 'Application Name'],
    ['ownerId', 'Owner ID'],
    ['fileId', 'File ID'],
    ['webConnectorUsername', 'Web Connector Username'],
    ['desktopEditionYear', 'QB Desktop Edition + Year'],
    ['countryVersion', 'Country Version'],
    ['companyFilePath', 'Target Company File Path'],
    ['hostMachineName', 'Host Machine Name'],
  ];

  const missing = requiredFields
    .filter(([key]) => !asString(settings[key]))
    .map(([, label]) => label);

  if (asString(settings.integrationType) === 'WEB_CONNECTOR' && !asString(settings.soapEndpointUrl)) {
    missing.push('SOAP/App Endpoint URL');
  }
  if (!asString(credentials.webConnectorPasswordEncrypted)) {
    missing.push('Web Connector Password');
  }

  return missing;
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
        { ok: false, error: 'QuickBooks Desktop-family connection is only available for QuickBooks Desktop or QuickBooks Enterprise companies.' },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: 'QUICKBOOKS' } },
      select: {
        connectionMetadata: true,
        syncFrequency: true,
      },
    });
    if (!connection) {
      return NextResponse.json(
        { ok: false, error: `No saved ${getQuickBooksDesktopFamilyLabel(company.accountingSystem)} settings. Save settings before connecting.` },
        { status: 400 }
      );
    }

    const metadata = asRecord(connection.connectionMetadata);
    const missing = validateQuickBooksDesktopSetup(metadata);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot connect ${getQuickBooksDesktopFamilyLabel(company.accountingSystem)} until required setup values are entered.`,
          details: `Missing: ${missing.join(', ')}`,
          status: 'INACTIVE',
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await prisma.accountingConnection.update({
      where: { companyId_platform: { companyId, platform: 'QUICKBOOKS' } },
      data: {
        status: 'ACTIVE',
        autoSync: true,
        syncFrequency: connection.syncFrequency || 'daily',
        errorMessage: null,
        connectionMetadata: {
          ...metadata,
          quickbooksDesktopConnectedAt: now,
          quickbooksDesktopLastValidatedAt: now,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      status: 'ACTIVE',
      message: `${getQuickBooksDesktopFamilyLabel(company.accountingSystem)} marked connected. QuickBooks Web Connector can now sync on schedule.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to connect QuickBooks Desktop';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
