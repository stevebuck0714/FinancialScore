export type ShippingDay = {
  date: string;
  ship: boolean;
};

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekdaySun0(date: Date): number {
  return date.getUTCDay();
}

function isWeekend(date: Date): boolean {
  const day = weekdaySun0(date);
  return day === 0 || day === 6;
}

function observedNewYears(year: number): Date {
  const jan1 = utcDate(year, 1, 1);
  const day = weekdaySun0(jan1);
  if (day === 6) return addUtcDays(jan1, 2);
  if (day === 0) return addUtcDays(jan1, 1);
  return jan1;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

function goodFriday(year: number): Date {
  return addUtcDays(easterSunday(year), -2);
}

function lastMondayOfMonth(year: number, month: number): Date {
  let date = utcDate(year, month + 1, 0);
  while (weekdaySun0(date) !== 1) {
    date = addUtcDays(date, -1);
  }
  return date;
}

function firstMondayOfMonth(year: number, month: number): Date {
  let date = utcDate(year, month, 1);
  while (weekdaySun0(date) !== 1) {
    date = addUtcDays(date, 1);
  }
  return date;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  let date = utcDate(year, month, 1);
  while (weekdaySun0(date) !== weekday) {
    date = addUtcDays(date, 1);
  }
  return addUtcDays(date, (n - 1) * 7);
}

function observedIndependenceDay(year: number): Date {
  const july4 = utcDate(year, 7, 4);
  const day = weekdaySun0(july4);
  if (day === 6) return addUtcDays(july4, -1);
  if (day === 0) return addUtcDays(july4, 1);
  return july4;
}

export function plantClosureDates(year: number): { date: string; name: string }[] {
  const closures: { date: string; name: string }[] = [];
  const newYears = observedNewYears(year);
  closures.push({ date: isoDay(newYears), name: "New Year's Day" });
  if (weekdaySun0(newYears) === 4) {
    closures.push({ date: isoDay(addUtcDays(newYears, 1)), name: "New Year's Day" });
  }
  closures.push({ date: isoDay(goodFriday(year)), name: 'Good Friday' });
  closures.push({ date: isoDay(lastMondayOfMonth(year, 5)), name: 'Memorial Day' });
  closures.push({ date: isoDay(observedIndependenceDay(year)), name: '4th of July' });
  closures.push({ date: isoDay(firstMondayOfMonth(year, 9)), name: 'Labor Day' });
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  closures.push({ date: isoDay(thanksgiving), name: 'Thanksgiving' });
  closures.push({ date: isoDay(addUtcDays(thanksgiving, 1)), name: 'Thanksgiving' });
  for (let day = 24; day <= 31; day += 1) {
    closures.push({ date: isoDay(utcDate(year, 12, day)), name: 'Christmas' });
  }
  return closures;
}

export function buildShippingCalendar(year: number): ShippingDay[] {
  const closed = new Set(plantClosureDates(year).map((row) => row.date));
  const days: ShippingDay[] = [];
  const cursor = utcDate(year, 1, 1);
  const end = utcDate(year, 12, 31);
  while (cursor.getTime() <= end.getTime()) {
    const date = isoDay(cursor);
    days.push({
      date,
      ship: !isWeekend(cursor) && !closed.has(date),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
