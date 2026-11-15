import {
  DEFAULT_FOODREADY_DATA_DOMAINS,
  FOODREADY_LABEL,
  FOODREADY_SOURCE_CODE,
  foodReadyApiRequest,
  foodReadyCredentialsFromConnection,
  foodReadyEndpointForDomain,
  FoodReadyRateLimitError,
  withDefaultFoodReadyDomains,
  type FoodReadyCredentials,
} from '@/lib/foodready';
import { randomUUID } from 'crypto';
import { after } from 'next/server';
import prisma from '@/lib/prisma';
import { formatEstDate } from '@/lib/time/eastern';
import { writeOperationalSourceOutput } from '../store';
import type { OperationalDatasetSchema, OperationalRecordInput, OperationalSourceAdapter, OperationalSourceOutput, OperationalSyncWindow } from '../types';
import { FULL_WINDOW, asRecord, readConnectionMetadata } from './common';
import {
  FOODREADY_LOT_USAGE_KEY,
  FOODREADY_LOT_USAGE_STATUS_KEY,
  FOODREADY_PURCHASE_ORDER_LINES_KEY,
  FOODREADY_RECIPE_INPUTS_ENDPOINT,
  FOODREADY_RECIPE_INPUTS_KEY,
  FOODREADY_PURCHASED_LOTS_ENDPOINT,
  foodReadyRef,
  listFoodReadyPurchaseOrderLineIds,
  setFoodReadyRecipeInputsFailure,
  setFoodReadySkippedDomains,
  writeFoodReadyInventorySnapshot,
} from '../foodready-inventory';

type DataDomain = { dataDomain: string; sourceObject: string; enabled: boolean };
type FlatRecord = Record<string, string | number | boolean>;

const SENSITIVE_FIELD = /(address|contact|email|phone|password|secret|token|ssn|bank|signature|driver|receiver|By$)/i;
const NOISE_FIELD = /^(organization|organizationId|firebase_id|planFirebaseId|systemOwned|protected)$/;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
/** FoodReady sends many timestamps as epoch milliseconds; these keys are stored as ISO strings. */
const TIMESTAMP_FIELD = /(Date|On|At)$/;
/** Fields kept from a populated reference (uom, inventoryType, item, location, ...). */
const REFERENCE_SUBFIELDS = ['_id', 'id', 'name', 'code', 'type', 'itemName', 'itemCode'];
const MAX_FIELDS = 100;
const PAGE_SIZE = 200;
const MAX_PAGES = 100;
/** Pause between page requests so a full pull stays under FoodReady's rate limit. */
const PAGE_DELAY_MS = 250;
/** Purchase-order line lookups per sync stop after this long; the rest are looked up on the next sync. */
const PO_LINE_LOOKUP_BUDGET_MS = 90_000;
/** Lookups also stop this long after the sync started, leaving room to store the run within the 300s function limit. */
const PO_LINE_LOOKUP_CUTOFF_MS = 200_000;
const PO_LINE_LOOKUP_CONCURRENCY = 2;
/** Domain pulls stop this long after the sync started; a domain cut off keeps its stored rows until the next sync. */
const DOMAIN_PULL_CUTOFF_MS = 170_000;
const PURCHASE_ORDER_LINES_ENDPOINT = '/api/purchaseOrdersItems/search';
/** The background lot usage pull stops this long after it starts, inside its own 300s function limit. */
const LOT_USAGE_BUDGET_MS = 230_000;
/** Safety cap on chained requests for one pull. */
const LOT_USAGE_MAX_STEPS = 25;
export const FOODREADY_LOT_USAGE_PULL_PATH = '/api/admin/foodready-lot-usage';
const LOT_USAGE_ENDPOINTS = [
  ['production', '/api/moBatchInput/search'],
  ['sales', '/api/salesOrderItems'],
  ['sales_order', '/api/salesOrders'],
] as const;

