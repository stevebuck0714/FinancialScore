import * as XLSX from 'xlsx';
import { formatEstDate } from '@/lib/time/eastern';
import type {
  OperationalColumnDef,
  OperationalDatasetSchema,
  OperationalRecordInput,
  OperationalScalar,
  OperationalSourceOutput,
} from './types';

/**
 * Turns a source payload (mock builder output, API snapshot, parsed workbook) into datasets.
 * Every array of records becomes one dataset; a flat object of numbers (e.g. `summary`)
 * becomes a one-row dataset. Columns are inferred: numbers are measures, everything else is
 * a dimension. Sensitive personal fields are flagged so the writer never stores them.
 */

/** Contact, government-id, bank, birthdate and home-address fields: never stored for any source. */
const SENSITIVE_KEY_PATTERN =
  /(e-?mail|phone|mobile|fax|ssn|social_?security|birth|dob$|street|address|zip|postal|bank|routing|accountnumber|account_number|passport|driverslicense|driver_license|taxid|tax_id)/i;
const SENSITIVE_EXACT_KEYS = new Set(['ein', 'fein', 'dob', 'tin', 'sin']);

/**
 * Names of individual employees, applicants, borrowers and contacts: never stored.
 * Business-role names (sales rep / owner, loan officer, agent, foreman, processor,
 * account manager) are kept so Ask can rank performance.
 */
const PERSON_NAME_KEYS = new Set(
  [
    'firstName', 'lastName', 'middleName', 'preferredName', 'displayName', 'fullName', 'legalName', 'nickname',
    'employee', 'employeeName', 'applicant', 'applicantName', 'candidate', 'candidateName', 'borrower', 'borrowerName',
    'coBorrower', 'coBorrowerName', 'contact', 'contactName', 'custodian', 'custodianName', 'worker', 'workerName',
    'personName', 'patientName', 'tenantName', 'residentName', 'beneficiary', 'dependentName', 'spouseName',
  ].map((key) => key.toLowerCase()),
);

/** A row dated by one of these is a balance/snapshot as of that date, not activity on it. */
const SNAPSHOT_DATE_KEYS = new Set(['snapshotDate', 'asOfDate', 'asOf']);
const DATE_KEYS = [
  'date', 'snapshotDate', 'asOfDate', 'asOf', 'periodStart', 'period', 'month', 'monthKey', 'monthStart', 'weekStart', 'week',
  'day', 'runDate', 'payDate', 'checkDate', 'eventDate', 'closeDate', 'closedate', 'fundedDate', 'createdDate', 'createdAt',
  'timestamp',
];
const RESERVED_COLUMNS = new Set(['date', 'companyId', 'dataMode']);
const MAX_COLUMNS = 80;
const DEFAULT_MAX_ROWS = 20000;
const SKIPPED_TOP_LEVEL_KEYS = new Set(['meta', '_meta', 'isMockData', 'hasData']);

export type PayloadSectionOverride = {
  label?: string;
  description?: string;
  /** Field holding the row date; `null` forces a point-in-time snapshot dated `asOf`. */
  dateField?: string | null;
  grain?: 'flow' | 'point_in_time';
  /** Fields that uniquely identify a row (otherwise row position is used). */
  idFields?: string[];
  skip?: boolean;
};

export type PayloadToOutputOptions = {
  prefix: string;
  sourceLabel: string;
  /** YYYY-MM-DD date used for rows without a date of their own. */
  asOf: string;
  /** `all`: each run replaces every row of the dataset (mock data). `range`: replaces only the dates it covers. */
  replace: 'all' | 'range';
  extraSensitiveKeys?: string[];
  sections?: Record<string, PayloadSectionOverride>;
  maxRowsPerDataset?: number;
};

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

const isScalar = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value) || value instanceof Date;

function snake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

