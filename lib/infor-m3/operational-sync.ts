import prisma from '@/lib/prisma';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';

type InforProgramRow = {
  module: string;
  miProgram: string;
  transactions: string[];
  cono: string;
  divi: string;
  enabled: boolean;
};

type InforOperationalSyncResult = {
  success: boolean;
  recordsCreated: number;
  errors: string[];
};

function normalizeTransactions(row: any): string[] {
  const fromArray = Array.isArray(row?.transactions)
    ? row.transactions
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];
  if (fromArray.length > 0) return Array.from(new Set(fromArray));
  const legacy = typeof row?.transaction === 'string' ? row.transaction.trim() : '';
  return legacy ? [legacy] : [];
}

function parsePrograms(value: unknown): InforProgramRow[] {
  if (!Array.isArray(value)) return [];
  const rows: InforProgramRow[] = [];
  for (const row of value) {
    const module = typeof row?.module === 'string' ? row.module.trim() : '';
    const miProgram = typeof row?.miProgram === 'string' ? row.miProgram.trim() : '';
    const transactions = normalizeTransactions(row);
    const cono = typeof row?.cono === 'string' ? row.cono.trim() : '';
    const divi = typeof row?.divi === 'string' ? row.divi.trim() : '';
    const enabled = typeof row?.enabled === 'boolean' ? row.enabled : true;
    if (!module || !miProgram || !cono || !divi || transactions.length === 0 || !enabled) continue;
    rows.push({ module, miProgram, transactions, cono, divi, enabled });
  }
  return rows;
}

function extractRecords(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const data = body as Record<string, unknown>;
  if (Array.isArray(data.results)) return data.results as Record<string, unknown>[];
  if (Array.isArray(data.records)) return data.records as Record<string, unknown>[];
  if (Array.isArray(data.items)) return data.items as Record<string, unknown>[];
  if (Array.isArray(data.MIRecord)) return data.MIRecord as Record<string, unknown>[];
  return [];
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const v = value.trim();
    return v.length > 0 ? v : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (key in record) {
      const value = toNumber(record[key]);
      if (value !== 0) return value;
    }
  }
  return 0;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (key in record) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return null;
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

async function saveCash(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.cashSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });
  const rows = records
    .map((record, idx) => {
      const accountName =
        pickString(record, ['accountName', 'bankAccount', 'name', 'ACNM', 'bankName']) ||
        `Cash Account ${idx + 1}`;
      const accountId = pickString(record, ['accountId', 'accountNumber', 'ACID', 'bankId']);
      const balance = pickNumber(record, ['balance', 'cashBalance', 'amount', 'BALA', 'BAL']);
      return {
        companyId,
        snapshotDate,
        frequency,
        accountId,
        accountName,
        accountNumber: pickString(record, ['accountNumber', 'ACNO']),
        cashBalance: balance,
        changeAmount: null as number | null,
        changePercent: null as number | null,
      };
    })
    .filter((row) => row.accountName && Number.isFinite(row.cashBalance));

  if (rows.length === 0) return 0;
  await prisma.cashSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveARAging(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  const totals = records.reduce(
    (acc, record) => {
      acc.totalAR += pickNumber(record, ['totalAR', 'total', 'TOTAR']);
      acc.current += pickNumber(record, ['current', 'CURAR', 'currentAmount']);
      acc.days1to30 += pickNumber(record, ['days1to30', 'AR1_30', 'bucket1']);
      acc.days31to60 += pickNumber(record, ['days31to60', 'AR31_60', 'bucket2']);
      acc.days61to90 += pickNumber(record, ['days61to90', 'AR61_90', 'bucket3']);
      acc.days90plus += pickNumber(record, ['days90plus', 'AR90P', 'bucket4']);
      return acc;
    },
    { totalAR: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
  );

  if (totals.totalAR === 0) return 0;

  await prisma.aRAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: totals,
    create: {
      companyId,
      snapshotDate,
      frequency,
      ...totals,
    },
  });

  return 1;
}

