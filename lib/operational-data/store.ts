import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import type {
  OperationalColumnDef,
  OperationalDataMode,
  OperationalDatasetSchema,
  OperationalRecordInput,
  OperationalScalar,
  OperationalSourceAdapter,
  OperationalSourceOutput,
  OperationalSyncWindow,
} from './types';
import { validateDatasetSchema } from './validation';

const INSERT_CHUNK_SIZE = 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type DatasetWriteResult = {
  datasetKey: string;
  written: number;
  dropped: number;
  skipped?: string;
};

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function allowedNames(columns: OperationalColumnDef[] | undefined): Set<string> {
  return new Set((columns || []).filter((column) => !column.sensitive).map((column) => column.name));
}

/** Schema as stored in the registry row: sensitive columns are removed entirely. */
export function storedDatasetSchema(schema: OperationalDatasetSchema) {
  const strip = (columns: OperationalColumnDef[] | undefined) =>
    (columns || []).filter((column) => !column.sensitive).map(({ sensitive: _sensitive, ...rest }) => rest);
  return {
    dimensions: strip(schema.dimensions),
    measures: strip(schema.measures),
    attributes: strip(schema.attributes),
  };
}

function pickScalars(input: Record<string, OperationalScalar | undefined> | undefined, allowed: Set<string>) {
  const out: Record<string, OperationalScalar> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!allowed.has(key) || value === undefined) continue;
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else out[key] = String(value).slice(0, 500);
  }
  return out;
}

function pickMeasures(input: Record<string, number | null | undefined> | undefined, allowed: Set<string>) {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!allowed.has(key) || value === null || value === undefined) continue;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric)) out[key] = numeric;
  }
  return out;
}

function stableKey(value: Record<string, unknown>): string {
  return Object.keys(value)
    .sort()
    .map((key) => `${key}=${String(value[key])}`)
    .join('|');
}

type PreparedRow = { date: string; externalId: string; dimensions: string; measures: string; attributes: string };

function prepareRows(schema: OperationalDatasetSchema, rows: OperationalRecordInput[]) {
  const dims = allowedNames(schema.dimensions);
  const meas = allowedNames(schema.measures);
  const attrs = allowedNames(schema.attributes);
  const byExternalId = new Map<string, PreparedRow>();
  let dropped = 0;
  for (const row of rows) {
    if (!isDateKey(row?.date)) {
      dropped += 1;
      continue;
    }
    const dimensions = pickScalars(row.dimensions, dims);
    const externalId = String(row.externalId || `${row.date}|${stableKey(dimensions)}`).slice(0, 500);
    byExternalId.set(externalId, {
      date: row.date,
      externalId,
      dimensions: JSON.stringify(dimensions),
      measures: JSON.stringify(pickMeasures(row.measures, meas)),
      attributes: JSON.stringify(pickScalars(row.attributes, attrs)),
    });
  }
  return { rows: [...byExternalId.values()], dropped };
}

async function ensureDataset(companyId: string, sourceCode: string, schema: OperationalDatasetSchema) {
  const data = {
    sourceCode,
    label: schema.label,
    description: schema.description,
    grain: schema.grain,
    schema: storedDatasetSchema(schema),
  };
  return prisma.operationalDataset.upsert({
    where: { companyId_datasetKey: { companyId, datasetKey: schema.key } },
    create: { companyId, datasetKey: schema.key, ...data },
    update: data,
    select: { id: true, dataMode: true },
  });
}

async function insertRows(companyId: string, datasetId: string, mode: OperationalDataMode, runId: string, rows: PreparedRow[]) {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OperationalRecord"
         ("id", "companyId", "datasetId", "recordDate", "externalId", "dimensions", "measures", "attributes", "dataMode", "sourceRunId", "createdAt", "updatedAt")
       SELECT r.id, $1, $2, r.d::date, r.ext, r.dim::jsonb, r.mea::jsonb, r.att::jsonb, $3, $4, NOW(), NOW()
       FROM unnest($5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[]) AS r(id, d, ext, dim, mea, att)
       ON CONFLICT ("datasetId", "externalId") DO UPDATE SET
         "recordDate" = EXCLUDED."recordDate",
         "dimensions" = EXCLUDED."dimensions",
         "measures" = EXCLUDED."measures",
         "attributes" = EXCLUDED."attributes",
         "dataMode" = EXCLUDED."dataMode",
         "sourceRunId" = EXCLUDED."sourceRunId",
         "updatedAt" = NOW()`,
      companyId,
      datasetId,
      mode,
      runId,
      chunk.map(() => randomUUID()),
      chunk.map((row) => row.date),
      chunk.map((row) => row.externalId),
      chunk.map((row) => row.dimensions),
      chunk.map((row) => row.measures),
      chunk.map((row) => row.attributes),
    );
  }
}

async function refreshDatasetStats(companyId: string, datasetId: string, mode: OperationalDataMode, runId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "OperationalDataset" d
     SET "rowCount" = s.n, "minDate" = s.mn, "maxDate" = s.mx, "dataMode" = $2, "lastSyncedAt" = NOW(), "lastRunId" = $3, "updatedAt" = NOW()
     FROM (SELECT COUNT(*)::int AS n, MIN("recordDate") AS mn, MAX("recordDate") AS mx FROM "OperationalRecord" WHERE "datasetId" = $1 AND "companyId" = $4) s
     WHERE d."id" = $1 AND d."companyId" = $4`,
    datasetId,
    mode,
    runId,
    companyId,
  );
}