function humanize(path: string): string {
  return path.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function toColumnName(raw: string): string {
  const parts = String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let name = parts
    .map((part, index) => (index === 0 ? part.charAt(0).toLowerCase() + part.slice(1) : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
  if (!name) name = 'column';
  if (!/^[A-Za-z]/.test(name)) name = `c${name}`;
  name = name.slice(0, 58);
  return RESERVED_COLUMNS.has(name) ? `${name}Value` : name;
}

function isSensitiveKey(key: string, extra: Set<string>): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERN.test(key) || SENSITIVE_EXACT_KEYS.has(lower) || PERSON_NAME_KEYS.has(lower) || extra.has(lower);
}

/** YYYY-MM-DD for a date-like value; ISO instants and epoch ms are converted to the EST calendar date. */
export function toDateKey(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : formatEstDate(value);
  if (typeof value === 'number') {
    if (value > 1e11 && value < 1e14) return formatEstDate(new Date(value));
    return null;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : formatEstDate(parsed);
  }
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{13}$/.test(raw)) return formatEstDate(new Date(Number(raw)));
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return null;
}

function flattenRow(row: PlainObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (isScalar(value)) out[key] = value;
    else if (isPlainObject(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (isScalar(childValue)) out[`${key}_${childKey}`] = childValue;
      }
    }
  }
  return out;
}

function discoverSections(payload: unknown): Array<{ path: string; rows: PlainObject[] }> {
  const sections: Array<{ path: string; rows: PlainObject[] }> = [];
  const walk = (value: unknown, path: string[], depth: number) => {
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (depth === 0 && SKIPPED_TOP_LEVEL_KEYS.has(key)) continue;
      const childPath = [...path, key];
      if (Array.isArray(child)) {
        const rows = child.filter(isPlainObject);
        if (rows.length) sections.push({ path: childPath.join('_'), rows });
      } else if (isPlainObject(child)) {
        const values = Object.values(child);
        const flat = values.length > 0 && values.every((item) => isScalar(item) || isPlainObject(item));
        const hasNumber = values.some((item) => typeof item === 'number');
        const hasNested = values.some((item) => Array.isArray(item) || (isPlainObject(item) && Object.values(item).some((v) => !isScalar(v))));
        if (flat && hasNumber && !hasNested) sections.push({ path: childPath.join('_'), rows: [child] });
        else if (depth < 2) walk(child, childPath, depth + 1);
      }
    }
  };
  walk(payload, [], 0);
  return sections;
}

function pickDateField(rows: Record<string, unknown>[], keys: string[]): string | null {
  const candidates = [...DATE_KEYS.filter((key) => keys.includes(key)), ...keys.filter((key) => /date$/i.test(key) && !DATE_KEYS.includes(key))];
  for (const key of candidates) {
    const sample = rows.slice(0, 200);
    const parsed = sample.filter((row) => toDateKey(row[key])).length;
    if (sample.length && parsed / sample.length >= 0.8) return key;
  }
  return null;
}

function buildSection(
  path: string,
  sourceRows: PlainObject[],
  options: PayloadToOutputOptions,
  extraSensitive: Set<string>,
): { key: string; schema: OperationalDatasetSchema; rows: OperationalRecordInput[] } | null {
  const override = options.sections?.[path] || {};
  if (override.skip) return null;
  const flatRows = sourceRows.slice(0, options.maxRowsPerDataset ?? DEFAULT_MAX_ROWS).map(flattenRow);
  const rawKeys = [...new Set(flatRows.flatMap((row) => Object.keys(row)))];
  const dateField = override.dateField === null ? null : override.dateField || pickDateField(flatRows, rawKeys);

  const columns = new Map<string, { raw: string; numeric: boolean; sensitive: boolean }>();
  for (const raw of rawKeys) {
    if (raw === dateField) continue;
    const values = flatRows.map((row) => row[raw]).filter((value) => value !== null && value !== undefined && value !== '');
    if (!values.length) continue;
    let name = toColumnName(raw);
    while (columns.has(name)) name = `${name}2`;
    columns.set(name, {
      raw,
      numeric: values.every((value) => typeof value === 'number' && Number.isFinite(value)),
      sensitive: isSensitiveKey(raw, extraSensitive),
    });
    if (columns.size >= MAX_COLUMNS) break;
  }

  const dimensions: OperationalColumnDef[] = [];
  const measures: OperationalColumnDef[] = [];
  for (const [name, column] of columns) {
    const def: OperationalColumnDef = { name, sensitive: column.sensitive || undefined };
    if (column.numeric) measures.push({ ...def, type: 'number' });
    else dimensions.push({ ...def, type: 'string' });
  }

  const datasetKey = `${options.prefix}.${snake(path)}`;
  const grain = override.grain || (dateField && !SNAPSHOT_DATE_KEYS.has(dateField) ? 'flow' : 'point_in_time');
  const schema: OperationalDatasetSchema = {
    key: datasetKey,
    label: override.label || `${options.sourceLabel} — ${humanize(snake(path))}`,
    description:
      override.description ||
      `${options.sourceLabel}: ${humanize(snake(path))}. ${
        grain === 'flow'
          ? `One row per record, dated by its ${dateField}; measures can be summed over a date range.`
          : `Point-in-time snapshot; each row is one item as of the snapshot date (do not sum across dates).`
      }`,
    grain,
    dimensions,
    measures,
  };

  const rows: OperationalRecordInput[] = flatRows.map((row, index) => {
    const date = (dateField && toDateKey(row[dateField])) || options.asOf;
    const record: OperationalRecordInput = { date, dimensions: {}, measures: {} };
    for (const [name, column] of columns) {
      if (column.sensitive) continue;
      const value = row[column.raw];
      if (value === null || value === undefined || value === '') continue;
      if (column.numeric) record.measures![name] = value as number;
      else record.dimensions![name] = (value instanceof Date ? toDateKey(value) : String(value)) as OperationalScalar;
    }
    const idParts = override.idFields?.map((field) => String(row[field] ?? '')).filter(Boolean);
    record.externalId = idParts?.length ? `${date}|${idParts.join('|')}` : `${date}|${index}`;
    return record;
  });
  return { key: datasetKey, schema, rows };
}

