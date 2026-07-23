import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptOAuthToken } from '@/lib/encryption';
import { seedQuickBooksDesktopAccountMappings } from '@/lib/quickbooks-desktop/account-mapping-seed';
import { syncQuickBooksDesktopOperationalPayload } from '@/lib/quickbooks-desktop/operational-sync';
import {
  buildQuickBooksDesktopAgingSummaryFromReport,
  buildQuickBooksDesktopFinancialPayload,
  buildQuickBooksDesktopOperationalPayload,
} from '@/lib/quickbooks-desktop/backfill-payloads';
import { enqueueQuickBooksDesktopPostSyncJob } from '@/lib/quickbooks-desktop/post-sync-jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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
  quickbooksDesktopDetailBackfillJobs?: Record<string, QbdBackfillJob>;
  quickbooksDesktopDetailBackfillResponses?: Record<string, QbwcResponseSet>;
  quickbooksDesktopDetailBackfillLastRun?: Record<string, unknown>;
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
  backfillJobIds?: Record<string, string>;
  backfillJobSequence?: Array<{
    id: string;
    requestName: string;
    dateRange: QbwcDateRange;
  }>;
  backfillJobKind?: 'header' | 'detail';
  lastError?: string | null;
};

type QbdBackfillJob = {
  id: string;
  batchId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  requestName: string;
  detailType?: 'line_items';
  processingMode?: 'aging_snapshot';
  windowIndex?: number;
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
  includeLineItems?: boolean;
  pageSize?: number;
};

const DEFAULT_REQUESTS = [
  'AccountQuery',
  'CustomerQuery',
  'VendorQuery',
  'InvoiceQuery',
  'BillQuery',
  'ReceivePaymentQuery',
];

const REQUIRED_QBD_REPORT_REQUESTS = [
  'BalanceSheetStandardReportQuery',
  'TrialBalanceReportQuery',
  'GeneralDetailReportQuery',
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
  'OtherNameQuery',
  'EntityQuery',
];

const RECOMMENDED_QBD_REQUESTS = [
  ...REQUIRED_QBD_REPORT_REQUESTS,
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

const REPORT_REQUESTS = new Set([
  'BalanceSheetStandardReportQuery',
  'TrialBalanceReportQuery',
  'GeneralDetailReportQuery',
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
]);

const QBD_TRANSACTION_PAGE_SIZE = 250;
const QBD_INCLUDE_TRANSACTION_LINE_ITEMS = true;
const QBD_BACKFILL_JOBS_PER_SESSION = 6;
const QBD_SHORT_WINDOW_BACKFILL_JOBS_PER_SESSION = 25;
const QBD_SHORT_WINDOW_MAX_DAYS = 7;
const QBD_AGING_SNAPSHOT_JOBS_PER_SESSION = 25;
const QBD_DETAIL_TRANSACTION_PAGE_SIZE = 25;
const QBD_DETAIL_BACKFILL_JOBS_PER_SESSION = 6;

const QBD_LINE_ITEM_TRANSACTION_REQUESTS = new Set([
  'InvoiceQuery',
  'BillQuery',
  'SalesReceiptQuery',
  'CreditMemoQuery',
  'CheckQuery',
  'DepositQuery',
  'VendorCreditQuery',
  'JournalEntryQuery',
]);

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

const ITEM_RET_TAGS = [
  'ItemServiceRet',
  'ItemInventoryRet',
  'ItemNonInventoryRet',
  'ItemInventoryAssemblyRet',
  'ItemOtherChargeRet',
  'ItemSubtotalRet',
  'ItemDiscountRet',
  'ItemPaymentRet',
  'ItemSalesTaxRet',
  'ItemSalesTaxGroupRet',
  'ItemGroupRet',
  'ItemFixedAssetRet',
];

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

function getAttributeFromTagXml(tagXml: string, attributeName: string): string {
  const attributePattern = new RegExp(`\\b${attributeName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const attributeMatch = tagXml.match(attributePattern);
  return attributeMatch ? xmlDecode(attributeMatch[1].trim()) : '';
}

function getXmlOpenTags(xml: string, tagName: string): string[] {
  const tags: string[] = [];
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*\\/?>`, 'gi');
  let match = pattern.exec(xml);
  while (match) {
    tags.push(match[0]);
    match = pattern.exec(xml);
  }
  return tags;
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

function normalizeFrequency(value: unknown): Frequency {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'monthly') return normalized;
  return 'daily';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return year && month && day ? `${year}-${month}-${day}` : formatDate(date);
}

function getHourInTimeZone(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date).find((part) => part.type === 'hour')?.value;
  const parsed = Number(hour);
  return Number.isFinite(parsed) ? parsed : date.getUTCHours();
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return formatDate(addDays(parsed, days));
}

function addYearsToDateKey(dateKey: string, years: number): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return formatDate(addYears(parsed, years));
}

