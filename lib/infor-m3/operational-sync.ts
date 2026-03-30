import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import { randomUUID } from 'node:crypto';

type InforProgramRow = {
  module: string;
  miProgram?: string;
  transactions: string[];
  cono?: string;
  divi?: string;
  endpointPath?: string;
  mongooseConfig?: string;
  site?: string;
  recordCap?: number;
  properties?: string[];
  enabled: boolean;
};

type InforOperationalSyncResult = {
  success: boolean;
  recordsCreated: number;
  errors: string[];
  credentialSource: 'database' | 'env' | null;
  hasMore: boolean;
  nextProgramOffset: number | null;
  continuation: {
    programOffset: number;
    requestOffset: number;
    bookmark: string | null;
  } | null;
  totalProgramRows: number;
};

type SyncMode = 'daily_overlap' | 'backfill' | 'manual';
type SyncWindow = {
  startDate: Date;
  endDate: Date;
  mode: SyncMode;
};
type SyncOptions = {
  snapshotDateOverride?: Date;
  preserveCashSnapshot?: boolean;
  skipPrune?: boolean;
  syncRunId?: string;
  salesOnly?: boolean;
  programOffset?: number;
  programLimit?: number;
  requestOffset?: number;
  bookmark?: string | null;
};

type SitePolicy = 'required' | 'optional' | 'none';

const DEFAULT_CSI_PROGRAM_ROWS: InforProgramRow[] = [
  {
    module: 'Customers',
    miProgram: 'SLCustomers',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=500',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'AR',
    miProgram: 'SLArtrans',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLArtrans?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'AP',
    miProgram: 'SLAptrx',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLAptrx?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLCos',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCos?properties=CoNum,CustNum,DerCustNoName,Stat,OrderDate,DueDate&recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLCohdrs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCohdrs?properties=CoNum,CustNum,DerCustNoName,Stat,OrderDate,DueDate&recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLCoitems',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCoitems?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Sales',
    miProgram: 'SLInvHdrs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLInvHdrs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Inventory',
    miProgram: 'SLItems',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLItems?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Inventory',
    miProgram: 'SLItemlocs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLItemlocs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Cash',
    miProgram: 'SLBankHdrs',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLBankHdrs?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'Vendors',
    miProgram: 'SLVendors',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLVendors?properties=VendNum,Name&recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'SLChartAccts',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLChartAccts?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'SLGLTRANS',
    endpointPath:
      '/APR_PRD/CSI/IDORequestService/ido/load/SLGLTRANS?properties=Acct,TransDate,DomAmount,ForAmount,Amount,DrCr,RecordDate,Site,TransNum,Ref,Description&recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'GLAcctPeriodBalances',
    endpointPath:
      '/APR_PRD/CSI/IDORequestService/ido/load/GLAcctPeriodBalances?properties=Acct,FiscalYear,FiscalPeriod,BegBalance,Debit,Credit,EndBalance,Site&recordCap=200',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'SLLedgers',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLLedgers?recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
];

function recordSiteValue(record: Record<string, unknown>): string | null {
  return (
    pickString(record, ['Site', 'site', 'SITE']) ||
    pickString(record, ['Whse', 'whse', 'warehouse']) ||
    null
  );
}

function filterRecordsBySiteIfSupported(records: Record<string, unknown>[], site: string | undefined): Record<string, unknown>[] {
  const requested = String(site || '').trim();
  if (!requested) return records;
  const hasSiteField = records.some((record) => recordSiteValue(record) !== null);
  if (!hasSiteField) return records;
  const filtered = records.filter((record) => {
    const value = recordSiteValue(record);
    return Boolean(value && value.toLowerCase() === requested.toLowerCase());
  });
  // Some CSI IDOs expose warehouse/location fields that don't map 1:1 to site code.
  // Avoid dropping an otherwise valid payload when strict site filtering yields nothing.
  return filtered.length > 0 ? filtered : records;
}

const SITE_REQUIRED_CSI_IDOS = new Set(['SLITEMLOCS', 'SLCOITEMS', 'SLINVHDRS', 'SLBANKHDRS']);
const SITE_OPTIONAL_CSI_IDOS = new Set(['SLITEMS', 'SLARTRANS', 'SLAPTRX', 'SLAPTRXP', 'SLAPTRXPS', 'SLAPTRXS', 'SLCUSTOMERS', 'SLVENDORS']);

function resolveSitePolicy(row: InforProgramRow, moduleType: ReturnType<typeof classifyModule>): SitePolicy {
  const ido = String(row.miProgram || '').trim().toUpperCase();
  if (SITE_REQUIRED_CSI_IDOS.has(ido)) return 'required';
  if (SITE_OPTIONAL_CSI_IDOS.has(ido)) return 'optional';
  if (moduleType === 'inventory' || moduleType === 'sales' || moduleType === 'cash') return 'optional';
  return 'none';
}

function hasRecordSiteDimension(records: Record<string, unknown>[]): boolean {
  return records.some((record) => recordSiteValue(record) !== null);
}

function classifyArApFlow(moduleType: 'ar' | 'ap', transaction: string): 'payments' | 'open' | 'aging' {
  const tx = transaction.trim().toLowerCase();
  if (moduleType === 'ar') {
    if (tx.includes('pay') || tx.includes('receipt') || tx.includes('settlement') || tx.includes('cash')) return 'payments';
    if (tx.includes('open') || tx.includes('invoice') || tx.includes('outstanding') || tx.includes('cust') || tx.includes('csi')) return 'open';
    return 'aging';
  }
  if (tx.includes('pay') || tx.includes('settlement') || tx.includes('disburs') || tx.includes('cash')) return 'payments';
  if (tx.includes('open') || tx.includes('invoice') || tx.includes('bill') || tx.includes('supplier') || tx.includes('vendor') || tx.includes('csi')) return 'open';
  return 'aging';
}

function aggregateForCompanyRollup(
  records: Record<string, unknown>[],
  moduleType: ReturnType<typeof classifyModule>,
  flow: 'payments' | 'open' | 'aging' | null
): Record<string, unknown>[] {
  if (!records.length) return records;
  const grouped = new Map<string, Record<string, unknown>>();

  const upsert = (key: string, seed: Record<string, unknown>, merge: (acc: Record<string, unknown>) => void) => {
    if (!grouped.has(key)) grouped.set(key, seed);
    const acc = grouped.get(key)!;
    merge(acc);
  };

  for (const record of records) {
    if (moduleType === 'ar' && flow === 'open') {
      const customerName = pickCustomerDisplayName(record) || 'Unknown Customer';
      const customerId = pickString(record, CUSTOMER_ID_KEYS) || '';
      const invoiceNo = pickString(record, AR_INVOICE_NO_KEYS) || '';
      const key = `${customerId}|${customerName}|${invoiceNo}`;
      upsert(
        key,
        {
          customerName,
          customerId,
          invoiceNo,
          invoiceDate: pickString(record, ['invoiceDate', 'date', 'IVDT']) || null,
          dueDate: pickString(record, ['dueDate', 'DUDT']) || null,
          status: pickString(record, ['status', 'STAT']) || null,
          currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']) || null,
          amountCurrency: 0,
          amountHome: 0,
          amountDueHome: 0,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
        },
        (acc) => {
          acc.amountCurrency = Number(acc.amountCurrency || 0) + pickNumber(record, AR_AMOUNT_CURRENCY_KEYS);
          acc.amountHome = Number(acc.amountHome || 0) + pickNumber(record, AR_AMOUNT_HOME_KEYS);
          acc.amountDueHome = Number(acc.amountDueHome || 0) + pickNumber(record, AR_AMOUNT_DUE_KEYS);
          acc.current = Number(acc.current || 0) + pickNumber(record, ['current', 'bucket0']);
          acc.days1to30 = Number(acc.days1to30 || 0) + pickNumber(record, ['days1to30', 'bucket1']);
          acc.days31to60 = Number(acc.days31to60 || 0) + pickNumber(record, ['days31to60', 'bucket2']);
          acc.days61to90 = Number(acc.days61to90 || 0) + pickNumber(record, ['days61to90', 'bucket3']);
          acc.days90plus = Number(acc.days90plus || 0) + pickNumber(record, ['days90plus', 'bucket4']);
        }
      );
      continue;
    }

    if (moduleType === 'ap' && flow === 'open') {
      const vendorName = pickString(record, VENDOR_NAME_KEYS) || 'Unknown Vendor';
      const vendorId = pickString(record, VENDOR_ID_KEYS) || '';
      const billNo = pickString(record, ['billNo', 'billNumber', 'invoiceNo', 'voucher', 'SINO']) || '';
      const key = `${vendorId}|${vendorName}|${billNo}`;
      upsert(
        key,
        {
          vendorName,
          vendorId,
          billNo,
          billDate: pickString(record, ['billDate', 'invoiceDate', 'date', 'IVDT']) || null,
          dueDate: pickString(record, ['dueDate', 'DUDT']) || null,
          status: pickString(record, ['status', 'STAT']) || null,
          currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']) || null,
          amountCurrency: 0,
          amountHome: 0,
          amountDueHome: 0,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
        },
        (acc) => {
          acc.amountCurrency = Number(acc.amountCurrency || 0) + pickNumber(record, ['amountCurrency', 'billAmount', 'CUAM']);
          acc.amountHome = Number(acc.amountHome || 0) + pickNumber(record, ['amountHome', 'homeAmount', 'ACAM']);
          acc.amountDueHome = Number(acc.amountDueHome || 0) + pickNumber(record, ['amountDueHome', 'amountDue', 'openAmount', 'balance', 'CUAM', 'ACAM']);
          acc.current = Number(acc.current || 0) + pickNumber(record, ['current', 'bucket0']);
          acc.days1to30 = Number(acc.days1to30 || 0) + pickNumber(record, ['days1to30', 'bucket1']);
          acc.days31to60 = Number(acc.days31to60 || 0) + pickNumber(record, ['days31to60', 'bucket2']);
          acc.days61to90 = Number(acc.days61to90 || 0) + pickNumber(record, ['days61to90', 'bucket3']);
          acc.days90plus = Number(acc.days90plus || 0) + pickNumber(record, ['days90plus', 'bucket4']);
        }
      );
      continue;
    }

    if (moduleType === 'customer') {
      const customerName = pickString(record, CUSTOMER_NAME_KEYS) || 'Unknown Customer';
      const customerId = pickString(record, CUSTOMER_ID_KEYS) || '';
      const key = `${customerId}|${customerName}`;
      upsert(
        key,
        { customerName, customerId, revenue: 0, invoiceCount: 0 },
        (acc) => {
          const explicitRevenue = pickNumber(record, [
            'revenue',
            'amount',
            'salesAmount',
            'NETA',
            'Amount',
            'Price',
            'ExtPrice',
            'DerOrderBalance',
            'DerPaymentCheckAmount',
          ]);
          const quantity = pickNumber(record, ['quantity', 'qty', 'QTY', 'quantitySold', 'QtyPackages', 'InvSeq']);
          const unitPrice = pickNumber(record, ['unitPrice', 'price', 'Price', 'salesPrice', 'Upri']);
          const inferredRevenue = explicitRevenue !== 0 ? explicitRevenue : quantity * unitPrice;
          const explicitInvoiceCount = pickNumber(record, ['invoiceCount', 'count', 'IVNO_COUNT', 'InvSeq']);
          const inferredInvoiceCount = explicitInvoiceCount > 0 ? Math.round(explicitInvoiceCount) : inferredRevenue !== 0 ? 1 : 0;

          acc.revenue = Number(acc.revenue || 0) + inferredRevenue;
          acc.invoiceCount = Number(acc.invoiceCount || 0) + Math.max(0, inferredInvoiceCount);
        }
      );
      continue;
    }

    if (moduleType === 'sales') {
      const itemName = pickString(record, ['itemName', 'name', 'ITDS', 'Item', 'AddrName', 'DerCustNoName']) || 'Unknown Item';
      const itemId = pickString(record, ['itemId', 'ITNO', 'sku', 'Item', 'CustNum']) || '';
      const sku = pickString(record, ['sku', 'itemCode', 'ITNO', 'Item', 'InvNum', 'CoNum']) || '';
      const key = `${itemId}|${itemName}|${sku}`;
      upsert(
        key,
        { itemName, itemId, sku, quantity: 0, revenue: 0, cogs: 0 },
        (acc) => {
          const metrics = deriveSalesMetrics(record);
          acc.quantity = Number(acc.quantity || 0) + metrics.quantity;
          acc.revenue = Number(acc.revenue || 0) + metrics.revenue;
          acc.cogs = Number(acc.cogs || 0) + metrics.cogs;
        }
      );
      continue;
    }

    if (moduleType === 'inventory') {
      const itemName = pickString(record, ['itemName', 'name', 'ITDS']) || 'Unknown Item';
      const itemId = pickString(record, ['itemId', 'ITNO', 'sku']) || '';
      const sku = pickString(record, ['sku', 'itemCode', 'ITNO']) || '';
      const key = `${itemId}|${itemName}|${sku}`;
      upsert(
        key,
        { itemName, itemId, sku, qtyOnHand: 0, assetValue: 0, avgCost: 0 },
        (acc) => {
          const qty = pickNumber(record, ['qtyOnHand', 'quantity', 'QTY', 'onHand']);
          const avgCost = pickNumber(record, ['avgCost', 'cost', 'averageCost']);
          const value = pickNumber(record, ['assetValue', 'value', 'inventoryValue']) || qty * avgCost;
          acc.qtyOnHand = Number(acc.qtyOnHand || 0) + qty;
          acc.assetValue = Number(acc.assetValue || 0) + value;
          acc.avgCost = Number(acc.qtyOnHand || 0) > 0 ? Number(acc.assetValue || 0) / Number(acc.qtyOnHand || 0) : 0;
        }
      );
      continue;
    }

    if (moduleType === 'cash') {
      const accountName =
        pickString(record, [
          'accountName',
          'bankAccount',
          'name',
          'Name',
          'ACNM',
          'bankName',
          'ChtDescription',
          'ChaDescription',
        ]) || 'Cash Account';
      const accountId = pickString(record, ['accountId', 'accountNumber', 'ACID', 'bankId', 'Acct']) || '';
      const accountNumber = pickString(record, ['accountNumber', 'ACNO', 'Acct']) || '';
      const key = `${accountId}|${accountName}|${accountNumber}`;
      upsert(
        key,
        { accountName, accountId, accountNumber, balance: 0 },
        (acc) => {
          acc.balance =
            Number(acc.balance || 0) +
            pickNumber(record, ['balance', 'cashBalance', 'amount', 'BALA', 'BAL', 'DomBalance', 'ForBalance']);
        }
      );
      continue;
    }

    const fallbackKey = JSON.stringify(record);
    upsert(fallbackKey, { ...record }, () => undefined);
  }

  return Array.from(grouped.values());
}

function normalizeTransactions(row: any): string[] {
  const fromArray = Array.isArray(row?.transactions)
    ? row.transactions
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];
  if (fromArray.length > 0) return Array.from(new Set(fromArray));
  const legacy = typeof row?.transaction === 'string' ? row.transaction.trim() : '';
  return legacy ? [legacy] : [];
}

function parsePrograms(value: unknown): InforProgramRow[] {
  if (!Array.isArray(value)) return [];
  const rows: InforProgramRow[] = [];
  for (const row of value) {
    const module = typeof row?.module === 'string' ? row.module.trim() : '';
    const miProgramRaw = typeof row?.miProgram === 'string' ? row.miProgram.trim() : '';
    const upperMiProgram = miProgramRaw.toUpperCase();
    const miProgram =
      upperMiProgram === 'SLAPTRX' || upperMiProgram === 'SLAPTRXP' || upperMiProgram === 'SLAPTRXS' || upperMiProgram === 'SLAPTRXPS'
        ? 'SLAptrx'
        : miProgramRaw;
    const transactions = normalizeTransactions(row);
    const cono = typeof row?.cono === 'string' ? row.cono.trim() : '';
    const divi = typeof row?.divi === 'string' ? row.divi.trim() : '';
    const endpointPathRaw = typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '';
    const endpointPath =
      upperMiProgram === 'SLAPTRX' || upperMiProgram === 'SLAPTRXP' || upperMiProgram === 'SLAPTRXS' || upperMiProgram === 'SLAPTRXPS'
        ? endpointPathRaw.replace(/SLAptrxp|SLAptrxs|SLAptrxps/gi, 'SLAptrx')
        : endpointPathRaw;
    const mongooseConfig = typeof row?.mongooseConfig === 'string' ? row.mongooseConfig.trim() : '';
    const site = typeof row?.site === 'string' ? row.site.trim() : '';
    const recordCap = Number.isFinite(Number(row?.recordCap)) ? Number(row.recordCap) : undefined;
    const properties = Array.isArray(row?.properties)
      ? row.properties
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
      : [];
    const enabled = typeof row?.enabled === 'boolean' ? row.enabled : true;
    if (!enabled || !module) continue;
    if (!endpointPath && !miProgram) continue;
    rows.push({
      module,
      miProgram: miProgram || undefined,
      endpointPath: endpointPath || undefined,
      transactions,
      cono: cono || undefined,
      divi: divi || undefined,
      mongooseConfig: mongooseConfig || undefined,
      site: site || undefined,
      recordCap,
      properties: properties.length ? Array.from(new Set(properties)) : undefined,
      enabled,
    });
  }
  return rows;
}

function extractRecords(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const data = body as Record<string, unknown>;
  if (Array.isArray(data.results)) return data.results as Record<string, unknown>[];
  if (Array.isArray(data.records)) return data.records as Record<string, unknown>[];
  if (Array.isArray(data.Items)) return data.Items as Record<string, unknown>[];
  if (Array.isArray(data.items)) return data.items as Record<string, unknown>[];
  if (Array.isArray(data.MIRecord)) return data.MIRecord as Record<string, unknown>[];
  return [];
}

function isTransportAndPayloadSuccess(response: { ok: boolean; body: Record<string, unknown> | string }): boolean {
  if (!response.ok) return false;
  if (!response.body || typeof response.body !== 'object') return true;
  const payload = response.body as Record<string, unknown>;
  if (typeof payload.Success === 'boolean') {
    return payload.Success;
  }
  return true;
}

