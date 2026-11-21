import prisma from '@/lib/prisma';
import { FOODREADY_SOURCE_CODE } from '@/lib/foodready';
import { BAKERS_COGS_SOURCE_CODE } from '@/lib/operational/bakers-cogs';
import { formatEstDate, formatEstDateTime, previousEstCalendarDate } from '@/lib/time/eastern';
import type { OperationalRecordInput, OperationalSourceOutput } from './types';

export const FOODREADY_PURCHASE_ORDER_LINES_KEY = 'foodready.purchase_order_lines';
export const FOODREADY_LOT_COSTS_KEY = 'foodready.lot_costs';
export const FOODREADY_LOT_USAGE_KEY = 'foodready.lot_usage';
export const FOODREADY_LOT_USAGE_STATUS_KEY = 'foodready.lot_usage_status';
export const FOODREADY_RECIPE_INPUTS_KEY = 'foodready.recipe_inputs';
export const FOODREADY_RECIPE_INPUTS_ENDPOINT = '/api/bomInput/search';
export const FOODREADY_PURCHASED_LOTS_ENDPOINT = '/api/purchaseOrdersItemLots/search';
const WIP_LOTS_ENDPOINT = '/api/wipItemLots/search';
const FINISHED_GOODS_LOTS_ENDPOINT = '/api/moBatchOutput/search';
const INVENTORY_ITEMS_ENDPOINT = '/api/inventoryItems/search';
const SUPPLIER_ITEMS_ENDPOINT = '/api/supplierItems/search';
const ITEM_PACKAGING_ENDPOINT = '/api/itemPackaging/search';
/** Domains the inventory snapshot is built from; syncs pull these first. */
export const FOODREADY_SNAPSHOT_ENDPOINTS: readonly string[] = [
  INVENTORY_ITEMS_ENDPOINT,
  FOODREADY_PURCHASED_LOTS_ENDPOINT,
  WIP_LOTS_ENDPOINT,
  FINISHED_GOODS_LOTS_ENDPOINT,
  ITEM_PACKAGING_ENDPOINT,
  SUPPLIER_ITEMS_ENDPOINT,
];
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
  const skipped = skippedDomains.get(companyId) || [];
  skippedDomains.delete(companyId);
  const skippedNote = skipped.length ? `Sync hit its time limit and skipped ${skipped.join(', ')} (their stored data is unchanged)` : '';
  if (skipped.some((endpoint) => FOODREADY_SNAPSHOT_ENDPOINTS.includes(endpoint))) {
    return `${skippedNote}; inventory snapshot not rewritten, so the report keeps the last complete one. ${recipeInputsSummary(companyId, output)}`;
  }
  const note = await buildFoodReadyInventorySnapshot(companyId, output);
  return skippedNote ? `${skippedNote}; ${note}` : note;
}

