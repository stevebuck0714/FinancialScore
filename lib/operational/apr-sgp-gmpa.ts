import * as XLSX from 'xlsx';
import { APR_SGP_DUTY_HTS_FALLBACK } from '@/lib/operational/apr-sgp-duty-hts-fallback';

export const APR_SGP_GMPA_SOURCE_CODE = 'APR_SGP_GMPA_FORECAST';
export const APR_SGP_GMPA_LABEL = 'APR SGP GMPA Forecast Worksheet';
const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

type MatrixCell = string | number | Date | boolean | null | undefined;

export type AprSgpGmpaRow = {
  itemId: string;
  customerId: string | null;
  customerName: string;
  customerGroup: string | null;
  customerPartNumber: string | null;
  sgpPrice: number | null;
  sgpMaterialCost: number | null;
  sgpTariffPerPiece: number | null;
  sgpDutiesPerPiece: number | null;
  sgpFreightPerPiece: number | null;
  sgpCostOfSales: number | null;
  sgpOperatingExpensesPerPiece: number | null;
  sgpFullyLoadedCost: number | null;
  sgpNetProfit: number | null;
  sgpNetProfitPct: number | null;
  sgpGrossMarginPct: number | null;
  currentPrice: number | null;
  updatedMaterialCost: number | null;
  projectedTariffPerPiece: number | null;
  projectedDutiesPerPiece: number | null;
  projectedFreightPerPiece: number | null;
  projectedCostOfSales: number | null;
  projectedOperatingExpensesPerPiece: number | null;
  projectedFullyLoadedCost: number | null;
  projectedNetProfit: number | null;
  projectedNetProfitPct: number | null;
  projectedGrossMarginPct: number | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  tradeProgram: string | null;
  qtyUnit: string | null;
};

export type ParsedAprSgpGmpaWorkbook = {
  sourceName: string;
  parsedAt: string;
  sheetNames: string[];
  sheetName: string;
  sourceDateIso: string;
  rowCount: number;
  customerCount: number;
  itemCount: number;
  rows: AprSgpGmpaRow[];
};

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function asDutyCode(value: unknown): string | null {
  const text = asString(value).toUpperCase();
  return text || null;
}

function asDutyDescription(value: unknown): string | null {
  const text = asString(value).replace(/\s+/g, ' ');
  return text || null;
}

