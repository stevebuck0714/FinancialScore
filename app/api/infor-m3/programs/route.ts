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
  // Infor CSI (SyteLine) extraction mapping defaults.
  { module: 'Chart of Accounts', miProgram: 'ChartOfAccounts', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Accounting Dimensions', miProgram: 'DimensionCodes', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'GL Transactions', miProgram: 'LedgerTransactions', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'GL Period Balances', miProgram: 'LedgerBalances', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Customers', miProgram: 'Customers', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Customer Addresses', miProgram: 'CustomerAddresses', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'AR Invoices', miProgram: 'CustomerInvoices', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'AR Payments', miProgram: 'ARPayments', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'AR Transactions', miProgram: 'ARPostedTransactions', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Vendors', miProgram: 'Vendors', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Vendor Addresses', miProgram: 'VendorAddresses', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'AP Invoices', miProgram: 'VendorInvoices', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'AP Payments', miProgram: 'APPayments', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'AP Transactions', miProgram: 'APPostedTransactions', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Bank Accounts', miProgram: 'BankAccounts', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Cash Ledger', miProgram: 'BankTransactions', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Payment Transactions', miProgram: 'CashReceipts', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Items', miProgram: 'Items', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Item Warehouse Balance', miProgram: 'ItemWarehouseBalances', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Inventory Transactions', miProgram: 'InventoryTransactions', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Lot/Serial Inventory', miProgram: 'ItemLotLocations', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Sales Orders', miProgram: 'SalesOrders', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Sales Order Lines', miProgram: 'SalesOrderLines', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Sales Invoices', miProgram: 'CustomerInvoices', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Customer Shipments', miProgram: 'CustomerShipments', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Purchase Orders', miProgram: 'PurchaseOrders', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'PO Lines', miProgram: 'PurchaseOrderLines', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Goods Receipts', miProgram: 'PurchaseOrderReceipts', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Work Orders', miProgram: 'Jobs', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Work Order Operations', miProgram: 'JobOperations', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'Production Reporting', miProgram: 'JobTransactions', transactions: ['GET'], cono: '', divi: '', enabled: true },
  { module: 'BOM', miProgram: 'BillOfMaterials', transactions: ['GET'], cono: '', divi: '', enabled: true },
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
    const cono = normalizeLegacyProgramField(typeof row?.cono === 'string' ? row.cono : '', 'cono');
    const divi = normalizeLegacyProgramField(typeof row?.divi === 'string' ? row.divi : '', 'divi');
    const requestedEnabled = typeof row?.enabled === 'boolean' ? row.enabled : true;
    const enabled = requestedEnabled;
    if (!module && !miProgram && transactions.length === 0 && !cono && !divi) continue;
    if (!module || !miProgram) {
      throw new Error('Each accounting program row must include module and MI program.');
    }
    // For CSI mappings, module + program are the required fields.
    // Transactions/CONO/DIVI are optional and environment-specific.
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

export const dynamic = 'force-dynamic';

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

    const programs = sanitizePrograms(metadata.accountingPrograms, { requireComplete: false });

    return NextResponse.json({
      ok: true,
      companyId,
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
