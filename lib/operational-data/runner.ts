import { randomUUID } from 'crypto';
import type * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { addEstCalendarDays, formatEstDate } from '@/lib/time/eastern';
import { getOperationalSourceDefinition } from '@/lib/operational/source-definitions';
import { getOperationalAdapter, listOperationalAdapters } from './registry';
import { removeSourceMockData, writeOperationalSourceOutput, type DatasetWriteResult } from './store';
import { workbookToOutput } from './payload';
import type { OperationalDataMode, OperationalSourceAdapter, OperationalSourceOutput, OperationalSyncWindow } from './types';

const DEFAULT_SYNC_LOOKBACK_DAYS = 7;
const DEFAULT_MOCK_LOOKBACK_DAYS = 400;
const DEFAULT_HISTORY_DAYS = 365;

export type OperationalRunResult = {
  ok: boolean;
  companyId: string;
  sourceCode: string;
  mode: OperationalDataMode;
  window?: OperationalSyncWindow;
  datasets?: DatasetWriteResult[];
  mockRowsRemoved?: number;
  skipped?: string;
  error?: string;
};

/**
 * A connection that pulls real data from an API: ACTIVE, credentials saved, and its source
 * syncs from an API (history range or snapshot). These run nightly and never get mock data.
 */
export function isLiveApiConnection(connection: { status: string; sourceCode: string; accessToken?: string | null }): boolean {
  const history = getOperationalAdapter(connection.sourceCode)?.history;
  return connection.status === 'ACTIVE' && Boolean(String(connection.accessToken || '').trim()) && (history === 'range' || history === 'snapshot');
}

async function ensureSourceState(companyId: string, sourceCode: string) {
  return prisma.operationalSourceState.upsert({
    where: { companyId_sourceCode: { companyId, sourceCode } },
    create: { companyId, sourceCode },
    update: {},
  });
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_HISTORY_DATE = '1990-01-01';

/**
 * The connection's "Initial Sync Start Date", wherever its setup screen saved it: top level of
 * the connection metadata or inside a source settings object (bambooHrSettings, hubSpotSettings, ...).
 */
async function readConfiguredHistoryStartDate(companyId: string, sourceCode: string): Promise<string | null> {
  const connection = await prisma.operationalSystemConnection.findFirst({
    where: { companyId, sourceCode },
    select: { connectionMetadata: true },
  });
  const metadata = (connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
    ? connection.connectionMetadata
    : {}) as Record<string, unknown>;
  const candidates = [
    metadata.initialSyncStartDate,
    ...Object.values(metadata).map((value) =>
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).initialSyncStartDate : undefined,
    ),
  ];
  const found = candidates.map((value) => String(value || '').trim()).find((value) => DATE_KEY.test(value));
  return found || null;
}

/** Validate a requested date-range sync window (EST calendar dates, not in the future). */
export function validateSyncWindow(startDate: unknown, endDate: unknown): { window?: OperationalSyncWindow; error?: string } {
  const start = String(startDate || '').trim();
  const end = String(endDate || '').trim() || formatEstDate();
  if (!DATE_KEY.test(start) || !DATE_KEY.test(end)) return { error: 'startDate and endDate must be YYYY-MM-DD' };
  if (start > end) return { error: 'startDate must be on or before endDate' };
  if (start < EARLIEST_HISTORY_DATE) return { error: `startDate must be on or after ${EARLIEST_HISTORY_DATE}` };
  if (end > formatEstDate()) return { error: 'endDate cannot be in the future' };
  return { window: { startDate: start, endDate: end } };
}

function defaultWindow(adapter: OperationalSourceAdapter, mode: OperationalDataMode, window?: Partial<OperationalSyncWindow>): OperationalSyncWindow {
  const endDate = window?.endDate || formatEstDate();
  const lookback = mode === 'LIVE'
    ? adapter.defaultSyncLookbackDays ?? DEFAULT_SYNC_LOOKBACK_DAYS
    : adapter.defaultMockLookbackDays ?? DEFAULT_MOCK_LOOKBACK_DAYS;
  return { startDate: window?.startDate || addEstCalendarDays(endDate, -lookback), endDate };
}

/**
 * LIVE window: an explicit date range wins; a range-capable source's first live sync backfills
 * from the connection's Initial Sync Start Date (or the adapter default); otherwise the nightly
 * incremental lookback.
 */
async function liveWindow(companyId: string, adapter: OperationalSourceAdapter, window?: OperationalSyncWindow): Promise<OperationalSyncWindow> {
  if (window) return window;
  const state = await prisma.operationalSourceState.findUnique({
    where: { companyId_sourceCode: { companyId, sourceCode: adapter.sourceCode } },
    select: { liveSince: true },
  });
  if (adapter.history === 'range' && !state?.liveSince) {
    const endDate = formatEstDate();
    const configured = await readConfiguredHistoryStartDate(companyId, adapter.sourceCode);
    const startDate = configured && configured <= endDate ? configured : addEstCalendarDays(endDate, -(adapter.defaultHistoryDays ?? DEFAULT_HISTORY_DAYS));
    return { startDate, endDate };
  }
  return defaultWindow(adapter, 'LIVE');
}