const RECIPE_INPUTS_SCHEMA: OperationalDatasetSchema = {
  key: FOODREADY_RECIPE_INPUTS_KEY,
  label: 'FoodReady Recipe Inputs',
  description: 'Ingredients and packaging on each FoodReady recipe (bill of materials). Current state, refreshed whenever a sync includes today.',
  grain: 'point_in_time',
  dimensions: [{ name: 'sourceObject' }, { name: 'bom' }, { name: 'inventoryItem' }, { name: 'itemPackaging' }, { name: 'supplierItem' }],
  measures: [{ name: 'recordCount', description: 'Always 1; sum to count records.' }, { name: 'inputQuantity' }],
};

const LOT_USAGE_STATUS_SCHEMA: OperationalDatasetSchema = {
  key: FOODREADY_LOT_USAGE_STATUS_KEY,
  label: 'FoodReady Lot Usage Pull Status',
  description: 'Outcome of the latest background FoodReady lot usage pull.',
  grain: 'point_in_time',
  dimensions: [{ name: 'status' }, { name: 'message' }, { name: 'finishedAt' }],
  measures: [{ name: 'recordCount', description: 'Always 1.' }, { name: 'rows' }],
};

const LOT_USAGE_SCHEMA: OperationalDatasetSchema = {
  key: FOODREADY_LOT_USAGE_KEY,
  label: 'FoodReady Lot Usage',
  description: 'Quantity used from each FoodReady lot: production batch inputs and sales order line allocations, all dates. Refreshed in full whenever a sync includes today.',
  grain: 'point_in_time',
  dimensions: [
    { name: 'usageType', description: 'production or sales (lot allocations), sales_line (ordered quantity) or sales_order (status and ship date)' },
    { name: 'recordId' },
    { name: 'status' },
    { name: 'shippedOn' },
    { name: 'soId' },
    { name: 'purchaseOrderItemLot' },
    { name: 'moBatchOutput' },
    { name: 'supplierItem' },
    { name: 'itemPackaging' },
    { name: 'uom' },
    { name: 'mo' },
    { name: 'moBatch' },
    { name: 'so' },
    { name: 'inventoryItem' },
  ],
  measures: [
    { name: 'recordCount', description: 'Always 1; sum to count records.' },
    { name: 'qtyUsed' },
    { name: 'unitCost' },
    { name: 'orderQty' },
  ],
};

const PURCHASE_ORDER_LINES_SCHEMA: OperationalDatasetSchema = {
  key: FOODREADY_PURCHASE_ORDER_LINES_KEY,
  label: 'FoodReady Purchase Order Lines',
  description: 'FoodReady purchase-order lines behind purchased lots: the supplier item ordered and its unit cost. Each line is looked up once and kept.',
  grain: 'point_in_time',
  dimensions: [{ name: 'po' }, { name: 'supplierItem' }, { name: 'status' }, { name: 'uom' }, { name: 'costSkuType' }, { name: 'skuType' }, { name: 'unitType' }],
  measures: [
    { name: 'recordCount', description: 'Always 1; sum to count records.' },
    { name: 'unitCost' },
    { name: 'displayUnitCost' },
    { name: 'unitSize' },
    { name: 'noOfUnits' },
    { name: 'totalOrderQuantity' },
  ],
};

/**
 * Current-state endpoints: the full list as of the sync date, not history. Lot endpoints only
 * return lots with quantity in hand. Each sync that reaches today replaces the whole dataset.
 */
const CURRENT_STATE_QUERY: Record<string, Record<string, boolean>> = {
  '/api/inventoryItems/search': {},
  '/api/itemPackaging/search': {},
  '/api/bom/search': {},
  '/api/v2/suppliers/search': {},
  '/api/supplierItems/search': {},
  '/api/purchaseOrdersItemLots/search': { hasAvailableQtyInHand: true },
  '/api/wipItemLots/search': { hasQuantityInHand: true },
  '/api/moBatchOutput/search': { hasQuantityInHand: true },
};

/** The business date each history record describes, first match wins. */
const DATE_FIELDS_BY_ENDPOINT: Record<string, string[]> = {
  '/api/purchaseOrderReceiving/search': ['receivedOn', 'createdAt'],
  '/api/mo/search': ['completedOn', 'scheduledDate', 'requiredDate', 'createdAt'],
  '/api/moBatch/search': ['createdAt'],
  '/api/purchaseOrders/search': ['poCreatedOn', 'createdAt'],
  '/api/salesOrders': ['shippedOn', 'shipDateTime', 'requiredByDate', 'createdAt'],
};
const DEFAULT_DATE_FIELDS = ['createdAt'];

