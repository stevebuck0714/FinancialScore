/**
 * Contract every operational data source implements (API connector, spreadsheet upload,
 * or mock generator). Sources never write to the database directly; they return rows and
 * the shared writer in ./store.ts persists them into OperationalDataset / OperationalRecord.
 */

export type OperationalDataMode = 'LIVE' | 'MOCK';

export type OperationalDatasetGrain = 'flow' | 'point_in_time';

export type OperationalColumnType = 'string' | 'number' | 'date' | 'boolean';

export type OperationalColumnDef = {
  name: string;
  description?: string;
  type?: OperationalColumnType;
  /** Personal / restricted fields (names of individuals, SSN, bank, contact info). Never stored. */
  sensitive?: boolean;
};

export type OperationalDatasetSchema = {
  /** Globally unique, `<source>.<dataset>` (e.g. `hubspot.deals`). */
  key: string;
  label: string;
  /** Shown to Ask Corelytics; explain what one row means and how measures should be combined. */
  description: string;
  grain: OperationalDatasetGrain;
  dimensions: OperationalColumnDef[];
  measures: OperationalColumnDef[];
  attributes?: OperationalColumnDef[];
};

export type OperationalScalar = string | number | boolean | null;

export type OperationalRecordInput = {
  /** YYYY-MM-DD calendar date the row describes (activity date or snapshot as-of date). */
  date: string;
  /** Stable identity within the dataset; re-sending the same id updates the row. */
  externalId?: string;
  dimensions?: Record<string, OperationalScalar | undefined>;
  measures?: Record<string, number | null | undefined>;
  attributes?: Record<string, OperationalScalar | undefined>;
};

export type OperationalSyncWindow = {
  startDate: string;
  endDate: string;
};

export type OperationalSourceContext = {
  companyId: string;
  window: OperationalSyncWindow;
};

/**
 * Rows keyed by dataset key. `replaceWindow` datasets have all rows of the same mode inside
 * the window deleted before writing, so records removed upstream disappear here too.
 */
export type OperationalSourceOutput = Record<
  string,
  {
    rows: OperationalRecordInput[];
    replaceWindow?: boolean;
    window?: OperationalSyncWindow;
    /** Schema for this run; required for `dynamicDatasets` adapters, ignored otherwise. */
    schema?: OperationalDatasetSchema;
  }
>;

/**
 * How far back a source can supply data:
 * - `range`: `sync` honors any window and returns the history inside it (date-range sync / backfill);
 * - `snapshot`: the upstream system only exposes current state, so history accumulates from the first sync;
 * - `file`: history is whatever the uploaded file contains;
 * - `none`: no live data (mock or demo only).
 */
export type OperationalHistoryMode = 'range' | 'snapshot' | 'file' | 'none';

export type OperationalSourceAdapter = {
  sourceCode: string;
  provider: string;
  label: string;
  history: OperationalHistoryMode;
  /** Plain-language limits of the history this source can supply (shown next to date-range sync). */
  historyNote?: string;
  /** Days pulled on the first live sync when the connection has no Initial Sync Start Date (default 365). */
  defaultHistoryDays?: number;
  /** Lowercase prefix for every dataset key this source writes (`<prefix>.<dataset>`). */
  datasetPrefix: string;
  datasets: OperationalDatasetSchema[];
  /** Datasets are discovered from each run's data (mock payloads, uploaded workbooks). */
  dynamicDatasets?: boolean;
  /** Spreadsheet sources: uploaded workbooks are stored as live data. */
  acceptsWorkbookUpload?: boolean;
  /** Sources whose data already lands in typed tables Ask Corelytics queries directly. */
  builtInAskDatasets?: string[];
  /** Days of history to pull on each scheduled live sync (default 7). */
  defaultSyncLookbackDays?: number;
  /** Days of history to generate on each mock refresh (default 400). */
  defaultMockLookbackDays?: number;
  sync?: (context: OperationalSourceContext) => Promise<OperationalSourceOutput>;
  mock?: (context: OperationalSourceContext) => Promise<OperationalSourceOutput>;
  /** Mock data is only stored while this returns true (e.g. company is in demo mode). */
  mockEligible?: (companyId: string) => Promise<boolean>;
};
