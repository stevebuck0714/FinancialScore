import prisma from '@/lib/prisma';

type DetailPageRow = {
  payload: unknown;
  createdAt?: Date;
};

export type QbdDetailTransformOptions = {
  months?: string[];
  includeNonDetailInvoicePages?: boolean;
  frequencies?: Array<'daily' | 'monthly'>;
};

type ItemMaster = {
  itemId: string;
  fullName: string;
  name: string;
  displayName: string;
  sku: string | null;
  avgCost: number;
};

type ProductAggregate = {
  snapshotDate: Date;
  frequency: 'daily' | 'monthly';
  itemId: string | null;
  itemName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
  cogs: number;
};

type CustomerAggregate = {
  snapshotDate: Date;
  frequency: 'daily' | 'monthly';
  customerId: string | null;
  customerName: string;
  revenue: number;
  invoiceIds: Set<string>;
};

export type QbdDetailTransformResult = {
  success: boolean;
  invoiceRecordsRead: number;
  invoiceLinesRead: number;
  productRowsCreated: number;
  customerRowsCreated: number;
  dailyProductRowsCreated: number;
  dailyCustomerRowsCreated: number;
  monthlyProductRowsCreated: number;
  monthlyCustomerRowsCreated: number;
  monthsProcessed: string[];
  errors: string[];
};

type ProductSnapshotRow = {
  companyId: string;
  snapshotDate: Date;
  frequency: 'daily' | 'monthly';
  itemId: string | null;
  itemName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number | null;
};

type CustomerSnapshotRow = {
  companyId: string;
  snapshotDate: Date;
  frequency: 'daily' | 'monthly';
  customerId: string | null;
  customerName: string;
  revenue: number;
  invoiceCount: number;
  avgInvoiceSize: number;
};

const CREATE_MANY_BATCH_SIZE = 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((row) => Object.keys(row).length > 0)
    : [];
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(record[key]);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) return stringValue;
  }
  return '';
}

function startOfUtcDay(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function startOfUtcMonth(value: unknown): Date | null {
  const parsed = startOfUtcDay(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function getDateRange(dates: Date[]): { gte: Date; lte: Date } | null {
  if (dates.length === 0) return null;
  let min = dates[0];
  let max = dates[0];
  for (const date of dates) {
    if (date.getTime() < min.getTime()) min = date;
    if (date.getTime() > max.getTime()) max = date;
  }
  return { gte: min, lte: max };
}

async function createProductRowsInBatches(rows: ProductSnapshotRow[]): Promise<void> {
  for (let index = 0; index < rows.length; index += CREATE_MANY_BATCH_SIZE) {
    await prisma.productSalesSnapshot.createMany({
      data: rows.slice(index, index + CREATE_MANY_BATCH_SIZE),
    });
  }
}

async function createCustomerRowsInBatches(rows: CustomerSnapshotRow[]): Promise<void> {
  for (let index = 0; index < rows.length; index += CREATE_MANY_BATCH_SIZE) {
    await prisma.customerSalesSnapshot.createMany({
      data: rows.slice(index, index + CREATE_MANY_BATCH_SIZE),
    });
  }
}

function getRef(record: Record<string, unknown>, key: string): { id: string; name: string } {
  const ref = asRecord(record[key]);
  return {
    id: asString(ref.ListID),
    name: asString(ref.FullName),
  };
}

function getSku(itemName: string): string | null {
  const trimmed = itemName.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || parts[0] || trimmed;
}

function looksLikeCode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Z0-9\-_.\/: ]+$/i.test(trimmed) && /\d/.test(trimmed);
}

function chooseDisplayName(item: Record<string, unknown>): string {
  const salesOrPurchase = getNestedRecord(item, 'SalesOrPurchase');
  const salesAndPurchase = getNestedRecord(item, 'SalesAndPurchase');
  const description = firstString(
    item.SalesDesc,
    item.PurchaseDesc,
    item.Description,
    salesAndPurchase.SalesDesc,
    salesAndPurchase.PurchaseDesc,
    salesOrPurchase.Desc,
  );
  const fullName = firstString(item.FullName, item.Name);
  if (description && (!looksLikeCode(description) || looksLikeCode(fullName))) return description;
  return description || fullName || 'Unknown Item';
}

function buildItemMaster(records: Array<Record<string, unknown>>): Map<string, ItemMaster> {
  const byKey = new Map<string, ItemMaster>();
  for (const item of records) {
    const salesOrPurchase = getNestedRecord(item, 'SalesOrPurchase');
    const salesAndPurchase = getNestedRecord(item, 'SalesAndPurchase');
    const itemId = asString(item.ListID);
    const fullName = firstString(item.FullName, item.Name);
    const name = asString(item.Name) || getSku(fullName) || fullName;
    const sku = name || getSku(fullName);
    const avgCost = toNumber(
      item.AverageCost ||
        item.PurchaseCost ||
        salesAndPurchase.PurchaseCost ||
        salesOrPurchase.Price ||
        salesAndPurchase.SalesPrice,
    );
    const master: ItemMaster = {
      itemId,
      fullName,
      name,
      displayName: chooseDisplayName(item),
      sku: sku || null,
      avgCost,
    };
    for (const key of [itemId, fullName, name, sku].filter(Boolean)) {
      byKey.set(String(key), master);
    }
  }
  return byKey;
}

function resolveItemMaster(itemsByKey: Map<string, ItemMaster>, itemId: string, itemName: string): ItemMaster | null {
  return itemsByKey.get(itemId) || itemsByKey.get(itemName) || itemsByKey.get(getSku(itemName) || '') || null;
}

async function loadInvoiceDetailPages(
  companyId: string,
  includeNonDetailInvoicePages = false,
): Promise<DetailPageRow[]> {
  if (includeNonDetailInvoicePages) {
    return prisma.$queryRaw<DetailPageRow[]>`
      SELECT "payload", "createdAt"
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
        AND "requestName" = 'InvoiceQuery'
      ORDER BY "createdAt" ASC, "jobId", "pageNumber" ASC
    `;
  }
  return prisma.$queryRaw<DetailPageRow[]>`
    SELECT "payload", "createdAt"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${companyId}
      AND "requestName" = 'InvoiceQuery'
      AND "jobId" LIKE '%:detail:%'
    ORDER BY "jobId", "pageNumber" ASC
  `;
}

function extractInvoiceRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.map(asRecord);
  const nested = asArray(asRecord(payload).InvoiceRet);
  return nested.length ? nested : [];
}