export function configuredFoodReadyDomains(metadata: Record<string, unknown>): DataDomain[] {
  const configured = asRecord(metadata.operationalSourceDataDomains)[FOODREADY_SOURCE_CODE];
  const saved = (Array.isArray(configured) ? configured : []).map((value) => {
    const row = asRecord(value);
    const dataDomain = String(row.dataDomain || '').trim();
    return { dataDomain, sourceObject: foodReadyEndpointForDomain(dataDomain, String(row.sourceObject || '')) || '', enabled: row.enabled !== false };
  });
  const rows = saved.length ? withDefaultFoodReadyDomains(saved) : [...DEFAULT_FOODREADY_DATA_DOMAINS];
  return rows.filter((row) => row.dataDomain && row.sourceObject && row.enabled);
}

function keyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'records';
}

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
  const data = asRecord(payload).data;
  return Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : [];
}

function storableKey(key: string): boolean {
  return SAFE_FIELD_NAME.test(key) && !SENSITIVE_FIELD.test(key) && !NOISE_FIELD.test(key);
}

function storableValue(key: string, value: unknown): string | number | boolean | null {
  if (typeof value === 'number' && TIMESTAMP_FIELD.test(key) && value > 1e11) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function referenceFieldName(parent: string, subfield: string): string {
  if (subfield === '_id' || subfield === 'id') return `${parent}Id`;
  if (subfield.toLowerCase().startsWith(parent.toLowerCase())) return subfield;
  return `${parent}${subfield[0].toUpperCase()}${subfield.slice(1)}`;
}

/** Top-level scalars plus the identifying fields of populated references; personal fields are dropped. */
function flattenRecord(record: Record<string, unknown>): FlatRecord {
  const flat: FlatRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (!storableKey(key)) continue;
    const stored = storableValue(key, value);
    if (stored !== null) flat[key] = stored;
  }
  const recordId = storableValue('id', record._id);
  if (recordId !== null && !('id' in flat)) flat.id = recordId;
  for (const [key, value] of Object.entries(record)) {
    if (!storableKey(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const subfield of REFERENCE_SUBFIELDS) {
      const name = referenceFieldName(key, subfield);
      const stored = storableValue(subfield, (value as Record<string, unknown>)[subfield]);
      if (stored !== null && !(name in flat) && SAFE_FIELD_NAME.test(name)) flat[name] = stored;
    }
  }
  return flat;
}

function schemaFor(domain: DataDomain, records: FlatRecord[], currentState: boolean): OperationalDatasetSchema {
  const fieldNames = [...new Set(records.flatMap((record) => Object.keys(record)))]
    .filter((field) => field !== 'sourceObject' && field !== 'recordCount')
    .slice(0, MAX_FIELDS);
  const isNumeric = (field: string) => typeof records.find((row) => row[field] !== undefined)?.[field] === 'number';
  return {
    key: `foodready.${keyPart(domain.dataDomain)}`,
    label: `FoodReady ${domain.dataDomain}`,
    description: `FoodReady ${domain.dataDomain} records from ${domain.sourceObject}${currentState ? ', current state as of the sync date' : ''}. Fields that can contain personal or credential data are excluded.`,
    grain: 'point_in_time',
    dimensions: [{ name: 'sourceObject' }, ...fieldNames.filter((field) => !isNumeric(field)).map((name) => ({ name }))],
    measures: [{ name: 'recordCount', description: 'Always 1; sum to count records.' }, ...fieldNames.filter(isNumeric).map((name) => ({ name }))],
  };
}

async function fetchAllFoodReadyRecords(
  credentials: FoodReadyCredentials,
  path: string,
  query: Record<string, boolean> = {},
  deadline = Number.POSITIVE_INFINITY,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (page > 0) await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    if (Date.now() > deadline) throw new Error(`${path} hit the sync time limit after ${all.length} record(s).`);
    const rows = rowsFromPayload(await foodReadyApiRequest<unknown>(credentials, path, { ...query, from: page * PAGE_SIZE, size: PAGE_SIZE }));
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
  return all;
}

/** An ID whether FoodReady sends the reference as a string or as the populated object. */
function refId(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  const record = asRecord(value);
  const id = record._id ?? record.id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

/**
 * Usage rows for one record: a sales order's status and ship date; a sales order line's ordered
 * quantity; and one row per lot allocation (lot drawn from and quantity used) on production inputs
 * and sales order lines.
 */
function lotUsageRows(usageType: string, record: Record<string, unknown>, today: string): OperationalRecordInput[] {
  const recordId = refId(record._id ?? record.id);
  if (!recordId) return [];
  const createdOn = new Date(String(record.createdAt ?? ''));
  const recordDate = Number.isNaN(createdOn.getTime()) ? today : formatEstDate(createdOn);
  if (usageType === 'sales_order') {
    const flat = flattenRecord(record);
    const shippedOn = flat.shippedOn ?? flat.shipDateTime;
    return [
      {
        date: recordDate,
        externalId: `sales_order|${recordId}`,
        dimensions: {
          usageType,
          recordId,
          status: typeof flat.status === 'string' ? flat.status : undefined,
          shippedOn: typeof shippedOn === 'string' ? shippedOn : undefined,
          soId: typeof flat.soId === 'string' || typeof flat.soId === 'number' ? String(flat.soId) : undefined,
        },
        measures: { recordCount: 1 },
      },
    ];
  }
  const lineRows: OperationalRecordInput[] =
    usageType === 'sales'
      ? [
          {
            date: recordDate,
            externalId: `sales_line|${recordId}`,
            dimensions: {
              usageType: 'sales_line',
              recordId,
              so: refId(record.so),
              inventoryItem: refId(record.inventoryItem),
              itemPackaging: refId(record.itemPackaging),
              uom: refId(record.uom),
            },
            measures: { recordCount: 1, orderQty: Number.isFinite(Number(record.orderQty)) ? Number(record.orderQty) : 0 },
          },
        ]
      : [];
  const allocations = Array.isArray(record.allocatedQty) ? record.allocatedQty : [];
  return lineRows.concat(allocations.flatMap((value, index) => {
    const allocation = asRecord(value);
    if (allocation.deleted === true || allocation.deletedAt) return [];
    const qtyUsed = Number(allocation.qtyUsed);
    const createdAt = new Date(String(allocation.createdAt ?? record.createdAt ?? ''));
    return [
      {
        date: Number.isNaN(createdAt.getTime()) ? today : formatEstDate(createdAt),
        externalId: `${usageType}|${recordId}|${refId(allocation._id) ?? index}`,
        dimensions: {
          usageType,
          recordId,
          purchaseOrderItemLot: refId(allocation.purchaseOrderItemLot),
          moBatchOutput: refId(allocation.moBatchOutput),
          supplierItem: refId(allocation.supplierItem),
          itemPackaging: refId(allocation.itemPackaging),
          uom: refId(allocation.uom),
          mo: refId(record.mo),
          moBatch: refId(record.moBatch),
          so: refId(record.so),
          inventoryItem: refId(record.inventoryItem),
        },
        measures: {
          recordCount: 1,
          qtyUsed: Number.isFinite(qtyUsed) ? qtyUsed : 0,
          ...(typeof allocation.unitCost === 'number' && Number.isFinite(allocation.unitCost) ? { unitCost: allocation.unitCost } : {}),
        },
      },
    ];
  }));
}

function purchaseOrderLineRow(id: string, line: FlatRecord, today: string): OperationalRecordInput {
  const number = (key: string) => (typeof line[key] === 'number' ? (line[key] as number) : undefined);
  const text = (key: string) => (typeof line[key] === 'string' ? (line[key] as string) : undefined);
  return {
    date: today,
    externalId: id,
    dimensions: {
      po: text('po') ?? text('poId'),
      supplierItem: text('supplierItem') ?? text('supplierItemId'),
      status: text('status'),
      uom: text('uom') ?? text('uomCode'),
      costSkuType: text('costSkuType'),
      skuType: text('skuType'),
      unitType: text('unitType'),
    },
    measures: {
      recordCount: 1,
      unitCost: number('unitCost'),
      displayUnitCost: number('displayUnitCost'),
      unitSize: number('unitSize'),
      noOfUnits: number('noOfUnits'),
      totalOrderQuantity: number('totalOrderQuantity'),
    },
  };
}

/**
 * Purchase-order lines behind purchased lots. All lines come from one paged search; lines it does
 * not return (or every line, if it fails) are looked up one at a time until the time budget runs out.
 */
async function fetchPurchaseOrderLines(
  credentials: FoodReadyCredentials,
  companyId: string,
  poItemIds: string[],
  today: string,
  syncStartedAt: number,
): Promise<OperationalRecordInput[]> {
  const rows: OperationalRecordInput[] = [];
  try {
    const lines = (await fetchAllFoodReadyRecords(credentials, PURCHASE_ORDER_LINES_ENDPOINT, {}, syncStartedAt + PO_LINE_LOOKUP_CUTOFF_MS)).map(flattenRecord);
    rows.push(...lines.filter((line) => typeof line.id === 'string' && line.id).map((line) => purchaseOrderLineRow(String(line.id), line, today)));
  } catch {
    // Single-line lookups below cover every line.
  }

  const known = await listFoodReadyPurchaseOrderLineIds(companyId);
  rows.forEach((row) => known.add(row.externalId));
  const queue = [...new Set(poItemIds)].filter((id) => id && !known.has(id));
  const deadline = Math.min(Date.now() + PO_LINE_LOOKUP_BUDGET_MS, syncStartedAt + PO_LINE_LOOKUP_CUTOFF_MS);
  let rateLimited = false;
  const worker = async () => {
    while (queue.length && !rateLimited && Date.now() < deadline) {
      const id = queue.shift()!;
      let line: FlatRecord;
      try {
        const payload = asRecord(await foodReadyApiRequest<unknown>(credentials, `/api/purchaseOrdersItems/${encodeURIComponent(id)}`, {}, { maxRetries: 1 }));
        line = flattenRecord(payload.data && typeof payload.data === 'object' ? asRecord(payload.data) : payload);
      } catch (error) {
        if (error instanceof FoodReadyRateLimitError) rateLimited = true;
        continue;
      }
      rows.push(purchaseOrderLineRow(id, line, today));
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }
  };
  await Promise.all(Array.from({ length: PO_LINE_LOOKUP_CONCURRENCY }, worker));
  return rows;
}

function recordDate(endpoint: string, record: FlatRecord, today: string): string {
  for (const field of DATE_FIELDS_BY_ENDPOINT[endpoint] ?? DEFAULT_DATE_FIELDS) {
    const value = record[field];
    const parsed = typeof value === 'string' ? new Date(value) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return formatEstDate(parsed);
  }
  return today;
}

export async function syncFoodReady(
  { companyId, window }: { companyId: string; window: OperationalSyncWindow },
  options: { resolvePurchaseOrderLines?: boolean } = {},
): Promise<OperationalSourceOutput> {
  const syncStartedAt = Date.now();
  const { connection, metadata } = await readConnectionMetadata(companyId, 'FOODREADY', FOODREADY_SOURCE_CODE);
  const credentials = connection?.status === 'ACTIVE' ? foodReadyCredentialsFromConnection(connection) : null;
  if (!credentials) throw new Error('FoodReady is not connected for this company.');

  const today = formatEstDate();
  const output: OperationalSourceOutput = {};
  // Recipe inputs are a small list; pulling them first keeps the slower domain pulls from crowding them out.
  if (window.endDate >= today) {
    try {
      const inputs = (await fetchAllFoodReadyRecords(credentials, FOODREADY_RECIPE_INPUTS_ENDPOINT))
        .filter((raw) => raw.deleted !== true && !raw.deletedAt)
        .map(flattenRecord);
      output[FOODREADY_RECIPE_INPUTS_KEY] = {
        schema: RECIPE_INPUTS_SCHEMA,
        replaceWindow: true,
        window: FULL_WINDOW,
        rows: inputs.map((record, index) => ({
          date: today,
          externalId: String(record.id ?? index),
          dimensions: {
            sourceObject: FOODREADY_RECIPE_INPUTS_ENDPOINT,
            bom: String(record.bom ?? record.bomId ?? '') || undefined,
            inventoryItem: String(record.inventoryItem ?? record.inventoryItemId ?? '') || undefined,
            itemPackaging: String(record.itemPackaging ?? record.itemPackagingId ?? '') || undefined,
            supplierItem: String(record.supplierItem ?? record.supplierItemId ?? '') || undefined,
          },
          measures: { recordCount: 1, ...(typeof record.inputQuantity === 'number' ? { inputQuantity: record.inputQuantity } : {}) },
        })),
      };
    } catch (error) {
      setFoodReadyRecipeInputsFailure(companyId, error instanceof Error ? error.message : String(error));
    }
  }
  const domainDeadline = syncStartedAt + DOMAIN_PULL_CUTOFF_MS;
  const skipped: string[] = [];
  for (const domain of configuredFoodReadyDomains(metadata)) {
    const currentStateQuery = CURRENT_STATE_QUERY[domain.sourceObject];
    const currentState = Boolean(currentStateQuery);
    if (currentState && window.endDate < today) continue;
    let fetched: Record<string, unknown>[];
    try {
      fetched = await fetchAllFoodReadyRecords(credentials, domain.sourceObject, currentStateQuery, domainDeadline);
    } catch (error) {
      if (Date.now() <= domainDeadline) throw error;
      skipped.push(domain.sourceObject);
      continue;
    }
    const records = fetched
      .map((raw) => ({ raw, record: flattenRecord(raw) }))
      .map((entry) => ({ ...entry, date: currentState ? today : recordDate(domain.sourceObject, entry.record, today) }))
      .filter(({ date }) => currentState || (date >= window.startDate && date <= window.endDate));
    const schema = schemaFor(domain, records.map(({ record }) => record), currentState);
    output[schema.key] = {
      schema,
      replaceWindow: true,
      window: currentState ? FULL_WINDOW : window,
      rows: records.map(({ raw, record, date }, index) => {
        const dimensions: Record<string, string | number | boolean | null> = { sourceObject: domain.sourceObject };
        const measures: Record<string, number> = { recordCount: 1 };
        Object.entries(record).forEach(([key, value]) => {
          if (typeof value === 'number') measures[key] = value;
          else dimensions[key] = value;
        });
        const identity = String(raw._id ?? raw.id ?? index);
        return { date, externalId: `${domain.sourceObject}|${identity}`, dimensions, measures };
      }),
    };
  }

  const purchasedLotIds = Object.values(output)
    .flatMap((dataset) => dataset.rows)
    .filter((row) => row.dimensions?.sourceObject === FOODREADY_PURCHASED_LOTS_ENDPOINT)
    .map((row) => foodReadyRef(row.dimensions, 'poItem'));
  if (options.resolvePurchaseOrderLines !== false && purchasedLotIds.length) {
    const lines = await fetchPurchaseOrderLines(credentials, companyId, purchasedLotIds, today, syncStartedAt);
    if (lines.length) output[FOODREADY_PURCHASE_ORDER_LINES_KEY] = { schema: PURCHASE_ORDER_LINES_SCHEMA, rows: lines };
  }
  setFoodReadySkippedDomains(companyId, skipped);
  return output;
}

/** Where a lot usage pull resumes when it continues in a new request. */
export type FoodReadyLotUsageCursor = {
  runId: string;
  endpointIndex: number;
  from: number;
  records: number;
  rows: number;
  step: number;
  startedAt: string;
};

export type FoodReadyLotUsageResult = { ok: boolean; done: boolean; message: string; next?: FoodReadyLotUsageCursor };

/** A chained pull writes a 'running' status at each hand-off; one written in the last few minutes is still going. */
async function lotUsagePullRunning(companyId: string): Promise<boolean> {
  const record = await prisma.operationalRecord.findFirst({
    where: { companyId, externalId: 'latest', dataset: { companyId, datasetKey: FOODREADY_LOT_USAGE_STATUS_KEY } },
    select: { dimensions: true, updatedAt: true },
  });
  const dims = asRecord(record?.dimensions);
  return dims.status === 'running' && Boolean(record && Date.now() - record.updatedAt.getTime() < 6 * 60_000);
}

async function writeLotUsageStatus(companyId: string, status: 'ok' | 'running' | 'failed', message: string, rows: number) {
  await writeOperationalSourceOutput({
    companyId,
    adapter: FOODREADY_ADAPTER,
    mode: 'LIVE',
    window: FULL_WINDOW,
    output: {
      [FOODREADY_LOT_USAGE_STATUS_KEY]: {
        schema: LOT_USAGE_STATUS_SCHEMA,
        replaceWindow: true,
        window: FULL_WINDOW,
        rows: [
          {
            date: formatEstDate(),
            externalId: 'latest',
            dimensions: { status, message: message.slice(0, 900), finishedAt: new Date().toISOString() },
            measures: { recordCount: 1, rows },
          },
        ],
      },
    },
  });
}

/**
 * Pull production input and sales order lot allocations (all dates) into FoodReady Lot Usage. Rows
 * are saved page by page; when this request's time runs out it returns a cursor so a new request
 * can continue. The last step removes rows that FoodReady no longer returns.
 */
export async function pullFoodReadyLotUsage(companyId: string, cursor?: FoodReadyLotUsageCursor): Promise<FoodReadyLotUsageResult> {
  const deadline = Date.now() + LOT_USAGE_BUDGET_MS;
  const { connection } = await readConnectionMetadata(companyId, 'FOODREADY', FOODREADY_SOURCE_CODE);
  const credentials = connection?.status === 'ACTIVE' ? foodReadyCredentialsFromConnection(connection) : null;
  if (!credentials) return { ok: false, done: true, message: 'FoodReady is not connected for this company.' };

  if (!cursor && (await lotUsagePullRunning(companyId))) {
    return { ok: true, done: true, message: 'a lot usage pull is already running; not starting another' };
  }
  const today = formatEstDate();
  const state: FoodReadyLotUsageCursor = cursor ?? {
    runId: randomUUID(),
    endpointIndex: 0,
    from: 0,
    records: 0,
    rows: 0,
    step: 1,
    startedAt: new Date().toISOString(),
  };
  if (!cursor) await writeLotUsageStatus(companyId, 'running', 'started; reading production inputs', 0);
  if (state.step > LOT_USAGE_MAX_STEPS) {
    const message = `stopped after ${LOT_USAGE_MAX_STEPS} requests with ${state.records} record(s) read; FoodReady has more usage than one pull can cover`;
    await writeLotUsageStatus(companyId, 'failed', message, state.rows);
    return { ok: false, done: true, message };
  }
  const save = async (rows: OperationalRecordInput[]) => {
    if (!rows.length) return;
    await writeOperationalSourceOutput({
      companyId,
      adapter: FOODREADY_ADAPTER,
      mode: 'LIVE',
      window: FULL_WINDOW,
      runId: state.runId,
      output: { [FOODREADY_LOT_USAGE_KEY]: { schema: LOT_USAGE_SCHEMA, rows } },
    });
  };

  let pending: OperationalRecordInput[] = [];
  try {
    while (state.endpointIndex < LOT_USAGE_ENDPOINTS.length) {
      if (Date.now() > deadline) {
        state.rows += pending.length;
        await save(pending);
        const next = { ...state, step: state.step + 1 };
        const message = `still running: ${state.records} record(s) read so far, continuing in request ${next.step}`;
        await writeLotUsageStatus(companyId, 'running', message, state.rows);
        return { ok: true, done: false, message, next };
      }
      const [usageType, endpoint] = LOT_USAGE_ENDPOINTS[state.endpointIndex];
      const page = rowsFromPayload(await foodReadyApiRequest<unknown>(credentials, endpoint, { from: state.from, size: PAGE_SIZE }));
      for (const record of page) pending.push(...lotUsageRows(usageType, record, today));
      state.records += page.length;
      state.from += page.length;
      if (page.length < PAGE_SIZE) {
        state.endpointIndex += 1;
        state.from = 0;
      }
      if (pending.length >= 2000) {
        state.rows += pending.length;
        await save(pending);
        pending = [];
      }
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }
    state.rows += pending.length;
    await save(pending);
  } catch (error) {
    const message = `failed after ${state.records} record(s) on ${LOT_USAGE_ENDPOINTS[state.endpointIndex]?.[1] ?? 'unknown endpoint'} (request ${state.step}): ${error instanceof Error ? error.message : String(error)}`;
    await writeLotUsageStatus(companyId, 'failed', message, state.rows);
    return { ok: false, done: true, message };
  }

  const dataset = await prisma.operationalDataset.findUnique({
    where: { companyId_datasetKey: { companyId, datasetKey: FOODREADY_LOT_USAGE_KEY } },
    select: { id: true },
  });
  if (dataset) {
    await prisma.operationalRecord.deleteMany({ where: { companyId, datasetId: dataset.id, NOT: { sourceRunId: state.runId } } });
    await writeOperationalSourceOutput({
      companyId,
      adapter: FOODREADY_ADAPTER,
      mode: 'LIVE',
      window: FULL_WINDOW,
      runId: state.runId,
      output: { [FOODREADY_LOT_USAGE_KEY]: { schema: LOT_USAGE_SCHEMA, rows: [] } },
    });
  }
  const minutes = Math.max(1, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 60_000));
  const message = `${state.rows} usage row(s) from ${state.records} production input, sales order line and sales order record(s) in ${state.step} request(s), about ${minutes} min`;
  await writeLotUsageStatus(companyId, 'ok', message, state.rows);
  return { ok: true, done: true, message };
}

function appBaseUrl(): string {
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.WORKER_BASE_URL, process.env.VERCEL_URL]) {
    const candidate = String(value || '').trim().replace(/\/+$/, '');
    if (candidate) return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  }
  return '';
}

