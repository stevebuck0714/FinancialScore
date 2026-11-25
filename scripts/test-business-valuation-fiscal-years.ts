import assert from 'node:assert/strict';
import {
  buildFiscalPeriods,
  fiscalYearBounds,
  fiscalYearOfMonth,
  monthsBetween,
  shiftMonth,
  summarizeFiscalPeriod,
  trailingTwelveMonthPeriod,
  type MonthlyFinancialValues,
} from '../lib/business-valuation/fiscal-years';
import { isBusinessValuationEnabled } from '../lib/business-valuation/engagement';

assert.equal(shiftMonth('2026-01', -1), '2025-12');
assert.equal(shiftMonth('2025-12', 1), '2026-01');
assert.equal(shiftMonth('2026-10', -46), '2022-12');
assert.deepEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);

// December year end: fiscal year equals calendar year.
assert.equal(fiscalYearOfMonth('2026-10', 12), 2026);
assert.deepEqual(fiscalYearBounds(2025, 12), { startMonth: '2025-01', endMonth: '2025-12' });

// June year end: July 2025 – June 2026 is FY2026, matching Cash Proof tax return keys.
assert.equal(fiscalYearOfMonth('2025-07', 6), 2026);
assert.equal(fiscalYearOfMonth('2026-06', 6), 2026);
assert.deepEqual(fiscalYearBounds(2025, 6), { startMonth: '2024-07', endMonth: '2025-06' });

// Mid-year as-of month: year to date plus three complete fiscal years, newest first.
const stored = monthsBetween('2023-11', '2026-10');
const periods = buildFiscalPeriods('2026-10', 12, stored);
assert.deepEqual(periods.map((p) => p.key), ['FY2026-YTD', 'FY2025', 'FY2024', 'FY2023']);
assert.equal(periods[0].label, 'FY2026 YTD (through Oct 2026)');
assert.equal(periods[0].months.length, 10);
assert.equal(periods[0].isComplete, true);
assert.equal(periods[1].isComplete, true);
assert.equal(periods[3].storedMonths.length, 2);
assert.equal(periods[3].missingMonths.length, 10);
assert.equal(periods[3].isComplete, false);

// As-of month at a fiscal year end: no year-to-date period.
const yearEnd = buildFiscalPeriods('2025-06', 6, monthsBetween('2022-07', '2025-06'));
assert.deepEqual(yearEnd.map((p) => p.key), ['FY2025', 'FY2024', 'FY2023']);
assert.ok(yearEnd.every((p) => p.isComplete));

// Summary: income statement totals over stored months, balance sheet at the last stored month.
const rows = new Map<string, MonthlyFinancialValues>([
  ['2025-11', { month: '2025-11', revenue: 100, cogsTotal: 40, expense: 30, interestExpense: 5, depreciationAmortization: 10, cash: 50 } as MonthlyFinancialValues],
  ['2025-12', { month: '2025-12', revenue: 200, cogsTotal: 80, expense: 60, interestExpense: 5, depreciationAmortization: 10, cash: 75 } as MonthlyFinancialValues],
]);
const partial = buildFiscalPeriods('2025-12', 12, ['2025-11', '2025-12'])[0];
const summary = summarizeFiscalPeriod(partial, rows);
assert.equal(summary.monthCount, 2);
assert.equal(summary.income.revenue, 300);
assert.equal(summary.income.grossProfit, 180);
assert.equal(summary.income.operatingIncome, 90);
assert.equal(summary.income.ebitda, 120);
assert.equal(summary.balanceSheet?.month, '2025-12');
assert.equal(summary.balanceSheet?.cash, 75);

const empty = summarizeFiscalPeriod(buildFiscalPeriods('2020-12', 12, [])[0], rows);
assert.equal(empty.monthCount, 0);
assert.equal(empty.balanceSheet, null);

// Trailing twelve months ends at the as-of month regardless of fiscal year end.
const ttm = trailingTwelveMonthPeriod('2026-10', monthsBetween('2026-01', '2026-10'));
assert.equal(ttm.startMonth, '2025-11');
assert.equal(ttm.months.length, 12);
assert.deepEqual(ttm.missingMonths, ['2025-11', '2025-12']);
assert.equal(ttm.isComplete, false);

// The admin switch is off unless explicitly enabled.
assert.equal(isBusinessValuationEnabled(null), false);
assert.equal(isBusinessValuationEnabled({}), false);
assert.equal(isBusinessValuationEnabled({ businessValuation: { enabledByAdmin: 'true' } }), false);
assert.equal(isBusinessValuationEnabled({ businessValuation: { enabledByAdmin: true } }), true);

console.log('business valuation fiscal year tests passed');