/**
 * Persist one run's output. A source's first successful LIVE write removes all of its mock
 * data and marks it live; mock data is never written for a live source.
 */
async function persistOutput(params: {
  companyId: string;
  adapter: OperationalSourceAdapter;
  mode: OperationalDataMode;
  window: OperationalSyncWindow;
  produce: () => Promise<OperationalSourceOutput>;
}): Promise<OperationalRunResult> {
  const { companyId, adapter, mode, window } = params;
  const base = { companyId, sourceCode: adapter.sourceCode, mode, window };
  const state = await ensureSourceState(companyId, adapter.sourceCode);
  if (mode === 'MOCK' && state.liveSince) return { ...base, ok: true, skipped: 'source already live' };
  try {
    const output = await params.produce();
    const hasRows = Object.values(output).some((payload) => payload?.rows?.length);
    if (mode === 'LIVE' && !hasRows) {
      await prisma.operationalSourceState.update({
        where: { id: state.id },
        data: { lastLiveRunAt: new Date(), lastRunStatus: 'OK', lastRunMessage: 'LIVE run returned no rows; nothing stored' },
      });
      return { ...base, ok: true, datasets: [], skipped: 'no live rows returned' };
    }
    let mockRowsRemoved: number | undefined;
    if (mode === 'LIVE' && !state.liveSince) mockRowsRemoved = await removeSourceMockData(companyId, adapter.sourceCode);
    const datasets = await writeOperationalSourceOutput({ companyId, adapter, output, mode, window, runId: randomUUID() });
    const written = datasets.reduce((sum, dataset) => sum + dataset.written, 0);
    const now = new Date();
    await prisma.operationalSourceState.update({
      where: { id: state.id },
      data: {
        lastRunStatus: 'OK',
        lastRunMessage: `${mode} run wrote ${written} row(s) across ${datasets.length} dataset(s)`,
        ...(mode === 'LIVE'
          ? { lastLiveRunAt: now, ...(state.liveSince ? {} : { liveSince: now, mockEnabled: false }) }
          : { lastMockRunAt: now }),
      },
    });
    return { ...base, ok: true, datasets, mockRowsRemoved };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.operationalSourceState.update({
      where: { id: state.id },
      data: { lastRunStatus: 'ERROR', lastRunMessage: message.slice(0, 900) },
    });
    return { ...base, ok: false, error: message };
  }
}

/** Run one source's live sync or mock generator for one company and store the result. */
export async function runOperationalSource(params: {
  companyId: string;
  sourceCode: string;
  mode: OperationalDataMode;
  window?: OperationalSyncWindow;
}): Promise<OperationalRunResult> {
  const { companyId, sourceCode, mode } = params;
  const adapter = getOperationalAdapter(sourceCode);
  if (!adapter) return { companyId, sourceCode, mode, ok: false, skipped: 'no adapter registered for this source' };
  const producer = mode === 'LIVE' ? adapter.sync : adapter.mock;
  if (!producer) return { companyId, sourceCode, mode, ok: false, skipped: `adapter has no ${mode === 'LIVE' ? 'live sync' : 'mock data'}` };
  const window = mode === 'LIVE' ? await liveWindow(companyId, adapter, params.window) : defaultWindow(adapter, mode, params.window);
  return persistOutput({ companyId, adapter, mode, window, produce: () => producer({ companyId, window }) });
}

/** Store an uploaded workbook as live data for a spreadsheet source (one dataset per sheet). */
export async function ingestOperationalWorkbook(params: {
  companyId: string;
  sourceCode: string;
  workbook: XLSX.WorkBook;
  uploadedAt?: Date;
}): Promise<OperationalRunResult> {
  const { companyId, sourceCode } = params;
  const adapter = getOperationalAdapter(sourceCode);
  if (!adapter?.acceptsWorkbookUpload) {
    return { companyId, sourceCode, mode: 'LIVE', ok: false, skipped: 'source does not accept generic workbook uploads' };
  }
  const asOf = formatEstDate(params.uploadedAt || new Date());
  return persistOutput({
    companyId,
    adapter,
    mode: 'LIVE',
    window: { startDate: asOf, endDate: asOf },
    produce: async () => workbookToOutput(params.workbook, { prefix: adapter.datasetPrefix, sourceLabel: adapter.label, asOf, replace: 'range' }),
  });
}

/** Turn mock data on or off for one company + source. Turning it off deletes the mock rows. */
export async function setOperationalSourceMockEnabled(companyId: string, sourceCode: string, enabled: boolean) {
  const state = await ensureSourceState(companyId, sourceCode);
  if (enabled && state.liveSince) return { ok: false, error: 'Source already has live data; mock data is not used.' };
  await prisma.operationalSourceState.update({ where: { id: state.id }, data: { mockEnabled: enabled } });
  if (!enabled) return { ok: true, mockRowsRemoved: await removeSourceMockData(companyId, sourceCode) };
  return { ok: true, run: await runOperationalSource({ companyId, sourceCode, mode: 'MOCK' }) };
}

