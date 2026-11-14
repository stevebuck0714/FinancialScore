import prisma from '@/lib/prisma';
import { FOODREADY_SOURCE_CODE } from '@/lib/foodready';
import { BAKERS_COGS_SOURCE_CODE } from '@/lib/operational/bakers-cogs';
import { formatEstDate, previousEstCalendarDate } from '@/lib/time/eastern';
import type { OperationalRecordInput, OperationalSourceOutput } from './types';

export const FOODREADY_PURCHASE_ORDER_LINES_KEY = 'foodready.purchase_order_lines';
export const FOODREADY_LOT_COSTS_KEY = 'foodready.lot_costs';
export const FOODREADY_LOT_USAGE_KEY = 'foodready.lot_usage';
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

function lotCostKey(itemId: unknown, lot: unknown): string {
  return `${String(itemId ?? '').trim()}|${String(lot ?? '').trim()}`;
}

/** Unit costs users entered for lots in the Inventory report, keyed by item and lot code. */
export async function loadFoodReadyLotCosts(companyId: string): Promise<Map<string, number>> {
  const dataset = await prisma.operationalDataset.findUnique({
    where: { companyId_datasetKey: { companyId, datasetKey: FOODREADY_LOT_COSTS_KEY } },
    select: { id: true },
  });
  if (!dataset) return new Map();
  const records = await prisma.operationalRecord.findMany({
    where: { datasetId: dataset.id },
    select: { externalId: true, measures: true },
  });
  return new Map(
    records
      .map((record) => [record.externalId, Number((record.measures as Record<string, unknown>)?.unitCost)] as const)
      .filter(([, cost]) => Number.isFinite(cost) && cost >= 0),
  );
}

/**
 * Save (or clear, with null) a user-entered unit cost for one lot and revalue that lot in the
 * latest daily snapshot. Syncs never overwrite it; it outranks every FoodReady and Bakers COGS cost.
 */
export async function saveFoodReadyLotCost(params: {
  companyId: string;
  itemId: string;
  lot: string | null;
  unitCost: number | null;
}): Promise<void> {
  const { companyId, itemId } = params;
  const lot = String(params.lot || '').trim() || null;
  const externalId = lotCostKey(itemId, lot);
  const dataset = await prisma.operationalDataset.upsert({
    where: { companyId_datasetKey: { companyId, datasetKey: FOODREADY_LOT_COSTS_KEY } },
    create: {
      companyId,
      sourceCode: FOODREADY_SOURCE_CODE,
      datasetKey: FOODREADY_LOT_COSTS_KEY,
      label: 'FoodReady Lot Costs',
      description: 'Unit costs entered by users for FoodReady lots in the Inventory report, keyed by item and lot code.',
      grain: 'point_in_time',
      schema: {
        key: FOODREADY_LOT_COSTS_KEY,
        label: 'FoodReady Lot Costs',
        description: 'Unit costs entered by users for FoodReady lots in the Inventory report, keyed by item and lot code.',
        grain: 'point_in_time',
        dimensions: [{ name: 'itemId' }, { name: 'lot' }],
        measures: [{ name: 'unitCost' }],
      },
      dataMode: 'LIVE',
    },
    update: {},
    select: { id: true },
  });

  const unitCost = params.unitCost != null && Number.isFinite(params.unitCost) && params.unitCost >= 0 ? params.unitCost : null;
  if (unitCost == null) {
    await prisma.operationalRecord.deleteMany({ where: { datasetId: dataset.id, externalId } });
  } else {
    const today = new Date(`${formatEstDate()}T00:00:00Z`);
    await prisma.operationalRecord.upsert({
      where: { datasetId_externalId: { datasetId: dataset.id, externalId } },
      create: {
        companyId,
        datasetId: dataset.id,
        recordDate: today,
        externalId,
        dimensions: { itemId, lot },
        measures: { unitCost },
        dataMode: 'LIVE',
      },
      update: { measures: { unitCost }, recordDate: today },
    });
  }
  const rowCount = await prisma.operationalRecord.count({ where: { datasetId: dataset.id } });
  await prisma.operationalDataset.update({ where: { id: dataset.id }, data: { rowCount, lastSyncedAt: new Date() } });

  const latest = await prisma.inventorySnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return;
  await prisma.$executeRaw`
    UPDATE "InventorySnapshot"
    SET "avgCost" = ${unitCost}, "assetValue" = COALESCE("qtyOnHand" * ${unitCost ?? 0}, 0)
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
      AND "snapshotDate" = ${latest.snapshotDate}
      AND "itemId" = ${itemId}
      AND "lot" IS NOT DISTINCT FROM ${lot}
  `;
}

