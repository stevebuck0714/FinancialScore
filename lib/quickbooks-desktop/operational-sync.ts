// @ts-nocheck
import prisma from '@/lib/prisma';

type Frequency = 'daily' | 'weekly' | 'monthly';

type CashRow = {
  accountId?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  cashBalance?: number | string | null;
};

type ARAgingRow = {
  totalAR?: number | string | null;
  current?: number | string | null;
  days1to30?: number | string | null;
  days31to60?: number | string | null;
  days61to90?: number | string | null;
  days90plus?: number | string | null;
};

type APAgingRow = {
  totalAP?: number | string | null;
  current?: number | string | null;
  days1to30?: number | string | null;
  days31to60?: number | string | null;
  days61to90?: number | string | null;
  days90plus?: number | string | null;
};

type CustomerSalesRow = {
  customerId?: string | null;
  customerName?: string | null;
  revenue?: number | string | null;
  invoiceCount?: number | string | null;
  avgInvoiceSize?: number | string | null;
};

type ProductSalesRow = {
  itemId?: string | null;
  itemName?: string | null;
  sku?: string | null;
  quantitySold?: number | string | null;
  revenue?: number | string | null;
  cogs?: number | string | null;
  grossMargin?: number | string | null;
  grossMarginPct?: number | string | null;
};

type InventoryRow = {
  itemId?: string | null;
  itemName?: string | null;
  sku?: string | null;
  qtyOnHand?: number | string | null;
  assetValue?: number | string | null;
  avgCost?: number | string | null;
};

type AROpenInvoiceRow = {
  customerId?: string | null;
  customerName?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | Date | null;
  dueDate?: string | Date | null;
  status?: string | null;
  currencyCode?: string | null;
  amountCurrency?: number | string | null;
  amountHome?: number | string | null;
  amountDueHome?: number | string | null;
  sourceTransaction?: string | null;
};

type ARPaymentRow = {
  paymentDate?: string | Date | null;
  customerId?: string | null;
  customerName?: string | null;
  invoiceNo?: string | null;
  currencyCode?: string | null;
  paidAmountCurrency?: number | string | null;
  paidAmountHome?: number | string | null;
  sourceTransaction?: string | null;
};

type APOpenBillRow = {
  vendorId?: string | null;
  vendorName?: string | null;
  billNo?: string | null;
  billDate?: string | Date | null;
  dueDate?: string | Date | null;
  status?: string | null;
  currencyCode?: string | null;
  amountCurrency?: number | string | null;
  amountHome?: number | string | null;
  amountDueHome?: number | string | null;
  sourceTransaction?: string | null;
};

type APPaymentRow = {
  paymentDate?: string | Date | null;
  vendorId?: string | null;
  vendorName?: string | null;
  billNo?: string | null;
  currencyCode?: string | null;
  paidAmountCurrency?: number | string | null;
  paidAmountHome?: number | string | null;
  sourceTransaction?: string | null;
  sourceItemId?: string | null;
};

export type QbDesktopOperationalPayload = {
  asOfDate?: string | null;
  cash?: CashRow[];
  arAging?: ARAgingRow | ARAgingRow[] | null;
  apAging?: APAgingRow | APAgingRow[] | null;
  customerSales?: CustomerSalesRow[];
  productSales?: ProductSalesRow[];
  inventory?: InventoryRow[];
  arOpenInvoices?: AROpenInvoiceRow[];
  arPayments?: ARPaymentRow[];
  apOpenBills?: APOpenBillRow[];
  apPayments?: APPaymentRow[];
};

