import prisma from '@/lib/prisma';

/**
 * Read-only, company-scoped data access for Ask Corelytics tool calls.
 *
 * Every query is built from the allowlisted identifiers below; model-supplied
 * values are only ever bound as SQL parameters, and "companyId" is always $1.
 */

type DatasetKind = 'flow' | 'point_in_time' | 'by_year';

type DatasetDef = {
  table: string;
  description: string;
  kind: DatasetKind;
  dateColumn: string;
  frequencyColumn?: string;
  dimensions: string[];
  measures: string[];
  rowColumns: string[];
  /**
   * Each financial import stores a full copy of history; like the rest of the app, read only
   * the company's latest FinancialRecord.
   */
  latestFinancialRecordOnly?: boolean;
};

const MONTHLY_FINANCIAL_MEASURES = [
  'revenue', 'expense', 'cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 'cogsMaterials', 'cogsCommissions',
  'cogsOther', 'cogsTotal', 'payroll', 'ownerBasePay', 'benefits', 'insurance', 'professionalFees',
  'subcontractors', 'rent', 'taxLicense', 'stateIncomeTaxes', 'federalIncomeTaxes', 'phoneComm',
  'infrastructure', 'autoTravel', 'salesExpense', 'marketing', 'trainingCert', 'mealsEntertainment',
  'interestExpense', 'depreciationAmortization', 'otherExpense', 'nonOperatingIncome', 'nonOperatingExpense',
  'extraordinaryItems', 'cash', 'ar', 'retainageReceivables', 'contractAssets', 'inventory', 'otherCA', 'tca',
  'fixedAssets', 'constructionEquipment', 'officeEquipment', 'shopEquipment', 'investments', 'rightOfUseLeases',
  'otherAssets', 'totalAssets', 'ap', 'loc', 'contractLiabilities', 'otherCL', 'tcl', 'ltd', 'totalLiab',
  'ownersCapital', 'ownersDraw', 'commonStock', 'preferredStock', 'retainedEarnings', 'additionalPaidInCapital',
  'treasuryStock', 'totalEquity', 'totalLAndE',
];

const AGING_BUCKETS = ['current', 'days1to30', 'days31to60', 'days61to90', 'days90plus'];
const ORDER_LINE_MEASURES = ['qtyOrdered', 'qtyShipped', 'qtyInvoiced', 'unitPrice', 'contractValue', 'invoicedAmount', 'remainingAmount', 'unbilledAccrual'];

