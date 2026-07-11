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
  __qbdSourceDateRange?: Record<string, any> | null;
  __qbdInvoices?: Array<Record<string, any>>;
  __qbdBills?: Array<Record<string, any>>;
  __qbdReceivePayments?: Array<Record<string, any>>;
  __qbdBillPayments?: Array<Record<string, any>>;
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

async function saveARAging(
  companyId: string,
  snapshotDate: Date,
  frequency: Frequency,
  rows: ARAgingRow[],
  options: { clearWhenEmpty?: boolean } = {},
): Promise<number> {
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
    if (options.clearWhenEmpty) {
      await prisma.aRAgingSnapshot.deleteMany({ where: { companyId, snapshotDate, frequency } });
    }
    return 0;
  }

  await prisma.aRAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: total,
    create: { companyId, snapshotDate, frequency, ...total },
  });
  return 1;
}

async function saveAPAging(
  companyId: string,
  snapshotDate: Date,
  frequency: Frequency,
  rows: APAgingRow[],
  options: { clearWhenEmpty?: boolean } = {},
): Promise<number> {
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
    if (options.clearWhenEmpty) {
      await prisma.aPAgingSnapshot.deleteMany({ where: { companyId, snapshotDate, frequency } });
    }
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

function qbdRef(record: Record<string, unknown>, refName: string): { id: string | null; name: string | null } {
  const ref = record[refName];
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return { id: null, name: null };
  const src = ref as Record<string, unknown>;
  return { id: asString(src.ListID), name: asString(src.FullName) };
}

function qbdFirstString(record: Record<string, unknown>, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = asString(record[field]);
    if (value) return value;
  }
  return null;
}

function qbdRecordKey(record: Record<string, unknown>, fallbackPrefix: string, index: number): string {
  return qbdFirstString(record, 'TxnID', 'RefNumber', 'EditSequence') || `${fallbackPrefix}:${index}`;
}

function qbdRecordNumber(record: Record<string, unknown>, fallbackPrefix: string, index: number): string {
  return qbdFirstString(record, 'RefNumber', 'TxnID') || `${fallbackPrefix}-${index + 1}`;
}

function qbdRecordAmount(record: Record<string, unknown>, ...fields: string[]): number {
  for (const field of fields) {
    const value = toNumber(record[field]);
    if (value !== 0) return Math.abs(value);
  }
  return 0;
}

function dedupeQbdRecords(records: Array<Record<string, unknown>>, fallbackPrefix: string): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  records.forEach((record, index) => {
    const key = qbdRecordKey(record, fallbackPrefix, index);
    const current = byKey.get(key);
    const currentModified = asString(current?.TimeModified) || '';
    const nextModified = asString(record.TimeModified) || '';
    if (!current || nextModified >= currentModified) byKey.set(key, record);
  });
  return Array.from(byKey.values());
}

function businessDayKeys(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) keys.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function addAppliedAmount(
  index: Map<string, Array<{ paymentDate: Date; amount: number; sourceId: string }>>,
  keys: Array<string | null>,
  paymentDate: Date | null,
  amount: number,
  sourceId: string,
): void {
  if (!paymentDate || amount <= 0) return;
  for (const key of keys) {
    if (!key) continue;
    const rows = index.get(key) || [];
    rows.push({ paymentDate, amount, sourceId });
    index.set(key, rows);
  }
}

function buildAppliedPaymentIndex(records: Array<Record<string, unknown>>, appliedType: 'invoice' | 'bill') {
  const index = new Map<string, Array<{ paymentDate: Date; amount: number; sourceId: string }>>();
  records.forEach((payment, paymentIndex) => {
    const paymentDate = normalizeOptionalDate(payment.TxnDate);
    const paymentSourceId = asString(payment.TxnID) || asString(payment.RefNumber) || `payment:${paymentIndex}`;
    const appliedRows = Array.isArray(payment.AppliedToTxnRet) ? payment.AppliedToTxnRet : [];
    appliedRows.forEach((applied, appliedIndex) => {
      const appliedRecord = applied && typeof applied === 'object' && !Array.isArray(applied)
        ? (applied as Record<string, unknown>)
        : {};
      const txnType = String(appliedRecord.TxnType || '').toLowerCase();
      if (txnType && !txnType.includes(appliedType)) return;
      const amount = qbdRecordAmount(appliedRecord, 'AppliedAmount', 'Amount');
      addAppliedAmount(
        index,
        [asString(appliedRecord.TxnID), asString(appliedRecord.RefNumber)],
        paymentDate,
        amount,
        `${paymentSourceId}:${appliedIndex}`,
      );
    });
  });
  for (const rows of index.values()) {
    rows.sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
  }
  return index;
}

