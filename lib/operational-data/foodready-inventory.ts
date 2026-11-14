import prisma from '@/lib/prisma';
import { FOODREADY_SOURCE_CODE } from '@/lib/foodready';
import { formatEstDate, previousEstCalendarDate } from '@/lib/time/eastern';
import type { OperationalRecordInput, OperationalSourceOutput } from './types';

export const FOODREADY_PURCHASE_ORDER_LINES_KEY = 'foodready.purchase_order_lines';
export const FOODREADY_PURCHASED_LOTS_ENDPOINT = '/api/purchaseOrdersItemLots/search';
const WIP_LOTS_ENDPOINT = '/api/wipItemLots/search';
const FINISHED_GOODS_LOTS_ENDPOINT = '/api/moBatchOutput/search';
const INVENTORY_ITEMS_ENDPOINT = '/api/inventoryItems/search';
const SUPPLIER_ITEMS_ENDPOINT = '/api/supplierItems/search';
const ITEM_PACKAGING_ENDPOINT = '/api/itemPackaging/search';
const LOT_ENDPOINTS = [FOODREADY_PURCHASED_LOTS_ENDPOINT, WIP_LOTS_ENDPOINT, FINISHED_GOODS_LOTS_ENDPOINT];

type Dimensions = OperationalRecordInput['dimensions'];
type Measures = OperationalRecordInput['measures'];

/** A reference field is stored as `field` when FoodReady sends an ID and `fieldId` when it sends the populated object. */
export function foodReadyRef(dimensions: Dimensions, field: string): string {
  return String(dimensions?.[field] || dimensions?.[`${field}Id`] || '').trim();
}

function text(dimensions: Dimensions, field: string): string {
  return String(dimensions?.[field] ?? '').trim();
}

