import * as XLSX from 'xlsx';
import { normalizeHtsCode, normalizeItemSku, type CompanyItemDutyPatch, type CompanyItemDutyRow } from '@/lib/hts/item-duty-overlay';
import { skuLookupKeys } from '@/lib/operational/apr-sgp-gmpa';

type TariffField =
  | 'htsCode'
  | 'specialHtsCode'
  | 'section301HtsCode'
  | 'section232HtsCode'
  | 'ieepaHtsCode'
  | 'additionalHtsCode'
  | 'countryOfOrigin';

type ParsedImportRow = {
  rowNumber: number;
  itemSku: string;
  values: Partial<Record<TariffField, string>>;
};

export type TariffImportPreview = {
  sheetName: string;
  totalRows: number;
  matched: number;
  unchanged: number;
  unmatched: Array<{ rowNumber: number; itemSku: string }>;
  ambiguous: Array<{ rowNumber: number; itemSku: string; matches: string[] }>;
  duplicates: Array<{ itemSku: string; rowNumbers: number[] }>;
  invalid: Array<{ rowNumber: number; itemSku: string; message: string }>;
  patches: CompanyItemDutyPatch[];
};

const HEADER_FIELDS: Array<{ field: TariffField; names: string[] }> = [
  // `tariffs by items.xlsx` uses a top D1–D5 HTS band, with these labels in
  // the actual header row: duty, IEEPA, 2.32, 3.01, Special, and Other.
  { field: 'htsCode', names: ['hts', 'htscode', 'hts10', 'htsnumber', 'dutyhts', 'dutyhtscode', 'duty', 'd1', 'd1htsnumber'] },
  { field: 'specialHtsCode', names: ['specialhts', 'specialhtscode', 'special', 'd5', 'd5htsnumber'] },
  { field: 'section301HtsCode', names: ['301hts', 'section301hts', 'section301htscode', '301', '3010', 'd4', 'd4htsnumber'] },
  { field: 'section232HtsCode', names: ['232hts', 'section232hts', 'section232htscode', '232', 'd3', 'd3htsnumber'] },
  { field: 'ieepaHtsCode', names: ['ieepahts', 'ieepahtscode', 'ieepa', 'd2', 'd2htsnumber'] },
  { field: 'additionalHtsCode', names: ['otherhts', 'additionalhts', 'additionalhtscode', 'other'] },
  { field: 'countryOfOrigin', names: ['origin', 'countryoforigin', 'countryorigin'] },
];

function normalizedHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readCell(value: unknown): string {
  return String(value ?? '').trim();
}

function readRows(buffer: ArrayBuffer): { sheetName: string; rows: ParsedImportRow[] } {
  const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer', cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
    const headerIndex = matrix.findIndex((row) => {
      const headers = new Set((row || []).map(normalizedHeader));
      return ['item', 'itemnumber', 'itemno', 'sku', 'itemid'].some((name) => headers.has(name));
    });
    if (headerIndex < 0) continue;

    const headers = (matrix[headerIndex] || []).map(normalizedHeader);
    const itemIndex = headers.findIndex((header) => ['item', 'itemnumber', 'itemno', 'sku', 'itemid'].includes(header));
    const fieldIndexes = new Map<TariffField, number>();
    for (const { field, names } of HEADER_FIELDS) {
      const index = headers.findIndex((header) => names.includes(header));
      if (index >= 0) fieldIndexes.set(field, index);
    }
    if (itemIndex < 0 || !fieldIndexes.size) continue;

    const rows: ParsedImportRow[] = [];
    for (let index = headerIndex + 1; index < matrix.length; index += 1) {
      const source = matrix[index] || [];
      const itemSku = normalizeItemSku(readCell(source[itemIndex]));
      if (!itemSku) continue;
      const values: Partial<Record<TariffField, string>> = {};
      for (const [field, fieldIndex] of fieldIndexes) {
        const value = readCell(source[fieldIndex]);
        if (value) values[field] = value;
      }
      if (Object.keys(values).length) rows.push({ rowNumber: index + 1, itemSku, values });
    }
    return { sheetName, rows };
  }
  throw new Error('No worksheet contains an Item #/SKU column and at least one HTS or origin column.');
}

function valuesEqual(left: Partial<Record<TariffField, string>>, right: Partial<Record<TariffField, string>>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Array.from(keys).every((key) => left[key as TariffField] === right[key as TariffField]);
}

export function previewTariffItemImport(buffer: ArrayBuffer, dutyItems: CompanyItemDutyRow[]): TariffImportPreview {
  const parsed = readRows(buffer);
  const itemsByLookup = new Map<string, CompanyItemDutyRow[]>();
  for (const item of dutyItems) {
    for (const key of skuLookupKeys(item.itemSku)) {
      const matches = itemsByLookup.get(key) || [];
      if (!matches.some((match) => match.id === item.id)) matches.push(item);
      itemsByLookup.set(key, matches);
    }
  }

  const groupedRows = new Map<string, ParsedImportRow[]>();
  for (const row of parsed.rows) {
    const key = row.itemSku.toUpperCase();
    const group = groupedRows.get(key) || [];
    group.push(row);
    groupedRows.set(key, group);
  }

  const unmatched: TariffImportPreview['unmatched'] = [];
  const ambiguous: TariffImportPreview['ambiguous'] = [];
  const duplicates: TariffImportPreview['duplicates'] = [];
  const invalid: TariffImportPreview['invalid'] = [];
  const patches: CompanyItemDutyPatch[] = [];
  let unchanged = 0;

  for (const rows of groupedRows.values()) {
    const first = rows[0];
    if (rows.length > 1) {
      if (!rows.every((row) => valuesEqual(row.values, first.values))) {
        duplicates.push({ itemSku: first.itemSku, rowNumbers: rows.map((row) => row.rowNumber) });
        continue;
      }
    }

    const matches = new Map<string, CompanyItemDutyRow>();
    for (const key of skuLookupKeys(first.itemSku)) {
      for (const item of itemsByLookup.get(key) || []) matches.set(item.id, item);
    }
    if (!matches.size) {
      unmatched.push({ rowNumber: first.rowNumber, itemSku: first.itemSku });
      continue;
    }
    if (matches.size > 1) {
      ambiguous.push({ rowNumber: first.rowNumber, itemSku: first.itemSku, matches: Array.from(matches.values()).map((item) => item.itemSku) });
      continue;
    }

    const patch: CompanyItemDutyPatch = { id: Array.from(matches.values())[0].id, itemSku: Array.from(matches.values())[0].itemSku };
    let changed = false;
    for (const [field, rawValue] of Object.entries(first.values) as Array<[TariffField, string]>) {
      const value = field === 'countryOfOrigin' ? rawValue : normalizeHtsCode(rawValue);
      if (field !== 'countryOfOrigin' && (!value || String(value).replace(/\D/g, '').length < 4)) {
        invalid.push({ rowNumber: first.rowNumber, itemSku: first.itemSku, message: `${field} is not a valid HTS code.` });
        continue;
      }
      const item = Array.from(matches.values())[0];
      if (String(item[field] || '') !== String(value || '')) {
        (patch as Record<string, unknown>)[field] = value;
        changed = true;
      }
    }
    if (changed) patches.push(patch);
    else unchanged += 1;
  }

  return {
    sheetName: parsed.sheetName,
    totalRows: parsed.rows.length,
    matched: patches.length,
    unchanged,
    unmatched,
    ambiguous,
    duplicates,
    invalid,
    patches,
  };
}