function invoiceIdentity(invoice: Record<string, unknown>): string {
  return asString(invoice.TxnID) || asString(invoice.RefNumber);
}

function uniqueInvoices(rows: DetailPageRow[]): Array<Record<string, unknown>> {
  const byId = new Map<string, { invoice: Record<string, unknown>; lines: number; createdAt: number }>();
  for (const row of rows) {
    const createdAt = row.createdAt instanceof Date ? row.createdAt.getTime() : 0;
    for (const invoice of extractInvoiceRecords(row.payload)) {
      const id = invoiceIdentity(invoice);
      if (!id) continue;
      const lines = asArray(invoice.InvoiceLineRet).length;
      const current = byId.get(id);
      if (!current || lines > current.lines || (lines === current.lines && createdAt >= current.createdAt)) {
        byId.set(id, { invoice, lines, createdAt });
      }
    }
  }
  return Array.from(byId.values()).map((row) => row.invoice);
}

function normalizeMonthKeys(months: string[] | undefined): Set<string> | null {
  if (!months?.length) return null;
  const keys = months
    .map((month) => {
      const raw = String(month || '').trim();
      return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
    })
    .filter(Boolean);
  return keys.length ? new Set(keys) : null;
}

async function loadItemPages(companyId: string): Promise<DetailPageRow[]> {
  return prisma.$queryRaw<DetailPageRow[]>`
    SELECT "payload"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${companyId}
      AND "requestName" = 'ItemQuery'
    ORDER BY "jobId", "pageNumber" ASC
  `;
}

