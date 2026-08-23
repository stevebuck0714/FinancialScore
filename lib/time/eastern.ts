/**
 * App-wide business timezone.
 *
 * Every company, page, auto-pull clock, "today/yesterday", and displayed
 * timestamp uses America/New_York. The UI label is EST (including during EDT).
 * Persist instants in UTC; convert at the edge for schedules and display.
 *
 * Vercel cron expressions are UTC only. Convert EST wall times before putting
 * them in vercel.json (EST = UTC-5, EDT = UTC-4).
 */

export const APP_TIME_ZONE = 'America/New_York';
export const APP_TIME_ZONE_LABEL = 'EST';
export const EST_TIME_ZONE = APP_TIME_ZONE;

type DateParts = { year: number; month: number; day: number };

function partsInTimeZone(date: Date, timeZone: string = APP_TIME_ZONE): DateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { year, month, day };
}

function parseInstant(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const value = String(raw).trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** YYYY-MM-DD for the given instant in Eastern Time. */
export function formatEstDate(date: Date = new Date()): string {
  const { year, month, day } = partsInTimeZone(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** UTC Date at 00:00:00.000Z for an EST calendar date string (YYYY-MM-DD). */
export function utcMidnightForEstDate(estDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(estDate.trim());
  if (!match) throw new Error(`Invalid EST date: ${estDate}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function addEstCalendarDays(ymd: string, delta: number): string {
  const d = utcMidnightForEstDate(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function addEstCalendarMonths(ymd: string, delta: number): string {
  const d = utcMidnightForEstDate(ymd);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

/** Prior completed EST calendar day relative to `now`. */
export function previousEstCalendarDate(now: Date = new Date()): string {
  return addEstCalendarDays(formatEstDate(now), -1);
}

/** Walk back from an EST YMD until weekday (Mon–Fri). Does not know holidays. */
export function previousEstBusinessDate(estDate: string): string {
  let cursor = estDate;
  for (let i = 0; i < 10; i += 1) {
    const d = utcMidnightForEstDate(cursor);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) return cursor;
    cursor = addEstCalendarDays(cursor, -1);
  }
  return cursor;
}

export function listEstDateRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cursor = startYmd;
  const end = utcMidnightForEstDate(endYmd).getTime();
  while (utcMidnightForEstDate(cursor).getTime() <= end) {
    out.push(cursor);
    cursor = addEstCalendarDays(cursor, 1);
  }
  return out;
}

export function yearsAgoEstDate(years: number, now: Date = new Date()): string {
  const today = formatEstDate(now);
  const d = utcMidnightForEstDate(today);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function formatEstDateTime(
  raw: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const parsed = parseInstant(raw);
  if (!parsed) return '';
  const formatted = parsed.toLocaleString('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  });
  return `${formatted} ${APP_TIME_ZONE_LABEL}`;
}

export function formatEstDateLabel(
  raw: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    const parsed = utcMidnightForEstDate(raw.trim());
    return parsed.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  }
  const parsed = parseInstant(raw);
  if (!parsed) return '';
  return parsed.toLocaleDateString('en-US', { ...options, timeZone: APP_TIME_ZONE });
}

export function formatPullTimeLabel(hhmm: string): string {
  const trimmed = String(hhmm || '').trim();
  const value = /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : trimmed || '—';
  return `${value} ${APP_TIME_ZONE_LABEL}`;
}

