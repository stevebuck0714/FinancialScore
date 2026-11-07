import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';

export type SgpPriceChangeLine = {
  itemSku: string;
  itemName: string;
  customerId: string;
  customerName: string;
  customerPartNumber: string;
  customerGroup: string;
  sgpPrice: number | null;
  contractPrice: number | null;
  priceChange: number | null;
  priceChangePct: number | null;
};

export type SgpPriceChangesDataset = {
  year: number;
  lines: SgpPriceChangeLine[];
};

function normalized(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export async function loadSgpPriceChangesDataset(params: {
  companyId: string;
  year: number;
}): Promise<SgpPriceChangesDataset> {
  const dataset = await loadRevenueDataset({ companyId: params.companyId, year: params.year, includeAllLines: true });

  // Prices are stored per customer group + item, so one row per customer, group, item, and customer P/N.
  const byKey = new Map<string, Omit<SgpPriceChangeLine, 'itemName' | 'priceChange' | 'priceChangePct'>>();
  for (const line of dataset.lines) {
    const itemSku = normalized(line.itemSku);
    if (!itemSku) continue;
    const sgpPrice = line.sgpPrice == null ? null : Number(line.sgpPrice);
    const contractPrice = line.contractPrice == null ? null : Number(line.contractPrice);
    if (sgpPrice == null && contractPrice == null) continue;
    const customerId = normalized(line.customerId);
    const customerName = normalized(line.customerName) || customerId;
    const customerPartNumber = normalized(line.customerPartNumber);
    const customerGroup = normalized(line.customerGroup);
    const key = [customerId, customerName, customerGroup, itemSku, customerPartNumber]
      .map((part) => part.toUpperCase())
      .join('||');
    if (byKey.has(key)) continue;
    byKey.set(key, { itemSku, customerId, customerName, customerPartNumber, customerGroup, sgpPrice, contractPrice });
  }

  const itemSkus = Array.from(new Set(Array.from(byKey.values()).map((line) => line.itemSku)));
  const [inventoryRows, overviewRows, dutyRows] = itemSkus.length
    ? await Promise.all([
        prisma
          .$queryRaw<Array<{ sku: string; itemName: string }>>(Prisma.sql`
            SELECT DISTINCT ON (UPPER(TRIM("sku"))) "sku", "itemName"
            FROM "InventorySnapshot"
            WHERE "companyId" = ${params.companyId}
              AND UPPER(TRIM("sku")) = ANY(${itemSkus.map((sku) => sku.toUpperCase())}::text[])
            ORDER BY UPPER(TRIM("sku")), "snapshotDate" DESC
          `)
          .catch(() => []),
        prisma.inforItemOverviewCache
          .findMany({
            where: { companyId: params.companyId, itemNumber: { in: itemSkus } },
            select: { itemNumber: true, description: true },
          })
          .catch(() => []),
        prisma.companyItemDuty
          .findMany({
            where: { companyId: params.companyId, itemSku: { in: itemSkus } },
            select: { itemSku: true, itemDescription: true },
          })
          .catch(() => []),
      ])
    : [[], [], []];
  const nameBySku = new Map<string, string>();
  const setName = (sku: unknown, description: unknown) => {
    const skuKey = normalized(sku).toUpperCase();
    const name = normalized(description);
    if (skuKey && name && name.toUpperCase() !== skuKey) nameBySku.set(skuKey, name);
  };
  for (const row of dutyRows) setName(row.itemSku, row.itemDescription);
  for (const row of overviewRows) setName(row.itemNumber, row.description);
  for (const row of inventoryRows) setName(row.sku, row.itemName);

  const lines = Array.from(byKey.values()).map((line) => {
    const priceChange =
      line.sgpPrice != null && line.contractPrice != null ? line.contractPrice - line.sgpPrice : null;
    return {
      ...line,
      itemName: nameBySku.get(line.itemSku.toUpperCase()) || '',
      priceChange,
      priceChangePct: priceChange != null && line.sgpPrice ? priceChange / line.sgpPrice : null,
    };
  });
  lines.sort(
    (a, b) =>
      a.itemSku.localeCompare(b.itemSku, undefined, { numeric: true, sensitivity: 'base' }) ||
      a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' })
  );
  return { year: dataset.year, lines };
}