function extractResponseMessage(body: Record<string, unknown> | string): string {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  return String((body.Message as string | undefined) || (body.error as string | undefined) || '').trim();
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

function extractPagingState(body: Record<string, unknown> | string): { moreRowsExist: boolean; bookmark: string | null } {
  if (!body || typeof body !== 'object') return { moreRowsExist: false, bookmark: null };
  const payload = body as Record<string, unknown>;
  const bookmark =
    typeof payload.Bookmark === 'string'
      ? payload.Bookmark.trim()
      : typeof payload.bookmark === 'string'
        ? payload.bookmark.trim()
        : '';
  return {
    moreRowsExist: asBoolean(payload.MoreRowsExist ?? payload.moreRowsExist),
    bookmark: bookmark || null,
  };
}

function normalizeCsiLoadPaging(endpointPath: string, mode: 'FIRST' | 'NEXT', bookmark?: string | null): string {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  params.set('loadtype', mode);
  if (mode === 'NEXT' && bookmark && bookmark.trim()) {
    params.set('bookmark', bookmark.trim());
  } else {
    params.delete('bookmark');
  }
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function appendBookmarkToEndpoint(endpointPath: string, bookmark: string): string {
  return normalizeCsiLoadPaging(endpointPath, 'NEXT', bookmark);
}

function formatCsiDateLiteral(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCsiDateTimeLiteral(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  const millisecond = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function buildSlInvHdrsWindowFilter(window?: SyncWindow): string | null {
  if (!window) return null;
  const start = formatCsiDateLiteral(window.startDate);
  const end = formatCsiDateLiteral(window.endDate);
  return `(InvDate >= '${start}' and InvDate <= '${end}')`;
}

function buildSlLedgersPeriodFilter(window?: SyncWindow, site?: string): string | null {
  if (!window) return null;
  const startYear = window.startDate.getUTCFullYear();
  const startPeriod = window.startDate.getUTCMonth() + 1;
  const endYear = window.endDate.getUTCFullYear();
  const endPeriod = window.endDate.getUTCMonth() + 1;
  const pad = (value: number) => String(Math.max(1, Math.floor(value))).padStart(2, '0');
  const startPeriodToken = pad(startPeriod);
  const endPeriodToken = pad(endPeriod);

  // Daily overlap keeps fetch scope tight to the current accounting period.
  // Backfill/manual must span a period range across months/years.
  const periodClause =
    window.mode === 'daily_overlap'
      ? `(ControlYear='${endYear}' and ControlPeriod='${endPeriodToken}')`
      : `(
          (ControlYear > '${startYear}' or (ControlYear='${startYear}' and ControlPeriod >= '${startPeriodToken}'))
          and
          (ControlYear < '${endYear}' or (ControlYear='${endYear}' and ControlPeriod <= '${endPeriodToken}'))
        )`;
  const startDate = formatCsiDateLiteral(window.startDate);
  const endDate = formatCsiDateLiteral(window.endDate);
  const transDateClause = `(TransDate >= '${startDate}' and TransDate <= '${endDate}')`;
  const clauses = [periodClause, transDateClause];
  const siteValue = String(site || '').trim();
  if (siteValue) {
    const safeSite = siteValue.replace(/'/g, "''");
    clauses.unshift(`Site='${safeSite}'`);
  }
  return `(${clauses.join(' and ')})`;
}

function buildSlGlTransWindowFilter(window?: SyncWindow, site?: string): string | null {
  if (!window) return null;
  const start = formatCsiDateLiteral(window.startDate);
  const end = formatCsiDateLiteral(window.endDate);
  const clauses = [`(TransDate >= '${start}' and TransDate <= '${end}')`];
  const siteValue = String(site || '').trim();
  if (siteValue) {
    const safeSite = siteValue.replace(/'/g, "''");
    clauses.unshift(`Site='${safeSite}'`);
  }
  return `(${clauses.join(' and ')})`;
}

function buildSlArtransWindowFilter(window?: SyncWindow, site?: string): string | null {
  if (!window) return null;
  const start = formatCsiDateLiteral(window.startDate);
  const end = formatCsiDateLiteral(window.endDate);
  const clauses = [`(InvDate >= '${start}' and InvDate <= '${end}')`];
  const siteValue = String(site || '').trim();
  if (siteValue) {
    const safeSite = siteValue.replace(/'/g, "''");
    clauses.unshift(`Site='${safeSite}'`);
  }
  return `(${clauses.join(' and ')})`;
}

function buildSlArtransAsOfFilter(window?: SyncWindow, site?: string): string | null {
  if (!window) return null;
  const end = formatCsiDateLiteral(window.endDate);
  const clauses = [`(RecordDate <= '${end}')`];
  const siteValue = String(site || '').trim();
  if (siteValue) {
    const safeSite = siteValue.replace(/'/g, "''");
    clauses.unshift(`Site='${safeSite}'`);
  }
  return `(${clauses.join(' and ')})`;
}

function applyCsiSourceWindowAndSort(
  endpointPath: string,
  row: InforProgramRow,
  moduleType: ReturnType<typeof classifyModule>,
  window?: SyncWindow
): { endpointPath: string; applied: boolean } {
  if (!/\/IDORequestService\/ido\/load\//i.test(endpointPath)) {
    return { endpointPath, applied: false };
  }

  // Start with known high-volume CSI sources where narrowing by window materially
  // reduces repeated page scans and aligns payload coverage to the requested run.
  const ido = String(row.miProgram || '').trim().toUpperCase();
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  if (moduleType === 'sales' && ido === 'SLCOITEMS') {
    // SLCoitems must page deterministically across the full order-line universe.
    // Do not rely on implicit backend ordering.
    if (!params.get('orderby') && !params.get('orderBy')) {
      // Prefer newest order-number band first so overlap with SLCos can be validated quickly.
      params.set('orderby', 'CoNum desc, CoLine desc, CoRelease desc');
    }
    if (!params.get('recordCap')) params.set('recordCap', '1000');
    const next = params.toString();
    return { endpointPath: next ? `${path}?${next}` : path, applied: true };
  }
  if (moduleType === 'sales' && ido === 'SLINVHDRS') {
    const filter = buildSlInvHdrsWindowFilter(window);
    if (!filter) return { endpointPath, applied: false };
    if (!params.get('filter')) params.set('filter', filter);
    if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'InvDate desc, RecordDate desc');
    const next = params.toString();
    return { endpointPath: next ? `${path}?${next}` : path, applied: true };
  }

  if (moduleType === 'gl' && ido === 'SLLEDGERS') {
    const filter = buildSlLedgersPeriodFilter(window, row.site);
    if (!filter) return { endpointPath, applied: false };
    // For SLLedgers, extract by accounting period instead of RecordDate ranges.
    // This avoids sparse month coverage and aligns to financial reporting periods.
    params.set('filter', filter);
    params.set('recordCap', '1000');
    if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'Site asc,TransNum asc');
    const next = params.toString();
    return { endpointPath: next ? `${path}?${next}` : path, applied: true };
  }

  // SLBankHdrs in this CSI tenant rejects filter expressions with
  // IllegalFilterException (including Site/RecordDate predicates).
  // Keep the request unfiltered and rely on downstream logic/sources.

  if (moduleType === 'gl' && ido === 'SLGLTRANS') {
    const filter = buildSlGlTransWindowFilter(window, row.site);
    if (!filter) return { endpointPath, applied: false };
    params.set('filter', filter);
    params.set('recordCap', '500');
    if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'TransDate desc, RecordDate desc');
    const next = params.toString();
    return { endpointPath: next ? `${path}?${next}` : path, applied: true };
  }

  if (moduleType === 'ar' && ido === 'SLARTRANS') {
    // SLArtrans snapshots need prior-period transactions to preserve historical open-item carryover.
    // For non-overlap runs, apply an as-of RecordDate cap (<= endDate) rather than a same-day InvDate slice.
    if (window && window.mode !== 'daily_overlap') {
      const asOfFilter = buildSlArtransAsOfFilter(window, row.site);
      if (asOfFilter) params.set('filter', asOfFilter);
    }
    params.set('recordCap', '1000');
    if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'RecordDate desc, InvDate desc');
    const next = params.toString();
    return { endpointPath: next ? `${path}?${next}` : path, applied: true };
  }

  return { endpointPath, applied: false };
}

const SLINVHDRS_KEYSET_PREFIX = 'slinvhdrs-keyset:';
type SlInvHdrsKeyset = {
  invDate: string;
  recordDate: string | null;
};
const SLCUSTOMERS_KEYSET_PREFIX = 'slcustomers-keyset:';
type SlCustomersKeyset = {
  custNum: string;
  custSeq: string;
};
const SLARTRANS_KEYSET_PREFIX = 'slartrans-keyset:';
type SlArtransKeyset = {
  rowPointer: string;
};
const SLLEDGERS_KEYSET_PREFIX = 'slledgers-keyset:';
type SlLedgersKeyset = {
  site: string;
  transNum: string;
};

function encodeSlInvHdrsKeysetBookmark(value: SlInvHdrsKeyset): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${SLINVHDRS_KEYSET_PREFIX}${encoded}`;
}

function decodeSlInvHdrsKeysetBookmark(value: string | null): SlInvHdrsKeyset | null {
  if (!value || !value.startsWith(SLINVHDRS_KEYSET_PREFIX)) return null;
  const encoded = value.slice(SLINVHDRS_KEYSET_PREFIX.length).trim();
  if (!encoded) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SlInvHdrsKeyset>;
    if (!decoded || typeof decoded.invDate !== 'string' || !decoded.invDate.trim()) return null;
    return {
      invDate: decoded.invDate.trim(),
      recordDate: typeof decoded.recordDate === 'string' && decoded.recordDate.trim() ? decoded.recordDate.trim() : null,
    };
  } catch {
    return null;
  }
}

function applySlInvHdrsKeysetCursor(endpointPath: string, keyset: SlInvHdrsKeyset): string {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  const existingFilter = params.get('filter');
  const continuationCondition = keyset.recordDate
    ? `((InvDate < '${keyset.invDate}') or (InvDate = '${keyset.invDate}' and RecordDate < '${keyset.recordDate}'))`
    : `(InvDate < '${keyset.invDate}')`;
  params.set('filter', existingFilter ? `(${existingFilter}) and ${continuationCondition}` : continuationCondition);
  params.delete('bookmark');
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function buildSlInvHdrsKeysetBookmarkFromRecords(records: Record<string, unknown>[]): string | null {
  if (!records.length) return null;
  const lastRecord = records[records.length - 1];
  const invDate = parseMaybeDate(pickString(lastRecord, ['InvDate', 'invoiceDate', 'date']));
  if (!invDate) return null;
  const recordDate = parseMaybeDate(pickString(lastRecord, ['RecordDate', 'recordDate']));
  return encodeSlInvHdrsKeysetBookmark({
    invDate: formatCsiDateLiteral(invDate),
    recordDate: recordDate ? formatCsiDateTimeLiteral(recordDate) : null,
  });
}

function encodeSlCustomersKeysetBookmark(value: SlCustomersKeyset): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${SLCUSTOMERS_KEYSET_PREFIX}${encoded}`;
}

function decodeSlCustomersKeysetBookmark(value: string | null): SlCustomersKeyset | null {
  if (!value || !value.startsWith(SLCUSTOMERS_KEYSET_PREFIX)) return null;
  const encoded = value.slice(SLCUSTOMERS_KEYSET_PREFIX.length).trim();
  if (!encoded) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SlCustomersKeyset>;
    if (!decoded || typeof decoded.custNum !== 'string' || !decoded.custNum.trim()) return null;
    const custNum = decoded.custNum.trim();
    const custSeq = typeof decoded.custSeq === 'string' && decoded.custSeq.trim() ? decoded.custSeq.trim() : '0';
    return { custNum, custSeq };
  } catch {
    return null;
  }
}

function applySlCustomersKeysetCursor(endpointPath: string, keyset: SlCustomersKeyset): string {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  const existingFilter = params.get('filter');
  const continuationCondition = `((CustNum > '${keyset.custNum}') or (CustNum = '${keyset.custNum}' and CustSeq > ${keyset.custSeq}))`;
  params.set('filter', existingFilter ? `(${existingFilter}) and ${continuationCondition}` : continuationCondition);
  if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'CustNum asc, CustSeq asc');
  params.delete('bookmark');
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function buildSlCustomersKeysetBookmarkFromRecords(records: Record<string, unknown>[]): string | null {
  if (!records.length) return null;
  const lastRecord = records[records.length - 1];
  const custNum = pickString(lastRecord, ['CustNum', 'customerId', 'CUNO']);
  if (!custNum) return null;
  const custSeq = pickString(lastRecord, ['CustSeq', 'customerSeq']) || '0';
  return encodeSlCustomersKeysetBookmark({ custNum: custNum.trim(), custSeq: custSeq.trim() || '0' });
}

function encodeSlArtransKeysetBookmark(value: SlArtransKeyset): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${SLARTRANS_KEYSET_PREFIX}${encoded}`;
}

function decodeSlArtransKeysetBookmark(value: string | null): SlArtransKeyset | null {
  if (!value || !value.startsWith(SLARTRANS_KEYSET_PREFIX)) return null;
  const encoded = value.slice(SLARTRANS_KEYSET_PREFIX.length).trim();
  if (!encoded) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SlArtransKeyset>;
    if (!decoded || typeof decoded.rowPointer !== 'string' || !decoded.rowPointer.trim()) return null;
    return { rowPointer: decoded.rowPointer.trim() };
  } catch {
    return null;
  }
}

function applySlArtransKeysetCursor(endpointPath: string, keyset: SlArtransKeyset): string {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  const existingFilter = params.get('filter');
  const continuationCondition = `(RowPointer > '${keyset.rowPointer}')`;
  params.set('filter', existingFilter ? `(${existingFilter}) and ${continuationCondition}` : continuationCondition);
  if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'RowPointer asc');
  params.delete('bookmark');
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function buildSlArtransKeysetBookmarkFromRecords(records: Record<string, unknown>[]): string | null {
  if (!records.length) return null;
  const lastRecord = records[records.length - 1];
  const rowPointer = pickString(lastRecord, ['RowPointer', '_ItemId']);
  if (!rowPointer) return null;
  return encodeSlArtransKeysetBookmark({ rowPointer: rowPointer.trim() });
}

function encodeSlLedgersKeysetBookmark(value: SlLedgersKeyset): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${SLLEDGERS_KEYSET_PREFIX}${encoded}`;
}

function decodeSlLedgersKeysetBookmark(value: string | null): SlLedgersKeyset | null {
  if (!value || !value.startsWith(SLLEDGERS_KEYSET_PREFIX)) return null;
  const encoded = value.slice(SLLEDGERS_KEYSET_PREFIX.length).trim();
  if (!encoded) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SlLedgersKeyset>;
    const site = typeof decoded.site === 'string' ? decoded.site.trim() : '';
    const transNum = typeof decoded.transNum === 'string' ? decoded.transNum.trim() : '';
    if (!site || !transNum) return null;
    return { site, transNum };
  } catch {
    return null;
  }
}

