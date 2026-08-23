/**
 * Single source of truth for monthly date handling across the app.
 *
 * Why this exists:
 *   - JS `Date` is always a UTC instant, but `.getMonth()`, `.getFullYear()`,
 *     and `.toLocaleDateString()` (without `timeZone`) default to the
 *     **runtime's** local timezone — the user's browser TZ on the client and
 *     UTC on Vercel functions on the server. Same code, different answer.
 *   - DB `monthDate` rows live as UTC instants. In any negative-offset
 *     timezone (PT/MT/CT/ET) a row like `2026-03-01T00:00:00Z` reads back as
 *     "Feb 28" with local accessors and ends up in the wrong month / wrong
 *     YTD bucket / wrong column header.
 *
 * Rule for monthly financial buckets:
 *   - "March 2026" is a calendar month. There is no time-of-day. Always
 *     bucket and label using UTC accessors so the answer is the same in
 *     every browser, every server, every region.
 *
 * If a value needs a true wall-clock time (eg. "transaction posted at"),
 * keep storing the UTC instant and convert at the edge using a chosen
 * display TZ (eg. the company's home TZ) — do NOT use these helpers for
 * that.
 */

import { estMonthIndex, estMonthKey, estYear } from '@/lib/time/eastern';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type MonthInput = Date | string | number | null | undefined;

/**
 * Coerce an input to a Date. Accepts:
 *   - Date instance
 *   - ISO string ("2026-03-01T00:00:00Z" or "2026-03-01")
 *   - epoch millis number
 * Returns null when the input is missing or unparseable.
 */
export function toDate(value: MonthInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC year for the month bucket the input belongs to. */
export function getMonthYearUtc(value: MonthInput): number | null {
  const d = toDate(value);
  return d ? d.getUTCFullYear() : null;
}

/** UTC month index 0..11 for the month bucket the input belongs to. */
export function getMonthIndexUtc(value: MonthInput): number | null {
  const d = toDate(value);
  return d ? d.getUTCMonth() : null;
}

/** UTC quarter (1..4) for the month bucket the input belongs to. */
export function getQuarterUtc(value: MonthInput): number | null {
  const m = getMonthIndexUtc(value);
  return m === null ? null : Math.floor(m / 3) + 1;
}

/** Stable "YYYY-MM" key for the month bucket. */
export function monthKey(value: MonthInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "MM-YYYY" label (used by some legacy reports). */
export function monthLabelMmYyyy(value: MonthInput): string {
  const d = toDate(value);
  if (!d) return '';
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
}

/** "Mar 2026" — always UTC. */
export function formatMonthShort(value: MonthInput): string {
  const d = toDate(value);
  if (!d) return '';
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "March 2026" — always UTC. */
export function formatMonthLong(value: MonthInput): string {
  const d = toDate(value);
  if (!d) return '';
  return `${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Q1 2026" — always UTC. */
export function formatQuarterUtc(value: MonthInput): string {
  const d = toDate(value);
  if (!d) return '';
  return `Q${getQuarterUtc(d)} ${d.getUTCFullYear()}`;
}

/** UTC start-of-month Date for a given input (1st @ 00:00:00.000 UTC). */
export function startOfMonthUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** UTC end-of-month Date for a given input (last day @ 23:59:59.999 UTC). */
export function endOfMonthUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/** UTC start-of-quarter Date for a given input (Jan/Apr/Jul/Oct 1 @ 00:00:00.000 UTC). */
export function startOfQuarterUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  const qStart = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), qStart, 1, 0, 0, 0, 0));
}

/** UTC end-of-quarter Date for a given input (last day of Mar/Jun/Sep/Dec @ 23:59:59.999 UTC). */
export function endOfQuarterUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  const qStart = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), qStart + 3, 0, 23, 59, 59, 999));
}

/** UTC start-of-year Date for a given input (Jan 1 @ 00:00:00.000 UTC). */
export function startOfYearUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

/** UTC end-of-year Date for a given input (Dec 31 @ 23:59:59.999 UTC). */
export function endOfYearUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 0, 23, 59, 59, 999));
}

/** UTC start-of-day Date (00:00:00.000 UTC). */
export function startOfDayUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** UTC end-of-day Date (23:59:59.999 UTC). */
export function endOfDayUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** Stable "YYYY-MM-DD" key for the day bucket. Always UTC. */
export function dayKeyUtc(value: MonthInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Stable "YYYY-Qn" key for the quarter bucket. Always UTC. */
export function quarterKeyUtc(value: MonthInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

/** Stable "YYYY" key for the year bucket. Always UTC. */
export function yearKeyUtc(value: MonthInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  return String(d.getUTCFullYear());
}

/** True if both inputs fall in the same UTC calendar month. */
export function isSameMonthUtc(a: MonthInput, b: MonthInput): boolean {
  const ka = monthKey(a);
  const kb = monthKey(b);
  return ka !== null && ka === kb;
}

/** EST year-month for "now" (used by YTD / current-quarter pickers). */
export function currentYearUtc(now: Date = new Date()): number {
  return estYear(now);
}
export function currentMonthIndexUtc(now: Date = new Date()): number {
  return estMonthIndex(now);
}
export function currentQuarterUtc(now: Date = new Date()): number {
  return Math.floor(estMonthIndex(now) / 3) + 1;
}

/** Stable "YYYY-MM" for the current EST calendar month. */
export function currentMonthKeyUtc(now: Date = new Date()): string {
  return estMonthKey(now);
}

/**
 * Parse a reporting month to "YYYY-MM".
 * Accepts Date/ISO values, "YYYY-MM", "YYYY-MM-DD", and legacy "MM-YYYY" labels.
 */
export function reportingMonthKeyUtc(value: MonthInput): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const yyyyMm = trimmed.match(/^(\d{4})-(\d{2})(?!\d)/);
    if (yyyyMm) return `${yyyyMm[1]}-${yyyyMm[2]}`;
    const mmYyyy = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
    if (mmYyyy) {
      const month = Number(mmYyyy[1]);
      if (month >= 1 && month <= 12) {
        return `${mmYyyy[2]}-${String(month).padStart(2, '0')}`;
      }
    }
  }
  return monthKey(value);
}

/** True while the month is still the in-progress UTC calendar month. */
export function isOpenReportingMonth(value: MonthInput, now: Date = new Date()): boolean {
  const key = reportingMonthKeyUtc(value);
  return key !== null && key === currentMonthKeyUtc(now);
}

/**
 * Month-end reports (KPIs, Ratios, Trends, published master data) wait until
 * the first of the following UTC month. August becomes eligible on September 1.
 */
export function isClosedReportingMonth(value: MonthInput, now: Date = new Date()): boolean {
  const key = reportingMonthKeyUtc(value);
  return key !== null && key !== currentMonthKeyUtc(now);
}

export function filterClosedReportingMonths<T>(
  rows: T[],
  getMonthValue: (row: T) => MonthInput,
  now: Date = new Date(),
): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.filter((row) => isClosedReportingMonth(getMonthValue(row), now));
}
