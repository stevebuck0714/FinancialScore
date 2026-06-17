import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptOAuthToken } from '@/lib/encryption';
import { seedQuickBooksDesktopAccountMappings } from '@/lib/quickbooks-desktop/account-mapping-seed';
import {
  syncQuickBooksDesktopOperationalPayload,
  type QbDesktopOperationalPayload,
} from '@/lib/quickbooks-desktop/operational-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QBWC_NAMESPACE = 'http://developer.intuit.com/';

type QbDesktopMetadata = {
  quickbooksDesktopSettings?: Record<string, unknown>;
  quickbooksDesktopCredentials?: {
    webConnectorUsername?: unknown;
    webConnectorPasswordEncrypted?: unknown;
  };
  quickbooksDesktopPrograms?: Array<{
    dataDomain?: unknown;
    qbEntity?: unknown;
    enabled?: unknown;
  }>;
  quickbooksDesktopQueuedDateRange?: QbwcDateRange | null;
  quickbooksDesktopBackfillJobs?: Record<string, QbdBackfillJob>;
  quickbooksDesktopBackfillResponses?: Record<string, QbwcResponseSet>;
  quickbooksDesktopWebConnectorSessions?: Record<string, QbwcSession>;
  quickbooksDesktopWebConnectorLastRun?: Record<string, unknown>;
  quickbooksDesktopInitialPullCompletedAt?: unknown;
  quickbooksDesktopLastWebConnectorSyncAt?: unknown;
};

type Frequency = 'daily' | 'weekly' | 'monthly';

type QbwcResponseSet = {
  receivedAt: string;
  records: Array<Record<string, unknown>>;
  recordCount?: number;
  rawResponseXmlPreview?: string;
};

type QbwcSession = {
  ticket: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  currentIndex: number;
  requests: string[];
  responses: Record<string, QbwcResponseSet>;
  iterators?: Record<string, QbwcIteratorState>;
  dateRange: QbwcDateRange;
  backfillJobId?: string;
  lastError?: string | null;
};

type QbdBackfillJob = {
  id: string;
  batchId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  requestName: string;
  dateRange: QbwcDateRange;
  createdAt: string;
  updatedAt: string;
  ticket?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  recordCount?: number;
  pageCount?: number;
  iteratorRemainingCount?: number | null;
  lastError?: string | null;
};

type QbwcIteratorState = {
  iteratorID: string;
  remainingCount: number;
  pageCount: number;
};

type QbwcDateRange = {
  mode: 'INITIAL_3Y' | 'INCREMENTAL' | 'MANUAL';
  startDate: string;
  endDate: string;
  requestedAt?: string;
};

type QbwcRequestContext = {
  iteratorID?: string;
};

const DEFAULT_REQUESTS = [
  'AccountQuery',
  'CustomerQuery',
  'VendorQuery',
  'InvoiceQuery',
  'BillQuery',
  'ReceivePaymentQuery',
];

const RECOMMENDED_QBD_REQUESTS = [
  'ItemQuery',
  'SalesReceiptQuery',
  'DepositQuery',
  'CreditMemoQuery',
  'JournalEntryQuery',
  'PurchaseOrderQuery',
  'CheckQuery',
  'VendorCreditQuery',
  'BillPaymentCheckQuery',
  'BillPaymentCreditCardQuery',
];

const TRANSACTION_REQUESTS = new Set([
  'InvoiceQuery',
  'BillQuery',
  'ReceivePaymentQuery',
  'SalesReceiptQuery',
  'DepositQuery',
  'CreditMemoQuery',
  'EstimateQuery',
  'SalesOrderQuery',
  'BillPaymentCheckQuery',
  'BillPaymentCreditCardQuery',
  'VendorCreditQuery',
  'CheckQuery',
  'CreditCardChargeQuery',
  'PurchaseOrderQuery',
  'ItemReceiptQuery',
  'JournalEntryQuery',
  'TransferQuery',
  'InventoryAdjustmentQuery',
]);

const QBD_TRANSACTION_PAGE_SIZE = 100;
const QBD_INCLUDE_TRANSACTION_LINE_ITEMS = false;