function paidThroughDate(index: Map<string, Array<{ paymentDate: Date; amount: number; sourceId: string }>>, keys: Array<string | null>, asOfDate: Date): number {
  const seen = new Set<string>();
  let total = 0;
  for (const key of keys) {
    if (!key) continue;
    const rows = index.get(key) || [];
    for (const row of rows) {
      const signature = `${row.sourceId}|${row.paymentDate.toISOString()}|${row.amount}`;
      if (seen.has(signature)) continue;
      if (row.paymentDate <= asOfDate) {
        total += row.amount;
        seen.add(signature);
      }
    }
  }
  return total;
}

function totalAppliedAmount(index: Map<string, Array<{ paymentDate: Date; amount: number; sourceId: string }>>, keys: Array<string | null>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const key of keys) {
    if (!key) continue;
    const rows = index.get(key) || [];
    for (const row of rows) {
      const signature = `${row.sourceId}|${row.paymentDate.toISOString()}|${row.amount}`;
      if (seen.has(signature)) continue;
      total += row.amount;
      seen.add(signature);
    }
  }
  return total;
}

function hasAppliedPayments(index: Map<string, Array<{ paymentDate: Date; amount: number; sourceId: string }>>, keys: Array<string | null>): boolean {
  return keys.some((key) => Boolean(key && (index.get(key)?.length || 0) > 0));
}

