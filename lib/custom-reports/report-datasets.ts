export type ReportDatasetColumnType = 'text' | 'date' | 'number' | 'currency' | 'percent';

export type ReportDatasetColumn = {
  key: string;
  label: string;
  type: ReportDatasetColumnType;
  aliases?: string[];
  sqlExpression?: string;
};

export type ReportDataset = {
  id: string;
  label: string;
  description: string;
  tableName: string;
  aliases: string[];
  defaultColumns: string[];
  defaultSort: Array<{ field: string; direction: 'asc' | 'desc' }>;
  defaultLimit: number;
  maxPreviewLimit: number;
  entityFilters?: Array<{ field: string; entityType: string; aliases: string[] }>;
  dateField?: string;
  frequencyField?: string;
  columns: ReportDatasetColumn[];
};

export type ReportDatasetFilterConfig = {
  field: string;
  fields?: string[];
  operator: string;
  value: string;
  entityType?: string;
};

export type ReportDatasetCatalogItem = {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  defaultColumns: string[];
  entityFilters?: ReportDataset['entityFilters'];
  columns: Array<ReportDatasetColumn & { aliases: string[] }>;
};

function col(
  key: string,
  label: string,
  type: ReportDatasetColumnType,
  aliases: string[] = [],
  options: Pick<ReportDatasetColumn, 'sqlExpression'> = {}
): ReportDatasetColumn {
  return { key, label, type, aliases, ...options };
}

const commonSnapshotColumns = [
  col('snapshotDate', 'Snapshot Date', 'date', ['date', 'as of date', 'snapshot']),
  col('frequency', 'Frequency', 'text', ['cadence']),
];

const commonSourceColumns = [
  col('sourcePlatform', 'Source Platform', 'text', ['source system', 'platform']),
  col('sourceProgram', 'Source Program', 'text', ['program']),
  col('sourceTransaction', 'Source Transaction', 'text', ['transaction source']),
];

