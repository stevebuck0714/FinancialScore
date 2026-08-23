import {
  APP_TIME_ZONE,
  APP_TIME_ZONE_LABEL,
  formatEstDate,
  formatEstDateTime as formatEstDateTimeCore,
} from '@/lib/time/eastern';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export { APP_TIME_ZONE, APP_TIME_ZONE_LABEL, formatEstDate };
export { addEstCalendarDays, addEstCalendarMonths, previousEstCalendarDate, estDayBoundsUtc, estMidnightUtc } from '@/lib/time/eastern';

export function parseDateSafeUtc(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const value = String(raw).trim();
  if (!value) return null;
  const match = DATE_ONLY_RE.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(Date.UTC(year, Math.max(0, month - 1), day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateSafeUtc(
  raw: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  const parsed = parseDateSafeUtc(raw);
  if (!parsed) return 'N/A';
  const asString = typeof raw === 'string' ? raw.trim() : '';
  const isDateOnly =
    DATE_ONLY_RE.test(asString) ||
    (parsed.getUTCHours() === 0 &&
      parsed.getUTCMinutes() === 0 &&
      parsed.getUTCSeconds() === 0 &&
      parsed.getUTCMilliseconds() === 0);
  return parsed.toLocaleDateString('en-US', {
    ...options,
    timeZone: isDateOnly ? 'UTC' : APP_TIME_ZONE,
  });
}

export function formatDateInputLabel(raw: string | Date | null | undefined): string {
  return formatDateSafeUtc(raw, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** YYYY-MM-DD for an instant in Eastern Time (app timezone for every company). */
export function toLocalInputDate(date: Date): string {
  return formatEstDate(date);
}

export function formatEstDateTime(
  raw: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return formatEstDateTimeCore(raw, options) || 'N/A';
}