export async function transformQuickBooksDesktopInvoiceDetail(
  companyId: string,
  options: QbdDetailTransformOptions = {},
): Promise<QbdDetailTransformResult> {
  const errors: string[] = [];
  const monthFilter = normalizeMonthKeys(options.months);
  const writeDaily = !options.frequencies || options.frequencies.includes('daily');
  const writeMonthly = !options.frequencies || options.frequencies.includes('monthly');
  const [rows, itemRows] = await Promise.all([
    loadInvoiceDetailPages(companyId, Boolean(options.includeNonDetailInvoicePages)),
    loadItemPages(companyId),
  ]);
  const itemRecords = itemRows.flatMap((row) => (Array.isArray(row.payload) ? row.payload.map(asRecord) : []));
  const itemsByKey = buildItemMaster(itemRecords);
  const invoices = uniqueInvoices(rows);
  const productDailyByKey = new Map<string, ProductAggregate>();
  const productMonthlyByKey = new Map<string, ProductAggregate>();
  const customerDailyByKey = new Map<string, CustomerAggregate>();
  const customerMonthlyByKey = new Map<string, CustomerAggregate>();
  const months = new Map<string, Date>();
  const days = new Map<string, Date>();
  let invoiceRecordsRead = 0;
  let invoiceLinesRead = 0;

  const addProduct = (
    target: Map<string, ProductAggregate>,
    frequency: 'daily' | 'monthly',
    snapshotDate: Date,
    itemId: string,
    itemName: string,
    sku: string | null,
    quantity: number,
    amount: number,
    avgCost: number,
  ) => {
    const keyPrefix = frequency === 'daily' ? dayKey(snapshotDate) : monthKey(snapshotDate);
    const key = `${keyPrefix}:${itemId || sku || itemName}`;
    const current = target.get(key) || {
      snapshotDate,
      frequency,
      itemId: itemId || null,
      itemName: itemName || 'Unknown Item',
      sku,
      quantitySold: 0,
      revenue: 0,
      cogs: 0,
    };
    current.quantitySold += quantity;
    current.revenue += amount;
    current.cogs += avgCost > 0 && quantity > 0 ? avgCost * quantity : 0;
    target.set(key, current);
  };

  const addCustomerRevenue = (
    target: Map<string, CustomerAggregate>,
    frequency: 'daily' | 'monthly',
    snapshotDate: Date,
    customerId: string,
    customerName: string,
    invoiceId: string,
    amount: number,
  ) => {
    const keyPrefix = frequency === 'daily' ? dayKey(snapshotDate) : monthKey(snapshotDate);
    const key = `${keyPrefix}:${customerId || customerName}`;
    const current = target.get(key) || {
      snapshotDate,
      frequency,
      customerId: customerId || null,
      customerName: customerName || 'Unknown Customer',
      revenue: 0,
      invoiceIds: new Set<string>(),
    };
    current.revenue += amount;
    if (invoiceId) current.invoiceIds.add(invoiceId);
    target.set(key, current);
  };

  for (const invoice of invoices) {
      invoiceRecordsRead += 1;
      const dailyDate = startOfUtcDay(invoice.TxnDate);
      const monthlyDate = startOfUtcMonth(invoice.TxnDate);
      if (!dailyDate || !monthlyDate) continue;
      if (monthFilter && !monthFilter.has(monthKey(monthlyDate))) continue;
      if (writeDaily) days.set(dayKey(dailyDate), dailyDate);
      if (writeMonthly) months.set(monthKey(monthlyDate), monthlyDate);
      const customer = getRef(invoice, 'CustomerRef');
      const customerName = customer.name || asString(invoice.FullName) || 'Unknown Customer';
      const invoiceId = asString(invoice.TxnID) || asString(invoice.RefNumber);
      let invoiceRevenue = 0;

      for (const line of asArray(invoice.InvoiceLineRet)) {
        const item = getRef(line, 'ItemRef');
        const amount = toNumber(line.Amount);
        const quantity = toNumber(line.Quantity);
        const itemRefName = item.name || asString(line.FullName);
        const lineDescription = asString(line.Desc);
        const lineItemName = itemRefName || lineDescription;
        const master = resolveItemMaster(itemsByKey, item.id, lineItemName);
        const itemName =
          master?.displayName ||
          (lineDescription && (!looksLikeCode(lineDescription) || looksLikeCode(itemRefName)) ? lineDescription : '') ||
          lineItemName;
        const sku = master?.sku || getSku(itemRefName || lineItemName);
        const avgCost = Number(master?.avgCost || 0);

        // QBD can return blank separator/subtotal/memo lines. They are not product sales rows.
        if (!item.id && !lineItemName) continue;
        if (amount === 0 && quantity === 0) continue;

        invoiceLinesRead += 1;
        if (writeDaily) {
          addProduct(productDailyByKey, 'daily', dailyDate, item.id, itemName, sku, quantity, amount, avgCost);
        }
        if (writeMonthly) {
          addProduct(productMonthlyByKey, 'monthly', monthlyDate, item.id, itemName, sku, quantity, amount, avgCost);
        }
        invoiceRevenue += amount;
      }
      if (invoiceRevenue !== 0) {
        if (writeDaily) {
          addCustomerRevenue(customerDailyByKey, 'daily', dailyDate, customer.id, customerName, invoiceId, invoiceRevenue);
        }
        if (writeMonthly) {
          addCustomerRevenue(customerMonthlyByKey, 'monthly', monthlyDate, customer.id, customerName, invoiceId, invoiceRevenue);
        }
      }
  }

  const dayDates = Array.from(days.values());
  const monthlyDates = Array.from(months.values());
  if ((writeDaily && dayDates.length === 0) || (writeMonthly && monthlyDates.length === 0 && !writeDaily)) {
    errors.push('No invoice detail dates were found in saved QBD invoice pages.');
  }

  const dailyRange = writeDaily ? getDateRange(dayDates) : null;

  if (dailyRange) {
    await prisma.productSalesSnapshot.deleteMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: dailyRange,
      },
    });
    await prisma.customerSalesSnapshot.deleteMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: dailyRange,
      },
    });
  }
  if (writeMonthly && monthlyDates.length > 0) {
    const monthlyWhere = monthFilter
      ? { in: monthlyDates }
      : getDateRange(monthlyDates);
    if (monthlyWhere) {
      await prisma.productSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'monthly',
          snapshotDate: monthlyWhere,
        },
      });
      await prisma.customerSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'monthly',
          snapshotDate: monthlyWhere,
        },
      });
    }
  }

  const productData = [...productDailyByKey.values(), ...productMonthlyByKey.values()]
    .filter((row) => row.itemName)
    .map((row): ProductSnapshotRow => {
      const cogs = row.cogs;
      const grossMargin = row.revenue - cogs;
      return {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: row.frequency,
        itemId: row.itemId,
        itemName: row.itemName,
        sku: row.sku,
        quantitySold: row.quantitySold,
        revenue: row.revenue,
        cogs,
        grossMargin,
        grossMarginPct: row.revenue > 0 ? (grossMargin / row.revenue) * 100 : null,
      };
    });

  if (productData.length > 0) {
    await createProductRowsInBatches(productData);
  }

  const customerData = [...customerDailyByKey.values(), ...customerMonthlyByKey.values()]
    .filter((row) => row.customerName)
    .map((row): CustomerSnapshotRow => {
      const invoiceCount = Math.max(1, row.invoiceIds.size);
      return {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: row.frequency,
        customerId: row.customerId,
        customerName: row.customerName,
        revenue: row.revenue,
        invoiceCount,
        avgInvoiceSize: row.revenue / invoiceCount,
      };
    });

  if (customerData.length > 0) {
    await createCustomerRowsInBatches(customerData);
  }

  await prisma.apiSyncLog.create({
    data: {
      companyId,
      platform: 'QUICKBOOKS',
      syncType: 'qbd_invoice_line_detail_transform',
      status: errors.length === 0 ? 'success' : 'error',
      recordsImported: productDailyByKey.size + productMonthlyByKey.size,
      errorCount: errors.length,
      errorDetails: {
        errors,
        invoiceRecordsRead,
        invoiceLinesRead,
        dailyProductRowsCreated: productDailyByKey.size,
        dailyCustomerRowsCreated: customerDailyByKey.size,
        monthlyProductRowsCreated: productMonthlyByKey.size,
        monthlyCustomerRowsCreated: customerMonthlyByKey.size,
        monthsProcessed: Array.from(months.keys()).sort(),
        includeNonDetailInvoicePages: Boolean(options.includeNonDetailInvoicePages),
        frequencies: options.frequencies || ['daily', 'monthly'],
      },
    },
  });

  return {
    success: errors.length === 0,
    invoiceRecordsRead,
    invoiceLinesRead,
    productRowsCreated: productDailyByKey.size + productMonthlyByKey.size,
    customerRowsCreated: customerDailyByKey.size + customerMonthlyByKey.size,
    dailyProductRowsCreated: productDailyByKey.size,
    dailyCustomerRowsCreated: customerDailyByKey.size,
    monthlyProductRowsCreated: productMonthlyByKey.size,
    monthlyCustomerRowsCreated: customerMonthlyByKey.size,
    monthsProcessed: Array.from(months.keys()).sort(),
    errors,
  };
}

export function scheduleQuickBooksDesktopInvoiceDetailTransform(
  companyId: string,
  options: QbdDetailTransformOptions = {},
): void {
  setTimeout(() => {
    transformQuickBooksDesktopInvoiceDetail(companyId, options).catch((error) => {
      console.warn('QBD invoice detail transform failed:', {
        companyId,
        months: options.months || [],
        error: String(error?.message || error).slice(0, 500),
      });
    });
  }, 0);
}
