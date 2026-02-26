import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

function isSageIntacctCompany(system: unknown): boolean {
  const normalized = String(system || '').toUpperCase();
  return normalized === 'SAGE_INTACCT' || normalized === 'SAGE';
}

type SageIntacctSettings = {
  senderId: string;
  senderPassword: string;
  companyId: string;
  userId: string;
  userPassword: string;
  entityId: string;
  endpointUrl: string;
  dtdVersion: string;
  locationId: string;
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
};

type SageIntacctProgram = {
  module: string;
  objectName: string;
};

const defaultSettings: SageIntacctSettings = {
  senderId: '',
  senderPassword: '',
  companyId: '',
  userId: '',
  userPassword: '',
  entityId: '',
  endpointUrl: '',
  dtdVersion: '3.0',
  locationId: '',
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

const defaultPrograms: SageIntacctProgram[] = [
  { module: 'Chart of Accounts', objectName: 'GLACCOUNT' },
  { module: 'Customers', objectName: 'CUSTOMER' },
  { module: 'Vendors', objectName: 'VENDOR' },
  { module: 'AR', objectName: 'ARINVOICE' },
  { module: 'AP', objectName: 'APBILL' },
  { module: 'Sales', objectName: 'SODOCUMENT' },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSettings(value: unknown): SageIntacctSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency);
  return {
    senderId: asString(src.senderId),
    senderPassword: asString(src.senderPassword),
    companyId: asString(src.companyId),
    userId: asString(src.userId),
    userPassword: asString(src.userPassword),
    entityId: asString(src.entityId),
    endpointUrl: asString(src.endpointUrl),
    dtdVersion: asString(src.dtdVersion) || '3.0',
    locationId: asString(src.locationId),
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: asString(src.incrementalSync) === 'NO' ? 'NO' : asString(src.incrementalSync) === 'YES' ? 'YES' : '',
  };
}

function sanitizePrograms(value: unknown): SageIntacctProgram[] {
  if (!Array.isArray(value)) return defaultPrograms;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        module: asString(src.module),
        objectName: asString(src.objectName),
      };
    })
    .filter((row) => row.module || row.objectName);
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
    if (!isSageIntacctCompany(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Sage Intacct settings are only available for SAGE_INTACCT/SAGE companies.' },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'SAGE_INTACCT',
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
    const settings = sanitizeSettings(metadata.sageIntacctSettings || defaultSettings);
    const programs = sanitizePrograms(metadata.sageIntacctPrograms || defaultPrograms);

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
    const message = error?.message || 'Failed to load Sage Intacct settings';
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
    if (!isSageIntacctCompany(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Sage Intacct settings are only available for SAGE_INTACCT/SAGE companies.' },
        { status: 400 }
      );
    }

    const settings = sanitizeSettings(body.settings || defaultSettings);
    const programs = sanitizePrograms(body.programs || defaultPrograms);

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'SAGE_INTACCT',
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
      sageIntacctSettings: settings,
      sageIntacctPrograms: programs,
      sageIntacctLastUpdatedAt: new Date().toISOString(),
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'SAGE_INTACCT',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion: existing?.platformVersion || 'sage-intacct-1.0',
        status: existing?.status || 'INACTIVE',
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'SAGE_INTACCT',
        status: 'INACTIVE',
        platformVersion: 'sage-intacct-1.0',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Sage Intacct settings saved for this company.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save Sage Intacct settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
