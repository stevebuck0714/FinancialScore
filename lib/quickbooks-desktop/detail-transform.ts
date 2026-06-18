import prisma from '@/lib/prisma';

type DetailPageRow = {
  payload: unknown;
};

type ProductAggregate = {
  snapshotDate: Date;
  frequency: 'daily' | 'monthly';
  itemId: string | null;
  itemName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
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
  return parts[0] || trimmed;
}

async function loadInvoiceDetailPages(companyId: string): Promise<DetailPageRow[]> {
  return prisma.$queryRaw<DetailPageRow[]>`
    SELECT "payload"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${companyId}
      AND "requestName" = 'InvoiceQuery'
      AND "jobId" LIKE '%:detail:%'
    ORDER BY "jobId", "pageNumber" ASC
  `;
}

export async function transformQuickBooksDesktopInvoiceDetail(companyId: string): Promise<QbdDetailTransformResult> {
  const errors: string[] = [];
  const rows = await loadInvoiceDetailPages(companyId);
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
    quantity: number,
    amount: number,
  ) => {
    const keyPrefix = frequency === 'daily' ? dayKey(snapshotDate) : monthKey(snapshotDate);
    const key = `${keyPrefix}:${itemId || itemName}`;
    const current = target.get(key) || {
      snapshotDate,
      frequency,
      itemId: itemId || null,
      itemName: itemName || 'Unknown Item',
      sku: getSku(itemName),
      quantitySold: 0,
      revenue: 0,
    };
    current.quantitySold += quantity;
    current.revenue += amount;
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

  for (const row of rows) {
    const invoices = Array.isArray(row.payload) ? row.payload.map(asRecord) : [];
    for (const invoice of invoices) {
      invoiceRecordsRead += 1;
      const dailyDate = startOfUtcDay(invoice.TxnDate);
      const monthlyDate = startOfUtcMonth(invoice.TxnDate);
      if (!dailyDate || !monthlyDate) continue;
      days.set(dayKey(dailyDate), dailyDate);
      months.set(monthKey(monthlyDate), monthlyDate);
      const customer = getRef(invoice, 'CustomerRef');
      const customerName = customer.name || asString(invoice.FullName) || 'Unknown Customer';
      const invoiceId = asString(invoice.TxnID) || asString(invoice.RefNumber);
      let invoiceRevenue = 0;

      for (const line of asArray(invoice.InvoiceLineRet)) {
        const item = getRef(line, 'ItemRef');
        const amount = toNumber(line.Amount);
        const quantity = toNumber(line.Quantity);
        const itemName = item.name || asString(line.FullName) || asString(line.Desc);

        // QBD can return blank separator/subtotal/memo lines. They are not product sales rows.
        if (!item.id && !itemName) continue;
        if (amount === 0 && quantity === 0) continue;

        invoiceLinesRead += 1;
        addProduct(productDailyByKey, 'daily', dailyDate, item.id, itemName, quantity, amount);
        addProduct(productMonthlyByKey, 'monthly', monthlyDate, item.id, itemName, quantity, amount);
        invoiceRevenue += amount;
      }
      if (invoiceRevenue !== 0) {
        addCustomerRevenue(customerDailyByKey, 'daily', dailyDate, customer.id, customerName, invoiceId, invoiceRevenue);
        addCustomerRevenue(customerMonthlyByKey, 'monthly', monthlyDate, customer.id, customerName, invoiceId, invoiceRevenue);
      }
    }
  }

  const monthDates = Array.from(months.values());
  const dayDates = Array.from(days.values());
  if (dayDates.length === 0) {
    errors.push('No invoice detail dates were found in saved QBD detail pages.');
  }

  await prisma.$transaction(async (tx) => {
    for (const snapshotDate of dayDates) {
      await tx.productSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'daily',
          snapshotDate,
        },
      });
      await tx.customerSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'daily',
          snapshotDate,
        },
      });
    }
    for (const snapshotDate of monthDates) {
      await tx.productSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'monthly',
          snapshotDate,
        },
      });
      await tx.customerSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'monthly',
          snapshotDate,
        },
      });
    }

    const productData = [...productDailyByKey.values(), ...productMonthlyByKey.values()]
      .filter((row) => row.itemName)
      .map((row) => {
        const cogs = 0;
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
      await tx.productSalesSnapshot.createMany({ data: productData });
    }

    const customerData = [...customerDailyByKey.values(), ...customerMonthlyByKey.values()]
      .filter((row) => row.customerName)
      .map((row) => {
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
      await tx.customerSalesSnapshot.createMany({ data: customerData });
    }
  });

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