async function saveAPAging(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  const totals = records.reduce(
    (acc, record) => {
      acc.totalAP += pickNumber(record, ['totalAP', 'total', 'TOTAP']);
      acc.current += pickNumber(record, ['current', 'CURAP', 'currentAmount']);
      acc.days1to30 += pickNumber(record, ['days1to30', 'AP1_30', 'bucket1']);
      acc.days31to60 += pickNumber(record, ['days31to60', 'AP31_60', 'bucket2']);
      acc.days61to90 += pickNumber(record, ['days61to90', 'AP61_90', 'bucket3']);
      acc.days90plus += pickNumber(record, ['days90plus', 'AP90P', 'bucket4']);
      return acc;
    },
    { totalAP: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
  );

  if (totals.totalAP === 0) return 0;

  await prisma.aPAgingSnapshot.upsert({
    where: { companyId_snapshotDate_frequency: { companyId, snapshotDate, frequency } },
    update: totals,
    create: {
      companyId,
      snapshotDate,
      frequency,
      ...totals,
    },
  });

  return 1;
}

async function saveCustomerSales(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.customerSalesSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });

  const rows = records
    .map((record) => {
      const customerName = pickString(record, ['customerName', 'name', 'CUNM', 'customer']) || 'Unknown Customer';
      const revenue = pickNumber(record, ['revenue', 'amount', 'salesAmount', 'NETA']);
      const invoiceCount = Math.max(0, Math.round(pickNumber(record, ['invoiceCount', 'count', 'IVNO_COUNT'])));
      return {
        companyId,
        snapshotDate,
        frequency,
        customerId: pickString(record, ['customerId', 'CUNO', 'customerNumber']),
        customerName,
        revenue,
        invoiceCount,
        avgInvoiceSize: invoiceCount > 0 ? revenue / invoiceCount : null,
      };
    })
    .filter((row) => row.customerName);

  if (rows.length === 0) return 0;
  await prisma.customerSalesSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveProductSales(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.productSalesSnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });
  const rows = records
    .map((record) => {
      const quantitySold = pickNumber(record, ['quantity', 'qty', 'QTY', 'quantitySold']);
      const revenue = pickNumber(record, ['revenue', 'amount', 'salesAmount', 'NETA']);
      const cogs = pickNumber(record, ['cogs', 'costOfGoods', 'COGS']);
      const grossMargin = revenue - cogs;
      return {
        companyId,
        snapshotDate,
        frequency,
        itemId: pickString(record, ['itemId', 'ITNO', 'sku']),
        itemName: pickString(record, ['itemName', 'name', 'ITDS']) || 'Unknown Item',
        sku: pickString(record, ['sku', 'itemCode', 'ITNO']),
        quantitySold,
        revenue,
        cogs,
        grossMargin,
        grossMarginPct: revenue > 0 ? (grossMargin / revenue) * 100 : null,
      };
    })
    .filter((row) => row.itemName);

  if (rows.length === 0) return 0;
  await prisma.productSalesSnapshot.createMany({ data: rows });
  return rows.length;
}

async function saveInventory(
  companyId: string,
  snapshotDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  records: Record<string, unknown>[]
): Promise<number> {
  await prisma.inventorySnapshot.deleteMany({ where: { companyId, frequency, snapshotDate } });
  const rows = records
    .map((record) => {
      const qtyOnHand = pickNumber(record, ['qtyOnHand', 'quantity', 'QTY', 'onHand']);
      const avgCost = pickNumber(record, ['avgCost', 'cost', 'averageCost']);
      const assetValue = pickNumber(record, ['assetValue', 'value', 'inventoryValue']) || qtyOnHand * avgCost;
      return {
        companyId,
        snapshotDate,
        frequency,
        itemId: pickString(record, ['itemId', 'ITNO', 'sku']),
        itemName: pickString(record, ['itemName', 'name', 'ITDS']) || 'Unknown Item',
        sku: pickString(record, ['sku', 'itemCode', 'ITNO']),
        qtyOnHand,
        assetValue,
        avgCost: avgCost || null,
      };
    })
    .filter((row) => row.itemName);

  if (rows.length === 0) return 0;
  await prisma.inventorySnapshot.createMany({ data: rows });
  return rows.length;
}