function applySlLedgersKeysetCursor(endpointPath: string, keyset: SlLedgersKeyset): string {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  const existingFilter = params.get('filter');
  const safeSite = keyset.site.replace(/'/g, "''");
  const transNumRaw = keyset.transNum.trim();
  const safeTransNum = transNumRaw.replace(/'/g, "''");
  const transNumExpr = /^-?\d+(\.\d+)?$/.test(transNumRaw) ? safeTransNum : `'${safeTransNum}'`;
  const continuationCondition = `((Site > '${safeSite}') or (Site = '${safeSite}' and TransNum > ${transNumExpr}))`;
  params.set('filter', existingFilter ? `(${existingFilter}) and ${continuationCondition}` : continuationCondition);
  params.set('orderby', 'Site asc,TransNum asc');
  params.delete('bookmark');
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function buildSlLedgersKeysetBookmarkFromRecords(records: Record<string, unknown>[]): string | null {
  if (!records.length) return null;
  const lastRecord = records[records.length - 1];
  const site = pickString(lastRecord, ['Site', 'site']);
  const transNum = pickString(lastRecord, ['TransNum', 'transNum']);
  if (!site || !transNum || !/^\d+$/.test(transNum.trim())) return null;
  return encodeSlLedgersKeysetBookmark({ site: site.trim(), transNum: transNum.trim() });
}

function buildSlLedgersKeysetBookmarkFromCsiBookmark(bookmark: string | null): string | null {
  if (!bookmark) return null;
  const candidates = [bookmark];
  try {
    const decoded = decodeURIComponent(bookmark);
    if (decoded !== bookmark) candidates.push(decoded);
  } catch {}
  for (const candidate of candidates) {
    const fBlockMatch = candidate.match(/<F>([\s\S]*?)<\/F>/i) || candidate.match(/<L>([\s\S]*?)<\/L>/i);
    const fieldBlock = fBlockMatch?.[1];
    if (!fieldBlock) continue;
    const values = Array.from(fieldBlock.matchAll(/<v>([\s\S]*?)<\/v>/gi))
      .map((m) => String(m?.[1] || '').trim())
      .filter(Boolean);
    if (values.length < 2) continue;
    const site = values[0];
    const transNum = values[1];
    if (!site || !transNum) continue;
    return encodeSlLedgersKeysetBookmark({ site, transNum });
  }
  return null;
}

function resolveSlaPtrxFallbackPath(endpointPath: string): string | null {
  if (!/\/load\/SLAptrx|\/load\/SLAptrxp|\/load\/SLAptrxps/i.test(endpointPath)) return null;
  if (/\/load\/SLAptrx(?=\?|$)/i.test(endpointPath)) return null;
  return endpointPath
    .replace(/\/load\/SLAptrxps/gi, '/load/SLAptrx')
    .replace(/\/load\/SLAptrxp(?=\?|$)/gi, '/load/SLAptrx');
}

const SLA_PTRXP_SAFE_PROPERTIES = ['VendNum', 'Name', 'InvNum', 'InvDate', 'DueDate', 'CurrCode', 'Amount'];
const SLA_PTRX_SAFE_PROPERTIES = ['VendNum', 'InvNum', 'InvDate', 'DueDate', 'CurrCode', 'Amount'];
const AP_IDO_CANDIDATES = ['SLAptrx', 'SLAptrxp', 'SLAptrxps', 'SLAptrxs', 'Aptrx', 'Aptrxp', 'Aptrxps', 'Aptrxs'];
const GL_TRANSACTION_SAFE_PROPERTIES = [
  'Acct',
  'TransDate',
  'DomAmount',
  'ForAmount',
  'Amount',
  'DrCr',
  'RecordDate',
  'Site',
  'TransNum',
  'Ref',
];
const GL_TRANSACTION_IDO_CANDIDATES = [
  'SLGlTrans',
  'SLGLTran',
  'SLGLDist',
  'SLJournalTrans',
  'SLTrans',
  'GLTran',
  'GLDist',
  'JournalTrans',
  'GlTrans',
  'SLLedgers',
];
const SL_COITEMS_SAFE_PROPERTIES = [
  'CoNum',
  'CoLine',
  'CoRelease',
  'OrderDate',
  'Item',
  'Stat',
  'Price',
  'QtyOrdered',
  'QtyShipped',
  'QtyInvoiced',
  'ExtPrice',
  'InvNum',
  'Whse',
  'DueDate',
];
const MAX_CSI_PAGES_PER_REQUEST = 20;
const OPTIONAL_CSI_GL_SUMMARY_PROGRAMS = new Set([
  'GLACCTPERIODBALANCES',
  'SLGLACCTPERIODBALANCES',
  'GLACCOUNTBALANCES',
  'GLLEDGERPERIODS',
  'SLGLLEDGERPERIODS',
  'LEDGERBALANCES',
]);

function ensureCsiProperties(endpointPath: string, properties: string[]): string {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  params.set('properties', properties.join(','));
  if (!params.get('recordCap')) params.set('recordCap', '1000');
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function resolveSlaPtrxSafePropertyPath(endpointPath: string): string | null {
  if (!/\/load\/SLAptrx|\/load\/SLAptrxp|\/load\/SLAptrxps/i.test(endpointPath)) return null;
  const canonical = endpointPath
    .replace(/\/load\/SLAptrxps/gi, '/load/SLAptrx')
    .replace(/\/load\/SLAptrxp(?=\?|$)/gi, '/load/SLAptrx');
  return ensureCsiProperties(canonical, SLA_PTRX_SAFE_PROPERTIES);
}

function parseMissingPropertyFromMessage(message: string): string | null {
  const match = message.match(/Property\s+([A-Za-z0-9_]+)\s+not found/i);
  return match?.[1] ? String(match[1]).trim() : null;
}

function removePropertyFromEndpoint(endpointPath: string, propertyName: string): string | null {
  const [path, queryString = ''] = endpointPath.split('?');
  const params = new URLSearchParams(queryString);
  const current = params.get('properties');
  if (!current) return null;
  const entries = current
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) return null;

  const filtered = entries.filter((entry) => entry.toLowerCase() !== propertyName.toLowerCase());
  if (filtered.length === entries.length || filtered.length === 0) return null;

  params.set('properties', filtered.join(','));
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function buildApSlaPtrxCandidatePaths(endpointPath: string): string[] {
  if (!/\/load\//i.test(endpointPath)) return [];
  const candidates: string[] = [];
  const baseWithoutProperties = removePropertyFromEndpoint(endpointPath, '__noop__') || endpointPath;
  for (const ido of AP_IDO_CANDIDATES) {
    const pathWithIdo = baseWithoutProperties.replace(/\/load\/[^/?]+/i, `/load/${ido}`);
    const isXpsFamily = /xps$/i.test(ido);
    const safeProperties = isXpsFamily ? SLA_PTRXP_SAFE_PROPERTIES : SLA_PTRX_SAFE_PROPERTIES;
    candidates.push(ensureCsiProperties(pathWithIdo, safeProperties));
    candidates.push(ensureCsiProperties(pathWithIdo, ['VendNum', 'InvNum', 'InvDate', 'DueDate', 'Amount']));
  }
  return Array.from(new Set(candidates));
}

function buildGlTransactionCandidatePaths(endpointPath: string): string[] {
  if (!/\/load\//i.test(endpointPath)) return [];
  const candidates: string[] = [];
  const [path, queryString = ''] = endpointPath.split('?');
  const originalParams = new URLSearchParams(queryString);
  for (const ido of GL_TRANSACTION_IDO_CANDIDATES) {
    const candidatePath = path.replace(/\/load\/[^/?]+/i, `/load/${ido}`);
    const params = new URLSearchParams(originalParams.toString());
    params.set('properties', GL_TRANSACTION_SAFE_PROPERTIES.join(','));
    if (!params.get('recordCap')) params.set('recordCap', '1000');
    if (!params.get('orderby') && !params.get('orderBy')) {
      params.set('orderby', 'TransDate desc, RecordDate desc');
    }
    const nextQuery = params.toString();
    candidates.push(nextQuery ? `${candidatePath}?${nextQuery}` : candidatePath);
  }
  return Array.from(new Set(candidates));
}

function resolveSlCoitemsSafePath(endpointPath: string): string | null {
  if (!/\/load\/SLCoitems/i.test(endpointPath)) return null;
  return ensureCsiProperties(endpointPath, SL_COITEMS_SAFE_PROPERTIES);
}

function resolveCsiProgramId(row: InforProgramRow, endpointPath?: string): string {
  const configured = String(row.miProgram || '').trim();
  if (configured) return configured.toUpperCase();
  const sourcePath = String(endpointPath || row.endpointPath || '').trim();
  const match = sourcePath.match(/\/ido\/load\/([^/?]+)/i);
  return String(match?.[1] || '').trim().toUpperCase();
}

function shouldRetryWithoutSourceWindowHint(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('invalid parameter') ||
    normalized.includes('parameter') ||
    normalized.includes('syntax') ||
    normalized.includes('filter') ||
    normalized.includes('orderby') ||
    normalized.includes('column name')
  );
}

function shouldRetryWithoutMongooseConfig(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('invalidcredentials') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('error authenticating user')
  );
}

function isOptionalCsiGlSummaryIdoMissing(params: {
  moduleType: ReturnType<typeof classifyModule>;
  row: InforProgramRow;
  endpointPath: string;
  payloadMessage: string;
}): boolean {
  if (params.moduleType !== 'gl') return false;
  const msg = params.payloadMessage.trim().toLowerCase();
  if (!msg.includes('ido not found')) return false;
  const program = String(params.row.miProgram || '').trim().toUpperCase();
  if (program && OPTIONAL_CSI_GL_SUMMARY_PROGRAMS.has(program)) return true;
  const endpoint = params.endpointPath.toLowerCase();
  return (
    endpoint.includes('/load/glacctperiodbalances') ||
    endpoint.includes('/load/slglacctperiodbalances') ||
    endpoint.includes('/load/glaccountbalances') ||
    endpoint.includes('/load/glledgerperiods') ||
    endpoint.includes('/load/slglledgerperiods') ||
    endpoint.includes('/load/ledgerbalances')
  );
}

function classifyModule(moduleName: string): 'cash' | 'ar' | 'ap' | 'customer' | 'sales' | 'inventory' | 'gl' | 'other' {
  const m = moduleName.trim().toLowerCase();
  if (m === 'cash' || m.includes('cash') || m.includes('bank')) return 'cash';
  if (m === 'ar' || m.includes('ar') || m.includes('receivable')) return 'ar';
  if (m === 'ap' || m.includes('ap') || m.includes('payable')) return 'ap';
  if (m === 'customer' || m.includes('customer')) return 'customer';
  if (m === 'sales' || m.includes('sales') || m.includes('invoice') || m.includes('order')) return 'sales';
  if (m === 'inventory' || m.includes('inventory') || m.includes('item')) return 'inventory';
  if (m === 'gl' || m.includes('ledger') || m.includes('general ledger')) return 'gl';
  return 'other';
}

function buildCsiEndpointPath(row: InforProgramRow): string | null {
  if (row.endpointPath && row.endpointPath.length > 0) {
    const raw = row.endpointPath;
    if (/\/IDORequestService\/ido\/load\//i.test(raw)) {
      // Force explicit FIRST mode for initial calls and strip stale bookmarks.
      return normalizeCsiLoadPaging(raw, 'FIRST');
    }
    return raw;
  }
  if (!row.miProgram) return null;
  const params = new URLSearchParams();
  if (row.properties && row.properties.length > 0) {
    params.set('properties', row.properties.join(','));
  }
  const cap = row.recordCap && row.recordCap > 0 ? row.recordCap : 1000;
  params.set('recordCap', String(cap));
  return normalizeCsiLoadPaging(
    `/APR_PRD/CSI/IDORequestService/ido/load/${row.miProgram}?${params.toString()}`,
    'FIRST'
  );
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const v = value.trim();
    return v.length > 0 ? v : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (key in record) {
      const value = toNumber(record[key]);
      if (value !== 0) return value;
    }
  }
  return 0;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (key in record) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

const CUSTOMER_NAME_KEYS = ['customerName', 'name', 'Name', 'CUNM', 'customer'];
const CUSTOMER_ID_KEYS = ['customerId', 'CustNum', 'CUNO', 'customerNumber', 'customerNo'];
const VENDOR_NAME_KEYS = ['vendorName', 'name', 'Name', 'VendName', 'SUNM', 'vendor', 'supplier'];
const VENDOR_ID_KEYS = ['vendorId', 'VendNum', 'supplierId', 'SUNO', 'vendorNo'];
const AR_INVOICE_NO_KEYS = ['invoiceNo', 'invoiceNumber', 'InvNum', 'IVNO', 'voucher', 'ApplyToInvNum', 'DerApplyToInvNum'];
const AR_AMOUNT_DUE_KEYS = [
  'amountDueHome',
  'amountDue',
  'openAmount',
  'balance',
  'Balance',
  'Amount',
  'DerPaymentCheckAmount',
  'DerOrderBalance',
  'CUAM',
  'ACAM',
];
const AR_AMOUNT_HOME_KEYS = ['amountHome', 'homeAmount', 'Amount', 'ACAM', 'CUAM'];
const AR_AMOUNT_CURRENCY_KEYS = ['amountCurrency', 'invoiceAmount', 'Amount', 'CUAM'];
const AR_APPLY_TO_INVOICE_KEYS = ['DerApplyToInvNum', 'ApplyToInvNum', 'ApplyToInv', 'applyToInvoiceNo'];
const AR_CHARGE_AMOUNT_HOME_KEYS = [
  'amountDueHome',
  'amountDue',
  'openAmount',
  'balance',
  'Balance',
  'ACAM',
  'CUAM',
  'amountHome',
  'homeAmount',
  'Amount',
];
const AR_REDUCTION_AMOUNT_HOME_KEYS = ['DerPaymentCheckAmount', 'paidAmountHome', 'paidAmount', 'PYAM', 'ACAM', 'CUAM', 'Amount'];
const AR_CHARGE_AMOUNT_CURRENCY_KEYS = ['amountCurrency', 'invoiceAmount', 'CUAM', 'Amount'];
const AR_REDUCTION_AMOUNT_CURRENCY_KEYS = ['DerPaymentCheckAmount', 'paidAmount', 'amountCurrency', 'PYAM', 'CUAM', 'Amount'];

const SALES_QTY_KEYS = ['quantity', 'qty', 'QTY', 'quantitySold', 'QtyPackages', 'QtyShipped', 'qtyShipped', 'InvSeq'];
const SALES_REVENUE_KEYS = ['revenue', 'amount', 'salesAmount', 'NETA', 'Amount', 'Price', 'ExtPrice', 'ExtAmt', 'LineAmount'];
const SALES_UNIT_PRICE_KEYS = ['unitPrice', 'price', 'Price', 'salesPrice', 'Upri'];
const SALES_EXT_COST_KEYS = ['ExtCost', 'extendedCost', 'costAmount', 'LineCost', 'CostAmount', 'ExtMatlCost'];
const SALES_UNIT_COST_KEYS = ['UnitCost', 'unitCost', 'MatlCost', 'Cost'];

function deriveSalesMetrics(record: Record<string, unknown>): { quantity: number; revenue: number; cogs: number } {
  const quantity = pickNumber(record, SALES_QTY_KEYS);
  const explicitRevenue = pickNumber(record, SALES_REVENUE_KEYS);
  const unitPrice = pickNumber(record, SALES_UNIT_PRICE_KEYS);
  const revenue = explicitRevenue !== 0 ? explicitRevenue : quantity * unitPrice;

  const extCost = pickNumber(record, SALES_EXT_COST_KEYS);
  const rawUnitCost = pickNumber(record, SALES_UNIT_COST_KEYS);
  let cogs = 0;
  if (extCost !== 0) {
    cogs = extCost;
  } else if (rawUnitCost !== 0) {
    cogs = quantity > 0 ? rawUnitCost * quantity : rawUnitCost;
  }

  return { quantity, revenue, cogs };
}

function parseCustomerNameFromComposite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const splitToken = ' - ';
  const splitIndex = trimmed.indexOf(splitToken);
  if (splitIndex === -1) return null;
  const namePortion = trimmed.slice(splitIndex + splitToken.length).trim();
  return namePortion || null;
}

function parseCustomerIdFromComposite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const splitToken = ' - ';
  const splitIndex = trimmed.indexOf(splitToken);
  if (splitIndex === -1) return null;
  const idPortion = trimmed.slice(0, splitIndex).trim();
  return idPortion || null;
}

function normalizeOrderJoinKey(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const noPadding = raw.replace(/^0+/, '');
  return noPadding || '0';
}

function pickCustomerDisplayName(record: Record<string, unknown>): string | null {
  return (
    parseCustomerNameFromComposite(pickString(record, ['DerCustNoName'])) ||
    pickString(record, ['CadName', 'DerCustName', 'UbCustName']) ||
    pickString(record, CUSTOMER_NAME_KEYS)
  );
}

function parseMaybeDate(value: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // CSI often returns compact timestamp strings like:
  // "20170404 00:00:00.000" or "20170404 00:00:00"
  const compactWithTime = raw.match(
    /^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
  );
  if (compactWithTime) {
    const year = Number(compactWithTime[1]);
    const month = Number(compactWithTime[2]);
    const day = Number(compactWithTime[3]);
    const hour = Number(compactWithTime[4]);
    const minute = Number(compactWithTime[5]);
    const second = Number(compactWithTime[6]);
    const millisecond = Number((compactWithTime[7] || '0').padEnd(3, '0'));
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPostgresDeadlockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('40P01') || message.toLowerCase().includes('deadlock detected');
}

async function retryOnDeadlock<T>(operationName: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isPostgresDeadlockError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const backoffMs = 150 * attempt + Math.floor(Math.random() * 75);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${operationName} failed`);
}

function isWithinWindow(date: Date, window: SyncWindow): boolean {
  return date.getTime() >= window.startDate.getTime() && date.getTime() <= window.endDate.getTime();
}

function firstRecordDate(record: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const parsed = parseMaybeDate(pickString(record, [key]));
    if (parsed) return parsed;
  }
  return null;
}

function filterRecordsByDateWindow(
  records: Record<string, unknown>[],
  moduleType: ReturnType<typeof classifyModule>,
  window?: SyncWindow
): Record<string, unknown>[] {
  if (!window || records.length === 0) return records;
  const transactionalModules = new Set<ReturnType<typeof classifyModule>>(['ar', 'ap', 'sales', 'inventory']);
  if (!transactionalModules.has(moduleType)) return records;

  const dateKeysByModule: Record<string, string[]> = {
    ar: ['InvDate', 'invoiceDate', 'DueDate', 'dueDate', 'RecordDate', 'date'],
    ap: ['InvDate', 'invoiceDate', 'DueDate', 'dueDate', 'RecordDate', 'date'],
    sales: ['OrderDate', 'orderDate', 'InvDate', 'invoiceDate', 'DueDate', 'dueDate', 'ShipDate', 'RecordDate', 'date'],
    inventory: ['ItemChangeDate', 'ChangeDate', 'RecordDate', 'SSDATE', 'date'],
  };
  const keys = dateKeysByModule[moduleType] || [];
  if (keys.length === 0) return records;

  // Keep records lacking any parseable date to avoid dropping valid rows from sparse payloads.
  return records.filter((record) => {
    const date = firstRecordDate(record, keys);
    // For sales windows (bookings/order slices), missing dates break period attribution.
    // Exclude undated rows so backfill/manual windows cannot replay full snapshot payloads.
    if (!date) {
      if ((moduleType === 'ar' || moduleType === 'ap') && window.mode !== 'daily_overlap') {
        return false;
      }
      return moduleType === 'sales' ? false : true;
    }
    return isWithinWindow(date, window);
  });
}

type AgingTotals = {
  total: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function calculateAgingTotalsFromTransactions(
  records: Record<string, unknown>[],
  options: {
    dueDateKeys: string[];
    balanceKeys: string[];
    amountKeys: string[];
    openFlagKeys: string[];
    statusKeys: string[];
    asOfDate?: Date;
  }
): AgingTotals {
  const asOf = startOfUtcDay(options.asOfDate || new Date()).getTime();
  const totals: AgingTotals = {
    total: 0,
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
  };

  for (const record of records) {
    if (!isOpenAgingRecord(record, { openFlagKeys: options.openFlagKeys, statusKeys: options.statusKeys })) {
      continue;
    }
    const dueDate = parseMaybeDate(pickString(record, options.dueDateKeys));
    if (!dueDate) continue;

    const rawBalance = pickNumber(record, options.balanceKeys);
    const fallbackAmount = pickNumber(record, options.amountKeys);
    const outstanding = Math.abs(rawBalance !== 0 ? rawBalance : fallbackAmount);
    if (!Number.isFinite(outstanding) || outstanding === 0) continue;

    const due = startOfUtcDay(dueDate).getTime();
    const daysOutstanding = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));

    totals.total += outstanding;
    if (daysOutstanding <= 0) {
      totals.current += outstanding;
    } else if (daysOutstanding <= 30) {
      totals.days1to30 += outstanding;
    } else if (daysOutstanding <= 60) {
      totals.days31to60 += outstanding;
    } else if (daysOutstanding <= 90) {
      totals.days61to90 += outstanding;
    } else {
      totals.days90plus += outstanding;
    }
  }

  return totals;
}

function normalizeToken(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value).trim().toLowerCase();
  }
  return null;
}

function readOpenFlag(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    if (!(key in record)) continue;
    const token = normalizeToken(record[key]);
    if (!token) continue;
    if (['1', 'true', 't', 'yes', 'y', 'open', 'o'].includes(token)) return true;
    if (['0', 'false', 'f', 'no', 'n', 'closed', 'c'].includes(token)) return false;
  }
  return null;
}

function readStatusToken(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (!(key in record)) continue;
    const token = normalizeToken(record[key]);
    if (token) return token;
  }
  return null;
}

function isOpenAgingRecord(
  record: Record<string, unknown>,
  options: { openFlagKeys: string[]; statusKeys: string[] }
): boolean {
  const explicitOpen = readOpenFlag(record, options.openFlagKeys);
  if (explicitOpen === false) return false;
  if (explicitOpen === true) return true;

  const status = readStatusToken(record, options.statusKeys);
  if (!status) return true;
  if (
    status.includes('closed') ||
    status.includes('paid') ||
    status.includes('void') ||
    status.includes('cancel') ||
    status.includes('settled') ||
    status.includes('history')
  ) {
    return false;
  }
  return true;
}

export async function pruneCompanyOperationalData(companyId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);

  await Promise.all([
    prisma.cashSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aRAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aPAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.customerSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.productSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.inventorySnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aROpenInvoiceSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aRPaymentFact.deleteMany({ where: { companyId, paymentDate: { lt: cutoff } } }),
    (prisma as any).aPOpenBillSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    (prisma as any).aPPaymentFact.deleteMany({ where: { companyId, paymentDate: { lt: cutoff } } }),
  ]);
}

async function saveCash(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  const assetCashMappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { in: ['cash', 'otherCA'] },
      qbAccountClassification: { in: ['A', 'Asset', 'ASSET', 'asset'] },
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
    },
  });
  const normalizeToken = (value: string | null | undefined): string =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^cash\s*-\s*/i, '');
  const assetCashTokens = new Set<string>();
  for (const mapping of assetCashMappings) {
    for (const rawToken of [mapping.qbAccount, mapping.qbAccountId, mapping.qbAccountCode]) {
      const token = normalizeToken(rawToken);
      if (token) assetCashTokens.add(token);
    }
  }

  await prisma.cashSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });
  const rows = records
    .map((record, idx) => {
      const accountName =
        pickString(record, [
          'accountName',
          'bankAccount',
          'name',
          'Name',
          'ACNM',
          'bankName',
          'ChtDescription',
          'ChaDescription',
        ]) ||
        `Cash Account ${idx + 1}`;
      const accountId = pickString(record, ['accountId', 'accountNumber', 'ACID', 'bankId', 'Acct']);
      const accountNumber = pickString(record, ['accountNumber', 'ACNO', 'Acct']);
      const balance = pickNumber(record, ['balance', 'cashBalance', 'amount', 'BALA', 'BAL', 'DomBalance', 'ForBalance']);
      const shouldNormalizeSign =
        Number.isFinite(balance) &&
        balance < 0 &&
        [accountId, accountNumber, accountName]
          .map((value) => normalizeToken(value))
          .some((token) => token && assetCashTokens.has(token));
      return {
        companyId,
        snapshotDate,
        frequency,
        accountId,
        accountName,
        accountNumber,
        cashBalance: shouldNormalizeSign ? Math.abs(balance) : balance,
        changeAmount: null as number | null,
        changePercent: null as number | null,
      };
    })
    .filter((row) => row.accountName && Number.isFinite(row.cashBalance));

  if (rows.length === 0) return 0;
  await prisma.cashSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveBalanceMovementsFromGl(
  companyId: string,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  const mappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
  if (!mappedLineDelegate || records.length === 0) return 0;

  const accountMappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      qbAccountClassification: {
        in: [
          'A',
          'Asset',
          'ASSET',
          'asset',
          'L',
          'Liability',
          'LIABILITY',
          'liability',
          'R',
          'Revenue',
          'REVENUE',
          'revenue',
          'E',
          'Expense',
          'EXPENSE',
          'expense',
          'COGS',
          'cogs',
          'CostOfGoodsSold',
          'COST_OF_GOODS_SOLD',
        ],
      },
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      targetField: true,
    },
  });

  if (accountMappings.length === 0) return 0;

  const tokenToTargetFields = new Map<string, Set<string>>();
  for (const mapping of accountMappings) {
    const targetField = String(mapping.targetField || '').trim();
    if (!targetField) continue;
    const tokens = [mapping.qbAccount, mapping.qbAccountId, mapping.qbAccountCode]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    for (const token of tokens) {
      if (!tokenToTargetFields.has(token)) tokenToTargetFields.set(token, new Set<string>());
      tokenToTargetFields.get(token)!.add(targetField);
    }
  }

  const movementByKey = new Map<
    string,
    { snapshotDate: Date; sourceAccountName: string; sourceAccountId: string | null; amount: number; targetField: string }
  >();

  for (const record of records) {
    const accountId =
      pickString(record, ['Acct', 'accountId', 'accountNumber', 'ACID']) ||
      pickString(record, ['ChaAccount', 'GLAccount']) ||
      null;
    const accountName =
      pickString(record, ['ChaDescription', 'ChtDescription', 'accountName', 'name', 'Name']) ||
      (accountId ? `Account ${accountId}` : null);
    const matchingTokens = [accountId, accountName]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const matchedTargetFields = new Set<string>();
    for (const token of matchingTokens) {
      const fields = tokenToTargetFields.get(token);
      if (!fields) continue;
      for (const field of fields) matchedTargetFields.add(field);
    }
    if (matchedTargetFields.size === 0) continue;

    const transDate = parseMaybeDate(
      pickString(record, ['TransDate', 'transDate', 'CheckDate', 'FRDerDate', 'RecordDate', 'date'])
    );
    if (!transDate) continue;
    const snapshotDate = startOfUtcDay(transDate);
    const amount = pickNumber(record, ['DomAmount', 'ForAmount', 'amount', 'Amount', 'DerSumDomAmount']);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const sourceAccountName = String(accountName || accountId || 'Cash Account');
    const sourceAccountId = accountId ? String(accountId) : null;
    for (const mappedTargetField of matchedTargetFields) {
      const targetField = `balance_movement:${mappedTargetField}`;
      const normalizedTarget = String(mappedTargetField || '').trim().toLowerCase();
      const normalizedAmount =
        normalizedTarget === 'revenue' ||
        normalizedTarget.startsWith('rev_') ||
        normalizedTarget === 'cogstotal' ||
        normalizedTarget.startsWith('cogs') ||
        normalizedTarget === 'expense' ||
        normalizedTarget === 'otherexpense' ||
        normalizedTarget.includes('expense') ||
        normalizedTarget.includes('income')
          ? Math.abs(amount)
          : amount;
      const key = `${snapshotDate.toISOString()}|${targetField}|${sourceAccountName}`;
      if (!movementByKey.has(key)) {
        movementByKey.set(key, {
          snapshotDate,
          sourceAccountName,
          sourceAccountId,
          amount: 0,
          targetField,
        });
      }
      const acc = movementByKey.get(key)!;
      acc.amount += normalizedAmount;
      if (!acc.sourceAccountId && sourceAccountId) acc.sourceAccountId = sourceAccountId;
    }
  }

  const movementRows = Array.from(movementByKey.values());
  if (movementRows.length === 0) return 0;

  const affectedDateAndTargets = Array.from(
    new Set(movementRows.map((row) => `${row.snapshotDate.toISOString()}|${row.targetField}`))
  );
  await Promise.all(
    affectedDateAndTargets.map((token) => {
      const [dateIso, targetField] = token.split('|');
      return mappedLineDelegate.deleteMany({
        where: {
          companyId,
          frequency,
          targetField,
          snapshotDate: new Date(dateIso),
        },
      });
    })
  );

  await mappedLineDelegate.createMany({
    data: movementRows.map((row) => ({
      companyId,
      snapshotDate: row.snapshotDate,
      frequency,
      sourceAccountName: row.sourceAccountName,
      sourceAccountId: row.sourceAccountId,
      sourceAccountType: 'gl_balance_account',
      targetField: row.targetField,
      amount: row.amount,
      sourcePlatform: 'INFOR_M3',
    })),
    skipDuplicates: true,
  });

  return movementRows.length;
}

async function saveARAging(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  const fromBuckets = records.reduce(
    (acc, record) => {
      acc.totalAR += pickNumber(record, ['totalAR', 'total', 'TOTAR']);
      acc.current += pickNumber(record, ['current', 'CURAR', 'currentAmount']);
      acc.days1to30 += pickNumber(record, ['days1to30', 'AR1_30', 'bucket1']);
      acc.days31to60 += pickNumber(record, ['days31to60', 'AR31_60', 'bucket2']);
      acc.days61to90 += pickNumber(record, ['days61to90', 'AR61_90', 'bucket3']);
      acc.days90plus += pickNumber(record, ['days90plus', 'AR90P', 'bucket4']);
      return acc;
    },
    { totalAR: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
  );

  const derived = calculateAgingTotalsFromTransactions(records, {
    // Some CSI AR payloads omit DueDate; fall back to invoice/record dates so
    // we still persist aging snapshots instead of dropping the day entirely.
    dueDateKeys: ['DueDate', 'dueDate', 'DUDT', 'InvDate', 'invoiceDate', 'IVDT', 'RecordDate', 'date'],
    balanceKeys: AR_AMOUNT_DUE_KEYS,
    amountKeys: ['Amount', 'amount', 'invoiceAmount', 'DerPaymentCheckAmount', 'DerOrderBalance'],
    openFlagKeys: ['Open', 'open', 'isOpen', 'IsOpen', 'OPEN'],
    statusKeys: ['Status', 'status', 'STAT', 'state', 'State'],
    asOfDate: snapshotDate,
  });

  const totals =
    fromBuckets.totalAR !== 0
      ? fromBuckets
      : {
          totalAR: derived.total,
          current: derived.current,
          days1to30: derived.days1to30,
          days31to60: derived.days31to60,
          days61to90: derived.days61to90,
          days90plus: derived.days90plus,
        };

  if (totals.totalAR === 0) return 0;

  await prisma.aRAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: totals,
    create: {
      companyId,
      snapshotDate,
      frequency,
      ...totals,
    },
  });

  return 1;
}

async function saveAROpenInvoices(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string; divi?: string; resetSnapshot?: boolean }
): Promise<number> {
  const snapshotDayStart = startOfUtcDay(snapshotDate);
  const snapshotDayEnd = new Date(snapshotDayStart.getTime() + 24 * 60 * 60 * 1000);
  const normalizeInvoiceNo = (value: string | null): string =>
    String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  const isReductionMovement = (record: Record<string, unknown>): boolean => {
    const typeToken = normalizeToken(record['Type']) || '';
    const drCrToken = normalizeToken(record['DrCr']) || '';
    const ref = (pickString(record, ['Ref', 'reference']) || '').trim().toLowerCase();
    const description = (pickString(record, ['Description', 'description']) || '').trim().toLowerCase();
    const text = `${typeToken} ${drCrToken} ${ref} ${description}`;
    return (
      typeToken === 'p' ||
      typeToken === 'pay' ||
      typeToken === 'pmt' ||
      typeToken === 'payment' ||
      typeToken === 'c' ||
      typeToken === 'cr' ||
      typeToken === 'credit' ||
      typeToken === 'cm' ||
      drCrToken === 'c' ||
      drCrToken === 'cr' ||
      drCrToken === 'credit' ||
      text.includes('payment') ||
      text.includes('receipt') ||
      text.includes('cash') ||
      text.includes('credit')
    );
  };
  const signedAmount = (record: Record<string, unknown>, raw: number): number => {
    if (!Number.isFinite(raw) || raw === 0) return 0;
    // Keep native sign when source already sends signed movements.
    if (raw < 0) return raw;
    const isReduction = isReductionMovement(record);
    return isReduction ? -Math.abs(raw) : Math.abs(raw);
  };
  const deriveArStatus = (record: Record<string, unknown>): string | null => {
    const activeToken = normalizeToken(record['Active']) || normalizeToken(record['active']) || '';
    if (activeToken) {
      if (['1', 'true', 'y', 'yes', 'open', 'active'].includes(activeToken)) return 'OPEN';
      if (['0', 'false', 'n', 'no', 'closed', 'inactive'].includes(activeToken)) return 'CLOSED';
    }
    return pickString(record, ['status', 'STAT', 'Type']) || null;
  };

  const invoiceAccumulator = new Map<
    string,
    {
      companyId: string;
      snapshotDate: Date;
      frequency: 'daily' | 'weekly' | 'monthly';
      customerId: string | null;
      customerName: string;
      invoiceNo: string;
      invoiceDate: Date | null;
      dueDate: Date | null;
      status: string | null;
      currencyCode: string | null;
      invoiceBaseHome: number;
      invoiceBaseCurrency: number;
      remainingHome: number;
      remainingCurrency: number;
    }
  >();

  for (let idx = 0; idx < records.length; idx += 1) {
    const record = records[idx];
    const reductionMovement = isReductionMovement(record);
    const customerName = pickCustomerDisplayName(record) || `Unknown Customer ${idx + 1}`;
    const customerId =
      pickString(record, CUSTOMER_ID_KEYS) ||
      parseCustomerIdFromComposite(pickString(record, ['DerCustNoName', 'customerComposite']));
    const applyToInvoiceNo = normalizeInvoiceNo(pickString(record, AR_APPLY_TO_INVOICE_KEYS));
    const nativeInvoiceNo = normalizeInvoiceNo(pickString(record, ['InvNum', 'DerInvNum', ...AR_INVOICE_NO_KEYS]));
    const nativeUpper = nativeInvoiceNo.toUpperCase();
    const shouldMapToAppliedInvoice = Boolean(applyToInvoiceNo) && (reductionMovement || nativeUpper.startsWith('DR'));
    const invoiceNo = shouldMapToAppliedInvoice ? applyToInvoiceNo : nativeInvoiceNo || applyToInvoiceNo;
    if (!invoiceNo) continue;
    const rawAmountHome = pickNumber(
      record,
      reductionMovement ? AR_REDUCTION_AMOUNT_HOME_KEYS : AR_CHARGE_AMOUNT_HOME_KEYS
    );
    const rawAmountCurrency = pickNumber(
      record,
      reductionMovement ? AR_REDUCTION_AMOUNT_CURRENCY_KEYS : AR_CHARGE_AMOUNT_CURRENCY_KEYS
    );
    const movementDate =
      parseMaybeDate(pickString(record, ['RecordDate', 'recordDate', 'date', 'InvDate', 'invoiceDate', 'IVDT', 'RGDT', 'PYDT'])) ||
      null;
    // Build snapshot balances as-of the snapshot day.
    if (movementDate && movementDate.getTime() >= snapshotDayEnd.getTime()) continue;
    const movementHome = signedAmount(record, rawAmountHome);
    const movementCurrency = signedAmount(record, rawAmountCurrency);
    if (!Number.isFinite(movementHome) || movementHome === 0) continue;

    const customerKey = String(customerId || customerName).trim().toLowerCase();
    const groupKey = `${companyId}|${frequency}|${snapshotDayStart.toISOString()}|${customerKey}|${invoiceNo}`;
    const rawInvoiceDate = parseMaybeDate(
      pickString(record, ['InvDate', 'invoiceDate', 'IssueDate', 'RecordDate', 'date', 'IVDT'])
    );
    const rawDueDate = parseMaybeDate(pickString(record, ['DueDate', 'dueDate', 'DUDT']));
    // Anchor aging to the true invoice row; mapped adjustments (DR/apply-to and reductions)
    // must not bring their own document dates into the invoice bucket.
    const isInvoiceAnchorRow = !reductionMovement && !shouldMapToAppliedInvoice;
    const invoiceDate = isInvoiceAnchorRow ? rawInvoiceDate : null;
    const dueDate = isInvoiceAnchorRow ? rawDueDate : null;
    const baseHome = isInvoiceAnchorRow && movementHome > 0 ? movementHome : 0;
    const baseCurrency = isInvoiceAnchorRow && movementCurrency > 0 ? movementCurrency : 0;

    const existing = invoiceAccumulator.get(groupKey);
    if (!existing) {
      invoiceAccumulator.set(groupKey, {
        companyId,
        snapshotDate: snapshotDayStart,
        frequency,
        customerId,
        customerName,
        invoiceNo,
        invoiceDate,
        dueDate,
        status: deriveArStatus(record),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CurrCode', 'CUCD']),
        invoiceBaseHome: baseHome,
        invoiceBaseCurrency: baseCurrency,
        remainingHome: movementHome,
        remainingCurrency: movementCurrency,
      });
      continue;
    }

    existing.invoiceBaseHome += baseHome;
    existing.invoiceBaseCurrency += baseCurrency;
    existing.remainingHome += movementHome;
    existing.remainingCurrency += movementCurrency;
    existing.customerId = existing.customerId || customerId;
    existing.invoiceDate = existing.invoiceDate || invoiceDate;
    existing.dueDate = existing.dueDate || dueDate;
    existing.status = existing.status || deriveArStatus(record);
    existing.currencyCode = existing.currencyCode || pickString(record, ['currencyCode', 'currency', 'CurrCode', 'CUCD']);
  }

  const movementRows = Array.from(invoiceAccumulator.values())
    .map((entry) => {
      const remainingHome = Number(entry.remainingHome || 0);
      if (!Number.isFinite(remainingHome) || remainingHome === 0) return null;
      const remainingCurrency = Number(entry.remainingCurrency || 0);
      const invoiceBaseHome = Number(entry.invoiceBaseHome || 0);
      const invoiceBaseCurrency = Number(entry.invoiceBaseCurrency || 0);
      return {
        id: randomUUID(),
        companyId: entry.companyId,
        snapshotDate: entry.snapshotDate,
        frequency: entry.frequency,
        customerId: entry.customerId,
        customerName: entry.customerName,
        invoiceNo: entry.invoiceNo,
        invoiceDate: entry.invoiceDate,
        dueDate: entry.dueDate,
        status: entry.status || 'OPEN_NET',
        currencyCode: entry.currencyCode,
        amountCurrency: Number.isFinite(invoiceBaseCurrency) && invoiceBaseCurrency > 0 ? invoiceBaseCurrency : null,
        amountHome: Number.isFinite(invoiceBaseHome) && invoiceBaseHome > 0 ? invoiceBaseHome : null,
        amountDueHome: remainingHome,
        current: null,
        days1to30: null,
        days31to60: null,
        days61to90: null,
        days90plus: null,
        sourcePlatform: 'INFOR_M3' as const,
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const snapshotLockKey = `ar_open_invoice_snapshot|${companyId}|${frequency}|${snapshotDayStart.toISOString()}`;
  if (context.resetSnapshot) {
    await retryOnDeadlock('aROpenInvoiceSnapshot.reset', () =>
      prisma.$transaction(async (tx) => {
        // Serialize reset for the same snapshot slice to avoid cross-run deadlocks.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${snapshotLockKey}))`;
        await tx.aROpenInvoiceSnapshot.deleteMany({
          where: {
            companyId,
            frequency,
            snapshotDate: { gte: snapshotDayStart, lt: snapshotDayEnd },
          },
        });
      }, { maxWait: 10000, timeout: 30000 })
    );
  }

  const batchSize = 500;
  for (let i = 0; i < movementRows.length; i += batchSize) {
    const chunk = movementRows.slice(i, i + batchSize);
    const values = chunk.map((row) => Prisma.sql`(
      ${row.id}, ${row.companyId}, ${row.snapshotDate}, ${row.frequency}, ${row.customerId}, ${row.customerName}, ${row.invoiceNo},
      ${row.invoiceDate}, ${row.dueDate}, ${row.status}, ${row.currencyCode},
      ${row.amountCurrency}, ${row.amountHome}, ${row.amountDueHome}, NULL, NULL, NULL, NULL, NULL,
      ${row.sourcePlatform}, ${row.sourceProgram}, ${row.sourceTransaction}, ${row.cono}, ${row.divi}
    )`);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AROpenInvoiceSnapshot" (
        "id","companyId","snapshotDate","frequency","customerId","customerName","invoiceNo","invoiceDate","dueDate","status","currencyCode",
        "amountCurrency","amountHome","amountDueHome","current","days1to30","days31to60","days61to90","days90plus",
        "sourcePlatform","sourceProgram","sourceTransaction","cono","divi"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId","frequency","snapshotDate","invoiceNo","customerName")
      DO UPDATE SET
        "customerId" = COALESCE(EXCLUDED."customerId", "AROpenInvoiceSnapshot"."customerId"),
        "invoiceDate" = COALESCE("AROpenInvoiceSnapshot"."invoiceDate", EXCLUDED."invoiceDate"),
        "dueDate" = COALESCE("AROpenInvoiceSnapshot"."dueDate", EXCLUDED."dueDate"),
        "status" = COALESCE(EXCLUDED."status", "AROpenInvoiceSnapshot"."status"),
        "currencyCode" = COALESCE(EXCLUDED."currencyCode", "AROpenInvoiceSnapshot"."currencyCode"),
        "amountCurrency" = COALESCE("AROpenInvoiceSnapshot"."amountCurrency", 0) + COALESCE(EXCLUDED."amountCurrency", 0),
        "amountHome" = COALESCE("AROpenInvoiceSnapshot"."amountHome", 0) + COALESCE(EXCLUDED."amountHome", 0),
        "amountDueHome" = COALESCE("AROpenInvoiceSnapshot"."amountDueHome", 0) + COALESCE(EXCLUDED."amountDueHome", 0),
        "sourcePlatform" = EXCLUDED."sourcePlatform",
        "sourceProgram" = EXCLUDED."sourceProgram",
        "sourceTransaction" = EXCLUDED."sourceTransaction",
        "cono" = COALESCE(EXCLUDED."cono", "AROpenInvoiceSnapshot"."cono"),
        "divi" = COALESCE(EXCLUDED."divi", "AROpenInvoiceSnapshot"."divi")
    `);
  }
  return movementRows.length || 0;
}

async function saveARPayments(
  companyId: string,
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string; divi?: string }
): Promise<number> {
  const isPaymentLikeRecord = (record: Record<string, unknown>): boolean => {
    const typeToken = normalizeToken(record['Type']);
    if (typeToken === 'p' || typeToken === 'pay' || typeToken === 'pmt' || typeToken === 'cash') return true;
    const drCrToken = normalizeToken(record['DrCr']);
    if (drCrToken === 'c' || drCrToken === 'cr' || drCrToken === 'credit') return true;
    const ref = (pickString(record, ['Ref', 'reference']) || '').trim().toUpperCase();
    if (ref.startsWith('ARP')) return true;
    const invoiceRef = (pickString(record, ['DerApplyToInvNum', 'ApplyToInvNum']) || '').trim();
    const amount = pickNumber(record, ['DerPaymentCheckAmount', 'paidAmountHome', 'paidAmount', 'amount', 'ACAM', 'PYAM', 'Amount']);
    if (invoiceRef && amount !== 0) return true;
    const description = (pickString(record, ['Description', 'description']) || '').trim().toLowerCase();
    if (description.includes('payment')) return true;
    return false;
  };

  const rows = records
    .map((record, idx) => {
      if (!isPaymentLikeRecord(record)) return null;
      const paymentDate = parseMaybeDate(
        pickString(record, [
          'paymentDate',
          'date',
          'PYDT',
          'RGDT',
          'DerReceiptDate',
          'ReceiptDate',
          'InvDate',
          'RecordDate',
        ])
      );
      if (!paymentDate) return null;
      const customerName = pickCustomerDisplayName(record) || `Unknown Customer ${idx + 1}`;
      const paidAmountHomeRaw = pickNumber(record, [
        'DerPaymentCheckAmount',
        'paidAmountHome',
        'paidAmount',
        'amount',
        'DomAmount',
        'ForAmount',
        'Amt',
        'ACAM',
        'PYAM',
        'Amount',
      ]);
      return {
        companyId,
        paymentDate,
        customerId: pickString(record, CUSTOMER_ID_KEYS),
        customerName,
        invoiceNo: pickString(record, ['DerApplyToInvNum', 'ApplyToInvNum', ...AR_INVOICE_NO_KEYS]),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        paidAmountCurrency: pickNumber(record, ['DerPaymentCheckAmount', 'paidAmountCurrency', ...AR_AMOUNT_CURRENCY_KEYS]) || null,
        // Store inflow as positive cash regardless of source sign convention.
        paidAmountHome: Math.abs(paidAmountHomeRaw),
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row && Number.isFinite(row.paidAmountHome));

  if (!rows.length) return 0;
  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = [
      row.companyId,
      row.paymentDate.toISOString(),
      String(row.customerId || ''),
      String(row.customerName || ''),
      String(row.invoiceNo || ''),
      String(row.paidAmountHome || 0),
      String(row.sourceProgram || ''),
      String(row.sourceTransaction || ''),
    ].join('|');
    if (!deduped.has(key)) deduped.set(key, row);
  }
  const finalRows = Array.from(deduped.values());
  const sortedDates = finalRows.map((r) => r.paymentDate.getTime()).sort((a, b) => a - b);
  const minDate = new Date(sortedDates[0]);
  const maxDate = new Date(sortedDates[sortedDates.length - 1]);
  await retryOnDeadlock('aRPaymentFact.refresh', () =>
    prisma.$transaction(async (tx) => {
      await tx.aRPaymentFact.deleteMany({
        where: {
          companyId,
          sourcePlatform: 'INFOR_M3',
          sourceProgram: context.miProgram,
          sourceTransaction: context.transaction,
          paymentDate: { gte: minDate, lte: maxDate },
        },
      });
      await tx.aRPaymentFact.createMany({ data: finalRows });
    }, { maxWait: 10000, timeout: 30000 })
  );
  return finalRows.length;
}

let customerOrderLineOrderDateColumnCache: boolean | null = null;
async function customerOrderLineSupportsOrderDateColumn(): Promise<boolean> {
  if (customerOrderLineOrderDateColumnCache !== null) return customerOrderLineOrderDateColumnCache;
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'CustomerOrderLineSnapshot'
           AND column_name = 'orderDate'
       ) AS exists`
    );
    customerOrderLineOrderDateColumnCache = Boolean(result?.[0]?.exists);
  } catch {
    customerOrderLineOrderDateColumnCache = false;
  }
  return customerOrderLineOrderDateColumnCache;
}