export async function saveQuickBooksDesktopDetailOpenSnapshots(
  companyId: string,
  frequency: Frequency,
  payload: QbDesktopOperationalPayload,
): Promise<number> {
  const range = payload.__qbdSourceDateRange || {};
  const startDate = normalizeOptionalDate(range.startDate);
  const endDate = normalizeOptionalDate(range.endDate || payload.asOfDate);
  if (!startDate || !endDate || startDate > endDate) return 0;

  const invoices = dedupeQbdRecords(Array.isArray(payload.__qbdInvoices) ? payload.__qbdInvoices : [], 'invoice');
  const bills = dedupeQbdRecords(Array.isArray(payload.__qbdBills) ? payload.__qbdBills : [], 'bill');
  const arPaymentIndex = buildAppliedPaymentIndex(Array.isArray(payload.__qbdReceivePayments) ? payload.__qbdReceivePayments : [], 'invoice');
  const apPaymentIndex = buildAppliedPaymentIndex(Array.isArray(payload.__qbdBillPayments) ? payload.__qbdBillPayments : [], 'bill');
  if (invoices.length === 0 && bills.length === 0) return 0;

  let recordsCreated = 0;
  for (const dateKey of businessDayKeys(startDate, endDate)) {
    const snapshotDate = normalizeDate(dateKey);
    const arRows: AROpenInvoiceRow[] = [];
    const apRows: APOpenBillRow[] = [];

    invoices.forEach((invoice, index) => {
      const invoiceDate = normalizeOptionalDate(invoice.TxnDate);
      if (!invoiceDate || invoiceDate > snapshotDate) return;
      const invoiceNo = qbdRecordNumber(invoice, 'QBD-INVOICE', index);
      const txnId = asString(invoice.TxnID);
      const matchKeys = [txnId, invoiceNo];
      if (String(invoice.IsPaid || '').toLowerCase() === 'true' && !hasAppliedPayments(arPaymentIndex, matchKeys)) return;
      const currentBalance = qbdRecordAmount(invoice, 'BalanceRemaining');
      const appliedTotal = totalAppliedAmount(arPaymentIndex, matchKeys);
      const reportedTotal = qbdRecordAmount(invoice, 'TotalAmount', 'Subtotal', 'Amount');
      const totalAmount = Math.max(currentBalance + appliedTotal, reportedTotal);
      if (totalAmount <= 0) return;
      const paidAmount = paidThroughDate(arPaymentIndex, matchKeys, snapshotDate);
      const remaining = Math.max(0, totalAmount - paidAmount);
      if (remaining <= 0) return;
      const customer = qbdRef(invoice, 'CustomerRef');
      arRows.push({
        customerId: customer.id || customer.name || null,
        customerName: customer.name || 'Unknown Customer',
        invoiceNo,
        invoiceDate,
        dueDate: normalizeOptionalDate(invoice.DueDate),
        status: 'OPEN',
        currencyCode: asString((invoice.CurrencyRef as any)?.FullName) || 'USD',
        amountCurrency: totalAmount,
        amountHome: totalAmount,
        amountDueHome: remaining,
        sourceTransaction: txnId || qbdRecordKey(invoice, 'invoice', index),
      });
    });

    bills.forEach((bill, index) => {
      const billDate = normalizeOptionalDate(bill.TxnDate);
      if (!billDate || billDate > snapshotDate) return;
      const billNo = qbdRecordNumber(bill, 'QBD-BILL', index);
      const txnId = asString(bill.TxnID);
      const matchKeys = [txnId, billNo];
      if (String(bill.IsPaid || '').toLowerCase() === 'true' && !hasAppliedPayments(apPaymentIndex, matchKeys)) return;
      const currentBalance = qbdRecordAmount(bill, 'AmountDue', 'OpenAmount');
      const appliedTotal = totalAppliedAmount(apPaymentIndex, matchKeys);
      const reportedTotal = qbdRecordAmount(bill, 'TotalAmount', 'Amount', 'OpenAmount', 'AmountDue');
      const totalAmount = Math.max(currentBalance + appliedTotal, reportedTotal);
      if (totalAmount <= 0) return;
      const paidAmount = paidThroughDate(apPaymentIndex, matchKeys, snapshotDate);
      const remaining = Math.max(0, totalAmount - paidAmount);
      if (remaining <= 0) return;
      const vendor = qbdRef(bill, 'VendorRef');
      apRows.push({
        vendorId: vendor.id || vendor.name || null,
        vendorName: vendor.name || 'Unknown Vendor',
        billNo,
        billDate,
        dueDate: normalizeOptionalDate(bill.DueDate),
        status: 'OPEN',
        currencyCode: asString((bill.CurrencyRef as any)?.FullName) || 'USD',
        amountCurrency: totalAmount,
        amountHome: totalAmount,
        amountDueHome: remaining,
        sourceTransaction: txnId || qbdRecordKey(bill, 'bill', index),
      });
    });

    recordsCreated += await saveAROpenInvoices(companyId, snapshotDate, frequency, arRows);
    recordsCreated += await saveAPOpenBills(companyId, snapshotDate, frequency, apRows);
    const arTotals = arRows.reduce(
      (acc, row) => {
        const amount = toNumber(row.amountDueHome);
        const buckets = bucketOpenAmount(amount, snapshotDate, normalizeOptionalDate(row.dueDate), normalizeOptionalDate(row.invoiceDate));
        return {
          totalAR: acc.totalAR + amount,
          current: acc.current + buckets.current,
          days1to30: acc.days1to30 + buckets.days1to30,
          days31to60: acc.days31to60 + buckets.days31to60,
          days61to90: acc.days61to90 + buckets.days61to90,
          days90plus: acc.days90plus + buckets.days90plus,
        };
      },
      { totalAR: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 },
    );
    const apTotals = apRows.reduce(
      (acc, row) => {
        const amount = toNumber(row.amountDueHome);
        const buckets = bucketOpenAmount(amount, snapshotDate, normalizeOptionalDate(row.dueDate), normalizeOptionalDate(row.billDate));
        return {
          totalAP: acc.totalAP + amount,
          current: acc.current + buckets.current,
          days1to30: acc.days1to30 + buckets.days1to30,
          days31to60: acc.days31to60 + buckets.days31to60,
          days61to90: acc.days61to90 + buckets.days61to90,
          days90plus: acc.days90plus + buckets.days90plus,
        };
      },
      { totalAP: 0, current: 0, days1to30: 0, days31to60: 0, days90plus: 0, days61to90: 0 },
    );
    recordsCreated += await saveARAging(companyId, snapshotDate, frequency, arTotals.totalAR > 0 ? [arTotals] : [], { clearWhenEmpty: true });
    recordsCreated += await saveAPAging(companyId, snapshotDate, frequency, apTotals.totalAP > 0 ? [apTotals] : [], { clearWhenEmpty: true });
  }

  return recordsCreated;
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
    if (payload.__qbdSourceDateRange && (payload.__qbdInvoices?.length || payload.__qbdBills?.length)) {
      recordsCreated += await saveQuickBooksDesktopDetailOpenSnapshots(companyId, frequency, payload);
    } else {
      recordsCreated += await saveAROpenInvoices(companyId, snapshotDate, frequency, Array.isArray(payload.arOpenInvoices) ? payload.arOpenInvoices : []);
    }
  } catch (error) {
    errors.push(`arOpenInvoices: ${error instanceof Error ? error.message : 'failed to persist'}`);
  }
  try {
    if (!payload.__qbdSourceDateRange || (!payload.__qbdInvoices?.length && !payload.__qbdBills?.length)) {
      recordsCreated += await saveAPOpenBills(companyId, snapshotDate, frequency, Array.isArray(payload.apOpenBills) ? payload.apOpenBills : []);
    }
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