export const ASK_DATASETS: Record<string, DatasetDef> = {
  monthly_financials: {
    table: 'MonthlyFinancial',
    description:
      'Imported monthly P&L and balance sheet (one row per month, monthDate = first of month). P&L fields are monthly activity; balance sheet fields (cash, ar, ap, inventory, totalAssets, ...) are month-end balances. "expense" is total operating expense excluding COGS.',
    kind: 'flow',
    dateColumn: 'monthDate',
    dimensions: [],
    measures: [...MONTHLY_FINANCIAL_MEASURES, 'currentYearNetIncome'],
    rowColumns: ['monthDate', ...MONTHLY_FINANCIAL_MEASURES, 'currentYearNetIncome', 'revenueBreakdown', 'expenseBreakdown', 'cogsBreakdown'],
    latestFinancialRecordOnly: true,
  },
  daily_financials: {
    table: 'DailyFinancialSnapshot',
    description:
      'Daily financial snapshots from the accounting integration. P&L fields are that day\'s activity (sum them over a range); balance sheet fields are point-in-time balances on snapshotDate (do not sum).',
    kind: 'flow',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: [],
    measures: MONTHLY_FINANCIAL_MEASURES,
    rowColumns: ['snapshotDate', 'frequency', ...MONTHLY_FINANCIAL_MEASURES],
  },
  customer_sales: {
    table: 'CustomerSalesSnapshot',
    description:
      'Sales by customer. Each row is one customer\'s sales for the period ending snapshotDate at the given frequency (daily row = that day, monthly row = that month). Always query a single frequency.',
    kind: 'flow',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['customerName', 'customerId'],
    measures: ['revenue', 'cogs', 'grossMargin', 'invoiceCount', 'bookings'],
    rowColumns: ['snapshotDate', 'frequency', 'customerId', 'customerName', 'revenue', 'cogs', 'grossMargin', 'grossMarginPct', 'invoiceCount', 'avgInvoiceSize', 'bookings'],
  },
  product_sales: {
    table: 'ProductSalesSnapshot',
    description:
      'Sales by product/item. Each row is one item\'s sales for the period ending snapshotDate at the given frequency. Always query a single frequency.',
    kind: 'flow',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['itemName', 'sku', 'itemId'],
    measures: ['quantitySold', 'revenue', 'cogs', 'grossMargin'],
    rowColumns: ['snapshotDate', 'frequency', 'itemId', 'itemName', 'sku', 'quantitySold', 'revenue', 'cogs', 'grossMargin', 'grossMarginPct'],
  },
  inventory: {
    table: 'InventorySnapshot',
    description: 'Inventory on hand by item/warehouse as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['itemName', 'sku', 'itemId', 'warehouse'],
    measures: ['qtyOnHand', 'assetValue'],
    rowColumns: ['snapshotDate', 'itemId', 'itemName', 'sku', 'warehouse', 'bin', 'lot', 'qtyOnHand', 'assetValue', 'avgCost'],
  },
  cash_accounts: {
    table: 'CashSnapshot',
    description: 'Bank account balances as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['accountName'],
    measures: ['cashBalance'],
    rowColumns: ['snapshotDate', 'accountName', 'cashBalance', 'changeAmount', 'changePercent'],
  },
  ar_aging: {
    table: 'ARAgingSnapshot',
    description: 'Total accounts receivable aging buckets as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: [],
    measures: ['totalAR', ...AGING_BUCKETS],
    rowColumns: ['snapshotDate', 'frequency', 'totalAR', ...AGING_BUCKETS],
  },
  ap_aging: {
    table: 'APAgingSnapshot',
    description: 'Total accounts payable aging buckets as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: [],
    measures: ['totalAP', ...AGING_BUCKETS],
    rowColumns: ['snapshotDate', 'frequency', 'totalAP', ...AGING_BUCKETS],
  },
  ar_open_invoices: {
    table: 'AROpenInvoiceSnapshot',
    description: 'Open customer invoices with amount due and aging buckets as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['customerName', 'customerId', 'status'],
    measures: ['amountDueHome', 'amountHome', ...AGING_BUCKETS],
    rowColumns: ['snapshotDate', 'customerName', 'invoiceNo', 'invoiceDate', 'dueDate', 'status', 'amountHome', 'amountDueHome', ...AGING_BUCKETS],
  },
  ap_open_bills: {
    table: 'APOpenBillSnapshot',
    description: 'Open vendor bills with amount due and aging buckets as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['vendorName', 'vendorId', 'status'],
    measures: ['amountDueHome', 'amountHome', ...AGING_BUCKETS],
    rowColumns: ['snapshotDate', 'vendorName', 'billNo', 'billDate', 'dueDate', 'status', 'amountHome', 'amountDueHome', ...AGING_BUCKETS],
  },
  ar_invoice_detail: {
    table: 'ARInvoiceDetail',
    description: 'Customer invoice detail with paid and remaining balance, days outstanding and aging bucket as of asOfDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'asOfDate',
    frequencyColumn: 'snapshotFrequency',
    dimensions: ['customerName', 'customerId', 'agingBucket'],
    measures: ['invoiceAmount', 'amountPaid', 'remainingBalance', 'daysOutstanding'],
    rowColumns: ['asOfDate', 'customerName', 'invoiceId', 'invoiceDate', 'dueDate', 'invoiceAmount', 'amountPaid', 'remainingBalance', 'daysOutstanding', 'agingBucket'],
  },
  ar_payments: {
    table: 'ARPaymentFact',
    description: 'Customer payments received (one row per payment, dated paymentDate).',
    kind: 'flow',
    dateColumn: 'paymentDate',
    dimensions: ['customerName', 'customerId'],
    measures: ['paidAmountHome'],
    rowColumns: ['paymentDate', 'customerName', 'invoiceNo', 'paidAmountHome', 'currencyCode'],
  },
  ap_payments: {
    table: 'APPaymentFact',
    description: 'Payments made to vendors (one row per payment, dated paymentDate).',
    kind: 'flow',
    dateColumn: 'paymentDate',
    dimensions: ['vendorName', 'vendorId'],
    measures: ['paidAmountHome'],
    rowColumns: ['paymentDate', 'vendorName', 'billNo', 'paidAmountHome', 'currencyCode'],
  },
  ar_transactions: {
    table: 'ARTransactionFact',
    description:
      'AR event ledger: transType I=invoice, P=payment, C=credit memo, D=debit memo. normalizedAmount is signed (invoices/debits +, payments/credits -).',
    kind: 'flow',
    dateColumn: 'eventDate',
    dimensions: ['customerName', 'customerId', 'transType'],
    measures: ['amount', 'normalizedAmount'],
    rowColumns: ['eventDate', 'customerName', 'invoiceNum', 'transType', 'invoiceDate', 'dueDate', 'amount', 'normalizedAmount', 'termsCode'],
  },
  ap_transactions: {
    table: 'APTransactionFact',
    description: 'AP event ledger (vouchers, payments, adjustments) by vendor. normalizedAmount is signed.',
    kind: 'flow',
    dateColumn: 'eventDate',
    dimensions: ['vendorName', 'vendorId', 'transType'],
    measures: ['invoiceAmount', 'normalizedAmount'],
    rowColumns: ['eventDate', 'vendorName', 'voucher', 'invoiceNum', 'invoiceDate', 'transType', 'invoiceAmount', 'normalizedAmount', 'termsCode'],
  },
  gl_transactions: {
    table: 'GLTransactionFact',
    description: 'General ledger lines by account. signedAmount is debit-positive.',
    kind: 'flow',
    dateColumn: 'transDate',
    dimensions: ['accountId', 'accountName', 'accountType', 'accountCategory', 'site'],
    measures: ['signedAmount', 'debitAmount', 'creditAmount'],
    rowColumns: ['transDate', 'accountId', 'accountName', 'accountType', 'accountCategory', 'signedAmount', 'debitAmount', 'creditAmount', 'transNum', 'ref', 'description', 'site'],
  },
  open_order_lines: {
    table: 'CustomerOrderLineSnapshot',
    description: 'Customer order lines (backlog/open orders) as of snapshotDate (point in time), with ordered/shipped/invoiced quantities and remaining amount.',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['customerName', 'customerId', 'itemId', 'sku', 'itemName', 'customerPn', 'lineStat'],
    measures: ORDER_LINE_MEASURES,
    rowColumns: ['snapshotDate', 'customerName', 'orderId', 'lineId', 'orderDate', 'itemId', 'itemName', 'sku', 'customerPn', 'lineStat', ...ORDER_LINE_MEASURES],
  },
  filled_order_lines: {
    table: 'CustomerOrderLineFilled',
    description: 'Completed (filled) customer order lines, dated by orderDate.',
    kind: 'flow',
    dateColumn: 'orderDate',
    dimensions: ['customerName', 'customerId', 'itemId', 'sku', 'itemName', 'customerPn', 'lineStat'],
    measures: ORDER_LINE_MEASURES,
    rowColumns: ['orderDate', 'filledAsOf', 'customerName', 'orderId', 'lineId', 'itemId', 'itemName', 'sku', 'customerPn', ...ORDER_LINE_MEASURES],
  },
  vendors: {
    table: 'VendorSnapshot',
    description: 'Vendor master with YTD / last-year purchases and payments as of snapshotDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'snapshotDate',
    frequencyColumn: 'frequency',
    dimensions: ['vendorName', 'vendorId', 'status', 'termsCode', 'state', 'country'],
    measures: ['payYtd', 'payLastYear', 'purchaseYtd', 'purchaseLastYear'],
    rowColumns: ['snapshotDate', 'vendorName', 'vendorId', 'status', 'termsCode', 'lastPaidDate', 'lastPurchaseDate', 'payYtd', 'payLastYear', 'purchaseYtd', 'purchaseLastYear', 'city', 'state', 'country'],
  },
  customer_contracts: {
    table: 'CustomerContractStatus',
    description: 'Customer contract status (value, earned, invoiced, remaining, unbilled, AR, cash collected) as of asOfDate (point in time).',
    kind: 'point_in_time',
    dateColumn: 'asOfDate',
    dimensions: ['customerName', 'customerId', 'contractId'],
    measures: ['contractValue', 'earnedToDate', 'invoicedToDate', 'remainingValue', 'accruedRevenueUnbilled', 'arOutstanding', 'cashCollectedToDate'],
    rowColumns: ['asOfDate', 'customerName', 'contractId', 'contractValue', 'earnedToDate', 'invoicedToDate', 'remainingValue', 'accruedRevenueUnbilled', 'arOutstanding', 'cashCollectedToDate', 'lastPaymentDate'],
  },
  customer_cash_flow: {
    table: 'CustomerCashFlow',
    description: 'Cash received by customer and source, dated by date.',
    kind: 'flow',
    dateColumn: 'date',
    dimensions: ['customerName', 'customerId', 'source'],
    measures: ['cashInflow'],
    rowColumns: ['date', 'customerName', 'source', 'cashInflow'],
  },
  bakery_product_costs: {
    table: 'BakersCogsFact',
    description: 'Bakery product formula / recipe cost lines (ingredients, packaging, labor) by product and formulaDate.',
    kind: 'flow',
    dateColumn: 'formulaDate',
    dimensions: ['productName', 'productId', 'lineType', 'metricName', 'categoryNo', 'description', 'sheetName'],
    measures: ['quantity', 'unitCost', 'lineCost', 'valueNumber'],
    rowColumns: ['formulaDate', 'productName', 'productId', 'sheetName', 'lineType', 'lineNumber', 'metricName', 'categoryNo', 'description', 'quantity', 'unitCost', 'lineCost', 'valueNumber', 'notes'],
  },
  retail_store_monthly_facts: {
    table: 'PlatosClosetMonthlyFact',
    description: 'Retail store workbook monthly facts (sales, inventory, aging) by factType / metricName / dimension, dated monthStart.',
    kind: 'flow',
    dateColumn: 'monthStart',
    dimensions: ['factType', 'metricName', 'dimensionType', 'dimensionKey', 'dimensionLabel'],
    measures: ['valueNumber', 'compareNumber', 'sharePct', 'auxNumber'],
    rowColumns: ['monthKey', 'factType', 'metricName', 'dimensionType', 'dimensionLabel', 'valueNumber', 'compareNumber', 'sharePct', 'auxNumber'],
  },
  product_revenue_plan: {
    table: 'ProductRevenueLine',
    description: 'Wholesale product revenue lines by customer/item for a calendar year; actualRevenue is a JSON map of month -> revenue.',
    kind: 'by_year',
    dateColumn: 'year',
    dimensions: ['customerName', 'customerGroup', 'itemSku', 'customerPartNumber', 'team', 'csr', 'productionType', 'statusFlag'],
    measures: [],
    rowColumns: ['year', 'customerName', 'customerGroup', 'itemSku', 'customerPartNumber', 'team', 'csr', 'productionType', 'statusFlag', 'actualRevenue'],
  },
  product_forecast: {
    table: 'ProductRevenueForecastLine',
    description: 'Wholesale product quantity forecast lines by customer/item for a calendar year; forecastQty/adjustedQty/actualQty are JSON maps of month -> quantity.',
    kind: 'by_year',
    dateColumn: 'year',
    dimensions: ['customerName', 'customerGroup', 'itemSku', 'customerPartNumber', 'team', 'csr', 'productionType', 'statusFlag'],
    measures: ['annualBaseQty'],
    rowColumns: ['year', 'customerName', 'customerGroup', 'itemSku', 'customerPartNumber', 'team', 'statusFlag', 'annualBaseQty', 'forecastQty', 'adjustedQty', 'actualQty'],
  },
  vendor_forecast: {
    table: 'VendorMonthlyForecastLine',
    description: 'Vendor purchase quantity forecast lines by vendor/customer/item for a calendar year; forecastQty/actualQty are JSON maps of month -> quantity.',
    kind: 'by_year',
    dateColumn: 'year',
    dimensions: ['vendorName', 'vendorId', 'customerName', 'customerGroup', 'itemSku', 'team', 'statusFlag'],
    measures: ['annualBaseQty'],
    rowColumns: ['year', 'vendorName', 'customerName', 'itemSku', 'customerPartNumber', 'statusFlag', 'annualBaseQty', 'forecastQty', 'actualQty'],
  },
};