async function writeDataset(params: {
  companyId: string;
  sourceCode: string;
  schema: OperationalDatasetSchema;
  rows: OperationalRecordInput[];
  replaceWindow?: OperationalSyncWindow | null;
  mode: OperationalDataMode;
  runId: string;
}): Promise<DatasetWriteResult> {
  const { companyId, sourceCode, schema, mode, runId } = params;
  const dataset = await ensureDataset(companyId, sourceCode, schema);
  if (mode === 'MOCK' && dataset.dataMode === 'LIVE') {
    return { datasetKey: schema.key, written: 0, dropped: 0, skipped: 'dataset already has live data' };
  }

  const prepared = prepareRows(schema, params.rows);
  if (mode === 'LIVE') {
    await prisma.operationalRecord.deleteMany({ where: { companyId, datasetId: dataset.id, dataMode: 'MOCK' } });
  }
  const window = params.replaceWindow;
  if (window && isDateKey(window.startDate) && isDateKey(window.endDate)) {
    await prisma.operationalRecord.deleteMany({
      where: {
        companyId,
        datasetId: dataset.id,
        dataMode: mode,
        recordDate: { gte: new Date(`${window.startDate}T00:00:00Z`), lte: new Date(`${window.endDate}T00:00:00Z`) },
      },
    });
  }
  await insertRows(companyId, dataset.id, mode, runId, prepared.rows);
  await refreshDatasetStats(companyId, dataset.id, mode, runId);
  return { datasetKey: schema.key, written: prepared.rows.length, dropped: prepared.dropped };
}

/** Persist one adapter run. Unknown dataset keys are rejected rather than silently stored. */
export async function writeOperationalSourceOutput(params: {
  companyId: string;
  adapter: OperationalSourceAdapter;
  output: OperationalSourceOutput;
  mode: OperationalDataMode;
  window: OperationalSyncWindow;
  runId?: string;
}): Promise<DatasetWriteResult[]> {
  const runId = params.runId || randomUUID();
  const { adapter } = params;
  const schemas = new Map(adapter.datasets.map((dataset) => [dataset.key, dataset]));
  const results: DatasetWriteResult[] = [];
  for (const [datasetKey, payload] of Object.entries(params.output || {})) {
    let schema = schemas.get(datasetKey) || null;
    if (!schema && adapter.dynamicDatasets && payload?.schema?.key === datasetKey) {
      const problems = validateDatasetSchema(payload.schema, adapter.datasetPrefix);
      if (problems.length) {
        results.push({ datasetKey, written: 0, dropped: payload.rows?.length || 0, skipped: problems.join('; ') });
        continue;
      }
      schema = payload.schema;
    }
    if (!schema) {
      results.push({ datasetKey, written: 0, dropped: payload?.rows?.length || 0, skipped: 'dataset not declared by adapter' });
      continue;
    }
    results.push(
      await writeDataset({
        companyId: params.companyId,
        sourceCode: adapter.sourceCode,
        schema,
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
        replaceWindow: payload?.replaceWindow ? payload.window || params.window : null,
        mode: params.mode,
        runId,
      }),
    );
  }
  return results;
}

/** Remove every mock row (and now-empty mock datasets) for one company + source. */
export async function removeSourceMockData(companyId: string, sourceCode: string): Promise<number> {
  const datasets = await prisma.operationalDataset.findMany({
    where: { companyId, sourceCode },
    select: { id: true, dataMode: true },
  });
  if (!datasets.length) return 0;
  const ids = datasets.map((dataset) => dataset.id);
  const { count } = await prisma.operationalRecord.deleteMany({ where: { companyId, datasetId: { in: ids }, dataMode: 'MOCK' } });
  await prisma.operationalDataset.deleteMany({
    where: { companyId, id: { in: datasets.filter((d) => d.dataMode === 'MOCK').map((d) => d.id) } },
  });
  return count;
}
