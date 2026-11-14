import {
  DEFAULT_FOODREADY_DATA_DOMAINS,
  FOODREADY_LABEL,
  FOODREADY_SOURCE_CODE,
  foodReadyApiRequest,
  foodReadyCredentialsFromConnection,
  foodReadyEndpointForDomain,
  withDefaultFoodReadyDomains,
  type FoodReadyCredentials,
} from '@/lib/foodready';
import { formatEstDate } from '@/lib/time/eastern';
import type { OperationalDatasetSchema, OperationalSourceAdapter, OperationalSourceOutput, OperationalSyncWindow } from '../types';
import { FULL_WINDOW, asRecord, readConnectionMetadata } from './common';

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
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (page > 0) await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    const rows = rowsFromPayload(await foodReadyApiRequest<unknown>(credentials, path, { ...query, from: page * PAGE_SIZE, size: PAGE_SIZE }));
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

function recordDate(endpoint: string, record: FlatRecord, today: string): string {
  for (const field of DATE_FIELDS_BY_ENDPOINT[endpoint] ?? DEFAULT_DATE_FIELDS) {
    const value = record[field];
    const parsed = typeof value === 'string' ? new Date(value) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return formatEstDate(parsed);
  }
  return today;
}

export async function syncFoodReady({ companyId, window }: { companyId: string; window: OperationalSyncWindow }): Promise<OperationalSourceOutput> {
  const { connection, metadata } = await readConnectionMetadata(companyId, 'FOODREADY', FOODREADY_SOURCE_CODE);
  const credentials = connection?.status === 'ACTIVE' ? foodReadyCredentialsFromConnection(connection) : null;
  if (!credentials) throw new Error('FoodReady is not connected for this company.');

  const today = formatEstDate();
  const output: OperationalSourceOutput = {};
  for (const domain of configuredFoodReadyDomains(metadata)) {
    const currentStateQuery = CURRENT_STATE_QUERY[domain.sourceObject];
    const currentState = Boolean(currentStateQuery);
    if (currentState && window.endDate < today) continue;
    const records = (await fetchAllFoodReadyRecords(credentials, domain.sourceObject, currentStateQuery))
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
  return output;
}

export const FOODREADY_ADAPTER: OperationalSourceAdapter = {
  sourceCode: FOODREADY_SOURCE_CODE,
  provider: 'FOODREADY',
  label: FOODREADY_LABEL,
  datasetPrefix: 'foodready',
  history: 'range',
  historyNote: 'Each FoodReady sync stores the records dated inside the sync window (scheduled syncs re-pull the Overlap Days). Inventory on hand, lots in hand, items, recipes, suppliers and supplier items are current-state lists, refreshed whenever a sync includes today.',
  defaultHistoryDays: 365,
  dynamicDatasets: true,
  datasets: [],
  sync: syncFoodReady,
};
