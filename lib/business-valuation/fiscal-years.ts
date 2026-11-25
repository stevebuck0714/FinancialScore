/** Fiscal-year periods and coverage for business valuation. Months are `YYYY-MM` calendar keys. */

export const VALUATION_COMPLETE_FISCAL_YEARS = 3;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function normalizeFiscalYearEndMonth(value: unknown): number {
  const month = Math.round(Number(value));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : 12;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  for (let month = startMonth; month <= endMonth; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** Fiscal years are named by the calendar year they end in. */
export function fiscalYearOfMonth(monthKey: string, fiscalYearEndMonth: number): number {
  const [year, month] = monthKey.split('-').map(Number);
  return month <= fiscalYearEndMonth ? year : year + 1;
}

export function fiscalYearBounds(fiscalYear: number, fiscalYearEndMonth: number): { startMonth: string; endMonth: string } {
  const endMonth = `${fiscalYear}-${String(fiscalYearEndMonth).padStart(2, '0')}`;
  return { startMonth: shiftMonth(endMonth, -11), endMonth };
}

export type FiscalPeriod = {
  key: string;
  label: string;
  fiscalYear: number;
  isYearToDate: boolean;
  startMonth: string;
  endMonth: string;
  months: string[];
  storedMonths: string[];
  missingMonths: string[];
  isComplete: boolean;
};

/**
 * The periods a valuation covers as of `asOfMonth`: the current fiscal year to date (when the
 * as-of month is not a fiscal year end) followed by the prior complete fiscal years, newest first.
 */
export function buildFiscalPeriods(
  asOfMonth: string,
  fiscalYearEndMonth: number,
  storedMonths: Iterable<string>,
  completeYears = VALUATION_COMPLETE_FISCAL_YEARS,
): FiscalPeriod[] {
  const stored = new Set(storedMonths);
  const currentFiscalYear = fiscalYearOfMonth(asOfMonth, fiscalYearEndMonth);
  const currentBounds = fiscalYearBounds(currentFiscalYear, fiscalYearEndMonth);
  const hasYearToDate = asOfMonth !== currentBounds.endMonth;
  const firstCompleteYear = hasYearToDate ? currentFiscalYear - 1 : currentFiscalYear;

  const period = (fiscalYear: number, startMonth: string, endMonth: string, isYearToDate: boolean): FiscalPeriod => {
    const months = monthsBetween(startMonth, endMonth);
    const storedMonthsInPeriod = months.filter((month) => stored.has(month));
    return {
      key: isYearToDate ? `FY${fiscalYear}-YTD` : `FY${fiscalYear}`,
      label: isYearToDate ? `FY${fiscalYear} YTD (through ${formatMonthKey(endMonth)})` : `FY${fiscalYear}`,
      fiscalYear,
      isYearToDate,
      startMonth,
      endMonth,
      months,
      storedMonths: storedMonthsInPeriod,
      missingMonths: months.filter((month) => !stored.has(month)),
      isComplete: storedMonthsInPeriod.length === months.length,
    };
  };

  const periods: FiscalPeriod[] = [];
  if (hasYearToDate) periods.push(period(currentFiscalYear, currentBounds.startMonth, asOfMonth, true));
  for (let offset = 0; offset < completeYears; offset++) {
    const fiscalYear = firstCompleteYear - offset;
    const bounds = fiscalYearBounds(fiscalYear, fiscalYearEndMonth);
    periods.push(period(fiscalYear, bounds.startMonth, bounds.endMonth, false));
  }
  return periods;
}

export function trailingTwelveMonthPeriod(asOfMonth: string, storedMonths: Iterable<string>): FiscalPeriod {
  const stored = new Set(storedMonths);
  const months = monthsBetween(shiftMonth(asOfMonth, -11), asOfMonth);
  const storedMonthsInPeriod = months.filter((month) => stored.has(month));
  return {
    key: 'TTM',
    label: `Trailing 12 months (through ${formatMonthKey(asOfMonth)})`,
    fiscalYear: fiscalYearOfMonth(asOfMonth, 12),
    isYearToDate: false,
    startMonth: months[0],
    endMonth: asOfMonth,
    months,
    storedMonths: storedMonthsInPeriod,
    missingMonths: months.filter((month) => !stored.has(month)),
    isComplete: storedMonthsInPeriod.length === months.length,
  };
}

export type MonthlyFinancialValues = Record<string, number> & { month: string };

export const INCOME_STATEMENT_FIELDS = [
  'revenue',
  'cogsTotal',
  'expense',
  'payroll',
  'ownerBasePay',
  'rent',
  'interestExpense',
  'depreciationAmortization',
  'nonOperatingIncome',
  'nonOperatingExpense',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
] as const;

export const BALANCE_SHEET_FIELDS = [
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'totalEquity',
] as const;

export type FiscalPeriodSummary = {
  key: string;
  label: string;
  monthCount: number;
  income: Record<(typeof INCOME_STATEMENT_FIELDS)[number], number> & {
    grossProfit: number;
    operatingIncome: number;
    ebitda: number;
  };
  /** Balances at the last stored month of the period, or null when no month is stored. */
  balanceSheet: (Record<(typeof BALANCE_SHEET_FIELDS)[number], number> & { month: string }) | null;
};

const value = (row: MonthlyFinancialValues | undefined, field: string) => {
  const amount = Number(row?.[field]);
  return Number.isFinite(amount) ? amount : 0;
};

/** EBITDA uses the same rule as the existing valuation pages: revenue − COGS − expense + interest + D&A. */
export function summarizeFiscalPeriod(period: FiscalPeriod, rowsByMonth: Map<string, MonthlyFinancialValues>): FiscalPeriodSummary {
  const rows = period.storedMonths.map((month) => rowsByMonth.get(month)).filter((row): row is MonthlyFinancialValues => Boolean(row));
  const totals = Object.fromEntries(
    INCOME_STATEMENT_FIELDS.map((field) => [field, rows.reduce((sum, row) => sum + value(row, field), 0)]),
  ) as Record<(typeof INCOME_STATEMENT_FIELDS)[number], number>;
  const grossProfit = totals.revenue - totals.cogsTotal;
  const operatingIncome = grossProfit - totals.expense;
  const lastRow = rows[rows.length - 1];
  return {
    key: period.key,
    label: period.label,
    monthCount: rows.length,
    income: {
      ...totals,
      grossProfit,
      operatingIncome,
      ebitda: operatingIncome + totals.interestExpense + totals.depreciationAmortization,
    },
    balanceSheet: lastRow
      ? {
          month: lastRow.month,
          ...(Object.fromEntries(BALANCE_SHEET_FIELDS.map((field) => [field, value(lastRow, field)])) as Record<(typeof BALANCE_SHEET_FIELDS)[number], number>),
        }
      : null,
  };
}