export function payloadToOutput(payload: unknown, options: PayloadToOutputOptions): OperationalSourceOutput {
  const extraSensitive = new Set((options.extraSensitiveKeys || []).map((key) => key.toLowerCase()));
  const output: OperationalSourceOutput = {};
  for (const section of discoverSections(payload)) {
    const built = buildSection(section.path, section.rows, options, extraSensitive);
    if (!built || !built.rows.length || !(built.schema.dimensions.length + built.schema.measures.length)) continue;
    const dates = built.rows.map((row) => row.date).sort();
    output[built.key] = {
      rows: built.rows,
      schema: built.schema,
      replaceWindow: true,
      window:
        options.replace === 'all'
          ? { startDate: '1900-01-01', endDate: '2999-12-31' }
          : { startDate: dates[0], endDate: dates[dates.length - 1] },
    };
  }
  return output;
}

function excelSerialToDateKey(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !parsed.y) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
}

/** Any uploaded workbook: each sheet becomes a dataset; the first row with 2+ text cells is the header. */
export function workbookToOutput(workbook: XLSX.WorkBook, options: Omit<PayloadToOutputOptions, 'sections'>): OperationalSourceOutput {
  const sheets: Record<string, PlainObject[]> = {};
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
    const headerIndex = grid.slice(0, 25).findIndex((row) => (row || []).filter((cell) => typeof cell === 'string' && cell.trim()).length >= 2);
    if (headerIndex < 0) continue;
    const seen = new Map<string, number>();
    const headers = (grid[headerIndex] || []).map((cell, index) => {
      const base = typeof cell === 'string' && cell.trim() ? cell.trim() : `column ${index + 1}`;
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count > 1 ? `${base} ${count}` : base;
    });
    const dateLike = headers.map((header) => /date|month|period|week|day/i.test(header));
    const rows = grid
      .slice(headerIndex + 1)
      .filter((row) => (row || []).some((cell) => cell !== null && cell !== ''))
      .map((row) => {
        const record: PlainObject = {};
        headers.forEach((header, index) => {
          let value = (row || [])[index] ?? null;
          if (typeof value === 'number' && dateLike[index] && value > 20000 && value < 80000) value = excelSerialToDateKey(value);
          if (typeof value === 'string') value = value.trim();
          record[header] = value;
        });
        return record;
      });
    if (rows.length) sheets[sheetName] = rows;
  }

  const normalized: Record<string, PlainObject[]> = {};
  const sections: Record<string, PayloadSectionOverride> = {};
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const path = snake(sheetName) || 'sheet';
    normalized[path] = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toColumnName(key), value])));
    sections[path] = {
      label: `${options.sourceLabel} — ${sheetName}`,
      description: `${options.sourceLabel} upload, sheet "${sheetName}". Rows without a date column are dated by the upload date.`,
    };
  }
  return payloadToOutput(normalized, { ...options, sections });
}
