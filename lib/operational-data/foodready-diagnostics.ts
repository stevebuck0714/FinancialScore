import prisma from '@/lib/prisma';
import { FOODREADY_SOURCE_CODE, foodReadyApiRequest, type FoodReadyCredentials } from '@/lib/foodready';
import { formatEstDateTime } from '@/lib/time/eastern';
import { asRecord } from './sources/common';
import {
  CURRENT_STATE_QUERY,
  MAX_PAGES,
  PAGE_SIZE,
  PURCHASE_ORDER_LINES_ENDPOINT,
  configuredFoodReadyDomains,
  rowsFromPayload,
} from './sources/foodready';
import {
  FOODREADY_PURCHASE_ORDER_LINES_KEY,
  FOODREADY_PURCHASED_LOTS_ENDPOINT,
  FOODREADY_RECIPE_INPUTS_ENDPOINT,
  foodReadyRef,
} from './foodready-inventory';
import type { OperationalRecordInput } from './types';

/** FoodReady counting stops this long after the diagnostic starts, inside the 300s function limit. */
const COUNT_BUDGET_MS = 200_000;
const PAGE_DELAY_MS = 250;
const MAX_LISTED = 200;

type EndpointCount = {
  dataDomain: string;
  endpoint: string;
  currentState: boolean;
  foodReady: number | null;
  foodReadyComplete: boolean;
  stored: number;
  error?: string;
};

/** FoodReady's total for one endpoint, read from the response when it sends one, otherwise counted page by page. */
async function countFoodReadyRecords(
  credentials: FoodReadyCredentials,
  endpoint: string,
  query: Record<string, boolean>,
  deadline: number,
): Promise<{ count: number; complete: boolean }> {
  const first = await foodReadyApiRequest<unknown>(credentials, endpoint, { ...query, from: 0, size: 1 });
  const body = asRecord(first);
  const reported = [body.total, body.totalCount, body.count, body.totalRecords, asRecord(body.meta).total, asRecord(body.pagination).total]
    .map(Number)
    .find((value) => Number.isFinite(value) && value >= 0);
  if (reported !== undefined) return { count: reported, complete: true };
  let count = 0;
  for (let page = 0; ; page += 1) {
    if (Date.now() > deadline) return { count, complete: false };
    if (page > 0) await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    const rows = rowsFromPayload(await foodReadyApiRequest<unknown>(credentials, endpoint, { ...query, from: page * PAGE_SIZE, size: PAGE_SIZE }));
    count += rows.length;
    if (rows.length < PAGE_SIZE) return { count, complete: true };
  }
}

const COST_SAMPLE_ENDPOINTS = [
  { label: 'Purchase Order Lines', endpoint: PURCHASE_ORDER_LINES_ENDPOINT },
  { label: 'Supplier Items', endpoint: '/api/supplierItems/search' },
  { label: 'Items, Ingredients & Units', endpoint: '/api/itemPackaging/search' },
  { label: 'Finished Goods Lots', endpoint: '/api/moBatchOutput/search' },
];
const COST_FIELD = /(cost|price|amount|value)/i;

/**
 * What FoodReady actually sends in cost fields on one page of each cost-bearing endpoint: how many
 * records carry a positive number, zero, text, another shape, or nothing, plus every cost-like key seen.
 */
