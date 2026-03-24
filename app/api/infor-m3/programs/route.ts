import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestedCompanyId, requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem, type InforSystem } from '@/lib/infor-m3/system';

type AccountingProgram = {
  module: string;
  miProgram?: string;
  transactions?: string[];
  cono?: string;
  divi?: string;
  endpointPath?: string;
  mongooseConfig?: string;
  site?: string;
  recordCap?: number;
  properties?: string[];
  enabled: boolean;
};

type SitePolicy = 'required' | 'optional' | 'none';

const SITE_REQUIRED_CSI_IDOS = new Set(['SLITEMLOCS', 'SLCOITEMS', 'SLINVHDRS', 'SLBANKHDRS']);
const SITE_OPTIONAL_CSI_IDOS = new Set(['SLITEMS', 'SLARTRANS', 'SLAPTRX', 'SLAPTRXP', 'SLAPTRXPS', 'SLAPTRXS', 'SLCUSTOMERS', 'SLVENDORS']);

function resolveCsiSitePolicy(program: AccountingProgram): SitePolicy {
  const ido = String(program.miProgram || '').trim().toUpperCase();
  if (SITE_REQUIRED_CSI_IDOS.has(ido)) return 'required';
  if (SITE_OPTIONAL_CSI_IDOS.has(ido)) return 'optional';
  return 'none';
}

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

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnabledValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
  }
  if (typeof value === 'number') return value !== 0;
  return true;
}

const DEFAULT_PROGRAMS: AccountingProgram[] = [
  // Infor CSI (SyteLine) IDO pull defaults for operational tabs.
  {
    module: 'Customers',
    miProgram: 'SLCustomers',
    endpointPath:
      '/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=500',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'AR',
    miProgram: 'SLArtrans',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLArtrans?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'AP',
    miProgram: 'SLAptrx',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLAptrx?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLCoitems',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCoitems?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLInvHdrs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLInvHdrs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'Inventory',
    miProgram: 'SLItems',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLItems?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'Inventory',
    miProgram: 'SLItemlocs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLItemlocs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'Vendors',
    miProgram: 'SLVendors',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLVendors?properties=VendNum,Name&recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'Cash',
    miProgram: 'SLBankHdrs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLBankHdrs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'SLCharts',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCharts?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'SLLedgers',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLLedgers?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
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

function sanitizePrograms(
  value: unknown,
  options?: { requireComplete?: boolean; inforSystem?: InforSystem }
): AccountingProgram[] {
  const requireComplete = Boolean(options?.requireComplete);
  const inforSystem = options?.inforSystem;
  if (!Array.isArray(value)) return [];
  const cleaned: AccountingProgram[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const module = typeof row?.module === 'string' ? row.module.trim() : '';
    const miProgram = typeof row?.miProgram === 'string' ? row.miProgram.trim() : '';
    const transactions = normalizeTransactions(row).filter((tx) => !isLegacyTransactionPlaceholder(tx));
    const endpointPath = typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '';
    // Support legacy aliases seen across CSI payload variants.
    const mongooseConfig = normalizeOptionalString(
      row?.mongooseConfig ??
        row?.mongoose_configuration ??
        row?.mongooseConfiguration ??
        row?.configName ??
        row?.configurationName ??
        row?.config
    );
    const site = normalizeOptionalString(
      row?.site ??
        row?.siteCode ??
        row?.facility ??
        row?.warehouseSite
    );
    const recordCap = Number.isFinite(Number(row?.recordCap)) ? Number(row.recordCap) : undefined;
    const properties = Array.isArray(row?.properties)
      ? row.properties
          .map((p: unknown) => (typeof p === 'string' ? p.trim() : ''))
          .filter(Boolean)
      : [];
    const cono = normalizeLegacyProgramField(typeof row?.cono === 'string' ? row.cono : '', 'cono');
    const divi = normalizeLegacyProgramField(typeof row?.divi === 'string' ? row.divi : '', 'divi');
    const requestedEnabled = normalizeEnabledValue(row?.enabled);
    let enabled = requestedEnabled;
    if (!module && !miProgram && !endpointPath && transactions.length === 0 && !cono && !divi) continue;
    if (!module || (!miProgram && !endpointPath)) {
      throw new Error('Each accounting program row must include module plus MI program or endpoint path.');
    }
    if (requireComplete && inforSystem === 'INFOR_CSI' && enabled) {
      // For CSI, incomplete rows are automatically disabled instead of
      // blocking save, so the Enabled toggle behaves as operators expect.
      if (!mongooseConfig || !site) {
        enabled = false;
      }
    }
    const dedupeKey = `${module}::${miProgram || ''}::${endpointPath || ''}::${site || ''}::${transactions.join('|')}::${cono || ''}::${divi || ''}`;
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
      site: site || undefined,
      recordCap,
      properties: properties.length ? Array.from(new Set(properties)) : undefined,
      enabled,
    });
  }
  return cleaned;
}