const RET_TAG_BY_REQUEST: Record<string, string> = {
  AccountQuery: 'AccountRet',
  CustomerQuery: 'CustomerRet',
  VendorQuery: 'VendorRet',
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
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function getXmlText(xml: string, tagName: string): string {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? xmlDecode(match[1].trim()) : '';
}

function getInnerXml(xml: string, tagName: string): string {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[1] : '';
}

function getXmlTagAttribute(xml: string, tagName: string, attributeName: string): string {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b([^>]*)>`, 'i');
  const tagMatch = xml.match(pattern);
  const attributes = tagMatch ? tagMatch[1] : '';
  if (!attributes) return '';
  const attributePattern = new RegExp(`\\b${attributeName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const attributeMatch = attributes.match(attributePattern);
  return attributeMatch ? xmlDecode(attributeMatch[1].trim()) : '';
}

function getXmlRecords(xml: string, tagName: string): string[] {
  const records: string[] = [];
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`, 'gi');
  let match = pattern.exec(xml);
  while (match) {
    records.push(match[1]);
    match = pattern.exec(xml);
  }
  return records;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeFrequency(value: unknown): Frequency {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'monthly') return normalized;
  return 'daily';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateString(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : trimmed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function buildRequestList(metadata: QbDesktopMetadata): string[] {
  const configured = Array.isArray(metadata.quickbooksDesktopPrograms)
    ? metadata.quickbooksDesktopPrograms
        .filter((program) => program.enabled !== false)
        .map((program) => (typeof program.qbEntity === 'string' ? program.qbEntity : ''))
    : [];
  const sourceRequests = configured.length > 0
    ? configured
    : [...DEFAULT_REQUESTS, ...RECOMMENDED_QBD_REQUESTS];

  return uniqueStrings(sourceRequests)
    .filter((entity) => entity.endsWith('Query'))
    .filter((entity) => Boolean(RET_TAG_BY_REQUEST[entity] || entity.match(/^[A-Za-z][A-Za-z0-9]*Query$/)));
}

function buildTransactionDateFilter(dateRange: QbwcDateRange): string {
  if (!dateRange.startDate || !dateRange.endDate) return '';
  return `<TxnDateRangeFilter><FromTxnDate>${xmlEscape(dateRange.startDate)}</FromTxnDate><ToTxnDate>${xmlEscape(dateRange.endDate)}</ToTxnDate></TxnDateRangeFilter>`;
}

function buildQbxmlRequest(requestName: string, dateRange: QbwcDateRange, context: QbwcRequestContext = {}): string {
  const childrenByRequest: Record<string, string> = {
    AccountQuery: '<ActiveStatus>All</ActiveStatus>',
    CustomerQuery: '<ActiveStatus>All</ActiveStatus>',
    VendorQuery: '<ActiveStatus>All</ActiveStatus>',
    ItemQuery: '<ActiveStatus>All</ActiveStatus>',
  };
  const requestTag = `${requestName}Rq`;
  const requestId = xmlEscape(requestName);
  const useIterator = TRANSACTION_REQUESTS.has(requestName);
  const dateFilter = TRANSACTION_REQUESTS.has(requestName) ? buildTransactionDateFilter(dateRange) : '';
  const includeLineItems = QBD_INCLUDE_TRANSACTION_LINE_ITEMS && ['InvoiceQuery', 'BillQuery'].includes(requestName)
    ? '<IncludeLineItems>true</IncludeLineItems>'
    : '';
  const children = childrenByRequest[requestName] || `<MaxReturned>${QBD_TRANSACTION_PAGE_SIZE}</MaxReturned>${dateFilter}${includeLineItems}`;
  const iteratorAttributes = useIterator
    ? context.iteratorID
      ? ` iterator="Continue" iteratorID="${xmlEscape(context.iteratorID)}"`
      : ' iterator="Start"'
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    <${requestTag} requestID="${requestId}"${iteratorAttributes}>
      ${children}
    </${requestTag}>
  </QBXMLMsgsRq>
</QBXML>`;
}

function parseSimpleRecord(xml: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  const fields = [
    'TxnID',
    'ListID',
    'TimeCreated',
    'TimeModified',
    'EditSequence',
    'Name',
    'FullName',
    'CompanyName',
    'AccountNumber',
    'AccountType',
    'SpecialAccountType',
    'IsActive',
    'Balance',
    'TotalBalance',
    'TxnDate',
    'RefNumber',
    'Desc',
    'Subtotal',
    'AppliedAmount',
    'TotalAmount',
    'Amount',
    'AmountDue',
    'OpenAmount',
    'BalanceRemaining',
    'DueDate',
    'Quantity',
    'QuantityOnHand',
    'AverageCost',
    'SalesPrice',
    'PurchaseCost',
    'TotalValue',
  ];

  for (const field of fields) {
    const value = getXmlText(xml, field);
    if (value) record[field] = value;
  }

  for (const refTag of ['AccountRef', 'CustomerRef', 'VendorRef', 'ItemRef', 'ClassRef']) {
    const refXml = getInnerXml(xml, refTag);
    if (!refXml) continue;
    record[refTag] = {
      ListID: getXmlText(refXml, 'ListID'),
      FullName: getXmlText(refXml, 'FullName'),
    };
  }

  return record;
}

function parseResponseRecords(requestName: string, xml: string): Array<Record<string, unknown>> {
  const retTag = RET_TAG_BY_REQUEST[requestName] || requestName.replace(/Query$/, 'Ret');
  return getXmlRecords(xml, retTag).map((recordXml) => {
    const record = parseSimpleRecord(recordXml);

    if (requestName === 'InvoiceQuery') {
      record.InvoiceLineRet = getXmlRecords(recordXml, 'InvoiceLineRet').map(parseSimpleRecord);
    }
    if (requestName === 'BillQuery') {
      record.ExpenseLineRet = getXmlRecords(recordXml, 'ExpenseLineRet').map(parseSimpleRecord);
      record.ItemLineRet = getXmlRecords(recordXml, 'ItemLineRet').map(parseSimpleRecord);
    }

    return record;
  });
}

function getIteratorState(requestName: string, xml: string): QbwcIteratorState | null {
  const responseTag = `${requestName}Rs`;
  const iteratorID = getXmlTagAttribute(xml, responseTag, 'iteratorID');
  const remainingRaw = getXmlTagAttribute(xml, responseTag, 'iteratorRemainingCount');
  const remainingCount = Math.max(0, Number(remainingRaw || 0));
  if (!iteratorID || !Number.isFinite(remainingCount) || remainingCount <= 0) return null;
  return {
    iteratorID,
    remainingCount,
    pageCount: 1,
  };
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

function sessionFromMetadata(metadata: QbDesktopMetadata, ticket: string): QbwcSession | null {
  const sessions = metadata.quickbooksDesktopWebConnectorSessions || {};
  const session = sessions[ticket];
  return session && session.ticket === ticket ? session : null;
}

function compactSessions(sessions: Record<string, QbwcSession>): Record<string, QbwcSession> {
  return Object.fromEntries(
    Object.entries(sessions)
      .sort(([, a], [, b]) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 10),
  );
}

function parseTicket(ticket: string): { companyId: string } | null {
  const match = /^corelytics:([^:]+):/.exec(ticket || '');
  return match ? { companyId: match[1] } : null;
}

function getCompanyFilePath(metadata: QbDesktopMetadata): string {
  const value = metadata.quickbooksDesktopSettings?.companyFilePath;
  const path = typeof value === 'string' ? value.trim() : '';
  if (!path || path.toLowerCase().includes('pending customer confirmation')) return '';
  return path;
}

function getRunDateRange(metadata: QbDesktopMetadata): QbwcDateRange {
  const today = new Date();
  const endDate = formatDate(today);
  const queued = metadata.quickbooksDesktopQueuedDateRange;
  const queuedStartDate = parseDateString(queued?.startDate);
  const queuedEndDate = parseDateString(queued?.endDate);

  if (queuedStartDate && queuedEndDate && queuedStartDate <= queuedEndDate) {
    return {
      mode: 'MANUAL',
      startDate: queuedStartDate,
      endDate: queuedEndDate,
      requestedAt: typeof queued?.requestedAt === 'string' ? queued.requestedAt : undefined,
    };
  }

  if (!metadata.quickbooksDesktopInitialPullCompletedAt) {
    const configuredStartDate = parseDateString(metadata.quickbooksDesktopSettings?.initialSyncStartDate);
    return {
      mode: 'INITIAL_3Y',
      startDate: configuredStartDate || formatDate(addYears(today, -3)),
      endDate,
    };
  }

  const lastSyncAt =
    typeof metadata.quickbooksDesktopLastWebConnectorSyncAt === 'string'
      ? new Date(metadata.quickbooksDesktopLastWebConnectorSyncAt)
      : null;
  const incrementalStart = lastSyncAt && !Number.isNaN(lastSyncAt.getTime())
    ? formatDate(addDays(lastSyncAt, -2))
    : formatDate(addDays(today, -2));

  return {
    mode: 'INCREMENTAL',
    startDate: incrementalStart,
    endDate,
  };
}

function getNextBackfillJob(metadata: QbDesktopMetadata): QbdBackfillJob | null {
  const jobs = metadata.quickbooksDesktopBackfillJobs || {};
  return Object.values(jobs)
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null;
}

function buildCombinedBackfillSession(
  ticket: string,
  companyId: string,
  jobs: Record<string, QbdBackfillJob>,
  responses: Record<string, QbwcResponseSet>,
): QbwcSession {
  const completedJobs = Object.values(jobs)
    .filter((job) => job.status === 'completed')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const firstJob = completedJobs[0];
  const requests = completedJobs.map((job) => job.requestName);

  return {
    ticket,
    companyId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentIndex: requests.length,
    requests,
    responses: Object.fromEntries(
      completedJobs
        .map((job) => [job.requestName, responses[job.requestName]] as const)
        .filter(([, response]) => Boolean(response)),
    ),
    dateRange: firstJob?.dateRange || {
      mode: 'MANUAL',
      startDate: '',
      endDate: '',
    },
    lastError: null,
  };
}

function getBatchIdFromJobId(jobId: string): string {
  return jobId.split(':')[0] || jobId;
}

async function saveBackfillPage(
  companyId: string,
  session: QbwcSession,
  requestName: string,
  pageNumber: number,
  pageRecords: Array<Record<string, unknown>>,
  remainingCount: number | null,
  responseXml: string,
): Promise<void> {
  if (!session.backfillJobId) return;
  const batchId = getBatchIdFromJobId(session.backfillJobId);
  const payloadJson = JSON.stringify(pageRecords);
  const rawXmlPreview = responseXml.slice(0, 50000);

  await prisma.$executeRaw`
    INSERT INTO "QuickBooksDesktopBackfillPage" (
      "id",
      "companyId",
      "batchId",
      "jobId",
      "ticket",
      "requestName",
      "pageNumber",
      "recordCount",
      "remainingCount",
      "payload",
      "rawXmlPreview"
    )
    VALUES (
      ${randomUUID()},
      ${companyId},
      ${batchId},
      ${session.backfillJobId},
      ${session.ticket},
      ${requestName},
      ${pageNumber},
      ${pageRecords.length},
      ${remainingCount},
      CAST(${payloadJson} AS jsonb),
      ${rawXmlPreview}
    )
    ON CONFLICT ("jobId", "pageNumber") DO UPDATE SET
      "ticket" = EXCLUDED."ticket",
      "recordCount" = EXCLUDED."recordCount",
      "remainingCount" = EXCLUDED."remainingCount",
      "payload" = EXCLUDED."payload",
      "rawXmlPreview" = EXCLUDED."rawXmlPreview";
  `;
}

async function loadBackfillJobResponse(jobId: string, requestName: string): Promise<QbwcResponseSet> {
  const rows = await prisma.$queryRaw<Array<{ payload: unknown; createdAt: Date }>>`
    SELECT "payload", "createdAt"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "jobId" = ${jobId}
    ORDER BY "pageNumber" ASC
  `;
  const records = rows.flatMap((row) => Array.isArray(row.payload) ? row.payload as Array<Record<string, unknown>> : []);
  return {
    receivedAt: rows[rows.length - 1]?.createdAt?.toISOString?.() || new Date().toISOString(),
    records,
    recordCount: records.length,
  };
}

async function loadBackfillResponses(jobs: Record<string, QbdBackfillJob>): Promise<Record<string, QbwcResponseSet>> {
  const responses: Record<string, QbwcResponseSet> = {};
  for (const job of Object.values(jobs).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    if (job.status !== 'completed') continue;
    responses[job.requestName] = await loadBackfillJobResponse(job.id, job.requestName);
  }
  return responses;
}

function buildFinancialPayload(session: QbwcSession): Record<string, unknown> {
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

function buildOperationalPayload(session: QbwcSession): QbDesktopOperationalPayload {
  const accounts = session.responses.AccountQuery?.records || [];
  const invoices = session.responses.InvoiceQuery?.records || [];
  const bills = session.responses.BillQuery?.records || [];
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
      const lineRecord = line && typeof line === 'object' && !Array.isArray(line) ? (line as Record<string, unknown>) : {};
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

  const totalAP = bills.reduce((sum, bill) => sum + toNumber(bill.BalanceRemaining || bill.OpenAmount || bill.AmountDue), 0);

  return {
    asOfDate: new Date().toISOString().slice(0, 10),
    cash,
    arAging: totalAR > 0 ? { totalAR, current: totalAR, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 } : null,
    apAging: totalAP > 0 ? { totalAP, current: totalAP, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 } : null,
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

function getSoapMethod(xml: string): string {
  const methods = [
    'serverVersion',
    'clientVersion',
    'authenticate',
    'sendRequestXML',
    'receiveResponseXML',
    'getLastError',
    'closeConnection',
  ];
  return methods.find((method) => new RegExp(`<(?:[\\w.-]+:)?${method}\\b`, 'i').test(xml)) || '';
}

function soapResponse(method: string, resultTag: string, resultXml: string): NextResponse {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${method}Response xmlns="${QBWC_NAMESPACE}">
      <${resultTag}>${resultXml}</${resultTag}>
    </${method}Response>
  </soap:Body>
</soap:Envelope>`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function soapString(method: string, value: string): NextResponse {
  return soapResponse(method, `${method}Result`, xmlEscape(value));
}

function soapInt(method: string, value: number): NextResponse {
  return soapResponse(method, `${method}Result`, String(value));
}

function soapFault(message: string): NextResponse {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>${xmlEscape(message)}</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

  return new NextResponse(body, {
    status: 500,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function getMetadata(value: unknown): QbDesktopMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as QbDesktopMetadata) : {};
}

async function loadConnection(companyId: string) {
  return prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'QUICKBOOKS',
      },
    },
    select: {
      companyId: true,
      syncFrequency: true,
      connectionMetadata: true,
    },
  });
}

async function updateMetadata(companyId: string, updater: (metadata: QbDesktopMetadata) => QbDesktopMetadata) {
  const connection = await loadConnection(companyId);
  if (!connection) throw new Error('QuickBooks Desktop connection not found.');
  const metadata = getMetadata(connection.connectionMetadata);
  const nextMetadata = updater(metadata);

  await prisma.accountingConnection.update({
    where: {
      companyId_platform: {
        companyId,
        platform: 'QUICKBOOKS',
      },
    },
    data: {
      connectionMetadata: nextMetadata as any,
      errorMessage: nextMetadata.quickbooksDesktopWebConnectorLastRun?.lastError
        ? String(nextMetadata.quickbooksDesktopWebConnectorLastRun.lastError).slice(0, 900)
        : null,
    },
  });

  return nextMetadata;
}

async function saveSession(companyId: string, session: QbwcSession): Promise<void> {
  await updateMetadata(companyId, (metadata) => {
    const sessions = compactSessions({
      ...(metadata.quickbooksDesktopWebConnectorSessions || {}),
      [session.ticket]: {
        ...session,
        updatedAt: new Date().toISOString(),
      },
    });
    return {
      ...metadata,
      quickbooksDesktopWebConnectorSessions: sessions,
    };
  });
}

async function getSession(ticket: string): Promise<{ connection: Awaited<ReturnType<typeof loadConnection>>; metadata: QbDesktopMetadata; session: QbwcSession } | null> {
  const parsed = parseTicket(ticket);
  if (!parsed) return null;

  const connection = await loadConnection(parsed.companyId);
  if (!connection) return null;

  const metadata = getMetadata(connection.connectionMetadata);
  const session = sessionFromMetadata(metadata, ticket);
  if (!session) return null;

  return { connection, metadata, session };
}

async function markBackfillJobFailed(companyId: string, jobId: string, message: string): Promise<void> {
  await updateMetadata(companyId, (metadata) => {
    const jobs = metadata.quickbooksDesktopBackfillJobs || {};
    const job = jobs[jobId];
    if (!job) return metadata;
    const now = new Date().toISOString();
    return {
      ...metadata,
      quickbooksDesktopBackfillJobs: {
        ...jobs,
        [jobId]: {
          ...job,
          status: 'failed',
          failedAt: now,
          updatedAt: now,
          lastError: message,
        },
      },
      quickbooksDesktopWebConnectorLastRun: {
        ...(metadata.quickbooksDesktopWebConnectorLastRun || {}),
        lastError: message,
      },
    };
  });
}

async function completeBackfillJob(
  connection: NonNullable<Awaited<ReturnType<typeof loadConnection>>>,
  session: QbwcSession,
): Promise<void> {
  const jobId = session.backfillJobId;
  if (!jobId) {
    await finalizeSession(connection, session);
    return;
  }

  const requestName = session.requests[0];
  const response = session.backfillJobId
    ? await loadBackfillJobResponse(session.backfillJobId, requestName)
    : session.responses[requestName] || {
        receivedAt: new Date().toISOString(),
        records: [],
      };
  let shouldFinalize = false;
  let combinedSession: QbwcSession | null = null;
  let completedJobsSnapshot: Record<string, QbdBackfillJob> | null = null;

  await updateMetadata(connection.companyId, (metadata) => {
    const jobs = metadata.quickbooksDesktopBackfillJobs || {};
    const job = jobs[jobId];
    if (!job) return metadata;
    const now = new Date().toISOString();
    const responses = {
      ...(metadata.quickbooksDesktopBackfillResponses || {}),
      [requestName]: {
        receivedAt: response.receivedAt,
        records: [],
        recordCount: response.records.length,
      },
    };
    const completedJob: QbdBackfillJob = {
      ...job,
      status: 'completed',
      completedAt: now,
      updatedAt: now,
      recordCount: response.records.length,
      pageCount: Math.max(1, Math.ceil((response.records.length || 0) / QBD_TRANSACTION_PAGE_SIZE)),
      iteratorRemainingCount: null,
      lastError: null,
    };
    const nextJobs: Record<string, QbdBackfillJob> = {
      ...jobs,
      [jobId]: completedJob,
    };
    shouldFinalize = Object.values(nextJobs).every((nextJob) => nextJob.status === 'completed');
    completedJobsSnapshot = shouldFinalize ? nextJobs : null;

    return {
      ...metadata,
      quickbooksDesktopBackfillJobs: nextJobs,
      quickbooksDesktopBackfillResponses: responses,
    };
  });

  if (shouldFinalize && completedJobsSnapshot) {
    const fullResponses = await loadBackfillResponses(completedJobsSnapshot);
    combinedSession = buildCombinedBackfillSession(session.ticket, connection.companyId, completedJobsSnapshot, fullResponses);
    await finalizeSession(connection, combinedSession);
  }
}

async function markBackfillJobRunning(companyId: string, job: QbdBackfillJob, ticket: string): Promise<void> {
  await updateMetadata(companyId, (metadata) => {
    const jobs = metadata.quickbooksDesktopBackfillJobs || {};
    const current = jobs[job.id] || job;
    const now = new Date().toISOString();
    return {
      ...metadata,
      quickbooksDesktopBackfillJobs: {
        ...jobs,
        [job.id]: {
          ...current,
          status: 'running',
          ticket,
          startedAt: current.startedAt || now,
          updatedAt: now,
          lastError: null,
        },
      },
    };
  });
}

async function updateBackfillJobProgress(companyId: string, session: QbwcSession, requestName: string): Promise<void> {
  const jobId = session.backfillJobId;
  if (!jobId) return;
  const response = session.responses[requestName];
  const iterator = session.iterators?.[requestName];
  const recordCount = response?.recordCount ?? response?.records.length ?? 0;
  await updateMetadata(companyId, (metadata) => {
    const jobs = metadata.quickbooksDesktopBackfillJobs || {};
    const job = jobs[jobId];
    if (!job) return metadata;
    return {
      ...metadata,
      quickbooksDesktopBackfillJobs: {
        ...jobs,
        [jobId]: {
          ...job,
          status: 'running',
          updatedAt: new Date().toISOString(),
          recordCount,
          pageCount: iterator?.pageCount || Math.max(1, Math.ceil(recordCount / QBD_TRANSACTION_PAGE_SIZE)),
          iteratorRemainingCount: iterator?.remainingCount ?? null,
          lastError: null,
        },
      },
    };
  });
}

async function finalizeSession(connection: NonNullable<Awaited<ReturnType<typeof loadConnection>>>, session: QbwcSession): Promise<void> {
  const companyId = connection.companyId;
  const frequency = normalizeFrequency(connection.syncFrequency);
  const financialPayload = buildFinancialPayload(session);
  const operationalPayload = buildOperationalPayload(session);

  let accountMappingSeed: unknown = null;
  let operationalSync: unknown = null;
  let lastError: string | null = null;

  try {
    accountMappingSeed = await seedQuickBooksDesktopAccountMappings(companyId, financialPayload);
  } catch (error) {
    lastError = `Account mapping seed failed: ${error instanceof Error ? error.message : 'unknown error'}`;
  }

  try {
    operationalSync = await syncQuickBooksDesktopOperationalPayload(companyId, frequency, operationalPayload);
  } catch (error) {
    const message = `Operational sync failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    lastError = lastError ? `${lastError}; ${message}` : message;
  }

  await updateMetadata(companyId, (metadata) => ({
    ...metadata,
    quickbooksDesktopFinancialPayload: financialPayload,
    quickbooksDesktopOperationalPayload: operationalPayload,
    quickbooksDesktopLastWebConnectorSyncAt: new Date().toISOString(),
    quickbooksDesktopInitialPullCompletedAt:
      metadata.quickbooksDesktopInitialPullCompletedAt || new Date().toISOString(),
    quickbooksDesktopQueuedDateRange:
      session.dateRange.mode === 'MANUAL' ? null : metadata.quickbooksDesktopQueuedDateRange || null,
    quickbooksDesktopWebConnectorLastRun: {
      ticket: session.ticket,
      completedAt: new Date().toISOString(),
      requests: session.requests,
      dateRange: session.dateRange,
      recordCounts: Object.fromEntries(
        Object.entries(session.responses).map(([key, response]) => [key, response.records.length]),
      ),
      pageCounts: Object.fromEntries(
        Object.entries(session.responses).map(([key, response]) => [
          key,
          Math.max(1, Math.ceil((response.records.length || 0) / QBD_TRANSACTION_PAGE_SIZE)),
        ]),
      ),
      accountMappingSeed,
      operationalSync,
      lastError,
    },
  }));

  await prisma.accountingConnection.update({
    where: {
      companyId_platform: {
        companyId,
        platform: 'QUICKBOOKS',
      },
    },
    data: {
      status: 'ACTIVE',
      lastSyncAt: new Date(),
      errorMessage: lastError ? lastError.slice(0, 900) : null,
    },
  });
}

async function authenticateWebConnector(username: string, password: string): Promise<{ companyId: string; metadata: QbDesktopMetadata } | null> {
  if (!username || !password) return null;

  const connections = await prisma.accountingConnection.findMany({
    where: { platform: 'QUICKBOOKS' },
    select: {
      companyId: true,
      connectionMetadata: true,
    },
  });

  for (const connection of connections) {
    const metadata = getMetadata(connection.connectionMetadata);
    const credentials = metadata.quickbooksDesktopCredentials;
    const storedUsername =
      typeof credentials?.webConnectorUsername === 'string'
        ? credentials.webConnectorUsername.trim()
        : '';
    const encryptedPassword =
      typeof credentials?.webConnectorPasswordEncrypted === 'string'
        ? credentials.webConnectorPasswordEncrypted
        : '';

    if (storedUsername !== username || !encryptedPassword) continue;

    try {
      const storedPassword = decryptOAuthToken(encryptedPassword);
      if (storedPassword === password) return { companyId: connection.companyId, metadata };
    } catch (error) {
      console.error('Failed to decrypt QuickBooks Desktop Web Connector password', {
        companyId: connection.companyId,
        error,
      });
      return null;
    }
  }

  return null;
}

function authenticateResponse(ticket: string, companyFilePath = ''): NextResponse {
  return soapResponse(
    'authenticate',
    'authenticateResult',
    `<string>${xmlEscape(ticket)}</string><string>${xmlEscape(companyFilePath)}</string>`,
  );
}

export async function GET() {
  return new NextResponse('Corelytics QuickBooks Desktop Web Connector endpoint', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  const xml = await request.text();
  const method = getSoapMethod(xml);

  try {
    switch (method) {
      case 'serverVersion':
        return soapString('serverVersion', 'Corelytics QBWC Service 1.0');

      case 'clientVersion':
        return soapString('clientVersion', '');

      case 'authenticate': {
        const username = getXmlText(xml, 'strUserName');
        const password = getXmlText(xml, 'strPassword');
        const auth = await authenticateWebConnector(username, password);

        if (!auth) {
          return authenticateResponse('', 'nvu');
        }

        const ticket = `corelytics:${auth.companyId}:${randomUUID()}`;
        const now = new Date().toISOString();
        const backfillJob = getNextBackfillJob(auth.metadata);
        const session: QbwcSession = {
          ticket,
          companyId: auth.companyId,
          createdAt: now,
          updatedAt: now,
          currentIndex: 0,
          requests: backfillJob ? [backfillJob.requestName] : buildRequestList(auth.metadata),
          responses: {},
          iterators: {},
          dateRange: backfillJob ? backfillJob.dateRange : getRunDateRange(auth.metadata),
          backfillJobId: backfillJob?.id,
          lastError: null,
        };

        if (backfillJob) {
          await markBackfillJobRunning(auth.companyId, backfillJob, ticket);
        }
        await saveSession(auth.companyId, session);
        return authenticateResponse(ticket, getCompanyFilePath(auth.metadata));
      }

      case 'sendRequestXML': {
        const ticket = getXmlText(xml, 'ticket') || getXmlText(xml, 'strTicket');
        const found = await getSession(ticket);
        if (!found) return soapString('sendRequestXML', '');

        const requestName = found.session.requests[found.session.currentIndex];
        if (!requestName) return soapString('sendRequestXML', '');
        const iteratorID = found.session.iterators?.[requestName]?.iteratorID;

        await saveSession(found.session.companyId, found.session);
        return soapString('sendRequestXML', buildQbxmlRequest(requestName, found.session.dateRange, { iteratorID }));
      }

      case 'receiveResponseXML': {
        const ticket = getXmlText(xml, 'ticket') || getXmlText(xml, 'strTicket');
        const responseXml = getXmlText(xml, 'response') || getXmlText(xml, 'responseXML');
        const hresult = getXmlText(xml, 'hresult');
        const message = getXmlText(xml, 'message');
        const found = await getSession(ticket);
        if (!found) return soapInt('receiveResponseXML', 100);

        const session = found.session;
        const requestName = session.requests[session.currentIndex];
        if (!requestName) return soapInt('receiveResponseXML', 100);

        if (hresult || message) {
          session.lastError = [hresult, message].filter(Boolean).join(' - ') || 'QuickBooks returned an error.';
          await saveSession(session.companyId, session);
          if (session.backfillJobId) {
            await markBackfillJobFailed(session.companyId, session.backfillJobId, session.lastError);
          }
          return soapInt('receiveResponseXML', -1);
        }

        const pageRecords = parseResponseRecords(requestName, responseXml);
        const existingResponse = session.responses[requestName];
        const existingRecords = existingResponse?.records || [];
        const previousIterator = session.iterators?.[requestName];
        const pageNumber = (previousIterator?.pageCount || 0) + 1;
        const nextIterator = getIteratorState(requestName, responseXml);
        const nextRecordCount = (existingResponse?.recordCount ?? existingRecords.length) + pageRecords.length;
        if (session.backfillJobId) {
          await saveBackfillPage(
            session.companyId,
            session,
            requestName,
            pageNumber,
            pageRecords,
            nextIterator?.remainingCount ?? null,
            responseXml,
          );
        }
        session.responses[requestName] = {
          receivedAt: new Date().toISOString(),
          records: session.backfillJobId ? [] : [...existingRecords, ...pageRecords],
          recordCount: nextRecordCount,
          rawResponseXmlPreview: responseXml.slice(0, 50000),
        };
        session.iterators = {
          ...(session.iterators || {}),
        };
        if (nextIterator) {
          session.iterators[requestName] = {
            ...nextIterator,
            pageCount: (previousIterator?.pageCount || 0) + 1,
          };
        } else {
          delete session.iterators[requestName];
          session.currentIndex += 1;
        }

        const complete = session.currentIndex >= session.requests.length;
        const progress = complete
          ? 100
          : session.requests.length > 0
            ? Math.max(1, Math.min(99, Math.round((session.currentIndex / session.requests.length) * 100)))
            : 1;
        await saveSession(session.companyId, session);
        if (session.backfillJobId) {
          await updateBackfillJobProgress(session.companyId, session, requestName);
        }

        if (complete) {
          await completeBackfillJob(found.connection!, session);
          return soapInt('receiveResponseXML', 100);
        }

        return soapInt('receiveResponseXML', progress);
      }

      case 'getLastError': {
        const ticket = getXmlText(xml, 'ticket') || getXmlText(xml, 'strTicket');
        const found = await getSession(ticket);
        return soapString('getLastError', found?.session.lastError || 'QuickBooks Desktop sync failed.');
      }

      case 'closeConnection':
        return soapString('closeConnection', 'OK');

      default:
        return soapFault('Unsupported QuickBooks Web Connector SOAP method.');
    }
  } catch (error) {
    console.error('QuickBooks Desktop Web Connector SOAP error', { method, error });
    return soapFault(error instanceof Error ? error.message : 'Unknown Web Connector error.');
  }
}