export type QbDesktopSyncResult = {
  success: boolean;
  recordsCreated: number;
  errors: string[];
};

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeDate(value: unknown): Date {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function normalizeOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function bucketOpenAmount(amount: number, snapshotDate: Date, dueDate: Date | null, fallbackDate: Date | null) {
  const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  const basisDate = dueDate || fallbackDate;
  if (!basisDate) {
    buckets.days90plus = amount;
    return buckets;
  }
  const ageDays = Math.floor((snapshotDate.getTime() - basisDate.getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays < 0) buckets.current = amount;
  else if (ageDays <= 30) buckets.days1to30 = amount;
  else if (ageDays <= 60) buckets.days31to60 = amount;
  else if (ageDays <= 90) buckets.days61to90 = amount;
  else buckets.days90plus = amount;
  return buckets;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function pruneCompanyOperationalData(companyId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);

  await Promise.all([
    prisma.cashSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aRAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aPAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.customerSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.productSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.inventorySnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
  ]);
}

async function saveCash(companyId: string, snapshotDate: Date, frequency: Frequency, rows: CashRow[]): Promise<number> {
  await prisma.cashSnapshot.deleteMany({ where: { companyId, snapshotDate, frequency } });
  const data = rows
    .map((row, index) => {
      const accountName = asString(row.accountName) || `Cash Account ${index + 1}`;
      return {
        companyId,
        snapshotDate,
        frequency,
        accountId: asString(row.accountId),
        accountName,
        accountNumber: asString(row.accountNumber),
        cashBalance: toNumber(row.cashBalance),
        changeAmount: null as number | null,
        changePercent: null as number | null,
      };
    })
    .filter((row) => row.accountName);

  if (data.length === 0) return 0;
  await prisma.cashSnapshot.createMany({ data });
  return data.length;
}

async function saveARAging(companyId: string, snapshotDate: Date, frequency: Frequency, rows: ARAgingRow[]): Promise<number> {
  const total = rows.reduce(
    (acc, row) => ({
      totalAR: acc.totalAR + toNumber(row.totalAR),
      current: acc.current + toNumber(row.current),
      days1to30: acc.days1to30 + toNumber(row.days1to30),
      days31to60: acc.days31to60 + toNumber(row.days31to60),
      days61to90: acc.days61to90 + toNumber(row.days61to90),
      days90plus: acc.days90plus + toNumber(row.days90plus),
    }),
    { totalAR: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
  );

  if (total.totalAR === 0 && total.current === 0 && total.days1to30 === 0 && total.days31to60 === 0 && total.days61to90 === 0 && total.days90plus === 0) {
    return 0;
  }

  await prisma.aRAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: total,
    create: { companyId, snapshotDate, frequency, ...total },
  });
  return 1;
}

async function saveAPAging(companyId: string, snapshotDate: Date, frequency: Frequency, rows: APAgingRow[]): Promise<number> {
  const total = rows.reduce(
    (acc, row) => ({
      totalAP: acc.totalAP + toNumber(row.totalAP),
      current: acc.current + toNumber(row.current),
      days1to30: acc.days1to30 + toNumber(row.days1to30),
      days31to60: acc.days31to60 + toNumber(row.days31to60),
      days61to90: acc.days61to90 + toNumber(row.days61to90),
      days90plus: acc.days90plus + toNumber(row.days90plus),
    }),
    { totalAP: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
  );

  if (total.totalAP === 0 && total.current === 0 && total.days1to30 === 0 && total.days31to60 === 0 && total.days61to90 === 0 && total.days90plus === 0) {
    return 0;
  }

  await prisma.aPAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: total,
    create: { companyId, snapshotDate, frequency, ...total },
  });
  return 1;
}

async function saveCustomerSales(
  companyId: string,
  snapshotDate: Date,
  frequency: Frequency,
  rows: CustomerSalesRow[]
): Promise<number> {
  await prisma.customerSalesSnapshot.deleteMany({ where: { companyId, snapshotDate, frequency } });
  const data = rows
    .map((row) => {
      const revenue = toNumber(row.revenue);
      const invoiceCount = Math.max(0, Math.round(toNumber(row.invoiceCount)));
      const avgInvoiceSize = toNumber(row.avgInvoiceSize);
      return {
        companyId,
        snapshotDate,
        frequency,
        customerId: asString(row.customerId),
        customerName: asString(row.customerName) || 'Unknown Customer',
        revenue,
        invoiceCount,
        avgInvoiceSize: avgInvoiceSize > 0 ? avgInvoiceSize : invoiceCount > 0 ? revenue / invoiceCount : null,
      };
    })
    .filter((row) => row.customerName);

  if (data.length === 0) return 0;
  await prisma.customerSalesSnapshot.createMany({ data });
  return data.length;
}