async function buildFoodReadyInventorySnapshot(companyId: string, output: OperationalSourceOutput): Promise<string> {
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
      {
        itemId: foodReadyRef(row.dimensions, 'inventoryItem'),
        unitCost: amount(row.measures, 'unitCost'),
        // Numeric SKUs are stored as measures.
        keys: salesProductKeys([text(row.dimensions, 'sku') || (row.measures?.sku != null ? String(row.measures.sku) : ''), text(row.dimensions, 'skuName')]),
      },
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

  // FoodReady never reduces a lot's in-hand quantity, so stock is rebuilt from the stored usage pull.
  const usageRows = await loadDatasetRows(companyId, FOODREADY_LOT_USAGE_KEY);
  const usage = summarizeUsageRows(usageRows, packaging);
  const usageAdjustments = { lots: 0, reduced: 0 };
  /** Received (or produced) minus recorded production/sales usage; FoodReady's own figure when the lot has no usage. */
  const lotQuantity = (row: OperationalRecordInput, receivedField: string): number => {
    const inHand = amount(row.measures, 'quantityInHand');
    const used = usage.usedByLot.get(text(row.dimensions, 'id')) || 0;
    if (used <= 0) return inHand;
    const qty = Math.max(0, (amount(row.measures, receivedField) || inHand) - used);
    usageAdjustments.lots += 1;
    usageAdjustments.reduced += inHand - qty;
    return qty;
  };

  // Inventory reports end no later than yesterday (EST), so the pull is stored as yesterday's closing stock.
  const snapshotDate = new Date(`${previousEstCalendarDate()}T00:00:00Z`);
  const data: SnapshotRow[] = [];
  const itemsWithLots = new Set<string>();
  const lotCounts = { purchased: 0, wip: 0, finished: 0 };
  const pushLot = (itemId: string, fallbackName: string, fallbackCode: string, row: OperationalRecordInput, unitCost: number, qtyOnHand: number) => {
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
    const qty = lotQuantity(row, 'totalQuantityReceived');
    if (qty === 0) continue;
    const cost = pickCost([
      ['entered', enteredCost(line.itemId, row)],
      ['purchaseOrderLine', line.lineCost],
      ['supplierItem', line.supplierItemCost],
      ['packaging', packagingCostByItem.get(line.itemId) || 0],
      ['bakersCogsMaterial', bakersMaterialCost(itemKeys(line.itemId))],
    ]);
    if (pushLot(line.itemId, '', '', row, cost, qty)) lotCounts.purchased += 1;
  }
  for (const row of bySource.get(WIP_LOTS_ENDPOINT) || []) {
    const itemId = foodReadyRef(row.dimensions, 'item');
    const qty = lotQuantity(row, 'totalQuantityReceived');
    if (qty === 0) continue;
    const keys = itemKeys(itemId, text(row.dimensions, 'itemName'), text(row.dimensions, 'itemCode'));
    const cost = pickCost([
      ['entered', enteredCost(itemId, row)],
      ['batchOutput', amount(row.measures, 'unitCost')],
      ['packaging', packagingCostByItem.get(itemId) || 0],
      ['bakersCogsProduct', bakersProductCost(keys)],
      ['bakersCogsMaterial', bakersMaterialCost(keys)],
    ]);
    if (pushLot(itemId, text(row.dimensions, 'itemName'), text(row.dimensions, 'itemCode'), row, cost, qty)) lotCounts.wip += 1;
  }

  // Finished goods: shipped quantity per packaging (or per product, when a line has no packaging)
  // comes off that product's lots, oldest lot first, since FoodReady does not record which lot shipped.
  const finishedLots = (bySource.get(FINISHED_GOODS_LOTS_ENDPOINT) || [])
    .map((row) => {
      const packId = foodReadyRef(row.dimensions, 'itemPackaging');
      const pack = packaging.get(packId);
      const lotDate = estDateOnly(row.dimensions?.createdAt) || estDateOnly(row.dimensions?.expirationDate) || '9999-12-31';
      return {
        row,
        packId,
        packKeys: pack?.keys || [],
        itemId: pack?.itemId || '',
        unitCost: pack?.unitCost || 0,
        lotDate,
        qty: lotQuantity(row, 'totalQtyProducedPerBatch'),
      };
    })
    .filter((lot) => lot.itemId && lot.qty > 0)
    .sort((a, b) => a.lotDate.localeCompare(b.lotDate));
  const shipping = { produced: 0, applied: 0, unmatched: 0 };
  finishedLots.forEach((lot) => {
    shipping.produced += lot.qty;
  });
  const takeShipped = (lots: typeof finishedLots, shipped: number) => {
    let remaining = shipped;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const taken = Math.min(lot.qty, remaining);
      lot.qty -= taken;
      remaining -= taken;
      shipping.applied += taken;
    }
    shipping.unmatched += remaining;
  };
  // Accounting sales cover every shipment, including the ones on FoodReady sales orders, so a product
  // matched there uses only its accounting quantity; FoodReady sales orders cover the rest.
  const accounting = await loadAccountingShipments(
    companyId,
    finishedLots.map((lot) => ({
      itemId: lot.itemId,
      packId: lot.packId,
      itemName: text(items.get(lot.itemId)?.dimensions, 'itemName') || lot.itemId,
      itemKeys: itemKeys(lot.itemId),
      packKeys: lot.packKeys,
      lotDate: lot.lotDate,
      qty: lot.qty,
    })),
  );
  for (const [packId, shipped] of accounting.shippedByPackaging) takeShipped(finishedLots.filter((lot) => lot.packId === packId), shipped);
  for (const [itemId, shipped] of accounting.shippedByItem) takeShipped(finishedLots.filter((lot) => lot.itemId === itemId), shipped);
  const accountingApplied = shipping.applied;
  const shippedFromSalesOrders = (lots: typeof finishedLots, shipped: number) => {
    const open = lots.filter((lot) => !accounting.matchedItems.has(lot.itemId));
    if (open.length || !lots.length) takeShipped(open, shipped);
  };
  for (const [packId, shipped] of usage.shippedByPackaging) shippedFromSalesOrders(finishedLots.filter((lot) => lot.packId === packId), shipped);
  for (const [itemId, shipped] of usage.shippedByItem) shippedFromSalesOrders(finishedLots.filter((lot) => lot.itemId === itemId), shipped);
  for (const lot of finishedLots) {
    if (lot.qty <= 0) continue;
    const cost = pickCost([
      ['entered', enteredCost(lot.itemId, lot.row)],
      ['batchOutput', amount(lot.row.measures, 'unitCost')],
      ['packaging', lot.unitCost],
      ['packaging', packagingCostByItem.get(lot.itemId) || 0],
      ['bakersCogsProduct', bakersProductCost(itemKeys(lot.itemId))],
    ]);
    if (pushLot(lot.itemId, '', '', lot.row, cost, lot.qty)) lotCounts.finished += 1;
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
    recipeInputsSummary(companyId, output),
    await lotUsageSummary(companyId, bySource, usageRows),
    usageRows.length
      ? `quantities: ${usageAdjustments.lots} lot(s) reduced by recorded usage (−${formatQty(usageAdjustments.reduced)}); finished goods ${formatQty(shipping.produced)} produced, ${formatQty(shipping.applied)} shipped taken off oldest lots first (${formatQty(accountingApplied)} from accounting sales, ${formatQty(shipping.applied - accountingApplied)} from FoodReady sales orders)${shipping.unmatched > 0 ? `, ${formatQty(shipping.unmatched)} shipped beyond the lots in hand` : ''}; FoodReady: ${usage.shippedLines} shipped sales order line(s), ${usage.openLines} not shipped, ${usage.linesWithoutOrder} without a known order; sales order statuses: ${[...usage.orderStatuses.entries()].map(([status, count]) => `${status} ${count}`).join(', ') || 'none'}`
      : 'quantities: no lot usage stored yet, so lot quantities are FoodReady’s own',
    accounting.note,
  ].join('; ');
}