function getLatestAvailableQuickBooksDate(now = new Date()): string {
  const easternTimeZone = 'America/New_York';
  const easternDate = formatDateInTimeZone(now, easternTimeZone);
  const easternHour = getHourInTimeZone(now, easternTimeZone);
  // QuickBooks daily data is expected after 2:00 AM Eastern the following day.
  // Before that cutoff, do not request yesterday's incomplete business day.
  return addDaysToDateKey(easternDate, easternHour < 2 ? -2 : -1);
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
    ? [...configured, ...REQUIRED_QBD_REPORT_REQUESTS]
    : [...DEFAULT_REQUESTS, ...RECOMMENDED_QBD_REQUESTS];

  return uniqueStrings(sourceRequests)
    .filter((entity) => entity.endsWith('Query'))
    .filter((entity) => Boolean(RET_TAG_BY_REQUEST[entity] || entity.match(/^[A-Za-z][A-Za-z0-9]*Query$/)));
}

function buildTransactionDateFilter(dateRange: QbwcDateRange): string {
  if (!dateRange.startDate || !dateRange.endDate) return '';
  return `<TxnDateRangeFilter><FromTxnDate>${xmlEscape(dateRange.startDate)}</FromTxnDate><ToTxnDate>${xmlEscape(dateRange.endDate)}</ToTxnDate></TxnDateRangeFilter>`;
}

function buildReportPeriod(dateRange: QbwcDateRange): string {
  if (!dateRange.startDate || !dateRange.endDate) return '';
  return `<ReportPeriod><FromReportDate>${xmlEscape(dateRange.startDate)}</FromReportDate><ToReportDate>${xmlEscape(dateRange.endDate)}</ToReportDate></ReportPeriod>`;
}

function buildAgingReportPeriod(dateRange: QbwcDateRange): string {
  const asOfDate = dateRange.endDate || dateRange.startDate;
  if (!asOfDate) return '';
  return `<ReportPeriod><ToReportDate>${xmlEscape(asOfDate)}</ToReportDate></ReportPeriod>`;
}

function buildReportChildren(requestName: string, dateRange: QbwcDateRange): string {
  const period = buildReportPeriod(dateRange);
  const basis = '<ReportBasis>Accrual</ReportBasis>';
  if (requestName === 'ARAgingSummaryReportQuery') {
    return `<AgingReportType>ARAgingSummary</AgingReportType>${buildAgingReportPeriod(dateRange)}<ReportAgingAsOf>ReportEndDate</ReportAgingAsOf>`;
  }
  if (requestName === 'APAgingSummaryReportQuery') {
    return `<AgingReportType>APAgingSummary</AgingReportType>${buildAgingReportPeriod(dateRange)}<ReportAgingAsOf>ReportEndDate</ReportAgingAsOf>`;
  }
  if (requestName === 'BalanceSheetStandardReportQuery') {
    return `<GeneralSummaryReportType>BalanceSheetStandard</GeneralSummaryReportType>${period}${basis}`;
  }
  if (requestName === 'TrialBalanceReportQuery') {
    return `<GeneralSummaryReportType>TrialBalance</GeneralSummaryReportType>${period}${basis}`;
  }
  if (requestName === 'GeneralDetailReportQuery') {
    return `<GeneralDetailReportType>GeneralLedger</GeneralDetailReportType>${period}${basis}`;
  }
  return `${period}${basis}`;
}

function isLineItemTransactionRequest(requestName: string): boolean {
  return QBD_LINE_ITEM_TRANSACTION_REQUESTS.has(requestName);
}

