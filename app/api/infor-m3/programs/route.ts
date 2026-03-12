import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

type AccountingProgram = {
  module: string;
  miProgram: string;
  transactions: string[];
  cono: string;
  divi: string;
  enabled: boolean;
};

const DEFAULT_M3_PROGRAMS: AccountingProgram[] = [
  { module: 'Accounts', miProgram: 'CRS630MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Cash', miProgram: 'CRS690MI, CRS691MI, CRS692MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'AR', miProgram: 'ARS200MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'AP', miProgram: 'APS200MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Customer', miProgram: 'CRS610MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Supplier', miProgram: 'CRS620MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Inventory', miProgram: 'MMS200MI, MWS070MI', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Sales', miProgram: 'OIS100MI', transactions: [], cono: '', divi: '', enabled: true },
];

const DEFAULT_CSI_PROGRAMS: AccountingProgram[] = [
  { module: 'Accounts', miProgram: 'ChartOfAccounts', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Customers', miProgram: 'Customers', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Vendors', miProgram: 'Vendors', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'AR', miProgram: 'CustomerInvoices', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'AP', miProgram: 'VendorInvoices', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Cash', miProgram: 'BankAccounts', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Inventory', miProgram: 'Items', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Inventory Transactions', miProgram: 'InventoryTransactions', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Sales Orders', miProgram: 'SalesOrders', transactions: [], cono: '', divi: '', enabled: true },
  { module: 'Purchase Orders', miProgram: 'PurchaseOrders', transactions: [], cono: '', divi: '', enabled: true },
];

function isInforCsiSystem(accountingSystem: unknown): boolean {
  return String(accountingSystem || '').trim().toUpperCase() === 'INFOR_CSI';
}

function getDefaultProgramsForAccountingSystem(accountingSystem: unknown): AccountingProgram[] {
  return isInforCsiSystem(accountingSystem) ? DEFAULT_CSI_PROGRAMS : DEFAULT_M3_PROGRAMS;
}

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
    const transactions = normalizeTransactions(row);
    const cono = typeof row?.cono === 'string' ? row.cono.trim() : '';
    const divi = typeof row?.divi === 'string' ? row.divi.trim() : '';
    const enabled = typeof row?.enabled === 'boolean' ? row.enabled : true;
    if (!module && !miProgram && transactions.length === 0 && !cono && !divi) continue;
    if (!module || !miProgram) {
      throw new Error('Each accounting program row must include module and program/entity.');
    }
    // Only enforce full required fields for rows the user has enabled.
    if (requireComplete && enabled && (transactions.length === 0 || !divi)) {
      throw new Error(
        'Each enabled accounting program row must include module, program/entity, at least one transaction/method, and DIVI.'
      );
    }
    const dedupeKey = `${module}::${miProgram}::${transactions.join('|')}::${cono || ''}::${divi || ''}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `Duplicate accounting program row detected for ${module} / ${miProgram} / ${transactions.join(', ')} / ${cono} / ${divi}.`
      );
    }
    seen.add(dedupeKey);
    cleaned.push({
      module,
      miProgram,
      transactions,
      cono,
      divi,
      enabled,
    });
  }
  return cleaned;
}

function mergeProgramsWithMissingDefaults(programs: AccountingProgram[], defaults: AccountingProgram[]): AccountingProgram[] {
  if (programs.length === 0) return defaults;
  const existingModules = new Set(programs.map((row) => row.module.trim().toLowerCase()).filter(Boolean));
  const missingDefaults = defaults.filter(
    (row) => row.module && !existingModules.has(row.module.trim().toLowerCase())
  );
  return [...programs, ...missingDefaults];
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });

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
    const defaults = getDefaultProgramsForAccountingSystem(company?.accountingSystem);
    const programs = sanitizePrograms(metadata.accountingPrograms, { requireComplete: false });

    return NextResponse.json({
      ok: true,
      companyId,
      programs: mergeProgramsWithMissingDefaults(programs, defaults),
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
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const requireComplete = !isInforCsiSystem(company?.accountingSystem);
    const programs = sanitizePrograms(body.programs, { requireComplete });

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
