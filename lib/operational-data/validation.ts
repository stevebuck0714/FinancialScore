import type { OperationalDatasetSchema, OperationalSourceAdapter } from './types';

const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const DATASET_KEY = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const PREFIX = /^[a-z0-9_]+$/;

export function validateDatasetSchema(dataset: OperationalDatasetSchema, prefix: string): string[] {
  const problems: string[] = [];
  if (!DATASET_KEY.test(dataset.key)) problems.push(`${dataset.key}: key must look like "source.dataset" (lowercase)`);
  if (!dataset.key.startsWith(`${prefix}.`)) problems.push(`${dataset.key}: key must start with "${prefix}."`);
  if (!String(dataset.description || '').trim()) problems.push(`${dataset.key}: description is required`);
  if (dataset.grain !== 'flow' && dataset.grain !== 'point_in_time') problems.push(`${dataset.key}: invalid grain`);
  const seen = new Set<string>();
  for (const column of [...dataset.dimensions, ...dataset.measures, ...(dataset.attributes || [])]) {
    if (!COLUMN_NAME.test(column.name)) problems.push(`${dataset.key}: invalid column name "${column.name}"`);
    if (seen.has(column.name)) problems.push(`${dataset.key}: duplicate column "${column.name}"`);
    seen.add(column.name);
  }
  return problems;
}

export function validateOperationalAdapter(adapter: OperationalSourceAdapter): string[] {
  const problems: string[] = [];
  if (!adapter.sourceCode) problems.push('sourceCode is required');
  if (!PREFIX.test(adapter.datasetPrefix || '')) problems.push(`${adapter.sourceCode}: datasetPrefix must be lowercase letters, digits or _`);
  const producesData = Boolean(adapter.sync || adapter.mock || adapter.acceptsWorkbookUpload || adapter.builtInAskDatasets?.length);
  if (!producesData) problems.push(`${adapter.sourceCode}: needs sync(), mock(), workbook uploads, or built-in Ask datasets`);
  if (!adapter.datasets.length && !adapter.dynamicDatasets && !adapter.builtInAskDatasets?.length) {
    problems.push(`${adapter.sourceCode}: declares no datasets`);
  }
  if (!['range', 'snapshot', 'file', 'none'].includes(adapter.history)) problems.push(`${adapter.sourceCode}: history must be range, snapshot, file or none`);
  if (adapter.history === 'range' && !adapter.sync) problems.push(`${adapter.sourceCode}: history "range" needs a sync()`);
  if (adapter.sync && adapter.history === 'none') problems.push(`${adapter.sourceCode}: a live sync must declare history range, snapshot or file`);
  for (const dataset of adapter.datasets) problems.push(...validateDatasetSchema(dataset, adapter.datasetPrefix));
  return problems;
}
