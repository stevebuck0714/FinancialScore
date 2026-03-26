import prisma from '@/lib/prisma';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

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
  skipPrune?: boolean;
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
    miProgram: 'SLCharts',
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLCharts?recordCap=1000',
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
          acc.quantity =
            Number(acc.quantity || 0) + pickNumber(record, ['quantity', 'qty', 'QTY', 'quantitySold', 'QtyPackages', 'InvSeq']);
          acc.revenue = Number(acc.revenue || 0) + pickNumber(record, ['revenue', 'amount', 'salesAmount', 'NETA', 'Amount', 'Price', 'ExtPrice']);
          acc.cogs = Number(acc.cogs || 0) + pickNumber(record, ['cogs', 'costOfGoods', 'COGS', 'Cost', 'UnitCost']);
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
    params.set('recordCap', '250');
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
const SL_COITEMS_SAFE_PROPERTIES = ['CoNum', 'CoLine', 'CoRelease', 'Item', 'Stat', 'Price', 'QtyOrdered', 'QtyShipped', 'InvNum', 'Whse', 'DueDate'];
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

function resolveSlCoitemsSafePath(endpointPath: string): string | null {
  if (!/\/load\/SLCoitems/i.test(endpointPath)) return null;
  return ensureCsiProperties(endpointPath, SL_COITEMS_SAFE_PROPERTIES);
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

function parseCustomerNameFromComposite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const splitToken = ' - ';
  const splitIndex = trimmed.indexOf(splitToken);
  if (splitIndex === -1) return null;
  const namePortion = trimmed.slice(splitIndex + splitToken.length).trim();
  return namePortion || null;
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
    sales: ['InvDate', 'invoiceDate', 'DueDate', 'dueDate', 'ShipDate', 'RecordDate', 'date'],
    inventory: ['ItemChangeDate', 'ChangeDate', 'RecordDate', 'SSDATE', 'date'],
  };
  const keys = dateKeysByModule[moduleType] || [];
  if (keys.length === 0) return records;

  // Keep records lacking any parseable date to avoid dropping valid rows from sparse payloads.
  return records.filter((record) => {
    const date = firstRecordDate(record, keys);
    if (!date) return true;
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
      qbAccountClassification: { in: ['A', 'Asset', 'ASSET', 'asset', 'L', 'Liability', 'LIABILITY', 'liability'] },
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
      const key = `${snapshotDate.toISOString()}|${targetField}|${sourceAccountName}`;
      if (!movementByKey.has(key)) {
        movementByKey.set(key, { snapshotDate, sourceAccountName, sourceAccountId, amount: 0, targetField });
      }
      const acc = movementByKey.get(key)!;
      acc.amount += amount;
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
  context: { miProgram: string; transaction: string; cono?: string; divi?: string }
): Promise<number> {
  await prisma.aROpenInvoiceSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });

  const rawRows = records
    .map((record, idx) => {
      const customerName = pickCustomerDisplayName(record) || `Unknown Customer ${idx + 1}`;
      const invoiceNo = pickString(record, AR_INVOICE_NO_KEYS) || `UNKNOWN-${idx + 1}`;
      const amountDueHome = pickNumber(record, AR_AMOUNT_DUE_KEYS);
      return {
        companyId,
        snapshotDate,
        frequency,
        customerId: pickString(record, CUSTOMER_ID_KEYS),
        customerName,
        invoiceNo,
        invoiceDate: parseMaybeDate(pickString(record, ['invoiceDate', 'date', 'InvDate', 'IVDT'])),
        dueDate: parseMaybeDate(pickString(record, ['dueDate', 'DUDT'])),
        status: pickString(record, ['status', 'STAT', 'Type']),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        amountCurrency: pickNumber(record, AR_AMOUNT_CURRENCY_KEYS) || null,
        amountHome: pickNumber(record, AR_AMOUNT_HOME_KEYS) || null,
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
    .filter((row) => row.customerName && row.invoiceNo && Number.isFinite(row.amountDueHome));

  // CSI AR payloads can contain multiple lines for the same invoice/customer.
  // Merge them before insert to avoid unique key collisions on snapshot rows.
  const deduped = new Map<string, (typeof rawRows)[number]>();
  for (const row of rawRows) {
    const key = `${row.companyId}|${row.frequency}|${row.snapshotDate.toISOString()}|${row.invoiceNo}|${row.customerName}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...row });
      continue;
    }

    existing.amountCurrency = (existing.amountCurrency || 0) + (row.amountCurrency || 0);
    existing.amountHome = (existing.amountHome || 0) + (row.amountHome || 0);
    existing.amountDueHome = (existing.amountDueHome || 0) + (row.amountDueHome || 0);
    existing.current = (existing.current || 0) + (row.current || 0);
    existing.days1to30 = (existing.days1to30 || 0) + (row.days1to30 || 0);
    existing.days31to60 = (existing.days31to60 || 0) + (row.days31to60 || 0);
    existing.days61to90 = (existing.days61to90 || 0) + (row.days61to90 || 0);
    existing.days90plus = (existing.days90plus || 0) + (row.days90plus || 0);
    existing.customerId = existing.customerId || row.customerId;
    existing.invoiceDate = existing.invoiceDate || row.invoiceDate;
    existing.dueDate = existing.dueDate || row.dueDate;
    existing.status = existing.status || row.status;
    existing.currencyCode = existing.currencyCode || row.currencyCode;
  }

  const rows = Array.from(deduped.values()).filter((row) => Number.isFinite(row.amountDueHome));
  if (!rows.length) return 0;
  await prisma.aROpenInvoiceSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveARPayments(
  companyId: string,
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string; divi?: string }
): Promise<number> {
  const isPaymentLikeRecord = (record: Record<string, unknown>): boolean => {
    const typeToken = normalizeToken(record['Type']);
    if (typeToken === 'p') return true;
    const ref = (pickString(record, ['Ref', 'reference']) || '').trim().toUpperCase();
    if (ref.startsWith('ARP')) return true;
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
      return {
        companyId,
        paymentDate,
        customerId: pickString(record, CUSTOMER_ID_KEYS),
        customerName,
        invoiceNo: pickString(record, ['DerApplyToInvNum', 'ApplyToInvNum', ...AR_INVOICE_NO_KEYS]),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        paidAmountCurrency: pickNumber(record, ['DerPaymentCheckAmount', 'paidAmountCurrency', ...AR_AMOUNT_CURRENCY_KEYS]) || null,
        paidAmountHome: pickNumber(record, ['DerPaymentCheckAmount', 'paidAmountHome', 'paidAmount', 'amount', 'ACAM', 'PYAM', 'Amount']),
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row && Number.isFinite(row.paidAmountHome));

  if (!rows.length) return 0;
  await prisma.aRPaymentFact.createMany({ data: rows });
  return rows.length;
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
  const rows = records
    .map((record) => {
      const quantitySold = pickNumber(record, ['quantity', 'qty', 'QTY', 'quantitySold', 'QtyPackages', 'InvSeq']);
      const revenue = pickNumber(record, ['revenue', 'amount', 'salesAmount', 'NETA', 'Amount', 'Price', 'ExtPrice']);
      const cogs = pickNumber(record, ['cogs', 'costOfGoods', 'COGS', 'Cost', 'UnitCost']);
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

async function upsertDailyFinancialSnapshotFromOperationalTables(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly'
): Promise<void> {
  const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
  if (!dailySnapshotDelegate) return;

  const [cashAgg, inventoryAgg, productAgg, arSnapshot, apSnapshot] = await Promise.all([
    prisma.cashSnapshot.aggregate({
      where: { companyId, snapshotDate, frequency },
      _sum: { cashBalance: true },
    }),
    prisma.inventorySnapshot.aggregate({
      where: { companyId, snapshotDate, frequency },
      _sum: { assetValue: true },
    }),
    prisma.productSalesSnapshot.aggregate({
      where: { companyId, snapshotDate, frequency },
      _sum: { revenue: true, cogs: true },
    }),
    prisma.aRAgingSnapshot.findUnique({
      where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
      select: { totalAR: true },
    }),
    prisma.aPAgingSnapshot.findUnique({
      where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
      select: { totalAP: true },
    }),
  ]);

  const cash = Number(cashAgg?._sum?.cashBalance || 0);
  const inventory = Number(inventoryAgg?._sum?.assetValue || 0);
  const revenue = Number(productAgg?._sum?.revenue || 0);
  const cogsTotal = Number(productAgg?._sum?.cogs || 0);
  const ar = Number(arSnapshot?.totalAR || 0);
  const ap = Number(apSnapshot?.totalAP || 0);
  const tca = cash + ar + inventory;
  const totalAssets = tca;
  const totalLiab = ap;
  const totalEquity = totalAssets - totalLiab;
  const totalLAndE = totalLiab + totalEquity;

  const payload = {
    companyId,
    snapshotDate,
    frequency,
    sourcePlatform: 'INFOR_M3',
    revenue,
    cogsTotal,
    expense: cogsTotal,
    cash,
    ar,
    inventory,
    tca,
    totalAssets,
    ap,
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
}

export async function syncInforM3OperationalData(
  companyId: string,
  frequency: 'daily' | 'weekly' | 'monthly' = 'daily',
  siteOverride?: string,
  syncWindow?: SyncWindow,
  options?: SyncOptions
): Promise<InforOperationalSyncResult> {
  const errors: string[] = [];
  let recordsCreated = 0;
  const snapshotDate = options?.snapshotDateOverride ? new Date(options.snapshotDateOverride) : new Date();
  snapshotDate.setHours(0, 0, 0, 0);

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

  const parsedProgramRows = parsePrograms(programsBySystem[inforSystem] ?? metadata.accountingPrograms).filter(
    (row) => row.module.trim().toLowerCase() !== 'accounts'
  );
  const programRows = parsedProgramRows.length > 0 ? parsedProgramRows : DEFAULT_CSI_PROGRAM_ROWS;
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
      const requestTimeoutMs = moduleType === 'inventory' ? 120000 : 30000;
      const sourceWindowPathResult = applyCsiSourceWindowAndSort(req.endpointPath, row, moduleType, syncWindow);
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
        const isSlInvHdrs = moduleType === 'sales' && String(row.miProgram || '').trim().toUpperCase() === 'SLINVHDRS';
        const isSlCustomers = moduleType === 'customer' && String(row.miProgram || '').trim().toUpperCase() === 'SLCUSTOMERS';
        const isSlArtrans = moduleType === 'ar' && String(row.miProgram || '').trim().toUpperCase() === 'SLARTRANS';
        const isSlLedgers = moduleType === 'gl' && String(row.miProgram || '').trim().toUpperCase() === 'SLLEDGERS';
        if (isSlInvHdrs && inputKeyset) {
          initialEndpointPath = applySlInvHdrsKeysetCursor(sourceWindowBaseEndpointPath, inputKeyset);
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

      let effectiveEndpointPath = initialEndpointPath;
      let response = await callInforIonApi(credentials, initialEndpointPath, {
        timeoutMs: requestTimeoutMs,
        headers: req.headers,
      });
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
        /\/load\/SLCoitems/i.test(req.endpointPath) &&
        /invalid column name 'contract_price_method'/i.test(initialMessage)
      ) {
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
          pagesFetched < MAX_CSI_PAGES_PER_REQUEST
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
        if (pagesFetched >= MAX_CSI_PAGES_PER_REQUEST && paginationState.moreRowsExist && paginationState.bookmark) {
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
      // For daily overlap syncs, keep full open-item populations for AR/AP aging snapshots.
      // A strict rolling date window on invoice dates can hide older but still-open receivables/payables.
      const isArApOpenFlow = (moduleType === 'ar' || moduleType === 'ap') && arApFlow === 'open';
      const shouldApplyDateWindow = !isArApOpenFlow || syncWindow?.mode !== 'daily_overlap';
      const recordsAfterDateWindow = shouldApplyDateWindow
        ? filterRecordsByDateWindow(recordsAfterSiteFilter, moduleType, syncWindow)
        : recordsAfterSiteFilter;
      const requestedSite = String(row.site || siteOverride || '').trim();
      const shouldAggregateForRollup =
        !requestedSite && siteDetected && (sitePolicy === 'required' || sitePolicy === 'optional');
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
      if (requestSucceeded) {
        try {
          switch (moduleType) {
            case 'cash':
              {
                const isHistoricalDailySlice =
                  frequency === 'daily' &&
                  Boolean(options?.snapshotDateOverride);
                if (isHistoricalDailySlice) {
                  // SLBankHdrs is snapshot-oriented in this tenant and cannot be
                  // reliably filtered by day. During business-day backfill we
                  // remove per-day cash snapshots to avoid persisting duplicated
                  // "current snapshot" values across historical dates.
                  await prisma.cashSnapshot.deleteMany({
                    where: { companyId, frequency, snapshotDate },
                  });
                  moduleRecordsCreated = 0;
                } else {
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
                };
                if (arApFlow === 'payments') {
                  moduleRecordsCreated = await saveARPayments(companyId, records, context);
                } else if (arApFlow === 'open') {
                  const openRowsCreated = await saveAROpenInvoices(companyId, snapshotDate, frequency, records, context);
                  const agingRowsCreated = await saveARAging(companyId, snapshotDate, frequency, records);
                  moduleRecordsCreated = openRowsCreated + agingRowsCreated;
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
              moduleRecordsCreated = await saveProductSales(companyId, snapshotDate, frequency, records);
              break;
            case 'inventory':
              moduleRecordsCreated = await saveInventory(companyId, snapshotDate, frequency, records);
              break;
            default:
              moduleRecordsCreated = records.length;
              break;
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

      await prisma.apiSyncLog.create({
        data: {
          companyId,
          platform: 'INFOR_M3',
          syncType: `operational_${moduleType}_${req.transaction}`,
          status: statusText,
          recordsImported: moduleRecordsCreated,
          errorCount: statusText === 'success' ? 0 : 1,
          duration: Date.now() - startedAt,
          errorDetails: {
            module: row.module,
            miProgram: row.miProgram || null,
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
            response: response.body,
          },
        },
      });

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
    try {
      await upsertDailyFinancialSnapshotFromOperationalTables(companyId, snapshotDate, frequency);
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