const SHIPPED_ORDER_STATUS = /ship|deliver|complete|invoic|clos|fulfil/i;

/** Accounting product names are often "Category:Product"; match on the whole name and on the last part. */
function salesProductKeys(values: Array<string | null | undefined>): string[] {
  const keys = new Set<string>();
  for (const raw of values.map((value) => String(value || '').trim()).filter(Boolean)) {
    keys.add(costKey(raw));
    const parts = raw.split(/[:|,/\\]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) keys.add(costKey(parts[parts.length - 1]));
  }
  keys.delete('');
  return [...keys];
}

/**
 * Quantity sold from the accounting system's product sales (daily when synced daily, otherwise
 * monthly), counted from the oldest finished-goods lot in hand. Sales match a packaging first (its
 * SKU or SKU name, so units are the packaging's) and otherwise the item's code or name.
 */
async function loadAccountingShipments(
  companyId: string,
  lots: Array<{ itemId: string; packId: string; itemName: string; itemKeys: string[]; packKeys: string[]; lotDate: string; qty: number }>,
) {
  type Target = { kind: 'pack' | 'item'; id: string; itemId: string };
  const firstLotDate = new Map<string, string>();
  const targetByKey = new Map<string, Target>();
  const produced = new Map<string, { name: string; qty: number }>();
  for (const lot of lots) {
    for (const id of [`pack|${lot.packId}`, `item|${lot.itemId}`]) {
      const current = firstLotDate.get(id);
      if (!current || lot.lotDate < current) firstLotDate.set(id, lot.lotDate);
    }
    for (const key of lot.packKeys) if (!targetByKey.has(key)) targetByKey.set(key, { kind: 'pack', id: lot.packId, itemId: lot.itemId });
    const entry = produced.get(lot.itemId) || { name: lot.itemName, qty: 0 };
    entry.qty += lot.qty;
    produced.set(lot.itemId, entry);
  }
  for (const lot of lots) {
    for (const key of lot.itemKeys) if (!targetByKey.has(key)) targetByKey.set(key, { kind: 'item', id: lot.itemId, itemId: lot.itemId });
  }
  const shippedByPackaging = new Map<string, number>();
  const shippedByItem = new Map<string, number>();
  const matchedItems = new Set<string>();
  const soldByItem = new Map<string, number>();
  const empty = (note: string) => ({ shippedByPackaging, shippedByItem, matchedItems, note });
  const earliest = [...firstLotDate.values()].sort()[0];
  if (!earliest || earliest === '9999-12-31') return empty('accounting sales: no finished-goods lots to apply them to');

  const select = { snapshotDate: true, itemId: true, itemName: true, sku: true, quantitySold: true } as const;
  let frequency: 'daily' | 'monthly' = 'daily';
  let sales = await prisma.productSalesSnapshot.findMany({
    where: { companyId, frequency: 'daily', snapshotDate: { gte: new Date(`${earliest}T00:00:00Z`) } },
    select,
  });
  if (!sales.length) {
    frequency = 'monthly';
    sales = await prisma.productSalesSnapshot.findMany({
      where: { companyId, frequency: 'monthly', snapshotDate: { gte: new Date(`${earliest.slice(0, 7)}-01T00:00:00Z`) } },
      select,
    });
  }
  if (!sales.length) return empty(`accounting sales: no product sales stored since ${earliest}, so only FoodReady sales orders were subtracted`);

  const unmatchedProducts = new Map<string, number>();
  const matchKinds = { pack: 0, item: 0 };
  for (const sale of sales) {
    const saleDate = sale.snapshotDate.toISOString().slice(0, 10);
    const target = salesProductKeys([sale.itemName, sale.sku, sale.itemId]).map((key) => targetByKey.get(key)).find(Boolean);
    if (!target) {
      unmatchedProducts.set(sale.itemName, (unmatchedProducts.get(sale.itemName) || 0) + sale.quantitySold);
      continue;
    }
    const since = firstLotDate.get(`${target.kind}|${target.id}`) || earliest;
    if (frequency === 'daily' ? saleDate < since : saleDate.slice(0, 7) < since.slice(0, 7)) continue;
    const shipped = target.kind === 'pack' ? shippedByPackaging : shippedByItem;
    shipped.set(target.id, (shipped.get(target.id) || 0) + sale.quantitySold);
    matchedItems.add(target.itemId);
    soldByItem.set(target.itemId, (soldByItem.get(target.itemId) || 0) + sale.quantitySold);
    matchKinds[target.kind] += sale.quantitySold;
  }
  const unmatched = [...unmatchedProducts.entries()].filter(([, qty]) => qty > 0).sort((a, b) => b[1] - a[1]);
  const perProduct = [...soldByItem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([itemId, sold]) => `${produced.get(itemId)?.name || itemId} produced ${formatQty(produced.get(itemId)?.qty || 0)} / sold ${formatQty(sold)}`);
  const notMatched = [...produced.entries()].filter(([itemId]) => !matchedItems.has(itemId)).map(([, entry]) => entry.name);
  return {
    shippedByPackaging,
    shippedByItem,
    matchedItems,
    note:
      `accounting sales (${frequency} product sales since ${earliest}): ${matchedItems.size} of ${produced.size} finished-goods product(s) matched ` +
      `(${formatQty(matchKinds.pack)} sold matched by packaging SKU, ${formatQty(matchKinds.item)} by item code/name)` +
      (frequency === 'monthly' ? ', monthly totals include the whole month of each product’s oldest lot' : '') +
      (perProduct.length ? `; produced in FoodReady lots vs sold since the oldest lot: ${perProduct.join(', ')}` : '') +
      (notMatched.length ? `; finished goods with no accounting sales match: ${notMatched.join(', ')}` : '') +
      (unmatched.length
        ? `; ${unmatched.length} sold product(s) not matched to a finished good: ${unmatched.slice(0, 8).map(([name, qty]) => `${name} ${formatQty(qty)}`).join(', ')}${unmatched.length > 8 ? ', …' : ''}`
        : ''),
  };
}

