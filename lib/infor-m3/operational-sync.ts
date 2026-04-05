import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import { createHash, randomUUID } from 'node:crypto';

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
    programEndOffset?: number;
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
  businessDayFanout?: boolean;
  arOnlyBackfill?: boolean;
  skipDailySnapshotHydration?: boolean;
  programOffset?: number;
  programLimit?: number;
  programEndOffset?: number;
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
    miProgram: 'SLCustDrfts',
    endpointPath:
      '/APR_PRD/CSI/IDORequestService/ido/load/SLCustDrfts?properties=CustNum,InvNum,InvDate,DueDate,DomAmt,BalDue,CurrCode,RecordDate&recordCap=1000',
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
    endpointPath: '/APR_PRD/CSI/IDORequestService/ido/load/SLChartAccts?properties=Acct,Description,Type,Category&recordCap=1000',
    mongooseConfig: 'TMSManager',
    site: '',
    transactions: ['CSI_LOAD'],
    enabled: true,
  },
  {
    module: 'GL',
    miProgram: 'SLGLTRANS',
    endpointPath:
      '/APR_PRD/CSI/IDORequestService/ido/load/SLGLTRANS?properties=*&recordCap=1000',
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

type CsiFinancialIdoContract = {
  glTransactionIdo?: string | null;
  accountMasterIdo?: string | null;
  periodBalanceIdo?: string | null;
};

function normalizeIdoName(value: unknown): string {
  return String(value || '').trim();
}

function applyCsiFinancialIdoContract(
  rows: InforProgramRow[],
  contract: CsiFinancialIdoContract | null
): InforProgramRow[] {
  if (!contract) return rows;
  const glTransactionIdo = normalizeIdoName(contract.glTransactionIdo);
  const accountMasterIdo = normalizeIdoName(contract.accountMasterIdo);
  const periodBalanceIdo = normalizeIdoName(contract.periodBalanceIdo);
  if (!glTransactionIdo && !accountMasterIdo && !periodBalanceIdo) return rows;

  return rows.map((row) => {
    const currentProgram = String(row.miProgram || '').trim().toUpperCase();
    const [pathOnly, queryString = ''] = String(row.endpointPath || '').trim().split('?');
    const isCsiLoadPath = /\/ido\/load\//i.test(pathOnly);
    if (!isCsiLoadPath) return row;

    const rewriteIdoPath = (nextIdo: string): string => {
      const normalizedPath = pathOnly.replace(/\/ido\/load\/[^/?]+/i, `/ido/load/${nextIdo}`);
      return queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
    };

    if (glTransactionIdo && (currentProgram === 'SLGLTRANS' || currentProgram === 'SLGLTRN' || currentProgram === 'SLGLTRAN')) {
      return {
        ...row,
        miProgram: glTransactionIdo,
        endpointPath: rewriteIdoPath(glTransactionIdo),
      };
    }
    if (accountMasterIdo && GL_ACCOUNT_MASTER_PROGRAM_IDS.has(currentProgram)) {
      return {
        ...row,
        miProgram: accountMasterIdo,
        endpointPath: rewriteIdoPath(accountMasterIdo),
      };
    }
    if (periodBalanceIdo && currentProgram === 'GLACCTPERIODBALANCES') {
      return {
        ...row,
        miProgram: periodBalanceIdo,
        endpointPath: rewriteIdoPath(periodBalanceIdo),
      };
    }
    return row;
  });
}

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
const SITE_OPTIONAL_CSI_IDOS = new Set([
  'SLITEMS',
  'SLARTRANS',
  'SLCUSTDRFTS',
  'SLAPTRX',
  'SLAPTRXP',
  'SLAPTRXPS',
  'SLAPTRXS',
  'SLCUSTOMERS',
  'SLVENDORS',
]);

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
    const miProgram = miProgramRaw;
    const transactions = normalizeTransactions(row);
    const cono = typeof row?.cono === 'string' ? row.cono.trim() : '';
    const divi = typeof row?.divi === 'string' ? row.divi.trim() : '';
    const endpointPathRaw = typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '';
    const endpointPath = endpointPathRaw;
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

function buildGlAcctPeriodBalancesWindowFilter(window?: SyncWindow, site?: string): string | null {
  if (!window) return null;
  const startYear = window.startDate.getUTCFullYear();
  const startPeriod = window.startDate.getUTCMonth() + 1;
  const endYear = window.endDate.getUTCFullYear();
  const endPeriod = window.endDate.getUTCMonth() + 1;

  const periodClauses: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const periodStart = year === startYear ? startPeriod : 1;
    const periodEnd = year === endYear ? endPeriod : 12;
    for (let period = periodStart; period <= periodEnd; period += 1) {
      periodClauses.push(`(FiscalYear='${year}' and FiscalPeriod='${period}')`);
    }
  }
  if (periodClauses.length === 0) return null;
  const clauses: string[] = [`(${periodClauses.join(' or ')})`];
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
  const collectibleStartDate = new Date(
    startOfUtcDay(window.endDate).getTime() - AR_EOD_COLLECTIBLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const collectibleStart = formatCsiDateLiteral(collectibleStartDate);
  const end = formatCsiDateLiteral(window.endDate);
  const clauses = [`(RecordDate <= '${end}')`, `(InvDate >= '${collectibleStart}')`];
  const siteValue = String(site || '').trim();
  if (siteValue) {
    const safeSite = siteValue.replace(/'/g, "''");
    clauses.unshift(`Site='${safeSite}'`);
  }
  return `(${clauses.join(' and ')})`;
}

function buildSlCustDrftsAsOfFilter(window?: SyncWindow, site?: string): string | null {
  if (!window) return null;
  const end = formatCsiDateLiteral(window.endDate);
  const clauses = [`(InvDate <= '${end}')`];
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
  if (moduleType === 'gl' && ido === 'GLACCTPERIODBALANCES') {
    const filter = buildGlAcctPeriodBalancesWindowFilter(window, row.site);
    if (!filter) return { endpointPath, applied: false };
    params.set('filter', filter);
    params.set('recordCap', '1000');
    if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'FiscalYear desc, FiscalPeriod desc, Acct asc');
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
  if (moduleType === 'ar' && ido === 'SLCUSTDRFTS') {
    if (window && window.mode !== 'daily_overlap') {
      const asOfFilter = buildSlCustDrftsAsOfFilter(window, row.site);
      if (asOfFilter) params.set('filter', asOfFilter);
    }
    params.set('recordCap', '1000');
    if (!params.get('orderby') && !params.get('orderBy')) params.set('orderby', 'CustNum asc, InvNum asc');
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
const AR_EOD_COLLECTIBLE_LOOKBACK_DAYS = 180;

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
  const msg = params.payloadMessage.trim().toLowerCase();
  const program = String(params.row.miProgram || '').trim().toUpperCase();
  const endpoint = params.endpointPath.toLowerCase();

  // Optional GL summary IDOs can be absent on some tenants.
  if (params.moduleType === 'gl') {
    if (!msg.includes('ido not found')) return false;
    if (program && OPTIONAL_CSI_GL_SUMMARY_PROGRAMS.has(program)) return true;
    return (
      endpoint.includes('/load/glacctperiodbalances') ||
      endpoint.includes('/load/slglacctperiodbalances') ||
      endpoint.includes('/load/glaccountbalances') ||
      endpoint.includes('/load/glledgerperiods') ||
      endpoint.includes('/load/slglledgerperiods') ||
      endpoint.includes('/load/ledgerbalances')
    );
  }

  // SLCustDrfts is optional. Property variance by tenant (e.g., BalDue missing)
  // should not fail the whole AR chunk/run.
  if (params.moduleType === 'ar') {
    const isSlCustDrftsProgram = program === 'SLCUSTDRFTS' || endpoint.includes('/load/slcustdrfts');
    if (!isSlCustDrftsProgram) return false;
    const propertyMissing = msg.includes('property') && msg.includes('not found');
    return propertyMissing;
  }

  return false;
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

function resolveRawCompletenessSourceKey(
  moduleType: 'cash' | 'ar' | 'ap' | 'customer' | 'sales' | 'inventory' | 'gl' | 'other'
): 'cash' | 'inventory' | 'sales' | 'ar' | 'ap' | null {
  if (moduleType === 'cash') return 'cash';
  if (moduleType === 'inventory') return 'inventory';
  if (moduleType === 'sales' || moduleType === 'customer') return 'sales';
  if (moduleType === 'ar') return 'ar';
  if (moduleType === 'ap') return 'ap';
  return null;
}

function resolveRawSourceRecordId(record: Record<string, unknown>): string | null {
  const candidates = [
    'RowPointer',
    'rowPointer',
    'ID',
    'id',
    'TransNum',
    'transNum',
    'InvNum',
    'invNum',
    'CoNum',
    'coNum',
    'Voucher',
    'voucher',
  ];
  for (const key of candidates) {
    const value = record[key];
    const token = String(value || '').trim();
    if (token) return token.slice(0, 255);
  }
  return null;
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
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const wrapped = value as Record<string, unknown>;
    if ('value' in wrapped) return asString(wrapped.value);
    if ('Value' in wrapped) return asString(wrapped.Value);
  }
  if (typeof value === 'string') {
    const v = value.trim();
    return v.length > 0 ? v : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNumber(value: unknown): number {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const wrapped = value as Record<string, unknown>;
    if ('value' in wrapped) return toNumber(wrapped.value);
    if ('Value' in wrapped) return toNumber(wrapped.Value);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function lookupRecordValue(record: Record<string, unknown>, key: string): unknown {
  if (key in record) return record[key];
  const target = key.toLowerCase();
  const directKey = Object.keys(record).find((entry) => entry.toLowerCase() === target);
  if (directKey) return record[directKey];
  // Some IDO payloads can return name/value property arrays.
  const propsCandidate =
    (record as any).Properties ||
    (record as any).properties ||
    (record as any).PropertyValues ||
    (record as any).propertyValues;
  if (Array.isArray(propsCandidate)) {
    for (const prop of propsCandidate) {
      if (!prop || typeof prop !== 'object') continue;
      const property = prop as Record<string, unknown>;
      const name = asString(property.Name) || asString(property.name) || asString(property.Property) || asString(property.property);
      if (!name || name.toLowerCase() !== target) continue;
      if ('Value' in property) return property.Value;
      if ('value' in property) return property.value;
      return null;
    }
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = lookupRecordValue(record, key);
    if (raw !== undefined) {
      const value = toNumber(raw);
      if (value !== 0) return value;
    }
  }
  return 0;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const raw = lookupRecordValue(record, key);
    if (raw !== undefined) {
      const value = asString(raw);
      if (value) return value;
    }
  }
  return null;
}

const CUSTOMER_NAME_KEYS = ['customerName', 'name', 'Name', 'CUNM', 'customer'];
const CUSTOMER_ID_KEYS = ['customerId', 'CustNum', 'CUNO', 'customerNumber', 'customerNo'];
const VENDOR_NAME_KEYS = [
  'vendorName',
  'name',
  'Name',
  'VendName',
  'VendaddrName',
  'UbVendName',
  'VadName',
  'SUNM',
  'vendor',
  'supplier',
];
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
  'BalDue',
];
const AR_AMOUNT_HOME_KEYS = ['amountHome', 'homeAmount', 'Amount', 'ACAM', 'CUAM', 'DomAmt'];
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
  'BalDue',
  'DomAmt',
  'amountHome',
  'homeAmount',
  'Amount',
];
const AR_REDUCTION_AMOUNT_HOME_KEYS = [
  'DerPaymentCheckAmount',
  'paidAmountHome',
  'paidAmount',
  'PYAM',
  'ACAM',
  'CUAM',
  'Amount',
  'DomAmt',
  'amountHome',
  'homeAmount',
];
const AR_CHARGE_AMOUNT_CURRENCY_KEYS = ['amountCurrency', 'invoiceAmount', 'CUAM', 'Amount'];
const AR_REDUCTION_AMOUNT_CURRENCY_KEYS = ['DerPaymentCheckAmount', 'paidAmount', 'amountCurrency', 'PYAM', 'CUAM', 'Amount'];
const GL_ACCOUNT_MASTER_PROGRAM_IDS = new Set(['SLCHARTACCTS', 'SLCHARTOFACCOUNTS', 'SLGLACCOUNTS', 'SLACCT']);
type GlAccountMasterEntry = {
  accountId: string;
  accountName: string | null;
  accountType: string | null;
  accountCategory: string | null;
};
const normalizeGlAccountKey = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.]+/g, '');
const isGenericAccountLabel = (label: string | null, accountId: string | null): boolean => {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized) return false;
  const compact = normalized.replace(/\s+/g, ' ');
  if (/^account\s+[a-z0-9_-]+$/i.test(compact)) return true;
  const accountToken = String(accountId || '').trim().toLowerCase();
  return Boolean(accountToken) && compact === `account ${accountToken}`;
};
const parseGlAccountMasterEntry = (record: Record<string, unknown>): GlAccountMasterEntry | null => {
  const accountId =
    pickString(record, ['Acct', 'AcctNum', 'Account', 'AccountNo', 'GLAccount', 'ACNO', 'ACID']) ||
    pickString(record, ['accountId', 'accountCode', 'accountNumber']);
  if (!accountId) return null;
  const accountName =
    pickString(record, ['Description', 'AcctDesc', 'Name', 'accountName', 'description', 'name', 'ACNM']) || null;
  const accountType =
    pickString(record, ['Type', 'AcctType', 'AccountType', 'classification', 'type', 'NormalBalance']) || null;
  const accountCategory =
    pickString(record, ['Category', 'AcctClass', 'AccountClass', 'Class', 'category', 'class']) || null;
  return {
    accountId,
    accountName,
    accountType,
    accountCategory,
  };
};
const extractSignedGlAmount = (
  record: Record<string, unknown>
): { signedAmount: number; debitAmount: number; creditAmount: number; drCrToken: string } => {
  const drCrToken =
    normalizeToken(record['DrCr']) ||
    normalizeToken(record['drCr']) ||
    normalizeToken(record['drcr']) ||
    '';
  const debitAmount = pickNumber(record, ['DerDomAmountDebit', 'DomAmountDebit', 'Debit', 'debit']);
  const creditAmount = pickNumber(record, ['DerDomAmountCredit', 'DomAmountCredit', 'Credit', 'credit']);
  const explicitSigned = pickNumber(record, ['DomAmount', 'DerSumDomAmount', 'domAmount']);
  const unsignedAmount = pickNumber(record, ['Amount', 'amount', 'ForAmount', 'forAmount']);
  const signedAmount = (() => {
    if (Number.isFinite(explicitSigned) && explicitSigned !== 0) return explicitSigned;
    if (
      (Number.isFinite(debitAmount) && debitAmount !== 0) ||
      (Number.isFinite(creditAmount) && creditAmount !== 0)
    ) {
      return debitAmount - creditAmount;
    }
    if (!Number.isFinite(unsignedAmount) || unsignedAmount === 0) return 0;
    if (drCrToken.startsWith('c')) return -Math.abs(unsignedAmount);
    if (drCrToken.startsWith('d')) return Math.abs(unsignedAmount);
    return unsignedAmount;
  })();
  return {
    signedAmount,
    debitAmount,
    creditAmount,
    drCrToken,
  };
};

