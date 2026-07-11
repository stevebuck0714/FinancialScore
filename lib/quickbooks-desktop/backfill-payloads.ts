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
  ARAgingSummaryReportQuery: 'ReportRet',
  APAgingSummaryReportQuery: 'ReportRet',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim());
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

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(asRecord);
}

function qbdDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function qbdTxnNumber(record: Record<string, unknown>, fallbackPrefix: string, index: number): string {
  return firstString(record.RefNumber, record.TxnNumber, record.TxnID) || `${fallbackPrefix}-${index + 1}`;
}

function isExplicitlyPaid(record: Record<string, unknown>): boolean {
  return firstString(record.IsPaid).toLowerCase() === 'true';
}

function isExplicitlyUnpaid(record: Record<string, unknown>): boolean {
  return firstString(record.IsPaid).toLowerCase() === 'false';
}

function hasField(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function invoiceOpenBalance(record: Record<string, unknown>): number {
  if (isExplicitlyPaid(record)) return 0;
  if (hasField(record, 'BalanceRemaining')) return toNumber(record.BalanceRemaining);
  if (isExplicitlyUnpaid(record) && hasField(record, 'AmountDue')) return toNumber(record.AmountDue);
  return 0;
}

function billOpenBalance(record: Record<string, unknown>): number {
  if (isExplicitlyPaid(record)) return 0;
  if (hasField(record, 'BalanceRemaining')) return toNumber(record.BalanceRemaining);
  if (isExplicitlyUnpaid(record) && hasField(record, 'AmountDue')) return toNumber(record.AmountDue);
  return 0;
}

function buildSourceTransaction(record: Record<string, unknown>, fallback: string): string {
  return firstString(record.TxnID, record.EditSequence, record.RefNumber) || fallback;
}

function reportColNumber(record: Record<string, unknown>, index: number): number {
  const colData = Array.isArray(record.colData) ? record.colData.map(asRecord) : [];
  return toNumber(colData[index]?.value);
}

function reconcileAgingBucketsToTotal(
  rawBuckets: Record<string, number>,
  explicitTotal: number,
): Record<string, number> {
  const buckets = Object.fromEntries(
    Object.entries(rawBuckets).map(([key, value]) => [key, Math.max(0, value)])
  ) as Record<string, number>;

  if (explicitTotal <= 0) return buckets;

  let bucketTotal = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  let excess = bucketTotal - explicitTotal;
  if (excess > 0) {
    const bucketNamesBySize = Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a]);
    for (const bucketName of bucketNamesBySize) {
      if (excess <= 0) break;
      const reduction = Math.min(buckets[bucketName], excess);
      buckets[bucketName] -= reduction;
      excess -= reduction;
    }
  }

  bucketTotal = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  const shortfall = explicitTotal - bucketTotal;
  if (shortfall > 0) {
    buckets.days90plus = (buckets.days90plus || 0) + shortfall;
  }

  return buckets;
}

function buildAgingSummaryFromReport(
  records: Array<Record<string, unknown>>,
  totalKey: 'totalAR' | 'totalAP',
): Record<string, number> | null {
  if (!records.length) return null;
  const totalRows = records.filter((record) => String(record.rowKind || '') === 'TotalRow');
  const candidateRows = totalRows.length ? totalRows : records;
  const selected = candidateRows[candidateRows.length - 1];
  if (!selected) return null;

  // QBD aging summary report columns are: label, Current, 1-30, 31-60, 61-90, >90, Total.
  const rawBuckets = {
    current: reportColNumber(selected, 1),
    days1to30: reportColNumber(selected, 2),
    days31to60: reportColNumber(selected, 3),
    days61to90: reportColNumber(selected, 4),
    days90plus: reportColNumber(selected, 5),
  };
  const explicitTotal = reportColNumber(selected, 6);
  const buckets = reconcileAgingBucketsToTotal(rawBuckets, explicitTotal);
  const { current, days1to30, days31to60, days90plus } = buckets;
  const days61to90 = buckets.days61to90 || 0;
  const summedTotal = current + days1to30 + days31to60 + days61to90 + days90plus;
  const total = explicitTotal > 0 ? explicitTotal : summedTotal;
  if (total === 0 && summedTotal === 0) return null;

  return {
    [totalKey]: total,
    current,
    days1to30,
    days31to60,
    days61to90,
    days90plus,
  };
}