function amount(measures: Measures, field: string): number {
  const value = Number(measures?.[field] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/** A company with an active FoodReady connection takes its Inventory reports from FoodReady, not its accounting system. */
export async function isFoodReadyInventorySource(companyId: string): Promise<boolean> {
  const connection = await prisma.operationalSystemConnection.findFirst({
    where: { companyId, sourceCode: FOODREADY_SOURCE_CODE, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(connection);
}

async function loadPurchaseOrderLines(companyId: string) {
  const dataset = await prisma.operationalDataset.findUnique({
    where: { companyId_datasetKey: { companyId, datasetKey: FOODREADY_PURCHASE_ORDER_LINES_KEY } },
    select: { id: true },
  });
  if (!dataset) return [];
  return prisma.operationalRecord.findMany({
    where: { datasetId: dataset.id, dataMode: 'LIVE' },
    select: { externalId: true, dimensions: true, measures: true },
  });
}

export async function listFoodReadyPurchaseOrderLineIds(companyId: string): Promise<Set<string>> {
  return new Set((await loadPurchaseOrderLines(companyId)).map((line) => line.externalId));
}

type SnapshotRow = {
  companyId: string;
  snapshotDate: Date;
  frequency: string;
  itemId: string | null;
  itemName: string;
  sku: string | null;
  warehouse: string | null;
  lot: string | null;
  qtyOnHand: number;
  assetValue: number;
  avgCost: number | null;
};

/**
 * Replace yesterday's daily InventorySnapshot with FoodReady inventory: one row per lot in hand
 * (purchased, WIP and finished goods), valued at the lot's purchase-order line cost when FoodReady
 * has one. Items with stock but no lot that can be tied back to them keep a single item-level row.
 */
export async function writeFoodReadyInventorySnapshot(companyId: string, output: OperationalSourceOutput): Promise<string> {
  const bySource = new Map<string, OperationalRecordInput[]>();
  for (const row of Object.values(output).flatMap((dataset) => dataset.rows)) {
    const source = text(row.dimensions, 'sourceObject');
    if (!source) continue;
    bySource.set(source, [...(bySource.get(source) || []), row]);
  }
  const itemRows = bySource.get(INVENTORY_ITEMS_ENDPOINT) || [];
  if (!itemRows.length) {
    const seen = [...bySource.entries()].map(([source, rows]) => `${source} (${rows.length})`).join(', ') || 'none';
    return `Inventory snapshot not written: this sync returned no ${INVENTORY_ITEMS_ENDPOINT} rows. Endpoints returned: ${seen}`;
  }

  const items = new Map(itemRows.map((row) => [text(row.dimensions, 'id'), row]));
  const supplierItems = new Map(
    (bySource.get(SUPPLIER_ITEMS_ENDPOINT) || []).map((row) => [
      text(row.dimensions, 'id'),
      { itemId: foodReadyRef(row.dimensions, 'item'), unitCost: amount(row.measures, 'unitCost') },
    ]),
  );
  const packaging = new Map(
    (bySource.get(ITEM_PACKAGING_ENDPOINT) || []).map((row) => [
      text(row.dimensions, 'id'),
      { itemId: foodReadyRef(row.dimensions, 'inventoryItem'), unitCost: amount(row.measures, 'unitCost') },
    ]),
  );
  const packagingCostByItem = new Map<string, number>();
  for (const pack of packaging.values()) {
    if (pack.itemId && pack.unitCost > 0 && !packagingCostByItem.has(pack.itemId)) packagingCostByItem.set(pack.itemId, pack.unitCost);
  }
  const costUnitTypes = new Set<string>();
  const poLines = new Map(
    (await loadPurchaseOrderLines(companyId)).map((line) => {
      const dims = (line.dimensions || {}) as Record<string, unknown>;
      const measures = (line.measures || {}) as Record<string, unknown>;
      const supplierItem = supplierItems.get(String(dims.supplierItem || ''));
      const costSkuType = String(dims.costSkuType || '').trim();
      if (costSkuType) costUnitTypes.add(costSkuType);
      const unitSize = Number(measures.unitSize || 0);
      const perPack = /sku|case|pack|outer|box/i.test(costSkuType) && unitSize > 0;
      const lineCost = Number(measures.unitCost || 0) || Number(measures.displayUnitCost || 0);
      return [
        line.externalId,
        {
          itemId: supplierItem?.itemId || '',
          lineCost: lineCost > 0 ? (perPack ? lineCost / unitSize : lineCost) : 0,
          supplierItemCost: supplierItem?.unitCost || 0,
        },
      ];
    }),
  );
  const costSources = { purchaseOrderLine: 0, supplierItem: 0, packaging: 0, batchOutput: 0, none: 0 };
  const pickCost = (candidates: Array<[keyof typeof costSources, number]>): number => {
    const found = candidates.find(([, cost]) => cost > 0);
    costSources[found ? found[0] : 'none'] += 1;
    return found ? found[1] : 0;
  };

  // Inventory reports end no later than yesterday (EST), so the pull is stored as yesterday's closing stock.
  const snapshotDate = new Date(`${previousEstCalendarDate()}T00:00:00Z`);
  const data: SnapshotRow[] = [];
  const itemsWithLots = new Set<string>();
  const lotCounts = { purchased: 0, wip: 0, finished: 0 };
  const pushLot = (itemId: string, fallbackName: string, fallbackCode: string, row: OperationalRecordInput, unitCost: number) => {
    const qtyOnHand = amount(row.measures, 'quantityInHand');
    const item = items.get(itemId);
    const itemName = text(item?.dimensions, 'itemName') || fallbackName;
    if (!itemName || qtyOnHand === 0) return false;
    if (itemId) itemsWithLots.add(itemId);
    data.push({
      companyId,
      snapshotDate,
      frequency: 'daily',
      itemId: itemId || null,
      itemName,
      sku: text(item?.dimensions, 'itemCode') || fallbackCode || null,
      warehouse: text(row.dimensions, 'locationName') || null,
      lot: text(row.dimensions, 'lotCode') || null,
      qtyOnHand,
      assetValue: unitCost > 0 ? qtyOnHand * unitCost : 0,
      avgCost: unitCost > 0 ? unitCost : null,
    });
    return true;
  };

  let unlinkedPurchasedLots = 0;
  for (const row of bySource.get(FOODREADY_PURCHASED_LOTS_ENDPOINT) || []) {
    const line = poLines.get(foodReadyRef(row.dimensions, 'poItem'));
    if (!line?.itemId) {
      unlinkedPurchasedLots += 1;
      continue;
    }
    if (amount(row.measures, 'quantityInHand') === 0) continue;
    const cost = pickCost([
      ['purchaseOrderLine', line.lineCost],
      ['supplierItem', line.supplierItemCost],
      ['packaging', packagingCostByItem.get(line.itemId) || 0],
    ]);
    if (pushLot(line.itemId, '', '', row, cost)) lotCounts.purchased += 1;
  }
  for (const row of bySource.get(WIP_LOTS_ENDPOINT) || []) {
    const itemId = foodReadyRef(row.dimensions, 'item');
    if (amount(row.measures, 'quantityInHand') === 0) continue;
    const cost = pickCost([
      ['batchOutput', amount(row.measures, 'unitCost')],
      ['packaging', packagingCostByItem.get(itemId) || 0],
    ]);
    if (pushLot(itemId, text(row.dimensions, 'itemName'), text(row.dimensions, 'itemCode'), row, cost)) lotCounts.wip += 1;
  }
  for (const row of bySource.get(FINISHED_GOODS_LOTS_ENDPOINT) || []) {
    const pack = packaging.get(foodReadyRef(row.dimensions, 'itemPackaging'));
    if (!pack?.itemId || amount(row.measures, 'quantityInHand') === 0) continue;
    const cost = pickCost([
      ['batchOutput', amount(row.measures, 'unitCost')],
      ['packaging', pack.unitCost],
      ['packaging', packagingCostByItem.get(pack.itemId) || 0],
    ]);
    if (pushLot(pack.itemId, '', '', row, cost)) lotCounts.finished += 1;
  }

  const lotRowCount = data.length;
  for (const [itemId, row] of items) {
    const qtyOnHand = amount(row.measures, 'onHandQuantity');
    const itemName = text(row.dimensions, 'itemName');
    if (itemsWithLots.has(itemId) || !itemName || qtyOnHand === 0) continue;
    const cost = pickCost([['packaging', packagingCostByItem.get(itemId) || 0]]);
    data.push({
      companyId,
      snapshotDate,
      frequency: 'daily',
      itemId: itemId || null,
      itemName,
      sku: text(row.dimensions, 'itemCode') || null,
      warehouse: null,
      lot: null,
      qtyOnHand,
      assetValue: cost > 0 ? qtyOnHand * cost : 0,
      avgCost: cost > 0 ? cost : null,
    });
  }

  await prisma.$transaction([
    prisma.inventorySnapshot.deleteMany({ where: { companyId, frequency: 'daily', snapshotDate } }),
    prisma.inventorySnapshot.createMany({ data }),
  ]);
  return [
    `Inventory snapshot for ${previousEstCalendarDate()}: ${data.length} row(s)`,
    `${lotCounts.purchased} purchased, ${lotCounts.wip} WIP and ${lotCounts.finished} finished-goods lot(s)`,
    `${data.length - lotRowCount} item(s) without a linked lot`,
    ...(unlinkedPurchasedLots ? [`${unlinkedPurchasedLots} purchased lot(s) waiting on purchase-order line lookups`] : []),
    `costs from purchase-order lines ${costSources.purchaseOrderLine}, supplier items ${costSources.supplierItem}, packaging ${costSources.packaging}, batch output ${costSources.batchOutput}, no cost ${costSources.none}`,
    ...(costUnitTypes.size ? [`purchase-order cost units: ${[...costUnitTypes].slice(0, 6).join(', ')}`] : []),
  ].join('; ');
}

function estDateOnly(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : formatEstDate(parsed);
}

/**
 * Inventory report rows for a FoodReady company: each lot stays its own row and carries its
 * expiration and received dates from the synced FoodReady lot records.
 */
export async function foodReadyInventoryLotRecords<T extends { lot?: string | null; qtyOnHand?: number | null }>(
  companyId: string,
  snapshotRows: T[],
): Promise<Array<T & { expirationDate: string | null; receivedDate: string | null }>> {
  const lotCodes = [...new Set(snapshotRows.map((row) => String(row.lot || '').trim()).filter(Boolean))];
  type LotDates = { quantity: number; expirationDate: string | null; receivedDate: string | null };
  const lotDates = new Map<string, LotDates[]>();
  if (lotCodes.length) {
    const records = await prisma.operationalRecord.findMany({
      where: {
        companyId,
        dataMode: 'LIVE',
        dataset: { sourceCode: FOODREADY_SOURCE_CODE },
        OR: LOT_ENDPOINTS.map((endpoint) => ({ dimensions: { path: ['sourceObject'], equals: endpoint } })),
      },
      select: { dimensions: true, measures: true },
    });
    const wanted = new Set(lotCodes);
    for (const record of records) {
      const dims = (record.dimensions || {}) as Record<string, unknown>;
      const lotCode = String(dims.lotCode || '').trim();
      if (!wanted.has(lotCode)) continue;
      lotDates.set(lotCode, [
        ...(lotDates.get(lotCode) || []),
        {
          quantity: Number((record.measures as Record<string, unknown>)?.quantityInHand || 0),
          expirationDate: estDateOnly(dims.expirationDate),
          receivedDate: estDateOnly(dims.receivedOn ?? dims.receivedDate ?? dims.createdAt),
        },
      ]);
    }
  }
  return snapshotRows.map((row) => {
    const candidates = lotDates.get(String(row.lot || '').trim()) || [];
    const match = candidates.find((candidate) => candidate.quantity === Number(row.qtyOnHand || 0)) || candidates[0];
    return { ...row, expirationDate: match?.expirationDate ?? null, receivedDate: match?.receivedDate ?? null };
  });
}
