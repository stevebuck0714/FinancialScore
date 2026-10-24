export type DayCountConvention = '30/360' | 'actual/365' | 'actual/360';

export const DAY_COUNT_OPTIONS: Array<{ value: DayCountConvention; label: string }> = [
  { value: '30/360', label: '30/360 (rate / 12 each month)' },
  { value: 'actual/365', label: 'Actual days / 365' },
  { value: 'actual/360', label: 'Actual days / 360' },
];

export type PaymentFrequencyKey = 'monthly' | 'semi-monthly' | 'bi-weekly' | 'weekly' | 'quarterly' | 'semi-annual' | 'annual';

type FrequencyRule = { key: PaymentFrequencyKey; label: string; periodsPerYear: number; months?: number; days?: number };

const FREQUENCIES: FrequencyRule[] = [
  { key: 'monthly', label: 'Monthly', periodsPerYear: 12, months: 1 },
  { key: 'semi-monthly', label: 'Semi-monthly', periodsPerYear: 24 },
  { key: 'bi-weekly', label: 'Bi-weekly', periodsPerYear: 26, days: 14 },
  { key: 'weekly', label: 'Weekly', periodsPerYear: 52, days: 7 },
  { key: 'quarterly', label: 'Quarterly', periodsPerYear: 4, months: 3 },
  { key: 'semi-annual', label: 'Semi-annual', periodsPerYear: 2, months: 6 },
  { key: 'annual', label: 'Annual', periodsPerYear: 1, months: 12 },
];

/** Payment Frequency is free text on Loan Terms; blank or unrecognized means monthly. */
export function parsePaymentFrequency(value: unknown): FrequencyRule {
  const text = String(value || '').toLowerCase().replace(/[\s_]+/g, '-');
  const find = (key: PaymentFrequencyKey) => FREQUENCIES.find((rule) => rule.key === key)!;
  if (/semi-?month|twice-?a-?month/.test(text)) return find('semi-monthly');
  if (/bi-?week|every-?other-?week|fortnight/.test(text)) return find('bi-weekly');
  if (/week/.test(text)) return find('weekly');
  if (/quarter/.test(text)) return find('quarterly');
  if (/semi-?ann|half-?year|bi-?annual/.test(text)) return find('semi-annual');
  if (/annual|year/.test(text)) return find('annual');
  return find('monthly');
}

export function parseDayCount(value: unknown): DayCountConvention {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'actual/365' || text === 'actual/360') return text;
  return '30/360';
}

const DAY_MS = 86_400_000;

function toUtcDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(date: Date, months: number, anchorDay: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
}

function paymentDate(first: Date, index: number, rule: FrequencyRule): Date {
  if (rule.days) return new Date(first.getTime() + index * rule.days * DAY_MS);
  if (rule.key === 'semi-monthly') {
    const halfMonths = addMonthsClamped(first, Math.floor(index / 2), first.getUTCDate());
    return index % 2 === 0 ? halfMonths : new Date(halfMonths.getTime() + 15 * DAY_MS);
  }
  return addMonthsClamped(first, index * (rule.months || 1), first.getUTCDate());
}