export function buildQuickBooksDesktopAgingSummaryFromReport(
  records: Array<Record<string, unknown>>,
  totalKey: 'totalAR' | 'totalAP',
): Record<string, number> | null {
  return buildAgingSummaryFromReport(records, totalKey);
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
  const bills = session.responses.BillQuery?.records || [];
  const receivePayments = session.responses.ReceivePaymentQuery?.records || [];
  const billPaymentChecks = session.responses.BillPaymentCheckQuery?.records || [];
  const billPaymentCreditCards = session.responses.BillPaymentCreditCardQuery?.records || [];
  const items = session.responses.ItemQuery?.records || [];
  const arAgingReport = session.responses.ARAgingSummaryReportQuery?.records || [];
  const apAgingReport = session.responses.APAgingSummaryReportQuery?.records || [];
  const asOfDate = qbdDate(session.dateRange.endDate) || new Date().toISOString().slice(0, 10);

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
  const arOpenInvoices: Array<Record<string, unknown>> = [];
  let totalAR = 0;

  for (const [index, invoice] of invoices.entries()) {
    const customer = getRef(invoice, 'CustomerRef');
    const customerName = customer.name || 'Unknown Customer';
    const customerId = customer.id || customerName;
    const revenue = toNumber(invoice.Subtotal || invoice.TotalAmount || invoice.Amount);
    const arBalance = invoiceOpenBalance(invoice);
    totalAR += arBalance;
    if (arBalance > 0) {
      arOpenInvoices.push({
        customerId,
        customerName,
        invoiceNo: qbdTxnNumber(invoice, 'QBD-INVOICE', index),
        invoiceDate: qbdDate(invoice.TxnDate),
        dueDate: qbdDate(invoice.DueDate),
        status: firstString(invoice.IsPaid).toLowerCase() === 'true' ? 'PAID' : 'OPEN',
        currencyCode: firstString(asRecord(invoice.CurrencyRef).FullName) || 'USD',
        amountCurrency: revenue,
        amountHome: toNumber(invoice.TotalAmount || invoice.Amount || revenue),
        amountDueHome: arBalance,
        sourceTransaction: buildSourceTransaction(invoice, `invoice:${index}`),
      });
    }

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

  const apOpenBills = bills
    .map((bill, index) => {
      const vendor = getRef(bill, 'VendorRef');
      const amountDue = billOpenBalance(bill);
      return {
        vendorId: vendor.id,
        vendorName: vendor.name || 'Unknown Vendor',
        billNo: qbdTxnNumber(bill, 'QBD-BILL', index),
        billDate: qbdDate(bill.TxnDate),
        dueDate: qbdDate(bill.DueDate),
        status: firstString(bill.IsPaid).toLowerCase() === 'true' ? 'PAID' : 'OPEN',
        currencyCode: firstString(asRecord(bill.CurrencyRef).FullName) || 'USD',
        amountCurrency: toNumber(bill.AmountDue || bill.Amount || bill.TotalAmount || amountDue),
        amountHome: toNumber(bill.Amount || bill.TotalAmount || bill.AmountDue || amountDue),
        amountDueHome: amountDue,
        sourceTransaction: buildSourceTransaction(bill, `bill:${index}`),
      };
    })
    .filter((row) => Number(row.amountDueHome || 0) > 0);

  const arPayments = receivePayments.flatMap((payment, paymentIndex) => {
    const customer = getRef(payment, 'CustomerRef');
    const paymentDate = qbdDate(payment.TxnDate);
    const currencyCode = firstString(asRecord(payment.CurrencyRef).FullName) || 'USD';
    const sourceTransaction = buildSourceTransaction(payment, `receive-payment:${paymentIndex}`);
    const applied = asArray(payment.AppliedToTxnRet).filter((row) => String(row.TxnType || '').toLowerCase().includes('invoice'));
    if (applied.length === 0) {
      return [{
        paymentDate,
        customerId: customer.id,
        customerName: customer.name || 'Unknown Customer',
        invoiceNo: null,
        currencyCode,
        paidAmountCurrency: toNumber(payment.TotalAmount),
        paidAmountHome: toNumber(payment.TotalAmount),
        sourceTransaction,
      }];
    }
    return applied.map((appliedTxn, appliedIndex) => ({
      paymentDate,
      customerId: customer.id,
      customerName: customer.name || 'Unknown Customer',
      invoiceNo: firstString(appliedTxn.RefNumber, appliedTxn.TxnID) || null,
      currencyCode,
      paidAmountCurrency: toNumber(appliedTxn.Amount) || toNumber(payment.TotalAmount),
      paidAmountHome: toNumber(appliedTxn.Amount) || toNumber(payment.TotalAmount),
      sourceTransaction: `${sourceTransaction}:${appliedIndex}`,
    }));
  });

  const apPayments = [...billPaymentChecks, ...billPaymentCreditCards].flatMap((payment, paymentIndex) => {
    const vendor = getRef(payment, 'PayeeEntityRef');
    const vendorFallback = vendor.id || vendor.name ? vendor : getRef(payment, 'VendorRef');
    const paymentDate = qbdDate(payment.TxnDate);
    const currencyCode = firstString(asRecord(payment.CurrencyRef).FullName) || 'USD';
    const sourceTransaction = buildSourceTransaction(payment, `bill-payment:${paymentIndex}`);
    const applied = asArray(payment.AppliedToTxnRet).filter((row) => String(row.TxnType || '').toLowerCase().includes('bill'));
    if (applied.length === 0) {
      return [{
        paymentDate,
        vendorId: vendorFallback.id,
        vendorName: vendorFallback.name || 'Unknown Vendor',
        billNo: null,
        currencyCode,
        paidAmountCurrency: toNumber(payment.Amount || payment.TotalAmount),
        paidAmountHome: toNumber(payment.Amount || payment.TotalAmount),
        sourceTransaction,
        sourceItemId: `qbd|ap-payment|${sourceTransaction}`,
      }];
    }
    return applied.map((appliedTxn, appliedIndex) => ({
      paymentDate,
      vendorId: vendorFallback.id,
      vendorName: vendorFallback.name || 'Unknown Vendor',
      billNo: firstString(appliedTxn.RefNumber, appliedTxn.TxnID) || null,
      currencyCode,
      paidAmountCurrency: toNumber(appliedTxn.Amount) || toNumber(payment.Amount || payment.TotalAmount),
      paidAmountHome: toNumber(appliedTxn.Amount) || toNumber(payment.Amount || payment.TotalAmount),
      sourceTransaction: `${sourceTransaction}:${appliedIndex}`,
      sourceItemId: `qbd|ap-payment|${sourceTransaction}|${appliedIndex}`,
    }));
  });

  return {
    asOfDate,
    __qbdSourceDateRange: session.dateRange,
    __qbdInvoices: invoices,
    __qbdBills: bills,
    __qbdReceivePayments: receivePayments,
    __qbdBillPayments: [...billPaymentChecks, ...billPaymentCreditCards],
    cash,
    arAging: buildAgingSummaryFromReport(arAgingReport, 'totalAR') ||
      (totalAR > 0 ? { totalAR, current: totalAR, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 } : null),
    apAging: buildAgingSummaryFromReport(apAgingReport, 'totalAP'),
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
    arOpenInvoices,
    arPayments,
    apOpenBills,
    apPayments,
  };
}