/**
 * Apply the mock-data rule for every company:
 * - a connected source with a mock generator stores mock data until its first live data,
 *   except a live API connection (a real customer never sees mock data);
 * - a company in demo mode also stores mock data for every mock-capable source in its sector;
 * - adapters with `mockEligible` (demo data) follow that check exactly.
 * A source an admin turned off stays off; disconnected sources lose their mock data.
 */
export async function reconcileOperationalMockStates(companyIds?: string[]) {
  const companyFilter = companyIds?.length ? { companyId: { in: companyIds } } : {};
  const mockAdapters = listOperationalAdapters().filter((adapter) => adapter.mock);
  const [connections, states, demoCompanies] = await Promise.all([
    prisma.operationalSystemConnection.findMany({
      where: companyFilter,
      select: { companyId: true, sourceCode: true, status: true, accessToken: true },
    }),
    prisma.operationalSourceState.findMany({ where: companyFilter }),
    prisma.company.findMany({
      where: { forceOperationalMockData: true, ...(companyIds?.length ? { id: { in: companyIds } } : {}) },
      select: { id: true, industrySectorCategory: true },
    }),
  ]);
  const stateKey = (companyId: string, sourceCode: string) => `${companyId}::${sourceCode}`;
  const stateByKey = new Map(states.map((state) => [stateKey(state.companyId, state.sourceCode), state]));
  const liveConnected = new Set(
    connections
      .filter(isLiveApiConnection)
      .map((connection) => stateKey(connection.companyId, connection.sourceCode)),
  );
  const wanted = new Set<string>();
  for (const connection of connections) {
    const key = stateKey(connection.companyId, connection.sourceCode);
    if (liveConnected.has(key)) continue;
    if (mockAdapters.some((adapter) => adapter.sourceCode === connection.sourceCode && !adapter.mockEligible)) wanted.add(key);
  }
  for (const company of demoCompanies) {
    const sector = String(company.industrySectorCategory || '').trim();
    for (const adapter of mockAdapters) {
      if (adapter.mockEligible || liveConnected.has(stateKey(company.id, adapter.sourceCode))) continue;
      if (getOperationalSourceDefinition(adapter.sourceCode)?.sectorCategories.includes(sector)) {
        wanted.add(stateKey(company.id, adapter.sourceCode));
      }
    }
  }

  const enabled: string[] = [];
  const disabled: string[] = [];
  const eligibilityAdapters = mockAdapters.filter((adapter) => adapter.mockEligible);
  const companiesToCheck = companyIds?.length
    ? companyIds
    : [...new Set([...demoCompanies.map((company) => company.id), ...states.map((state) => state.companyId)])];
  for (const adapter of eligibilityAdapters) {
    for (const companyId of companiesToCheck) {
      const eligible = await adapter.mockEligible!(companyId);
      const state = stateByKey.get(stateKey(companyId, adapter.sourceCode));
      if (eligible && !state?.liveSince && !state?.mockEnabled) {
        await setOperationalSourceMockEnabled(companyId, adapter.sourceCode, true);
        enabled.push(stateKey(companyId, adapter.sourceCode));
      } else if (!eligible && state?.mockEnabled) {
        await setOperationalSourceMockEnabled(companyId, adapter.sourceCode, false);
        disabled.push(stateKey(companyId, adapter.sourceCode));
      }
    }
  }

  for (const key of wanted) {
    if (stateByKey.has(key)) continue;
    const [companyId, sourceCode] = key.split('::');
    await prisma.operationalSourceState.create({ data: { companyId, sourceCode, mockEnabled: true } });
    enabled.push(key);
  }
  for (const state of states) {
    const key = stateKey(state.companyId, state.sourceCode);
    const adapter = getOperationalAdapter(state.sourceCode);
    if (!state.mockEnabled || adapter?.mockEligible || wanted.has(key)) continue;
    await setOperationalSourceMockEnabled(state.companyId, state.sourceCode, false);
    disabled.push(key);
  }
  return { enabled, disabled };
}

/** Refresh mock data once per EST day for every company + source still on mock. */
export async function runDueOperationalMockRefreshes(limit = 15): Promise<OperationalRunResult[]> {
  const today = formatEstDate();
  const states = await prisma.operationalSourceState.findMany({
    where: { mockEnabled: true, liveSince: null },
    orderBy: [{ lastMockRunAt: { sort: 'asc', nulls: 'first' } }],
    take: limit * 4,
  });
  const due = states.filter((state) => !state.lastMockRunAt || formatEstDate(state.lastMockRunAt) < today).slice(0, limit);
  const results: OperationalRunResult[] = [];
  for (const state of due) {
    results.push(await runOperationalSource({ companyId: state.companyId, sourceCode: state.sourceCode, mode: 'MOCK' }));
  }
  return results;
}