function parseBooleanToken(value: unknown): boolean | null {
  const token = normalizeToken(value);
  if (!token) return null;
  if (['1', 'true', 't', 'yes', 'y', 'posted', 'post', 'closed', 'final'].includes(token)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'unposted', 'open', 'draft'].includes(token)) return false;
  return null;
}

function shouldIncludePostedGlRecord(record: Record<string, unknown>): boolean {
  const posted = parseBooleanToken(
    pickString(record, ['Posted', 'posted', 'IsPosted', 'isPosted', 'PostFlag', 'postFlag'])
  );
  if (posted === false) return false;
  const inWorkflow = parseBooleanToken(
    pickString(record, ['InWorkflow', 'inWorkflow', 'Workflow', 'workflow'])
  );
  if (inWorkflow === true) return false;
  return true;
}

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
  const transactionalModules = new Set<ReturnType<typeof classifyModule>>(['ar', 'ap', 'sales', 'inventory', 'gl']);
  if (!transactionalModules.has(moduleType)) return records;

  const dateKeysByModule: Record<string, string[]> = {
    ar: ['InvDate', 'invoiceDate', 'DueDate', 'dueDate', 'RecordDate', 'date'],
    ap: ['InvDate', 'invoiceDate', 'DistDate', 'DueDate', 'dueDate', 'RecordDate', 'date'],
    sales: ['OrderDate', 'orderDate', 'InvDate', 'invoiceDate', 'DueDate', 'dueDate', 'ShipDate', 'RecordDate', 'date'],
    inventory: ['ItemChangeDate', 'ChangeDate', 'RecordDate', 'SSDATE', 'date'],
    gl: ['TransDate', 'transDate', 'RecordDate', 'date'],
  };
  const keys = dateKeysByModule[moduleType] || [];
  if (keys.length === 0) return records;

  const isPeriodWithinWindow = (record: Record<string, unknown>): boolean | null => {
    if (moduleType !== 'gl') return null;
    const fiscalYear = Number(
      pickString(record, ['FiscalYear', 'fiscalYear', 'ControlYear', 'controlYear']) || NaN
    );
    const fiscalPeriod = Number(
      pickString(record, ['FiscalPeriod', 'fiscalPeriod', 'ControlPeriod', 'controlPeriod']) || NaN
    );
    if (!Number.isFinite(fiscalYear) || !Number.isFinite(fiscalPeriod)) return null;
    if (fiscalPeriod < 1 || fiscalPeriod > 12) return null;
    const rowMonth = Date.UTC(Math.floor(fiscalYear), Math.floor(fiscalPeriod) - 1, 1);
    const startMonth = Date.UTC(window.startDate.getUTCFullYear(), window.startDate.getUTCMonth(), 1);
    const endMonth = Date.UTC(window.endDate.getUTCFullYear(), window.endDate.getUTCMonth(), 1);
    return rowMonth >= startMonth && rowMonth <= endMonth;
  };

  // Keep records lacking any parseable date to avoid dropping valid rows from sparse payloads.
  return records.filter((record) => {
    const date = firstRecordDate(record, keys);
    const periodMatch = isPeriodWithinWindow(record);
    if (!date && periodMatch !== null) return periodMatch;
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
  const glFactDelegate = (prisma as any).gLTransactionFact;

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
    glFactDelegate?.deleteMany ? glFactDelegate.deleteMany({ where: { companyId, transDate: { lt: cutoff } } }) : Promise.resolve(),
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

async function saveGLTransactionFacts(
  companyId: string,
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string | null; divi?: string | null },
  glAccountMasterById?: Map<string, GlAccountMasterEntry>
): Promise<number> {
  if (records.length === 0) return 0;
  const rowsRaw = records
    .map((record) => {
      if (!shouldIncludePostedGlRecord(record)) return null;
      // Financial fact date must use accounting effective date only.
      const transDate = parseMaybeDate(pickString(record, ['TransDate', 'transDate']));
      const accountId =
        pickString(record, ['Acct', 'AcctNum', 'Account', 'AccountNo', 'GLAccount', 'ACNO', 'ACID']) ||
        pickString(record, ['accountId', 'accountCode', 'accountNumber']);
      if (!transDate || !accountId) return null;
      const { signedAmount, debitAmount, creditAmount, drCrToken } = extractSignedGlAmount(record);
      if (!Number.isFinite(signedAmount) || signedAmount === 0) return null;
      const accountMaster = glAccountMasterById?.get(normalizeGlAccountKey(accountId));
      return {
        companyId,
        transDate,
        accountId: String(accountId),
        accountName:
          pickString(record, ['ChaDescription', 'ChtDescription', 'Description', 'AcctDesc', 'accountName', 'name']) ||
          accountMaster?.accountName ||
          null,
        accountType: accountMaster?.accountType || null,
        accountCategory: accountMaster?.accountCategory || null,
        signedAmount,
        debitAmount: Number.isFinite(debitAmount) && debitAmount !== 0 ? debitAmount : null,
        creditAmount: Number.isFinite(creditAmount) && creditAmount !== 0 ? creditAmount : null,
        drCr: drCrToken || null,
        transNum: pickString(record, ['TransNum', 'transNum']) || null,
        ref: pickString(record, ['Ref', 'ref', 'reference']) || null,
        description: pickString(record, ['Description', 'description', 'TransDesc']) || null,
        site: pickString(record, ['Site', 'site']) || null,
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram || null,
        sourceTransaction: context.transaction || null,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
  if (rowsRaw.length === 0) return 0;
  // In-run de-duplication guardrail.
  const dedupedRows = new Map<string, Record<string, unknown>>();
  for (const row of rowsRaw) {
    const transDate =
      row.transDate instanceof Date ? row.transDate.toISOString() : String(row.transDate || '');
    const key = [
      String(row.companyId || companyId).trim(),
      transDate,
      String(row.accountId || '').trim(),
      String(row.transNum || '').trim(),
      String(row.ref || '').trim(),
      String(row.description || '').trim(),
      String(Number(row.signedAmount || 0)),
      String(Number(row.debitAmount || 0)),
      String(Number(row.creditAmount || 0)),
    ].join('|');
    if (!dedupedRows.has(key)) dedupedRows.set(key, row);
  }
  const rows = Array.from(dedupedRows.values());
  if (rows.length === 0) return 0;
  // Runtime safety fallback: some Prisma client builds in this environment do not
  // expose the GLTransactionFact delegate. Insert via SQL so SLGLTRANS ingestion
  // still persists raw ledger facts.
  const sqlRows = rows.map((row) => ({
    id: randomUUID(),
    companyId: String(row.companyId || companyId),
    transDate: row.transDate instanceof Date ? row.transDate.toISOString() : String(row.transDate || ''),
    accountId: String(row.accountId || ''),
    accountName: row.accountName == null ? null : String(row.accountName),
    accountType: row.accountType == null ? null : String(row.accountType),
    accountCategory: row.accountCategory == null ? null : String(row.accountCategory),
    signedAmount: Number(row.signedAmount || 0),
    debitAmount: row.debitAmount == null ? null : Number(row.debitAmount),
    creditAmount: row.creditAmount == null ? null : Number(row.creditAmount),
    drCr: row.drCr == null ? null : String(row.drCr),
    transNum: row.transNum == null ? null : String(row.transNum),
    ref: row.ref == null ? null : String(row.ref),
    description: row.description == null ? null : String(row.description),
    site: row.site == null ? null : String(row.site),
    sourcePlatform: row.sourcePlatform == null ? null : String(row.sourcePlatform),
    sourceProgram: row.sourceProgram == null ? null : String(row.sourceProgram),
    sourceTransaction: row.sourceTransaction == null ? null : String(row.sourceTransaction),
    cono: row.cono == null ? null : String(row.cono),
    divi: row.divi == null ? null : String(row.divi),
  }));
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "GLTransactionFact" (
        "id",
        "companyId",
        "transDate",
        "accountId",
        "accountName",
        "accountType",
        "accountCategory",
        "signedAmount",
        "debitAmount",
        "creditAmount",
        "drCr",
        "transNum",
        "ref",
        "description",
        "site",
        "sourcePlatform",
        "sourceProgram",
        "sourceTransaction",
        "cono",
        "divi"
      )
      SELECT
        x."id",
        x."companyId",
        x."transDate",
        x."accountId",
        x."accountName",
        x."accountType",
        x."accountCategory",
        x."signedAmount",
        x."debitAmount",
        x."creditAmount",
        x."drCr",
        x."transNum",
        x."ref",
        x."description",
        x."site",
        x."sourcePlatform",
        x."sourceProgram",
        x."sourceTransaction",
        x."cono",
        x."divi"
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "id" text,
        "companyId" text,
        "transDate" timestamptz,
        "accountId" text,
        "accountName" text,
        "accountType" text,
        "accountCategory" text,
        "signedAmount" double precision,
        "debitAmount" double precision,
        "creditAmount" double precision,
        "drCr" text,
        "transNum" text,
        "ref" text,
        "description" text,
        "site" text,
        "sourcePlatform" text,
        "sourceProgram" text,
        "sourceTransaction" text,
        "cono" text,
        "divi" text
      )
      WHERE NOT EXISTS (
        SELECT 1
        FROM "GLTransactionFact" g
        WHERE g."companyId" = x."companyId"
          AND g."transDate" = x."transDate"
          AND g."accountId" = x."accountId"
          AND COALESCE(g."transNum",'') = COALESCE(x."transNum",'')
          AND COALESCE(g."ref",'') = COALESCE(x."ref",'')
          AND COALESCE(g."description",'') = COALESCE(x."description",'')
          AND COALESCE(g."signedAmount",0) = COALESCE(x."signedAmount",0)
          AND COALESCE(g."debitAmount",0) = COALESCE(x."debitAmount",0)
          AND COALESCE(g."creditAmount",0) = COALESCE(x."creditAmount",0)
      )
    `,
    JSON.stringify(sqlRows)
  );
  return rows.length;
}

async function saveBalanceMovementsFromGl(
  companyId: string,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[],
  glAccountMasterById?: Map<
    string,
    {
      accountId: string;
      accountName: string | null;
      accountType: string | null;
      accountCategory: string | null;
    }
  >
): Promise<number> {
  const mappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
  if (!mappedLineDelegate || records.length === 0) return 0;

  let accountMappings: Array<{
    sourceAccountName: string | null;
    sourceAccountId: string | null;
    sourceAccountCode: string | null;
    targetField: string | null;
  }> = [];
  try {
    const rawMappings = await prisma.accountMapping.findMany({
      where: {
        companyId,
        targetField: { notIn: ['', 'unmapped', 'UNMAPPED'] },
      },
      select: {
        qbAccount: true,
        qbAccountId: true,
        qbAccountCode: true,
        targetField: true,
      },
    });
    // NOTE: accountMapping uses historical qb* column names as generic source-account
    // tokens across all platforms (including Infor). Keep these aliases local to avoid
    // leaking QuickBooks terminology into Infor error paths.
    accountMappings = rawMappings.map((row) => ({
      sourceAccountName: row.qbAccount,
      sourceAccountId: row.qbAccountId,
      sourceAccountCode: row.qbAccountCode,
      targetField: row.targetField,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Do not abort GL sync when accountMapping metadata is missing/mismatched.
    // We can still persist raw GLTransactionFact rows and rely on COA fallback
    // classification where available.
    console.warn(
      `GL mapping lookup failed; continuing with empty account mappings. Original error: ${message}`
    );
    accountMappings = [];
  }

  const tokenToTargetFields = new Map<string, Set<string>>();
  for (const mapping of accountMappings) {
    const targetField = String(mapping.targetField || '').trim();
    if (!targetField) continue;
    const tokens = [mapping.sourceAccountName, mapping.sourceAccountId, mapping.sourceAccountCode]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    for (const token of tokens) {
      if (!tokenToTargetFields.has(token)) tokenToTargetFields.set(token, new Set<string>());
      tokenToTargetFields.get(token)!.add(targetField);
    }
  }
  const deriveTargetFieldsFromAccountMaster = (entry: {
    accountType: string | null;
    accountCategory: string | null;
    accountName: string | null;
  }): string[] => {
    const accountTypeText = String(entry.accountType || '').toLowerCase().trim();
    const accountCategoryText = String(entry.accountCategory || '').toLowerCase().trim();
    const accountNameText = String(entry.accountName || '').toLowerCase().trim();
    const text = `${accountTypeText} ${accountCategoryText} ${accountNameText}`
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const targets = new Set<string>();
    const has = (token: string): boolean => text.includes(token);

    const indicatesAsset =
      accountTypeText.startsWith('a') ||
      has('asset') ||
      has('cash') ||
      has('receivable') ||
      has('inventory') ||
      has('bank');
    const indicatesLiability =
      accountTypeText.startsWith('l') ||
      has('liability') ||
      has('payable') ||
      has('line of credit') ||
      has('long term debt');
    const indicatesEquity =
      accountTypeText.startsWith('e') && !has('expense') ||
      has('equity') ||
      has('capital') ||
      has('retained earnings') ||
      has('common stock') ||
      has('preferred stock');
    const indicatesRevenue =
      accountTypeText.startsWith('r') ||
      has('revenue') ||
      has('sales') ||
      (has('income') && !has('expense'));
    const indicatesExpense =
      accountTypeText.startsWith('x') ||
      has('expense') ||
      has('payroll') ||
      has('rent') ||
      has('insurance') ||
      has('depreciation') ||
      has('interest');

    if (indicatesRevenue) targets.add('revenue');
    if (has('cost of goods') || has('costofgoods') || has(' cogs') || has('cogs ')) targets.add('cogsTotal');
    if (indicatesExpense) targets.add('expense');
    if (indicatesAsset) {
      targets.add('totalAssets');
      if (has('cash') || has('bank')) targets.add('cash');
      if (has('receivable') || has('a/r') || has(' ar')) targets.add('ar');
      if (has('inventory')) targets.add('inventory');
      if (has('fixed')) targets.add('fixedAssets');
      if (has('current asset') || has('other current')) targets.add('otherCA');
      if (has('other asset') || has('intangible') || has('prepaid')) targets.add('otherAssets');
    }
    if (indicatesLiability) {
      targets.add('totalLiab');
      if (has('payable') || has('a/p') || has(' ap')) targets.add('ap');
      if (has('line of credit') || has('loc')) targets.add('loc');
      if (has('long term') || has('long-term') || has('non current')) targets.add('ltd');
      if (has('current liab') || has('other current')) targets.add('otherCL');
    }
    if (indicatesEquity) {
      targets.add('totalEquity');
      if (has('owner') && has('capital')) targets.add('ownersCapital');
      if (has('owner') && has('draw')) targets.add('ownersDraw');
      if (has('common stock')) targets.add('commonStock');
      if (has('preferred stock')) targets.add('preferredStock');
      if (has('retained earnings')) targets.add('retainedEarnings');
      if (has('treasury')) targets.add('treasuryStock');
    }
    return Array.from(targets);
  };

  const movementByKey = new Map<
    string,
    {
      snapshotDate: Date;
      sourceAccountName: string;
      sourceAccountId: string | null;
      sourceAccountType: string | null;
      amount: number;
      targetField: string;
    }
  >();

  for (const record of records) {
    const accountId =
      pickString(record, ['Acct', 'accountId', 'accountNumber', 'ACID']) ||
      pickString(record, ['ChaAccount', 'GLAccount']) ||
      null;
    const accountMaster =
      glAccountMasterById && accountId
        ? glAccountMasterById.get(normalizeGlAccountKey(accountId)) || null
        : null;
    const rawAccountName =
      pickString(record, ['ChaDescription', 'ChtDescription', 'accountName', 'name', 'Name']) || null;
    const preferredAccountName =
      accountMaster?.accountName && String(accountMaster.accountName).trim()
        ? String(accountMaster.accountName).trim()
        : null;
    const accountName =
      preferredAccountName && (isGenericAccountLabel(rawAccountName, accountId) || !rawAccountName)
        ? preferredAccountName
        : rawAccountName || preferredAccountName || (accountId ? `Account ${accountId}` : null);
    const matchingTokens = [accountId, accountName]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const matchedTargetFields = new Set<string>();
    for (const token of matchingTokens) {
      const fields = tokenToTargetFields.get(token);
      if (!fields) continue;
      fields.forEach((field) => matchedTargetFields.add(field));
    }
    if (matchedTargetFields.size === 0 && accountMaster) {
      for (const field of deriveTargetFieldsFromAccountMaster(accountMaster)) {
          matchedTargetFields.add(field);
      }
    }
    if (matchedTargetFields.size === 0) continue;

    const transDate = parseMaybeDate(
      pickString(record, ['TransDate', 'transDate', 'CheckDate', 'FRDerDate', 'RecordDate', 'date'])
    );
    if (!transDate) continue;
    const snapshotDate = startOfUtcDay(transDate);
    const { signedAmount } = extractSignedGlAmount(record);
    if (!Number.isFinite(signedAmount) || signedAmount === 0) continue;

    const sourceAccountName = String(accountName || accountId || 'Cash Account');
    const sourceAccountId = accountId ? String(accountId) : null;
    const sourceAccountType = accountMaster?.accountType || null;
    matchedTargetFields.forEach((mappedTargetField) => {
      const targetField = `balance_movement:${mappedTargetField}`;
      const normalizedTarget = String(mappedTargetField || '').trim().toLowerCase();
      const isExpenseLike =
        normalizedTarget === 'cogstotal' ||
        normalizedTarget.startsWith('cogs') ||
        normalizedTarget === 'expense' ||
        normalizedTarget === 'otherexpense' ||
        normalizedTarget.includes('expense');
      const isRevenueLike =
        normalizedTarget === 'revenue' ||
        normalizedTarget.startsWith('rev_') ||
        (normalizedTarget.includes('income') && !isExpenseLike);
      const normalizedAmount = isRevenueLike ? -signedAmount : signedAmount;
      if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) return;
      const key = `${snapshotDate.toISOString()}|${targetField}|${sourceAccountName}`;
      if (!movementByKey.has(key)) {
        movementByKey.set(key, {
          snapshotDate,
          sourceAccountName,
          sourceAccountId,
          sourceAccountType,
          amount: 0,
          targetField,
        });
      }
      const acc = movementByKey.get(key)!;
      acc.amount += normalizedAmount;
      if (!acc.sourceAccountId && sourceAccountId) acc.sourceAccountId = sourceAccountId;
      if (!acc.sourceAccountType && sourceAccountType) acc.sourceAccountType = sourceAccountType;
    });
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
      sourceAccountType: row.sourceAccountType || 'gl_balance_account',
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
    // Align AR aging to invoice-date basis for consistency with validated
    // customer-facing open-invoice snapshots.
    dueDateKeys: ['InvDate', 'invoiceDate', 'IVDT', 'RecordDate', 'date'],
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
  const collectibleWindowStart = new Date(
    snapshotDayStart.getTime() - AR_EOD_COLLECTIBLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const normalizeInvoiceNo = (value: string | null): string =>
    String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  const isValidInvoiceAnchorNo = (invoiceNo: string): boolean => {
    const inv = normalizeInvoiceNo(invoiceNo);
    if (!inv || inv === '0') return false;
    // Credit memo/doc-only identifiers must net against invoices, not become anchors.
    if (inv.startsWith('CR')) return false;
    return true;
  };
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
  const priorSnapshotDate = new Date(snapshotDayStart.getTime() - 24 * 60 * 60 * 1000);
  const priorOpenKeys = new Set<string>();
  const priorRows = await prisma.aROpenInvoiceSnapshot.findMany({
    where: {
      companyId,
      frequency,
      snapshotDate: priorSnapshotDate,
      amountDueHome: { gt: 0 },
    },
    select: {
      customerId: true,
      customerName: true,
      invoiceNo: true,
    },
  });
  for (const row of priorRows) {
    const invoiceNo = normalizeInvoiceNo(String(row.invoiceNo || ''));
    if (!invoiceNo) continue;
    const customerKey = String(row.customerId || row.customerName || '').trim().toLowerCase();
    if (!customerKey) continue;
    priorOpenKeys.add(`${customerKey}|${invoiceNo}`);
  }

  type ParsedArMovement = {
    logicalKey: string;
    customerId: string | null;
    customerName: string;
    invoiceNo: string;
    invoiceDate: Date | null;
    dueDate: Date | null;
    status: string | null;
    currencyCode: string | null;
    baseHome: number;
    baseCurrency: number;
    movementHome: number;
    movementCurrency: number;
  };
  const parsedMovements: ParsedArMovement[] = [];
  const allAnchorKeys = new Set<string>();
  const todayAnchorKeys = new Set<string>();

  for (let idx = 0; idx < records.length; idx += 1) {
    const record = records[idx];
    const typeToken = normalizeToken(record['Type']) || '';
    const reductionMovement = isReductionMovement(record);
    const customerId =
      pickString(record, CUSTOMER_ID_KEYS) ||
      parseCustomerIdFromComposite(pickString(record, ['DerCustNoName', 'customerComposite']));
    const customerName = pickCustomerDisplayName(record) || (customerId ? `Customer ${customerId}` : 'Unknown Customer');
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
    if (!customerKey) continue;
    const logicalKey = `${customerKey}|${invoiceNo}`;
    const rawInvoiceDate = parseMaybeDate(
      pickString(record, ['InvDate', 'invoiceDate', 'IssueDate', 'RecordDate', 'date', 'IVDT'])
    );
    const rawDueDate = parseMaybeDate(pickString(record, ['DueDate', 'dueDate', 'DUDT']));
    // Anchor aging to the true invoice row; mapped adjustments (DR/apply-to and reductions)
    // must not bring their own document dates into the invoice bucket.
    const isInvoiceType = typeToken === 'i' || typeToken === 'invoice';
    const isInvoiceAnchorRow = isInvoiceType && !reductionMovement && !shouldMapToAppliedInvoice;
    if (isInvoiceAnchorRow) {
      if (!isValidInvoiceAnchorNo(invoiceNo)) continue;
      // Locked collectible policy: only track invoices issued within lookback window.
      if (!rawInvoiceDate) continue;
      if (rawInvoiceDate.getTime() < collectibleWindowStart.getTime()) continue;
      if (rawInvoiceDate.getTime() >= snapshotDayEnd.getTime()) continue;
      allAnchorKeys.add(logicalKey);
      if (movementDate && movementDate.getTime() >= snapshotDayStart.getTime() && movementDate.getTime() < snapshotDayEnd.getTime()) {
        todayAnchorKeys.add(logicalKey);
      }
    }
    const invoiceDate = isInvoiceAnchorRow ? rawInvoiceDate : null;
    const dueDate = isInvoiceAnchorRow ? rawDueDate : null;
    const baseHome = isInvoiceAnchorRow && movementHome > 0 ? movementHome : 0;
    const baseCurrency = isInvoiceAnchorRow && movementCurrency > 0 ? movementCurrency : 0;
    parsedMovements.push({
      logicalKey,
      customerId,
      customerName,
      invoiceNo,
      invoiceDate,
      dueDate,
      status: deriveArStatus(record),
      currencyCode: pickString(record, ['currencyCode', 'currency', 'CurrCode', 'CUCD']),
      baseHome,
      baseCurrency,
      movementHome,
      movementCurrency,
    });
  }

  const allowedKeys = new Set<string>();
  if (priorOpenKeys.size > 0) {
    priorOpenKeys.forEach((key) => allowedKeys.add(key));
    todayAnchorKeys.forEach((key) => allowedKeys.add(key));
  } else {
    allAnchorKeys.forEach((key) => allowedKeys.add(key));
  }
  for (const movement of parsedMovements) {
    if (!allowedKeys.has(movement.logicalKey)) continue;
    const groupKey = `${companyId}|${frequency}|${snapshotDayStart.toISOString()}|${movement.logicalKey}`;
    const existing = invoiceAccumulator.get(groupKey);
    if (!existing) {
      invoiceAccumulator.set(groupKey, {
        companyId,
        snapshotDate: snapshotDayStart,
        frequency,
        customerId: movement.customerId,
        customerName: movement.customerName,
        invoiceNo: movement.invoiceNo,
        invoiceDate: movement.invoiceDate,
        dueDate: movement.dueDate,
        status: movement.status || 'OPEN_NET',
        currencyCode: movement.currencyCode,
        invoiceBaseHome: movement.baseHome,
        invoiceBaseCurrency: movement.baseCurrency,
        remainingHome: movement.movementHome,
        remainingCurrency: movement.movementCurrency,
      });
      continue;
    }

    existing.invoiceBaseHome += movement.baseHome;
    existing.invoiceBaseCurrency += movement.baseCurrency;
    existing.remainingHome += movement.movementHome;
    existing.remainingCurrency += movement.movementCurrency;
    existing.customerId = existing.customerId || movement.customerId;
    existing.invoiceDate = existing.invoiceDate || movement.invoiceDate;
    existing.dueDate = existing.dueDate || movement.dueDate;
    existing.status = existing.status || movement.status;
    existing.currencyCode = existing.currencyCode || movement.currencyCode;
  }

  const movementRows = Array.from(invoiceAccumulator.values())
    .map((entry) => {
      const remainingHome = Number(entry.remainingHome || 0);
      if (!Number.isFinite(remainingHome) || remainingHome === 0) return null;
      const invoiceDateMs = entry.invoiceDate?.getTime();
      if (!invoiceDateMs) return null;
      if (invoiceDateMs < collectibleWindowStart.getTime() || invoiceDateMs >= snapshotDayEnd.getTime()) return null;
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
      }, { maxWait: 10000, timeout: 120000 })
    );
  }

  // Keep raw insert chunks modest to avoid Postgres cached-plan memory pressure
  // on large historical AR backfills.
  const batchSize = 100;
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
      const customerId = pickString(record, CUSTOMER_ID_KEYS);
      const customerName = pickCustomerDisplayName(record) || (customerId ? `Customer ${customerId}` : 'Unknown Customer');
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
        customerId,
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
    }, { maxWait: 10000, timeout: 120000 })
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

async function saveSalesInvoiceHeaders(
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
  }
): Promise<number> {
  const delegate = (prisma as any).salesInvoiceHeaderSnapshot;
  if (!delegate?.createMany || !delegate?.deleteMany) return 0;

  if (context.resetSnapshot) {
    await delegate.deleteMany({ where: { companyId, frequency, snapshotDate } });
  }

  const parsedRows = records
    .map((record) => {
      const orderId = normalizeOrderJoinKey(
        pickString(record, ['CoNum', 'CONUM', 'coNum', 'orderNo', 'orderNumber', 'OrderNum'])
      );
      const invoiceNo = normalizeInvoiceKeyForOrigin(
        pickString(record, ['InvNum', 'invoiceNo', 'invoiceNumber', 'DerInvNum', 'IVNO'])
      );
      if (!orderId || !invoiceNo) return null;
      return {
        companyId,
        snapshotDate,
        frequency,
        orderId,
        invoiceNo,
        customerId: pickString(record, ['CustNum', 'custNum', 'CustNo', ...CUSTOMER_ID_KEYS]) || null,
        customerName: pickCustomerDisplayName(record) || pickString(record, ['CustName', 'DerCustName', ...CUSTOMER_NAME_KEYS]) || null,
        invoiceDate: parseMaybeDate(pickString(record, ['InvDate', 'invoiceDate', 'IVDT', 'RecordDate', 'date'])),
        sourcePlatform: 'INFOR_M3',
        sourceProgram: context.miProgram,
        sourceTransaction: context.transaction,
        cono: context.cono || null,
        divi: context.divi || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!parsedRows.length) return 0;
  await delegate.createMany({ data: parsedRows, skipDuplicates: true });
  return parsedRows.length;
}

function buildAgingBucketFromDueDate(
  dueDate: Date | null,
  invoiceDate: Date | null,
  asOfDate: Date
): { daysOutstanding: number | null; agingBucket: string } {
  const baselineInvoiceDate = invoiceDate ? startOfUtcDay(invoiceDate) : null;
  if (!baselineInvoiceDate) return { daysOutstanding: null, agingBucket: '90+' };
  const days = Math.floor((startOfUtcDay(asOfDate).getTime() - baselineInvoiceDate.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return { daysOutstanding: days, agingBucket: 'Current' };
  if (days <= 30) return { daysOutstanding: days, agingBucket: '30' };
  if (days <= 60) return { daysOutstanding: days, agingBucket: '60' };
  if (days <= 90) return { daysOutstanding: days, agingBucket: '90' };
  return { daysOutstanding: days, agingBucket: '90+' };
}

const normalizeInvoiceKeyForOrigin = (value: string | null | undefined): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

let arInvoiceDetailSourceColumnsSupportedCache: boolean | null = null;
async function arInvoiceDetailSupportsSourceColumns(): Promise<boolean> {
  if (arInvoiceDetailSourceColumnsSupportedCache !== null) return arInvoiceDetailSourceColumnsSupportedCache;
  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'ARInvoiceDetail'
        AND column_name IN ('sourceClass', 'sourceSystem', 'sourceDocId', 'sourceMatchConfidence', 'sourceMatchedBy')
    `;
    const names = new Set(rows.map((row) => String(row.column_name || '').trim()));
    arInvoiceDetailSourceColumnsSupportedCache =
      names.has('sourceClass') &&
      names.has('sourceSystem') &&
      names.has('sourceDocId') &&
      names.has('sourceMatchConfidence') &&
      names.has('sourceMatchedBy');
  } catch {
    arInvoiceDetailSourceColumnsSupportedCache = false;
  }
  return arInvoiceDetailSourceColumnsSupportedCache;
}

async function upsertArInvoiceOriginMapFromOrderLines(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  invoiceRows: Array<{ invoiceId: string; customerId: string | null; invoiceAmount: number; remainingBalance: number }>
): Promise<void> {
  const originMapDelegate = (prisma as any).aRInvoiceOriginMap;
  const orderLineDelegate = (prisma as any).customerOrderLineSnapshot;
  const invoiceHeaderDelegate = (prisma as any).salesInvoiceHeaderSnapshot;
  if (
    !originMapDelegate?.createMany ||
    !orderLineDelegate?.findFirst ||
    !orderLineDelegate?.findMany ||
    !invoiceHeaderDelegate?.findFirst ||
    !invoiceHeaderDelegate?.findMany
  ) {
    return;
  }

  const openInvoiceKeys = new Set<string>();
  for (const row of invoiceRows) {
    const invoiceNo = normalizeInvoiceKeyForOrigin(row.invoiceId);
    if (!invoiceNo) continue;
    openInvoiceKeys.add(`${String(row.customerId || '').trim()}|${invoiceNo}`);
  }
  if (openInvoiceKeys.size === 0) return;

  const latestOrderSnapshot = await orderLineDelegate.findFirst({
    where: {
      companyId,
      frequency,
      snapshotDate: { lte: snapshotDate },
    },
    orderBy: [{ snapshotDate: 'desc' }],
    select: { snapshotDate: true },
  });
  if (!latestOrderSnapshot?.snapshotDate) return;

  const orderRows = await orderLineDelegate.findMany({
    where: {
      companyId,
      frequency,
      snapshotDate: latestOrderSnapshot.snapshotDate,
    },
    select: {
      customerId: true,
      orderId: true,
    },
    take: 100000,
  });
  const contractOrderKeys = new Set<string>();
  for (const row of orderRows as any[]) {
    const orderId = normalizeOrderJoinKey(String(row.orderId || ''));
    if (!orderId) continue;
    const customerId = String(row.customerId || '').trim();
    contractOrderKeys.add(`${customerId}|${orderId}`);
  }
  if (contractOrderKeys.size === 0) return;

  const latestInvoiceHeaderSnapshot = await invoiceHeaderDelegate.findFirst({
    where: {
      companyId,
      frequency,
      snapshotDate: { lte: snapshotDate },
    },
    orderBy: [{ snapshotDate: 'desc' }],
    select: { snapshotDate: true },
  });
  if (!latestInvoiceHeaderSnapshot?.snapshotDate) return;

  const invoiceHeaderRows = await invoiceHeaderDelegate.findMany({
    where: {
      companyId,
      frequency,
      snapshotDate: latestInvoiceHeaderSnapshot.snapshotDate,
    },
    select: {
      customerId: true,
      orderId: true,
      invoiceNo: true,
    },
    take: 100000,
  });

  const now = new Date();
  const rowsToCreate = new Map<string, Record<string, unknown>>();
  for (const row of invoiceHeaderRows as any[]) {
    const orderId = normalizeOrderJoinKey(String(row.orderId || ''));
    if (!orderId) continue;
    const invoiceNoNormalized = normalizeInvoiceKeyForOrigin(row.invoiceNo);
    if (!invoiceNoNormalized) continue;
    const customerId = String(row.customerId || '').trim() || null;
    const contractOrderKey = `${customerId || ''}|${orderId}`;
    if (!contractOrderKeys.has(contractOrderKey)) continue;
    const joinKey = `${customerId || ''}|${invoiceNoNormalized}`;
    if (!openInvoiceKeys.has(joinKey)) continue;
    const dedupeKey = `${companyId}|${invoiceNoNormalized}|${customerId || ''}|CSI_ORDER_INVOICE_HEADER`;
    rowsToCreate.set(dedupeKey, {
      companyId,
      invoiceNoNormalized,
      customerId,
      customerKey: String(customerId || '').trim(),
      sourceClass: 'CONTRACT',
      sourceSystem: 'CSI_ORDER_INVOICE_HEADER',
      sourceDocId: `${orderId}:${String(row.invoiceNo || '')}`,
      sourceInvoiceNoRaw: row.invoiceNo || null,
      matchConfidence: 'HIGH',
      matchedBy: 'ORDER_ID_TO_INVOICE_NO_AND_CUSTOMER',
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }
  if (rowsToCreate.size === 0) return;

  try {
    await originMapDelegate.createMany({
      data: Array.from(rowsToCreate.values()),
      skipDuplicates: true,
    });
  } catch (error) {
    console.warn('[Operational Sync] Unable to upsert AR invoice origin map:', error);
  }
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

  const openRows: Array<{
    customerId: string | null;
    customerName: string;
    invoiceNo: string;
    invoiceDate: Date | null;
    dueDate: Date | null;
    amountHome: number | null;
    amountDueHome: number;
  }> = [];
  let lastId: string | null = null;
  const pageSize = 5000;
  while (true) {
    const page = await prisma.aROpenInvoiceSnapshot.findMany({
      where: {
        companyId,
        frequency,
        snapshotDate,
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        invoiceNo: true,
        invoiceDate: true,
        dueDate: true,
        amountHome: true,
        amountDueHome: true,
      },
      orderBy: [{ id: 'asc' }],
      take: pageSize,
    });
    if (!page.length) break;
    for (const row of page) {
      openRows.push({
        customerId: row.customerId || null,
        customerName: row.customerName,
        invoiceNo: row.invoiceNo,
        invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        amountHome: row.amountHome ?? null,
        amountDueHome: Number(row.amountDueHome || 0),
      });
    }
    lastId = page[page.length - 1].id;
    if (page.length < pageSize) break;
  }

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
        sourceClass: 'UNKNOWN',
        sourceSystem: null as string | null,
        sourceDocId: null as string | null,
        sourceMatchConfidence: null as string | null,
        sourceMatchedBy: null as string | null,
      };
    });

  await upsertArInvoiceOriginMapFromOrderLines(companyId, snapshotDate, frequency, invoiceRows);

  const originMapDelegate = (prisma as any).aRInvoiceOriginMap;
  const originByInvoiceAndCustomer = new Map<string, any>();
  const originByInvoiceOnly = new Map<string, any>();
  if (originMapDelegate?.findMany && invoiceRows.length > 0) {
    const invoiceNos = Array.from(
      new Set(invoiceRows.map((row) => normalizeInvoiceKeyForOrigin(row.invoiceId)).filter(Boolean))
    );
    if (invoiceNos.length > 0) {
      const originRows = await originMapDelegate.findMany({
        where: {
          companyId,
          invoiceNoNormalized: { in: invoiceNos },
          matchConfidence: 'HIGH',
        },
        select: {
          invoiceNoNormalized: true,
          customerId: true,
          sourceClass: true,
          sourceSystem: true,
          sourceDocId: true,
          matchConfidence: true,
          matchedBy: true,
          lastSeenAt: true,
        },
        orderBy: [{ lastSeenAt: 'desc' }],
        take: Math.max(invoiceNos.length * 4, 2000),
      });
      for (const row of originRows as any[]) {
        const invoiceNo = normalizeInvoiceKeyForOrigin(row.invoiceNoNormalized);
        const customerId = String(row.customerId || '').trim();
        const byCustomerKey = `${invoiceNo}|${customerId}`;
        if (invoiceNo && customerId && !originByInvoiceAndCustomer.has(byCustomerKey)) {
          originByInvoiceAndCustomer.set(byCustomerKey, row);
        }
        if (invoiceNo && !originByInvoiceOnly.has(invoiceNo)) {
          originByInvoiceOnly.set(invoiceNo, row);
        }
      }
    }
  }

  const invoiceRowsWithSource = invoiceRows.map((row) => {
    const invoiceNo = normalizeInvoiceKeyForOrigin(row.invoiceId);
    const customerId = String(row.customerId || '').trim();
    const direct = originByInvoiceAndCustomer.get(`${invoiceNo}|${customerId}`);
    const fallback = originByInvoiceOnly.get(invoiceNo);
    const match = direct || fallback;
    if (!match) return row;
    return {
      ...row,
      sourceClass: String(match.sourceClass || 'UNKNOWN'),
      sourceSystem: String(match.sourceSystem || ''),
      sourceDocId: match.sourceDocId ? String(match.sourceDocId) : null,
      sourceMatchConfidence: match.matchConfidence ? String(match.matchConfidence) : null,
      sourceMatchedBy: match.matchedBy ? String(match.matchedBy) : null,
    };
  });

  const arInvoiceDetailDelegate = (prisma as any).aRInvoiceDetail;
  if (arInvoiceDetailDelegate?.deleteMany && arInvoiceDetailDelegate?.createMany) {
    const supportsSourceColumns = await arInvoiceDetailSupportsSourceColumns();
    const invoiceRowsForPersist = supportsSourceColumns
      ? invoiceRowsWithSource
      : invoiceRowsWithSource.map(
          ({
            sourceClass: _sourceClass,
            sourceSystem: _sourceSystem,
            sourceDocId: _sourceDocId,
            sourceMatchConfidence: _sourceMatchConfidence,
            sourceMatchedBy: _sourceMatchedBy,
            ...rest
          }) => rest
        );
    await arInvoiceDetailDelegate.deleteMany({ where: { companyId, asOfDate: snapshotDate, snapshotFrequency: frequency } });
    if (invoiceRowsForPersist.length > 0) {
      await arInvoiceDetailDelegate.createMany({ data: invoiceRowsForPersist });
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
    dueDateKeys: ['DueDate', 'dueDate', 'DUDT', 'InvDate', 'invoiceDate', 'DistDate', 'IVDT', 'RecordDate', 'date'],
    balanceKeys: ['Balance', 'balance', 'openBalance', 'openAmount', 'amountDue', 'InvAmt', 'Amount'],
    amountKeys: ['Amount', 'amount', 'invoiceAmount', 'InvAmt'],
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
        pickString(record, ['billNo', 'billNumber', 'invoiceNo', 'InvNum', 'voucher', 'Voucher', 'SINO']) ||
        `UNKNOWN-${idx + 1}`;
      const amountDueHome = pickNumber(record, [
        'amountDueHome',
        'amountDue',
        'openAmount',
        'balance',
        'InvAmt',
        'DerAmtBal',
        'UbOpening',
        'CUAM',
        'ACAM',
      ]);
      return {
        companyId,
        snapshotDate,
        frequency,
        vendorId: pickString(record, VENDOR_ID_KEYS),
        vendorName,
        billNo,
        billDate: parseMaybeDate(pickString(record, ['billDate', 'invoiceDate', 'InvDate', 'DistDate', 'date', 'IVDT'])),
        dueDate: parseMaybeDate(pickString(record, ['dueDate', 'DUDT', 'DueDate', 'InvDate', 'DistDate'])),
        status: pickString(record, ['status', 'STAT']),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        amountCurrency: pickNumber(record, ['amountCurrency', 'billAmount', 'InvAmt', 'CUAM']) || null,
        amountHome: pickNumber(record, ['amountHome', 'homeAmount', 'InvAmt', 'ACAM']) || null,
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
        sourceRecordDate: parseMaybeDate(pickString(record, ['RecordDate', 'recordDate', 'DistDate', 'InvDate', 'date'])),
      };
    })
    .filter((row) => row.vendorName && row.billNo && Number.isFinite(row.amountDueHome));

  if (!rows.length) return 0;
  const deduped = new Map<
    string,
    { row: Omit<(typeof rows)[number], 'sourceRecordDate'>; sourceRecordDate: Date | null; score: number }
  >();
  const scoreRow = (row: (typeof rows)[number]): number =>
    (Number(row.amountDueHome || 0) !== 0 ? 4 : 0) +
    (row.billDate ? 1 : 0) +
    (row.dueDate ? 1 : 0) +
    (Number(row.amountHome || 0) !== 0 ? 1 : 0) +
    (Number(row.amountCurrency || 0) !== 0 ? 1 : 0);
  const normalizeDedupToken = (value: unknown): string =>
    String(value || '')
      .trim()
      .toLowerCase();
  for (const row of rows) {
    // Must align with DB unique key: (companyId, frequency, snapshotDate, billNo, vendorName)
    const key = `${normalizeDedupToken(row.vendorName)}||${normalizeDedupToken(row.billNo)}`;
    const existing = deduped.get(key);
    const nextScore = scoreRow(row);
    const existingDateMs = existing?.sourceRecordDate ? existing.sourceRecordDate.getTime() : Number.NEGATIVE_INFINITY;
    const nextDateMs = row.sourceRecordDate ? row.sourceRecordDate.getTime() : Number.NEGATIVE_INFINITY;
    const isNewer = nextDateMs > existingDateMs;
    const isSameMomentBetterScore = nextDateMs === existingDateMs && nextScore >= (existing?.score || 0);
    if (!existing || isNewer || isSameMomentBetterScore) {
      const { sourceRecordDate, ...persistableRow } = row;
      deduped.set(key, { row: persistableRow, sourceRecordDate: sourceRecordDate || null, score: nextScore });
    }
  }

  const finalRows = Array.from(deduped.values()).map((entry) => entry.row);
  if (!finalRows.length) return 0;
  const BATCH_SIZE = 2000;
  for (let i = 0; i < finalRows.length; i += BATCH_SIZE) {
    const batch = finalRows.slice(i, i + BATCH_SIZE);
    await (prisma as any).aPOpenBillSnapshot.createMany({ data: batch, skipDuplicates: true });
  }
  return finalRows.length;
}

async function saveAPPayments(
  companyId: string,
  records: Record<string, unknown>[],
  context: { miProgram: string; transaction: string; cono?: string; divi?: string }
): Promise<number> {
  const rows = records
    .map((record, idx) => {
      const paymentDate = parseMaybeDate(
        pickString(record, ['paymentDate', 'date', 'PYDT', 'RGDT', 'DistDate', 'CheckDate', 'CreateDate', 'RecordDate'])
      );
      if (!paymentDate) return null;
      const vendorName =
        pickString(record, ['UbVendName', 'VendaddrName', 'VendorName', ...VENDOR_NAME_KEYS]) || `Unknown Vendor ${idx + 1}`;
      return {
        companyId,
        paymentDate,
        vendorId: pickString(record, VENDOR_ID_KEYS),
        vendorName,
        billNo: pickString(record, ['billNo', 'billNumber', 'invoiceNo', 'InvNum', 'Voucher', 'voucher', 'SINO']),
        currencyCode: pickString(record, ['currencyCode', 'currency', 'CUCD']),
        paidAmountCurrency: pickNumber(record, ['paidAmountCurrency', 'CUAM']) || null,
        paidAmountHome: pickNumber(record, [
          'paidAmountHome',
          'paidAmount',
          'AmtPaid',
          'UbPayment',
          'DerDomAmtApplied',
          'DerForAmtApplied',
          'DerAmtBal',
          'DomCheckAmt',
          'ForCheckAmt',
          'DerDomCheckAmount',
          'amount',
          'ACAM',
          'PYAM',
        ]),
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
  const dayStart = startOfUtcDay(snapshotDate);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
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
  const [cashAgg, inventoryRows, productAgg, arSnapshot, apSnapshot, glBalanceMovementRows, glBalanceMovementRowsToDate] = await Promise.all([
    prisma.cashSnapshot.aggregate({
      where: { companyId, frequency, snapshotDate: { gte: dayStart, lt: dayEnd } },
      _sum: { cashBalance: true },
      _count: { _all: true },
    }),
    prisma.inventorySnapshot.findMany({
      where: { companyId, frequency, snapshotDate: { gte: dayStart, lt: dayEnd } },
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
      where: { companyId, frequency, snapshotDate: { gte: dayStart, lt: dayEnd } },
      _sum: { revenue: true, cogs: true },
      _count: { _all: true },
    }),
    prisma.aRAgingSnapshot.findFirst({
      where: { companyId, frequency, snapshotDate: { gte: dayStart, lt: dayEnd } },
      select: { totalAR: true },
      orderBy: { snapshotDate: 'desc' },
    }),
    prisma.aPAgingSnapshot.findFirst({
      where: { companyId, frequency, snapshotDate: { gte: dayStart, lt: dayEnd } },
      select: { totalAP: true },
      orderBy: { snapshotDate: 'desc' },
    }),
    mappedLineDelegate
      ? mappedLineDelegate.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: { gte: dayStart, lt: dayEnd },
            sourceAccountType: 'gl_balance_account',
            targetField: { startsWith: 'balance_movement:' },
          },
          select: { targetField: true, amount: true },
        })
      : Promise.resolve([]),
    mappedLineDelegate
      ? mappedLineDelegate.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: { lt: dayEnd },
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
  const cumulativeBalanceTotals = new Map<string, number>();
  for (const row of Array.isArray(glBalanceMovementRowsToDate) ? glBalanceMovementRowsToDate : []) {
    const rawTargetField = String((row as any).targetField || '').trim().toLowerCase();
    const amount = Number((row as any).amount || 0);
    if (!rawTargetField.startsWith('balance_movement:') || !Number.isFinite(amount)) continue;
    const field = rawTargetField.replace('balance_movement:', '').trim();
    if (!field) continue;
    cumulativeBalanceTotals.set(field, Number(cumulativeBalanceTotals.get(field) || 0) + amount);
  }
  const normalizeGlTargetKey = (value: string): string => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const getGlTargetTotal = (aliases: string[]): number => {
    const aliasSet = new Set(aliases.map((alias) => normalizeGlTargetKey(alias)));
    return sumGlByPredicate((field) => aliasSet.has(normalizeGlTargetKey(field)));
  };
  const getCumulativeBalanceTargetTotal = (aliases: string[]): number => {
    const aliasSet = new Set(aliases.map((alias) => normalizeGlTargetKey(alias)));
    let total = 0;
    cumulativeBalanceTotals.forEach((value, field) => {
      if (!aliasSet.has(normalizeGlTargetKey(field))) return;
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
  // Daily balance sheet is end-of-day balance by account (cumulative ledger),
  // not same-day movement.
  const cashFromGl = getCumulativeBalanceTargetTotal(['cash']);
  const arFromGl = getCumulativeBalanceTargetTotal(['ar', 'accountsReceivable']);
  const inventoryFromGl = getCumulativeBalanceTargetTotal(['inventory']);
  const otherCAFromGl = getCumulativeBalanceTargetTotal(['otherCA', 'otherCurrentAssets']);
  const fixedAssetsFromGl = getCumulativeBalanceTargetTotal(['fixedAssets']);
  const otherAssetsFromGl = getCumulativeBalanceTargetTotal(['otherAssets']);
  const apFromGl = getCumulativeBalanceTargetTotal(['ap', 'accountsPayable']);
  const locFromGl = getCumulativeBalanceTargetTotal(['loc', 'lineOfCredit']);
  const otherCLFromGl = getCumulativeBalanceTargetTotal(['otherCL', 'otherCurrentLiabilities']);
  const ltdFromGl = getCumulativeBalanceTargetTotal(['ltd', 'longTermDebt']);
  const tcaFromGl = getCumulativeBalanceTargetTotal(['tca', 'totalCurrentAssets']);
  const tclFromGl = getCumulativeBalanceTargetTotal(['tcl', 'totalCurrentLiabilities']);
  const totalAssetsFromGl = getCumulativeBalanceTargetTotal(['totalAssets']);
  const totalLiabFromGl = getCumulativeBalanceTargetTotal(['totalLiab', 'totalLiabilities']);
  const ownersCapitalFromGl = getCumulativeBalanceTargetTotal(['ownersCapital']);
  const ownersDrawFromGl = getCumulativeBalanceTargetTotal(['ownersDraw']);
  const commonStockFromGl = getCumulativeBalanceTargetTotal(['commonStock']);
  const preferredStockFromGl = getCumulativeBalanceTargetTotal(['preferredStock']);
  const retainedEarningsFromGl = getCumulativeBalanceTargetTotal(['retainedEarnings']);
  const additionalPaidInCapitalFromGl = getCumulativeBalanceTargetTotal(['additionalPaidInCapital']);
  const treasuryStockFromGl = getCumulativeBalanceTargetTotal(['treasuryStock']);
  const totalEquityFromGl = getCumulativeBalanceTargetTotal(['totalEquity']);
  const totalLAndEFromGl = getCumulativeBalanceTargetTotal(['totalLAndE', 'totalLiabilitiesAndEquity']);

  const cash = (() => {
    const sameDayCash = Number(cashAgg?._sum?.cashBalance || 0);
    if (Number.isFinite(sameDayCash) && sameDayCash !== 0) return Math.abs(sameDayCash);
    return Math.abs(cashFromGl);
  })();
  const ar = Math.abs(arFromGl);
  const inventoryEffective = Math.abs(inventoryFromGl);
  const otherCA = Math.abs(otherCAFromGl);
  const fixedAssets = Math.abs(fixedAssetsFromGl);
  const otherAssets = Math.abs(otherAssetsFromGl);
  const ap = Math.abs(apFromGl);
  const loc = Math.abs(locFromGl);
  const otherCL = Math.abs(otherCLFromGl);
  const ltd = Math.abs(ltdFromGl);
  const tca = Math.abs(tcaFromGl) > 0 ? Math.abs(tcaFromGl) : cash + ar + inventoryEffective + otherCA;
  const tcl = Math.abs(tclFromGl) > 0 ? Math.abs(tclFromGl) : ap + loc + otherCL;
  const totalAssets = Math.abs(totalAssetsFromGl) > 0 ? Math.abs(totalAssetsFromGl) : tca + fixedAssets + otherAssets;
  const totalLiab = Math.abs(totalLiabFromGl) > 0 ? Math.abs(totalLiabFromGl) : tcl + ltd;
  const ownersCapital = Math.abs(ownersCapitalFromGl);
  const ownersDraw = Math.abs(ownersDrawFromGl);
  const commonStock = Math.abs(commonStockFromGl);
  const preferredStock = Math.abs(preferredStockFromGl);
  const retainedEarnings = Math.abs(retainedEarningsFromGl);
  const additionalPaidInCapital = Math.abs(additionalPaidInCapitalFromGl);
  const treasuryStock = Math.abs(treasuryStockFromGl);
  const totalEquity =
    Math.abs(totalEquityFromGl) > 0
      ? Math.abs(totalEquityFromGl)
      : ownersCapital + ownersDraw + commonStock + preferredStock + retainedEarnings + additionalPaidInCapital + treasuryStock;
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
    otherCA,
    tca,
    fixedAssets,
    otherAssets,
    totalAssets,
    ap,
    loc,
    otherCL,
    tcl,
    ltd,
    totalLiab,
    ownersCapital,
    ownersDraw,
    commonStock,
    preferredStock,
    retainedEarnings,
    additionalPaidInCapital,
    treasuryStock,
    totalEquity,
    totalLAndE: totalLAndEFromGl > 0 ? totalLAndEFromGl : totalLAndE,
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
        notes.push('Daily snapshot written from same-day available source data.');
      }
      if (!hasExactSalesForDay) {
        if (revenueFromGl > 0 || cogsFromGl > 0 || expenseFromGl > 0) {
          notes.push('Daily P&L inferred from same-day GL mapped movements due to missing sales snapshot rows.');
        } else {
          notes.push('Daily revenue/cogs suppressed because no same-day sales snapshot was available.');
        }
      }
      if (cashFromGl !== 0 || arFromGl !== 0 || inventoryFromGl !== 0 || apFromGl !== 0 || totalAssetsFromGl !== 0 || totalLiabFromGl !== 0) {
        notes.push('Daily balance sheet fields were hydrated from end-of-day cumulative GL ledger balances.');
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
  const syncStartedAtMs = Date.now();
  let requestCount = 0;
  let successRequestCount = 0;
  let failedRequestCount = 0;
  let requestDurationTotalMs = 0;
  let bufferedApiSyncLogWriteFailures = 0;
  let apiSyncLogFlushCount = 0;
  let apiSyncLogRowsFlushed = 0;
  let apiSyncLogBackpressureFlushCount = 0;
  const adaptivePressureEnabled = process.env.SYNC_ADAPTIVE_PRESSURE === '1';
  const adaptivePressureWindowRaw = Number(process.env.SYNC_ADAPTIVE_PRESSURE_WINDOW || 25);
  const adaptivePressureWindow =
    Number.isFinite(adaptivePressureWindowRaw) && adaptivePressureWindowRaw >= 5
      ? Math.floor(adaptivePressureWindowRaw)
      : 25;
  const adaptiveSlowRequestMsRaw = Number(process.env.SYNC_ADAPTIVE_SLOW_REQUEST_MS || 45000);
  const adaptiveSlowRequestMs =
    Number.isFinite(adaptiveSlowRequestMsRaw) && adaptiveSlowRequestMsRaw >= 5000
      ? Math.floor(adaptiveSlowRequestMsRaw)
      : 45000;
  const adaptiveRecoverRequestMsRaw = Number(process.env.SYNC_ADAPTIVE_RECOVER_REQUEST_MS || 20000);
  const adaptiveRecoverRequestMs =
    Number.isFinite(adaptiveRecoverRequestMsRaw) && adaptiveRecoverRequestMsRaw >= 2000
      ? Math.floor(adaptiveRecoverRequestMsRaw)
      : 20000;
  const adaptiveHighErrorRateRaw = Number(process.env.SYNC_ADAPTIVE_HIGH_ERROR_RATE || 0.25);
  const adaptiveHighErrorRate =
    Number.isFinite(adaptiveHighErrorRateRaw) && adaptiveHighErrorRateRaw > 0 && adaptiveHighErrorRateRaw < 1
      ? adaptiveHighErrorRateRaw
      : 0.25;
  const adaptiveLowErrorRateRaw = Number(process.env.SYNC_ADAPTIVE_LOW_ERROR_RATE || 0.1);
  const adaptiveLowErrorRate =
    Number.isFinite(adaptiveLowErrorRateRaw) && adaptiveLowErrorRateRaw >= 0 && adaptiveLowErrorRateRaw < 1
      ? adaptiveLowErrorRateRaw
      : 0.1;
  const adaptiveMinPageScaleRaw = Number(process.env.SYNC_ADAPTIVE_MIN_PAGE_SCALE || 0.25);
  const adaptiveMinPageScale =
    Number.isFinite(adaptiveMinPageScaleRaw) && adaptiveMinPageScaleRaw > 0 && adaptiveMinPageScaleRaw <= 1
      ? adaptiveMinPageScaleRaw
      : 0.25;
  const adaptiveMaxTimeoutScaleRaw = Number(process.env.SYNC_ADAPTIVE_MAX_TIMEOUT_SCALE || 1.75);
  const adaptiveMaxTimeoutScale =
    Number.isFinite(adaptiveMaxTimeoutScaleRaw) && adaptiveMaxTimeoutScaleRaw >= 1
      ? adaptiveMaxTimeoutScaleRaw
      : 1.75;
  let adaptivePageScale = 1;
  let adaptiveTimeoutScale = 1;
  let adaptiveThrottleAdjustments = 0;
  let adaptiveRecoveryAdjustments = 0;
  const recentPressureSamples: Array<{ durationMs: number; failed: boolean }> = [];
  const syncTypeStats = new Map<
    string,
    { requestCount: number; successCount: number; errorCount: number; durationMs: number; recordsImported: number }
  >();
  const bufferedApiSyncLogs: Prisma.ApiSyncLogCreateManyInput[] = [];
  const apiSyncLogFlushSizeRaw = Number(process.env.SYNC_API_LOG_FLUSH_SIZE || 20);
  const apiSyncLogFlushSize = Number.isFinite(apiSyncLogFlushSizeRaw) && apiSyncLogFlushSizeRaw > 0
    ? Math.floor(apiSyncLogFlushSizeRaw)
    : 20;
  const apiSyncLogMaxBufferRaw = Number(process.env.SYNC_API_LOG_MAX_BUFFER || 200);
  const apiSyncLogMaxBuffer = Number.isFinite(apiSyncLogMaxBufferRaw) && apiSyncLogMaxBufferRaw >= apiSyncLogFlushSize
    ? Math.floor(apiSyncLogMaxBufferRaw)
    : Math.max(200, apiSyncLogFlushSize * 4);
  const apiSyncLogFlushIntervalMsRaw = Number(process.env.SYNC_API_LOG_FLUSH_INTERVAL_MS || 2500);
  const apiSyncLogFlushIntervalMs = Number.isFinite(apiSyncLogFlushIntervalMsRaw) && apiSyncLogFlushIntervalMsRaw > 0
    ? Math.floor(apiSyncLogFlushIntervalMsRaw)
    : 2500;
  let lastApiSyncLogFlushAtMs = Date.now();
  const flushBufferedApiSyncLogs = async (
    force = false,
    reason: 'size' | 'time' | 'backpressure' | 'final' = 'size'
  ) => {
    const nowMs = Date.now();
    const shouldFlushByTime = nowMs - lastApiSyncLogFlushAtMs >= apiSyncLogFlushIntervalMs;
    if (!force && bufferedApiSyncLogs.length < apiSyncLogFlushSize && !shouldFlushByTime) return;
    if (bufferedApiSyncLogs.length === 0) return;
    const shouldDrainAll = force || reason === 'backpressure';
    const batch = bufferedApiSyncLogs.splice(
      0,
      shouldDrainAll ? bufferedApiSyncLogs.length : Math.min(apiSyncLogFlushSize, bufferedApiSyncLogs.length)
    );
    try {
      await prisma.apiSyncLog.createMany({ data: batch });
      apiSyncLogFlushCount += 1;
      apiSyncLogRowsFlushed += batch.length;
      if (reason === 'backpressure') {
        apiSyncLogBackpressureFlushCount += 1;
      }
      lastApiSyncLogFlushAtMs = Date.now();
    } catch (error) {
      // Keep the sync alive if telemetry write fails.
      const message = error instanceof Error ? error.message : 'Failed to write ApiSyncLog batch';
      bufferedApiSyncLogWriteFailures += batch.length;
      errors.push(`apiSyncLog_write_batch: ${message}`);
      if (debugSync) {
        console.warn(
          JSON.stringify({
            event: 'sync_log_write_batch_failed',
            syncRunId,
            batchSize: batch.length,
            message,
          })
        );
      }
    }
  };
  const syncRunId = String(options?.syncRunId || '').trim() || randomUUID();
  const fanoutMaxPagesRaw = Number(process.env.SYNC_FANOUT_MAX_PAGES_PER_REQUEST || 60);
  const fanoutMaxPagesPerRequest =
    Number.isFinite(fanoutMaxPagesRaw) && fanoutMaxPagesRaw > 0
      ? Math.min(240, Math.max(MAX_CSI_PAGES_PER_REQUEST, Math.floor(fanoutMaxPagesRaw)))
      : 60;
  const fanoutGlPeriodMaxPagesRaw = Number(process.env.SYNC_FANOUT_GL_PERIOD_MAX_PAGES_PER_REQUEST || 120);
  const fanoutGlPeriodMaxPagesPerRequest =
    Number.isFinite(fanoutGlPeriodMaxPagesRaw) && fanoutGlPeriodMaxPagesRaw > 0
      ? Math.min(300, Math.max(fanoutMaxPagesPerRequest, Math.floor(fanoutGlPeriodMaxPagesRaw)))
      : 120;
  const rawIngestEnabled =
    String(process.env.INFOR_RAW_INGEST_ENABLED || '')
      .trim()
      .toLowerCase() === 'true';
  const rawIngestOnly =
    rawIngestEnabled &&
    String(process.env.INFOR_RAW_INGEST_ONLY || '')
      .trim()
      .toLowerCase() === 'true';
  const rawIngestRecordCapRaw = Number(process.env.INFOR_RAW_INGEST_RECORD_CAP_PER_BATCH || 5000);
  const rawIngestRecordCap =
    Number.isFinite(rawIngestRecordCapRaw) && rawIngestRecordCapRaw > 0
      ? Math.min(25000, Math.max(100, Math.floor(rawIngestRecordCapRaw)))
      : 5000;
  // Normalize to a UTC calendar day key so repeated runs do not create
  // mixed local-time snapshot variants (e.g. 00:00 and 07:00).
  const snapshotDate = startOfUtcDay(options?.snapshotDateOverride ? new Date(options.snapshotDateOverride) : new Date());

  const connectionRows = await prisma.$queryRaw<
    Array<{ accountingProgramsBySystem: unknown; accountingPrograms: unknown }>
  >`
    SELECT
      "connectionMetadata"->'accountingProgramsBySystem' AS "accountingProgramsBySystem",
      "connectionMetadata"->'accountingPrograms' AS "accountingPrograms"
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;
  const metadataRow = connectionRows[0];
  const metadata = {
    accountingProgramsBySystem:
      metadataRow?.accountingProgramsBySystem && typeof metadataRow.accountingProgramsBySystem === 'object'
        ? metadataRow.accountingProgramsBySystem
        : null,
    accountingPrograms:
      metadataRow?.accountingPrograms && Array.isArray(metadataRow.accountingPrograms)
        ? metadataRow.accountingPrograms
        : null,
  } as Record<string, unknown>;
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
  const csiFinancialIdoContract =
    inforSystem === 'INFOR_CSI' &&
    metadata.inforCsiFinancialIdoContract &&
    typeof metadata.inforCsiFinancialIdoContract === 'object' &&
    !Array.isArray(metadata.inforCsiFinancialIdoContract)
      ? (metadata.inforCsiFinancialIdoContract as CsiFinancialIdoContract)
      : null;
  const baseProgramRowsRaw = parsedProgramRows.length > 0 ? parsedProgramRows : DEFAULT_CSI_PROGRAM_ROWS;
  const baseProgramRows =
    inforSystem === 'INFOR_CSI'
      ? applyCsiFinancialIdoContract(baseProgramRowsRaw, csiFinancialIdoContract)
      : baseProgramRowsRaw;
  const isDailyBackfillWindow = frequency === 'daily' && syncWindow?.mode === 'backfill';
  const arOnlyBackfill = (() => {
    if (typeof options?.arOnlyBackfill === 'boolean') return options.arOnlyBackfill;
    if (typeof process.env.SYNC_AR_BACKFILL_AR_ONLY === 'string') return process.env.SYNC_AR_BACKFILL_AR_ONLY === '1';
    return isDailyBackfillWindow;
  })();
  const skipDailySnapshotHydrationForArBackfill = (() => {
    if (typeof options?.skipDailySnapshotHydration === 'boolean') return options.skipDailySnapshotHydration;
    if (typeof process.env.SYNC_AR_BACKFILL_SKIP_DAILY_SNAPSHOT === 'string') {
      return process.env.SYNC_AR_BACKFILL_SKIP_DAILY_SNAPSHOT === '1';
    }
    return isDailyBackfillWindow;
  })();
  const isArBackfillFastPath =
    isDailyBackfillWindow && arOnlyBackfill;
  const filteredProgramRows = isArBackfillFastPath
    ? baseProgramRows.filter((row) => classifyModule(row.module) === 'ar')
    : baseProgramRows;
  const salesOnly = options?.salesOnly === true;
  const SALES_ONLY_PROGRAM_IDS = new Set(['SLCOHDRS', 'SLCOS', 'SLCOITEMS']);
  const programRows = salesOnly
    ? filteredProgramRows.filter((row) => SALES_ONLY_PROGRAM_IDS.has(resolveCsiProgramId(row, row.endpointPath)))
    : filteredProgramRows;
  const hasSlCustDrftsProgram = programRows.some(
    (row) => row.enabled && resolveCsiProgramId(row, row.endpointPath) === 'SLCUSTDRFTS'
  );
  const totalProgramRows = programRows.length;
  const programOffset = Math.max(0, Math.floor(Number(options?.programOffset || 0)));
  const requestedLimit =
    options?.programLimit && Number.isFinite(options.programLimit) && Number(options.programLimit) > 0
      ? Math.floor(Number(options.programLimit))
      : totalProgramRows;
  const requestedProgramEndOffset =
    options?.programEndOffset !== undefined &&
    options?.programEndOffset !== null &&
    Number.isFinite(Number(options.programEndOffset))
      ? Math.floor(Number(options.programEndOffset))
      : null;
  const effectiveProgramEndOffset =
    requestedProgramEndOffset === null
      ? totalProgramRows
      : Math.min(totalProgramRows, Math.max(programOffset, requestedProgramEndOffset));
  const programRowsToProcess = programRows.slice(
    programOffset,
    Math.min(programOffset + requestedLimit, effectiveProgramEndOffset)
  );
  const nextProgramOffset =
    programOffset + programRowsToProcess.length < effectiveProgramEndOffset
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
  const glAccountMasterById = new Map<string, GlAccountMasterEntry>();
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
    const slcosRequestedSite = String(slcosRow.site || siteOverride || '').trim();
    const headers: Record<string, string> = {};
    if (slcosRow.mongooseConfig) headers['X-Infor-MongooseConfig'] = slcosRow.mongooseConfig;
    if (slcosRequestedSite) headers['X-Infor-Site'] = slcosRequestedSite;
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
    const requestedSite = String(row.site || siteOverride || '').trim();

    if (row.endpointPath || (row.miProgram && row.miProgram.toUpperCase().startsWith('SL'))) {
      const endpointPath = buildCsiEndpointPath(row);
      if (endpointPath) {
        const requestHeaders: Record<string, string> = {};
        if (row.mongooseConfig) requestHeaders['X-Infor-MongooseConfig'] = row.mongooseConfig;
        if (requestedSite) requestHeaders['X-Infor-Site'] = requestedSite;
        requests.push({
          transaction: row.endpointPath ? 'CSI_LOAD' : 'CSI_AUTO',
          endpointPath,
          headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
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
      const syncType = `operational_${moduleType}_${req.transaction}`;
      const programId = resolveCsiProgramId(row, req.endpointPath);
      const isSlCoitemsProgram = moduleType === 'sales' && programId === 'SLCOITEMS';
      const isSlArtransProgram = moduleType === 'ar' && programId === 'SLARTRANS';
      const isGlAcctPeriodBalancesProgram = moduleType === 'gl' && programId === 'GLACCTPERIODBALANCES';
      const isHistoricalDailySliceRequest = frequency === 'daily' && Boolean(options?.snapshotDateOverride);
      const isFanoutHistoricalDailySlice = isHistoricalDailySliceRequest && options?.businessDayFanout === true;
      const isArBackfillWindow = moduleType === 'ar' && syncWindow?.mode === 'backfill';
      const baseRequestTimeoutMs = moduleType === 'inventory' || isArBackfillWindow ? 120000 : 30000;
      const requestTimeoutMs = Math.max(
        baseRequestTimeoutMs,
        Math.floor(baseRequestTimeoutMs * adaptiveTimeoutScale)
      );
      // Keep SLCoitems chunk duration bounded so each sync call returns promptly
      // with a continuation cursor instead of appearing "stuck" on one huge page pull.
      const baseMaxPagesPerRequest =
        isSlCoitemsProgram
          ? 8
          : isGlAcctPeriodBalancesProgram && isFanoutHistoricalDailySlice
            ? fanoutGlPeriodMaxPagesPerRequest
            : isFanoutHistoricalDailySlice
              ? fanoutMaxPagesPerRequest
          : isSlArtransProgram && isHistoricalDailySliceRequest
            ? 2
            : MAX_CSI_PAGES_PER_REQUEST;
      const maxPagesPerRequest = Math.max(1, Math.floor(baseMaxPagesPerRequest * adaptivePageScale));
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
                programEndOffset:
                  effectiveProgramEndOffset < totalProgramRows ? effectiveProgramEndOffset : undefined,
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
              programEndOffset:
                effectiveProgramEndOffset < totalProgramRows ? effectiveProgramEndOffset : undefined,
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
      // GL/other site-agnostic modules should not be narrowed to a single site code.
      // Restrict explicit site filtering to modules that declare required/optional site policy.
      const recordsAfterSiteFilter =
        sitePolicy === 'none'
          ? rawRecords
          : filterRecordsBySiteIfSupported(rawRecords, row.site);
      // For daily-overlap syncs only, keep full open-item populations for AR/AP
      // snapshots. Backfill/manual modes must honor the date window so each day
      // is rebuilt from that day slice instead of replaying one global snapshot.
      const isArOpenSnapshotProgram =
        moduleType === 'ar' &&
        ['SLARTRANS', 'SLCUSTDRFTS'].includes(String(row.miProgram || '').trim().toUpperCase());
      const isApOpenSupportProgram =
        moduleType === 'ap' &&
        ['SLAPTRXPS', 'SLAPPMTS', 'SLAPTRXP', 'SLAPTRXS'].includes(String(row.miProgram || '').trim().toUpperCase());
      const isApOpenSnapshotProgram =
        moduleType === 'ap' &&
        ['SLVCHHDRS'].includes(String(row.miProgram || '').trim().toUpperCase());
      const isArApOpenFlow =
        ((moduleType === 'ar' || moduleType === 'ap') && arApFlow === 'open') || isArOpenSnapshotProgram;
      const keepFullArApPopulation =
        isArOpenSnapshotProgram ||
        isApOpenSnapshotProgram ||
        isApOpenSupportProgram ||
        (isArApOpenFlow && syncWindow?.mode === 'daily_overlap');
      // Contract/backlog math from SLCoitems requires full line populations for rolling
      // daily-overlap runs. For backfill/manual slices, date-window filtering is required
      // to avoid replaying the same historical order lines into every business date.
      const isOrderLineProgram = moduleType === 'sales' && programId === 'SLCOITEMS';
      const keepFullOrderLinePopulation = isOrderLineProgram && syncWindow?.mode === 'daily_overlap';
      const shouldApplyDateWindow =
        !keepFullArApPopulation && !keepFullOrderLinePopulation;
      const recordsAfterDateWindow = shouldApplyDateWindow
        ? filterRecordsByDateWindow(recordsAfterSiteFilter, moduleType, syncWindow)
        : recordsAfterSiteFilter;
      const rawRecordsForIngest = shouldApplyDateWindow
        ? recordsAfterDateWindow
        : recordsAfterSiteFilter;
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
        if (rawIngestOnly) {
          moduleRecordsCreated = rawRecords.length;
        } else {
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
                const glProgram = String(programId || row.miProgram || '').trim().toUpperCase();
                if (GL_ACCOUNT_MASTER_PROGRAM_IDS.has(glProgram)) {
                  for (const record of records) {
                    const parsed = parseGlAccountMasterEntry(record);
                    if (!parsed) continue;
                    const key = normalizeGlAccountKey(parsed.accountId);
                    if (!key) continue;
                    const existing = glAccountMasterById.get(key);
                    if (!existing) {
                      glAccountMasterById.set(key, parsed);
                      continue;
                    }
                    glAccountMasterById.set(key, {
                      accountId: existing.accountId || parsed.accountId,
                      accountName: existing.accountName || parsed.accountName,
                      accountType: existing.accountType || parsed.accountType,
                      accountCategory: existing.accountCategory || parsed.accountCategory,
                    });
                  }
                }
                const glContext = {
                  miProgram: row.miProgram || row.module,
                  transaction: req.transaction,
                  cono: row.cono,
                  divi: row.divi,
                };
                const glFactRowsCreated =
                  glProgram === 'SLGLTRANS'
                    ? await saveGLTransactionFacts(companyId, records, glContext, glAccountMasterById)
                    : 0;
                if (glProgram === 'SLGLTRANS') {
                moduleRecordsCreated =
                  glFactRowsCreated +
                  (await saveBalanceMovementsFromGl(
                    companyId,
                    frequency,
                    records,
                    glAccountMasterById
                  ));
                } else {
                  moduleRecordsCreated = records.length;
                }
              }
              break;
            case 'ar':
              {
                const arProgramId = programId;
                const isSlArtransProgram = arProgramId === 'SLARTRANS';
                const isSlCustDrftsProgram = arProgramId === 'SLCUSTDRFTS';
                const isHistoricalDailySlice = frequency === 'daily' && Boolean(options?.snapshotDateOverride);
                const context = {
                  miProgram: row.miProgram || row.module,
                  transaction: req.transaction,
                  cono: row.cono,
                  divi: row.divi,
                  resetSnapshot: !options?.bookmark,
                };
                if (arApFlow === 'payments') {
                  moduleRecordsCreated = await saveARPayments(companyId, records, context);
                  if (!isHistoricalDailySlice) {
                    await upsertArContractSupportTables(companyId, snapshotDate, frequency);
                  }
                } else if (arApFlow === 'open') {
                  // Prefer SLCustDrfts for open-item snapshots whenever configured.
                  // Keep SLArtrans for payment/reconciliation facts to avoid double counting open AR.
                  const preferCustDrftsForOpen =
                    hasSlCustDrftsProgram && isSlArtransProgram;
                  const skipCustDrftsOpenForHistoricalSlice = false;
                  const skipOpenForProgram = preferCustDrftsForOpen || skipCustDrftsOpenForHistoricalSlice;
                  const openRowsCreated = skipOpenForProgram
                    ? 0
                    : await saveAROpenInvoices(companyId, snapshotDate, frequency, records, context);
                  const agingRowsCreated = skipOpenForProgram
                    ? 0
                    : await saveARAging(companyId, snapshotDate, frequency, records);
                  const paymentRowsCreated =
                    isSlCustDrftsProgram || isHistoricalDailySlice ? 0 : await saveARPayments(companyId, records, context);
                  moduleRecordsCreated = openRowsCreated + agingRowsCreated + paymentRowsCreated;
                  if (!isHistoricalDailySlice) {
                    await upsertArContractSupportTables(companyId, snapshotDate, frequency);
                  }
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
                const apProgramId = String(row.miProgram || '').trim().toUpperCase();
                const forcePaymentProgram =
                  apProgramId === 'SLAPTRX' ||
                  apProgramId === 'SLAPTRXS' ||
                  apProgramId === 'SLAPTRXPS' ||
                  apProgramId === 'SLAPPMTS' ||
                  apProgramId === 'SLAPTRXP';
                if (forcePaymentProgram || arApFlow === 'payments') {
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
                const invoiceHeaderRowsCreated =
                  salesProgram === 'SLINVHDRS'
                    ? await saveSalesInvoiceHeaders(companyId, snapshotDate, frequency, recordsAfterDateWindow, {
                        ...context,
                        resetSnapshot: !options?.bookmark,
                      })
                    : 0;
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
                moduleRecordsCreated = salesRowsCreated + contractRowsCreated + invoiceHeaderRowsCreated;
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
        }
      } else {
        errors.push(
          `${row.module}/${row.miProgram || row.endpointPath || req.transaction}: ${payloadMsg} (credentials source: ${credentialSource})`
        );
      }

      recordsCreated += moduleRecordsCreated;
      const requestDurationMs = Date.now() - startedAt;
      requestCount += 1;
      requestDurationTotalMs += requestDurationMs;
      if (statusText === 'success') {
        successRequestCount += 1;
      } else {
        failedRequestCount += 1;
      }
      const existingSyncTypeStats = syncTypeStats.get(syncType) || {
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        durationMs: 0,
        recordsImported: 0,
      };
      existingSyncTypeStats.requestCount += 1;
      existingSyncTypeStats.durationMs += requestDurationMs;
      existingSyncTypeStats.recordsImported += moduleRecordsCreated;
      if (statusText === 'success') {
        existingSyncTypeStats.successCount += 1;
      } else {
        existingSyncTypeStats.errorCount += 1;
      }
      syncTypeStats.set(syncType, existingSyncTypeStats);
      if (adaptivePressureEnabled) {
        recentPressureSamples.push({
          durationMs: requestDurationMs,
          failed: statusText !== 'success',
        });
        while (recentPressureSamples.length > adaptivePressureWindow) {
          recentPressureSamples.shift();
        }
        const sampleCount = recentPressureSamples.length;
        if (sampleCount >= Math.min(8, adaptivePressureWindow)) {
          const totalDuration = recentPressureSamples.reduce((sum, sample) => sum + sample.durationMs, 0);
          const failedCount = recentPressureSamples.reduce((sum, sample) => sum + (sample.failed ? 1 : 0), 0);
          const avgDurationMs = totalDuration / sampleCount;
          const errorRate = failedCount / sampleCount;
          const shouldThrottle = avgDurationMs >= adaptiveSlowRequestMs || errorRate >= adaptiveHighErrorRate;
          const shouldRecover = avgDurationMs <= adaptiveRecoverRequestMs && errorRate <= adaptiveLowErrorRate;
          if (shouldThrottle) {
            const nextPageScale = Math.max(adaptiveMinPageScale, Number((adaptivePageScale - 0.1).toFixed(2)));
            const nextTimeoutScale = Math.min(adaptiveMaxTimeoutScale, Number((adaptiveTimeoutScale + 0.1).toFixed(2)));
            if (nextPageScale !== adaptivePageScale || nextTimeoutScale !== adaptiveTimeoutScale) {
              adaptivePageScale = nextPageScale;
              adaptiveTimeoutScale = nextTimeoutScale;
              adaptiveThrottleAdjustments += 1;
            }
          } else if (shouldRecover) {
            const nextPageScale = Math.min(1, Number((adaptivePageScale + 0.1).toFixed(2)));
            const nextTimeoutScale = Math.max(1, Number((adaptiveTimeoutScale - 0.1).toFixed(2)));
            if (nextPageScale !== adaptivePageScale || nextTimeoutScale !== adaptiveTimeoutScale) {
              adaptivePageScale = nextPageScale;
              adaptiveTimeoutScale = nextTimeoutScale;
              adaptiveRecoveryAdjustments += 1;
            }
          }
        }
      }

      try {
        if (rawIngestEnabled) {
          const ingestedRecords = rawRecordsForIngest.slice(0, rawIngestRecordCap);
          const batchId = randomUUID();
          const syncWindowStartIso = syncWindow?.startDate ? syncWindow.startDate.toISOString() : null;
          const bookmarkOut =
            continuation &&
            continuation.programOffset === absoluteProgramOffset &&
            continuation.requestOffset === reqIndex
              ? continuation.bookmark
              : null;
          const payloadHash = createHash('sha256')
            .update(
              `${companyId}|${syncRunId}|${moduleType}|${programId || ''}|${req.transaction}|${effectiveEndpointPath}|${rawRecordsForIngest.length}|${requestDurationMs}|${response.status}`
            )
            .digest('hex');
          await (prisma as any).inforRawBatch.create({
            data: {
              id: batchId,
              companyId,
              platform: 'INFOR_M3',
              syncRunId,
              frequency,
              mode: syncWindow?.mode || null,
              windowStart: syncWindow?.startDate || null,
              windowEnd: syncWindow?.endDate || null,
              businessDate: snapshotDate,
              module: row.module || null,
              miProgram: row.miProgram || null,
              transaction: req.transaction || null,
              endpointPath: effectiveEndpointPath || null,
              pageNo: pagesFetched,
              bookmarkIn: inputBookmark,
              bookmarkOut,
              recordCount: ingestedRecords.length,
              httpStatus: response.status,
              durationMs: requestDurationMs,
              payloadHash,
              status: statusText,
              errorMessage: statusText === 'success' ? null : payloadMsg || null,
            },
          });
          if (ingestedRecords.length > 0) {
            const rawRows = ingestedRecords.map((record) => {
              const payloadJson = JSON.stringify(record);
              const sourceRecordHash = createHash('sha256').update(payloadJson).digest('hex');
              return {
                id: randomUUID(),
                batchId,
                companyId,
                platform: 'INFOR_M3',
                syncRunId,
                businessDate: snapshotDate,
                module: row.module || null,
                miProgram: row.miProgram || null,
                transaction: req.transaction || null,
                sourceRecordId: resolveRawSourceRecordId(record),
                sourceRecordHash,
                payload: record as Prisma.InputJsonValue,
                fetchedAt: new Date(),
              };
            });
            await (prisma as any).inforRawRecord.createMany({
              data: rawRows,
              skipDuplicates: true,
            });
          }
          const sourceKey = resolveRawCompletenessSourceKey(moduleType);
          if (sourceKey && syncWindowStartIso) {
            await prisma.$executeRaw`
              INSERT INTO "InforRawCompleteness"
                ("id","companyId","platform","syncRunId","businessDate","sourceKey","isComplete","lastBatchId","statusMessage","lastSeenAt","createdAt","updatedAt")
              VALUES
                (${randomUUID()}, ${companyId}, 'INFOR_M3', ${syncRunId}, ${snapshotDate}, ${sourceKey}, false, ${batchId}, ${`ingested_chunk:${statusText}`}, NOW(), NOW(), NOW())
              ON CONFLICT ("companyId","platform","syncRunId","businessDate","sourceKey")
              DO UPDATE SET
                "lastBatchId" = EXCLUDED."lastBatchId",
                "statusMessage" = EXCLUDED."statusMessage",
                "lastSeenAt" = NOW(),
                "updatedAt" = NOW()
            `;
          }
        }

        const responseBodyForLog = isHistoricalDailySliceRequest ? null : response.body;
        bufferedApiSyncLogs.push({
          companyId,
          platform: 'INFOR_M3',
          syncType,
          status: statusText,
          recordsImported: moduleRecordsCreated,
          errorCount: statusText === 'success' ? 0 : 1,
          duration: requestDurationMs,
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
            storedRawRecordCount: rawRecordsForIngest.length,
            postWindowRecordCount: recordsAfterDateWindow.length,
            persistedRecordCount: records.length,
            companyRollupApplied: shouldAggregateForRollup,
            pagesFetched,
            paginationTruncated,
            rawIngestEnabled,
            rawIngestOnly,
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
            response: responseBodyForLog,
          } as unknown as Prisma.InputJsonValue),
        });
        if (bufferedApiSyncLogs.length >= apiSyncLogMaxBuffer) {
          await flushBufferedApiSyncLogs(false, 'backpressure');
        } else {
          await flushBufferedApiSyncLogs(false, 'size');
          await flushBufferedApiSyncLogs(false, 'time');
        }
      } catch (logWriteError) {
        // Keep the operational sync moving even if telemetry logging fails.
        const logWriteMessage =
          logWriteError instanceof Error ? logWriteError.message : 'Failed to buffer ApiSyncLog';
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
      programEndOffset:
        effectiveProgramEndOffset < totalProgramRows ? effectiveProgramEndOffset : undefined,
    };
  }

  if (!continuation && !rawIngestOnly) {
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
    const shouldSkipDailySnapshotHydration =
      frequency === 'daily' &&
      syncWindow?.mode === 'backfill' &&
      (isArBackfillFastPath || skipDailySnapshotHydrationForArBackfill);
    if (!shouldSkipDailySnapshotHydration) {
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
  }

  while (bufferedApiSyncLogs.length > 0) {
    await flushBufferedApiSyncLogs(true, 'final');
  }

  if (!options?.skipPrune && !continuation && !rawIngestOnly) {
    await pruneCompanyOperationalData(companyId);
  }
  const syncTypeBreakdown = Array.from(syncTypeStats.entries())
    .map(([syncType, stats]) => {
      const avgDurationMs = stats.requestCount > 0 ? Math.round(stats.durationMs / stats.requestCount) : 0;
      const recordsPerSecond = stats.durationMs > 0
        ? Number(((stats.recordsImported * 1000) / stats.durationMs).toFixed(2))
        : 0;
      return {
        syncType,
        requestCount: stats.requestCount,
        successCount: stats.successCount,
        errorCount: stats.errorCount,
        recordsImported: stats.recordsImported,
        totalDurationMs: stats.durationMs,
        avgDurationMs,
        recordsPerSecond,
      };
    })
    .sort((a, b) => b.recordsImported - a.recordsImported);

  try {
    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'INFOR_M3',
        syncType: 'operational_run_summary',
        status: errors.length === 0 ? 'success' : 'warning',
        recordsImported: recordsCreated,
        errorCount: errors.length,
        duration: Date.now() - syncStartedAtMs,
        errorDetails: {
          syncRunId,
          frequency,
          hasMore: continuation !== null,
          totalProgramRows,
          requestCount,
          successRequestCount,
          failedRequestCount,
          avgRequestDurationMs: requestCount > 0 ? Math.round(requestDurationTotalMs / requestCount) : 0,
          apiSyncLogFlushCount,
          apiSyncLogRowsFlushed,
          apiSyncLogBackpressureFlushCount,
          apiSyncLogBufferedWriteFailures: bufferedApiSyncLogWriteFailures,
          adaptivePressure: {
            enabled: adaptivePressureEnabled,
            windowSize: adaptivePressureWindow,
            slowRequestMs: adaptiveSlowRequestMs,
            recoverRequestMs: adaptiveRecoverRequestMs,
            highErrorRate: adaptiveHighErrorRate,
            lowErrorRate: adaptiveLowErrorRate,
            minPageScale: adaptiveMinPageScale,
            maxTimeoutScale: adaptiveMaxTimeoutScale,
            finalPageScale: adaptivePageScale,
            finalTimeoutScale: adaptiveTimeoutScale,
            throttleAdjustments: adaptiveThrottleAdjustments,
            recoveryAdjustments: adaptiveRecoveryAdjustments,
            sampledRequests: recentPressureSamples.length,
          },
          syncTypeBreakdown,
          rawIngest: {
            enabled: rawIngestEnabled,
            ingestOnly: rawIngestOnly,
            recordCapPerBatch: rawIngestRecordCap,
          },
          runMode: syncWindow?.mode || null,
          syncWindow: syncWindow
            ? {
                startDate: syncWindow.startDate.toISOString(),
                endDate: syncWindow.endDate.toISOString(),
              }
            : null,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (summaryLogError) {
    const message =
      summaryLogError instanceof Error ? summaryLogError.message : 'Failed to write operational run summary log';
    errors.push(`apiSyncLog_summary_write: ${message}`);
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

type InforRawTransformResult = {
  success: boolean;
  daysProcessed: number;
  rawRecordsRead: number;
  recordsCreated: number;
  errors: string[];
};

function asRawRecordPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function transformInforM3RawRun(options: {
  companyId: string;
  syncRunId: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  businessDateIso?: string;
  maxBusinessDates?: number;
  batchSize?: number;
}): Promise<InforRawTransformResult> {
  const companyId = String(options.companyId || '').trim();
  const syncRunId = String(options.syncRunId || '').trim();
  const frequency = options.frequency || 'daily';
  const errors: string[] = [];
  if (!companyId) return { success: false, daysProcessed: 0, rawRecordsRead: 0, recordsCreated: 0, errors: ['Missing companyId'] };
  if (!syncRunId) return { success: false, daysProcessed: 0, rawRecordsRead: 0, recordsCreated: 0, errors: ['Missing syncRunId'] };

  const maxBusinessDatesRaw = Number(options.maxBusinessDates || 0);
  const maxBusinessDates =
    Number.isFinite(maxBusinessDatesRaw) && maxBusinessDatesRaw > 0
      ? Math.min(366, Math.max(1, Math.floor(maxBusinessDatesRaw)))
      : null;
  const batchSizeRaw = Number(options.batchSize || 2000);
  const batchSize =
    Number.isFinite(batchSizeRaw) && batchSizeRaw > 0
      ? Math.min(10000, Math.max(250, Math.floor(batchSizeRaw)))
      : 2000;

  const requestedBusinessDate = String(options.businessDateIso || '').trim();
  const businessDateFilter =
    requestedBusinessDate.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(requestedBusinessDate)
      ? requestedBusinessDate
      : null;

  const businessDateRows = await prisma.$queryRaw<Array<{ businessDate: Date }>>`
    SELECT DISTINCT "businessDate"
    FROM "InforRawBatch"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND "syncRunId" = ${syncRunId}
      ${businessDateFilter ? Prisma.sql`AND "businessDate" = ${new Date(`${businessDateFilter}T00:00:00.000Z`)}` : Prisma.sql``}
    ORDER BY "businessDate" ASC
    ${maxBusinessDates ? Prisma.sql`LIMIT ${maxBusinessDates}` : Prisma.sql``}
  `;

  let daysProcessed = 0;
  let rawRecordsRead = 0;
  let recordsCreated = 0;
  for (const businessDateRow of businessDateRows) {
    const snapshotDate = startOfUtcDay(new Date(businessDateRow.businessDate));
    const rawByModuleProgram = new Map<string, {
      moduleType: ReturnType<typeof classifyModule>;
      module: string;
      miProgram: string;
      transaction: string;
      records: Record<string, unknown>[];
    }>();

    let cursorId: string | null = null;
    while (true) {
      const rows = await (prisma as any).inforRawRecord.findMany({
        where: {
          companyId,
          platform: 'INFOR_M3',
          syncRunId,
          businessDate: snapshotDate,
        },
        select: {
          id: true,
          module: true,
          miProgram: true,
          transaction: true,
          payload: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        take: batchSize,
      });
      if (!rows.length) break;
      for (const row of rows) {
        const payload = asRawRecordPayload(row.payload);
        if (!payload) continue;
        const module = String(row.module || '').trim();
        const miProgram = String(row.miProgram || '').trim().toUpperCase();
        const transaction = String(row.transaction || 'CSI_LOAD').trim() || 'CSI_LOAD';
        const moduleType = classifyModule(module);
        const key = `${moduleType}||${miProgram}||${transaction}`;
        const existing = rawByModuleProgram.get(key);
        if (existing) {
          existing.records.push(payload);
        } else {
          rawByModuleProgram.set(key, {
            moduleType,
            module,
            miProgram,
            transaction,
            records: [payload],
          });
        }
      }
      rawRecordsRead += rows.length;
      cursorId = String(rows[rows.length - 1].id);
    }

    const glAccountMasterById = new Map<string, GlAccountMasterEntry>();
    for (const item of Array.from(rawByModuleProgram.values())) {
      if (item.moduleType !== 'gl' || !GL_ACCOUNT_MASTER_PROGRAM_IDS.has(item.miProgram)) continue;
      for (const record of item.records) {
        const parsed = parseGlAccountMasterEntry(record);
        if (!parsed) continue;
        const key = normalizeGlAccountKey(parsed.accountId);
        if (!key) continue;
        const existing = glAccountMasterById.get(key);
        if (!existing) {
          glAccountMasterById.set(key, parsed);
          continue;
        }
        glAccountMasterById.set(key, {
          accountId: existing.accountId || parsed.accountId,
          accountName: existing.accountName || parsed.accountName,
          accountType: existing.accountType || parsed.accountType,
          accountCategory: existing.accountCategory || parsed.accountCategory,
        });
      }
    }

    try {
      const cashRecords = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'cash')
        .flatMap((item) => item.records);
      if (cashRecords.length > 0) {
        recordsCreated += await saveCash(companyId, snapshotDate, frequency, cashRecords);
      }

      const arCustDrfts = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'ar' && item.miProgram === 'SLCUSTDRFTS')
        .flatMap((item) => item.records);
      const arTrans = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'ar' && item.miProgram === 'SLARTRANS')
        .flatMap((item) => item.records);
      const arOpenSource = arCustDrfts.length > 0 ? arCustDrfts : arTrans;
      if (arOpenSource.length > 0) {
        recordsCreated += await saveAROpenInvoices(companyId, snapshotDate, frequency, arOpenSource, {
          miProgram: arCustDrfts.length > 0 ? 'SLCUSTDRFTS' : 'SLARTRANS',
          transaction: 'RAW_REPLAY',
          resetSnapshot: true,
        });
        recordsCreated += await saveARAging(companyId, snapshotDate, frequency, arOpenSource);
      }
      if (arTrans.length > 0) {
        recordsCreated += await saveARPayments(companyId, arTrans, {
          miProgram: 'SLARTRANS',
          transaction: 'RAW_REPLAY',
        });
        await upsertArContractSupportTables(companyId, snapshotDate, frequency);
      }

      const apPayments = Array.from(rawByModuleProgram.values())
        .filter((item) =>
          item.moduleType === 'ap' &&
          ['SLAPTRX', 'SLAPTRXS', 'SLAPTRXPS', 'SLAPPMTS', 'SLAPTRXP'].includes(item.miProgram)
        )
        .flatMap((item) => item.records);
      const apOpen = Array.from(rawByModuleProgram.values())
        .filter((item) =>
          item.moduleType === 'ap' &&
          !['SLAPTRX', 'SLAPTRXS', 'SLAPTRXPS', 'SLAPPMTS', 'SLAPTRXP'].includes(item.miProgram)
        )
        .flatMap((item) => item.records);
      if (apOpen.length > 0) {
        recordsCreated += await saveAPOpenBills(companyId, snapshotDate, frequency, apOpen, {
          miProgram: 'AP_OPEN',
          transaction: 'RAW_REPLAY',
        });
        recordsCreated += await saveAPAging(companyId, snapshotDate, frequency, apOpen);
      }
      if (apPayments.length > 0) {
        recordsCreated += await saveAPPayments(companyId, apPayments, {
          miProgram: 'AP_PAYMENTS',
          transaction: 'RAW_REPLAY',
        });
      }

      const glTrans = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'gl' && item.miProgram === 'SLGLTRANS')
        .flatMap((item) => item.records);
      if (glTrans.length > 0) {
        recordsCreated += await saveGLTransactionFacts(
          companyId,
          glTrans,
          { miProgram: 'SLGLTRANS', transaction: 'RAW_REPLAY' },
          glAccountMasterById
        );
        recordsCreated += await saveBalanceMovementsFromGl(companyId, frequency, glTrans, glAccountMasterById);
      }

      const customerRecords = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'customer')
        .flatMap((item) => item.records);
      if (customerRecords.length > 0) {
        recordsCreated += await saveCustomerSales(companyId, snapshotDate, frequency, customerRecords);
      }

      const inventoryRecords = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'inventory')
        .flatMap((item) => item.records);
      if (inventoryRecords.length > 0) {
        recordsCreated += await saveInventory(companyId, snapshotDate, frequency, inventoryRecords);
      }

      const salesRecords = Array.from(rawByModuleProgram.values())
        .filter((item) => item.moduleType === 'sales')
        .flatMap((item) => item.records);
      if (salesRecords.length > 0) {
        recordsCreated += await saveProductSales(companyId, snapshotDate, frequency, salesRecords);
      }

      await prisma.aROpenInvoiceSnapshot.deleteMany({
        where: {
          companyId,
          frequency,
          snapshotDate: { gte: snapshotDate, lt: new Date(snapshotDate.getTime() + 24 * 60 * 60 * 1000) },
          amountDueHome: { lte: 0 },
        },
      });
      await upsertDailyFinancialSnapshotFromOperationalTables(companyId, snapshotDate, frequency);
      await (prisma as any).inforRawCompleteness.updateMany({
        where: {
          companyId,
          platform: 'INFOR_M3',
          syncRunId,
          businessDate: snapshotDate,
        },
        data: {
          isComplete: true,
          statusMessage: 'transformed',
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      });
      daysProcessed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Raw transform day processing failed';
      await (prisma as any).inforRawCompleteness.updateMany({
        where: {
          companyId,
          platform: 'INFOR_M3',
          syncRunId,
          businessDate: snapshotDate,
        },
        data: {
          isComplete: false,
          statusMessage: `transform_failed:${String(message).slice(0, 240)}`,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      });
      errors.push(`${snapshotDate.toISOString().slice(0, 10)}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    daysProcessed,
    rawRecordsRead,
    recordsCreated,
    errors,
  };
}

export async function processPendingInforRawTransforms(options?: {
  maxDaysPerTick?: number;
}): Promise<{
  processedDays: number;
  failedDays: number;
  results: Array<{ companyId: string; syncRunId: string; businessDateIso: string; ok: boolean; errors: string[] }>;
}> {
  const limitRaw = Number(options?.maxDaysPerTick || 1);
  const maxDaysPerTick =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
      : 1;

  const pendingDays = await prisma.$queryRaw<Array<{
    companyId: string;
    syncRunId: string;
    businessDate: Date;
    frequency: string | null;
    oldestUpdatedAt: Date;
    runPriorityAt: Date | null;
  }>>`
    SELECT
      rc."companyId",
      rc."syncRunId",
      rc."businessDate",
      sr."frequency",
      MIN(rc."updatedAt") AS "oldestUpdatedAt",
      MAX(COALESCE(sr."finishedAt", sr."updatedAt", sr."createdAt")) AS "runPriorityAt"
    FROM "InforRawCompleteness" rc
    INNER JOIN "InforSyncRun" sr
      ON sr.id = rc."syncRunId"
      AND sr.status = 'done'
    WHERE rc.platform = 'INFOR_M3'
      AND rc."isComplete" = false
    GROUP BY rc."companyId", rc."syncRunId", rc."businessDate", sr."frequency"
    ORDER BY
      MAX(COALESCE(sr."finishedAt", sr."updatedAt", sr."createdAt")) DESC NULLS LAST,
      MIN(rc."updatedAt") ASC
    LIMIT ${maxDaysPerTick}
  `;

  let processedDays = 0;
  let failedDays = 0;
  const results: Array<{ companyId: string; syncRunId: string; businessDateIso: string; ok: boolean; errors: string[] }> = [];

  for (const row of pendingDays) {
    const businessDateIso = startOfUtcDay(new Date(row.businessDate)).toISOString().slice(0, 10);
    const frequencyRaw = String(row.frequency || '').trim().toLowerCase();
    const frequency: 'daily' | 'weekly' | 'monthly' =
      frequencyRaw === 'weekly' ? 'weekly' : frequencyRaw === 'monthly' ? 'monthly' : 'daily';

    const transformed = await transformInforM3RawRun({
      companyId: String(row.companyId),
      syncRunId: String(row.syncRunId),
      frequency,
      businessDateIso,
      maxBusinessDates: 1,
    });
    const ok = transformed.success;
    if (ok) processedDays += 1;
    else failedDays += 1;
    results.push({
      companyId: String(row.companyId),
      syncRunId: String(row.syncRunId),
      businessDateIso,
      ok,
      errors: transformed.errors,
    });
  }

  return { processedDays, failedDays, results };
}
