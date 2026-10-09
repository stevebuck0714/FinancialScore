import prisma from '@/lib/prisma';
import { listAskDatasets } from '@/lib/ask-corelytics/data-tools';
import { getOperationalAdapter, listOperationalAdapters } from './registry';

export type OperationalSourceCoverage = {
  sourceCode: string;
  label: string;
  provider: string | null;
  connectionStatus: string | null;
  hasAdapter: boolean;
  supportsLive: boolean;
  supportsMock: boolean;
  supportsUpload: boolean;
  /** Ask datasets in dedicated tables that already hold this source's data. */
  builtInDatasets: Array<{ dataset: string; rowCount: number }>;
  mode: 'LIVE' | 'MOCK' | 'NONE';
  mockEnabled: boolean;
  liveSince: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
  lastLiveRunAt: string | null;
  lastMockRunAt: string | null;
  datasets: Array<{
    datasetKey: string;
    label: string;
    dataMode: string;
    rowCount: number;
    minDate: string | null;
    maxDate: string | null;
    lastSyncedAt: string | null;
  }>;
  /** Plain-language reason Ask Corelytics cannot see this source yet, if any. */
  gap: string | null;
};

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const ymd = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

/**
 * Every operational source a company has (connected or stored), what is stored for it, and
 * whether Ask Corelytics can see it. Also lists the accounting datasets Ask can query.
 */
export async function getCompanyOperationalCoverage(companyId: string) {
  const [connections, states, datasets, askDatasets] = await Promise.all([
    prisma.operationalSystemConnection.findMany({
      where: { companyId },
      select: { provider: true, sourceCode: true, status: true },
    }),
    prisma.operationalSourceState.findMany({ where: { companyId } }),
    prisma.operationalDataset.findMany({ where: { companyId }, orderBy: { datasetKey: 'asc' } }),
    listAskDatasets(companyId),
  ]);

  const sourceCodes = new Set<string>([
    ...connections.map((connection) => connection.sourceCode),
    ...states.map((state) => state.sourceCode),
    ...datasets.map((dataset) => dataset.sourceCode),
  ]);

  const sources: OperationalSourceCoverage[] = [...sourceCodes].sort().map((sourceCode) => {
    const adapter = getOperationalAdapter(sourceCode);
    const connection = connections.find((row) => row.sourceCode === sourceCode) || null;
    const state = states.find((row) => row.sourceCode === sourceCode) || null;
    const sourceDatasets = datasets.filter((row) => row.sourceCode === sourceCode);
    const builtInDatasets = (adapter?.builtInAskDatasets || []).map((dataset) => ({
      dataset,
      rowCount: Number((askDatasets.find((row) => row.dataset === dataset) as Record<string, unknown> | undefined)?.rowCount || 0),
    }));
    const builtInRows = builtInDatasets.reduce((sum, row) => sum + row.rowCount, 0);
    const storedRows = sourceDatasets.reduce((sum, row) => sum + row.rowCount, 0);
    const mode = builtInRows > 0 || sourceDatasets.some((row) => row.dataMode === 'LIVE' && row.rowCount > 0)
      ? 'LIVE'
      : storedRows > 0
        ? 'MOCK'
        : 'NONE';
    const nextStep = [adapter?.sync && 'run a live sync', adapter?.acceptsWorkbookUpload && 'upload a workbook', adapter?.mock && 'turn on mock data']
      .filter(Boolean)
      .join(' or ');
    let gap: string | null = null;
    if (!adapter) gap = 'No store adapter yet — this source is not saved to tables, so Ask cannot see it.';
    else if (storedRows + builtInRows === 0 && state?.lastRunStatus === 'ERROR') gap = `Last run failed: ${state.lastRunMessage || 'unknown error'}`;
    else if (storedRows + builtInRows === 0) gap = `No rows stored yet${nextStep ? ` — ${nextStep}` : ''}.`;
    return {
      sourceCode,
      label: adapter?.label || sourceCode,
      provider: connection?.provider || adapter?.provider || null,
      connectionStatus: connection?.status || null,
      hasAdapter: Boolean(adapter),
      supportsLive: Boolean(adapter?.sync),
      supportsMock: Boolean(adapter?.mock),
      supportsUpload: Boolean(adapter?.acceptsWorkbookUpload),
      builtInDatasets,
      mode,
      mockEnabled: Boolean(state?.mockEnabled),
      liveSince: iso(state?.liveSince),
      lastRunStatus: state?.lastRunStatus || null,
      lastRunMessage: state?.lastRunMessage || null,
      lastLiveRunAt: iso(state?.lastLiveRunAt),
      lastMockRunAt: iso(state?.lastMockRunAt),
      datasets: sourceDatasets.map((row) => ({
        datasetKey: row.datasetKey,
        label: row.label,
        dataMode: row.dataMode,
        rowCount: row.rowCount,
        minDate: ymd(row.minDate),
        maxDate: ymd(row.maxDate),
        lastSyncedAt: iso(row.lastSyncedAt),
      })),
      gap,
    };
  });

  const availableAdapters = listOperationalAdapters()
    .filter((adapter) => !sourceCodes.has(adapter.sourceCode))
    .map((adapter) => ({ sourceCode: adapter.sourceCode, label: adapter.label }));

  const accountingDatasets = askDatasets
    .filter((dataset) => !String(dataset.dataset).includes('.'))
    .map((dataset) => ({
      dataset: dataset.dataset,
      rowCount: Number((dataset as Record<string, unknown>).rowCount || 0),
      minDate: ((dataset as Record<string, unknown>).minDate as string | null) ?? null,
      maxDate: ((dataset as Record<string, unknown>).maxDate as string | null) ?? null,
    }));

  return { companyId, sources, availableAdapters, accountingDatasets };
}