export const reportDatasets: ReportDataset[] = [
  {
    id: 'product_unit_economics',
    label: 'Product Unit Economics',
    description: 'Product-level quantity, revenue, price, COGS, unit cost, and margin without requiring a customer filter.',
    tableName: 'ProductSalesSnapshot',
    aliases: ['product metrics', 'product unit economics', 'unit economics', 'unit cost', 'unit price', 'product quantities', 'product price', 'product cost'],
    defaultColumns: ['snapshotDate', 'itemName', 'sku', 'quantitySold', 'revenue', 'unitPrice', 'cogs', 'unitCost', 'grossMargin', 'grossMarginPct'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }, { field: 'revenue', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'sku', entityType: 'product', aliases: ['sku', 'item', 'product', 'part'] },
      { field: 'itemId', entityType: 'product', aliases: ['item id', 'item', 'product', 'part'] },
      { field: 'itemName', entityType: 'product', aliases: ['item name', 'product name', 'part name'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('itemId', 'Item ID', 'text', ['item id', 'part id', 'product id']),
      col('itemName', 'Item Name', 'text', ['item', 'item name', 'product', 'product name', 'part']),
      col('sku', 'SKU', 'text', ['sku', 'item code', 'part number']),
      col('quantitySold', 'Quantity Sold', 'number', ['quantity sold', 'qty sold', 'quantity', 'quantities', 'units']),
      col('revenue', 'Revenue', 'currency', ['sales', 'revenue']),
      col('unitPrice', 'Unit Price', 'currency', ['price', 'unit price', 'selling price', 'average price', 'avg price'], {
        sqlExpression: 'COALESCE("revenue", 0) / NULLIF(COALESCE("quantitySold", 0), 0)',
      }),
      col('cogs', 'COGS', 'currency', ['cost', 'cogs', 'cost of goods sold']),
      col('unitCost', 'Unit Cost', 'currency', ['unit cost', 'average cost', 'avg cost', 'cost per unit'], {
        sqlExpression: 'COALESCE("cogs", 0) / NULLIF(COALESCE("quantitySold", 0), 0)',
      }),
      col('grossMargin', 'Gross Margin', 'currency', ['margin dollars', 'gross margin']),
      col('grossMarginPct', 'Gross Margin %', 'percent', ['margin percent', 'gross margin percent', 'margin rate']),
    ],
  },
  {
    id: 'customer_orders',
    label: 'Customer Orders',
    description: 'Customer order line detail including order dates, items, quantities, prices, and order values.',
    tableName: 'CustomerOrderLineSnapshot',
    aliases: ['orders', 'order lines', 'customer orders', 'sales orders', 'open orders', 'order detail'],
    defaultColumns: ['orderId', 'lineId', 'orderDate', 'customerName', 'itemName', 'sku', 'qtyOrdered', 'unitPrice', 'contractValue'],
    defaultSort: [{ field: 'orderDate', direction: 'desc' }, { field: 'orderId', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'orderDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] },
      { field: 'orderId', entityType: 'order', aliases: ['order', 'order id', 'order number'] },
      { field: 'sku', entityType: 'product', aliases: ['sku', 'item', 'product', 'part'] },
      { field: 'itemId', entityType: 'product', aliases: ['item id', 'item', 'product', 'part'] },
      { field: 'itemName', entityType: 'product', aliases: ['item name', 'product name', 'part name'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('orderId', 'Order ID', 'text', ['order', 'order id', 'order number', 'sales order']),
      col('lineId', 'Line ID', 'text', ['line', 'line number', 'order line']),
      col('orderDate', 'Order Date', 'date', ['order date', 'ordate date', 'ordered date']),
      col('itemId', 'Item ID', 'text', ['item id', 'part id', 'product id']),
      col('itemName', 'Item Name', 'text', ['item', 'item name', 'product', 'product name', 'part']),
      col('sku', 'SKU', 'text', ['sku', 'item code', 'part number']),
      col('qtyOrdered', 'Qty Ordered', 'number', ['quantity ordered', 'qty ordered', 'quantity', 'qty', 'ordered quantity']),
      col('qtyInvoiced', 'Qty Invoiced', 'number', ['quantity invoiced', 'qty invoiced', 'invoiced quantity']),
      col('unitPrice', 'Unit Price', 'currency', ['price', 'unit price', 'selling price', 'sale price']),
      col('contractValue', 'Contract Value', 'currency', ['contract value', 'order value', 'line value', 'extended price']),
      col('invoicedAmount', 'Invoiced Amount', 'currency', ['invoiced amount', 'billed amount']),
      col('remainingAmount', 'Remaining Amount', 'currency', ['remaining amount', 'open amount', 'backlog']),
      col('unbilledAccrual', 'Unbilled Accrual', 'currency', ['unbilled accrual', 'unbilled']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'customer_sales',
    label: 'Customer Sales',
    description: 'Customer revenue, COGS, margin, invoice count, and average invoice size by snapshot period.',
    tableName: 'CustomerSalesSnapshot',
    aliases: ['customer sales', 'customer revenue', 'sales by customer', 'revenue by customer', 'customer margin'],
    defaultColumns: ['snapshotDate', 'customerName', 'revenue', 'cogs', 'grossMargin', 'grossMarginPct', 'invoiceCount', 'avgInvoiceSize'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [{ field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] }],
    columns: [
      ...commonSnapshotColumns,
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('revenue', 'Revenue', 'currency', ['sales', 'revenue']),
      col('cogs', 'COGS', 'currency', ['cost', 'cogs', 'cost of goods sold']),
      col('grossMargin', 'Gross Margin', 'currency', ['margin dollars', 'gross margin']),
      col('grossMarginPct', 'Gross Margin %', 'percent', ['margin percent', 'gross margin percent', 'margin rate']),
      col('invoiceCount', 'Invoice Count', 'number', ['invoices', 'invoice count']),
      col('avgInvoiceSize', 'Average Invoice Size', 'currency', ['average invoice', 'avg invoice size']),
      col('bookings', 'Bookings', 'currency', ['bookings']),
    ],
  },
  {
    id: 'customer_open_invoices',
    label: 'Customer Open Invoices',
    description: 'Open customer invoice balances, due dates, statuses, and aging buckets.',
    tableName: 'AROpenInvoiceSnapshot',
    aliases: ['open invoices', 'customer invoices', 'ar invoices', 'receivables detail', 'aging detail'],
    defaultColumns: ['snapshotDate', 'customerName', 'invoiceNo', 'invoiceDate', 'dueDate', 'status', 'amountDueHome', 'current', 'days1to30', 'days31to60', 'days61to90', 'days90plus'],
    defaultSort: [{ field: 'dueDate', direction: 'asc' }, { field: 'invoiceDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] },
      { field: 'invoiceNo', entityType: 'invoice', aliases: ['invoice', 'invoice number'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('invoiceNo', 'Invoice No', 'text', ['invoice', 'invoice no', 'invoice number']),
      col('invoiceDate', 'Invoice Date', 'date', ['invoice date']),
      col('dueDate', 'Due Date', 'date', ['due date']),
      col('status', 'Status', 'text', ['status']),
      col('currencyCode', 'Currency', 'text', ['currency']),
      col('amountCurrency', 'Amount Currency', 'currency', ['foreign amount']),
      col('amountHome', 'Amount Home', 'currency', ['invoice amount', 'amount']),
      col('amountDueHome', 'Amount Due', 'currency', ['balance', 'amount due', 'open balance']),
      col('current', 'Current', 'currency', ['current']),
      col('days1to30', '1-30 Days', 'currency', ['1 30', '1-30']),
      col('days31to60', '31-60 Days', 'currency', ['31 60', '31-60']),
      col('days61to90', '61-90 Days', 'currency', ['61 90', '61-90']),
      col('days90plus', '90+ Days', 'currency', ['90+', 'over 90']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'sales_invoice_headers',
    label: 'Sales Invoice Headers',
    description: 'Sales invoice header records with order and invoice identifiers.',
    tableName: 'SalesInvoiceHeaderSnapshot',
    aliases: ['invoice headers', 'sales invoices', 'invoice list'],
    defaultColumns: ['snapshotDate', 'customerName', 'orderId', 'invoiceNo', 'invoiceDate'],
    defaultSort: [{ field: 'invoiceDate', direction: 'desc' }, { field: 'invoiceNo', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'invoiceDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] },
      { field: 'invoiceNo', entityType: 'invoice', aliases: ['invoice', 'invoice number'] },
      { field: 'orderId', entityType: 'order', aliases: ['order', 'order number'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('orderId', 'Order ID', 'text', ['order', 'order id', 'order number']),
      col('invoiceNo', 'Invoice No', 'text', ['invoice', 'invoice no', 'invoice number']),
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('invoiceDate', 'Invoice Date', 'date', ['invoice date']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'ar_transactions',
    label: 'AR Transactions',
    description: 'Accounts receivable invoice, payment, credit, and debit transaction events.',
    tableName: 'ARTransactionFact',
    aliases: ['ar transactions', 'receivable transactions', 'customer transactions', 'invoice events'],
    defaultColumns: ['eventDate', 'customerName', 'invoiceNum', 'transType', 'amount', 'normalizedAmount', 'dueDate'],
    defaultSort: [{ field: 'eventDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'eventDate',
    entityFilters: [
      { field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] },
      { field: 'invoiceNum', entityType: 'invoice', aliases: ['invoice', 'invoice number'] },
    ],
    columns: [
      col('eventDate', 'Event Date', 'date', ['event date', 'transaction date', 'date']),
      col('recordDate', 'Record Date', 'date', ['record date']),
      col('arAcct', 'AR Account', 'text', ['ar account']),
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('invoiceNum', 'Invoice No', 'text', ['invoice', 'invoice number']),
      col('invSeq', 'Invoice Sequence', 'text', ['invoice sequence']),
      col('coNum', 'Order ID', 'text', ['order', 'order id', 'customer order']),
      col('applyToInvNum', 'Apply To Invoice', 'text', ['apply to invoice']),
      col('transType', 'Transaction Type', 'text', ['type', 'transaction type']),
      col('invoiceDate', 'Invoice Date', 'date', ['invoice date']),
      col('dueDate', 'Due Date', 'date', ['due date']),
      col('amount', 'Amount', 'currency', ['amount']),
      col('normalizedAmount', 'Normalized Amount', 'currency', ['normalized amount', 'signed amount']),
      col('currencyCode', 'Currency', 'text', ['currency']),
      col('termsCode', 'Terms', 'text', ['terms']),
      col('payType', 'Pay Type', 'text', ['pay type', 'payment type']),
      col('sourcePlatform', 'Source Platform', 'text', ['source system', 'platform']),
      col('sourceProgram', 'Source Program', 'text', ['program']),
    ],
  },
  {
    id: 'ar_payments',
    label: 'AR Payments',
    description: 'Customer payment facts by payment date, invoice, and amount.',
    tableName: 'ARPaymentFact',
    aliases: ['customer payments', 'ar payments', 'payments received', 'cash receipts'],
    defaultColumns: ['paymentDate', 'customerName', 'invoiceNo', 'paidAmountHome', 'currencyCode'],
    defaultSort: [{ field: 'paymentDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'paymentDate',
    entityFilters: [
      { field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] },
      { field: 'invoiceNo', entityType: 'invoice', aliases: ['invoice', 'invoice number'] },
    ],
    columns: [
      col('paymentDate', 'Payment Date', 'date', ['payment date', 'paid date', 'date']),
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('invoiceNo', 'Invoice No', 'text', ['invoice', 'invoice number']),
      col('currencyCode', 'Currency', 'text', ['currency']),
      col('paidAmountCurrency', 'Paid Amount Currency', 'currency', ['foreign paid amount']),
      col('paidAmountHome', 'Paid Amount', 'currency', ['paid amount', 'payment amount', 'cash received']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'customer_contracts',
    label: 'Customer Contract Status',
    description: 'Customer contract value, earned, invoiced, remaining, AR, and cash collected status.',
    tableName: 'CustomerContractStatus',
    aliases: ['contracts', 'customer contracts', 'contract status', 'backlog'],
    defaultColumns: ['asOfDate', 'customerName', 'contractId', 'contractValue', 'earnedToDate', 'invoicedToDate', 'remainingValue', 'arOutstanding', 'cashCollectedToDate'],
    defaultSort: [{ field: 'asOfDate', direction: 'desc' }, { field: 'contractId', direction: 'asc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'asOfDate',
    entityFilters: [
      { field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] },
      { field: 'contractId', entityType: 'contract', aliases: ['contract', 'contract id'] },
    ],
    columns: [
      col('asOfDate', 'As Of Date', 'date', ['as of date', 'date']),
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('contractId', 'Contract ID', 'text', ['contract', 'contract id']),
      col('contractValue', 'Contract Value', 'currency', ['contract value', 'value']),
      col('earnedToDate', 'Earned To Date', 'currency', ['earned', 'earned to date']),
      col('invoicedToDate', 'Invoiced To Date', 'currency', ['invoiced', 'billed']),
      col('remainingValue', 'Remaining Value', 'currency', ['remaining', 'remaining value', 'backlog']),
      col('accruedRevenueUnbilled', 'Accrued Revenue Unbilled', 'currency', ['unbilled revenue', 'accrued revenue']),
      col('arOutstanding', 'AR Outstanding', 'currency', ['ar outstanding', 'receivable']),
      col('cashCollectedToDate', 'Cash Collected To Date', 'currency', ['cash collected', 'collections']),
      col('lastPaymentDate', 'Last Payment Date', 'date', ['last payment date']),
    ],
  },
  {
    id: 'customer_cash_flow',
    label: 'Customer Cash Flow',
    description: 'Customer cash inflow rows by date and source.',
    tableName: 'CustomerCashFlow',
    aliases: ['customer cash flow', 'cash inflow', 'cash collections', 'collections'],
    defaultColumns: ['date', 'customerName', 'cashInflow', 'source'],
    defaultSort: [{ field: 'date', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'date',
    entityFilters: [{ field: 'customerName', entityType: 'customer', aliases: ['customer', 'client', 'account'] }],
    columns: [
      col('date', 'Date', 'date', ['date', 'cash date']),
      col('customerId', 'Customer ID', 'text', ['customer number', 'cust num']),
      col('customerName', 'Customer', 'text', ['customer', 'client', 'account']),
      col('cashInflow', 'Cash Inflow', 'currency', ['cash inflow', 'cash collected', 'collections']),
      col('source', 'Source', 'text', ['source']),
    ],
  },
  {
    id: 'products',
    label: 'Product Sales',
    description: 'Product sales, quantity sold, revenue, COGS, and gross margin by item/SKU.',
    tableName: 'ProductSalesSnapshot',
    aliases: ['products', 'product sales', 'items', 'skus', 'product margin', 'item sales'],
    defaultColumns: ['snapshotDate', 'itemName', 'sku', 'quantitySold', 'revenue', 'cogs', 'grossMargin', 'grossMarginPct'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }, { field: 'revenue', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'sku', entityType: 'product', aliases: ['sku', 'item', 'product', 'part'] },
      { field: 'itemId', entityType: 'product', aliases: ['item id', 'item', 'product', 'part'] },
      { field: 'itemName', entityType: 'product', aliases: ['item name', 'product name', 'part name'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('itemId', 'Item ID', 'text', ['item id', 'part id', 'product id']),
      col('itemName', 'Item Name', 'text', ['item', 'item name', 'product', 'product name', 'part']),
      col('sku', 'SKU', 'text', ['sku', 'item code', 'part number']),
      col('quantitySold', 'Quantity Sold', 'number', ['quantity sold', 'qty sold', 'quantity', 'quantities', 'units']),
      col('revenue', 'Revenue', 'currency', ['sales', 'revenue']),
      col('unitPrice', 'Unit Price', 'currency', ['price', 'unit price', 'selling price', 'average price', 'avg price'], {
        sqlExpression: 'COALESCE("revenue", 0) / NULLIF(COALESCE("quantitySold", 0), 0)',
      }),
      col('cogs', 'COGS', 'currency', ['cost', 'cogs', 'cost of goods sold']),
      col('unitCost', 'Unit Cost', 'currency', ['unit cost', 'average cost', 'avg cost', 'cost per unit'], {
        sqlExpression: 'COALESCE("cogs", 0) / NULLIF(COALESCE("quantitySold", 0), 0)',
      }),
      col('grossMargin', 'Gross Margin', 'currency', ['margin dollars', 'gross margin']),
      col('grossMarginPct', 'Gross Margin %', 'percent', ['margin percent', 'gross margin percent', 'margin rate']),
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Inventory on hand, value, average cost, warehouse, bin, and lot by item/SKU.',
    tableName: 'InventorySnapshot',
    aliases: ['inventory', 'stock', 'on hand', 'inventory value', 'item cost'],
    defaultColumns: ['snapshotDate', 'itemName', 'sku', 'warehouse', 'qtyOnHand', 'assetValue', 'avgCost'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }, { field: 'assetValue', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'sku', entityType: 'product', aliases: ['sku', 'item', 'product', 'part'] },
      { field: 'itemId', entityType: 'product', aliases: ['item id', 'item', 'product', 'part'] },
      { field: 'itemName', entityType: 'product', aliases: ['item name', 'product name', 'part name'] },
      { field: 'warehouse', entityType: 'location', aliases: ['warehouse', 'location'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('itemId', 'Item ID', 'text', ['item id', 'part id', 'product id']),
      col('itemName', 'Item Name', 'text', ['item', 'item name', 'product', 'product name', 'part']),
      col('sku', 'SKU', 'text', ['sku', 'item code', 'part number']),
      col('warehouse', 'Warehouse', 'text', ['warehouse', 'location']),
      col('bin', 'Bin', 'text', ['bin']),
      col('lot', 'Lot', 'text', ['lot']),
      col('qtyOnHand', 'Qty On Hand', 'number', ['quantity on hand', 'qty on hand', 'on hand']),
      col('assetValue', 'Inventory Value', 'currency', ['inventory value', 'asset value', 'value']),
      col('avgCost', 'Average Cost', 'currency', ['average cost', 'avg cost', 'unit cost', 'cost']),
    ],
  },
  {
    id: 'ap_open_bills',
    label: 'AP Open Bills',
    description: 'Open vendor bill balances, due dates, statuses, and aging buckets.',
    tableName: 'APOpenBillSnapshot',
    aliases: ['open bills', 'vendor bills', 'ap bills', 'payables detail'],
    defaultColumns: ['snapshotDate', 'vendorName', 'billNo', 'billDate', 'dueDate', 'status', 'amountDueHome', 'current', 'days1to30', 'days31to60', 'days61to90', 'days90plus'],
    defaultSort: [{ field: 'dueDate', direction: 'asc' }, { field: 'billDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [
      { field: 'vendorName', entityType: 'vendor', aliases: ['vendor', 'supplier'] },
      { field: 'billNo', entityType: 'bill', aliases: ['bill', 'bill number'] },
    ],
    columns: [
      ...commonSnapshotColumns,
      col('vendorId', 'Vendor ID', 'text', ['vendor number']),
      col('vendorName', 'Vendor', 'text', ['vendor', 'supplier']),
      col('billNo', 'Bill No', 'text', ['bill', 'bill no', 'bill number']),
      col('billDate', 'Bill Date', 'date', ['bill date']),
      col('dueDate', 'Due Date', 'date', ['due date']),
      col('status', 'Status', 'text', ['status']),
      col('currencyCode', 'Currency', 'text', ['currency']),
      col('amountCurrency', 'Amount Currency', 'currency', ['foreign amount']),
      col('amountHome', 'Amount Home', 'currency', ['bill amount', 'amount']),
      col('amountDueHome', 'Amount Due', 'currency', ['balance', 'amount due', 'open balance']),
      col('current', 'Current', 'currency', ['current']),
      col('days1to30', '1-30 Days', 'currency', ['1 30', '1-30']),
      col('days31to60', '31-60 Days', 'currency', ['31 60', '31-60']),
      col('days61to90', '61-90 Days', 'currency', ['61 90', '61-90']),
      col('days90plus', '90+ Days', 'currency', ['90+', 'over 90']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'ap_payments',
    label: 'AP Payments',
    description: 'Vendor payment facts by payment date, bill, and amount.',
    tableName: 'APPaymentFact',
    aliases: ['vendor payments', 'ap payments', 'payments made', 'bill payments'],
    defaultColumns: ['paymentDate', 'vendorName', 'billNo', 'paidAmountHome', 'currencyCode'],
    defaultSort: [{ field: 'paymentDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'paymentDate',
    entityFilters: [
      { field: 'vendorName', entityType: 'vendor', aliases: ['vendor', 'supplier'] },
      { field: 'billNo', entityType: 'bill', aliases: ['bill', 'bill number'] },
    ],
    columns: [
      col('paymentDate', 'Payment Date', 'date', ['payment date', 'paid date', 'date']),
      col('vendorId', 'Vendor ID', 'text', ['vendor number']),
      col('vendorName', 'Vendor', 'text', ['vendor', 'supplier']),
      col('billNo', 'Bill No', 'text', ['bill', 'bill number']),
      col('currencyCode', 'Currency', 'text', ['currency']),
      col('paidAmountCurrency', 'Paid Amount Currency', 'currency', ['foreign paid amount']),
      col('paidAmountHome', 'Paid Amount', 'currency', ['paid amount', 'payment amount', 'cash paid']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'vendors',
    label: 'Vendors',
    description: 'Vendor master and balance snapshot fields.',
    tableName: 'VendorSnapshot',
    aliases: ['vendors', 'suppliers', 'vendor list', 'vendor balances'],
    defaultColumns: ['snapshotDate', 'vendorName', 'status', 'lastPaidDate', 'lastPurchaseDate', 'payYtd', 'purchaseYtd'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }, { field: 'vendorName', direction: 'asc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [{ field: 'vendorName', entityType: 'vendor', aliases: ['vendor', 'supplier'] }],
    columns: [
      ...commonSnapshotColumns,
      col('vendorId', 'Vendor ID', 'text', ['vendor number']),
      col('vendorName', 'Vendor', 'text', ['vendor', 'supplier']),
      col('sourceRecordDate', 'Source Record Date', 'date', ['source record date']),
      col('lastPaidDate', 'Last Paid Date', 'date', ['last paid date']),
      col('lastPurchaseDate', 'Last Purchase Date', 'date', ['last purchase date']),
      col('currencyCode', 'Currency', 'text', ['currency']),
      col('termsCode', 'Terms', 'text', ['terms']),
      col('payType', 'Pay Type', 'text', ['pay type']),
      col('status', 'Status', 'text', ['status']),
      col('city', 'City', 'text', ['city']),
      col('state', 'State', 'text', ['state']),
      col('country', 'Country', 'text', ['country']),
      col('payYtd', 'Pay YTD', 'currency', ['pay ytd', 'paid ytd']),
      col('payLastYear', 'Pay Last Year', 'currency', ['pay last year']),
      col('purchaseYtd', 'Purchase YTD', 'currency', ['purchase ytd']),
      col('purchaseLastYear', 'Purchase Last Year', 'currency', ['purchase last year']),
      col('newAmount', 'New Amount', 'currency', ['new amount']),
      col('oldAmount', 'Old Amount', 'currency', ['old amount']),
      ...commonSourceColumns,
    ],
  },
  {
    id: 'cash_accounts',
    label: 'Cash Accounts',
    description: 'Cash balance snapshots by account.',
    tableName: 'CashSnapshot',
    aliases: ['cash', 'cash accounts', 'bank accounts', 'bank balances'],
    defaultColumns: ['snapshotDate', 'accountName', 'accountNumber', 'cashBalance', 'changeAmount', 'changePercent'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }, { field: 'cashBalance', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    entityFilters: [{ field: 'accountName', entityType: 'account', aliases: ['account', 'bank account'] }],
    columns: [
      ...commonSnapshotColumns,
      col('accountId', 'Account ID', 'text', ['account id']),
      col('accountName', 'Account Name', 'text', ['account', 'account name', 'bank account']),
      col('accountNumber', 'Account Number', 'text', ['account number']),
      col('cashBalance', 'Cash Balance', 'currency', ['cash balance', 'balance']),
      col('changeAmount', 'Change Amount', 'currency', ['change amount']),
      col('changePercent', 'Change Percent', 'percent', ['change percent']),
    ],
  },
  {
    id: 'ar_aging',
    label: 'AR Aging',
    description: 'Accounts receivable aging summary by snapshot period.',
    tableName: 'ARAgingSnapshot',
    aliases: ['ar aging', 'receivables aging', 'accounts receivable aging'],
    defaultColumns: ['snapshotDate', 'totalAR', 'current', 'days1to30', 'days31to60', 'days61to90', 'days90plus'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    columns: [
      ...commonSnapshotColumns,
      col('totalAR', 'Total AR', 'currency', ['total ar', 'accounts receivable']),
      col('current', 'Current', 'currency', ['current']),
      col('days1to30', '1-30 Days', 'currency', ['1 30', '1-30']),
      col('days31to60', '31-60 Days', 'currency', ['31 60', '31-60']),
      col('days61to90', '61-90 Days', 'currency', ['61 90', '61-90']),
      col('days90plus', '90+ Days', 'currency', ['90+', 'over 90']),
    ],
  },
  {
    id: 'ap_aging',
    label: 'AP Aging',
    description: 'Accounts payable aging summary by snapshot period.',
    tableName: 'APAgingSnapshot',
    aliases: ['ap aging', 'payables aging', 'accounts payable aging'],
    defaultColumns: ['snapshotDate', 'totalAP', 'current', 'days1to30', 'days31to60', 'days61to90', 'days90plus'],
    defaultSort: [{ field: 'snapshotDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'snapshotDate',
    frequencyField: 'frequency',
    columns: [
      ...commonSnapshotColumns,
      col('totalAP', 'Total AP', 'currency', ['total ap', 'accounts payable']),
      col('current', 'Current', 'currency', ['current']),
      col('days1to30', '1-30 Days', 'currency', ['1 30', '1-30']),
      col('days31to60', '31-60 Days', 'currency', ['31 60', '31-60']),
      col('days61to90', '61-90 Days', 'currency', ['61 90', '61-90']),
      col('days90plus', '90+ Days', 'currency', ['90+', 'over 90']),
    ],
  },
  {
    id: 'monthly_financials',
    label: 'Monthly Financials',
    description: 'Monthly financial statement balances and performance metrics.',
    tableName: 'MonthlyFinancial',
    aliases: ['monthly financials', 'financials', 'income statement', 'balance sheet', 'p&l'],
    defaultColumns: ['monthDate', 'revenue', 'cogsTotal', 'expense', 'cash', 'ar', 'ap', 'inventory'],
    defaultSort: [{ field: 'monthDate', direction: 'desc' }],
    defaultLimit: 250,
    maxPreviewLimit: 500,
    dateField: 'monthDate',
    columns: [
      col('monthDate', 'Month', 'date', ['month', 'period', 'date']),
      col('revenue', 'Revenue', 'currency', ['sales', 'revenue']),
      col('cogsTotal', 'COGS', 'currency', ['cogs', 'cost of goods sold']),
      col('expense', 'Operating Expense', 'currency', ['expense', 'operating expense']),
      col('cash', 'Cash', 'currency', ['cash']),
      col('ar', 'Accounts Receivable', 'currency', ['ar', 'accounts receivable']),
      col('ap', 'Accounts Payable', 'currency', ['ap', 'accounts payable']),
      col('inventory', 'Inventory', 'currency', ['inventory']),
      col('loc', 'Line of Credit', 'currency', ['line of credit', 'loc']),
      col('totalAssets', 'Total Assets', 'currency', ['assets', 'total assets']),
      col('totalLiab', 'Total Liabilities', 'currency', ['liabilities', 'total liabilities']),
      col('totalEquity', 'Total Equity', 'currency', ['equity', 'total equity']),
      col('nonOperatingIncome', 'Non-Operating Income', 'currency', ['non operating income']),
      col('nonOperatingExpense', 'Non-Operating Expense', 'currency', ['non operating expense']),
    ],
  },
];

export function normalizeReportText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getReportDataset(datasetId: string | null | undefined): ReportDataset | undefined {
  return reportDatasets.find((dataset) => dataset.id === String(datasetId || '').trim());
}

export function getReportDatasetCatalog(): ReportDatasetCatalogItem[] {
  return reportDatasets.map((dataset) => ({
    id: dataset.id,
    label: dataset.label,
    description: dataset.description,
    aliases: dataset.aliases,
    defaultColumns: dataset.defaultColumns,
    entityFilters: dataset.entityFilters,
    columns: dataset.columns.map((column) => ({
      key: column.key,
      label: column.label,
      type: column.type,
      aliases: column.aliases || [],
    })),
  }));
}

export function getDatasetColumn(dataset: ReportDataset, columnKey: string | null | undefined): ReportDatasetColumn | undefined {
  return dataset.columns.find((column) => column.key === String(columnKey || '').trim());
}

export function normalizeDatasetColumns(dataset: ReportDataset, rawColumns: any[]): ReportDatasetColumn[] {
  const columns = (Array.isArray(rawColumns) ? rawColumns : [])
    .map((item: any) => {
      const key = typeof item === 'string' ? item : item?.key || item?.field;
      return getDatasetColumn(dataset, key);
    })
    .filter((column): column is ReportDatasetColumn => Boolean(column));

  const seen = new Set<string>();
  const unique = columns.filter((column) => {
    if (seen.has(column.key)) return false;
    seen.add(column.key);
    return true;
  });

  if (unique.length > 0) return unique.slice(0, 16);
  return dataset.defaultColumns
    .map((key) => getDatasetColumn(dataset, key))
    .filter((column): column is ReportDatasetColumn => Boolean(column));
}

export function inferDatasetFromPrompt(prompt: string): ReportDataset | null {
  const normalizedPrompt = normalizeReportText(prompt);
  if (!normalizedPrompt) return null;
  const asksProductUnitMetrics =
    /\b(product|item|sku|part)\b/.test(normalizedPrompt) &&
    /\b(unit cost|avg cost|average cost|cost per unit|unit price|avg price|average price|price|quantity|quantities|qty|cogs|margin)\b/.test(normalizedPrompt);
  const asksOrderDetail =
    /\b(order id|order number|order date|line id|line number|all orders|order lines?)\b/.test(normalizedPrompt);
  if (asksProductUnitMetrics && !asksOrderDetail) {
    return getReportDataset('product_unit_economics') || null;
  }

  const scored = reportDatasets
    .map((dataset) => {
      const aliases = [dataset.label, dataset.id.replace(/_/g, ' '), ...dataset.aliases].map(normalizeReportText);
      const score = aliases.reduce((sum, alias) => {
        if (!alias) return sum;
        if (normalizedPrompt.includes(alias)) return sum + Math.max(4, alias.split(' ').length * 2);
        return sum;
      }, 0);
      return { dataset, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.dataset || null;
}

export function inferColumnsFromPrompt(dataset: ReportDataset, prompt: string): ReportDatasetColumn[] {
  const normalizedPrompt = normalizeReportText(prompt);
  const matches = dataset.columns.filter((column) => {
    const aliases = [column.key, column.label, ...(column.aliases || [])].map(normalizeReportText);
    return aliases.some((alias) => alias && normalizedPrompt.includes(alias));
  });
  return normalizeDatasetColumns(dataset, matches.map((column) => column.key));
}

export function extractEntityNameFromPrompt(prompt: string): string | null {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\bfor\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+sorted?\b|$)/i,
    /\bcustomer\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+orders?\b|$)/i,
    /\bvendor\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+bills?\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const candidate = String(match?.[1] || '')
      .replace(/^(customer|client|vendor|supplier|product|item)\s+/i, '')
      .replace(/\b(all|the|their|its)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate && candidate.length >= 2) return candidate;
  }
  return null;
}

function extractEntityNameByType(prompt: string, entityType: string): string | null {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  const patternsByType: Record<string, RegExp[]> = {
    product: [
      /\b(?:item|sku|product|part)(?:\s+number|\s+id|\s+code)?\s+([A-Za-z0-9][A-Za-z0-9._/-]*)(?:\b|$)/i,
      /\b(?:for|of)\s+(?:item|sku|product|part)\s+([A-Za-z0-9][A-Za-z0-9._/-]*)(?:\b|$)/i,
    ],
    customer: [
      /\bcustomer\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+orders?\b|$)/i,
      /\bclient\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+orders?\b|$)/i,
    ],
    vendor: [
      /\bvendor\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+bills?\b|$)/i,
      /\bsupplier\s+(.+?)(?:\s+with\b|\s+where\b|\s+showing\b|\s+return\b|\s+including\b|\s+bills?\b|$)/i,
    ],
  };
  const patterns = patternsByType[entityType] || [];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const candidate = String(match?.[1] || '')
      .replace(/\b(all|the|their|its)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate && candidate.length >= 2) return candidate;
  }
  return null;
}

export function inferDatasetFiltersFromPrompt(dataset: ReportDataset, prompt: string) {
  const normalizedPrompt = normalizeReportText(prompt);
  if (!dataset.entityFilters?.length) return [];

  const preferredEntityType = normalizedPrompt.includes('vendor') || normalizedPrompt.includes('supplier')
    ? 'vendor'
    : normalizedPrompt.includes('item') || normalizedPrompt.includes('sku') || normalizedPrompt.includes('product')
      ? 'product'
      : 'customer';
  const entityName =
    extractEntityNameByType(prompt, preferredEntityType) ||
    extractEntityNameFromPrompt(prompt);
  if (!entityName) return [];
  const filterMeta =
    dataset.entityFilters.find((filter) => filter.entityType === preferredEntityType) ||
    dataset.entityFilters.find((filter) => filter.entityType === 'customer') ||
    dataset.entityFilters[0];

  if (!filterMeta) return [];
  const siblingFields = dataset.entityFilters
    .filter((filter) => filter.entityType === filterMeta.entityType)
    .map((filter) => filter.field);
  return [{
    field: filterMeta.field,
    fields: siblingFields.length > 1 ? siblingFields : undefined,
    operator: siblingFields.length > 1 ? 'containsAny' : 'contains',
    value: entityName,
    entityType: filterMeta.entityType,
  }];
}

export function normalizeDatasetLimit(dataset: ReportDataset, rawLimit: unknown): number {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return dataset.defaultLimit;
  return Math.min(Math.max(Math.floor(parsed), 1), dataset.maxPreviewLimit);
}

export function normalizeDatasetSort(dataset: ReportDataset, rawSort: any[]) {
  const sort = (Array.isArray(rawSort) ? rawSort : [])
    .map((item: any) => {
      const field = getDatasetColumn(dataset, item?.field || item?.key);
      if (!field) return null;
      return {
        field: field.key,
        direction: String(item?.direction || item?.dir || '').toLowerCase() === 'asc' ? 'asc' : 'desc',
      };
    })
    .filter(Boolean) as Array<{ field: string; direction: 'asc' | 'desc' }>;
  return sort.length > 0 ? sort.slice(0, 4) : dataset.defaultSort;
}