const MAX_LIMIT = 200;
const PERIODS = ['day', 'week', 'month', 'quarter', 'year'] as const;
type Period = (typeof PERIODS)[number];

const q = (ident: string) => `"${ident.replace(/"/g, '')}"`;
const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonthEnd = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getUTCDate() === 1;
};

function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'number') return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
}

function latestFinancialRecordFromSql(table: string): string {
  return `(SELECT * FROM ${q(table)} WHERE "companyId" = $1 AND "financialRecordId" = (
    SELECT id FROM "FinancialRecord" WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 1
  )) t`;
}

async function run(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  const rows = (await prisma.$queryRawUnsafe(sql, ...params)) as Record<string, unknown>[];
  return rows.map((r) => toJsonSafe(r) as Record<string, unknown>);
}

export async function listAskDatasets(companyId: string) {
  const entries = await Promise.all(
    Object.entries(ASK_DATASETS).map(async ([name, def]) => {
      const freqSelect = def.frequencyColumn
        ? `, ARRAY_AGG(DISTINCT ${q(def.frequencyColumn)}) AS frequencies`
        : '';
      try {
        const [row] = await run(
          `SELECT COUNT(*)::int AS "rowCount", MIN(${q(def.dateColumn)}) AS "minDate", MAX(${q(def.dateColumn)}) AS "maxDate"${freqSelect}
           FROM ${def.latestFinancialRecordOnly ? latestFinancialRecordFromSql(def.table) : q(def.table)} WHERE "companyId" = $1`,
          [companyId],
        );
        return { name, def, stats: row };
      } catch (error) {
        return { name, def, stats: { error: error instanceof Error ? error.message : String(error) } };
      }
    }),
  );
  return entries
    .filter((e) => Number((e.stats as any)?.rowCount || 0) > 0)
    .map(({ name, def, stats }) => ({
      dataset: name,
      description: def.description,
      kind: def.kind,
      dateColumn: def.dateColumn,
      dimensions: def.dimensions,
      measures: def.measures,
      rowColumns: def.rowColumns,
      ...stats,
    }));
}

