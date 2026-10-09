import type { OperationalSourceCode } from '@/lib/operational/source-definitions';
import type { OperationalDatasetSchema, OperationalSourceAdapter } from './types';
import { validateOperationalAdapter } from './validation';
import { HUBSPOT_ADAPTER } from './sources/hubspot';
import { BAMBOOHR_ADAPTER } from './sources/bamboohr';
import { ISOLVED_ADAPTER } from './sources/isolved';
import { SPREADSHEET_ADAPTERS } from './sources/spreadsheet';
import { APR_SGP_GMPA_ADAPTER, COGENT_RATE_CARD_ADAPTER } from './sources/workbook-parsers';
import { BUILT_IN_ADAPTERS, RETAIL_SUBCATEGORY_HISTORY_ADAPTER } from './sources/built-in';
import { SECTOR_DEMO_ADAPTER } from './sources/sector-demo';

export { validateOperationalAdapter };

/**
 * Every operational source a company can add (lib/operational/source-definitions.ts) MUST
 * have an adapter here — a missing source is a type error, so the build fails. Storage,
 * scheduling, mock handling, coverage and Ask Corelytics all come from this registry.
 */
const SOURCE_ADAPTERS: Record<OperationalSourceCode, OperationalSourceAdapter> = {
  ...SPREADSHEET_ADAPTERS,
  ...BUILT_IN_ADAPTERS,
  APR_SGP_GMPA_FORECAST: APR_SGP_GMPA_ADAPTER,
  COGENT_RATE_CARD: COGENT_RATE_CARD_ADAPTER,
  ISOLVED_PEOPLE_CLOUD: ISOLVED_ADAPTER,
  BAMBOOHR_STANDARD: BAMBOOHR_ADAPTER,
  HUBSPOT_STANDARD: HUBSPOT_ADAPTER,
};

/** Sources not offered in the source picker (internal or legacy upload paths). */
const ADDITIONAL_ADAPTERS: OperationalSourceAdapter[] = [SECTOR_DEMO_ADAPTER, RETAIL_SUBCATEGORY_HISTORY_ADAPTER];

type Registry = {
  bySource: Map<string, OperationalSourceAdapter>;
  byDataset: Map<string, { adapter: OperationalSourceAdapter; dataset: OperationalDatasetSchema }>;
};

let registry: Registry | null = null;

function buildRegistry(): Registry {
  const bySource = new Map<string, OperationalSourceAdapter>();
  const byDataset = new Map<string, { adapter: OperationalSourceAdapter; dataset: OperationalDatasetSchema }>();
  const prefixes = new Map<string, string>();
  const entries: Array<[string, OperationalSourceAdapter]> = [
    ...Object.entries(SOURCE_ADAPTERS),
    ...ADDITIONAL_ADAPTERS.map((adapter) => [adapter.sourceCode, adapter] as [string, OperationalSourceAdapter]),
  ];
  for (const [sourceCode, adapter] of entries) {
    const problems = validateOperationalAdapter(adapter);
    if (adapter.sourceCode !== sourceCode) problems.push(`registered as ${sourceCode} but declares ${adapter.sourceCode}`);
    if (problems.length) throw new Error(`Invalid operational adapter: ${problems.join('; ')}`);
    if (bySource.has(sourceCode)) throw new Error(`Duplicate operational adapter ${sourceCode}`);
    const prefixOwner = prefixes.get(adapter.datasetPrefix);
    if (prefixOwner) throw new Error(`Dataset prefix "${adapter.datasetPrefix}" is used by both ${prefixOwner} and ${sourceCode}`);
    prefixes.set(adapter.datasetPrefix, sourceCode);
    bySource.set(sourceCode, adapter);
    for (const dataset of adapter.datasets) {
      if (byDataset.has(dataset.key)) throw new Error(`Duplicate operational dataset key ${dataset.key}`);
      byDataset.set(dataset.key, { adapter, dataset });
    }
  }
  return { bySource, byDataset };
}

function getRegistry(): Registry {
  registry ??= buildRegistry();
  return registry;
}

export function listOperationalAdapters(): OperationalSourceAdapter[] {
  return [...getRegistry().bySource.values()];
}

export function getOperationalAdapter(sourceCode: string): OperationalSourceAdapter | null {
  return getRegistry().bySource.get(sourceCode) || null;
}

export function getOperationalDatasetSchema(datasetKey: string): OperationalDatasetSchema | null {
  return getRegistry().byDataset.get(datasetKey)?.dataset || null;
}