/**
 * Totals from the stored usage pull: quantity used per lot (production and sales allocations), and
 * quantity shipped per packaging or product from sales order lines whose order has shipped.
 */
function summarizeUsageRows(rows: OperationalRecordInput[], packaging: Map<string, { itemId: string; unitCost: number }>) {
  const usedByLot = new Map<string, number>();
  const shippedOrders = new Set<string>();
  const knownOrders = new Set<string>();
  const orderStatuses = new Map<string, number>();
  for (const row of rows) {
    const kind = text(row.dimensions, 'usageType');
    if (kind === 'sales_order') {
      const id = text(row.dimensions, 'recordId');
      const status = text(row.dimensions, 'status') || 'no status';
      knownOrders.add(id);
      orderStatuses.set(status, (orderStatuses.get(status) || 0) + 1);
      if (text(row.dimensions, 'shippedOn') || SHIPPED_ORDER_STATUS.test(status)) shippedOrders.add(id);
    } else if (kind === 'production' || kind === 'sales') {
      const lotId = text(row.dimensions, 'purchaseOrderItemLot') || text(row.dimensions, 'moBatchOutput');
      if (lotId) usedByLot.set(lotId, (usedByLot.get(lotId) || 0) + amount(row.measures, 'qtyUsed'));
    }
  }
  const shippedByPackaging = new Map<string, number>();
  const shippedByItem = new Map<string, number>();
  let shippedLines = 0;
  let openLines = 0;
  let linesWithoutOrder = 0;
  for (const row of rows) {
    if (text(row.dimensions, 'usageType') !== 'sales_line') continue;
    const orderId = text(row.dimensions, 'so');
    if (!knownOrders.has(orderId)) {
      linesWithoutOrder += 1;
      continue;
    }
    if (!shippedOrders.has(orderId)) {
      openLines += 1;
      continue;
    }
    shippedLines += 1;
    const qty = amount(row.measures, 'orderQty');
    const packId = text(row.dimensions, 'itemPackaging');
    if (packId && packaging.has(packId)) shippedByPackaging.set(packId, (shippedByPackaging.get(packId) || 0) + qty);
    else {
      const itemId = text(row.dimensions, 'inventoryItem');
      if (itemId) shippedByItem.set(itemId, (shippedByItem.get(itemId) || 0) + qty);
    }
  }
  return { usedByLot, shippedByPackaging, shippedByItem, orderStatuses, shippedLines, openLines, linesWithoutOrder };
}