function costKey(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Costs from the company's Bakers COGS workbook, newest formula first: each product's total COGS
 * (finished goods) and each ingredient or packaging line's unit cost (purchased materials).
 */
async function loadBakersCogsCosts(companyId: string) {
  const facts = await prisma.bakersCogsFact.findMany({
    where: {
      companyId,
      sourceCode: BAKERS_COGS_SOURCE_CODE,
      OR: [
        { lineType: 'SUMMARY', metricName: 'totalCogs' },
        { lineType: { in: ['INGREDIENT', 'PACKAGING'] }, unitCost: { gt: 0 } },
      ],
    },
    orderBy: [{ formulaDate: 'desc' }, { updatedAt: 'desc' }],
    select: { productId: true, productName: true, lineType: true, description: true, unitCost: true, valueNumber: true },
  });
  const productCost = new Map<string, number>();
  const materialCost = new Map<string, number>();
  for (const fact of facts) {
    if (fact.lineType === 'SUMMARY') {
      const cost = Number(fact.valueNumber || 0);
      if (cost <= 0) continue;
      for (const key of [costKey(fact.productId), costKey(fact.productName)]) {
        if (key && !productCost.has(key)) productCost.set(key, cost);
      }
    } else {
      const key = costKey(fact.description);
      if (key && !materialCost.has(key)) materialCost.set(key, Number(fact.unitCost));
    }
  }
  return { productCost, materialCost };
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
  const bakersCogs = await loadBakersCogsCosts(companyId);
  const itemKeys = (itemId: string, fallbackName = '', fallbackCode = '') => {
    const item = items.get(itemId);
    return [text(item?.dimensions, 'itemCode') || fallbackCode, text(item?.dimensions, 'itemName') || fallbackName].map(costKey).filter(Boolean);
  };
  const bakersProductCost = (keys: string[]) => keys.map((key) => bakersCogs.productCost.get(key) || 0).find((cost) => cost > 0) || 0;
  const bakersMaterialCost = (keys: string[]) => keys.map((key) => bakersCogs.materialCost.get(key) || 0).find((cost) => cost > 0) || 0;
  const enteredLotCosts = await loadFoodReadyLotCosts(companyId);
  // -1 when no cost was entered; an entered 0 is kept so a user can zero out a lot.
  const enteredCost = (itemId: string, row?: OperationalRecordInput) =>
    enteredLotCosts.get(lotCostKey(itemId, row ? text(row.dimensions, 'lotCode') || null : null)) ?? -1;
  const costSources = { entered: 0, purchaseOrderLine: 0, supplierItem: 0, packaging: 0, batchOutput: 0, bakersCogsProduct: 0, bakersCogsMaterial: 0, none: 0 };
  const pickCost = (candidates: Array<[keyof typeof costSources, number]>): number => {
    const found = candidates.find(([source, cost]) => (source === 'entered' ? cost >= 0 : cost > 0));
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
      ['entered', enteredCost(line.itemId, row)],
      ['purchaseOrderLine', line.lineCost],
      ['supplierItem', line.supplierItemCost],
      ['packaging', packagingCostByItem.get(line.itemId) || 0],
      ['bakersCogsMaterial', bakersMaterialCost(itemKeys(line.itemId))],
    ]);
    if (pushLot(line.itemId, '', '', row, cost)) lotCounts.purchased += 1;
  }
  for (const row of bySource.get(WIP_LOTS_ENDPOINT) || []) {
    const itemId = foodReadyRef(row.dimensions, 'item');
    if (amount(row.measures, 'quantityInHand') === 0) continue;
    const keys = itemKeys(itemId, text(row.dimensions, 'itemName'), text(row.dimensions, 'itemCode'));
    const cost = pickCost([
      ['entered', enteredCost(itemId, row)],
      ['batchOutput', amount(row.measures, 'unitCost')],
      ['packaging', packagingCostByItem.get(itemId) || 0],
      ['bakersCogsProduct', bakersProductCost(keys)],
      ['bakersCogsMaterial', bakersMaterialCost(keys)],
    ]);
    if (pushLot(itemId, text(row.dimensions, 'itemName'), text(row.dimensions, 'itemCode'), row, cost)) lotCounts.wip += 1;
  }
  for (const row of bySource.get(FINISHED_GOODS_LOTS_ENDPOINT) || []) {
    const pack = packaging.get(foodReadyRef(row.dimensions, 'itemPackaging'));
    if (!pack?.itemId || amount(row.measures, 'quantityInHand') === 0) continue;
    const cost = pickCost([
      ['entered', enteredCost(pack.itemId, row)],
      ['batchOutput', amount(row.measures, 'unitCost')],
      ['packaging', pack.unitCost],
      ['packaging', packagingCostByItem.get(pack.itemId) || 0],
      ['bakersCogsProduct', bakersProductCost(itemKeys(pack.itemId))],
    ]);
    if (pushLot(pack.itemId, '', '', row, cost)) lotCounts.finished += 1;
  }

  const lotRowCount = data.length;
  for (const [itemId, row] of items) {
    const qtyOnHand = amount(row.measures, 'onHandQuantity');
    const itemName = text(row.dimensions, 'itemName');
    if (itemsWithLots.has(itemId) || !itemName || qtyOnHand === 0) continue;
    const cost = pickCost([
      ['entered', enteredCost(itemId)],
      ['packaging', packagingCostByItem.get(itemId) || 0],
      ['bakersCogsProduct', bakersProductCost(itemKeys(itemId))],
      ['bakersCogsMaterial', bakersMaterialCost(itemKeys(itemId))],
    ]);
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
    `costs entered in the Inventory report ${costSources.entered}, from purchase-order lines ${costSources.purchaseOrderLine}, supplier items ${costSources.supplierItem}, packaging ${costSources.packaging}, batch output ${costSources.batchOutput}, Bakers COGS products ${costSources.bakersCogsProduct}, Bakers COGS ingredients/packaging ${costSources.bakersCogsMaterial}, no cost ${costSources.none}`,
    `Bakers COGS has ${bakersCogs.productCost.size} product and ${bakersCogs.materialCost.size} ingredient/packaging cost key(s)`,
    ...(costUnitTypes.size ? [`purchase-order cost units: ${[...costUnitTypes].slice(0, 6).join(', ')}`] : []),
    lotUsageSummary(companyId, output, bySource),
  ].join('; ');
}