async function saveProductSales(
  companyId: string,
  snapshotDate: Date,
  frequency: Frequency,
  rows: ProductSalesRow[]
): Promise<number> {
  await prisma.productSalesSnapshot.deleteMany({ where: { companyId, snapshotDate, frequency } });
  const data = rows
    .map((row) => {
      const revenue = toNumber(row.revenue);
      const cogs = toNumber(row.cogs);
      const grossMargin = toNumber(row.grossMargin) || revenue - cogs;
      const grossMarginPct = toNumber(row.grossMarginPct);
      return {
        companyId,
        snapshotDate,
        frequency,
        itemId: asString(row.itemId),
        itemName: asString(row.itemName) || 'Unknown Item',
        sku: asString(row.sku),
        quantitySold: toNumber(row.quantitySold),
        revenue,
        cogs,
        grossMargin,
        grossMarginPct: grossMarginPct !== 0 ? grossMarginPct : revenue > 0 ? (grossMargin / revenue) * 100 : null,
      };
    })
    .filter((row) => row.itemName);

  if (data.length === 0) return 0;
  await prisma.productSalesSnapshot.createMany({ data });
  return data.length;
}

async function saveInventory(companyId: string, snapshotDate: Date, frequency: Frequency, rows: InventoryRow[]): Promise<number> {
  await prisma.inventorySnapshot.deleteMany({ where: { companyId, snapshotDate, frequency } });
  const data = rows
    .map((row) => {
      const qtyOnHand = toNumber(row.qtyOnHand);
      const avgCost = toNumber(row.avgCost);
      const assetValue = toNumber(row.assetValue) || qtyOnHand * avgCost;
      return {
        companyId,
        snapshotDate,
        frequency,
        itemId: asString(row.itemId),
        itemName: asString(row.itemName) || 'Unknown Item',
        sku: asString(row.sku),
        qtyOnHand,
        assetValue,
        avgCost: avgCost || null,
      };
    })
    .filter((row) => row.itemName);

  if (data.length === 0) return 0;
  await prisma.inventorySnapshot.createMany({ data });
  return data.length;
}

async function saveAROpenInvoices(companyId: string, snapshotDate: Date, frequency: Frequency, rows: AROpenInvoiceRow[]): Promise<number> {
  await prisma.aROpenInvoiceSnapshot.deleteMany({
    where: { companyId, snapshotDate, frequency, sourcePlatform: 'QUICKBOOKS_DESKTOP' },
  });
  const data = rows
    .map((row, index) => {
      const invoiceDate = normalizeOptionalDate(row.invoiceDate);
      const dueDate = normalizeOptionalDate(row.dueDate);
      const amountDueHome = toNumber(row.amountDueHome);
      const buckets = bucketOpenAmount(amountDueHome, snapshotDate, dueDate, invoiceDate);
      return {
        companyId,
        snapshotDate,
        frequency,
        customerId: asString(row.customerId),
        customerName: asString(row.customerName) || 'Unknown Customer',
        invoiceNo: asString(row.invoiceNo) || `QBD-INVOICE-${index + 1}`,
        invoiceDate,
        dueDate,
        status: asString(row.status) || 'OPEN',
        currencyCode: asString(row.currencyCode) || 'USD',
        amountCurrency: toNumber(row.amountCurrency) || toNumber(row.amountHome) || amountDueHome,
        amountHome: toNumber(row.amountHome) || toNumber(row.amountCurrency) || amountDueHome,
        amountDueHome,
        ...buckets,
        sourcePlatform: 'QUICKBOOKS_DESKTOP',
        sourceProgram: 'InvoiceQuery',
        sourceTransaction: asString(row.sourceTransaction),
      };
    })
    .filter((row) => row.amountDueHome > 0);

  if (data.length === 0) return 0;
  await prisma.aROpenInvoiceSnapshot.createMany({ data, skipDuplicates: true });
  return data.length;
}

