import { MAX_TARGETED_LEDGER_REBUILD_DAYS } from '@/lib/infor-m3/sync-queue';

export type HistoricalRebuildRange = {
  startDate: Date;
  endDate: Date;
  startDateIso: string;
  endDateIso: string;
};

function parseUtcCalendarDate(value: unknown, label: string, endOfDay: boolean): Date {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return parsed;
}

/** Validates an inclusive, production-safe targeted history rebuild range. */
export function parseHistoricalRebuildRange(body: Record<string, unknown>): HistoricalRebuildRange {
  const startDate = parseUtcCalendarDate(body.startDate, 'startDate', false);
  const endDate = parseUtcCalendarDate(body.endDate, 'endDate', true);
  if (startDate > endDate) throw new Error('startDate must be on or before endDate.');
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (days > MAX_TARGETED_LEDGER_REBUILD_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_TARGETED_LEDGER_REBUILD_DAYS} calendar days.`);
  }
  return {
    startDate,
    endDate,
    startDateIso: startDate.toISOString().slice(0, 10),
    endDateIso: endDate.toISOString().slice(0, 10),
  };
}
