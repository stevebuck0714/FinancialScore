import * as XLSX from 'xlsx';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';

export const COGENT_RATE_CARD_SOURCE_CODE = 'COGENT_RATE_CARD';
export const COGENT_RATE_CARD_LABEL = 'Cogent Rate Card';

export type CogentRateCardRow = {
  year: number;
  clientName: string;
  market: string;
  billRateLevel: string;
  normalizedBillRateLevel: string;
  billRate: number;
};

export type ParsedCogentRateCard = {
  sourceName: string;
  parsedAt: string;
  sheetNames: string[];
  clientName: string;
  years: number[];
  markets: string[];
  levels: string[];
  rowCount: number;
  rows: CogentRateCardRow[];
};

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWorksheetMatrixValue(value: unknown): string {
  return asString(value).toLowerCase();
}

export function normalizeRateCardMarket(value: unknown): string {
  const raw = asString(value);
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const tokenized = normalized.replace(/[^a-z0-9]+/g, ' ');
  if (!normalized) return 'Unassigned';
  if (normalized.includes('san francisco') || normalized.includes('south san francisco') || normalized === 'ca-sf' || normalized === 'ca sf' || normalized === 'sf' || normalized.includes('bay area')) return 'CA - SF';
  if (normalized.includes('san diego') || normalized.includes('la jolla') || normalized.includes('campus point') || normalized.includes('pasadena') || normalized.includes('euclid') || normalized === 'ca-sd' || normalized === 'ca sd' || normalized === 'sd') return 'CA - SD';
  if (normalized === 'ca' || normalized.includes('california')) return 'CA';
  if (normalized === 'in' || normalized.includes('indiana') || normalized.includes('indianapolis') || /\bin\b/.test(tokenized)) return 'IN';
  if (normalized === 'co' || normalized.includes('colorado') || normalized.includes('boulder') || normalized.includes('louisville') || /\bco\b/.test(tokenized)) return 'CO';
  if (normalized === 'ny' || normalized.includes('new york') || /\bny\b/.test(tokenized)) return 'NY';
  if (normalized === 'ma' || normalized.includes('massachusetts') || normalized.includes('boston') || normalized.includes('necco') || /\bma\b/.test(tokenized)) return 'MA';
  return raw;
}

export function normalizeRateCardLevel(value: unknown): string {
  const normalized = asString(value).toLowerCase().replace(/[_-]+/g, ' ');
  if (!normalized) return 'Unassigned';
  if (normalized.includes('senior')) return 'Senior Scientist';
  if (normalized.includes('expert')) return 'Expert Scientist';
  if (normalized.includes('experienced')) return 'Experienced Scientist';
  if (normalized.includes('skilled')) return 'Skilled Scientist';
  if (normalized.includes('lab tech') || normalized.includes('lab technician')) return 'Lab Technician';
  return asString(value);
}

export function parseCogentRateCardWorkbook(workbook: XLSX.WorkBook): ParsedCogentRateCard {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Rate card workbook has no worksheets.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, { header: 1, raw: true, blankrows: false });
  const clientRow = matrix.find((row) => normalizeWorksheetMatrixValue(row?.[0]) === 'client');
  const clientName = asString(clientRow?.[1]) || 'Unknown Client';
  const rows: CogentRateCardRow[] = [];

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    if (normalizeWorksheetMatrixValue(row[0]) !== 'year') continue;
    const year = asNumber(row[1]);
    if (!year) continue;
    const locationRow = matrix[rowIndex + 1] || [];
    const firstDataRowIndex = rowIndex + 3;
    for (let levelRowIndex = firstDataRowIndex; levelRowIndex < matrix.length; levelRowIndex += 1) {
      const levelRow = matrix[levelRowIndex] || [];
      const rawLevel = asString(levelRow[0]);
      if (!rawLevel) break;
      if (normalizeWorksheetMatrixValue(rawLevel) === 'year') break;
      const normalizedLevel = normalizeRateCardLevel(rawLevel);
      for (let colIndex = 1; colIndex < locationRow.length; colIndex += 1) {
        const rawMarket = asString(locationRow[colIndex]);
        if (!rawMarket) continue;
        const billRate = asNumber(levelRow[colIndex]);
        if (billRate == null) continue;
        rows.push({
          year: Math.trunc(year),
          clientName,
          market: normalizeRateCardMarket(rawMarket),
          billRateLevel: rawLevel,
          normalizedBillRateLevel: normalizedLevel,
          billRate,
        });
      }
    }
  }

  if (!rows.length) throw new Error('No rate card rows found. Expected Year, Location, Rate, and level rows.');
  return {
    sourceName: COGENT_RATE_CARD_LABEL,
    parsedAt: new Date().toISOString(),
    sheetNames: workbook.SheetNames,
    clientName,
    years: Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => a - b),
    markets: Array.from(new Set(rows.map((row) => row.market))).sort((a, b) => a.localeCompare(b)),
    levels: Array.from(new Set(rows.map((row) => row.normalizedBillRateLevel))).sort((a, b) => a.localeCompare(b)),
    rowCount: rows.length,
    rows,
  };
}

export function findCogentRate(
  rows: CogentRateCardRow[],
  args: { year: number; market: string; billRateLevel: string }
): CogentRateCardRow | null {
  const market = normalizeRateCardMarket(args.market);
  const level = normalizeRateCardLevel(args.billRateLevel);
  const candidates = rows
    .filter((row) => row.market === market && row.normalizedBillRateLevel === level)
    .sort((a, b) => b.year - a.year);
  return candidates.find((row) => row.year === args.year) || candidates.find((row) => row.year <= args.year) || candidates[0] || null;
}

export async function readCogentRateCard(companyId: string): Promise<ParsedCogentRateCard | null> {
  const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', COGENT_RATE_CARD_SOURCE_CODE);
  const metadata = connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
    ? connection.connectionMetadata
    : {};
  const parsed = metadata.cogentRateCardParsedWorkbook;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const rows = Array.isArray((parsed as any).rows) ? (parsed as any).rows : [];
  if (!rows.length) return null;
  return parsed as ParsedCogentRateCard;
}