function formatQty(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Why the last lot usage pull for a company failed; read by the snapshot note in the same sync run. */
const lotUsageFailures = new Map<string, string>();

export function setFoodReadyLotUsageFailure(companyId: string, reason: string) {
  lotUsageFailures.set(companyId, reason);
}

/** What FoodReady reports as used from each lot (production inputs and sales order lines), against the lots in hand. */
function lotUsageSummary(companyId: string, output: OperationalSourceOutput, bySource: Map<string, OperationalRecordInput[]>): string {
  const failure = lotUsageFailures.get(companyId);
  lotUsageFailures.delete(companyId);
  const usage = output[FOODREADY_LOT_USAGE_KEY]?.rows;
  if (!usage) return failure ? `lot usage not pulled: ${failure}` : 'lot usage not pulled (only syncs that include today pull it)';
  const totals = { production: { entries: 0, qty: 0 }, sales: { entries: 0, qty: 0 } };
  const usedByLot = new Map<string, number>();
  let salesWithCost = 0;
  for (const row of usage) {
    const kind = text(row.dimensions, 'usageType') === 'sales' ? 'sales' : 'production';
    const qty = amount(row.measures, 'qtyUsed');
    totals[kind].entries += 1;
    totals[kind].qty += qty;
    if (kind === 'sales' && amount(row.measures, 'unitCost') > 0) salesWithCost += 1;
    const lotId = text(row.dimensions, 'purchaseOrderItemLot') || text(row.dimensions, 'moBatchOutput');
    if (lotId) usedByLot.set(lotId, (usedByLot.get(lotId) || 0) + qty);
  }
  const inHand = (endpoint: string, receivedField: string) => {
    const lots = (bySource.get(endpoint) || []).filter((row) => amount(row.measures, 'quantityInHand') !== 0);
    return {
      lots: lots.length,
      withUsage: lots.filter((row) => usedByLot.has(text(row.dimensions, 'id'))).length,
      received: lots.reduce((sum, row) => sum + amount(row.measures, receivedField), 0),
      inHand: lots.reduce((sum, row) => sum + amount(row.measures, 'quantityInHand'), 0),
      used: lots.reduce((sum, row) => sum + (usedByLot.get(text(row.dimensions, 'id')) || 0), 0),
    };
  };
  const purchased = inHand(FOODREADY_PURCHASED_LOTS_ENDPOINT, 'totalQuantityReceived');
  const finished = inHand(FINISHED_GOODS_LOTS_ENDPOINT, 'totalQtyProducedPerBatch');
  return [
    `lot usage: ${totals.production.entries} production input(s) using ${formatQty(totals.production.qty)}, ${totals.sales.entries} sales order allocation(s) using ${formatQty(totals.sales.qty)} (${salesWithCost} with a unit cost), across ${usedByLot.size} lot(s)`,
    `purchased lots in hand: ${purchased.withUsage} of ${purchased.lots} have usage; received ${formatQty(purchased.received)}, FoodReady in hand ${formatQty(purchased.inHand)}, used ${formatQty(purchased.used)}`,
    `finished-goods lots in hand: ${finished.withUsage} of ${finished.lots} have usage; produced ${formatQty(finished.received)}, FoodReady in hand ${formatQty(finished.inHand)}, used ${formatQty(finished.used)}`,
  ].join('; ');
}

function estDateOnly(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : formatEstDate(parsed);
}

export type FoodReadyLotSource = 'finished_goods' | 'purchased' | 'wip';

/** Finished-goods lots are created by production batches; purchased lots arrive on purchase orders. */
const LOT_SOURCE_BY_ENDPOINT: Record<string, FoodReadyLotSource> = {
  [FINISHED_GOODS_LOTS_ENDPOINT]: 'finished_goods',
  [FOODREADY_PURCHASED_LOTS_ENDPOINT]: 'purchased',
  [WIP_LOTS_ENDPOINT]: 'wip',
};

/**
 * Inventory report rows for a FoodReady company: each lot stays its own row and carries its
 * expiration and received dates and its origin from the synced FoodReady lot records.
 */
export async function foodReadyInventoryLotRecords<T extends { itemId?: string | null; lot?: string | null; qtyOnHand?: number | null }>(
  companyId: string,
  snapshotRows: T[],
): Promise<
  Array<T & { expirationDate: string | null; receivedDate: string | null; enteredUnitCost: number | null; lotSource: FoodReadyLotSource | null }>
> {
  const enteredLotCosts = await loadFoodReadyLotCosts(companyId);
  const lotCodes = [...new Set(snapshotRows.map((row) => String(row.lot || '').trim()).filter(Boolean))];
  type LotDates = { quantity: number; expirationDate: string | null; receivedDate: string | null; source: FoodReadyLotSource | null };
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
          source: LOT_SOURCE_BY_ENDPOINT[String(dims.sourceObject || '')] ?? null,
        },
      ]);
    }
  }
  return snapshotRows.map((row) => {
    const candidates = lotDates.get(String(row.lot || '').trim()) || [];
    const match = candidates.find((candidate) => candidate.quantity === Number(row.qtyOnHand || 0)) || candidates[0];
    return {
      ...row,
      expirationDate: match?.expirationDate ?? null,
      receivedDate: match?.receivedDate ?? null,
      enteredUnitCost: enteredLotCosts.get(lotCostKey(row.itemId, row.lot)) ?? null,
      lotSource: match?.source ?? null,
    };
  });
}
