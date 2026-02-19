// Date helpers for billing schedules.
// Important: billing schedules are anchored to a calendar day-of-month.

export function addMonthsClamped(anchor: Date, monthsToAdd: number): Date {
  const year = anchor.getFullYear();
  const monthIndex = anchor.getMonth(); // 0-11
  const day = anchor.getDate(); // 1-31

  const totalMonths = monthIndex + monthsToAdd;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  // Last day-of-month in local time.
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDay);

  return new Date(
    targetYear,
    targetMonth,
    clampedDay,
    anchor.getHours(),
    anchor.getMinutes(),
    anchor.getSeconds(),
    anchor.getMilliseconds(),
  );
}

export function billingIntervalMonths(schedule: 'monthly' | 'quarterly' | 'annual'): number {
  if (schedule === 'monthly') return 1;
  if (schedule === 'quarterly') return 3;
  return 12;
}

export function formatDateYYYYMMDDLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