type Filter = { column: string; op: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown };

export type QueryDatasetArgs = {
  dataset: string;
  operation: 'aggregate' | 'rows';
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  year?: number;
  frequency?: string;
  groupBy?: string[];
  period?: Period;
  measures?: string[];
  filters?: Filter[];
  orderBy?: { column: string; direction?: 'asc' | 'desc' };
  limit?: number;
};

export async function queryAskDataset(companyId: string, args: QueryDatasetArgs) {
  const def = ASK_DATASETS[String(args?.dataset || '')];
  if (!def) return { error: `Unknown dataset "${args?.dataset}". Call list_datasets first.` };

  const params: unknown[] = [companyId];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where: string[] = ['"companyId" = $1'];
  const allColumns = new Set([def.dateColumn, ...def.dimensions, ...def.measures, ...def.rowColumns]);

  // Daily and monthly rows describe the same activity, so never mix frequencies.
  let frequency: string | null = null;
  if (def.frequencyColumn) {
    if (args.frequency) {
      frequency = String(args.frequency);
    } else {
      const freqs = await run(
        `SELECT ${q(def.frequencyColumn)} AS f, COUNT(*)::int AS n FROM ${q(def.table)} WHERE "companyId" = $1 GROUP BY 1 ORDER BY 2 DESC`,
        [companyId],
      );
      const available = freqs.map((r) => String(r.f));
      // Monthly rows are the reconciled period totals; daily rows are only needed for
      // ranges that don't cover whole months (or the current, still-open month).
      const coversWholeMonths =
        isDateKey(args.startDate) && args.startDate.endsWith('-01') && isDateKey(args.endDate) && isMonthEnd(args.endDate);
      if (available.includes('monthly') && (coversWholeMonths || !available.includes('daily'))) frequency = 'monthly';
      else frequency = available.includes('daily') ? 'daily' : available[0] || null;
    }
    if (frequency) where.push(`${q(def.frequencyColumn)} = ${bind(frequency)}`);
  }

  if (def.kind === 'by_year') {
    if (args.year) where.push(`"year" = ${bind(Number(args.year))}`);
  } else {
    if (isDateKey(args.startDate)) where.push(`${q(def.dateColumn)} >= ${bind(args.startDate)}::date`);
    if (isDateKey(args.endDate)) where.push(`${q(def.dateColumn)} < (${bind(args.endDate)}::date + interval '1 day')`);
  }

  for (const filter of Array.isArray(args.filters) ? args.filters.slice(0, 10) : []) {
    const column = String(filter?.column || '');
    if (!allColumns.has(column) || column === def.dateColumn) {
      return { error: `Cannot filter on "${column}". Allowed: ${[...allColumns].filter((c) => c !== def.dateColumn).join(', ')}` };
    }
    const col = q(column);
    switch (filter.op) {
      case 'eq': where.push(`${col} = ${bind(filter.value)}`); break;
      case 'neq': where.push(`${col} IS DISTINCT FROM ${bind(filter.value)}`); break;
      case 'contains': where.push(`${col}::text ILIKE ${bind(`%${String(filter.value ?? '')}%`)}`); break;
      case 'in': where.push(`${col}::text = ANY(${bind((Array.isArray(filter.value) ? filter.value : [filter.value]).map(String))}::text[])`); break;
      case 'gt': where.push(`${col} > ${bind(Number(filter.value))}`); break;
      case 'gte': where.push(`${col} >= ${bind(Number(filter.value))}`); break;
      case 'lt': where.push(`${col} < ${bind(Number(filter.value))}`); break;
      case 'lte': where.push(`${col} <= ${bind(Number(filter.value))}`); break;
      default: return { error: `Unsupported filter op "${(filter as Filter)?.op}".` };
    }
  }

  const period: Period | null = args.period && PERIODS.includes(args.period) ? args.period : null;

  // Point-in-time tables: use the latest snapshot on/before asOfDate (or the end of the
  // range), or the latest snapshot within each period when trending.
  let snapshotNote: string | null = null;
  if (def.kind === 'point_in_time') {
    const baseWhere = where.join(' AND ');
    if (period) {
      where.push(
        `${q(def.dateColumn)} IN (SELECT MAX(${q(def.dateColumn)}) FROM ${q(def.table)} WHERE ${baseWhere} GROUP BY date_trunc('${period}', ${q(def.dateColumn)}))`,
      );
      snapshotNote = `Point-in-time dataset: used the latest snapshot within each ${period}.`;
    } else {
      const asOf = isDateKey(args.asOfDate) ? args.asOfDate : isDateKey(args.endDate) ? args.endDate : null;
      const latestParams = asOf ? [...params, asOf] : params;
      const asOfClause = asOf ? ` AND ${q(def.dateColumn)} < ($${latestParams.length}::date + interval '1 day')` : '';
      const [latest] = await run(
        `SELECT MAX(${q(def.dateColumn)}) AS d FROM ${q(def.table)} WHERE ${baseWhere}${asOfClause}`,
        latestParams,
      );
      if (!latest?.d) return { dataset: args.dataset, frequency, rows: [], note: 'No snapshot found for the requested date/filters.' };
      where.push(`${q(def.dateColumn)}::date = ${bind(latest.d)}::date`);
      snapshotNote = `Point-in-time dataset: used snapshot dated ${latest.d}.`;
    }
  }

  const fromSql = def.latestFinancialRecordOnly ? latestFinancialRecordFromSql(def.table) : q(def.table);
  const whereSql = where.join(' AND ');
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(args.limit) || 50)));

  if (args.operation === 'rows') {
    const orderCol = args.orderBy?.column && allColumns.has(args.orderBy.column) ? args.orderBy.column : def.dateColumn;
    const dir = args.orderBy?.direction === 'asc' ? 'ASC' : 'DESC';
    const [{ total }] = await run(`SELECT COUNT(*)::int AS total FROM ${fromSql} WHERE ${whereSql}`, params);
    const rows = await run(
      `SELECT ${def.rowColumns.map(q).join(', ')} FROM ${fromSql} WHERE ${whereSql} ORDER BY ${q(orderCol)} ${dir} NULLS LAST LIMIT ${limit}`,
      params,
    );
    return { dataset: args.dataset, frequency, totalMatchingRows: total, returnedRows: rows.length, note: snapshotNote, rows };
  }

  const measures = (Array.isArray(args.measures) && args.measures.length ? args.measures : def.measures.slice(0, 4)).filter(
    (m) => def.measures.includes(m),
  );
  if (measures.length === 0) return { error: `No valid measures. Allowed: ${def.measures.join(', ') || '(none — use operation "rows")'}` };
  const groupBy = (Array.isArray(args.groupBy) ? args.groupBy : []).filter((d) => def.dimensions.includes(d));

  const selectParts: string[] = [];
  const groupParts: string[] = [];
  if (period) {
    selectParts.push(`to_char(date_trunc('${period}', ${q(def.dateColumn)}), 'YYYY-MM-DD') AS period`);
    groupParts.push('1');
  }
  for (const d of groupBy) {
    selectParts.push(q(d));
    groupParts.push(q(d));
  }
  const measureSql = measures.map((m) => `SUM(${q(m)})::float8 AS ${q(m)}`);
  const orderCol = args.orderBy?.column && (measures.includes(args.orderBy.column) || args.orderBy.column === 'period' || groupBy.includes(args.orderBy.column))
    ? args.orderBy.column
    : period ? 'period' : measures[0];
  const dir = args.orderBy?.direction === 'asc' || (!args.orderBy && period) ? 'ASC' : 'DESC';

  const [totals] = await run(
    `SELECT COUNT(*)::int AS "rowCount", ${measureSql.join(', ')}, MIN(${q(def.dateColumn)}) AS "minDate", MAX(${q(def.dateColumn)}) AS "maxDate" FROM ${fromSql} WHERE ${whereSql}`,
    params,
  );
  let groups: Record<string, unknown>[] = [];
  let groupCount: number | null = null;
  if (selectParts.length) {
    const groupSql = `SELECT ${[...selectParts, ...measureSql, 'COUNT(*)::int AS "rowCount"'].join(', ')} FROM ${fromSql} WHERE ${whereSql} GROUP BY ${groupParts.join(', ')}`;
    const [{ n }] = await run(`SELECT COUNT(*)::int AS n FROM (${groupSql}) g`, params);
    groupCount = n as number;
    groups = await run(`${groupSql} ORDER BY ${q(orderCol)} ${dir} NULLS LAST LIMIT ${limit}`, params);
  }
  return {
    dataset: args.dataset,
    frequency,
    note: snapshotNote,
    totals,
    groupCount,
    returnedGroups: groups.length,
    groups,
  };
}