export async function syncInforM3OperationalData(
  companyId: string,
  frequency: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<InforOperationalSyncResult> {
  const errors: string[] = [];
  let recordsCreated = 0;
  const snapshotDate = new Date();
  snapshotDate.setHours(0, 0, 0, 0);

  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: {
      connectionMetadata: true,
    },
  });

  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
      ? (connection.connectionMetadata as Record<string, unknown>)
      : {};

  const programRows = parsePrograms(metadata.accountingPrograms).filter(
    (row) => row.module.trim().toLowerCase() !== 'accounts'
  );

  if (programRows.length === 0) {
    return {
      success: true,
      recordsCreated: 0,
      errors: [],
    };
  }

  const credentials = await getInforM3CredentialsForCompany(companyId);
  if (!credentials) {
    return {
      success: false,
      recordsCreated: 0,
      errors: ['Infor M3 credentials are not configured for this company.'],
    };
  }

  for (const row of programRows) {
    for (const transaction of row.transactions) {
      const params = new URLSearchParams({
        CONO: row.cono,
        DIVI: row.divi,
      });
      const endpointPath = `/M3/m3api-rest/execute/${row.miProgram}/${transaction}?${params.toString()}`;
      const startedAt = Date.now();
      const response = await callInforIonApi(credentials, endpointPath, { timeoutMs: 30000 });
      const moduleName = row.module.trim().toLowerCase();
      const records = extractRecords(response.body);

      let moduleRecordsCreated = 0;
      if (response.ok) {
        try {
          switch (moduleName) {
            case 'cash':
              moduleRecordsCreated = await saveCash(companyId, snapshotDate, frequency, records);
              break;
            case 'ar':
              moduleRecordsCreated = await saveARAging(companyId, snapshotDate, frequency, records);
              break;
            case 'ap':
              moduleRecordsCreated = await saveAPAging(companyId, snapshotDate, frequency, records);
              break;
            case 'customer':
              moduleRecordsCreated = await saveCustomerSales(companyId, snapshotDate, frequency, records);
              break;
            case 'sales':
              moduleRecordsCreated = await saveProductSales(companyId, snapshotDate, frequency, records);
              break;
            case 'inventory':
              moduleRecordsCreated = await saveInventory(companyId, snapshotDate, frequency, records);
              break;
            default:
              moduleRecordsCreated = records.length;
              break;
          }
        } catch (persistError) {
          const message = persistError instanceof Error ? persistError.message : 'Failed to persist records';
          errors.push(`${row.module}/${row.miProgram}/${transaction}: ${message}`);
        }
      } else {
        errors.push(`${row.module}/${row.miProgram}/${transaction}: HTTP ${response.status}`);
      }

      recordsCreated += moduleRecordsCreated;

      await prisma.apiSyncLog.create({
        data: {
          companyId,
          platform: 'INFOR_M3',
          syncType: `operational_${moduleName}_${transaction}`,
          status: response.ok ? 'success' : 'error',
          recordsImported: moduleRecordsCreated,
          errorCount: response.ok ? 0 : 1,
          duration: Date.now() - startedAt,
          errorDetails: {
            module: row.module,
            miProgram: row.miProgram,
            transaction,
            cono: row.cono,
            divi: row.divi,
            endpointPath,
            responseStatus: response.status,
            response: response.body,
          },
        },
      });
    }
  }

  await pruneCompanyOperationalData(companyId);

  return {
    success: errors.length === 0,
    recordsCreated,
    errors,
  };
}
