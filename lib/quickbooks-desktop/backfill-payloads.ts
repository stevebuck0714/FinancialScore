import prisma from '@/lib/prisma';
import type { QbDesktopOperationalPayload } from '@/lib/quickbooks-desktop/operational-sync';

export type QbdResponseSet = {
  receivedAt: string;
  records: Array<Record<string, unknown>>;
  recordCount?: number;
};

export type QbdPayloadSession = {
  ticket: string;
  requests: string[];
  responses: Record<string, QbdResponseSet>;
  dateRange: {
    mode: 'INITIAL_3Y' | 'INCREMENTAL' | 'MANUAL';
    startDate: string;
    endDate: string;
    requestedAt?: string;
  };
};

type QbdBackfillJobLike = {
  id?: unknown;
  status?: unknown;
  requestName?: unknown;
  dateRange?: unknown;
  createdAt?: unknown;
};

type CompletedBackfillJob = {
  id: string;
  requestName: string;
  createdAt: string;
  dateRange: unknown;
};

const RET_TAG_BY_REQUEST: Record<string, string> = {
  AccountQuery: 'AccountRet',
  CustomerQuery: 'CustomerRet',
  VendorQuery: 'VendorRet',
  OtherNameQuery: 'OtherNameRet',
  EntityQuery: 'EntityRet',
  InvoiceQuery: 'InvoiceRet',
  BillQuery: 'BillRet',
  ReceivePaymentQuery: 'ReceivePaymentRet',
  ItemQuery: 'ItemRet',
  ClassQuery: 'ClassRet',
  CustomerTypeQuery: 'CustomerTypeRet',
  JobTypeQuery: 'JobTypeRet',
  EmployeeQuery: 'EmployeeRet',
  SalesRepQuery: 'SalesRepRet',
  TermsQuery: 'TermsRet',
  PaymentMethodQuery: 'PaymentMethodRet',
  SalesTaxCodeQuery: 'SalesTaxCodeRet',
  SalesReceiptQuery: 'SalesReceiptRet',
  DepositQuery: 'DepositRet',
  CreditMemoQuery: 'CreditMemoRet',
  EstimateQuery: 'EstimateRet',
  SalesOrderQuery: 'SalesOrderRet',
  BillPaymentCheckQuery: 'BillPaymentCheckRet',
  BillPaymentCreditCardQuery: 'BillPaymentCreditCardRet',
  VendorCreditQuery: 'VendorCreditRet',
  CheckQuery: 'CheckRet',
  CreditCardChargeQuery: 'CreditCardChargeRet',
  PurchaseOrderQuery: 'PurchaseOrderRet',
  ItemReceiptQuery: 'ItemReceiptRet',
  JournalEntryQuery: 'JournalEntryRet',
  TransferQuery: 'TransferRet',
  InventoryAdjustmentQuery: 'InventoryAdjustmentRet',
  InventorySiteQuery: 'InventorySiteRet',
  BalanceSheetStandardReportQuery: 'ReportRet',
  TrialBalanceReportQuery: 'ReportRet',
  GeneralDetailReportQuery: 'ReportRet',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getRef(record: Record<string, unknown>, refName: string): { id: string; name: string } {
  const ref = record[refName];
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return { id: '', name: '' };
  const src = ref as Record<string, unknown>;
  return {
    id: typeof src.ListID === 'string' ? src.ListID : '',
    name: typeof src.FullName === 'string' ? src.FullName : '',
  };
}

function normalizeDateRange(value: unknown): QbdPayloadSession['dateRange'] {
  const src = asRecord(value);
  const mode = src.mode === 'INITIAL_3Y' || src.mode === 'INCREMENTAL' || src.mode === 'MANUAL'
    ? src.mode
    : 'MANUAL';
  return {
    mode,
    startDate: typeof src.startDate === 'string' ? src.startDate : '',
    endDate: typeof src.endDate === 'string' ? src.endDate : '',
    requestedAt: typeof src.requestedAt === 'string' ? src.requestedAt : undefined,
  };
}

function getCompletedBackfillJobs(metadata: unknown): CompletedBackfillJob[] {
  const jobs = asRecord(asRecord(metadata).quickbooksDesktopBackfillJobs);
  return Object.values(jobs)
    .map((value) => asRecord(value) as QbdBackfillJobLike)
    .filter((job) => job.status === 'completed' && typeof job.id === 'string' && typeof job.requestName === 'string')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map((job) => ({
      id: job.id as string,
      requestName: job.requestName as string,
      createdAt: String(job.createdAt || ''),
      dateRange: job.dateRange,
    }));
}

export async function loadQuickBooksDesktopBackfillResponse(
  jobId: string,
): Promise<QbdResponseSet> {
  const rows = await prisma.$queryRaw<Array<{ payload: unknown; createdAt: Date }>>`
    SELECT "payload", "createdAt"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "jobId" = ${jobId}
    ORDER BY "pageNumber" ASC
  `;
  const records = rows.flatMap((row) =>
    Array.isArray(row.payload) ? (row.payload as Array<Record<string, unknown>>) : [],
  );
  return {
    receivedAt: rows[rows.length - 1]?.createdAt?.toISOString?.() || new Date().toISOString(),
    records,
    recordCount: records.length,
  };
}

export async function loadQuickBooksDesktopBackfillSession(
  companyId: string,
  metadata: unknown,
): Promise<QbdPayloadSession | null> {
  const jobs = getCompletedBackfillJobs(metadata);
  if (jobs.length === 0) return null;

  const responses: Record<string, QbdResponseSet> = {};
  for (const job of jobs) {
    responses[job.requestName] = await loadQuickBooksDesktopBackfillResponse(job.id);
  }

  return {
    ticket: `qbd-backfill-pages:${companyId}`,
    requests: jobs.map((job) => job.requestName),
    responses,
    dateRange: normalizeDateRange(jobs[0]?.dateRange),
  };
}

export async function loadQuickBooksDesktopBackfillPayloads(
  companyId: string,
  metadata: unknown,
): Promise<{ financialPayload: Record<string, unknown>; operationalPayload: QbDesktopOperationalPayload } | null> {
  const session = await loadQuickBooksDesktopBackfillSession(companyId, metadata);
  if (!session) return null;
  return {
    financialPayload: buildQuickBooksDesktopFinancialPayload(session),
    operationalPayload: buildQuickBooksDesktopOperationalPayload(session),
  };
}

export function buildQuickBooksDesktopFinancialPayload(session: QbdPayloadSession): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    monthlyData: [],
    metadata: {
      source: 'QuickBooks Desktop Web Connector',
      exportedAt: new Date().toISOString(),
      ticket: session.ticket,
      requests: session.requests,
      dateRange: session.dateRange,
    },
  };

  for (const [requestName, response] of Object.entries(session.responses || {})) {
    payload[requestName] = {
      [RET_TAG_BY_REQUEST[requestName] || requestName.replace(/Query$/, 'Ret')]: response.records || [],
    };
  }

  return payload;
}

