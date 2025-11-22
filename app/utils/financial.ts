import * as XLSX from 'xlsx';

/**
 * Parse various date formats into a Date object
 */
export function parseDateLike(v: any): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d || 1));
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;
    const m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mm = Number(m[1]);
      const yyyy = Number(m[2]);
      return new Date(Date.UTC(yyyy, mm - 1, 1));
    }
  }
  return null;
}

/**
 * Convert a Date to a month key string (YYYY-MM format)
 */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Sum an array of numbers, treating non-finite values as 0
 */
export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

/**
 * Calculate percentage change between two values
 */
export function pctChange(curr: number, prior: number): number | null {
  if (!Number.isFinite(curr) || !Number.isFinite(prior) || prior === 0) return null;
  return (curr / prior - 1) * 100;
}

/**
 * Categorize total assets into size buckets
 */
export function getAssetSizeCategory(totalAssets: number): string {
  if (totalAssets < 500000) return '<500k';
  if (totalAssets < 1000000) return '500k-1m';
  if (totalAssets < 5000000) return '1m-5m';
  if (totalAssets < 10000000) return '5m-10m';
  if (totalAssets < 25000000) return '10m-25m';
  if (totalAssets < 50000000) return '25m-50m';
  if (totalAssets < 100000000) return '50m-100m';
  if (totalAssets < 250000000) return '100m-250m';
  if (totalAssets < 500000000) return '250m-500m';
  return '>500m';
}
