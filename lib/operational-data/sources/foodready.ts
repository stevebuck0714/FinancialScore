import {
  DEFAULT_FOODREADY_DATA_DOMAINS,
  FOODREADY_LABEL,
  FOODREADY_SOURCE_CODE,
  foodReadyApiRequest,
  foodReadyCredentialsFromConnection,
  foodReadyEndpointForDomain,
  type FoodReadyCredentials,
} from '@/lib/foodready';
import { formatEstDate } from '@/lib/time/eastern';
import type { OperationalDatasetSchema, OperationalSourceAdapter, OperationalSourceOutput, OperationalSyncWindow } from '../types';
import { asRecord, readConnectionMetadata } from './common';

type DataDomain = { dataDomain: string; sourceObject: string; enabled: boolean };

const SENSITIVE_FIELD = /(address|contact|email|phone|password|secret|token|ssn|bank|signature|driver|receiver|By$)/i;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const PAGE_SIZE = 200;
const MAX_PAGES = 100;

/**
 * The business date each record describes, first match wins. Endpoints with no date fields are
 * current-state lists (inventory on hand, items, recipes, suppliers) stored as of the sync date.
 */
const DATE_FIELDS_BY_ENDPOINT: Record<string, string[]> = {
  '/api/inventoryItems/search': [],
  '/api/itemPackaging/search': [],
  '/api/bom/search': [],
  '/api/v2/suppliers/search': [],
  '/api/purchaseOrders/lots/search': ['poReceivedOn', 'expectedDeliveryDate', 'createdAt'],
  '/api/purchaseOrderReceiving/search': ['receivedOn', 'createdAt'],
  '/api/wipItemLots/search': ['receivedOn', 'createdAt'],
  '/api/mo/search': ['completedOn', 'scheduledDate', 'requiredDate', 'createdAt'],
  '/api/moBatch/search': ['createdAt'],
  '/api/purchaseOrders/search': ['poCreatedOn', 'createdAt'],
  '/api/salesOrders': ['shippedOn', 'shipDateTime', 'requiredByDate', 'createdAt'],
};
const DEFAULT_DATE_FIELDS = ['createdAt'];

export function configuredFoodReadyDomains(metadata: Record<string, unknown>): DataDomain[] {
  const configured = asRecord(metadata.operationalSourceDataDomains)[FOODREADY_SOURCE_CODE];
  const rows = Array.isArray(configured) && configured.length ? configured : DEFAULT_FOODREADY_DATA_DOMAINS;
  return rows.flatMap((value) => {
    const row = asRecord(value);
    const dataDomain = String(row.dataDomain || '').trim();
    const endpoint = foodReadyEndpointForDomain(dataDomain, String(row.sourceObject || ''));
    return dataDomain && endpoint && row.enabled !== false ? [{ dataDomain, sourceObject: endpoint, enabled: true }] : [];
  });
}

function keyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'records';
}

function scalar(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
  const data = asRecord(payload).data;
  return Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : [];
}

function storedField(key: string, value: unknown): boolean {
  return SAFE_FIELD_NAME.test(key) && !SENSITIVE_FIELD.test(key) && scalar(value) !== null;
}

function schemaFor(domain: DataDomain, records: Record<string, unknown>[]): OperationalDatasetSchema {
  const fieldNames = [...new Set(records.flatMap((record) => Object.keys(record).filter((key) => storedField(key, record[key]))))]
    .filter((field) => field !== 'sourceObject')
    .slice(0, 60);
  const isNumeric = (field: string) => typeof records.find((row) => row[field] !== undefined && row[field] !== null)?.[field] === 'number';
  return {
    key: `foodready.${keyPart(domain.dataDomain)}`,
    label: `FoodReady ${domain.dataDomain}`,
    description: `FoodReady ${domain.dataDomain} records from ${domain.sourceObject}. Fields that can contain personal or credential data are excluded.`,
    grain: 'point_in_time',
    dimensions: [{ name: 'sourceObject' }, ...fieldNames.filter((field) => !isNumeric(field)).map((name) => ({ name }))],
    measures: [{ name: 'recordCount', description: 'Always 1; sum to count records.' }, ...fieldNames.filter(isNumeric).map((name) => ({ name }))],
  };
}

async function fetchAllFoodReadyRecords(credentials: FoodReadyCredentials, path: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = rowsFromPayload(await foodReadyApiRequest<unknown>(credentials, path, { from: page * PAGE_SIZE, size: PAGE_SIZE }));
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

function recordDate(endpoint: string, record: Record<string, unknown>, today: string): string {
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
    const records = (await fetchAllFoodReadyRecords(credentials, domain.sourceObject))
      .map((record) => ({ record, date: recordDate(domain.sourceObject, record, today) }))
      .filter(({ date }) => date >= window.startDate && date <= window.endDate);
    const schema = schemaFor(domain, records.map(({ record }) => record));
    output[schema.key] = {
      schema,
      replaceWindow: true,
      window,
      rows: records.map(({ record, date }, index) => {
        const dimensions: Record<string, string | number | boolean | null> = { sourceObject: domain.sourceObject };
        const measures: Record<string, number> = { recordCount: 1 };
        Object.entries(record).forEach(([key, value]) => {
          if (!storedField(key, value)) return;
          const parsed = scalar(value);
          if (typeof parsed === 'number') measures[key] = parsed;
          else dimensions[key] = parsed;
        });
        const identity = String(record._id ?? record.id ?? index);
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
  historyNote: 'Each FoodReady sync stores the records dated inside the sync window (scheduled syncs re-pull the Overlap Days). Inventory on hand, items, recipes and suppliers are current-state lists stored as of the sync date.',
  defaultHistoryDays: 365,
  dynamicDatasets: true,
  datasets: [],
  sync: syncFoodReady,
};
