import prisma from '@/lib/prisma';

type DetailPageRow = {
  payload: unknown;
};

type ProductAggregate = {
  snapshotDate: Date;
  itemId: string | null;
  itemName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
};

export type QbdDetailTransformResult = {
  success: boolean;
  invoiceRecordsRead: number;
  invoiceLinesRead: number;
  productRowsCreated: number;
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

function startOfUtcMonth(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
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
  const productByKey = new Map<string, ProductAggregate>();
  const months = new Map<string, Date>();
  let invoiceRecordsRead = 0;
  let invoiceLinesRead = 0;

  for (const row of rows) {
    const invoices = Array.isArray(row.payload) ? row.payload.map(asRecord) : [];
    for (const invoice of invoices) {
      invoiceRecordsRead += 1;
      const snapshotDate = startOfUtcMonth(invoice.TxnDate);
      if (!snapshotDate) continue;
      months.set(monthKey(snapshotDate), snapshotDate);

      for (const line of asArray(invoice.InvoiceLineRet)) {
        const item = getRef(line, 'ItemRef');
        const amount = toNumber(line.Amount);
        const quantity = toNumber(line.Quantity);
        const itemName = item.name || asString(line.FullName) || asString(line.Desc);

        // QBD can return blank separator/subtotal/memo lines. They are not product sales rows.
        if (!item.id && !itemName) continue;
        if (amount === 0 && quantity === 0) continue;

        invoiceLinesRead += 1;
        const key = `${monthKey(snapshotDate)}:${item.id || itemName}`;
        const current = productByKey.get(key) || {
          snapshotDate,
          itemId: item.id || null,
          itemName: itemName || 'Unknown Item',
          sku: getSku(itemName),
          quantitySold: 0,
          revenue: 0,
        };
        current.quantitySold += quantity;
        current.revenue += amount;
        productByKey.set(key, current);
      }
    }
  }

  const monthDates = Array.from(months.values());
  if (monthDates.length === 0) {
    errors.push('No invoice detail months were found in saved QBD detail pages.');
  }

  await prisma.$transaction(async (tx) => {
    for (const snapshotDate of monthDates) {
      await tx.productSalesSnapshot.deleteMany({
        where: {
          companyId,
          frequency: 'monthly',
          snapshotDate,
        },
      });
    }

    const data = Array.from(productByKey.values())
      .filter((row) => row.itemName)
      .map((row) => {
        const cogs = 0;
        const grossMargin = row.revenue - cogs;
        return {
          companyId,
          snapshotDate: row.snapshotDate,
          frequency: 'monthly',
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

    if (data.length > 0) {
      await tx.productSalesSnapshot.createMany({ data });
    }
  });

  await prisma.apiSyncLog.create({
    data: {
      companyId,
      platform: 'QUICKBOOKS',
      syncType: 'qbd_invoice_line_detail_transform',
      status: errors.length === 0 ? 'success' : 'error',
      recordsImported: productByKey.size,
      errorCount: errors.length,
      errorDetails: {
        errors,
        invoiceRecordsRead,
        invoiceLinesRead,
        monthsProcessed: Array.from(months.keys()).sort(),
      },
    },
  });

  return {
    success: errors.length === 0,
    invoiceRecordsRead,
    invoiceLinesRead,
    productRowsCreated: productByKey.size,
    monthsProcessed: Array.from(months.keys()).sort(),
    errors,
  };
}