async function saveCustomerOrderLines(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[],
  context: {
    miProgram: string;
    transaction: string;
    cono?: string;
    divi?: string;
    resetSnapshot?: boolean;
    orderCustomerLookup?: Map<string, { customerId: string | null; customerName: string; orderDate: Date | null }>;
  }
): Promise<{
  persisted: number;
  debug: {
    rawRowsReceived: number;
    parsedRows: number;
    rowsWithOrderNumber: number;
    rowsWithLineNumber: number;
    rowsWithCustomerId: number;
    headerJoinAttempts: number;
    headerJoinSuccesses: number;
    headerJoinFailures: number;
    rowsAfterValidation: number;
    rowsAfterDedupe: number;
    rowsAttemptedPersist: number;
    rowsPersisted: number;
    rowsSkipped: number;
    skipReasons: Record<string, number>;
  };
}> {
  const debug = {
    rawRowsReceived: records.length,
    parsedRows: 0,
    rowsWithOrderNumber: 0,
    rowsWithLineNumber: 0,
    rowsWithCustomerId: 0,
    headerJoinAttempts: 0,
    headerJoinSuccesses: 0,
    headerJoinFailures: 0,
    rowsAfterValidation: 0,
    rowsAfterDedupe: 0,
    rowsAttemptedPersist: 0,
    rowsPersisted: 0,
    rowsSkipped: 0,
    skipReasons: {} as Record<string, number>,
  };
  const skip = (reason: string) => {
    debug.rowsSkipped += 1;
    debug.skipReasons[reason] = (debug.skipReasons[reason] || 0) + 1;
  };
  const delegate = (prisma as any).customerOrderLineSnapshot;
  if (!delegate?.deleteMany || !delegate?.createMany) {
    skip('missing_delegate');
    return { persisted: 0, debug };
  }

  if (context.resetSnapshot) {
    await delegate.deleteMany({ where: { companyId, frequency, snapshotDate } });
  }

  const parsedRows: Array<{
    companyId: string;
    snapshotDate: Date;
    frequency: 'daily' | 'weekly' | 'monthly';
    customerId: string | null;
    customerName: string;
    orderId: string;
    lineId: string;
    orderDate: Date | null;
    itemId: string | null;
    itemName: string | null;
    sku: string | null;
    qtyOrdered: number;
    qtyInvoiced: number;
    unitPrice: number;
    contractValue: number;
    invoicedAmount: number;
    remainingAmount: number;
    unbilledAccrual: number;
    sourcePlatform: string;
    sourceProgram: string;
    sourceTransaction: string;
    cono: string | null;
    divi: string | null;
  }> = [];

  for (let idx = 0; idx < records.length; idx += 1) {
    const record = records[idx];
      const customerComposite = pickString(record, ['DerCustNoName', 'customerComposite', 'CustNumName']);
      const orderIdRaw =
        pickString(record, ['CoNum', 'CONUM', 'coNum', 'orderNo', 'orderNumber', 'OrderNum', 'contractId', 'projectId']) || `ORDER-${idx + 1}`;
      const orderId = normalizeOrderJoinKey(String(orderIdRaw || ''));
      if (!orderId) {
        skip('missing_order_number');
        continue;
      }
      debug.rowsWithOrderNumber += 1;
      const orderLookup = context.orderCustomerLookup?.get(orderId);
      if (context.orderCustomerLookup) {
        debug.headerJoinAttempts += 1;
        if (orderLookup) debug.headerJoinSuccesses += 1;
        else debug.headerJoinFailures += 1;
      }
      const customerName =
        orderLookup?.customerName ||
        pickCustomerDisplayName(record) ||
        pickString(record, ['BillToName', 'CustName', 'DerCustName', ...CUSTOMER_NAME_KEYS]) ||
        `Unknown Customer ${idx + 1}`;
      const customerId =
        orderLookup?.customerId ||
        pickString(record, ['CustNum', 'custNum', 'CoCustNum', 'CustNo', ...CUSTOMER_ID_KEYS]) ||
        parseCustomerIdFromComposite(customerComposite);
      const orderDate = orderLookup?.orderDate || firstRecordDate(record, ['OrderDate', 'orderDate']);
      const coLine = pickString(record, ['CoLine', 'COLINE', 'lineNo', 'lineNum', 'line', 'Seq']) || '1';
      const coRelease = pickString(record, ['CoRelease', 'CORELEASE', 'release', 'releaseNo']) || '0';
      const lineId = `${String(coLine).trim()}-${String(coRelease).trim()}`;
      if (!lineId) {
        skip('missing_line_number');
        continue;
      }
      debug.rowsWithLineNumber += 1;
      if (customerId) debug.rowsWithCustomerId += 1;
      const itemId = pickString(record, ['itemId', 'ITNO', 'Item', 'itemCode', 'sku']) || null;
      const itemName = pickString(record, ['itemName', 'ITDS', 'Description', 'name']) || null;
      const sku = pickString(record, ['sku', 'itemCode', 'ITNO', 'Item']) || null;
      const qtyOrdered = pickNumber(record, ['QtyOrdered', 'qtyOrdered', 'orderedQty', 'QtyOrder', 'OrderQty', 'qty', 'QTY']);
      const qtyInvoiced = pickNumber(record, ['QtyInvoiced', 'qtyInvoiced', 'invoicedQty']);
      const qtyShipped = pickNumber(record, ['QtyShipped', 'qtyShipped', 'shippedQty']);
      const unitPrice = pickNumber(record, ['Price', 'price', 'Upri', 'unitPrice', 'UnitPrice', 'UnitCost']);
      // Contract total follows CSI order-line rule:
      // line total = QtyOrdered * Price
      const contractValue = qtyOrdered * unitPrice;
      const explicitInvoiced = pickNumber(record, ['InvoicedAmount', 'invoicedAmount', 'AmtInvoiced']);
      const invoicedAmount = explicitInvoiced !== 0 ? explicitInvoiced : Math.max(qtyInvoiced, 0) * unitPrice;
      const explicitRemaining = pickNumber(record, ['RemainingAmount', 'remainingAmount', 'BacklogAmount', 'backlogAmount']);
      const remainingAmount =
        explicitRemaining !== 0 ? explicitRemaining : Math.max(qtyOrdered - Math.max(qtyInvoiced, 0), 0) * unitPrice;
      const explicitUnbilled = pickNumber(record, ['UnbilledAccrual', 'unbilledAccrual', 'accruedRevenueUnbilled', 'wipUnbilled']);
      const earnedRevenueSource = pickNumber(record, ['EarnedRevenue', 'earnedRevenue', 'wipEarned']);
      const earnedRevenue = earnedRevenueSource !== 0 ? earnedRevenueSource : Math.max(qtyShipped, 0) * unitPrice;
      const unbilledAccrual = explicitUnbilled !== 0 ? explicitUnbilled : Math.max(earnedRevenue - invoicedAmount, 0);
      const row = {
        companyId,
        snapshotDate,
        frequency,
        customerId: customerId || null,
        customerName,
        orderId,
        lineId,
        orderDate: orderDate || null,
        itemId,
        itemName,
        sku,
        qtyOrdered,
        qtyInvoiced: Math.max(qtyInvoiced, 0),
        unitPrice,
        contractValue: Math.max(contractValue, 0),
        invoicedAmount: Math.max(invoicedAmount, 0),
        remainingAmount: Math.max(remainingAmount, 0),
        unbilledAccrual: Math.max(unbilledAccrual, 0),
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
      debug.parsedRows += 1;
      const hasAmounts =
        Number(row.contractValue) > 0 ||
        Number(row.invoicedAmount) > 0 ||
        Number(row.remainingAmount) > 0 ||
        Number(row.unbilledAccrual) > 0;
      if (!hasAmounts) {
        skip('no_financial_amounts');
        continue;
      }
      const hasIdentity = String(row.customerName || '').trim().length > 0 && String(row.orderId || '').trim().length > 0;
      if (!hasIdentity) {
        skip('missing_identity');
        continue;
      }
      parsedRows.push(row);
  }
  const rows = parsedRows;
  debug.rowsAfterValidation = rows.length;

  if (!rows.length) return { persisted: 0, debug };
  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.companyId}|${row.frequency}|${row.snapshotDate.toISOString()}|${row.orderId}|${row.lineId}|${row.customerName}`;
    if (!deduped.has(key)) {
      deduped.set(key, { ...row });
      continue;
    }
    const acc = deduped.get(key)!;
    acc.qtyOrdered = Number(acc.qtyOrdered || 0) + Number(row.qtyOrdered || 0);
    acc.qtyInvoiced = Number(acc.qtyInvoiced || 0) + Number(row.qtyInvoiced || 0);
    acc.contractValue = Number(acc.contractValue || 0) + Number(row.contractValue || 0);
    acc.invoicedAmount = Number(acc.invoicedAmount || 0) + Number(row.invoicedAmount || 0);
    acc.remainingAmount = Number(acc.remainingAmount || 0) + Number(row.remainingAmount || 0);
    acc.unbilledAccrual = Number(acc.unbilledAccrual || 0) + Number(row.unbilledAccrual || 0);
    if (!acc.customerId && row.customerId) acc.customerId = row.customerId;
    if (!acc.orderDate && row.orderDate) acc.orderDate = row.orderDate;
    if (!acc.itemId && row.itemId) acc.itemId = row.itemId;
    if (!acc.itemName && row.itemName) acc.itemName = row.itemName;
    if (!acc.sku && row.sku) acc.sku = row.sku;
  }
  const finalRows = Array.from(deduped.values());
  debug.rowsAfterDedupe = finalRows.length;
  debug.rowsAttemptedPersist = finalRows.length;
  const supportsOrderDateColumn = await customerOrderLineSupportsOrderDateColumn();
  // NOTE: avoid per-row updateMany loops here. On large SLCoitems pulls this causes
  // long-running chunks and apparent sync stalls. New rows are inserted with orderDate
  // via createMany below; null-date historical backfill should be handled separately.
  const dataToPersist = supportsOrderDateColumn
    ? finalRows
    : finalRows.map(({ orderDate: _orderDate, ...rest }) => rest);
  const batch = await delegate.createMany({ data: dataToPersist, skipDuplicates: true });
  debug.rowsPersisted = Number(batch?.count || 0);
  return { persisted: debug.rowsPersisted || finalRows.length, debug };
}

function buildAgingBucketFromDueDate(
  dueDate: Date | null,
  invoiceDate: Date | null,
  asOfDate: Date
): { daysOutstanding: number | null; agingBucket: string } {
  const baselineDueDate = dueDate || (invoiceDate ? new Date(startOfUtcDay(invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000) : null);
  if (!baselineDueDate) return { daysOutstanding: null, agingBucket: '90+' };
  const days = Math.floor((startOfUtcDay(asOfDate).getTime() - startOfUtcDay(baselineDueDate).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return { daysOutstanding: days, agingBucket: 'Current' };
  if (days <= 30) return { daysOutstanding: days, agingBucket: '30' };
  if (days <= 60) return { daysOutstanding: days, agingBucket: '60' };
  if (days <= 90) return { daysOutstanding: days, agingBucket: '90' };
  return { daysOutstanding: days, agingBucket: '90+' };
}

async function upsertArContractSupportTables(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly'
): Promise<void> {
  const toCustomerKey = (customerId: string | null | undefined, customerName: string | null | undefined): string => {
    const id = String(customerId || '').trim();
    if (id) return `id:${id}`;
    return `name:${String(customerName || '').trim().toLowerCase()}`;
  };

  const openRows = await prisma.aROpenInvoiceSnapshot.findMany({
    where: { companyId, frequency, snapshotDate },
    select: {
      customerId: true,
      customerName: true,
      invoiceNo: true,
      invoiceDate: true,
      dueDate: true,
      amountHome: true,
      amountDueHome: true,
    },
    orderBy: [{ amountDueHome: 'desc' }],
    take: 50000,
  });

  const invoiceRows = openRows
    .filter((row) => Number(row.amountDueHome || 0) > 0)
    .map((row) => {
      const invoiceAmount = Number(row.amountHome || row.amountDueHome || 0);
      const remainingBalance = Number(row.amountDueHome || 0);
      const amountPaid = Math.max(invoiceAmount - remainingBalance, 0);
      const aging = buildAgingBucketFromDueDate(row.dueDate ? new Date(row.dueDate) : null, row.invoiceDate ? new Date(row.invoiceDate) : null, snapshotDate);
      return {
        companyId,
        asOfDate: snapshotDate,
        snapshotFrequency: frequency,
        customerId: row.customerId || null,
        customerName: row.customerName || 'Unknown Customer',
        invoiceId: row.invoiceNo || '-',
        invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        invoiceAmount,
        amountPaid,
        remainingBalance,
        daysOutstanding: aging.daysOutstanding,
        agingBucket: aging.agingBucket,
      };
    });

  const arInvoiceDetailDelegate = (prisma as any).aRInvoiceDetail;
  if (arInvoiceDetailDelegate?.deleteMany && arInvoiceDetailDelegate?.createMany) {
    await arInvoiceDetailDelegate.deleteMany({ where: { companyId, asOfDate: snapshotDate, snapshotFrequency: frequency } });
    if (invoiceRows.length > 0) {
      await arInvoiceDetailDelegate.createMany({ data: invoiceRows });
    }
  }

  const paymentRows = await prisma.aRPaymentFact.findMany({
    where: { companyId, paymentDate: { lte: snapshotDate } },
    select: {
      customerId: true,
      customerName: true,
      paymentDate: true,
      paidAmountHome: true,
    },
    orderBy: [{ paymentDate: 'desc' }],
    take: 100000,
  });

  const minCashFlowDate = new Date(snapshotDate.getTime() - 365 * 24 * 60 * 60 * 1000);
  const customerCashFlowDelegate = (prisma as any).customerCashFlow;
  if (customerCashFlowDelegate?.deleteMany && customerCashFlowDelegate?.createMany) {
    const cashFlowByDay = new Map<string, { customerId: string | null; customerName: string; date: Date; cashInflow: number }>();
    for (const row of paymentRows) {
      const dt = new Date(row.paymentDate);
      if (dt < minCashFlowDate || dt > snapshotDate) continue;
      const day = startOfUtcDay(dt);
      const key = `${row.customerId || ''}|${row.customerName || 'Unknown Customer'}|${day.toISOString().split('T')[0]}`;
      if (!cashFlowByDay.has(key)) {
        cashFlowByDay.set(key, {
          customerId: row.customerId || null,
          customerName: row.customerName || 'Unknown Customer',
          date: day,
          cashInflow: 0,
        });
      }
      const acc = cashFlowByDay.get(key)!;
      acc.cashInflow += Number(row.paidAmountHome || 0);
    }
    await customerCashFlowDelegate.deleteMany({
      where: {
        companyId,
        source: 'AR_PAYMENT',
        date: { gte: minCashFlowDate, lte: snapshotDate },
      },
    });
    const cashFlowRows = Array.from(cashFlowByDay.values()).map((row) => ({
      companyId,
      customerId: row.customerId,
      customerName: row.customerName,
      date: row.date,
      cashInflow: row.cashInflow,
      source: 'AR_PAYMENT',
    }));
    if (cashFlowRows.length > 0) {
      await customerCashFlowDelegate.createMany({ data: cashFlowRows });
    }
  }

  const cashByCustomer = new Map<string, { customerId: string | null; customerName: string; cash: number; lastPaymentDate: Date | null }>();
  for (const row of paymentRows) {
    const customerName = row.customerName || 'Unknown Customer';
    const key = toCustomerKey(row.customerId, customerName);
    if (!cashByCustomer.has(key)) {
      cashByCustomer.set(key, {
        customerId: row.customerId || null,
        customerName,
        cash: 0,
        lastPaymentDate: null,
      });
    }
    const acc = cashByCustomer.get(key)!;
    const amount = Number(row.paidAmountHome || 0);
    acc.cash += amount;
    const dt = new Date(row.paymentDate);
    if (!acc.lastPaymentDate || dt.getTime() > acc.lastPaymentDate.getTime()) acc.lastPaymentDate = dt;
  }

  const orderLineDelegate = (prisma as any).customerOrderLineSnapshot;
  const orderLineRows = orderLineDelegate?.findMany
    ? await orderLineDelegate.findMany({
        where: { companyId, frequency, snapshotDate },
        select: {
          customerId: true,
          customerName: true,
          contractValue: true,
          invoicedAmount: true,
          remainingAmount: true,
          unbilledAccrual: true,
        },
        take: 100000,
      })
    : [];

  const contractByCustomer = new Map<
    string,
    {
      customerId: string | null;
      customerName: string;
      contractValue: number;
      invoicedToDate: number;
      remainingValue: number;
      accruedRevenueUnbilled: number;
      arOutstanding: number;
    }
  >();
  for (const row of orderLineRows as any[]) {
    const key = toCustomerKey(row.customerId, row.customerName);
    if (!contractByCustomer.has(key)) {
      contractByCustomer.set(key, {
        customerId: row.customerId || null,
        customerName: row.customerName,
        contractValue: 0,
        invoicedToDate: 0,
        remainingValue: 0,
        accruedRevenueUnbilled: 0,
        arOutstanding: 0,
      });
    }
    const acc = contractByCustomer.get(key)!;
    acc.contractValue += Number(row.contractValue || 0);
    acc.invoicedToDate += Number(row.invoicedAmount || 0);
    acc.remainingValue += Number(row.remainingAmount || 0);
    acc.accruedRevenueUnbilled += Number(row.unbilledAccrual || 0);
    if (!acc.customerId && row.customerId) acc.customerId = row.customerId;
  }
  for (const row of invoiceRows) {
    const key = toCustomerKey(row.customerId, row.customerName);
    if (!contractByCustomer.has(key)) {
      contractByCustomer.set(key, {
        customerId: row.customerId || null,
        customerName: row.customerName,
        contractValue: 0,
        invoicedToDate: 0,
        remainingValue: 0,
        accruedRevenueUnbilled: 0,
        arOutstanding: 0,
      });
    }
    const acc = contractByCustomer.get(key)!;
    acc.arOutstanding += Number(row.remainingBalance || 0);
    if (!acc.customerId && row.customerId) acc.customerId = row.customerId;
  }

  for (const [key, cash] of cashByCustomer.entries()) {
    if (!contractByCustomer.has(key)) {
      contractByCustomer.set(key, {
        customerId: cash.customerId,
        customerName: cash.customerName,
        invoicedToDate: 0,
        arOutstanding: 0,
      });
    }
  }

  const contractRowsRaw = Array.from(contractByCustomer.values()).map((row) => {
    const cash = cashByCustomer.get(toCustomerKey(row.customerId, row.customerName));
    const cashCollectedToDate = Number(cash?.cash || 0);
    const invoicedToDate = Number(row.invoicedToDate || 0);
    const remainingValue = Number(row.remainingValue || 0);
    const accruedRevenueUnbilled = Number(row.accruedRevenueUnbilled || 0);
    const contractValue = Number(row.contractValue || invoicedToDate + accruedRevenueUnbilled + remainingValue);
    return {
      companyId,
      asOfDate: snapshotDate,
      customerId: row.customerId || null,
      customerName: row.customerName,
      contractId: 'AR_BASE',
      contractValue,
      earnedToDate: invoicedToDate + accruedRevenueUnbilled,
      invoicedToDate,
      remainingValue,
      accruedRevenueUnbilled,
      arOutstanding: row.arOutstanding,
      cashCollectedToDate,
      lastPaymentDate: cash?.lastPaymentDate || null,
    };
  });
  const contractRowsByUniqueKey = new Map<string, (typeof contractRowsRaw)[number]>();
  for (const row of contractRowsRaw) {
    const uniqueKey = `${row.customerName}|${row.contractId}`;
    const existing = contractRowsByUniqueKey.get(uniqueKey);
    if (!existing) {
      contractRowsByUniqueKey.set(uniqueKey, { ...row });
      continue;
    }
    existing.contractValue = Number(existing.contractValue || 0) + Number(row.contractValue || 0);
    existing.earnedToDate = Number(existing.earnedToDate || 0) + Number(row.earnedToDate || 0);
    existing.invoicedToDate = Number(existing.invoicedToDate || 0) + Number(row.invoicedToDate || 0);
    existing.remainingValue = Number(existing.remainingValue || 0) + Number(row.remainingValue || 0);
    existing.accruedRevenueUnbilled =
      Number(existing.accruedRevenueUnbilled || 0) + Number(row.accruedRevenueUnbilled || 0);
    existing.arOutstanding = Number(existing.arOutstanding || 0) + Number(row.arOutstanding || 0);
    existing.cashCollectedToDate = Number(existing.cashCollectedToDate || 0) + Number(row.cashCollectedToDate || 0);
    if (!existing.customerId && row.customerId) existing.customerId = row.customerId;
    if (!existing.lastPaymentDate || (row.lastPaymentDate && row.lastPaymentDate > existing.lastPaymentDate)) {
      existing.lastPaymentDate = row.lastPaymentDate;
    }
  }
  const contractRows = Array.from(contractRowsByUniqueKey.values());

  const contractStatusDelegate = (prisma as any).customerContractStatus;
  if (contractStatusDelegate?.deleteMany && contractStatusDelegate?.createMany) {
    await contractStatusDelegate.deleteMany({ where: { companyId, asOfDate: snapshotDate } });
    if (contractRows.length > 0) {
      await contractStatusDelegate.createMany({ data: contractRows });
    }
  }
}

async function saveAPAging(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  const fromBuckets = records.reduce(
    (acc, record) => {
      acc.totalAP += pickNumber(record, ['totalAP', 'total', 'TOTAP']);
      acc.current += pickNumber(record, ['current', 'CURAP', 'currentAmount']);
      acc.days1to30 += pickNumber(record, ['days1to30', 'AP1_30', 'bucket1']);
      acc.days31to60 += pickNumber(record, ['days31to60', 'AP31_60', 'bucket2']);
      acc.days61to90 += pickNumber(record, ['days61to90', 'AP61_90', 'bucket3']);
      acc.days90plus += pickNumber(record, ['days90plus', 'AP90P', 'bucket4']);
      return acc;
    },
    { totalAP: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
  );

  const derived = calculateAgingTotalsFromTransactions(records, {
    dueDateKeys: ['DueDate', 'dueDate', 'DUDT', 'InvDate', 'invoiceDate', 'IVDT', 'RecordDate', 'date'],
    balanceKeys: ['Balance', 'balance', 'openBalance', 'openAmount', 'amountDue'],
    amountKeys: ['Amount', 'amount', 'invoiceAmount'],
    openFlagKeys: ['Open', 'open', 'isOpen', 'IsOpen', 'OPEN'],
    statusKeys: ['Status', 'status', 'STAT', 'state', 'State'],
    asOfDate: snapshotDate,
  });

  const totals =
    fromBuckets.totalAP !== 0
      ? fromBuckets
      : {
          totalAP: derived.total,
          current: derived.current,
          days1to30: derived.days1to30,
          days31to60: derived.days31to60,
          days61to90: derived.days61to90,
          days90plus: derived.days90plus,
        };

  if (totals.totalAP === 0) return 0;

  await prisma.aPAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: totals,
    create: {
      companyId,
      snapshotDate,
      frequency,
      ...totals,
    },
  });

  return 1;
}

async function saveAPOpenBills(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string; divi?: string }
): Promise<number> {
  await (prisma as any).aPOpenBillSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });

  const rows = records
    .map((record, idx) => {
      const vendorName = pickString(record, VENDOR_NAME_KEYS) || `Unknown Vendor ${idx + 1}`;
      const billNo =
        pickString(record, ['billNo', 'billNumber', 'invoiceNo', 'voucher', 'SINO']) || `UNKNOWN-${idx + 1}`;
      const amountDueHome = pickNumber(record, ['amountDueHome', 'amountDue', 'openAmount', 'balance', 'CUAM', 'ACAM']);
      return {
        companyId,
        snapshotDate,
        frequency,
        vendorId: pickString(record, VENDOR_ID_KEYS),
        vendorName,
        billNo,
        billDate: parseMaybeDate(pickString(record, ['billDate', 'invoiceDate', 'date', 'IVDT'])),
        dueDate: parseMaybeDate(pickString(record, ['dueDate', 'DUDT'])),
        status: pickString(record, ['status', 'STAT']),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        amountCurrency: pickNumber(record, ['amountCurrency', 'billAmount', 'CUAM']) || null,
        amountHome: pickNumber(record, ['amountHome', 'homeAmount', 'ACAM']) || null,
        amountDueHome,
        current: pickNumber(record, ['current', 'bucket0']) || null,
        days1to30: pickNumber(record, ['days1to30', 'bucket1']) || null,
        days31to60: pickNumber(record, ['days31to60', 'bucket2']) || null,
        days61to90: pickNumber(record, ['days61to90', 'bucket3']) || null,
        days90plus: pickNumber(record, ['days90plus', 'bucket4']) || null,
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter((row) => row.vendorName && row.billNo && Number.isFinite(row.amountDueHome));

  if (!rows.length) return 0;
  await (prisma as any).aPOpenBillSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveAPPayments(
  companyId: string,
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string; divi?: string }
): Promise<number> {
  const rows = records
    .map((record, idx) => {
      const paymentDate = parseMaybeDate(pickString(record, ['paymentDate', 'date', 'PYDT', 'RGDT']));
      if (!paymentDate) return null;
      const vendorName = pickString(record, VENDOR_NAME_KEYS) || `Unknown Vendor ${idx + 1}`;
      return {
        companyId,
        paymentDate,
        vendorId: pickString(record, VENDOR_ID_KEYS),
        vendorName,
        billNo: pickString(record, ['billNo', 'billNumber', 'invoiceNo', 'SINO']),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        paidAmountCurrency: pickNumber(record, ['paidAmountCurrency', 'CUAM']) || null,
        paidAmountHome: pickNumber(record, ['paidAmountHome', 'paidAmount', 'amount', 'ACAM', 'PYAM']),
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row && Number.isFinite(row.paidAmountHome));

  if (!rows.length) return 0;
  await (prisma as any).aPPaymentFact.createMany({ data: rows });
  return rows.length;
}

async function saveCustomerSales(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.customerSalesSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });

  const rows = records
    .map((record) => {
      const customerName = pickString(record, CUSTOMER_NAME_KEYS) || 'Unknown Customer';
      const explicitRevenue = pickNumber(record, [
        'revenue',
        'amount',
        'salesAmount',
        'NETA',
        'Amount',
        'Price',
        'ExtPrice',
        'DerOrderBalance',
        'DerPaymentCheckAmount',
      ]);
      const quantity = pickNumber(record, ['quantity', 'qty', 'QTY', 'quantitySold', 'QtyPackages', 'InvSeq']);
      const unitPrice = pickNumber(record, ['unitPrice', 'price', 'Price', 'salesPrice', 'Upri']);
      const revenue = explicitRevenue !== 0 ? explicitRevenue : quantity * unitPrice;
      const explicitInvoiceCount = pickNumber(record, ['invoiceCount', 'count', 'IVNO_COUNT', 'InvSeq']);
      const invoiceCount = Math.max(0, Math.round(explicitInvoiceCount > 0 ? explicitInvoiceCount : revenue !== 0 ? 1 : 0));
      return {
        companyId,
        snapshotDate,
        frequency,
        customerId: pickString(record, CUSTOMER_ID_KEYS),
        customerName,
        revenue,
        invoiceCount,
        avgInvoiceSize: invoiceCount > 0 ? revenue / invoiceCount : null,
      };
    })
    .filter((row) => row.customerName);

  if (rows.length === 0) return 0;
  await prisma.customerSalesSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveProductSales(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.productSalesSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });
  const snapshotDayUtcMs = startOfUtcDay(snapshotDate).getTime();
  const rows = records
    .map((record) => {
      if (frequency === 'daily') {
        const salesRecordDate = firstRecordDate(record, [
          'InvDate',
          'invoiceDate',
          'ShipDate',
          'shipDate',
          'OrderDate',
          'orderDate',
          'RecordDate',
          'date',
        ]);
        if (!salesRecordDate) return null;
        if (startOfUtcDay(salesRecordDate).getTime() !== snapshotDayUtcMs) return null;
      }
      const metrics = deriveSalesMetrics(record);
      const quantitySold = metrics.quantity;
      const revenue = metrics.revenue;
      const cogs = metrics.cogs;
      const grossMargin = revenue - cogs;
      return {
        companyId,
        snapshotDate,
        frequency,
        itemId: pickString(record, ['itemId', 'ITNO', 'sku', 'Item', 'CustNum']),
        itemName: pickString(record, ['itemName', 'name', 'ITDS', 'Item', 'AddrName', 'DerCustNoName']) || 'Unknown Item',
        sku: pickString(record, ['sku', 'itemCode', 'ITNO', 'Item', 'InvNum', 'CoNum']),
        quantitySold,
        revenue,
        cogs,
        grossMargin,
        grossMarginPct: revenue > 0 ? (grossMargin / revenue) * 100 : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row)
    .filter((row) => row.itemName);

  if (rows.length === 0) return 0;
  await prisma.productSalesSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveInventory(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.inventorySnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });
  const rows = records
    .map((record) => {
      const qtyOnHand = pickNumber(record, ['qtyOnHand', 'quantity', 'QTY', 'onHand', 'DerQtyOnHand', 'iwvQtyOnHand', 'ITWHQtyOnHand']);
      const avgCost = pickNumber(record, ['avgCost', 'cost', 'averageCost', 'UnitCost', 'AvgUCost', 'CurUCost', 'DerUnitCost']);
      const assetValue = pickNumber(record, ['assetValue', 'value', 'inventoryValue', 'UbValue', 'DerExtValue']) || qtyOnHand * avgCost;
      return {
        companyId,
        snapshotDate,
        frequency,
        itemId: pickString(record, ['itemId', 'ITNO', 'sku', 'Item']),
        itemName: pickString(record, ['itemName', 'name', 'ITDS', 'Description', 'Item']) || 'Unknown Item',
        sku: pickString(record, ['sku', 'itemCode', 'ITNO', 'Item']),
        warehouse: pickString(record, ['warehouse', 'Warehouse', 'WHLO', 'Whse', 'ITWHWhse', 'MfgWhse', 'SupplyWhse']),
        bin: pickString(record, ['bin', 'Bin', 'BANO', 'UbLocation', 'BflushLoc']),
        lot: pickString(record, ['lot', 'Lot', 'LOT', 'UbLotNumber', 'LotNum']),
        qtyOnHand,
        assetValue,
        avgCost: avgCost || null,
      };
    })
    .filter((row) => row.itemName);

  if (rows.length === 0) return 0;
  await prisma.inventorySnapshot.createMany({ data: rows });
  return rows.length;
}

type DailyFinancialSnapshotHydrationOutcome = {
  written: boolean;
  targetSnapshotDate: string;
  sourceDates: {
    cash: string | null;
    inventory: string | null;
    sales: string | null;
    ar: string | null;
    ap: string | null;
  };
  staleOrMissingSources: string[];
  reason: string | null;
};

function toIsoDayOrNull(value: Date | null | undefined): string | null {
  if (!value) return null;
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

async function upsertDailyFinancialSnapshotFromOperationalTables(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly'
): Promise<DailyFinancialSnapshotHydrationOutcome> {
  const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
  const targetSnapshotDate = toIsoDayOrNull(snapshotDate) || String(snapshotDate);
  if (!dailySnapshotDelegate) {
    return {
      written: false,
      targetSnapshotDate,
      sourceDates: { cash: null, inventory: null, sales: null, ar: null, ap: null },
      staleOrMissingSources: ['dailyFinancialSnapshotModel'],
      reason: 'DailyFinancialSnapshot model delegate not available.',
    };
  }

  const mappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
  const [cashAgg, inventoryRows, productAgg, arSnapshot, apSnapshot, glBalanceMovementRows] = await Promise.all([
    prisma.cashSnapshot.aggregate({
      where: { companyId, snapshotDate, frequency },
      _sum: { cashBalance: true },
      _count: { _all: true },
    }),
    prisma.inventorySnapshot.findMany({
      where: { companyId, snapshotDate, frequency },
      select: {
        itemId: true,
        itemName: true,
        sku: true,
        qtyOnHand: true,
        assetValue: true,
        avgCost: true,
      },
    }),
    prisma.productSalesSnapshot.aggregate({
      where: { companyId, snapshotDate, frequency },
      _sum: { revenue: true, cogs: true },
      _count: { _all: true },
    }),
    prisma.aRAgingSnapshot.findUnique({
      where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
      select: { totalAR: true },
    }),
    prisma.aPAgingSnapshot.findUnique({
      where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
      select: { totalAP: true },
    }),
    mappedLineDelegate
      ? mappedLineDelegate.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate,
            sourceAccountType: 'gl_balance_account',
            targetField: { startsWith: 'balance_movement:' },
          },
          select: { targetField: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  const sourceDates = {
    cash: Number(cashAgg?._count?._all || 0) > 0 ? targetSnapshotDate : null,
    inventory: Array.isArray(inventoryRows) && inventoryRows.length > 0 ? targetSnapshotDate : null,
    sales: Number(productAgg?._count?._all || 0) > 0 ? targetSnapshotDate : null,
    ar: arSnapshot ? targetSnapshotDate : null,
    ap: apSnapshot ? targetSnapshotDate : null,
  };

  const staleOrMissingSources = Object.entries(sourceDates)
    .filter(([, day]) => !day)
    .map(([source]) => source);

  const hasAnyOperationalSource =
    Boolean(sourceDates.cash) ||
    Boolean(sourceDates.inventory) ||
    Boolean(sourceDates.sales) ||
    Boolean(sourceDates.ar) ||
    Boolean(sourceDates.ap);
  const hasAnyGlMappedRows = Array.isArray(glBalanceMovementRows) && glBalanceMovementRows.length > 0;
  if (!hasAnyOperationalSource && !hasAnyGlMappedRows) {
    return {
      written: false,
      targetSnapshotDate,
      sourceDates,
      staleOrMissingSources,
      reason: 'No same-day operational or GL mapped source rows found for target snapshot date.',
    };
  }

  // Keep daily inventory snapshot aligned with inventory table logic:
  // remove exact duplicate rows, then aggregate to unique SKU before summing value.
  const dedupeInventoryRowsExact = (rows: Array<{
    itemId: string | null;
    itemName: string;
    sku: string | null;
    qtyOnHand: number;
    assetValue: number;
    avgCost: number | null;
  }>) => {
    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const row of rows) {
      const signature = [
        String(row.sku || '').trim(),
        String(row.itemId || '').trim(),
        String(row.itemName || '').trim(),
        Number(row.qtyOnHand || 0).toFixed(6),
        Number(row.assetValue || 0).toFixed(6),
        Number(row.avgCost || 0).toFixed(6),
      ].join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);
      deduped.push(row);
    }
    return deduped;
  };
  const dedupedInventoryRows = dedupeInventoryRowsExact(inventoryRows as any);
  const inventoryBySku = new Map<string, number>();
  for (const row of dedupedInventoryRows) {
    const skuKey =
      String((row as any).sku || '').trim() ||
      String((row as any).itemId || '').trim() ||
      String((row as any).itemName || '').trim();
    inventoryBySku.set(skuKey, Number(inventoryBySku.get(skuKey) || 0) + Number((row as any).assetValue || 0));
  }

  const glMovementTotals = new Map<string, number>();
  for (const row of Array.isArray(glBalanceMovementRows) ? glBalanceMovementRows : []) {
    const rawTargetField = String((row as any).targetField || '').trim().toLowerCase();
    const amount = Number((row as any).amount || 0);
    if (!rawTargetField.startsWith('balance_movement:') || !Number.isFinite(amount)) continue;
    const field = rawTargetField.replace('balance_movement:', '').trim();
    if (!field) continue;
    glMovementTotals.set(field, Number(glMovementTotals.get(field) || 0) + Math.abs(amount));
  }

  const sumGlByPredicate = (predicate: (field: string) => boolean): number => {
    let total = 0;
    glMovementTotals.forEach((value, field) => {
      if (!predicate(field)) return;
      total += Number(value || 0);
    });
    return total;
  };
  const hasExactSalesForDay = Boolean(sourceDates.sales);

  const cashFromOps = Number(cashAgg?._sum?.cashBalance || 0);
  const inventory = Array.from(inventoryBySku.values()).reduce((sum, value) => sum + Number(value || 0), 0);
  const revenueFromOps = Number(productAgg?._sum?.revenue || 0);
  const cogsFromOps = Number(productAgg?._sum?.cogs || 0);
  const revenueFromGl = sumGlByPredicate((field) => field.startsWith('rev'));
  const cogsFromGl = sumGlByPredicate(
    (field) => field === 'cogstotal' || field.startsWith('cogs') || field.includes('costofgoods')
  );
  const expenseFromGl = sumGlByPredicate(
    (field) =>
      field === 'expense' ||
      field === 'otherexpense' ||
      field.includes('expense') ||
      field.includes('payroll') ||
      field.includes('rent') ||
      field.includes('insurance') ||
      field.includes('tax') ||
      field.includes('interest') ||
      field.includes('depreciation')
  );

  const revenue = hasExactSalesForDay ? Math.max(revenueFromOps, revenueFromGl) : revenueFromGl;
  const cogsTotal = hasExactSalesForDay ? Math.max(cogsFromOps, cogsFromGl) : cogsFromGl;
  const expense = expenseFromGl;
  // Balance-sheet values are strict same-day snapshots only.
  // Do not use mapped movement fallback for point-in-time balances.
  const cash = cashFromOps;
  const ar = Number(arSnapshot?.totalAR || 0);
  const inventoryEffective = inventory;
  const ap = Number(apSnapshot?.totalAP || 0);
  const loc = 0;
  const otherCL = 0;
  const ltd = 0;
  const tca = cash + ar + inventoryEffective;
  const tcl = ap + loc + otherCL;
  const totalAssets = tca;
  const totalLiab = tcl + ltd;
  const totalEquity = totalAssets - totalLiab;
  const totalLAndE = totalLiab + totalEquity;

  const payload = {
    companyId,
    snapshotDate,
    frequency,
    sourcePlatform: 'INFOR_M3',
    revenue,
    cogsTotal,
    expense,
    otherExpense: expenseFromGl,
    cash,
    ar,
    inventory: inventoryEffective,
    tca,
    totalAssets,
    ap,
    loc,
    otherCL,
    tcl,
    ltd,
    totalLiab,
    totalEquity,
    totalLAndE,
  };

  await dailySnapshotDelegate.upsert({
    where: {
      companyId_snapshotDate_frequency: {
        companyId,
        snapshotDate,
        frequency,
      },
    },
    create: payload,
    update: payload,
  });
  return {
    written: true,
    targetSnapshotDate,
    sourceDates,
    staleOrMissingSources,
    reason: (() => {
      const notes: string[] = [];
      if (staleOrMissingSources.length > 0) {
        notes.push('Daily snapshot written from latest available source data on/before target date.');
      }
      if (!hasExactSalesForDay) {
        if (revenueFromGl > 0 || cogsFromGl > 0 || expenseFromGl > 0) {
          notes.push('Daily P&L inferred from same-day GL mapped movements due to missing sales snapshot rows.');
        } else {
          notes.push('Daily revenue/cogs suppressed because no same-day sales snapshot was available.');
        }
      }
      if (staleOrMissingSources.length > 0) {
        notes.push('Balance sheet uses strict same-day snapshots; missing sources remain zero for that day.');
      }
      return notes.length > 0 ? notes.join(' ') : null;
    })(),
  };
}

export async function syncInforM3OperationalData(
  companyId: string,
  frequency: 'daily' | 'weekly' | 'monthly' = 'daily',
  siteOverride?: string,
  syncWindow?: SyncWindow,
  options?: SyncOptions
): Promise<InforOperationalSyncResult> {
  const debugSync = process.env.SYNC_DEBUG === '1';
  const errors: string[] = [];
  let recordsCreated = 0;
  const syncRunId = String(options?.syncRunId || '').trim() || randomUUID();
  // Normalize to a UTC calendar day key so repeated runs do not create
  // mixed local-time snapshot variants (e.g. 00:00 and 07:00).
  const snapshotDate = startOfUtcDay(options?.snapshotDateOverride ? new Date(options.snapshotDateOverride) : new Date());

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
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const inforSystem = normalizeInforSystem(company?.accountingSystem);
  const programsBySystem =
    metadata.accountingProgramsBySystem && typeof metadata.accountingProgramsBySystem === 'object'
      ? (metadata.accountingProgramsBySystem as Record<string, unknown>)
      : {};

  const configuredSystemProgramsRaw = programsBySystem[inforSystem];
  const configuredSystemPrograms =
    Array.isArray(configuredSystemProgramsRaw) && configuredSystemProgramsRaw.length > 0
      ? configuredSystemProgramsRaw
      : null;
  const configuredGlobalPrograms =
    Array.isArray(metadata.accountingPrograms) && metadata.accountingPrograms.length > 0
      ? metadata.accountingPrograms
      : null;
  const hasAnyConfiguredProgramSet = Boolean(configuredSystemPrograms || configuredGlobalPrograms);

  const parsedProgramRows = parsePrograms(configuredSystemPrograms ?? configuredGlobalPrograms).filter(
    (row) => row.module.trim().toLowerCase() !== 'accounts'
  );
  if (hasAnyConfiguredProgramSet && parsedProgramRows.length === 0) {
    return {
      success: false,
      recordsCreated: 0,
      errors: [
        `Configured accounting programs could not be resolved for ${inforSystem}. ` +
          'Sync aborted to avoid fallback to default program rows. Save valid accounting programs for this company and retry.',
      ],
      credentialSource: null,
      hasMore: false,
      nextProgramOffset: null,
      continuation: null,
      totalProgramRows: 0,
    };
  }
  const baseProgramRows = parsedProgramRows.length > 0 ? parsedProgramRows : DEFAULT_CSI_PROGRAM_ROWS;
  const salesOnly = options?.salesOnly === true;
  const SALES_ONLY_PROGRAM_IDS = new Set(['SLCOHDRS', 'SLCOS', 'SLCOITEMS']);
  const programRows = salesOnly
    ? baseProgramRows.filter((row) => SALES_ONLY_PROGRAM_IDS.has(resolveCsiProgramId(row, row.endpointPath)))
    : baseProgramRows;
  const totalProgramRows = programRows.length;
  const programOffset = Math.max(0, Math.floor(Number(options?.programOffset || 0)));
  const requestedLimit =
    options?.programLimit && Number.isFinite(options.programLimit) && Number(options.programLimit) > 0
      ? Math.floor(Number(options.programLimit))
      : totalProgramRows;
  const programRowsToProcess = programRows.slice(programOffset, programOffset + requestedLimit);
  const nextProgramOffset =
    programOffset + programRowsToProcess.length < totalProgramRows
      ? programOffset + programRowsToProcess.length
      : null;

  if (programRows.length === 0) {
    return {
      success: true,
      recordsCreated: 0,
      errors: [],
      credentialSource: null,
      hasMore: false,
      nextProgramOffset: null,
      continuation: null,
      totalProgramRows,
    };
  }

  const { credentials, source: credentialSource } = await getInforM3CredentialsWithOptionalEnvFallback(
    companyId,
    inforSystem
  );
  if (!credentials) {
    return {
      success: false,
      recordsCreated: 0,
      errors: ['Infor M3 credentials are not configured for this company (no database/env credentials resolved).'],
      credentialSource: null,
      hasMore: false,
      nextProgramOffset: null,
      continuation: null,
      totalProgramRows,
    };
  }

  let continuation: InforOperationalSyncResult['continuation'] = null;
  const orderCustomerLookup = new Map<string, { customerId: string | null; customerName: string; orderDate: Date | null }>();
  let attemptedSlCosLookupHydration = false;
  const hydrateOrderLookupFromSlCos = async (): Promise<{ loaded: number; message?: string }> => {
    if (attemptedSlCosLookupHydration) return { loaded: 0, message: 'lookup_hydration_already_attempted' };
    attemptedSlCosLookupHydration = true;

    const slcosRow = programRows.find((candidate) => {
      const moduleType = String(candidate.module || '').trim().toLowerCase();
      const miProgram = String(candidate.miProgram || '').trim().toUpperCase();
      return moduleType === 'sales' && miProgram === 'SLCOS' && candidate.enabled;
    });
    if (!slcosRow) return { loaded: 0, message: 'slcos_program_not_found' };

    const slcosBaseEndpoint = buildCsiEndpointPath(slcosRow);
    if (!slcosBaseEndpoint) return { loaded: 0, message: 'slcos_endpoint_missing' };

    let endpoint = ensureCsiProperties(slcosBaseEndpoint, ['CoNum', 'CustNum', 'DerCustNoName', 'Stat', 'OrderDate', 'DueDate']);
    const headers = slcosRow.mongooseConfig ? { 'X-Infor-MongooseConfig': slcosRow.mongooseConfig } : undefined;
    let response = await callInforIonApi(credentials, endpoint, {
      timeoutMs: 30000,
      headers,
    });
    if (!isTransportAndPayloadSuccess(response)) {
      let attempts = 0;
      while (attempts < 5) {
        attempts += 1;
        const retryMessage = extractResponseMessage(response.body);
        const missingProperty = parseMissingPropertyFromMessage(retryMessage);
        if (!missingProperty) break;
        const reduced = removePropertyFromEndpoint(endpoint, missingProperty);
        if (!reduced || reduced === endpoint) break;
        endpoint = reduced;
        response = await callInforIonApi(credentials, endpoint, {
          timeoutMs: 30000,
          headers,
        });
        if (isTransportAndPayloadSuccess(response)) break;
      }
    }
    if (!isTransportAndPayloadSuccess(response)) {
      return { loaded: 0, message: extractResponseMessage(response.body) || 'slcos_fetch_failed' };
    }

    let records = extractRecords(response.body);
    let paging = extractPagingState(response.body);
    let pagesFetched = 1;
    while (paging.moreRowsExist && paging.bookmark && pagesFetched < MAX_CSI_PAGES_PER_REQUEST) {
      const nextPath = appendBookmarkToEndpoint(endpoint, paging.bookmark);
      const nextResponse = await callInforIonApi(credentials, nextPath, {
        timeoutMs: 30000,
        headers,
      });
      if (!isTransportAndPayloadSuccess(nextResponse)) break;
      records = records.concat(extractRecords(nextResponse.body));
      paging = extractPagingState(nextResponse.body);
      response = nextResponse;
      pagesFetched += 1;
    }

    for (const rec of records) {
      const orderId = normalizeOrderJoinKey(pickString(rec, ['CoNum', 'coNum', 'orderNo', 'orderNumber']));
      if (!orderId) continue;
      const customerId = pickString(rec, ['CustNum', 'custNum', 'CoCustNum', 'CustNo', ...CUSTOMER_ID_KEYS]) || null;
      const customerName =
        parseCustomerNameFromComposite(pickString(rec, ['DerCustNoName'])) ||
        pickString(rec, ['CustName', 'DerCustName', 'Name', ...CUSTOMER_NAME_KEYS]) ||
        (customerId ? `Customer ${customerId}` : 'Unknown Customer');
      const orderDate = firstRecordDate(rec, ['OrderDate', 'orderDate']);
      orderCustomerLookup.set(orderId, { customerId, customerName, orderDate: orderDate || null });
    }
    return { loaded: orderCustomerLookup.size, message: 'ok' };
  };
  for (let rowIndex = 0; rowIndex < programRowsToProcess.length; rowIndex += 1) {
    const row = programRowsToProcess[rowIndex];
    const absoluteProgramOffset = programOffset + rowIndex;
    const requests: Array<{ transaction: string; endpointPath: string; headers?: Record<string, string> }> = [];

    if (row.endpointPath || (row.miProgram && row.miProgram.toUpperCase().startsWith('SL'))) {
      const endpointPath = buildCsiEndpointPath(row);
      if (endpointPath) {
        requests.push({
          transaction: row.endpointPath ? 'CSI_LOAD' : 'CSI_AUTO',
          endpointPath,
          headers: row.mongooseConfig ? { 'X-Infor-MongooseConfig': row.mongooseConfig } : undefined,
        });
      }
    } else if (row.miProgram) {
      const txs = row.transactions.length > 0 ? row.transactions : ['GET'];
      for (const transaction of txs) {
        const params = new URLSearchParams();
        if (row.divi) params.set('DIVI', row.divi);
        if (row.cono) params.set('CONO', row.cono);
        const endpointPath = `/M3/m3api-rest/execute/${row.miProgram}/${transaction}${
          params.toString() ? `?${params.toString()}` : ''
        }`;
        requests.push({ transaction, endpointPath });
      }
    }

    const requestStartIndex =
      absoluteProgramOffset === programOffset
        ? Math.max(0, Math.floor(Number(options?.requestOffset || 0)))
        : 0;

    for (let reqIndex = requestStartIndex; reqIndex < requests.length; reqIndex += 1) {
      const req = requests[reqIndex];
      const startedAt = Date.now();
      const moduleType = classifyModule(row.module);
      const programId = resolveCsiProgramId(row, req.endpointPath);
      const isSlCoitemsProgram = moduleType === 'sales' && programId === 'SLCOITEMS';
      const isArBackfillWindow = moduleType === 'ar' && syncWindow?.mode === 'backfill';
      const requestTimeoutMs = moduleType === 'inventory' || isArBackfillWindow ? 120000 : 30000;
      // Keep SLCoitems chunk duration bounded so each sync call returns promptly
      // with a continuation cursor instead of appearing "stuck" on one huge page pull.
      const maxPagesPerRequest = isSlCoitemsProgram ? 8 : MAX_CSI_PAGES_PER_REQUEST;
      const sourceWindowPathResult = applyCsiSourceWindowAndSort(req.endpointPath, row, moduleType, syncWindow);
      if (debugSync) {
        console.log(
          JSON.stringify({
            event: 'sync_request_start',
            syncRunId,
            moduleType,
            programId,
            absoluteProgramOffset,
            reqIndex,
            requestStartIndex,
            hasInputBookmark: Boolean(options?.bookmark),
            endpointPath: req.endpointPath,
          })
        );
      }
      const sourceWindowBaseEndpointPath = sourceWindowPathResult.endpointPath;
      const fallbackBaseEndpointPath = req.endpointPath;
      let initialEndpointPath = sourceWindowBaseEndpointPath;
      const inputBookmark = typeof options?.bookmark === 'string' && options.bookmark.trim() ? options.bookmark.trim() : null;
      const inputKeyset = decodeSlInvHdrsKeysetBookmark(inputBookmark);
      const inputCustomersKeyset = decodeSlCustomersKeysetBookmark(inputBookmark);
      const inputArtransKeyset = decodeSlArtransKeysetBookmark(inputBookmark);
      const inputSlLedgersKeyset = decodeSlLedgersKeysetBookmark(inputBookmark);
      if (
        absoluteProgramOffset === programOffset &&
        reqIndex === requestStartIndex &&
        inputBookmark
      ) {
        const isSlInvHdrs = moduleType === 'sales' && programId === 'SLINVHDRS';
        const isSlCoitems = moduleType === 'sales' && programId === 'SLCOITEMS';
        const isSlCustomers = moduleType === 'customer' && programId === 'SLCUSTOMERS';
        const isSlArtrans = moduleType === 'ar' && programId === 'SLARTRANS';
        const isSlLedgers = moduleType === 'gl' && programId === 'SLLEDGERS';
        if (isSlInvHdrs && inputKeyset) {
          initialEndpointPath = applySlInvHdrsKeysetCursor(sourceWindowBaseEndpointPath, inputKeyset);
        } else if (isSlCoitems) {
          // For active continuation within the same run, we must honor the returned bookmark
          // or we will restart at FIRST and repeatedly import the same page band.
          initialEndpointPath = appendBookmarkToEndpoint(sourceWindowBaseEndpointPath, inputBookmark);
        } else if (isSlCustomers && inputCustomersKeyset) {
          initialEndpointPath = applySlCustomersKeysetCursor(sourceWindowBaseEndpointPath, inputCustomersKeyset);
        } else if (isSlArtrans && inputArtransKeyset) {
          initialEndpointPath = applySlArtransKeysetCursor(sourceWindowBaseEndpointPath, inputArtransKeyset);
        } else if (isSlLedgers && inputSlLedgersKeyset) {
          initialEndpointPath = applySlLedgersKeysetCursor(sourceWindowBaseEndpointPath, inputSlLedgersKeyset);
        } else {
          initialEndpointPath = appendBookmarkToEndpoint(sourceWindowBaseEndpointPath, inputBookmark);
        }
      }

      const normalizedInitialEndpointPath = resolveSlCoitemsSafePath(initialEndpointPath) || initialEndpointPath;
      let effectiveEndpointPath = normalizedInitialEndpointPath;
      let response = await callInforIonApi(credentials, normalizedInitialEndpointPath, {
        timeoutMs: requestTimeoutMs,
        headers: req.headers,
      });
      if (debugSync) {
        console.log(
          JSON.stringify({
            event: 'sync_request_first_response',
            syncRunId,
            moduleType,
            programId,
            absoluteProgramOffset,
            reqIndex,
            responseStatus: response.status,
            elapsedMs: Date.now() - startedAt,
          })
        );
      }
      const isWindowedSlLedgersRequest =
        moduleType === 'gl' &&
        String(row.miProgram || '').trim().toUpperCase() === 'SLLEDGERS' &&
        Boolean(syncWindow);
      if (
        !isTransportAndPayloadSuccess(response) &&
        sourceWindowPathResult.applied &&
        !isWindowedSlLedgersRequest &&
        shouldRetryWithoutSourceWindowHint(extractResponseMessage(response.body))
      ) {
        const fallbackInitialPath =
          absoluteProgramOffset === programOffset &&
          reqIndex === requestStartIndex &&
          typeof options?.bookmark === 'string' &&
          options.bookmark.trim()
            ? appendBookmarkToEndpoint(fallbackBaseEndpointPath, options.bookmark.trim())
            : fallbackBaseEndpointPath;
        const fallbackResponse = await callInforIonApi(credentials, fallbackInitialPath, {
          timeoutMs: requestTimeoutMs,
          headers: req.headers,
        });
        if (isTransportAndPayloadSuccess(fallbackResponse)) {
          response = fallbackResponse;
          effectiveEndpointPath = fallbackInitialPath;
        }
      }
      if (
        !isTransportAndPayloadSuccess(response) &&
        req.headers?.['X-Infor-MongooseConfig'] &&
        shouldRetryWithoutMongooseConfig(extractResponseMessage(response.body))
      ) {
        const headersWithoutMongoose = { ...(req.headers || {}) };
        delete headersWithoutMongoose['X-Infor-MongooseConfig'];
        const retryWithoutMongooseResponse = await callInforIonApi(credentials, effectiveEndpointPath, {
          timeoutMs: requestTimeoutMs,
          headers: Object.keys(headersWithoutMongoose).length > 0 ? headersWithoutMongoose : undefined,
        });
        if (isTransportAndPayloadSuccess(retryWithoutMongooseResponse)) {
          response = retryWithoutMongooseResponse;
        }
      }
      // Some CSI environments expose SLAptrxp/SLAptrxps with a broken projection that references
      // vendor_bank_id. Retry with a narrowed property list first, then fallback to SLAptrx.
      const initialMessage = extractResponseMessage(response.body);
      const shouldTryApAliasFallback =
        /\/load\/SLAptrx|\/load\/SLAptrxp|\/load\/SLAptrxps/i.test(req.endpointPath) &&
        (
          /invalid column name 'vendor_bank_id'/i.test(initialMessage) ||
          /ido not found/i.test(initialMessage)
        );
      if (
        !isTransportAndPayloadSuccess(response) &&
        shouldTryApAliasFallback
      ) {
        const safePropertyPath = resolveSlaPtrxSafePropertyPath(req.endpointPath);
        if (safePropertyPath && safePropertyPath !== req.endpointPath) {
          const safeRetry = await callInforIonApi(credentials, safePropertyPath, {
            timeoutMs: requestTimeoutMs,
            headers: req.headers,
          });
          response = safeRetry;
          effectiveEndpointPath = safePropertyPath;
        }
        if (!isTransportAndPayloadSuccess(response)) {
          const fallbackPath = resolveSlaPtrxFallbackPath(req.endpointPath);
          if (fallbackPath) {
            let fallbackWithProperties = ensureCsiProperties(fallbackPath, SLA_PTRX_SAFE_PROPERTIES);
            let attempts = 0;
            while (fallbackWithProperties && fallbackWithProperties !== effectiveEndpointPath && attempts < 5) {
              attempts += 1;
              const legacyRetry = await callInforIonApi(credentials, fallbackWithProperties, {
                timeoutMs: requestTimeoutMs,
                headers: req.headers,
              });
              response = legacyRetry;
              effectiveEndpointPath = fallbackWithProperties;
              if (isTransportAndPayloadSuccess(response)) break;

              const retryMessage = extractResponseMessage(response.body);
              const missingProperty = parseMissingPropertyFromMessage(retryMessage);
              if (!missingProperty) break;
              const reducedPath = removePropertyFromEndpoint(fallbackWithProperties, missingProperty);
              if (!reducedPath || reducedPath === fallbackWithProperties) break;
              fallbackWithProperties = reducedPath;
            }
          }
        }
      }
      if (
        !isTransportAndPayloadSuccess(response) &&
        /\/load\/SLCoitems/i.test(req.endpointPath)
      ) {
        const missingPropertyFromInitial = parseMissingPropertyFromMessage(initialMessage);
        const shouldTryCoitemsPropertyFallback =
          /invalid column name 'contract_price_method'/i.test(initialMessage) || Boolean(missingPropertyFromInitial);
        if (!shouldTryCoitemsPropertyFallback) {
          // Continue with normal error handling for non-property related failures.
        } else {
        const safeCoitemsPath = resolveSlCoitemsSafePath(req.endpointPath);
        if (safeCoitemsPath && safeCoitemsPath !== req.endpointPath) {
          let currentPath = safeCoitemsPath;
          let attempts = 0;
          while (currentPath && attempts < 6) {
            attempts += 1;
            const retry = await callInforIonApi(credentials, currentPath, {
              timeoutMs: requestTimeoutMs,
              headers: req.headers,
            });
            response = retry;
            effectiveEndpointPath = currentPath;
            if (isTransportAndPayloadSuccess(response)) break;

            const retryMessage = extractResponseMessage(response.body);
            const missingProperty = parseMissingPropertyFromMessage(retryMessage);
            if (!missingProperty) break;
            const reducedPath = removePropertyFromEndpoint(currentPath, missingProperty);
            if (!reducedPath || reducedPath === currentPath) break;
            currentPath = reducedPath;
          }
        }
        }
      }
      if (moduleType === 'ap' && !isTransportAndPayloadSuccess(response)) {
        const apErrorMessage = extractResponseMessage(response.body);
        if (/ido not found/i.test(apErrorMessage) && /\/load\//i.test(effectiveEndpointPath)) {
          const candidates = buildApSlaPtrxCandidatePaths(effectiveEndpointPath);
          for (const candidatePath of candidates) {
            if (candidatePath === effectiveEndpointPath) continue;
            const candidateResponse = await callInforIonApi(credentials, candidatePath, {
              timeoutMs: requestTimeoutMs,
              headers: req.headers,
            });
            if (!isTransportAndPayloadSuccess(candidateResponse)) continue;
            response = candidateResponse;
            effectiveEndpointPath = candidatePath;
            break;
          }
        }
      }
      if (moduleType === 'gl' && !isTransportAndPayloadSuccess(response)) {
        const glErrorMessage = extractResponseMessage(response.body);
        if (
          /\/load\//i.test(effectiveEndpointPath) &&
          (
            /ido not found/i.test(glErrorMessage) ||
            /property .* not found/i.test(glErrorMessage) ||
            /invalid column name/i.test(glErrorMessage)
          )
        ) {
          const candidates = buildGlTransactionCandidatePaths(effectiveEndpointPath);
          for (const candidatePath of candidates) {
            if (candidatePath === effectiveEndpointPath) continue;
            let currentPath = candidatePath;
            let attempts = 0;
            while (currentPath && attempts < 6) {
              attempts += 1;
              const candidateResponse = await callInforIonApi(credentials, currentPath, {
                timeoutMs: requestTimeoutMs,
                headers: req.headers,
              });
              response = candidateResponse;
              effectiveEndpointPath = currentPath;
              if (isTransportAndPayloadSuccess(candidateResponse)) break;

              const retryMessage = extractResponseMessage(candidateResponse.body);
              const missingProperty = parseMissingPropertyFromMessage(retryMessage);
              if (!missingProperty) break;
              const reducedPath = removePropertyFromEndpoint(currentPath, missingProperty);
              if (!reducedPath || reducedPath === currentPath) break;
              currentPath = reducedPath;
            }
            if (isTransportAndPayloadSuccess(response)) break;
          }
        }
      }
      let rawRecords = extractRecords(response.body);
      let pagesFetched = 1;
      let paginationTruncated = false;
      let paginationBookmarkStalled = false;
      const isCsiLoadEndpoint = /\/IDORequestService\/ido\/load\//i.test(effectiveEndpointPath);
      if (isCsiLoadEndpoint && isTransportAndPayloadSuccess(response)) {
        let paginationState = extractPagingState(response.body);
        while (
          paginationState.moreRowsExist &&
          paginationState.bookmark &&
          pagesFetched < maxPagesPerRequest
        ) {
          const priorBookmark = paginationState.bookmark;
          const nextEndpointPath = appendBookmarkToEndpoint(effectiveEndpointPath, priorBookmark);
          const nextResponse = await callInforIonApi(credentials, nextEndpointPath, {
            timeoutMs: requestTimeoutMs,
            headers: req.headers,
          });
          if (!isTransportAndPayloadSuccess(nextResponse)) {
            paginationTruncated = true;
            break;
          }
          const nextRecords = extractRecords(nextResponse.body);
          rawRecords = rawRecords.concat(nextRecords);
          response = nextResponse;
          effectiveEndpointPath = nextEndpointPath;
          pagesFetched += 1;
          paginationState = extractPagingState(nextResponse.body);
          if (
            paginationState.moreRowsExist &&
            paginationState.bookmark &&
            paginationState.bookmark === priorBookmark
          ) {
            paginationBookmarkStalled = true;
            paginationTruncated = true;
            break;
          }
        }
        if (debugSync) {
          console.log(
            JSON.stringify({
              event: 'sync_request_paging_complete',
              syncRunId,
              moduleType,
              programId,
              absoluteProgramOffset,
              reqIndex,
              pagesFetched,
              paginationTruncated,
              rawRecordCount: rawRecords.length,
              elapsedMs: Date.now() - startedAt,
            })
          );
        }
        if (pagesFetched >= maxPagesPerRequest && paginationState.moreRowsExist && paginationState.bookmark) {
          paginationTruncated = true;
          let continuationBookmark: string | null = paginationState.bookmark;
          const isSlInvHdrs = moduleType === 'sales' && String(row.miProgram || '').trim().toUpperCase() === 'SLINVHDRS';
          const shouldForceKeysetContinuation =
            isSlInvHdrs &&
            (
              Boolean(inputKeyset) ||
              (inputBookmark && continuationBookmark && continuationBookmark === inputBookmark)
            );
          if (shouldForceKeysetContinuation) {
            const keysetBookmark = buildSlInvHdrsKeysetBookmarkFromRecords(rawRecords);
            if (keysetBookmark) {
              continuationBookmark = keysetBookmark;
            } else if (inputKeyset && inputBookmark) {
              // Keep keyset mode sticky even on sparse pages.
              continuationBookmark = inputBookmark;
            }
          }
          const isSlCustomers = moduleType === 'customer' && String(row.miProgram || '').trim().toUpperCase() === 'SLCUSTOMERS';
          const shouldForceCustomersKeysetContinuation =
            isSlCustomers &&
            (
              Boolean(inputCustomersKeyset) ||
              (inputBookmark && continuationBookmark && continuationBookmark === inputBookmark)
            );
          if (shouldForceCustomersKeysetContinuation) {
            const keysetBookmark = buildSlCustomersKeysetBookmarkFromRecords(rawRecords);
            if (keysetBookmark) {
              continuationBookmark = keysetBookmark;
            } else if (inputCustomersKeyset && inputBookmark) {
              continuationBookmark = inputBookmark;
            }
          }
          const isSlArtrans = moduleType === 'ar' && String(row.miProgram || '').trim().toUpperCase() === 'SLARTRANS';
          const shouldForceArtransKeysetContinuation =
            isSlArtrans &&
            (
              Boolean(inputArtransKeyset) ||
              (inputBookmark && continuationBookmark && continuationBookmark === inputBookmark)
            );
          if (shouldForceArtransKeysetContinuation) {
            const keysetBookmark = buildSlArtransKeysetBookmarkFromRecords(rawRecords);
            if (keysetBookmark) {
              continuationBookmark = keysetBookmark;
            } else if (inputArtransKeyset && inputBookmark) {
              continuationBookmark = inputBookmark;
            }
          }
          const isSlLedgers = moduleType === 'gl' && String(row.miProgram || '').trim().toUpperCase() === 'SLLEDGERS';
          const shouldForceSlLedgersKeysetContinuation =
            isSlLedgers &&
            (
              paginationBookmarkStalled ||
              Boolean(inputSlLedgersKeyset) ||
              (inputBookmark && continuationBookmark && continuationBookmark === inputBookmark)
            );
          if (shouldForceSlLedgersKeysetContinuation) {
            const keysetBookmark =
              buildSlLedgersKeysetBookmarkFromRecords(rawRecords) ||
              buildSlLedgersKeysetBookmarkFromCsiBookmark(continuationBookmark) ||
              buildSlLedgersKeysetBookmarkFromCsiBookmark(inputBookmark);
            if (keysetBookmark) {
              continuationBookmark = keysetBookmark;
            } else if (inputSlLedgersKeyset && inputBookmark) {
              continuationBookmark = inputBookmark;
            }
          }
          const bookmarkDidNotAdvance =
            Boolean(inputBookmark) &&
            Boolean(continuationBookmark) &&
            continuationBookmark === inputBookmark;
          if (paginationBookmarkStalled && bookmarkDidNotAdvance) {
            // Avoid infinite cursor loops when CSI keeps returning the same bookmark.
            if (nextProgramOffset !== null) {
              continuation = {
                programOffset: nextProgramOffset,
                requestOffset: 0,
                bookmark: null,
              };
            } else {
              continuation = null;
            }
            errors.push(
              `${row.module}/${row.miProgram || row.endpointPath || req.transaction}: CSI pagination bookmark did not advance; skipping continuation for this program to avoid infinite loop.`
            );
          } else {
            continuation = {
              programOffset: absoluteProgramOffset,
              requestOffset: reqIndex,
              bookmark: continuationBookmark,
            };
          }
        }
      }
      // AP SLAptrx* payloads can succeed but return 0 rows on one IDO variant.
      // Probe a short list of safe sibling endpoints and keep the first non-empty result.
      if (
        moduleType === 'ap' &&
        isTransportAndPayloadSuccess(response) &&
        rawRecords.length === 0 &&
        /\/load\/SLAptrxp|\/load\/SLAptrxps|\/load\/SLAptrx/i.test(effectiveEndpointPath)
      ) {
        const candidates = buildApSlaPtrxCandidatePaths(effectiveEndpointPath);
        for (const candidatePath of candidates) {
          if (candidatePath === effectiveEndpointPath) continue;
          const candidateResponse = await callInforIonApi(credentials, candidatePath, {
            timeoutMs: requestTimeoutMs,
            headers: req.headers,
          });
          if (!isTransportAndPayloadSuccess(candidateResponse)) continue;
          const candidateRecords = extractRecords(candidateResponse.body);
          if (candidateRecords.length === 0) continue;
          response = candidateResponse;
          effectiveEndpointPath = candidatePath;
          rawRecords = candidateRecords;
          break;
        }
      }
      const arApFlow = moduleType === 'ar' || moduleType === 'ap' ? classifyArApFlow(moduleType, req.transaction) : null;
      const sitePolicy = resolveSitePolicy(row, moduleType);
      const siteDetected = hasRecordSiteDimension(rawRecords);
      const recordsAfterSiteFilter = filterRecordsBySiteIfSupported(rawRecords, row.site);
      // For daily-overlap syncs only, keep full open-item populations for AR/AP
      // snapshots. Backfill/manual modes must honor the date window so each day
      // is rebuilt from that day slice instead of replaying one global snapshot.
      const isArOpenSnapshotProgram =
        moduleType === 'ar' && String(row.miProgram || '').trim().toUpperCase() === 'SLARTRANS';
      const isArApOpenFlow =
        ((moduleType === 'ar' || moduleType === 'ap') && arApFlow === 'open') || isArOpenSnapshotProgram;
      const keepFullArApPopulation = isArOpenSnapshotProgram || (isArApOpenFlow && syncWindow?.mode === 'daily_overlap');
      // Contract/backlog math from SLCoitems also requires full line populations; clipping
      // to overlap windows can zero out Contract Total for customers with older open orders.
      const isOrderLineProgram = moduleType === 'sales' && programId === 'SLCOITEMS';
      const shouldApplyDateWindow =
        !keepFullArApPopulation && !isOrderLineProgram;
      const recordsAfterDateWindow = shouldApplyDateWindow
        ? filterRecordsByDateWindow(recordsAfterSiteFilter, moduleType, syncWindow)
        : recordsAfterSiteFilter;
      const requestedSite = String(row.site || siteOverride || '').trim();
      const shouldAggregateForRollup =
        !isOrderLineProgram && !requestedSite && siteDetected && (sitePolicy === 'required' || sitePolicy === 'optional');
      const records = shouldAggregateForRollup
        ? aggregateForCompanyRollup(recordsAfterDateWindow, moduleType, arApFlow)
        : recordsAfterDateWindow;
      const payloadOk = isTransportAndPayloadSuccess(response);
      const payloadMsg = extractResponseMessage(response.body) || `HTTP ${response.status}`;
      const optionalProgramMissing = !payloadOk
        ? isOptionalCsiGlSummaryIdoMissing({
            moduleType,
            row,
            endpointPath: effectiveEndpointPath,
            payloadMessage: payloadMsg,
          })
        : false;
      const requestSucceeded = payloadOk || optionalProgramMissing;
      const statusText = requestSucceeded ? 'success' : 'error';

      let moduleRecordsCreated = 0;
      let modulePersistDebug: Record<string, unknown> | null = null;
      if (requestSucceeded) {
        try {
          const salesProgramId = programId;
          if (moduleType === 'sales' && (salesProgramId === 'SLCOS' || salesProgramId === 'SLCOHDRS')) {
            for (const rec of recordsAfterSiteFilter) {
              const coNumRaw = pickString(rec, ['CoNum', 'CONUM', 'coNum', 'orderNo', 'orderNumber', 'OrderNum']);
              if (!coNumRaw) continue;
              const coNum = normalizeOrderJoinKey(coNumRaw);
              if (!coNum) continue;
              const composite = pickString(rec, ['DerCustNoName', 'customerComposite', 'CustNumName']);
              const customerId =
                pickString(rec, ['CustNum', 'custNum', 'CoCustNum', 'CustNo', ...CUSTOMER_ID_KEYS]) ||
                parseCustomerIdFromComposite(composite);
              const customerName =
                pickCustomerDisplayName(rec) ||
                pickString(rec, ['BillToName', 'CustName', 'DerCustName', ...CUSTOMER_NAME_KEYS]) ||
                'Unknown Customer';
              const orderDate = firstRecordDate(rec, ['OrderDate', 'orderDate']);
              orderCustomerLookup.set(coNum, { customerId: customerId || null, customerName, orderDate: orderDate || null });
            }
          }
          switch (moduleType) {
            case 'cash':
              {
                const isHistoricalDailySlice =
                  frequency === 'daily' &&
                  Boolean(options?.snapshotDateOverride);
                const shouldPreserveSliceCashSnapshot = Boolean(options?.preserveCashSnapshot);
                if (isHistoricalDailySlice && !shouldPreserveSliceCashSnapshot) {
                  // SLBankHdrs is snapshot-oriented in this tenant and cannot be
                  // reliably filtered by day. During business-day backfill we
                  // remove per-day cash snapshots to avoid persisting duplicated
                  // "current snapshot" values across historical dates.
                  await prisma.cashSnapshot.deleteMany({
                    where: { companyId, frequency, snapshotDate },
                  });
                  moduleRecordsCreated = 0;
                } else {
                  await prisma.cashSnapshot.deleteMany({
                    where: { companyId, frequency, snapshotDate },
                  });
                  moduleRecordsCreated = await saveCash(companyId, snapshotDate, frequency, records);
                }
              }
              break;
            case 'gl':
              {
                const glProgram = String(row.miProgram || '').trim().toUpperCase();
                if (glProgram === 'SLLEDGERS' || glProgram === 'SLGLTRANS') {
                moduleRecordsCreated = await saveBalanceMovementsFromGl(companyId, frequency, records);
                } else {
                  moduleRecordsCreated = records.length;
                }
              }
              break;
            case 'ar':
              {
                const context = {
                  miProgram: row.miProgram || row.module,
                  transaction: req.transaction,
                  cono: row.cono,
                  divi: row.divi,
                  resetSnapshot: !options?.bookmark,
                };
                if (arApFlow === 'payments') {
                  moduleRecordsCreated = await saveARPayments(companyId, records, context);
                  await upsertArContractSupportTables(companyId, snapshotDate, frequency);
                } else if (arApFlow === 'open') {
                  const openRowsCreated = await saveAROpenInvoices(companyId, snapshotDate, frequency, records, context);
                  const agingRowsCreated = await saveARAging(companyId, snapshotDate, frequency, records);
                  const paymentRowsCreated = await saveARPayments(companyId, records, context);
                  moduleRecordsCreated = openRowsCreated + agingRowsCreated + paymentRowsCreated;
                  await upsertArContractSupportTables(companyId, snapshotDate, frequency);
                } else {
                  moduleRecordsCreated = await saveARAging(companyId, snapshotDate, frequency, records);
                }
              }
              break;
            case 'ap':
              {
                const context = {
                  miProgram: row.miProgram || row.module,
                  transaction: req.transaction,
                  cono: row.cono,
                  divi: row.divi,
                };
                if (arApFlow === 'payments') {
                  moduleRecordsCreated = await saveAPPayments(companyId, records, context);
                } else if (arApFlow === 'open') {
                  const openRowsCreated = await saveAPOpenBills(companyId, snapshotDate, frequency, records, context);
                  const agingRowsCreated = await saveAPAging(companyId, snapshotDate, frequency, records);
                  moduleRecordsCreated = openRowsCreated + agingRowsCreated;
                } else {
                  moduleRecordsCreated = await saveAPAging(companyId, snapshotDate, frequency, records);
                }
              }
              break;
            case 'customer':
              moduleRecordsCreated = await saveCustomerSales(companyId, snapshotDate, frequency, records);
              break;
            case 'sales':
              {
                const context = {
                  miProgram: programId || row.miProgram || row.module,
                  transaction: req.transaction,
                  cono: row.cono,
                  divi: row.divi,
                };
                if (debugSync) {
                  console.log(
                    JSON.stringify({
                      event: 'sync_sales_persist_start',
                      syncRunId,
                      salesProgram: salesProgramId,
                      recordsCount: records.length,
                      recordsAfterDateWindowCount: recordsAfterDateWindow.length,
                      elapsedMs: Date.now() - startedAt,
                    })
                  );
                }
                const salesRowsCreated = await saveProductSales(companyId, snapshotDate, frequency, records);
                if (debugSync) {
                  console.log(
                    JSON.stringify({
                      event: 'sync_sales_productsales_done',
                      syncRunId,
                      salesProgram: salesProgramId,
                      salesRowsCreated,
                      elapsedMs: Date.now() - startedAt,
                    })
                  );
                }
                const salesProgram = salesProgramId;
                let slcosHydrationResult: { loaded: number; message?: string } | null = null;
                if (salesProgram === 'SLCOITEMS') {
                  slcosHydrationResult = await hydrateOrderLookupFromSlCos();
                  if (debugSync) {
                    console.log(
                      JSON.stringify({
                        event: 'sync_sales_slcos_hydration_done',
                        syncRunId,
                        salesProgram,
                        slcosHydrationResult,
                        orderCustomerLookupSize: orderCustomerLookup.size,
                        elapsedMs: Date.now() - startedAt,
                      })
                    );
                  }
                }
                const contractPersistResult =
                  salesProgram === 'SLCOITEMS'
                    ? await saveCustomerOrderLines(companyId, snapshotDate, frequency, recordsAfterDateWindow, {
                        ...context,
                        resetSnapshot: !options?.bookmark,
                        orderCustomerLookup,
                      })
                    : { persisted: 0, debug: null as any };
                if (debugSync) {
                  console.log(
                    JSON.stringify({
                      event: 'sync_sales_customerorderlines_done',
                      syncRunId,
                      salesProgram,
                      contractPersisted: Number(contractPersistResult?.persisted || 0),
                      elapsedMs: Date.now() - startedAt,
                    })
                  );
                }
                const contractRowsCreated = Number(contractPersistResult?.persisted || 0);
                if (salesProgram === 'SLCOITEMS') {
                  modulePersistDebug = {
                    orderCustomerLookupSize: orderCustomerLookup.size,
                    slcosHydration: slcosHydrationResult,
                    slcoitemsPersist: contractPersistResult.debug,
                  };
                }
                if (salesProgram === 'SLCOITEMS') {
                  // Rebuild customer contract status immediately after order-line load
                  // so Contract Total / Invoiced / Remaining stay in sync with sales data.
                  await upsertArContractSupportTables(companyId, snapshotDate, frequency);
                }
                moduleRecordsCreated = salesRowsCreated + contractRowsCreated;
              }
              break;
            case 'inventory':
              moduleRecordsCreated = await saveInventory(companyId, snapshotDate, frequency, records);
              break;
            default:
              moduleRecordsCreated = records.length;
              break;
          }
          if (debugSync) {
            console.log(
              JSON.stringify({
                event: 'sync_request_persist_complete',
                syncRunId,
                moduleType,
                programId,
                absoluteProgramOffset,
                reqIndex,
                moduleRecordsCreated,
                elapsedMs: Date.now() - startedAt,
              })
            );
          }
        } catch (persistError) {
          const message = persistError instanceof Error ? persistError.message : 'Failed to persist records';
          errors.push(
            `${row.module}/${row.miProgram || row.endpointPath || req.transaction}: ${message} (credentials source: ${credentialSource})`
          );
        }
      } else {
        errors.push(
          `${row.module}/${row.miProgram || row.endpointPath || req.transaction}: ${payloadMsg} (credentials source: ${credentialSource})`
        );
      }

      recordsCreated += moduleRecordsCreated;

      try {
        await prisma.apiSyncLog.create({
          data: {
            companyId,
            platform: 'INFOR_M3',
            syncType: `operational_${moduleType}_${req.transaction}`,
            status: statusText,
            recordsImported: moduleRecordsCreated,
            errorCount: statusText === 'success' ? 0 : 1,
            duration: Date.now() - startedAt,
            errorDetails: ({
              syncRunId,
              module: row.module,
              miProgram: row.miProgram || null,
              resolvedProgramId: programId || null,
              absoluteProgramOffset,
              requestIndex: reqIndex,
              transaction: req.transaction,
              cono: row.cono || null,
              divi: row.divi || null,
              mongooseConfig: row.mongooseConfig || null,
              endpointPath: effectiveEndpointPath,
              credentialsSource: credentialSource,
              responseStatus: response.status,
              sitePolicy,
              requestedSite: requestedSite || null,
              siteDetected,
              sourceRecordCount: rawRecords.length,
              postWindowRecordCount: recordsAfterDateWindow.length,
              persistedRecordCount: records.length,
              companyRollupApplied: shouldAggregateForRollup,
              pagesFetched,
              paginationTruncated,
              syncWindow: syncWindow
                ? {
                    mode: syncWindow.mode,
                    startDate: syncWindow.startDate.toISOString(),
                    endDate: syncWindow.endDate.toISOString(),
                  }
                : null,
              optionalProgramSkipped: optionalProgramMissing,
              optionalProgramSkipReason: optionalProgramMissing ? payloadMsg : null,
              persistDebug: modulePersistDebug,
              response: response.body,
            } as unknown as Prisma.InputJsonValue),
          },
        });
      } catch (logWriteError) {
        // Keep the operational sync moving even if telemetry logging fails.
        const logWriteMessage =
          logWriteError instanceof Error ? logWriteError.message : 'Failed to write ApiSyncLog';
        errors.push(`apiSyncLog_write: ${logWriteMessage}`);
        if (debugSync) {
          console.warn(
            JSON.stringify({
              event: 'sync_log_write_failed',
              syncRunId,
              moduleType,
              programId,
              absoluteProgramOffset,
              reqIndex,
              message: logWriteMessage,
            })
          );
        }
      }

      if (continuation) break;
    }
    if (continuation) break;
  }

  if (!continuation && nextProgramOffset !== null) {
    continuation = {
      programOffset: nextProgramOffset,
      requestOffset: 0,
      bookmark: null,
    };
  }

  if (!continuation) {
    // Finalize open-item snapshot after all continuation pages are applied.
    // During continuation accumulation we may temporarily carry zero/negative
    // balances; keep only true open invoices at completion.
    const snapshotDayStart = startOfUtcDay(snapshotDate);
    const snapshotDayEnd = new Date(snapshotDayStart.getTime() + 24 * 60 * 60 * 1000);
    await prisma.aROpenInvoiceSnapshot.deleteMany({
      where: {
        companyId,
        frequency,
        snapshotDate: { gte: snapshotDayStart, lt: snapshotDayEnd },
        amountDueHome: { lte: 0 },
      },
    });
    try {
      const dailySnapshotOutcome = await upsertDailyFinancialSnapshotFromOperationalTables(
        companyId,
        snapshotDate,
        frequency
      );
      if (!dailySnapshotOutcome.written || dailySnapshotOutcome.staleOrMissingSources.length > 0) {
        const staleList = dailySnapshotOutcome.staleOrMissingSources.join(', ') || 'none';
        const message = !dailySnapshotOutcome.written
          ? `Daily financial snapshot skipped: source data stale/missing for target ${dailySnapshotOutcome.targetSnapshotDate}.`
          : `Daily financial snapshot used prior source dates for target ${dailySnapshotOutcome.targetSnapshotDate}.`;
        await prisma.apiSyncLog.create({
          data: {
            companyId,
            platform: 'INFOR_M3',
            syncType: 'operational_data_sync',
            status: 'warning',
            recordsImported: dailySnapshotOutcome.written ? 1 : 0,
            errorCount: 0,
            errorDetails: {
              syncRunId,
              module: 'DAILY_FINANCIAL',
              transaction: 'UPSERT_SNAPSHOT',
              responseMessage: `${message} Sources: ${staleList}.`,
              targetSnapshotDate: dailySnapshotOutcome.targetSnapshotDate,
              staleSources: dailySnapshotOutcome.staleOrMissingSources,
              sourceDates: dailySnapshotOutcome.sourceDates,
              reason: dailySnapshotOutcome.reason || null,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (dailyPersistError) {
      const message =
        dailyPersistError instanceof Error ? dailyPersistError.message : 'Failed to upsert DailyFinancialSnapshot row';
      errors.push(`daily-financial-snapshot: ${message}`);
    }
  }

  if (!options?.skipPrune && !continuation) {
    await pruneCompanyOperationalData(companyId);
  }

  return {
    success: errors.length === 0,
    recordsCreated,
    errors,
    credentialSource,
    hasMore: continuation !== null,
    nextProgramOffset: continuation ? continuation.programOffset : null,
    continuation,
    totalProgramRows,
  };
}
