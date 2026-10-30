import {
  DEFAULT_JOBBOSS_DATA_DOMAINS,
  JOBBOSS_LABEL,
  JOBBOSS_SOURCE_CODE,
  getJobBossAccessToken,
  jobBossApiRequest,
  jobBossCredentialsFromConnection,
} from '@/lib/jobboss';
import { formatEstDate } from '@/lib/time/eastern';
import type { OperationalDatasetSchema, OperationalSourceAdapter, OperationalSourceOutput } from '../types';
import { asRecord, readConnectionMetadata } from './common';

type DataDomain = { dataDomain: string; sourceObject: string; enabled: boolean };

const SENSITIVE_FIELD = /(address|contact|email|phone|name|password|secret|token|ssn|bank|account)/i;
const DATE_FIELD = /(date|created|modified|updated)/i;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;

function configuredDomains(metadata: Record<string, unknown>): DataDomain[] {
  const configured = asRecord(metadata.operationalSourceDataDomains)[JOBBOSS_SOURCE_CODE];
  const rows = Array.isArray(configured) ? configured : [];
  return (rows.length ? rows : DEFAULT_JOBBOSS_DATA_DOMAINS).flatMap((value) => {
    const row = asRecord(value);
    const dataDomain = String(row.dataDomain || '').trim();
    const sourceObject = String(row.sourceObject || '').trim();
    return dataDomain && sourceObject && row.enabled !== false ? [{ dataDomain, sourceObject, enabled: true }] : [];
  });
}

function keyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'records';
}

function scalar(value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
  const object = asRecord(payload);
  const data = object.Data ?? object.data ?? object.results ?? object.items;
  return Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : [];
}

function schemaFor(domain: DataDomain, records: Record<string, unknown>[]): OperationalDatasetSchema {
  const fieldNames = [...new Set(records.flatMap((record) => Object.keys(record)))]
    .filter((field) => field !== 'sourceObject' && SAFE_FIELD_NAME.test(field) && !SENSITIVE_FIELD.test(field))
    .slice(0, 40);
  const dimensions = fieldNames.filter((field) => !DATE_FIELD.test(field) && typeof records.find((row) => row[field] !== undefined)?.[field] !== 'number')
    .map((name) => ({ name }));
  const measures = fieldNames.filter((field) => typeof records.find((row) => row[field] !== undefined)?.[field] === 'number')
    .map((name) => ({ name }));
  return {
    key: `jobboss.${keyPart(domain.dataDomain)}`,
    label: `JobBOSS² ${domain.dataDomain}`,
    description: `JobBOSS² ${domain.dataDomain} records from ${domain.sourceObject}. Fields that can contain personal or credential data are excluded.`,
    grain: 'point_in_time',
    dimensions: [{ name: 'sourceObject' }, ...dimensions],
    measures: [{ name: 'recordCount', description: 'Always 1; sum to count records.' }, ...measures],
  };
}

async function fetchAllJobBossRecords(accessToken: string, path: string): Promise<Record<string, unknown>[]> {
  const take = 500;
  const maxPages = 100;
  const all: Record<string, unknown>[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await jobBossApiRequest<unknown>(accessToken, path, { skip: page * take, take });
    const rows = rowsFromPayload(payload);
    all.push(...rows);
    if (rows.length < take) break;
  }
  return all;
}

async function syncJobBoss({ companyId }: { companyId: string }): Promise<OperationalSourceOutput> {
  const { connection, metadata } = await readConnectionMetadata(companyId, 'JOBBOSS', JOBBOSS_SOURCE_CODE);
  const credentials = connection?.status === 'ACTIVE' ? jobBossCredentialsFromConnection(connection) : null;
  if (!credentials) throw new Error('JobBOSS² is not connected for this company.');
  const accessToken = await getJobBossAccessToken(credentials);
  const output: OperationalSourceOutput = {};
  for (const domain of configuredDomains(metadata)) {
    const records = await fetchAllJobBossRecords(accessToken, domain.sourceObject);
    const schema = schemaFor(domain, records);
    output[schema.key] = {
      schema,
      replaceWindow: true,
      window: { startDate: '1900-01-01', endDate: '2999-12-31' },
      rows: records.map((record, index) => {
        const dateValue = Object.entries(record).find(([key, value]) => DATE_FIELD.test(key) && typeof value === 'string')?.[1];
        const parsedDate = dateValue ? new Date(String(dateValue)) : null;
        const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? formatEstDate(parsedDate) : formatEstDate();
        const dimensions: Record<string, string | number | boolean | null> = { sourceObject: domain.sourceObject };
        const measures: Record<string, number> = { recordCount: 1 };
        Object.entries(record).forEach(([key, value]) => {
          if (!SAFE_FIELD_NAME.test(key) || SENSITIVE_FIELD.test(key)) return;
          const parsed = scalar(value);
          if (parsed === null) return;
          if (typeof parsed === 'number') measures[key] = parsed;
          else dimensions[key] = parsed;
        });
        const identity = String(record.uniqueID ?? record.id ?? record.ID ?? record.number ?? index);
        return { date, externalId: `${domain.sourceObject}|${identity}`, dimensions, measures };
      }),
    };
  }
  return output;
}

export const JOBBOSS_ADAPTER: OperationalSourceAdapter = {
  sourceCode: JOBBOSS_SOURCE_CODE,
  provider: 'JOBBOSS',
  label: JOBBOSS_LABEL,
  datasetPrefix: 'jobboss',
  history: 'snapshot',
  historyNote: 'JobBOSS² API records are refreshed as current snapshots. API access must be enabled by ECI for the customer.',
  defaultHistoryDays: 365,
  dynamicDatasets: true,
  datasets: [],
  sync: syncJobBoss,
};
