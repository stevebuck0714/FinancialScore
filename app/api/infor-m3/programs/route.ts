import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem, type InforSystem } from '@/lib/infor-m3/system';

type AccountingProgram = {
  module: string;
  miProgram?: string;
  transactions?: string[];
  cono?: string;
  divi?: string;
  endpointPath?: string;
  mongooseConfig?: string;
  recordCap?: number;
  properties?: string[];
  enabled: boolean;
};

function isLegacyTransactionPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    normalized === 'transaction 1' ||
    normalized === 'transaction 2' ||
    normalized === 'transaction1' ||
    normalized === 'transaction2'
  );
}

function normalizeLegacyProgramField(value: string, placeholder: 'cono' | 'divi'): string {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.toLowerCase() === placeholder) return '';
  return normalized;
}

const DEFAULT_PROGRAMS: AccountingProgram[] = [
  // Infor CSI (SyteLine) IDO pull defaults for operational tabs.
  {
    module: 'Customers',
    miProgram: 'SLCustomers',
    endpointPath:
      '/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=500',
    mongooseConfig: 'TMSManager',
    enabled: true,
  },
  {
    module: 'AR',
    miProgram: 'SLArtrans',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLArtrans?recordCap=1000',
    mongooseConfig: 'TMSManager',
    enabled: true,
  },
  {
    module: 'AP',
    miProgram: 'SLAptrxs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLAptrxs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLCoitems',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCoitems?recordCap=1000',
    mongooseConfig: 'TMSManager',
    enabled: true,
  },
  {
    module: 'Inventory',
    miProgram: 'SLItems',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLItems?recordCap=1000',
    mongooseConfig: 'TMSManager',
    enabled: true,
  },
  {
    module: 'Cash',
    miProgram: 'SLBankHdrs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLBankHdrs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    enabled: true,
  },
];

function normalizeTransactions(row: any): string[] {
  const fromArray = Array.isArray(row?.transactions)
    ? row.transactions
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];
  if (fromArray.length > 0) {
    return Array.from(new Set(fromArray));
  }

  const legacyTransaction = typeof row?.transaction === 'string' ? row.transaction.trim() : '';
  return legacyTransaction ? [legacyTransaction] : [];
}

function sanitizePrograms(value: unknown, options?: { requireComplete?: boolean }): AccountingProgram[] {
  const requireComplete = Boolean(options?.requireComplete);
  if (!Array.isArray(value)) return [];
  const cleaned: AccountingProgram[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const module = typeof row?.module === 'string' ? row.module.trim() : '';
    const miProgram = typeof row?.miProgram === 'string' ? row.miProgram.trim() : '';
    const transactions = normalizeTransactions(row).filter((tx) => !isLegacyTransactionPlaceholder(tx));
    const endpointPath = typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '';
    const mongooseConfig = typeof row?.mongooseConfig === 'string' ? row.mongooseConfig.trim() : '';
    const recordCap = Number.isFinite(Number(row?.recordCap)) ? Number(row.recordCap) : undefined;
    const properties = Array.isArray(row?.properties)
      ? row.properties
          .map((p: unknown) => (typeof p === 'string' ? p.trim() : ''))
          .filter(Boolean)
      : [];
    const cono = normalizeLegacyProgramField(typeof row?.cono === 'string' ? row.cono : '', 'cono');
    const divi = normalizeLegacyProgramField(typeof row?.divi === 'string' ? row.divi : '', 'divi');
    const requestedEnabled = typeof row?.enabled === 'boolean' ? row.enabled : true;
    const enabled = requestedEnabled;
    if (!module && !miProgram && !endpointPath && transactions.length === 0 && !cono && !divi) continue;
    if (!module || (!miProgram && !endpointPath)) {
      throw new Error('Each accounting program row must include module plus MI program or endpoint path.');
    }
    const dedupeKey = `${module}::${miProgram || ''}::${endpointPath || ''}::${transactions.join('|')}::${cono || ''}::${divi || ''}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `Duplicate accounting program row detected for ${module} / ${miProgram || endpointPath}.`
      );
    }
    seen.add(dedupeKey);
    cleaned.push({
      module,
      miProgram: miProgram || undefined,
      endpointPath: endpointPath || undefined,
      transactions: transactions.length ? transactions : undefined,
      cono: cono || undefined,
      divi: divi || undefined,
      mongooseConfig: mongooseConfig || undefined,
      recordCap,
      properties: properties.length ? Array.from(new Set(properties)) : undefined,
      enabled,
    });
  }
  return cleaned;
}

export const dynamic = 'force-dynamic';

async function resolveInforSystem(companyId: string): Promise<InforSystem> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  return normalizeInforSystem(company?.accountingSystem);
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
      },
    });

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const inforSystem = await resolveInforSystem(companyId);
    const bySystem =
      metadata.accountingProgramsBySystem && typeof metadata.accountingProgramsBySystem === 'object'
        ? (metadata.accountingProgramsBySystem as Record<string, unknown>)
        : {};
    const scopedPrograms = bySystem[inforSystem] ?? metadata.accountingPrograms;
    const programs = sanitizePrograms(scopedPrograms, { requireComplete: false });

    return NextResponse.json({
      ok: true,
      companyId,
      inforSystem,
      programs: programs.length > 0 ? programs : DEFAULT_PROGRAMS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to load accounting programs',
        details: message,
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const inforSystem = await resolveInforSystem(companyId);
    const programs = sanitizePrograms(body.programs, { requireComplete: true });

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
      },
    });

    const existingMetadata =
      existing?.connectionMetadata && typeof existing.connectionMetadata === 'object'
        ? (existing.connectionMetadata as Record<string, unknown>)
        : {};

    const mergedMetadata = {
      ...existingMetadata,
      accountingPrograms: programs,
      accountingProgramsBySystem: {
        ...((existingMetadata.accountingProgramsBySystem as Record<string, unknown>) || {}),
        [inforSystem]: programs,
      },
      accountingProgramsUpdatedAt: new Date().toISOString(),
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: 'INACTIVE',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      inforSystem,
      programs,
      message: 'Accounting programs saved for this company.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to save accounting programs',
        details: message,
      },
      { status }
    );
  }
}
