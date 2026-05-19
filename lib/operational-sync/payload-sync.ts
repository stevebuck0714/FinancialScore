// @ts-nocheck
import prisma from '@/lib/prisma';
import type { AccountingPlatform } from '@prisma/client';

export type Frequency = 'daily' | 'weekly' | 'monthly';

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

export type OperationalPayload = {
  asOfDate?: string | null;
  cash?: CashRow[];
  arAging?: ARAgingRow | ARAgingRow[] | null;
  apAging?: APAgingRow | APAgingRow[] | null;
  customerSales?: CustomerSalesRow[];
  productSales?: ProductSalesRow[];
  inventory?: InventoryRow[];
};

export type PayloadSyncResult = {
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

export async function syncOperationalPayloadToSnapshots(
  companyId: string,
  frequency: Frequency,
  payload: OperationalPayload,
  platform: AccountingPlatform,
  syncType: string
): Promise<PayloadSyncResult> {
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

  await pruneCompanyOperationalData(companyId);

  await prisma.apiSyncLog.create({
    data: {
      companyId,
      platform,
      syncType,
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