/** Start (or continue, with a cursor) the lot usage pull in its own function invocation once this request has responded. */
export function scheduleFoodReadyLotUsagePull(companyId: string, cursor?: FoodReadyLotUsageCursor, originOverride?: string): string {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const origin = originOverride || appBaseUrl();
  if (!cronSecret || !origin) return 'lot usage pull not started (CRON_SECRET or app base URL missing)';
  try {
    after(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        await fetch(new URL(FOODREADY_LOT_USAGE_PULL_PATH, origin), {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', 'x-cron-secret': cronSecret },
          body: JSON.stringify({ companyId, cursor }),
        });
      } catch (error) {
        // An abort only means this request stopped waiting; the pull keeps running in its own invocation.
        if (!(error instanceof Error && error.name === 'AbortError')) console.warn('[foodready] lot usage pull did not start:', error);
      } finally {
        clearTimeout(timeout);
      }
    });
    return 'lot usage pull started in the background; its results show in the next sync message';
  } catch {
    return 'lot usage pull not started (no request context)';
  }
}

export const FOODREADY_ADAPTER: OperationalSourceAdapter = {
  sourceCode: FOODREADY_SOURCE_CODE,
  provider: 'FOODREADY',
  label: FOODREADY_LABEL,
  datasetPrefix: 'foodready',
  history: 'range',
  historyNote: 'Each FoodReady sync stores the records dated inside the sync window (scheduled syncs re-pull the Overlap Days). Inventory on hand, lots in hand, items, recipes, suppliers and supplier items are current-state lists, refreshed whenever a sync includes today. Recipe inputs are pulled on those syncs too, and lot usage (production inputs and sales order allocations, all dates) is pulled in the background right after them.',
  defaultHistoryDays: 365,
  dynamicDatasets: true,
  datasets: [],
  sync: (context) => syncFoodReady(context),
  afterLiveWrite: async (companyId, output) => {
    const note = await writeFoodReadyInventorySnapshot(companyId, output);
    if (!output[FOODREADY_RECIPE_INPUTS_KEY] && !Object.values(output).some((dataset) => dataset.window === FULL_WINDOW)) return note;
    return `${note}; ${scheduleFoodReadyLotUsagePull(companyId)}`;
  },
};