function days360(from: Date, to: Date): number {
  const d1 = Math.min(30, from.getUTCDate());
  const d2 = d1 === 30 ? Math.min(30, to.getUTCDate()) : to.getUTCDate();
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 360 + (to.getUTCMonth() - from.getUTCMonth()) * 30 + (d2 - d1);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export type AmortizationInputs = {
  loanAmount: number;
  annualRatePct: number;
  amortizationTermMonths: number;
  firstPaymentDate: string;
  loanOriginationDate?: string | null;
  maturityDate?: string | null;
  paymentFrequency?: string | null;
  dayCountConvention?: string | null;
};

export type AmortizationRow = {
  number: number;
  date: string;
  periodStart: string;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
  isBalloon: boolean;
};

export type AmortizationSchedule = {
  frequency: FrequencyRule;
  dayCount: DayCountConvention;
  scheduledPayment: number;
  rows: AmortizationRow[];
};

/**
 * Groups scheduled principal by forecast week. Both payment dates and week
 * starts are date-only YYYY-MM-DD values, so comparisons remain calendar-date
 * based and do not shift across time zones.
 */
export function sumScheduledPrincipalByWeek(rows: AmortizationRow[], weekStarts: string[]): number[] {
  const totals = Array.from({ length: weekStarts.length }, () => 0);
  for (const row of rows) {
    const weekIndex = weekStarts.findIndex((weekStart, index) => {
      const nextWeekStart = weekStarts[index + 1] || (() => {
        const end = toUtcDate(weekStart)!;
        end.setUTCDate(end.getUTCDate() + 7);
        return toKey(end);
      })();
      return row.date >= weekStart && row.date < nextWeekStart;
    });
    if (weekIndex >= 0) totals[weekIndex] += Math.max(0, Number(row.principal || 0));
  }
  return totals.map(roundCents);
}

export function missingAmortizationTerms(terms: {
  originalBalance?: unknown;
  interestRatePct?: unknown;
  amortizationTermMonths?: unknown;
  firstPaymentDate?: unknown;
}): string[] {
  const missing: string[] = [];
  if (!(Number(terms.originalBalance) > 0)) missing.push('Loan Amount');
  if (terms.interestRatePct === null || terms.interestRatePct === undefined || terms.interestRatePct === '' || !Number.isFinite(Number(terms.interestRatePct))) {
    missing.push('Interest Rate %');
  }
  if (!(Number(terms.amortizationTermMonths) > 0)) missing.push('Amortization Term Months');
  if (!toUtcDate(String(terms.firstPaymentDate || ''))) missing.push('First Payment Date');
  return missing;
}

/**
 * Level-payment schedule. The payment is sized on the periodic rate (annual / periods per year);
 * each period's interest uses the chosen day count, so actual/365 periods vary with the calendar.
 * A maturity date before the end of amortization makes that payment a balloon.
 */
export function buildAmortizationSchedule(inputs: AmortizationInputs): AmortizationSchedule | null {
  const frequency = parsePaymentFrequency(inputs.paymentFrequency);
  const dayCount = parseDayCount(inputs.dayCountConvention);
  const first = toUtcDate(inputs.firstPaymentDate);
  const loanAmount = Number(inputs.loanAmount);
  const annualRate = Math.max(0, Number(inputs.annualRatePct) || 0) / 100;
  const periods = Math.round((Number(inputs.amortizationTermMonths) * frequency.periodsPerYear) / 12);
  if (!first || !(loanAmount > 0) || !(periods > 0)) return null;

  const periodicRate = annualRate / frequency.periodsPerYear;
  const scheduledPayment = roundCents(
    periodicRate > 0 ? (loanAmount * periodicRate) / (1 - Math.pow(1 + periodicRate, -periods)) : loanAmount / periods
  );
  const origination = toUtcDate(String(inputs.loanOriginationDate || ''));
  const maturity = toUtcDate(String(inputs.maturityDate || ''));
  const firstPeriodStart =
    origination && origination.getTime() < first.getTime() ? origination : paymentDate(first, -1, frequency);

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;
  let periodStart = firstPeriodStart;
  for (let index = 0; index < periods && balance > 0.005; index += 1) {
    const date = paymentDate(first, index, frequency);
    let interest: number;
    if (dayCount === '30/360') {
      interest = frequency.days
        ? balance * periodicRate
        : (balance * annualRate * days360(periodStart, date)) / 360;
    } else {
      const actualDays = Math.round((date.getTime() - periodStart.getTime()) / DAY_MS);
      interest = (balance * annualRate * actualDays) / (dayCount === 'actual/365' ? 365 : 360);
    }
    interest = roundCents(Math.max(0, interest));
    const isLast = index === periods - 1;
    const isBalloon = Boolean(maturity && date.getTime() >= maturity.getTime() && !isLast);
    let principal = roundCents(scheduledPayment - interest);
    if (isLast || isBalloon || principal > balance) principal = roundCents(balance);
    balance = roundCents(Math.max(0, balance - principal));
    rows.push({
      number: index + 1,
      date: toKey(date),
      periodStart: toKey(periodStart),
      payment: roundCents(interest + principal),
      interest,
      principal,
      balance,
      isBalloon,
    });
    periodStart = date;
    if (isBalloon) break;
  }
  return { frequency, dayCount, scheduledPayment, rows };
}

export type LoanActualPosting = { date: string; kind: 'interest' | 'principal' | 'draw'; amount: number };

export type ScheduleRowWithActuals = AmortizationRow & {
  status: 'paid' | 'current' | 'future' | 'no-data';
  actualInterest: number | null;
  actualPrincipal: number | null;
  actualBalance: number | null;
  balanceDifference: number | null;
};

/**
 * Postings belong to the payment whose date they are nearest, so a payment booked a few
 * days after its due date still lands on that row. Actual Balance walks back from the
 * current book balance through the principal and draws dated after each window.
 */
export function attachActualsToSchedule(params: {
  rows: AmortizationRow[];
  postings: LoanActualPosting[];
  currentBalance: number | null;
  today: string;
}): ScheduleRowWithActuals[] {
  const { rows, postings, currentBalance, today } = params;
  const todayTime = toUtcDate(today)?.getTime() ?? Date.now();
  const datedPostings = postings
    .map((posting) => ({ ...posting, time: toUtcDate(posting.date)?.getTime() ?? Number.NaN }))
    .filter((posting) => Number.isFinite(posting.time));
  const earliestPosting = datedPostings.reduce((min, posting) => Math.min(min, posting.time), Number.POSITIVE_INFINITY);
  const times = rows.map((row) => toUtcDate(row.date)!.getTime());
  const windowStart = (index: number) =>
    index === 0 ? Number.NEGATIVE_INFINITY : Math.round((times[index - 1] + times[index]) / 2);
  const windowEnd = (index: number) =>
    index === rows.length - 1 ? Number.POSITIVE_INFINITY : Math.round((times[index] + times[index + 1]) / 2);

  return rows.map((row, index) => {
    const start = windowStart(index);
    const end = windowEnd(index);
    const status: ScheduleRowWithActuals['status'] =
      start > todayTime ? 'future' : end <= earliestPosting ? 'no-data' : end > todayTime ? 'current' : 'paid';
    if (status === 'future' || status === 'no-data') {
      return { ...row, status, actualInterest: null, actualPrincipal: null, actualBalance: null, balanceDifference: null };
    }
    let actualInterest = 0;
    let actualPrincipal = 0;
    let laterBalanceEffect = 0;
    for (const posting of datedPostings) {
      if (posting.time >= start && posting.time < end) {
        if (posting.kind === 'interest') actualInterest += posting.amount;
        if (posting.kind === 'principal') actualPrincipal += posting.amount;
      }
      if (posting.time >= end) {
        if (posting.kind === 'principal') laterBalanceEffect += posting.amount;
        if (posting.kind === 'draw') laterBalanceEffect -= posting.amount;
      }
    }
    const actualBalance = currentBalance === null ? null : roundCents(currentBalance + laterBalanceEffect);
    return {
      ...row,
      status,
      actualInterest: roundCents(actualInterest),
      actualPrincipal: roundCents(actualPrincipal),
      actualBalance,
      balanceDifference: actualBalance === null ? null : roundCents(actualBalance - row.balance),
    };
  });
}
