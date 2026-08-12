/** America/New_York calendar helpers for EST/EDT EOD FX jobs. */

export const EST_TIME_ZONE = 'America/New_York';

function partsInTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
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

/** YYYY-MM-DD for the given instant in America/New_York. */
export function formatEstDate(date: Date = new Date()): string {
  const { year, month, day } = partsInTimeZone(date, EST_TIME_ZONE);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** UTC Date at 00:00:00.000Z for an EST calendar date string (YYYY-MM-DD). */
export function utcMidnightForEstDate(estDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(estDate.trim());
  if (!match) throw new Error(`Invalid EST date: ${estDate}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = utcMidnightForEstDate(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Prior completed EST calendar day relative to `now`.
 * Used by the daily EOD cron (queued after EST midnight / early EST morning).
 */
export function previousEstCalendarDate(now: Date = new Date()): string {
  return addDaysYmd(formatEstDate(now), -1);
}

/** Walk back from an EST YMD until weekday (Mon–Fri). Does not know holidays. */
export function previousEstBusinessDate(estDate: string): string {
  let cursor = estDate;
  for (let i = 0; i < 10; i += 1) {
    const d = utcMidnightForEstDate(cursor);
    const dow = d.getUTCDay(); // 0 Sun … 6 Sat for the UTC-midnight YMD
    if (dow !== 0 && dow !== 6) return cursor;
    cursor = addDaysYmd(cursor, -1);
  }
  return cursor;
}

export function listEstDateRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cursor = startYmd;
  const end = utcMidnightForEstDate(endYmd).getTime();
  while (utcMidnightForEstDate(cursor).getTime() <= end) {
    out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

export function yearsAgoEstDate(years: number, now: Date = new Date()): string {
  const today = formatEstDate(now);
  const d = utcMidnightForEstDate(today);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}