function normalizeCsiProgramAliases(program: AccountingProgram): AccountingProgram {
  const miProgram = String(program.miProgram || '').trim();
  const normalizedProgram = miProgram.toUpperCase();
  if (
    normalizedProgram !== 'SLAPTRX' &&
    normalizedProgram !== 'SLAPTRXP' &&
    normalizedProgram !== 'SLAPTRXS' &&
    normalizedProgram !== 'SLAPTRXPS'
  ) return program;

  const endpointPath = String(program.endpointPath || '');
  return {
    ...program,
    miProgram: 'SLAptrx',
    endpointPath: endpointPath
      ? endpointPath.replace(/SLAptrxp|SLAptrxs|SLAptrxps/gi, 'SLAptrx')
      : '/APR_PRD/CSI/IDORequestService/ido/load/SLAptrx?recordCap=1000',
  };
}

function mergeWithCsiDefaults(programs: AccountingProgram[]): AccountingProgram[] {
  const normalizedExisting = programs.map(normalizeCsiProgramAliases);
  const byProgram = new Map<string, AccountingProgram>();
  const passthrough: AccountingProgram[] = [];

  normalizedExisting.forEach((row) => {
    const key = String(row.miProgram || '').trim().toUpperCase();
    if (key) {
      byProgram.set(key, row);
    } else {
      passthrough.push(row);
    }
  });

  const mergedDefaults = DEFAULT_PROGRAMS.map((def) => {
    const key = String(def.miProgram || '').trim().toUpperCase();
    const existing = key ? byProgram.get(key) : null;
    if (!existing) return def;
    if (key) byProgram.delete(key);
    return {
      ...def,
      ...existing,
      // Keep canonical CSI program ID where aliases are known.
      miProgram: def.miProgram || existing.miProgram,
    };
  });

  return [...mergedDefaults, ...Array.from(byProgram.values()), ...passthrough];
}

function inferInforSystemFromPrograms(programs: AccountingProgram[]): InforSystem {
  for (const program of programs) {
    const endpointPath = String(program.endpointPath || '').toLowerCase();
    const miProgram = String(program.miProgram || '').trim().toUpperCase();
    if (endpointPath.includes('/csi/') || miProgram.startsWith('SL')) {
      return 'INFOR_CSI';
    }
  }
  return 'INFOR_M3';
}

export const dynamic = 'force-dynamic';

async function resolveInforSystem(companyId: string): Promise<InforSystem> {
  const normalizedCompanyId = normalizeOptionalString(companyId);
  if (!normalizedCompanyId) {
    throw new Error('Company ID is required for accounting program requests.');
  }
  const company = await prisma.company.findUnique({
    where: { id: normalizedCompanyId },
    select: { accountingSystem: true },
  });
  return normalizeInforSystem(company?.accountingSystem);
}

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = getRequestedCompanyId(request);
    if (!requestedCompanyId) {
      return NextResponse.json(
        { error: 'companyId is required.' },
        { status: 400 }
      );
    }
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
    const programs = sanitizePrograms(scopedPrograms, { requireComplete: false, inforSystem });
    // If a company has already saved programs, return exactly what is persisted.
    // Only bootstrap defaults when no company-specific rows exist yet.
    const effectivePrograms =
      programs.length > 0
        ? programs
        : inforSystem === 'INFOR_CSI'
          ? mergeWithCsiDefaults(DEFAULT_PROGRAMS)
          : DEFAULT_PROGRAMS;
    const programsWithSitePolicy =
      inforSystem === 'INFOR_CSI'
        ? effectivePrograms.map((program) => ({ ...program, sitePolicy: resolveCsiSitePolicy(program) }))
        : effectivePrograms;

    return NextResponse.json(
      {
        ok: true,
        companyId,
        inforSystem,
        programs: programsWithSitePolicy,
        siteScopedIdos:
          inforSystem === 'INFOR_CSI'
            ? {
                required: Array.from(SITE_REQUIRED_CSI_IDOS.values()),
                optional: Array.from(SITE_OPTIONAL_CSI_IDOS.values()),
              }
            : undefined,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
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
    const requestedCompanyId = getRequestedCompanyId(request, body);
    if (!requestedCompanyId) {
      return NextResponse.json(
        { error: 'companyId is required.' },
        { status: 400 }
      );
    }
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const inforSystem = await resolveInforSystem(companyId);
    const programs = sanitizePrograms(body.programs, { requireComplete: true, inforSystem });
    const inferredSystem = inferInforSystemFromPrograms(programs);
    const targetSystem: InforSystem = inferredSystem || inforSystem;

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

    const bySystem =
      existingMetadata.accountingProgramsBySystem && typeof existingMetadata.accountingProgramsBySystem === 'object'
        ? (existingMetadata.accountingProgramsBySystem as Record<string, unknown>)
        : {};
    const programsToPersist = programs;

    const mergedMetadata = {
      ...existingMetadata,
      accountingPrograms: programsToPersist,
      accountingProgramsBySystem: {
        ...bySystem,
        [targetSystem]: programsToPersist,
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

    const companyForSystem = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const currentSystem = String(companyForSystem?.accountingSystem || '').trim().toUpperCase();
    if (currentSystem !== targetSystem) {
      await prisma.company.update({
        where: { id: companyId },
        data: { accountingSystem: targetSystem },
      });
    }

    return NextResponse.json({
      ok: true,
      companyId,
      inforSystem: targetSystem,
      programs: programsToPersist,
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