function buildQbxmlRequest(requestName: string, dateRange: QbwcDateRange, context: QbwcRequestContext = {}): string {
  const childrenByRequest: Record<string, string> = {
    AccountQuery: '<ActiveStatus>All</ActiveStatus>',
    CustomerQuery: '<ActiveStatus>All</ActiveStatus>',
    VendorQuery: '<ActiveStatus>All</ActiveStatus>',
    OtherNameQuery: '<ActiveStatus>All</ActiveStatus>',
    EntityQuery: '<ActiveStatus>All</ActiveStatus>',
    ItemQuery: '<ActiveStatus>All</ActiveStatus>',
  };
  const requestTag = `${requestName}Rq`;
  const requestId = xmlEscape(requestName);
  if (REPORT_REQUESTS.has(requestName)) {
    const reportRequestTag =
      requestName === 'TrialBalanceReportQuery' || requestName === 'BalanceSheetStandardReportQuery'
      ? 'GeneralSummaryReportQueryRq'
      : requestName === 'ARAgingSummaryReportQuery' || requestName === 'APAgingSummaryReportQuery'
        ? 'AgingReportQueryRq'
      : requestTag;
    return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    <${reportRequestTag} requestID="${requestId}">
      ${buildReportChildren(requestName, dateRange)}
    </${reportRequestTag}>
  </QBXMLMsgsRq>
</QBXML>`;
  }
  const useIterator = TRANSACTION_REQUESTS.has(requestName);
  const dateFilter = TRANSACTION_REQUESTS.has(requestName) ? buildTransactionDateFilter(dateRange) : '';
  const includeLineItems = (context.includeLineItems || QBD_INCLUDE_TRANSACTION_LINE_ITEMS) && isLineItemTransactionRequest(requestName)
    ? '<IncludeLineItems>true</IncludeLineItems>'
    : '';
  const pageSize = Math.max(1, Math.min(1000, Number(context.pageSize || QBD_TRANSACTION_PAGE_SIZE)));
  const children = childrenByRequest[requestName] || `<MaxReturned>${pageSize}</MaxReturned>${dateFilter}${includeLineItems}`;
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
    'TxnType',
    'Name',
    'FullName',
    'CompanyName',
    'AccountNumber',
    'AccountType',
    'SpecialAccountType',
    'IsActive',
    'IsPaid',
    'IsPending',
    'IsFinanceCharge',
    'IsToBePrinted',
    'IsToBeEmailed',
    'Balance',
    'TotalBalance',
    'TxnDate',
    'RefNumber',
    'Desc',
    'SalesDesc',
    'PurchaseDesc',
    'ManufacturerPartNumber',
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
    'Price',
    'SalesPrice',
    'PurchaseCost',
    'TotalValue',
  ];

  for (const field of fields) {
    const value = getXmlText(xml, field);
    if (value) record[field] = value;
  }

  for (const refTag of ['AccountRef', 'CustomerRef', 'VendorRef', 'ItemRef', 'ClassRef', 'PayeeEntityRef']) {
    const refXml = getInnerXml(xml, refTag);
    if (!refXml) continue;
    record[refTag] = {
      ListID: getXmlText(refXml, 'ListID'),
      FullName: getXmlText(refXml, 'FullName'),
    };
  }

  return record;
}

function parseNestedSimpleRecord(xml: string, tagName: string): Record<string, unknown> | null {
  const nestedXml = getInnerXml(xml, tagName);
  if (!nestedXml) return null;
  const record = parseSimpleRecord(nestedXml);
  return Object.keys(record).length > 0 ? record : null;
}

function parseReportRow(
  rowXml: string,
  rowType: string,
  index: number,
  columnTitlesById: Record<string, string>,
): Record<string, unknown> {
  const rowDataTag = getXmlOpenTags(rowXml, 'RowData')[0] || '';
  const rowValue = getAttributeFromTagXml(rowDataTag, 'value') || getXmlText(rowXml, 'RowData');
  const rowTypeAttr = getAttributeFromTagXml(rowDataTag, 'rowType');
  const colData = getXmlOpenTags(rowXml, 'ColData').map((tag) => ({
    colID: getAttributeFromTagXml(tag, 'colID'),
    colTitle: columnTitlesById[getAttributeFromTagXml(tag, 'colID')] || '',
    value: getAttributeFromTagXml(tag, 'value'),
  }));
  return {
    rowIndex: index,
    rowKind: rowType,
    rowType: rowTypeAttr,
    rowValue,
    accountName: rowValue || colData[0]?.value || '',
    colData,
  };
}

function parseReportRecords(requestName: string, xml: string): Array<Record<string, unknown>> {
  const reportXml = getInnerXml(xml, 'ReportRet');
  if (!reportXml) return [];
  const header = {
    reportName: getXmlText(reportXml, 'ReportName'),
    reportTitle: getXmlText(reportXml, 'ReportTitle'),
    reportSubtitle: getXmlText(reportXml, 'ReportSubtitle'),
    reportBasis: getXmlText(reportXml, 'ReportBasis'),
    numRows: getXmlText(reportXml, 'NumRows'),
    numColumns: getXmlText(reportXml, 'NumColumns'),
  };
  const columnTitlesById = Object.fromEntries(
    getXmlRecords(reportXml, 'ColDesc').map((colXml) => {
      const colDescTag = getXmlOpenTags(colXml, 'ColDesc')[0] || '';
      const colID = getAttributeFromTagXml(colDescTag, 'colID');
      const title = getXmlOpenTags(colXml, 'ColTitle')
        .map((tag) => getAttributeFromTagXml(tag, 'value'))
        .filter(Boolean)
        .join(' ')
        .trim();
      return [colID, title];
    }).filter(([colID]) => Boolean(colID)),
  );
  const rows: Array<Record<string, unknown>> = [];
  for (const rowType of ['TextRow', 'DataRow', 'SubtotalRow', 'TotalRow']) {
    const rowXmls = getXmlRecords(reportXml, rowType);
    for (const rowXml of rowXmls) {
      rows.push({
        requestName,
        ...header,
        ...parseReportRow(rowXml, rowType, rows.length, columnTitlesById),
      });
    }
  }
  return rows;
}

function parseResponseRecords(requestName: string, xml: string): Array<Record<string, unknown>> {
  if (REPORT_REQUESTS.has(requestName)) {
    return parseReportRecords(requestName, xml);
  }
  if (requestName === 'ItemQuery') {
    return ITEM_RET_TAGS.flatMap((retTag) =>
      getXmlRecords(xml, retTag).map((recordXml) => {
        const record = parseSimpleRecord(recordXml);
        record.itemRetType = retTag;
        const salesOrPurchase = parseNestedSimpleRecord(recordXml, 'SalesOrPurchase');
        const salesAndPurchase = parseNestedSimpleRecord(recordXml, 'SalesAndPurchase');
        if (salesOrPurchase) record.SalesOrPurchase = salesOrPurchase;
        if (salesAndPurchase) record.SalesAndPurchase = salesAndPurchase;
        return record;
      }),
    );
  }
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
    if (
      requestName === 'ReceivePaymentQuery' ||
      requestName === 'BillPaymentCheckQuery' ||
      requestName === 'BillPaymentCreditCardQuery'
    ) {
      record.AppliedToTxnRet = getXmlRecords(recordXml, 'AppliedToTxnRet').map(parseSimpleRecord);
    }
    if (requestName === 'SalesReceiptQuery') {
      record.SalesReceiptLineRet = getXmlRecords(recordXml, 'SalesReceiptLineRet').map(parseSimpleRecord);
    }
    if (requestName === 'CreditMemoQuery') {
      record.CreditMemoLineRet = getXmlRecords(recordXml, 'CreditMemoLineRet').map(parseSimpleRecord);
    }
    if (requestName === 'CheckQuery' || requestName === 'VendorCreditQuery') {
      record.ExpenseLineRet = getXmlRecords(recordXml, 'ExpenseLineRet').map(parseSimpleRecord);
      record.ItemLineRet = getXmlRecords(recordXml, 'ItemLineRet').map(parseSimpleRecord);
    }
    if (requestName === 'DepositQuery') {
      record.DepositLineRet = getXmlRecords(recordXml, 'DepositLineRet').map(parseSimpleRecord);
    }
    if (requestName === 'JournalEntryQuery') {
      record.JournalDebitLine = getXmlRecords(recordXml, 'JournalDebitLine').map(parseSimpleRecord);
      record.JournalCreditLine = getXmlRecords(recordXml, 'JournalCreditLine').map(parseSimpleRecord);
      record.JournalDebitLineRet = getXmlRecords(recordXml, 'JournalDebitLineRet').map(parseSimpleRecord);
      record.JournalCreditLineRet = getXmlRecords(recordXml, 'JournalCreditLineRet').map(parseSimpleRecord);
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
  const endDate = getLatestAvailableQuickBooksDate(today);
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
      startDate: configuredStartDate || addYearsToDateKey(endDate, -3),
      endDate,
    };
  }

  const lastSyncAt =
    typeof metadata.quickbooksDesktopLastWebConnectorSyncAt === 'string'
      ? new Date(metadata.quickbooksDesktopLastWebConnectorSyncAt)
      : null;
  const lastSyncDate = lastSyncAt && !Number.isNaN(lastSyncAt.getTime())
    ? formatDateInTimeZone(lastSyncAt, 'America/New_York')
    : null;
  const computedIncrementalStart = lastSyncDate
    ? addDaysToDateKey(lastSyncDate, -2)
    : addDaysToDateKey(endDate, -2);
  const incrementalStart = computedIncrementalStart > endDate
    ? addDaysToDateKey(endDate, -2)
    : computedIncrementalStart;

  return {
    mode: 'INCREMENTAL',
    startDate: incrementalStart,
    endDate,
  };
}

function combineDateRanges(
  ranges: Array<QbwcDateRange | undefined>,
  fallback: QbwcDateRange = { mode: 'MANUAL', startDate: '', endDate: '' },
): QbwcDateRange {
  const validRanges: Array<{ mode: QbwcDateRange['mode']; startDate: string; endDate: string; requestedAt?: string }> = [];
  for (const range of ranges) {
    const startDate = parseDateString(range?.startDate);
    const endDate = parseDateString(range?.endDate);
    if (!startDate || !endDate || startDate > endDate) continue;
    validRanges.push({
      mode: range?.mode || fallback.mode,
      startDate,
      endDate,
      requestedAt: typeof range?.requestedAt === 'string' ? range.requestedAt : undefined,
    });
  }

  if (validRanges.length === 0) return fallback;
  const startDate = validRanges.reduce((min, range) => range.startDate < min ? range.startDate : min, validRanges[0].startDate);
  const endDate = validRanges.reduce((max, range) => range.endDate > max ? range.endDate : max, validRanges[0].endDate);
  return {
    mode: validRanges.some((range) => range.mode === 'MANUAL') ? 'MANUAL' : validRanges[0].mode,
    startDate,
    endDate,
    requestedAt: validRanges.find((range) => range.requestedAt)?.requestedAt,
  };
}

function dateRangeDayCount(dateRange?: QbwcDateRange): number | null {
  const start = parseDateString(dateRange?.startDate);
  const end = parseDateString(dateRange?.endDate);
  if (!start || !end || start > end) return null;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

function getStandardBackfillJobsPerSession(pendingJobs: QbdBackfillJob[]): number {
  const dayCounts = pendingJobs
    .map((job) => dateRangeDayCount(job.dateRange))
    .filter((count): count is number => typeof count === 'number');
  if (dayCounts.length > 0 && Math.max(...dayCounts) <= QBD_SHORT_WINDOW_MAX_DAYS) {
    return QBD_SHORT_WINDOW_BACKFILL_JOBS_PER_SESSION;
  }
  return QBD_BACKFILL_JOBS_PER_SESSION;
}

function getNextBackfillJobs(metadata: QbDesktopMetadata): QbdBackfillJob[] {
  const jobs = metadata.quickbooksDesktopBackfillJobs || {};
  const pendingJobs = Object.values(jobs)
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const standardJobsPerSession = getStandardBackfillJobsPerSession(pendingJobs);
  const standardJobs = pendingJobs
    .filter((job) => job.processingMode !== 'aging_snapshot')
    .slice(0, standardJobsPerSession);
  const agingSnapshotJobs = pendingJobs
    .filter((job) => job.processingMode === 'aging_snapshot')
    .slice(0, QBD_AGING_SNAPSHOT_JOBS_PER_SESSION);
  if (agingSnapshotJobs.length > 0) {
    return agingSnapshotJobs;
  }
  return [...standardJobs, ...agingSnapshotJobs];
}

function getNextDetailBackfillJobs(metadata: QbDesktopMetadata): QbdBackfillJob[] {
  const jobs = metadata.quickbooksDesktopDetailBackfillJobs || {};
  return Object.values(jobs)
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, QBD_DETAIL_BACKFILL_JOBS_PER_SESSION);
}

function getBackfillJobKind(session: QbwcSession): 'header' | 'detail' {
  return session.backfillJobKind === 'detail' ? 'detail' : 'header';
}

function getBackfillJobsForKind(metadata: QbDesktopMetadata, kind: 'header' | 'detail'): Record<string, QbdBackfillJob> {
  return kind === 'detail'
    ? metadata.quickbooksDesktopDetailBackfillJobs || {}
    : metadata.quickbooksDesktopBackfillJobs || {};
}

function withBackfillJobsForKind(
  metadata: QbDesktopMetadata,
  kind: 'header' | 'detail',
  jobs: Record<string, QbdBackfillJob>,
): QbDesktopMetadata {
  return kind === 'detail'
    ? { ...metadata, quickbooksDesktopDetailBackfillJobs: jobs }
    : { ...metadata, quickbooksDesktopBackfillJobs: jobs };
}

function buildCombinedBackfillSession(
  ticket: string,
  companyId: string,
  jobs: Record<string, QbdBackfillJob>,
  responses: Record<string, QbwcResponseSet>,
): QbwcSession {
  const completedJobs = Object.values(jobs)
    .filter((job) => job.status === 'completed' && job.processingMode !== 'aging_snapshot')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
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
    dateRange: combineDateRanges(completedJobs.map((job) => job.dateRange)),
    lastError: null,
  };
}

function parseSnapshotDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBatchIdFromJobId(jobId: string): string {
  return jobId.split(':')[0] || jobId;
}

function getBackfillJobIdForRequest(session: QbwcSession, requestName: string): string {
  const currentJob = session.backfillJobSequence?.[session.currentIndex];
  if (currentJob?.requestName === requestName) return currentJob.id;
  return session.backfillJobIds?.[requestName] || session.backfillJobId || '';
}

function getCurrentRequestDateRange(session: QbwcSession, requestName: string): QbwcDateRange {
  const currentJob = session.backfillJobSequence?.[session.currentIndex];
  return currentJob?.requestName === requestName ? currentJob.dateRange : session.dateRange;
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
  const jobId = getBackfillJobIdForRequest(session, requestName);
  if (!jobId) return;
  const batchId = getBatchIdFromJobId(jobId);
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
      ${jobId},
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

function asMetadataString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasRequiredQuickBooksDesktopSetup(metadata: QbDesktopMetadata): boolean {
  const settings = metadata.quickbooksDesktopSettings || {};
  const credentials = metadata.quickbooksDesktopCredentials || {};
  const requiredKeys = [
    'integrationType',
    'applicationName',
    'ownerId',
    'fileId',
    'webConnectorUsername',
    'desktopEditionYear',
    'countryVersion',
    'companyFilePath',
    'hostMachineName',
  ];
  if (requiredKeys.some((key) => !asMetadataString(settings[key]))) return false;
  if (asMetadataString(settings.integrationType) === 'WEB_CONNECTOR' && !asMetadataString(settings.soapEndpointUrl)) return false;
  return Boolean(asMetadataString(credentials.webConnectorPasswordEncrypted));
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

async function markBackfillJobFailed(
  companyId: string,
  jobId: string,
  message: string,
  kind: 'header' | 'detail' = 'header',
): Promise<void> {
  await updateMetadata(companyId, (metadata) => {
    const jobs = getBackfillJobsForKind(metadata, kind);
    const job = jobs[jobId];
    if (!job) return metadata;
    const now = new Date().toISOString();
    return {
      ...withBackfillJobsForKind(metadata, kind, {
        ...jobs,
        [jobId]: {
          ...job,
          status: 'failed',
          failedAt: now,
          updatedAt: now,
          lastError: message,
        },
      }),
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
  requestNameOverride?: string,
  jobIdOverride?: string,
): Promise<void> {
  const requestName = requestNameOverride || session.requests[0];
  const jobId = jobIdOverride || getBackfillJobIdForRequest(session, requestName);
  if (!jobId) {
    await finalizeSession(connection, session);
    return;
  }
  if (getBackfillJobKind(session) === 'detail') {
    await completeDetailBackfillJob(connection.companyId, session, requestName, jobId);
    return;
  }

  const response = jobId
    ? await loadBackfillJobResponse(jobId, requestName)
    : session.responses[requestName] || {
        receivedAt: new Date().toISOString(),
        records: [],
      };
  let shouldFinalize = false;
  let combinedSession: QbwcSession | null = null;
  let completedJobsSnapshot: Record<string, QbdBackfillJob> | null = null;
  let completedJobSnapshot: QbdBackfillJob | null = null;

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
    completedJobSnapshot = completedJob;
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

  if (completedJobSnapshot?.processingMode === 'aging_snapshot') {
    await persistAgingSnapshotJob(connection.companyId, completedJobSnapshot, response);
  }

  if (shouldFinalize && completedJobsSnapshot) {
    const fullResponses = await loadBackfillResponses(completedJobsSnapshot);
    combinedSession = buildCombinedBackfillSession(session.ticket, connection.companyId, completedJobsSnapshot, fullResponses);
    await finalizeSession(connection, combinedSession);
  }
}

async function persistAgingSnapshotJob(
  companyId: string,
  job: QbdBackfillJob,
  response: QbwcResponseSet,
): Promise<void> {
  const snapshotDate = parseSnapshotDate(job.dateRange?.endDate);
  if (!snapshotDate) return;

  const frequency = normalizeFrequency(
    (await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: 'QUICKBOOKS' } },
      select: { syncFrequency: true },
    }))?.syncFrequency,
  );
  const isAr = job.requestName === 'ARAgingSummaryReportQuery';
  const isAp = job.requestName === 'APAgingSummaryReportQuery';
  if (!isAr && !isAp) return;

  const summary = buildQuickBooksDesktopAgingSummaryFromReport(
    response.records || [],
    isAr ? 'totalAR' : 'totalAP',
  );
  if (!summary) return;

  if (isAr) {
    await prisma.aRAgingSnapshot.upsert({
      where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
      update: {
        totalAR: Number(summary.totalAR || 0),
        current: Number(summary.current || 0),
        days1to30: Number(summary.days1to30 || 0),
        days31to60: Number(summary.days31to60 || 0),
        days61to90: Number(summary.days61to90 || 0),
        days90plus: Number(summary.days90plus || 0),
      },
      create: {
        companyId,
        snapshotDate,
        frequency,
        totalAR: Number(summary.totalAR || 0),
        current: Number(summary.current || 0),
        days1to30: Number(summary.days1to30 || 0),
        days31to60: Number(summary.days31to60 || 0),
        days61to90: Number(summary.days61to90 || 0),
        days90plus: Number(summary.days90plus || 0),
      },
    });
    return;
  }

  await prisma.aPAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: {
      totalAP: Number(summary.totalAP || 0),
      current: Number(summary.current || 0),
      days1to30: Number(summary.days1to30 || 0),
      days31to60: Number(summary.days31to60 || 0),
      days61to90: Number(summary.days61to90 || 0),
      days90plus: Number(summary.days90plus || 0),
    },
    create: {
      companyId,
      snapshotDate,
      frequency,
      totalAP: Number(summary.totalAP || 0),
      current: Number(summary.current || 0),
      days1to30: Number(summary.days1to30 || 0),
      days31to60: Number(summary.days31to60 || 0),
      days61to90: Number(summary.days61to90 || 0),
      days90plus: Number(summary.days90plus || 0),
    },
  });
}

async function completeDetailBackfillJob(
  companyId: string,
  session: QbwcSession,
  requestName: string,
  jobIdOverride?: string,
): Promise<void> {
  const jobId = jobIdOverride || getBackfillJobIdForRequest(session, requestName);
  if (!jobId) return;

  const response = await loadBackfillJobResponse(jobId, requestName);
  let completedJobsSnapshot: Record<string, QbdBackfillJob> | null = null;
  await updateMetadata(companyId, (metadata) => {
    const jobs = metadata.quickbooksDesktopDetailBackfillJobs || {};
    const job = jobs[jobId];
    if (!job) return metadata;
    const now = new Date().toISOString();
    const completedJob = {
      ...job,
      status: 'completed' as const,
      completedAt: now,
      updatedAt: now,
      recordCount: response.records.length,
      pageCount: Math.max(1, Math.ceil((response.records.length || 0) / QBD_DETAIL_TRANSACTION_PAGE_SIZE)),
      iteratorRemainingCount: null,
      lastError: null,
    };
    const nextJobs: Record<string, QbdBackfillJob> = {
      ...jobs,
      [jobId]: completedJob,
    };
    const allComplete = Object.values(nextJobs).every((nextJob) => nextJob.status === 'completed');
    completedJobsSnapshot = allComplete ? nextJobs : null;

    return {
      ...metadata,
      quickbooksDesktopDetailBackfillJobs: nextJobs,
      quickbooksDesktopDetailBackfillResponses: {
        ...(metadata.quickbooksDesktopDetailBackfillResponses || {}),
        [jobId]: {
          receivedAt: response.receivedAt,
          records: [],
          recordCount: response.records.length,
        },
      },
      quickbooksDesktopDetailBackfillLastRun: allComplete
        ? {
            batchId: job.batchId,
            completedAt: now,
            status: 'completed',
          }
        : metadata.quickbooksDesktopDetailBackfillLastRun,
    };
  });

  if (completedJobsSnapshot) {
    const dateRange = combineDateRanges(Object.values(completedJobsSnapshot).map((job) => job.dateRange), session.dateRange);
    if (dateRange.startDate && dateRange.endDate) {
      await enqueueQuickBooksDesktopPostSyncJob({
        companyId,
        source: 'qbd-raw-detail-import-complete',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    }
  }
}

async function markBackfillJobRunning(
  companyId: string,
  job: QbdBackfillJob,
  ticket: string,
  kind: 'header' | 'detail' = 'header',
): Promise<void> {
  await updateMetadata(companyId, (metadata) => {
    const jobs = getBackfillJobsForKind(metadata, kind);
    const current = jobs[job.id] || job;
    const now = new Date().toISOString();
    return withBackfillJobsForKind(metadata, kind, {
        ...jobs,
        [job.id]: {
          ...current,
          status: 'running',
          ticket,
          startedAt: current.startedAt || now,
          updatedAt: now,
          lastError: null,
        },
      });
  });
}

async function markBackfillJobsRunning(
  companyId: string,
  jobs: QbdBackfillJob[],
  ticket: string,
  kind: 'header' | 'detail' = 'header',
): Promise<void> {
  for (const job of jobs) {
    await markBackfillJobRunning(companyId, job, ticket, kind);
  }
}

async function updateBackfillJobProgress(
  companyId: string,
  session: QbwcSession,
  requestName: string,
  jobIdOverride?: string,
  responseKeyOverride?: string,
): Promise<void> {
  const jobId = jobIdOverride || getBackfillJobIdForRequest(session, requestName);
  if (!jobId) return;
  const responseKey = responseKeyOverride || jobId || requestName;
  const response = session.responses[responseKey];
  const iterator = session.iterators?.[responseKey];
  const recordCount = response?.recordCount ?? response?.records.length ?? 0;
  const kind = getBackfillJobKind(session);
  const pageSize = kind === 'detail' ? QBD_DETAIL_TRANSACTION_PAGE_SIZE : QBD_TRANSACTION_PAGE_SIZE;
  await updateMetadata(companyId, (metadata) => {
    const jobs = getBackfillJobsForKind(metadata, kind);
    const job = jobs[jobId];
    if (!job) return metadata;
    if (job.status === 'completed' || job.status === 'failed') return metadata;
    return withBackfillJobsForKind(metadata, kind, {
        ...jobs,
        [jobId]: {
          ...job,
          status: 'running',
          updatedAt: new Date().toISOString(),
          recordCount,
          pageCount: iterator?.pageCount || Math.max(1, Math.ceil(recordCount / pageSize)),
          iteratorRemainingCount: iterator?.remainingCount ?? null,
          lastError: null,
        },
      });
  });
}

async function finalizeSession(connection: NonNullable<Awaited<ReturnType<typeof loadConnection>>>, session: QbwcSession): Promise<void> {
  const companyId = connection.companyId;
  const frequency = normalizeFrequency(connection.syncFrequency);
  const financialPayload = buildQuickBooksDesktopFinancialPayload(session);
  const operationalPayload = buildQuickBooksDesktopOperationalPayload(session);

  let accountMappingSeed: unknown = null;
  let operationalSync: unknown = null;
  let postSyncReprocess: unknown = null;
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

  try {
    const postSyncJob = await enqueueQuickBooksDesktopPostSyncJob({
      companyId,
      source: 'qbd-raw-import-complete',
      startDate: session.dateRange.startDate,
      endDate: session.dateRange.endDate,
    });
    postSyncReprocess = {
      queued: true,
      jobId: postSyncJob.id,
      status: postSyncJob.status,
      startDate: postSyncJob.startDate,
      endDate: postSyncJob.endDate,
    };
  } catch (error) {
    const message = `Post-sync reprocess enqueue failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    lastError = lastError ? `${lastError}; ${message}` : message;
  }

  await updateMetadata(companyId, (metadata) => {
    const {
      quickbooksDesktopFinancialPayload: _financialPayload,
      quickbooksDesktopOperationalPayload: _operationalPayload,
      ...metadataWithoutPayloads
    } = metadata as QbDesktopMetadata & Record<string, unknown>;

    return {
      ...metadataWithoutPayloads,
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
        postSyncReprocess,
        lastError,
      },
    };
  });

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
    where: {
      platform: 'QUICKBOOKS',
      status: 'ACTIVE',
    },
    select: {
      companyId: true,
      connectionMetadata: true,
    },
  });

  for (const connection of connections) {
    const metadata = getMetadata(connection.connectionMetadata);
    if (!hasRequiredQuickBooksDesktopSetup(metadata)) continue;
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
        const backfillJobs = getNextBackfillJobs(auth.metadata);
        const detailBackfillJobs = backfillJobs.length > 0 ? [] : getNextDetailBackfillJobs(auth.metadata);
        const selectedJobs = backfillJobs.length > 0 ? backfillJobs : detailBackfillJobs;
        const backfillJobKind: 'header' | 'detail' = detailBackfillJobs.length > 0 ? 'detail' : 'header';
        const backfillRequests = selectedJobs.map((job) => job.requestName);
        const backfillJobIds = Object.fromEntries(selectedJobs.map((job) => [job.requestName, job.id]));
        const backfillJobSequence = selectedJobs.map((job) => ({
          id: job.id,
          requestName: job.requestName,
          dateRange: job.dateRange,
        }));
        if (selectedJobs.length === 0) {
          await updateMetadata(auth.companyId, (metadata) => ({
            ...metadata,
            quickbooksDesktopQueuedDateRange: null,
            quickbooksDesktopWebConnectorSessions: {},
            quickbooksDesktopWebConnectorLastRecovery: {
              ticket: null,
              resetAt: new Date().toISOString(),
              mode: metadata.quickbooksDesktopQueuedDateRange
                ? 'clear_completed_manual_backfill'
                : 'no_queued_qbd_work',
              reason: metadata.quickbooksDesktopQueuedDateRange
                ? 'Manual QBD backfill had no pending jobs; suppress default incremental fallback.'
                : 'QuickBooks Web Connector checked in with no queued QBD jobs.',
            },
          }));
          return authenticateResponse('', 'none');
        }
        const session: QbwcSession = {
          ticket,
          companyId: auth.companyId,
          createdAt: now,
          updatedAt: now,
          currentIndex: 0,
          requests: backfillRequests.length > 0 ? backfillRequests : buildRequestList(auth.metadata),
          responses: {},
          iterators: {},
          dateRange: selectedJobs.length > 0
            ? combineDateRanges(selectedJobs.map((job) => job.dateRange))
            : getRunDateRange(auth.metadata),
          backfillJobId: selectedJobs[0]?.id,
          backfillJobIds: backfillRequests.length > 0 ? backfillJobIds : undefined,
          backfillJobSequence: backfillRequests.length > 0 ? backfillJobSequence : undefined,
          backfillJobKind: backfillRequests.length > 0 ? backfillJobKind : undefined,
          lastError: null,
        };

        if (selectedJobs.length > 0) {
          await markBackfillJobsRunning(auth.companyId, selectedJobs, ticket, backfillJobKind);
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
        const currentJobId = getBackfillJobIdForRequest(found.session, requestName);
        const responseKey = currentJobId || requestName;
        const iteratorID = found.session.iterators?.[responseKey]?.iteratorID;
        const isDetailBackfill = found.session.backfillJobKind === 'detail';
        const includeLineItems = isDetailBackfill || isLineItemTransactionRequest(requestName);
        const requestDateRange = getCurrentRequestDateRange(found.session, requestName);

        await saveSession(found.session.companyId, found.session);
        return soapString('sendRequestXML', buildQbxmlRequest(requestName, requestDateRange, {
          iteratorID,
          includeLineItems,
          pageSize: isDetailBackfill ? QBD_DETAIL_TRANSACTION_PAGE_SIZE : QBD_TRANSACTION_PAGE_SIZE,
        }));
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
        const currentJobId = getBackfillJobIdForRequest(session, requestName);
        const responseKey = currentJobId || requestName;

        if (hresult || message) {
          session.lastError = [hresult, message].filter(Boolean).join(' - ') || 'QuickBooks returned an error.';
          await saveSession(session.companyId, session);
          const failedJobId = currentJobId;
          if (failedJobId) {
            await markBackfillJobFailed(session.companyId, failedJobId, session.lastError, getBackfillJobKind(session));
          }
          return soapInt('receiveResponseXML', -1);
        }

        const pageRecords = parseResponseRecords(requestName, responseXml);
        const existingResponse = session.responses[responseKey];
        const existingRecords = existingResponse?.records || [];
        const previousIterator = session.iterators?.[responseKey];
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
        session.responses[responseKey] = {
          receivedAt: new Date().toISOString(),
          records: session.backfillJobId ? [] : [...existingRecords, ...pageRecords],
          recordCount: nextRecordCount,
          rawResponseXmlPreview: responseXml.slice(0, 50000),
        };
        session.iterators = {
          ...(session.iterators || {}),
        };
        if (nextIterator) {
          session.iterators[responseKey] = {
            ...nextIterator,
            pageCount: (previousIterator?.pageCount || 0) + 1,
          };
        } else {
          delete session.iterators[responseKey];
          session.currentIndex += 1;
          if (currentJobId) {
            await completeBackfillJob(found.connection!, session, requestName, currentJobId);
          }
        }

        const complete = session.currentIndex >= session.requests.length;
        const progress = complete
          ? 100
          : session.requests.length > 0
            ? Math.max(1, Math.min(99, Math.round((session.currentIndex / session.requests.length) * 100)))
            : 1;
        await saveSession(session.companyId, session);
        if (session.backfillJobId) {
          await updateBackfillJobProgress(session.companyId, session, requestName, currentJobId, responseKey);
        }

        if (complete) {
          if (!session.backfillJobIds && !session.backfillJobId) {
            await finalizeSession(found.connection!, session);
          }
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