export function buildQuickBooksDesktopOperationalPayload(session: QbdPayloadSession): QbDesktopOperationalPayload {
  const accounts = session.responses.AccountQuery?.records || [];
  const invoices = session.responses.InvoiceQuery?.records || [];
  const items = session.responses.ItemQuery?.records || [];

  const cash = accounts
    .filter((account) => {
      const type = String(account.AccountType || account.SpecialAccountType || '').toLowerCase();
      const name = String(account.FullName || account.Name || '').toLowerCase();
      return type.includes('bank') || name.includes('cash') || name.includes('checking') || name.includes('savings');
    })
    .map((account) => ({
      accountId: String(account.ListID || ''),
      accountName: String(account.FullName || account.Name || 'Cash Account'),
      accountNumber: String(account.AccountNumber || '') || null,
      cashBalance: toNumber(account.Balance || account.TotalBalance),
    }));

  const customerSalesById = new Map<string, { customerId: string; customerName: string; revenue: number; invoiceCount: number }>();
  const productSalesById = new Map<string, { itemId: string; itemName: string; quantitySold: number; revenue: number }>();
  let totalAR = 0;

  for (const invoice of invoices) {
    const customer = getRef(invoice, 'CustomerRef');
    const customerName = customer.name || 'Unknown Customer';
    const customerId = customer.id || customerName;
    const revenue = toNumber(invoice.Subtotal || invoice.TotalAmount || invoice.Amount);
    const arBalance = toNumber(invoice.BalanceRemaining || invoice.OpenAmount);
    totalAR += arBalance;

    const current = customerSalesById.get(customerId) || {
      customerId,
      customerName,
      revenue: 0,
      invoiceCount: 0,
    };
    current.revenue += revenue;
    current.invoiceCount += 1;
    customerSalesById.set(customerId, current);

    const lines = Array.isArray(invoice.InvoiceLineRet) ? invoice.InvoiceLineRet : [];
    for (const line of lines) {
      const lineRecord = asRecord(line);
      const item = getRef(lineRecord, 'ItemRef');
      const itemName = item.name || String(lineRecord.Desc || '') || 'Unknown Item';
      const itemId = item.id || itemName;
      const lineRevenue = toNumber(lineRecord.Amount);
      const currentProduct = productSalesById.get(itemId) || {
        itemId,
        itemName,
        quantitySold: 0,
        revenue: 0,
      };
      currentProduct.quantitySold += toNumber(lineRecord.Quantity);
      currentProduct.revenue += lineRevenue;
      productSalesById.set(itemId, currentProduct);
    }
  }

  return {
    asOfDate: new Date().toISOString().slice(0, 10),
    cash,
    arAging: totalAR > 0 ? { totalAR, current: totalAR, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 } : null,
    // BillQuery headers do not expose reliable per-bill open AP; OpenAmount repeats across unrelated bills.
    apAging: null,
    customerSales: Array.from(customerSalesById.values()).map((row) => ({
      ...row,
      avgInvoiceSize: row.invoiceCount > 0 ? row.revenue / row.invoiceCount : 0,
    })),
    productSales: Array.from(productSalesById.values()).map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      quantitySold: row.quantitySold,
      revenue: row.revenue,
      cogs: 0,
      grossMargin: row.revenue,
      grossMarginPct: row.revenue > 0 ? 100 : 0,
    })),
    inventory: items.map((item) => ({
      itemId: String(item.ListID || ''),
      itemName: String(item.FullName || item.Name || 'Unknown Item'),
      sku: String(item.Name || '') || null,
      qtyOnHand: toNumber(item.QuantityOnHand),
      avgCost: toNumber(item.AverageCost || item.PurchaseCost),
      assetValue: toNumber(item.TotalValue),
    })),
  };
}