function formatQty(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Domains this sync run skipped for time; read by the snapshot writer in the same run. */
const skippedDomains = new Map<string, string[]>();

export function setFoodReadySkippedDomains(companyId: string, domains: string[]) {
  if (domains.length) skippedDomains.set(companyId, domains);
  else skippedDomains.delete(companyId);
}

/** Why the recipe input pull failed in this sync run; read by the snapshot note in the same run. */
const recipeInputsFailures = new Map<string, string>();

export function setFoodReadyRecipeInputsFailure(companyId: string, reason: string) {
  recipeInputsFailures.set(companyId, reason);
}

function recipeInputsSummary(companyId: string, output: OperationalSourceOutput): string {
  const failure = recipeInputsFailures.get(companyId);
  recipeInputsFailures.delete(companyId);
  const rows = output[FOODREADY_RECIPE_INPUTS_KEY]?.rows;
  if (rows) return `${rows.length} recipe input(s) (ingredients made in production are kept out of Finished Goods)`;
  return failure ? `recipe inputs not pulled: ${failure}` : 'recipe inputs not pulled (only syncs that include today pull them)';
}

async function loadDatasetRows(companyId: string, datasetKey: string): Promise<OperationalRecordInput[]> {
  const dataset = await prisma.operationalDataset.findUnique({
    where: { companyId_datasetKey: { companyId, datasetKey } },
    select: { id: true },
  });
  if (!dataset) return [];
  const records = await prisma.operationalRecord.findMany({
    where: { datasetId: dataset.id, dataMode: 'LIVE' },
    select: { externalId: true, recordDate: true, dimensions: true, measures: true },
  });
  return records.map((record) => ({
    date: record.recordDate.toISOString().slice(0, 10),
    externalId: record.externalId,
    dimensions: (record.dimensions || {}) as Dimensions,
    measures: (record.measures || {}) as Measures,
  }));
}

/**
 * What FoodReady reports as used from each lot (production inputs and sales order lines), from the
 * latest background usage pull, against the lots in hand from this sync.
 */
async function lotUsageSummary(
  companyId: string,
  bySource: Map<string, OperationalRecordInput[]>,
  usage: OperationalRecordInput[],
): Promise<string> {
  const [status] = await loadDatasetRows(companyId, FOODREADY_LOT_USAGE_STATUS_KEY);
  if (!status) return 'lot usage not pulled yet';
  const finishedAt = new Date(text(status.dimensions, 'finishedAt'));
  const when = Number.isNaN(finishedAt.getTime()) ? '' : ` (${formatEstDateTime(finishedAt)})`;
  const pullStatus = text(status.dimensions, 'status');
  if (pullStatus === 'running') return `lot usage pull in progress${when}: ${text(status.dimensions, 'message')}`;
  if (pullStatus !== 'ok') return `last lot usage pull failed${when}: ${text(status.dimensions, 'message')}`;
  const totals = { production: { entries: 0, qty: 0 }, sales: { entries: 0, qty: 0 } };
  const usedByLot = new Map<string, number>();
  let salesWithCost = 0;
  for (const row of usage) {
    const usageType = text(row.dimensions, 'usageType');
    if (usageType !== 'production' && usageType !== 'sales') continue;
    const kind = usageType;
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
    `lot usage${when}: ${totals.production.entries} production input(s) using ${formatQty(totals.production.qty)}, ${totals.sales.entries} sales order allocation(s) using ${formatQty(totals.sales.qty)} (${salesWithCost} with a unit cost), across ${usedByLot.size} lot(s)`,
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
  Array<
    T & {
      expirationDate: string | null;
      receivedDate: string | null;
      enteredUnitCost: number | null;
      lotSource: FoodReadyLotSource | null;
      quantityWarning: string | null;
    }
  >
> {
  const enteredLotCosts = await loadFoodReadyLotCosts(companyId);
  const lotCodes = [...new Set(snapshotRows.map((row) => String(row.lot || '').trim()).filter(Boolean))];
  type LotDates = {
    quantity: number;
    received: number;
    expirationDate: string | null;
    receivedDate: string | null;
    source: FoodReadyLotSource | null;
  };
  const lotDates = new Map<string, LotDates[]>();
  const records = await loadClassificationRecords(companyId, LOT_ENDPOINTS);
  const { finishedGoodsItems, recipeIngredients } = classifyFoodReadyItems(records);
  if (lotCodes.length) {
    const wanted = new Set(lotCodes);
    for (const record of records) {
      const dims = (record.dimensions || {}) as Record<string, unknown>;
      if (dims.sourceObject === ITEM_PACKAGING_ENDPOINT) continue;
      const lotCode = String(dims.lotCode || '').trim();
      if (!wanted.has(lotCode)) continue;
      const measures = (record.measures || {}) as Record<string, unknown>;
      lotDates.set(lotCode, [
        ...(lotDates.get(lotCode) || []),
        {
          quantity: Number(measures.quantityInHand || 0),
          received: Number(measures.totalQuantityReceived ?? measures.totalQtyProducedPerBatch ?? 0) || 0,
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
      lotSource: finishedGoodsItems.has(String(row.itemId || '').trim())
        ? 'finished_goods'
        : match?.source === 'finished_goods' && recipeIngredients.has(String(row.itemId || '').trim())
          ? 'wip'
          : (match?.source ?? null),
      quantityWarning: match ? lotQuantityWarning(match.quantity, match.received) : null,
    };
  });
}

async function loadClassificationRecords(companyId: string, extraEndpoints: readonly string[] = []) {
  return prisma.operationalRecord.findMany({
    where: {
      companyId,
      dataMode: 'LIVE',
      dataset: { sourceCode: FOODREADY_SOURCE_CODE },
      OR: [...new Set([...extraEndpoints, FINISHED_GOODS_LOTS_ENDPOINT, ITEM_PACKAGING_ENDPOINT, FOODREADY_RECIPE_INPUTS_ENDPOINT])].map((endpoint) => ({
        dimensions: { path: ['sourceObject'], equals: endpoint },
      })),
    },
    select: { dimensions: true, measures: true },
  });
}

/**
 * Finished goods are items made by a production batch, tied to items the same way the snapshot ties
 * finished-goods lots; produced items that go into another recipe (e.g. sugar mixes) are ingredients.
 */
function classifyFoodReadyItems(records: Array<{ dimensions: unknown }>) {
  const packagingItem = new Map<string, string>();
  for (const record of records) {
    const dims = (record.dimensions || {}) as Dimensions;
    if (text(dims, 'sourceObject') === ITEM_PACKAGING_ENDPOINT) packagingItem.set(text(dims, 'id'), foodReadyRef(dims, 'inventoryItem'));
  }
  const recipeIngredients = new Set<string>();
  for (const record of records) {
    const dims = (record.dimensions || {}) as Dimensions;
    if (text(dims, 'sourceObject') !== FOODREADY_RECIPE_INPUTS_ENDPOINT) continue;
    const itemId = foodReadyRef(dims, 'inventoryItem') || packagingItem.get(foodReadyRef(dims, 'itemPackaging')) || '';
    if (itemId) recipeIngredients.add(itemId);
  }
  const finishedGoodsItems = new Set<string>();
  for (const record of records) {
    const dims = (record.dimensions || {}) as Dimensions;
    if (text(dims, 'sourceObject') !== FINISHED_GOODS_LOTS_ENDPOINT) continue;
    const itemId = packagingItem.get(foodReadyRef(dims, 'itemPackaging'));
    if (itemId && !recipeIngredients.has(itemId)) finishedGoodsItems.add(itemId);
  }
  return { finishedGoodsItems, recipeIngredients };
}

/**
 * Daily FoodReady inventory value split into finished goods and raw materials (packaging and WIP
 * included), from the stored daily snapshots; items are classified as they are today.
 */
export async function foodReadyInventoryValueByType(companyId: string, start: Date, end: Date): Promise<Map<string, { finished: number; raw: number }>> {
  const { finishedGoodsItems } = classifyFoodReadyItems(await loadClassificationRecords(companyId));
  const rows = await prisma.inventorySnapshot.groupBy({
    by: ['snapshotDate', 'itemId'],
    where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    _sum: { assetValue: true },
  });
  const byDay = new Map<string, { finished: number; raw: number }>();
  for (const row of rows) {
    const day = row.snapshotDate.toISOString().slice(0, 10);
    const totals = byDay.get(day) || { finished: 0, raw: 0 };
    totals[finishedGoodsItems.has(String(row.itemId || '')) ? 'finished' : 'raw'] += Number(row._sum.assetValue || 0);
    byDay.set(day, totals);
  }
  return byDay;
}

/** Lots this large are not plausible for one bakery lot; they are flagged, never changed. */
const SUSPECT_LOT_QUANTITY = 1_000_000;

function lotQuantityWarning(inHand: number, received: number): string | null {
  if (received > 0 && inHand > received + 0.0001) {
    return `FoodReady shows ${formatQty(inHand)} in hand but only ${formatQty(received)} received`;
  }
  if (inHand >= SUSPECT_LOT_QUANTITY || received >= SUSPECT_LOT_QUANTITY) {
    return `FoodReady shows ${formatQty(received)} received and ${formatQty(inHand)} in hand on this lot; check it in FoodReady`;
  }
  return null;
}