async function sampleFoodReadyCostFields(credentials: FoodReadyCredentials) {
  const samples = [];
  for (const target of COST_SAMPLE_ENDPOINTS) {
    try {
      const rows = rowsFromPayload(
        await foodReadyApiRequest<unknown>(credentials, target.endpoint, { ...(CURRENT_STATE_QUERY[target.endpoint] || {}), from: 0, size: PAGE_SIZE }),
      );
      const fields = new Map<string, { positive: number; zero: number; text: number; other: number; examples: string[] }>();
      for (const row of rows) {
        for (const [key, value] of Object.entries(row)) {
          if (!COST_FIELD.test(key)) continue;
          const tally = fields.get(key) || { positive: 0, zero: 0, text: 0, other: 0, examples: [] };
          if (typeof value === 'number') tally[value > 0 ? 'positive' : 'zero'] += 1;
          else if (typeof value === 'string') tally.text += 1;
          else tally.other += 1;
          if (typeof value !== 'number' && value !== null && value !== undefined && tally.examples.length < 3) {
            tally.examples.push(JSON.stringify(value).slice(0, 80));
          }
          fields.set(key, tally);
        }
      }
      samples.push({ ...target, records: rows.length, fields: Object.fromEntries(fields) });
    } catch (error) {
      samples.push({ ...target, records: 0, fields: {}, error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
  }
  return samples;
}

async function storedCountsBySourceObject(companyId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ sourceObject: string | null; count: bigint }>>`
    SELECT r."dimensions"->>'sourceObject' AS "sourceObject", COUNT(*) AS "count"
    FROM "OperationalRecord" r
    JOIN "OperationalDataset" d ON d."id" = r."datasetId"
    WHERE d."companyId" = ${companyId} AND d."sourceCode" = ${FOODREADY_SOURCE_CODE} AND r."dataMode" = 'LIVE'
    GROUP BY 1
  `;
  return new Map(rows.filter((row) => row.sourceObject).map((row) => [String(row.sourceObject), Number(row.count)]));
}

async function storedRows(companyId: string, endpoint: string) {
  return prisma.operationalRecord.findMany({
    where: { companyId, dataMode: 'LIVE', dataset: { sourceCode: FOODREADY_SOURCE_CODE }, dimensions: { path: ['sourceObject'], equals: endpoint } },
    select: { externalId: true, dimensions: true, measures: true },
  });
}

function ref(dimensions: Record<string, unknown>, field: string): string {
  return foodReadyRef(dimensions as OperationalRecordInput['dimensions'], field);
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Read-only check of where FoodReady raw material costs drop out: stored versus FoodReady record
 * counts per endpoint, purchased lots the inventory snapshot skips because they cannot be tied to
 * a purchase-order line and item, and lots in the latest snapshot valued at $0. Nothing is written.
 */
export async function diagnoseFoodReadyCosts(companyId: string, credentials: FoodReadyCredentials, metadata: Record<string, unknown>) {
  const deadline = Date.now() + COUNT_BUDGET_MS;
  const stored = await storedCountsBySourceObject(companyId);
  const poLineDataset = await prisma.operationalDataset.findUnique({
    where: { companyId_datasetKey: { companyId, datasetKey: FOODREADY_PURCHASE_ORDER_LINES_KEY } },
    select: { id: true },
  });
  const poLines = poLineDataset
    ? await prisma.operationalRecord.findMany({ where: { datasetId: poLineDataset.id, dataMode: 'LIVE' }, select: { externalId: true, dimensions: true } })
    : [];

  const targets = [
    ...configuredFoodReadyDomains(metadata).map((domain) => ({ dataDomain: domain.dataDomain, endpoint: domain.sourceObject })),
    { dataDomain: 'Recipe Inputs', endpoint: FOODREADY_RECIPE_INPUTS_ENDPOINT },
    { dataDomain: 'Purchase Order Lines', endpoint: PURCHASE_ORDER_LINES_ENDPOINT },
  ];
  const endpoints: EndpointCount[] = [];
  for (const target of targets) {
    const query = CURRENT_STATE_QUERY[target.endpoint];
    const storedCount = target.endpoint === PURCHASE_ORDER_LINES_ENDPOINT ? poLines.length : stored.get(target.endpoint) || 0;
    const row: EndpointCount = { ...target, currentState: Boolean(query), foodReady: null, foodReadyComplete: false, stored: storedCount };
    if (Date.now() > deadline) {
      row.error = 'not counted: diagnostic time limit reached';
    } else {
      try {
        const counted = await countFoodReadyRecords(credentials, target.endpoint, query || {}, deadline);
        row.foodReady = counted.count;
        row.foodReadyComplete = counted.complete;
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      }
    }
    endpoints.push(row);
  }

  const costFields = await sampleFoodReadyCostFields(credentials);

  const supplierItems = new Map(
    (await storedRows(companyId, '/api/supplierItems/search')).map((row) => {
      const dims = asRecord(row.dimensions);
      return [text(dims.id), { itemId: ref(dims, 'item'), name: text(dims.itemName) || text(dims.name) || text(dims.supplierItemName) }];
    }),
  );
  const poLineById = new Map(poLines.map((line) => [line.externalId, asRecord(line.dimensions)]));
  const unlinkedReasons = { noPoItemOnLot: 0, poLineNotStored: 0, supplierItemNotStored: 0, supplierItemWithoutItem: 0 };
  const unlinkedLots: Array<Record<string, string | number>> = [];
  let purchasedLotsInHand = 0;
  for (const lot of await storedRows(companyId, FOODREADY_PURCHASED_LOTS_ENDPOINT)) {
    const dims = asRecord(lot.dimensions);
    const measures = asRecord(lot.measures);
    purchasedLotsInHand += 1;
    const poItem = ref(dims, 'poItem');
    const line = poItem ? poLineById.get(poItem) : undefined;
    const supplierItemId = text(line?.supplierItem) || text(line?.supplierItemId);
    const supplierItem = supplierItemId ? supplierItems.get(supplierItemId) : undefined;
    let reason: keyof typeof unlinkedReasons | null = null;
    if (!poItem) reason = 'noPoItemOnLot';
    else if (!line) reason = 'poLineNotStored';
    else if (!supplierItem) reason = 'supplierItemNotStored';
    else if (!supplierItem.itemId) reason = 'supplierItemWithoutItem';
    if (!reason) continue;
    unlinkedReasons[reason] += 1;
    if (unlinkedLots.length < MAX_LISTED) {
      unlinkedLots.push({
        reason,
        lotId: text(dims.id),
        lotCode: text(dims.lotCode),
        poItem,
        supplierItem: supplierItemId,
        supplierItemName: supplierItem?.name || '',
        quantityInHand: Number(measures.quantityInHand ?? 0),
        totalQuantityReceived: Number(measures.totalQuantityReceived ?? 0),
        receivedOn: text(dims.receivedOn) || text(dims.receivedDate) || text(dims.createdAt),
      });
    }
  }

  const latest = await prisma.inventorySnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  const zeroWhere = latest
    ? { companyId, frequency: 'daily', snapshotDate: latest.snapshotDate, NOT: { qtyOnHand: 0 }, OR: [{ avgCost: null }, { assetValue: 0 }] }
    : null;
  const [snapshotRows, zeroCostCount, zeroCostLots] = latest && zeroWhere
    ? await Promise.all([
        prisma.inventorySnapshot.count({ where: { companyId, frequency: 'daily', snapshotDate: latest.snapshotDate } }),
        prisma.inventorySnapshot.count({ where: zeroWhere }),
        prisma.inventorySnapshot.findMany({
          where: zeroWhere,
          orderBy: [{ itemName: 'asc' }, { lot: 'asc' }],
          take: MAX_LISTED,
          select: { itemId: true, itemName: true, sku: true, lot: true, qtyOnHand: true },
        }),
      ])
    : [0, 0, []];

  const state = await prisma.operationalSourceState.findUnique({
    where: { companyId_sourceCode: { companyId, sourceCode: FOODREADY_SOURCE_CODE } },
    select: { lastLiveRunAt: true, lastRunStatus: true, lastRunMessage: true },
  });

  return {
    generatedAt: formatEstDateTime(new Date()),
    lastSync: state
      ? { at: state.lastLiveRunAt ? formatEstDateTime(state.lastLiveRunAt) : null, status: state.lastRunStatus, message: state.lastRunMessage }
      : null,
    syncRecordCap: MAX_PAGES * PAGE_SIZE,
    endpoints,
    costFields,
    purchasedLots: { inHand: purchasedLotsInHand, unlinked: unlinkedReasons, listed: unlinkedLots },
    zeroCostLots: {
      snapshotDate: latest ? latest.snapshotDate.toISOString().slice(0, 10) : null,
      snapshotRows,
      count: zeroCostCount,
      listed: zeroCostLots,
    },
  };
}

export type FoodReadyCostDiagnostic = Awaited<ReturnType<typeof diagnoseFoodReadyCosts>>;