export async function getAskLoansAndCovenants(companyId: string) {
  const loans = await prisma.loan.findMany({
    where: { companyId },
    include: { covenants: true },
    orderBy: { startDate: 'desc' },
    take: 50,
  });
  return toJsonSafe(
    loans.map((loan) => ({
      loanName: loan.loanName,
      lenderName: loan.lenderName,
      loanType: loan.loanType,
      status: loan.status,
      loanAmount: loan.loanAmount,
      interestRate: loan.interestRate,
      termMonths: loan.termMonths,
      startDate: loan.startDate,
      endDate: loan.endDate,
      notes: loan.notes,
      covenants: loan.covenants.map((c) => ({
        covenantName: c.covenantName,
        covenantType: c.covenantType,
        threshold: c.threshold,
        currentValue: c.currentValue,
        status: c.status,
        isApplicable: c.isApplicable,
        description: c.description,
      })),
    })),
  );
}

export const ASK_DATA_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_datasets',
      description:
        'List the financial and operational datasets that have data for this company, with row counts, date coverage, frequencies, and the dimensions/measures each one supports. Call this first.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_dataset',
      description: [
        'Query one dataset. operation "aggregate" sums measures, optionally grouped by dimensions and/or a time period, and always returns grand totals. operation "rows" returns raw rows.',
        'Dates are YYYY-MM-DD (Eastern calendar dates). startDate/endDate are inclusive.',
        'Point-in-time datasets (balances, aging, inventory, open items) use the latest snapshot on/before asOfDate (or endDate) unless period is set, in which case the latest snapshot in each period is used.',
        'by_year datasets filter with "year" instead of dates.',
        'Datasets with frequencies: if omitted, monthly is used for whole-month ranges and daily otherwise. Monthly rows are the reconciled period totals; prefer them for month/quarter/year questions and use daily only for partial months or day-level detail.',
        'Sanity-check results against monthly_financials revenue for the same period; if a breakdown total is far off, say the detail data looks unreliable rather than reporting it.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          dataset: { type: 'string', enum: Object.keys(ASK_DATASETS) },
          operation: { type: 'string', enum: ['aggregate', 'rows'] },
          startDate: { type: 'string', description: 'YYYY-MM-DD inclusive' },
          endDate: { type: 'string', description: 'YYYY-MM-DD inclusive' },
          asOfDate: { type: 'string', description: 'YYYY-MM-DD, point-in-time datasets only' },
          year: { type: 'integer', description: 'by_year datasets only' },
          frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          groupBy: { type: 'array', items: { type: 'string' }, description: 'Dimension columns to group by' },
          period: { type: 'string', enum: [...PERIODS], description: 'Group results by time period' },
          measures: { type: 'array', items: { type: 'string' }, description: 'Measure columns to sum' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'neq', 'contains', 'in', 'gt', 'gte', 'lt', 'lte'] },
                value: {},
              },
              required: ['column', 'op', 'value'],
            },
          },
          orderBy: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
          limit: { type: 'integer', description: `Max groups/rows to return (1-${MAX_LIMIT}, default 50)` },
        },
        required: ['dataset', 'operation'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_loans_and_covenants',
      description: 'Return the company\'s loans and their covenants (threshold, current value, compliance status).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

export async function executeAskDataTool(companyId: string, name: string, rawArgs: unknown): Promise<unknown> {
  try {
    const args = (typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {}) as Record<string, unknown>;
    if (name === 'list_datasets') return await listAskDatasets(companyId);
    if (name === 'query_dataset') return await queryAskDataset(companyId, args as unknown as QueryDatasetArgs);
    if (name === 'get_loans_and_covenants') return await getAskLoansAndCovenants(companyId);
    return { error: `Unknown tool "${name}"` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