async function saveAPOpenBills(companyId: string, snapshotDate: Date, frequency: Frequency, rows: APOpenBillRow[]): Promise<number> {
  await prisma.aPOpenBillSnapshot.deleteMany({
    where: { companyId, snapshotDate, frequency, sourcePlatform: 'QUICKBOOKS_DESKTOP' },
  });
  const data = rows
    .map((row, index) => {
      const billDate = normalizeOptionalDate(row.billDate);
      const dueDate = normalizeOptionalDate(row.dueDate);
      const amountDueHome = toNumber(row.amountDueHome);
      const buckets = bucketOpenAmount(amountDueHome, snapshotDate, dueDate, billDate);
      return {
        companyId,
        snapshotDate,
        frequency,
        vendorId: asString(row.vendorId),
        vendorName: asString(row.vendorName) || 'Unknown Vendor',
        billNo: asString(row.billNo) || `QBD-BILL-${index + 1}`,
        billDate,
        dueDate,
        status: asString(row.status) || 'OPEN',
        currencyCode: asString(row.currencyCode) || 'USD',
        amountCurrency: toNumber(row.amountCurrency) || toNumber(row.amountHome) || amountDueHome,
        amountHome: toNumber(row.amountHome) || toNumber(row.amountCurrency) || amountDueHome,
        amountDueHome,
        ...buckets,
        sourcePlatform: 'QUICKBOOKS_DESKTOP',
        sourceProgram: 'BillQuery',
        sourceTransaction: asString(row.sourceTransaction),
      };
    })
    .filter((row) => row.amountDueHome > 0);

  if (data.length === 0) return 0;
  await prisma.aPOpenBillSnapshot.createMany({ data, skipDuplicates: true });
  return data.length;
}

