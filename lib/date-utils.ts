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

/** UTC start-of-month Date for a given input (1st @ 00:00:00 UTC). */
export function startOfMonthUtc(value: MonthInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** True if both inputs fall in the same UTC calendar month. */
export function isSameMonthUtc(a: MonthInput, b: MonthInput): boolean {
  const ka = monthKey(a);
  const kb = monthKey(b);
  return ka !== null && ka === kb;
}

/** UTC year-month for "now" (used by YTD / current-quarter pickers). */
export function currentYearUtc(): number {
  return new Date().getUTCFullYear();
}
export function currentMonthIndexUtc(): number {
  return new Date().getUTCMonth();
}
export function currentQuarterUtc(): number {
  return Math.floor(new Date().getUTCMonth() / 3) + 1;
}