function normalizeHeader(value: unknown): string {
  return asString(value).toLowerCase().replace(/\s+/g, ' ').replace(/[$()]/g, '').trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const text = asString(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findHeaderIndex(matrix: MatrixCell[][]): number {
  return matrix.findIndex((row) =>
    normalizeHeader(row?.[0]) === 'item' &&
    normalizeHeader(row?.[1]) === 'customer id' &&
    normalizeHeader(row?.[2]) === 'customer'
  );
}

function buildColumnMap(headerRow: MatrixCell[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function col(map: Map<string, number>, ...headers: string[]): number {
  for (const header of headers) {
    const index = map.get(normalizeHeader(header));
    if (index != null) return index;
  }
  return -1;
}

function colIncludes(map: Map<string, number>, ...parts: string[]): number {
  const needles = parts.map((part) => normalizeHeader(part));
  for (const [key, index] of map.entries()) {
    if (needles.every((needle) => key.includes(needle))) return index;
  }
  return -1;
}

function readString(row: MatrixCell[], index: number): string {
  return index >= 0 ? asString(row[index]) : '';
}

function readNumber(row: MatrixCell[], index: number): number | null {
  return index >= 0 ? asNumber(row[index]) : null;
}

export function normalizeAprSgpMatchToken(value: unknown): string {
  return asString(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

export function buildAprSgpMatchKeys(row: {
  customerId?: unknown;
  customerName?: unknown;
  itemId?: unknown;
  sku?: unknown;
  itemName?: unknown;
}): string[] {
  const item = normalizeAprSgpMatchToken(row.itemId || row.sku || row.itemName);
  const customerId = normalizeAprSgpMatchToken(row.customerId);
  const customerName = normalizeAprSgpMatchToken(row.customerName);
  return [
    customerId && item ? `ID:${customerId}|ITEM:${item}` : '',
    customerName && item ? `NAME:${customerName}|ITEM:${item}` : '',
  ].filter(Boolean);
}

export function buildAprSgpItemCustomerPartKeys(row: {
  itemId?: unknown;
  sku?: unknown;
  itemName?: unknown;
  customerPartNumber?: unknown;
  aprSgpCustomerPartNumber?: unknown;
}): string[] {
  const item = normalizeAprSgpMatchToken(row.itemId || row.sku || row.itemName);
  const customerPartNumber = normalizeAprSgpMatchToken(row.customerPartNumber || row.aprSgpCustomerPartNumber);
  return item && customerPartNumber ? [`ITEM:${item}|CUSTOMER_PART:${customerPartNumber}`] : [];
}

function formatHtsNumber(value: unknown): string | null {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (digits.length < 4 || digits.length > 10) return String(value ?? '').trim() || null;
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  if (digits.length <= 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8)}`;
}

function itemKey(value: unknown): string {
  return asString(value).toUpperCase().replace(/\s+/g, ' ');
}

const ORIGIN_NAME_TO_CODE: Record<string, string> = {
  CHINA: 'CN',
  CHN: 'CN',
  PRC: 'CN',
  "PEOPLE'S REPUBLIC OF CHINA": 'CN',
  'SOUTH KOREA': 'KR',
  KOREA: 'KR',
  'REPUBLIC OF KOREA': 'KR',
  'UNITED STATES': 'US',
  USA: 'US',
  'UNITED STATES OF AMERICA': 'US',
  TAIWAN: 'TW',
  'HONG KONG': 'HK',
  VIETNAM: 'VN',
  MEXICO: 'MX',
  CANADA: 'CA',
  JAPAN: 'JP',
  INDIA: 'IN',
  GERMANY: 'DE',
  INDONESIA: 'ID',
};

export function normalizeOriginCode(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s+/g, ' ');
  if (upper.length === 2) return upper;
  return ORIGIN_NAME_TO_CODE[upper] || raw;
}

export type SpreadsheetDutyIdentity = {
  itemSku: string;
  htsCode: string | null;
  countryOfOrigin: string | null;
  vendorName: string | null;
  dutyCode: string | null;
  dutyDescription: string | null;
};

export function pickDutyTariffSheetNameFromList(names: string[]): string | null {
  return (
    names.find((name) => /updated duty\s*&\s*tariffs/i.test(name)) ||
    names.find((name) => /current duty\s*&\s*tariffs/i.test(name)) ||
    names.find((name) => /sgp duty\s*&\s*tariffs/i.test(name)) ||
    names.find((name) => /duty\s*&\s*tariffs/i.test(name)) ||
    names.find((name) => /duty/i.test(name) && /tariff/i.test(name)) ||
    null
  );
}

function pickDutyTariffSheetName(workbook: XLSX.WorkBook): string | null {
  return pickDutyTariffSheetNameFromList(workbook.SheetNames || []);
}

export function skuLookupKeys(sku: unknown): string[] {
  const raw = asString(sku).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const keys = new Set<string>([raw, raw.replace(/[^A-Z0-9]/g, '')]);
  const parts = raw.split(/[-_/]/).filter(Boolean);
  for (let count = parts.length; count >= 2; count -= 1) {
    const dashed = parts.slice(0, count).join('-');
    const compact = parts.slice(0, count).join('');
    if (compact.replace(/[^A-Z0-9]/g, '').length >= 8) {
      keys.add(dashed);
      keys.add(compact);
    }
  }
  return Array.from(keys).sort((left, right) => right.length - left.length);
}

function mergeDutyHeaderRow(matrix: MatrixCell[][], headerIndex: number): MatrixCell[] {
  const base = [...(matrix[headerIndex] || [])];
  const extra = matrix[headerIndex + 1] || [];
  extra.forEach((cell, index) => {
    const bottom = asString(cell);
    if (!bottom) return;
    const top = asString(base[index]);
    const bottomKey = normalizeHeader(bottom);
    if (!top) {
      base[index] = cell;
      return;
    }
    if (bottomKey.includes('hts') || bottomKey === 'coo' || bottomKey === 'item' || bottomKey.includes('origin')) {
      if (!normalizeHeader(top).includes(bottomKey)) base[index] = `${top} ${bottom}`;
    }
  });
  return base;
}

function rowLooksLikeDutyHeader(headers: string[]): boolean {
  const hasItem = headers.some((header) => header === 'item' || header === 'apr p/n' || header === 'apr pn');
  const hasHts = headers.some((header) => header.includes('hts'));
  return hasItem && hasHts;
}

function findDutyHeaderIndex(matrix: MatrixCell[][]): number {
  const positional = matrix.findIndex((row) => {
    const vendor = normalizeHeader(row?.[0]);
    const item = normalizeHeader(row?.[5]);
    return vendor === 'vendor #' && item === 'item';
  });
  if (positional >= 0) return positional;
  for (let index = 0; index < Math.min(matrix.length, 40); index += 1) {
    const merged = mergeDutyHeaderRow(matrix, index).map((cell) => normalizeHeader(cell));
    if (rowLooksLikeDutyHeader(merged)) return index;
  }
  return -1;
}

function rememberDutyIdentity(
  byItem: Map<string, SpreadsheetDutyIdentity>,
  itemId: string,
  htsCode: string | null,
  countryOfOrigin: string | null,
  vendorName: string | null,
  dutyCode?: string | null,
  dutyDescription?: string | null
) {
  const key = itemKey(itemId);
  if (!key) return;
  const nextCode = asDutyCode(dutyCode);
  const nextDescription = asDutyDescription(dutyDescription);
  const existing = byItem.get(key);
  if (!existing) {
    byItem.set(key, {
      itemSku: itemId,
      htsCode,
      countryOfOrigin: normalizeOriginCode(countryOfOrigin),
      vendorName,
      dutyCode: nextCode,
      dutyDescription: nextDescription,
    });
    return;
  }
  existing.htsCode = existing.htsCode || htsCode;
  existing.countryOfOrigin = existing.countryOfOrigin || normalizeOriginCode(countryOfOrigin);
  existing.vendorName = existing.vendorName || vendorName;
  existing.dutyCode = existing.dutyCode || nextCode;
  existing.dutyDescription = existing.dutyDescription || nextDescription;
}

export function parseAprSgpDutyTariffItems(workbook: XLSX.WorkBook): SpreadsheetDutyIdentity[] {
  const byItem = new Map<string, SpreadsheetDutyIdentity>();
  const sheetName = pickDutyTariffSheetName(workbook);
  if (!sheetName || !workbook.Sheets[sheetName]) return [];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(workbook.Sheets[sheetName], { header: 1, raw: true, blankrows: false });
  const headerIndex = findDutyHeaderIndex(matrix);
  if (headerIndex < 0) return [];
  const columnMap = buildColumnMap(mergeDutyHeaderRow(matrix, headerIndex));
  const itemId =
    col(columnMap, 'Item', 'APR P/N', 'APR PN', 'APR P N', 'P/N', 'PN', 'Part Number') >= 0
      ? col(columnMap, 'Item', 'APR P/N', 'APR PN', 'APR P N', 'P/N', 'PN', 'Part Number')
      : colIncludes(columnMap, 'apr p/n') >= 0
        ? colIncludes(columnMap, 'apr p/n')
        : colIncludes(columnMap, 'item');
  const htsCode =
    col(columnMap, '(D1) HTS Number', 'D1 HTS Number', 'HTS Number', 'HTS-10', 'HTS Code', 'HTS', 'Harmonized') >= 0
      ? col(columnMap, '(D1) HTS Number', 'D1 HTS Number', 'HTS Number', 'HTS-10', 'HTS Code', 'HTS', 'Harmonized')
      : colIncludes(columnMap, 'd1', 'hts') >= 0
        ? colIncludes(columnMap, 'd1', 'hts')
        : colIncludes(columnMap, 'hts');
  const countryOfOrigin =
    col(columnMap, 'COO', 'Country of Origin', 'Origin', 'Current Vendor COO', 'Vendor COO') >= 0
      ? col(columnMap, 'COO', 'Country of Origin', 'Origin', 'Current Vendor COO', 'Vendor COO')
      : colIncludes(columnMap, 'coo');
  const indexes = {
    vendorName: col(columnMap, 'Vendor Name', 'Vendor'),
    countryOfOrigin,
    itemId,
    htsCode,
    dutyCode: col(columnMap, '(D1) Code', 'D1 Code', 'Duty Code'),
    dutyDescription: col(columnMap, 'Description'),
  };
  if (indexes.itemId < 0 || indexes.htsCode < 0) return [];
  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const itemId = readString(row, indexes.itemId);
    if (!itemId) continue;
    rememberDutyIdentity(
      byItem,
      itemId,
      formatHtsNumber(readString(row, indexes.htsCode)),
      readString(row, indexes.countryOfOrigin) || null,
      readString(row, indexes.vendorName) || null,
      readString(row, indexes.dutyCode) || null,
      readString(row, indexes.dutyDescription) || null
    );
  }
  return Array.from(byItem.values());
}

function parseDutyTariffItems(workbook: XLSX.WorkBook): Map<string, SpreadsheetDutyIdentity> {
  const byItem = new Map<string, SpreadsheetDutyIdentity>();
  for (const item of parseAprSgpDutyTariffItems(workbook)) {
    byItem.set(itemKey(item.itemSku), item);
  }
  return byItem;
}

export function compactDutyHtsFromRows(rows: Array<{
  itemId?: unknown;
  itemSku?: unknown;
  htsCode?: unknown;
  countryOfOrigin?: unknown;
  customerName?: unknown;
  vendorName?: unknown;
  dutyCode?: unknown;
  dutyDescription?: unknown;
}>): SpreadsheetDutyIdentity[] {
  const byItem = new Map<string, SpreadsheetDutyIdentity>();
  for (const row of rows) {
    const itemId = asString(row.itemSku || row.itemId);
    if (!itemId) continue;
    rememberDutyIdentity(
      byItem,
      itemId,
      formatHtsNumber(row.htsCode),
      asString(row.countryOfOrigin) || null,
      asString(row.vendorName || row.customerName) || null,
      asString(row.dutyCode) || null,
      asString(row.dutyDescription) || null
    );
  }
  return Array.from(byItem.values()).filter((item) => item.htsCode || item.countryOfOrigin || item.dutyCode);
}

function applyDutyIdentities(rows: AprSgpGmpaRow[], identities: SpreadsheetDutyIdentity[]): AprSgpGmpaRow[] {
  if (!identities.length) return rows;
  const byKey = new Map(identities.map((item) => [itemKey(item.itemSku), item]));
  const next = rows.map((row) => {
    const hit = byKey.get(itemKey(row.itemId));
    if (!hit) return row;
    return {
      ...row,
      htsCode: row.htsCode || hit.htsCode,
      countryOfOrigin: hit.countryOfOrigin || row.countryOfOrigin,
    };
  });
  const seen = new Set(next.map((row) => itemKey(row.itemId)));
  for (const hit of identities) {
    if (seen.has(itemKey(hit.itemSku))) continue;
    if (!hit.htsCode && !hit.countryOfOrigin) continue;
    next.push(emptyDutySeedRow(hit.itemSku, hit.vendorName || 'Duty & Tariffs', hit.htsCode, hit.countryOfOrigin));
    seen.add(itemKey(hit.itemSku));
  }
  return next;
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function identitiesFromMetadata(metadata: Record<string, unknown>): SpreadsheetDutyIdentity[] {
  const compact = Array.isArray(metadata.aprSgpDutyHtsByItem) ? metadata.aprSgpDutyHtsByItem : [];
  const parsed = asMetadataRecord(metadata.aprSgpGmpaParsedWorkbook);
  const parsedRows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const freight = asMetadataRecord(metadata.aprSgpFreightParsed);
  const freightRows = Array.isArray(freight.rows) ? (freight.rows as Array<Record<string, unknown>>) : [];
  return compactDutyHtsFromRows([
    ...compact,
    ...parsedRows,
    ...freightRows.map((row) => ({
      itemSku: row.itemSku || row.aprPn || row.itemId,
      htsCode: row.htsCode,
      countryOfOrigin: row.countryOfOrigin || row.vendorCoo,
      vendorName: row.vendorName,
    })),
  ]);
}

async function persistDutyIdentities(companyId: string, identities: SpreadsheetDutyIdentity[]): Promise<void> {
  if (!identities.length) return;
  const { getOperationalSystemConnection, saveOperationalSystemConnection } = await import(
    '@/lib/operational/operational-system-connections'
  );
  const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
  if (!connection) return;
  await saveOperationalSystemConnection({
    companyId,
    provider: 'SPREADSHEET_UPLOAD',
    sourceCode: APR_SGP_GMPA_SOURCE_CODE,
    status: connection.status,
    authType: connection.authType,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    tokenExpiresAt: connection.tokenExpiresAt,
    baseUrl: connection.baseUrl,
    lastSyncAt: connection.lastSyncAt,
    autoSync: connection.autoSync,
    syncFrequency: connection.syncFrequency,
    connectionMetadata: {
      ...asMetadataRecord(connection.connectionMetadata),
      aprSgpDutyHtsByItem: identities,
    },
    errorMessage: connection.errorMessage,
  });
}

async function parseDutySheetFromBlob(blobUrl: string, knownSheetNames?: string[]): Promise<SpreadsheetDutyIdentity[]> {
  const response = await fetch(blobUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) return [];
  const buffer = Buffer.from(await response.arrayBuffer());
  const preview = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
  const sheetName =
    pickDutyTariffSheetNameFromList(preview.SheetNames || []) ||
    pickDutyTariffSheetNameFromList(knownSheetNames || []);
  if (!sheetName) return [];
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, sheets: [sheetName] });
  return parseAprSgpDutyTariffItems(workbook);
}

async function loadDutyIdentitiesFromBlob(
  companyId: string,
  metadata: Record<string, unknown>
): Promise<SpreadsheetDutyIdentity[]> {
  const { default: prisma } = await import('@/lib/prisma');
  const upload = asMetadataRecord(metadata.aprSgpGmpaWorkbookUpload);
  const parsedWorkbook = asMetadataRecord(metadata.aprSgpGmpaParsedWorkbook);
  const knownSheetNames = [
    ...(Array.isArray(upload.sheetNames) ? upload.sheetNames.map((name) => String(name)) : []),
    ...(Array.isArray(parsedWorkbook.sheetNames) ? parsedWorkbook.sheetNames.map((name) => String(name)) : []),
  ];
  const docs = (await prisma.companyDocument
    .findMany({
      where: { companyId },
      select: { blobUrl: true, originalFileName: true, sizeBytes: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    .catch(() => [])) as Array<{ blobUrl: string | null; originalFileName: string | null; sizeBytes: number | null }>;
  const candidates = [
    {
      url: String(upload.blobUrl || '').trim(),
      size: typeof upload.sizeBytes === 'number' ? Number(upload.sizeBytes) : 0,
      name: String(upload.originalFileName || ''),
    },
    ...docs.map((doc) => ({
      url: String(doc.blobUrl || '').trim(),
      size: typeof doc.sizeBytes === 'number' ? Number(doc.sizeBytes) : 0,
      name: String(doc.originalFileName || ''),
    })),
  ].filter((candidate) => candidate.url);
  const seen = new Set<string>();
  const unique = candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
  unique.sort((left, right) => {
    const leftDuty = /duty|tariff|gmpa|sgp|forecast/i.test(left.name) ? 1 : 0;
    const rightDuty = /duty|tariff|gmpa|sgp|forecast/i.test(right.name) ? 1 : 0;
    if (leftDuty !== rightDuty) return rightDuty - leftDuty;
    return right.size - left.size;
  });

  let attempts = 0;
  for (const candidate of unique) {
    if (candidate.size > 0 && candidate.size < 400000 && unique.some((other) => other.size >= 1000000)) {
      continue;
    }
    if (attempts >= 3) break;
    attempts += 1;
    try {
      const identities = await parseDutySheetFromBlob(candidate.url, knownSheetNames);
      if (identities.some((item) => item.htsCode)) return identities;
    } catch (error) {
      console.warn('Duty & Tariffs workbook re-parse failed:', error);
    }
  }
  return [];
}

export async function loadSpreadsheetDutyIdentities(companyId: string): Promise<SpreadsheetDutyIdentity[]> {
  const { getOperationalSystemConnection } = await import('@/lib/operational/operational-system-connections');
  const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as Record<string, unknown>)
      : {};
  const fromMeta = identitiesFromMetadata(metadata);
  const compactRows = compactDutyHtsFromRows(
    Array.isArray(metadata.aprSgpDutyHtsByItem) ? metadata.aprSgpDutyHtsByItem : []
  );
  const compactHasHts = compactRows.some((item) => Boolean(item.htsCode));
  const compactHasDutyCode = compactRows.some((item) => Boolean(item.dutyCode));
  if (compactHasHts && compactHasDutyCode) return fromMeta;
  const upload = asMetadataRecord(metadata.aprSgpGmpaWorkbookUpload);
  const uploadSize = typeof upload.sizeBytes === 'number' ? Number(upload.sizeBytes) : 0;
  const annualOnlyUpload = uploadSize > 0 && uploadSize < 500000;
  const fromBlob =
    annualOnlyUpload && companyId === ATLANTIC_PRECISION_COMPANY_ID
      ? []
      : await loadDutyIdentitiesFromBlob(companyId, metadata);
  const fallback =
    companyId === ATLANTIC_PRECISION_COMPANY_ID && !fromBlob.some((item) => item.dutyCode)
      ? APR_SGP_DUTY_HTS_FALLBACK
      : [];
  if (!fromBlob.length && !fallback.length) return fromMeta;
  const merged = compactDutyHtsFromRows([...fromBlob, ...fallback, ...fromMeta]);
  await persistDutyIdentities(companyId, merged).catch((error) => {
    console.warn('Duty & Tariffs identity persist failed:', error);
  });
  return merged;
}

function emptyDutySeedRow(itemId: string, customerName: string, htsCode: string | null, countryOfOrigin: string | null): AprSgpGmpaRow {
  return {
    itemId,
    customerId: null,
    customerName,
    customerGroup: null,
    customerPartNumber: null,
    sgpPrice: null,
    sgpMaterialCost: null,
    sgpTariffPerPiece: null,
    sgpDutiesPerPiece: null,
    sgpFreightPerPiece: null,
    sgpCostOfSales: null,
    sgpOperatingExpensesPerPiece: null,
    sgpFullyLoadedCost: null,
    sgpNetProfit: null,
    sgpNetProfitPct: null,
    sgpGrossMarginPct: null,
    currentPrice: null,
    updatedMaterialCost: null,
    projectedTariffPerPiece: null,
    projectedDutiesPerPiece: null,
    projectedFreightPerPiece: null,
    projectedCostOfSales: null,
    projectedOperatingExpensesPerPiece: null,
    projectedFullyLoadedCost: null,
    projectedNetProfit: null,
    projectedNetProfitPct: null,
    projectedGrossMarginPct: null,
    htsCode,
    countryOfOrigin,
    tradeProgram: null,
    qtyUnit: null,
  };
}

export function parseAprSgpGmpaWorkbook(workbook: XLSX.WorkBook): ParsedAprSgpGmpaWorkbook {
  const sheetName =
    workbook.SheetNames.find((name) => /annual by customer\s*#/i.test(name)) ||
    workbook.SheetNames.find((name) => /annual by customer/i.test(name)) ||
    workbook.SheetNames[0];
  if (!sheetName) throw new Error(`${APR_SGP_GMPA_LABEL} has no worksheets.`);
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, { header: 1, raw: true, blankrows: false });
  const sourceDate = asDate(matrix[1]?.[1]) || asDate(matrix[0]?.[3]) || asDate(matrix[1]?.[0]) || new Date();

  const headerIndex = findHeaderIndex(matrix);
  const rows: AprSgpGmpaRow[] = [];
  if (headerIndex >= 0) {
  const columnMap = buildColumnMap(matrix[headerIndex] || []);

  const indexes = {
    itemId: col(columnMap, 'Item'),
    customerId: col(columnMap, 'Customer ID'),
    customerName: col(columnMap, 'Customer'),
    customerGroup: col(columnMap, 'Customer Group'),
    customerPartNumber: col(columnMap, 'Customer P/N'),
    sgpPrice: col(columnMap, 'SGP Price'),
    sgpMaterialCost: col(columnMap, 'SGP Cost of Material'),
    sgpTariffPerPiece: col(columnMap, 'SGP Impact of Tariff per Piece'),
    sgpDutiesPerPiece: col(columnMap, 'SGP Impact of Duties per Piece'),
    sgpFreightPerPiece: col(columnMap, 'SGP Cost of Freight per Piece'),
    sgpCostOfSales: col(columnMap, 'SGP Cost of Sales'),
    sgpOperatingExpensesPerPiece: col(columnMap, 'SGP Operating Expenses'),
    sgpFullyLoadedCost: col(columnMap, 'SGP Fully Loaded Cost'),
    sgpNetProfit: col(columnMap, 'SGP Net Profit'),
    sgpNetProfitPct: col(columnMap, 'SGP Net Profit %', 'SGP Net Profit'),
    sgpGrossMarginPct: col(columnMap, 'SGP Gross Margin %'),
    currentPrice: col(columnMap, 'Current Price'),
    updatedMaterialCost: col(columnMap, 'Updated Cost of Material'),
    projectedTariffPerPiece: col(columnMap, 'Projected Impact of Tariff'),
    projectedDutiesPerPiece: col(columnMap, 'Projected Impact of Duties'),
    projectedFreightPerPiece: col(columnMap, 'Projected Cost of Freight per Piece'),
    projectedCostOfSales: col(columnMap, 'Projected Cost of Sales'),
    projectedOperatingExpensesPerPiece: col(columnMap, 'Projected Operating Expenses'),
    projectedFullyLoadedCost: col(columnMap, 'Projected Fully Loaded Cost'),
    projectedNetProfit: col(columnMap, 'Projected Net Profit'),
    projectedNetProfitPct: col(columnMap, 'Projected Net Profit %'),
    projectedGrossMarginPct: col(columnMap, 'Projected Gross Margin %'),
    htsCode: col(columnMap, '(D1) HTS Number', 'HTS', 'HTS-10', 'HTS Code', 'HTS Number'),
    countryOfOrigin: col(columnMap, 'Updated Vendor COO', 'SGP Vendor COO', 'Country of Origin', 'Origin', 'COO'),
    tradeProgram: col(columnMap, 'Trade Program', 'USMCA', 'Program'),
    qtyUnit: col(columnMap, 'Qty Unit', 'UM', 'UOM', 'Unit'),
  };

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const itemId = readString(row, indexes.itemId);
    const customerName = readString(row, indexes.customerName);
    if (!itemId || !customerName) continue;
    rows.push({
      itemId,
      customerId: readString(row, indexes.customerId) || null,
      customerName,
      customerGroup: readString(row, indexes.customerGroup) || null,
      customerPartNumber: readString(row, indexes.customerPartNumber) || null,
      sgpPrice: readNumber(row, indexes.sgpPrice),
      sgpMaterialCost: readNumber(row, indexes.sgpMaterialCost),
      sgpTariffPerPiece: readNumber(row, indexes.sgpTariffPerPiece),
      sgpDutiesPerPiece: readNumber(row, indexes.sgpDutiesPerPiece),
      sgpFreightPerPiece: readNumber(row, indexes.sgpFreightPerPiece),
      sgpCostOfSales: readNumber(row, indexes.sgpCostOfSales),
      sgpOperatingExpensesPerPiece: readNumber(row, indexes.sgpOperatingExpensesPerPiece),
      sgpFullyLoadedCost: readNumber(row, indexes.sgpFullyLoadedCost),
      sgpNetProfit: readNumber(row, indexes.sgpNetProfit),
      sgpNetProfitPct: readNumber(row, indexes.sgpNetProfitPct),
      sgpGrossMarginPct: readNumber(row, indexes.sgpGrossMarginPct),
      currentPrice: readNumber(row, indexes.currentPrice),
      updatedMaterialCost: readNumber(row, indexes.updatedMaterialCost),
      projectedTariffPerPiece: readNumber(row, indexes.projectedTariffPerPiece),
      projectedDutiesPerPiece: readNumber(row, indexes.projectedDutiesPerPiece),
      projectedFreightPerPiece: readNumber(row, indexes.projectedFreightPerPiece),
      projectedCostOfSales: readNumber(row, indexes.projectedCostOfSales),
      projectedOperatingExpensesPerPiece: readNumber(row, indexes.projectedOperatingExpensesPerPiece),
      projectedFullyLoadedCost: readNumber(row, indexes.projectedFullyLoadedCost),
      projectedNetProfit: readNumber(row, indexes.projectedNetProfit),
      projectedNetProfitPct: readNumber(row, indexes.projectedNetProfitPct),
      projectedGrossMarginPct: readNumber(row, indexes.projectedGrossMarginPct),
      htsCode: formatHtsNumber(readString(row, indexes.htsCode)),
      countryOfOrigin: readString(row, indexes.countryOfOrigin) || null,
      tradeProgram: readString(row, indexes.tradeProgram) || null,
      qtyUnit: readString(row, indexes.qtyUnit) || null,
    });
  }
  }

  const dutyByItem = parseDutyTariffItems(workbook);
  const seenItems = new Set(rows.map((row) => itemKey(row.itemId)));
  for (const row of rows) {
    const duty = dutyByItem.get(itemKey(row.itemId));
    if (!duty) continue;
    row.htsCode = row.htsCode || duty.htsCode;
    row.countryOfOrigin = duty.countryOfOrigin || normalizeOriginCode(row.countryOfOrigin);
  }
  for (const duty of dutyByItem.values()) {
    if (seenItems.has(itemKey(duty.itemSku))) continue;
    rows.push(emptyDutySeedRow(duty.itemSku, duty.vendorName || 'Duty & Tariffs', duty.htsCode, duty.countryOfOrigin));
    seenItems.add(itemKey(duty.itemSku));
  }

  if (!rows.length) throw new Error(`${APR_SGP_GMPA_LABEL} did not contain any customer/item rows.`);
  return {
    sourceName: APR_SGP_GMPA_LABEL,
    parsedAt: new Date().toISOString(),
    sheetNames: workbook.SheetNames,
    sheetName,
    sourceDateIso: sourceDate.toISOString(),
    rowCount: rows.length,
    customerCount: new Set(rows.map((row) => row.customerId || row.customerName)).size,
    itemCount: new Set(rows.map((row) => row.itemId)).size,
    rows,
  };
}

export async function readAprSgpGmpaWorkbook(companyId: string): Promise<ParsedAprSgpGmpaWorkbook | null> {
  const { getOperationalSystemConnection } = await import('@/lib/operational/operational-system-connections');
  const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
  const metadata = connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
    ? connection.connectionMetadata
    : {};
  const parsed = metadata.aprSgpGmpaParsedWorkbook;
  const stored =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ParsedAprSgpGmpaWorkbook) : null;
  const storedRows = Array.isArray(stored?.rows) ? stored.rows : [];
  const mergedRows = applyDutyIdentities(storedRows, identitiesFromMetadata(metadata));
  if (!mergedRows.length) return storedRows.length ? stored : null;
  if (!stored) {
    return {
      sourceName: APR_SGP_GMPA_LABEL,
      parsedAt: new Date().toISOString(),
      sheetNames: [],
      sheetName: 'Duty & Tariffs',
      sourceDateIso: new Date().toISOString(),
      rowCount: mergedRows.length,
      customerCount: new Set(mergedRows.map((row) => row.customerId || row.customerName)).size,
      itemCount: new Set(mergedRows.map((row) => row.itemId)).size,
      rows: mergedRows,
    };
  }
  return {
    ...stored,
    rows: mergedRows,
    rowCount: mergedRows.length,
    itemCount: new Set(mergedRows.map((row) => row.itemId)).size,
  };
}