async function saveARPayments(companyId: string, rows: ARPaymentRow[]): Promise<number> {
  const data = rows
    .map((row) => {
      const paymentDate = normalizeOptionalDate(row.paymentDate);
      return paymentDate
        ? {
            companyId,
            paymentDate,
            customerId: asString(row.customerId),
            customerName: asString(row.customerName) || 'Unknown Customer',
            invoiceNo: asString(row.invoiceNo),
            currencyCode: asString(row.currencyCode) || 'USD',
            paidAmountCurrency: toNumber(row.paidAmountCurrency) || toNumber(row.paidAmountHome),
            paidAmountHome: toNumber(row.paidAmountHome) || toNumber(row.paidAmountCurrency),
            sourcePlatform: 'QUICKBOOKS_DESKTOP',
            sourceProgram: 'ReceivePaymentQuery',
            sourceTransaction: asString(row.sourceTransaction),
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row && row.paidAmountHome !== 0));

  if (data.length === 0) return 0;
  const dates = data.map((row) => row.paymentDate.getTime());
  await prisma.aRPaymentFact.deleteMany({
    where: {
      companyId,
      sourcePlatform: 'QUICKBOOKS_DESKTOP',
      paymentDate: {
        gte: new Date(Math.min(...dates)),
        lte: new Date(Math.max(...dates)),
      },
    },
  });
  await prisma.aRPaymentFact.createMany({ data });
  return data.length;
}

async function saveAPPayments(companyId: string, rows: APPaymentRow[]): Promise<number> {
  const data = rows
    .map((row, index) => {
      const paymentDate = normalizeOptionalDate(row.paymentDate);
      const paidAmountHome = toNumber(row.paidAmountHome) || toNumber(row.paidAmountCurrency);
      const vendorName = asString(row.vendorName) || 'Unknown Vendor';
      const billNo = asString(row.billNo);
      const sourceTransaction = asString(row.sourceTransaction);
      return paymentDate
        ? {
            companyId,
            paymentDate,
            vendorId: asString(row.vendorId),
            vendorName,
            billNo,
            currencyCode: asString(row.currencyCode) || 'USD',
            paidAmountCurrency: toNumber(row.paidAmountCurrency) || paidAmountHome,
            paidAmountHome,
            sourcePlatform: 'QUICKBOOKS_DESKTOP',
            sourceItemId: asString(row.sourceItemId) || `qbd|${sourceTransaction || index}|${paymentDate.toISOString()}|${vendorName}|${billNo || ''}|${paidAmountHome}`,
            sourceProgram: 'BillPaymentQuery',
            sourceTransaction,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row && row.paidAmountHome !== 0));

  if (data.length === 0) return 0;
  const dates = data.map((row) => row.paymentDate.getTime());
  await prisma.aPPaymentFact.deleteMany({
    where: {
      companyId,
      sourcePlatform: 'QUICKBOOKS_DESKTOP',
      paymentDate: {
        gte: new Date(Math.min(...dates)),
        lte: new Date(Math.max(...dates)),
      },
    },
  });
  await prisma.aPPaymentFact.createMany({ data, skipDuplicates: true });
  return data.length;
}

export async function syncQuickBooksDesktopOperationalPayload(
  companyId: string,
  frequency: Frequency,
  payload: QbDesktopOperationalPayload
): Promise<QbDesktopSyncResult> {
  const errors: string[] = [];
  let recordsCreated = 0;
  const snapshotDate = normalizeDate(payload.asOfDate);

  try {
    recordsCreated += await saveCash(companyId, snapshotDate, frequency, Array.isArray(payload.cash) ? payload.cash : []);
  } catch (error) {
    errors.push(`cash: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveARAging(companyId, snapshotDate, frequency, toArray(payload.arAging));
  } catch (error) {
    errors.push(`arAging: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveAPAging(companyId, snapshotDate, frequency, toArray(payload.apAging));
  } catch (error) {
    errors.push(`apAging: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveCustomerSales(
      companyId,
      snapshotDate,
      frequency,
      Array.isArray(payload.customerSales) ? payload.customerSales : []
    );
  } catch (error) {
    errors.push(`customerSales: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveProductSales(
      companyId,
      snapshotDate,
      frequency,
      Array.isArray(payload.productSales) ? payload.productSales : []
    );
  } catch (error) {
    errors.push(`productSales: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveInventory(
      companyId,
      snapshotDate,
      frequency,
      Array.isArray(payload.inventory) ? payload.inventory : []
    );
  } catch (error) {
    errors.push(`inventory: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveAROpenInvoices(companyId, snapshotDate, frequency, Array.isArray(payload.arOpenInvoices) ? payload.arOpenInvoices : []);
  } catch (error) {
    errors.push(`arOpenInvoices: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveAPOpenBills(companyId, snapshotDate, frequency, Array.isArray(payload.apOpenBills) ? payload.apOpenBills : []);
  } catch (error) {
    errors.push(`apOpenBills: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveARPayments(companyId, Array.isArray(payload.arPayments) ? payload.arPayments : []);
  } catch (error) {
    errors.push(`arPayments: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    recordsCreated += await saveAPPayments(companyId, Array.isArray(payload.apPayments) ? payload.apPayments : []);
  } catch (error) {
    errors.push(`apPayments: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }

  await pruneCompanyOperationalData(companyId);

  await prisma.apiSyncLog.create({
    data: {
      companyId,
      platform: 'QUICKBOOKS',
      syncType: 'operational_qb_desktop_payload',
      status: errors.length === 0 ? 'success' : 'error',
      recordsImported: recordsCreated,
      errorCount: errors.length,
      errorDetails: {
        errors,
        asOfDate: payload.asOfDate || null,
      },
    },
  });

  return {
    success: errors.length === 0,
    recordsCreated,
    errors,
  };
}
