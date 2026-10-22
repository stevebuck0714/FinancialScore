import prisma from '@/lib/prisma';
import { loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';

export type SgpPriceChangeLine = {
  itemSku: string;
  itemName: string;
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

  // Prices are stored per customer group + item, so one row per group, item, and customer P/N.
  const byKey = new Map<string, Omit<SgpPriceChangeLine, 'itemName' | 'priceChange' | 'priceChangePct'>>();
  for (const line of dataset.lines) {
    const itemSku = normalized(line.itemSku);
    if (!itemSku) continue;
    const sgpPrice = line.sgpPrice == null ? null : Number(line.sgpPrice);
    const contractPrice = line.contractPrice == null ? null : Number(line.contractPrice);
    if (sgpPrice == null && contractPrice == null) continue;
    const customerPartNumber = normalized(line.customerPartNumber);
    const customerGroup = normalized(line.customerGroup);
    const key = [customerGroup, itemSku, customerPartNumber].map((part) => part.toUpperCase()).join('||');
    if (byKey.has(key)) continue;
    byKey.set(key, { itemSku, customerPartNumber, customerGroup, sgpPrice, contractPrice });
  }

  const itemSkus = Array.from(new Set(Array.from(byKey.values()).map((line) => line.itemSku)));
  const itemRows = itemSkus.length
    ? await prisma.inforItemOverviewCache
        .findMany({
          where: { companyId: params.companyId, itemNumber: { in: itemSkus } },
          select: { itemNumber: true, description: true },
        })
        .catch(() => [])
    : [];
  const nameBySku = new Map(
    itemRows.map((row) => [normalized(row.itemNumber).toUpperCase(), normalized(row.description)])
  );

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
  lines.sort((a, b) => a.itemSku.localeCompare(b.itemSku, undefined, { numeric: true, sensitivity: 'base' }));
  return { year: dataset.year, lines };
}
