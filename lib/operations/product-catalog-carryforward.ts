import prisma from '@/lib/prisma';
import { isAtlanticPrecisionCompany } from '@/lib/operations/company-specific-reports';
import { emptyMonthQtyMap } from '@/lib/operations/product-revenue-forecast';
import { loadProductForecastLines } from '@/lib/operations/product-revenue-forecast-db';

type ForecastLineRow = Awaited<ReturnType<typeof loadProductForecastLines>>[number];

export type ForecastCustomerRow = {
  customerId: string;
  customerName: string;
  key: string;
  label: string;
  lineCount: number;
};

function forecastLineKey(row: {
  customerId?: string | null;
  itemSku?: string | null;
  customerPartNumber?: string | null;
}): string {
  return `${String(row.customerId || '')}||${String(row.itemSku || '')}||${String(row.customerPartNumber || '')}`;
}

export function shouldCarryProductCatalog(companyId: string): boolean {
  return isAtlanticPrecisionCompany(companyId);
}

export async function latestProductCatalogSourceYear(
  companyId: string,
  beforeYear: number
): Promise<number | null> {
  if (!shouldCarryProductCatalog(companyId)) return null;
  const rows = await prisma.productRevenueForecastLine.groupBy({
    by: ['year'],
    where: { companyId, year: { lt: beforeYear } },
    _count: { _all: true },
  });
  const ranked = rows
    .filter((row) => Number(row._count._all || 0) > 0)
    .sort((a, b) => {
      const countDiff = Number(b._count._all || 0) - Number(a._count._all || 0);
      if (countDiff !== 0) return countDiff;
      return b.year - a.year;
    });
  return ranked[0]?.year ?? null;
}

export function asCarriedForecastLine(row: ForecastLineRow, targetYear: number): ForecastLineRow {
  return {
    ...row,
    id: `tmp-carry-${targetYear}-${row.id}`,
    forecastQty: emptyMonthQtyMap(),
    adjustedQty: emptyMonthQtyMap(),
    actualQty: emptyMonthQtyMap(),
  };
}

export async function loadProductForecastLinesWithCatalog(params: {
  companyId: string;
  year: number;
  customerId?: string;
  customerName?: string;
}): Promise<ForecastLineRow[]> {
  const current = await loadProductForecastLines(params);
  const sourceYear = await latestProductCatalogSourceYear(params.companyId, params.year);
  if (!sourceYear) return current;

  const catalog = await loadProductForecastLines({
    ...params,
    year: sourceYear,
  });
  const have = new Set(current.map(forecastLineKey));
  const extras = catalog
    .filter((row) => !have.has(forecastLineKey(row)))
    .map((row) => asCarriedForecastLine(row, params.year));
  return [...current, ...extras].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.itemSku || '').localeCompare(String(b.itemSku || ''));
  });
}

function asCustomerPayload(row: {
  customerId: string;
  customerName: string;
  _count: { _all: number };
}): ForecastCustomerRow {
  return {
    customerId: row.customerId,
    customerName: row.customerName,
    key: `${row.customerId}||${row.customerName}`,
    label: row.customerName || row.customerId || 'Unknown customer',
    lineCount: Number(row._count._all || 0),
  };
}

export async function listProductForecastCustomersWithCatalog(
  companyId: string,
  year: number
): Promise<{ customers: ForecastCustomerRow[]; catalogSourceYear: number | null }> {
  const yearRows = await prisma.productRevenueForecastLine.groupBy({
    by: ['customerId', 'customerName'],
    where: { companyId, year },
    _count: { _all: true },
    orderBy: { customerName: 'asc' },
  });
  const sourceYear = await latestProductCatalogSourceYear(companyId, year);
  if (!sourceYear) {
    return { customers: yearRows.map(asCustomerPayload), catalogSourceYear: null };
  }

  const sourceRows = await prisma.productRevenueForecastLine.groupBy({
    by: ['customerId', 'customerName'],
    where: { companyId, year: sourceYear },
    _count: { _all: true },
    orderBy: { customerName: 'asc' },
  });
  const byKey = new Map<string, ForecastCustomerRow>();
  for (const row of sourceRows) {
    const next = asCustomerPayload(row);
    byKey.set(next.key, next);
  }
  for (const row of yearRows) {
    const next = asCustomerPayload(row);
    const prior = byKey.get(next.key);
    byKey.set(next.key, {
      ...prior,
      ...next,
      lineCount: Math.max(Number(prior?.lineCount || 0), next.lineCount),
    });
  }
  return {
    customers: Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label)),
    catalogSourceYear: sourceYear,
  };
}
