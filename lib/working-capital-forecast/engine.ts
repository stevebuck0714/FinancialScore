import { addEstCalendarDays, formatEstDate, utcMidnightForEstDate } from '@/lib/time/eastern';

export type ForecastBasisMode = 'cash' | 'accrual';

export type ForecastInputs = {
  inventoryTurns: number;
  minCashBuffer: number;
  locLimit: number;
  locAprPct: number;
  creditSalesPct: number;
  historicalSalesLookbackWeeks: number;
  historicalSalesCollectionLagWeeks: number;
  arCurrentCollectPct: number;
  ar30To60CollectPct: number;
  ar60To90CollectPct: number;
  ar90PlusCollectPct: number;
  arWeek1WeightPct: number;
  arWeek2WeightPct: number;
  arWeek3WeightPct: number;
  arWeek4WeightPct: number;
  apCurrentPayPct: number;
  ap30To60PayPct: number;
  ap60To90PayPct: number;
  ap90PlusPayPct: number;
  apWeek1WeightPct: number;
  apWeek2WeightPct: number;
  apWeek3WeightPct: number;
  apWeek4WeightPct: number;
};

export type WeeklyDriver = {
  sales: number;
  opex: number;
  opexAdj: number;
  grossMarginPct: number;
};

export type OpexPaymentTreatment = 'paid-in-full' | 'ap-schedule';

export type HistoricalFlowProfile = {
  arRunoffRate: number;
  apRunoffRate: number;
  inventoryToSalesRatio: number;
};

export type AgingBuckets = {
  current: number;
  bucket30to60: number;
  bucket60to90: number;
  bucket90plus: number;
};

export type HistoricalApPaymentProfile = {
  weeklyPaymentAmount: number;
  /** Opening AP paydown measured on voucher aging history (Atlantic). */
  openingApPaydown?: {
    asOfDate: string;
    weeklyPaydownRateByBucket: Record<keyof AgingBuckets, number>;
    openingBucketShares: Record<keyof AgingBuckets, number>;
    shareOfOpeningPaidByWeek: number[];
    newVoucherEntryDaysPastDue?: number;
    shareOfNewVoucherPaidByAgeWeek?: number[];
  } | null;
  purchasePaymentLagWeeks: number;
  matchedPaymentCount: number;
};

export type HistoricalArCollectionProfile = {
  paymentDaysAfterDue: number;
  matchedPaymentCount: number;
  weeklyCollectionAmount: number;
  openInvoices: Array<{
    invoiceNo: string;
    customerId?: string | null;
    customerName: string;
    invoiceDate?: string | Date | null;
    dueDate?: string | Date | null;
    amountDueHome: number;
  }>;
};

export type HistoricalDebtServiceProfile = {
  weeklyPrincipalAmount: number;
  /** Scheduled long-term-debt principal for each 13-week forecast column. */
  scheduledPrincipalByWeek?: number[];
  source: 'history' | 'terms' | 'none';
  observedWeeks: number;
  /** Long-term debt balance represented by the loaded loan schedules. */
  startingBalance: number;
};

export type MonthlyBaseRef = {
  year: number;
  month: number; // 0-based
};

export type StartingBalances = { cash: number; ar: number; ap: number; inventory: number; loc: number };

export type ForecastRow = {
  week: number;
  beginningCash: number;
  sales: number;
  receipts: number;
  cogs: number;
  inventoryCogs: number;
  directLabor: number;
  directLaborPayments: number;
  targetInventory: number;
  purchases: number;
  apPayments: number;
  opex: number;
  cashOpex: number;
  opexAdj: number;
  locInterest: number;
  debtPrincipal: number;
  locDraw: number;
  locRepay: number;
  unleveredEndingCash: number;
  endingCash: number;
  endingLoc: number;
  endingAr: number;
  endingAp: number;
  endingInventory: number;
};

export type MonthRevenueSeries = {
  monthRefs: MonthlyBaseRef[];
  monthTotals: number[];
  /**
   * Direct Production Labor from the Income Statement Forecast. It is a COGS
   * category but not inventory-bearing, so it must not drive replenishment.
   */
  directLaborMonthTotals?: number[];
  /** Inventory-bearing material COGS from the Income Statement Forecast. */
  materialCogsMonthTotals?: number[];
  /** Projected COGS expected to be paid through accounts payable. */
  apCogsMonthTotals?: number[];
};

export const ACCRUAL_OPEX_LINE_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'autoTravel', label: 'Auto Travel' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'interestExpense', label: 'Interest Expense' },
  { key: 'mealsEntertainment', label: 'Meals Entertainment' },
  { key: 'otherExpense', label: 'Other Expense' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'phoneComm', label: 'Phone Comm' },
  { key: 'professionalFees', label: 'Professional Fees' },
  { key: 'rent', label: 'Rent' },
  { key: 'salesExpense', label: 'Sales Expense' },
  { key: 'subcontractors', label: 'Subcontractors' },
  { key: 'taxLicense', label: 'Tax License' },
];
export const DEFAULT_ACCRUAL_OPEX_PAYMENT_TREATMENT_BY_KEY: Record<string, OpexPaymentTreatment> = ACCRUAL_OPEX_LINE_ITEMS
  .reduce((acc, item) => {
    acc[item.key] = 'paid-in-full';
    return acc;
  }, {} as Record<string, OpexPaymentTreatment>);

export const DEFAULT_INPUTS: ForecastInputs = {
  inventoryTurns: 8,
  minCashBuffer: 25000,
  locLimit: 150000,
  locAprPct: 9,
  creditSalesPct: 90,
  historicalSalesLookbackWeeks: 12,
  historicalSalesCollectionLagWeeks: 2,
  arCurrentCollectPct: 80,
  ar30To60CollectPct: 60,
  ar60To90CollectPct: 30,
  ar90PlusCollectPct: 10,
  arWeek1WeightPct: 35,
  arWeek2WeightPct: 30,
  arWeek3WeightPct: 20,
  arWeek4WeightPct: 15,
  apCurrentPayPct: 80,
  ap30To60PayPct: 60,
  ap60To90PayPct: 30,
  ap90PlusPayPct: 10,
  apWeek1WeightPct: 35,
  apWeek2WeightPct: 30,
  apWeek3WeightPct: 20,
  apWeek4WeightPct: 15,
};
export const DEFAULT_WEEKLY_DRIVER: WeeklyDriver = {
  sales: 50000,
  opex: 18000,
  opexAdj: 0,
  grossMarginPct: 35,
};
export const EMPTY_INPUTS: ForecastInputs = {
  inventoryTurns: 0,
  minCashBuffer: 0,
  locLimit: 0,
  locAprPct: 0,
  creditSalesPct: 0,
  historicalSalesLookbackWeeks: 0,
  historicalSalesCollectionLagWeeks: 0,
  arCurrentCollectPct: 0,
  ar30To60CollectPct: 0,
  ar60To90CollectPct: 0,
  ar90PlusCollectPct: 0,
  arWeek1WeightPct: 0,
  arWeek2WeightPct: 0,
  arWeek3WeightPct: 0,
  arWeek4WeightPct: 0,
  apCurrentPayPct: 0,
  ap30To60PayPct: 0,
  ap60To90PayPct: 0,
  ap90PlusPayPct: 0,
  apWeek1WeightPct: 0,
  apWeek2WeightPct: 0,
  apWeek3WeightPct: 0,
  apWeek4WeightPct: 0,
};
export const EMPTY_WEEKLY_DRIVER: WeeklyDriver = {
  sales: 0,
  opex: 0,
  opexAdj: 0,
  grossMarginPct: 35,
};
export const FORECAST_WEEKS = 13;
export const DEFAULT_STARTING_BALANCES: StartingBalances = { cash: 0, ar: 0, ap: 0, inventory: 0, loc: 0 };
export const DEFAULT_FLOW_PROFILE: HistoricalFlowProfile = { arRunoffRate: 0.12, apRunoffRate: 0.12, inventoryToSalesRatio: 0.3 };
export const DEFAULT_AGING_BUCKETS: AgingBuckets = { current: 0, bucket30to60: 0, bucket60to90: 0, bucket90plus: 0 };

export const hasAnyPositiveValue = (values: Array<unknown>): boolean =>
  values.some((value) => Number.isFinite(Number(value)) && Number(value) > 0);

export const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const toRoundedCurrency = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
export const toRoundedPercent = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
};
export const toRoundedInteger = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
export const toRoundedTurns = (value: unknown, fallback = 8): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
};
export const normalizeWeeklyDriver = (raw: any, fallback: WeeklyDriver): WeeklyDriver => ({
  sales: Math.max(0, toRoundedCurrency(raw?.sales, fallback.sales)),
  opex: Math.max(0, toRoundedCurrency(raw?.opex, fallback.opex)),
  opexAdj: toRoundedCurrency(raw?.opexAdj, fallback.opexAdj),
  grossMarginPct: clampNumber(toRoundedPercent(raw?.grossMarginPct, fallback.grossMarginPct), 1, 99),
});
export const normalizeWeeklyDriverList = (raw: any, fallback: WeeklyDriver): WeeklyDriver[] => {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: FORECAST_WEEKS }, (_, idx) => normalizeWeeklyDriver(list[idx], fallback));
};
export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
export const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
export const getWeekendAnchorDate = (baseDate: Date): Date => {
  const anchor = new Date(baseDate);
  anchor.setHours(0, 0, 0, 0);
  const day = anchor.getDay(); // 0=Sun ... 6=Sat
  if (day === 6) return anchor; // Saturday
  if (day === 0) return addDays(anchor, -1); // Sunday -> prior Saturday
  return addDays(anchor, -(day + 1)); // Mon-Fri -> prior Saturday
};
const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();
const normalizeMonthRefs = (rawMonthRefs: any, fallbackLength: number): MonthlyBaseRef[] => {
  if (Array.isArray(rawMonthRefs) && rawMonthRefs.length >= fallbackLength) {
    return rawMonthRefs.slice(0, fallbackLength).map((item: any, idx: number) => {
      const year = Number(item?.year);
      const month = Number(item?.month);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return { year, month };
      }
      const dt = new Date();
      dt.setMonth(dt.getMonth() + idx);
      return { year: dt.getFullYear(), month: dt.getMonth() };
    });
  }
  const today = new Date();
  return Array.from({ length: fallbackLength }, (_, idx) => {
    const dt = new Date(today.getFullYear(), today.getMonth() + idx, 1);
    return { year: dt.getFullYear(), month: dt.getMonth() };
  });
};
const resolveMonthIndexForDate = (date: Date, monthRefs: MonthlyBaseRef[]): number => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const exactIdx = monthRefs.findIndex((ref) => ref.year === y && ref.month === m);
  if (exactIdx >= 0) return exactIdx;
  const dateKey = y * 12 + m;
  const firstKey = monthRefs[0].year * 12 + monthRefs[0].month;
  const lastRef = monthRefs[monthRefs.length - 1];
  const lastKey = lastRef.year * 12 + lastRef.month;
  if (dateKey < firstKey) return 0;
  if (dateKey > lastKey) return monthRefs.length - 1;
  return 0;
};
export const allocateMonthlyAmountsToWeeks = (
  monthAmounts: number[],
  monthRefs: MonthlyBaseRef[],
  weekStarts: Date[],
  timing: 'calendar' | 'payroll-semi-monthly' = 'calendar',
): number[] => {
  const weekly = Array.from({ length: weekStarts.length }, () => 0);
  if (!Array.isArray(monthAmounts) || monthAmounts.length === 0 || !weekStarts.length) return weekly;
  const refs = normalizeMonthRefs(monthRefs, monthAmounts.length);
  const postEventToWeek = (eventDate: Date, amount: number) => {
    const event = startOfDay(eventDate).getTime();
    for (let i = 0; i < weekStarts.length; i += 1) {
      const weekStart = startOfDay(weekStarts[i]).getTime();
      const weekEnd = startOfDay(addDays(weekStarts[i], 6)).getTime();
      if (event >= weekStart && event <= weekEnd) {
        weekly[i] += Math.max(0, amount);
        return;
      }
    }
  };

  if (timing === 'payroll-semi-monthly') {
    refs.forEach((ref, idx) => {
      const monthlyAmount = Math.max(0, Number(monthAmounts[idx] || 0));
      if (monthlyAmount <= 0) return;
      postEventToWeek(new Date(ref.year, ref.month, 1), monthlyAmount / 2);
      postEventToWeek(new Date(ref.year, ref.month, 15), monthlyAmount / 2);
    });
    return weekly.map((value) => Math.max(0, Math.round(value)));
  }

  for (let idx = 0; idx < weekStarts.length; idx += 1) {
    const weekStart = weekStarts[idx];
    let total = 0;
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const dayDate = addDays(weekStart, dayOffset);
      const monthIdx = resolveMonthIndexForDate(dayDate, refs);
      const ref = refs[monthIdx];
      const dim = Math.max(1, daysInMonth(ref.year, ref.month));
      total += (Number(monthAmounts[monthIdx]) || 0) / dim;
    }
    weekly[idx] = Math.max(0, Math.round(total));
  }
  return weekly;
};
export const parseMonthRevenueSeries = (raw: unknown): MonthRevenueSeries | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    monthRefs?: unknown;
    monthTotals?: unknown;
    directLaborMonthTotals?: unknown;
    materialCogsMonthTotals?: unknown;
    apCogsMonthTotals?: unknown;
  };
  const refsRaw = Array.isArray(obj.monthRefs) ? obj.monthRefs : [];
  const totalsRaw = Array.isArray(obj.monthTotals) ? obj.monthTotals : [];
  const directLaborRaw = Array.isArray(obj.directLaborMonthTotals) ? obj.directLaborMonthTotals : [];
  const materialCogsRaw = Array.isArray(obj.materialCogsMonthTotals) ? obj.materialCogsMonthTotals : null;
  const apCogsRaw = Array.isArray(obj.apCogsMonthTotals) ? obj.apCogsMonthTotals : null;
  const monthRefs: MonthlyBaseRef[] = [];
  const monthTotals: number[] = [];
  const directLaborMonthTotals: number[] = [];
  const materialCogsMonthTotals: number[] = [];
  const apCogsMonthTotals: number[] = [];
  const count = Math.min(refsRaw.length, totalsRaw.length);
  for (let i = 0; i < count; i += 1) {
    const item = refsRaw[i] && typeof refsRaw[i] === 'object' ? (refsRaw[i] as { year?: unknown; month?: unknown }) : {};
    const year = Number(item.year);
    const month = Number(item.month);
    const total = Number(totalsRaw[i]);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    monthRefs.push({ year, month });
    monthTotals.push(Number.isFinite(total) && total > 0 ? total : 0);
    const directLabor = Number(directLaborRaw[i]);
    directLaborMonthTotals.push(Number.isFinite(directLabor) && directLabor > 0 ? directLabor : 0);
    if (materialCogsRaw) {
      const materialCogs = Number(materialCogsRaw[i]);
      materialCogsMonthTotals.push(Number.isFinite(materialCogs) && materialCogs > 0 ? materialCogs : 0);
    }
    if (apCogsRaw) {
      const apCogs = Number(apCogsRaw[i]);
      apCogsMonthTotals.push(Number.isFinite(apCogs) && apCogs > 0 ? apCogs : 0);
    }
  }
  if (monthRefs.length === 0 || !monthTotals.some((value) => value > 0)) return null;
  return {
    monthRefs,
    monthTotals,
    directLaborMonthTotals,
    ...(materialCogsRaw ? { materialCogsMonthTotals } : {}),
    ...(apCogsRaw ? { apCogsMonthTotals } : {}),
  };
};
const forecastWeekStarts = (): Date[] =>
  Array.from({ length: FORECAST_WEEKS }, (_, idx) => addDays(getWeekendAnchorDate(new Date()), idx * 7));
export const allocateForecastSalesByWeek = (series: MonthRevenueSeries | null): number[] => {
  if (!series) return Array.from({ length: FORECAST_WEEKS }, () => 0);
  return allocateMonthlyAmountsToWeeks(series.monthTotals, series.monthRefs, forecastWeekStarts(), 'calendar');
};
export const applyAllocatedSalesToDrivers = (drivers: WeeklyDriver[], allocatedSales: number[]): WeeklyDriver[] => {
  if (!allocatedSales.some((value) => value > 0)) return drivers;
  return drivers.map((driver, idx) => ({
    ...driver,
    sales: allocatedSales[idx] ?? driver.sales,
  }));
};
export const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toOptionalRoundedCurrency = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const dateKeyUtc = (date: Date): string => startOfUtcDay(date).toISOString().slice(0, 10);
const previousCompletedWeekEndUtc = (now: Date = new Date()): Date => {
  const estToday = utcMidnightForEstDate(formatEstDate(now));
  const day = estToday.getUTCDay(); // 0=Sun ... 5=Fri ... 6=Sat
  // The current Friday is not a closed week-end yet, so use the prior Friday.
  const daysSincePreviousFriday = day === 5 ? 7 : (day - 5 + 7) % 7;
  return utcMidnightForEstDate(addEstCalendarDays(formatEstDate(now), -daysSincePreviousFriday));
};
const pickRecordAtDay = (records: any[], dayUtc: Date): any | null => {
  const list = Array.isArray(records) ? records : [];
  const target = startOfUtcDay(dayUtc).getTime();
  for (const row of list) {
    const raw = row?.snapshotDate;
    if (!raw) continue;
    const ts = startOfUtcDay(new Date(raw)).getTime();
    if (Number.isFinite(ts) && ts === target) return row;
  }
  return null;
};

const toWeeklyWeights = (w1: number, w2: number, w3: number, w4: number): number[] => {
  const raw = [w1, w2, w3, w4].map((value) => Math.max(0, Number(value) || 0));
  const sum = raw.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return [0.25, 0.25, 0.25, 0.25];
  return raw.map((value) => value / sum);
};
const allocateOpeningAgingBalance = (
  buckets: AgingBuckets,
  currentRate: number,
  bucket30to60Rate: number,
  bucket60to90Rate: number,
  bucket90plusRate: number,
  weeklyWeights: number[],
): number[] => {
  const expectedTotal =
    Math.max(0, Number(buckets.current || 0)) * currentRate +
    Math.max(0, Number(buckets.bucket30to60 || 0)) * bucket30to60Rate +
    Math.max(0, Number(buckets.bucket60to90 || 0)) * bucket60to90Rate +
    Math.max(0, Number(buckets.bucket90plus || 0)) * bucket90plusRate;

  // These weights apply once to the opening balance: they are not a recurring
  // rate on the unpaid remainder after week four.
  return weeklyWeights.map((weight) => expectedTotal * weight);
};

const mapSnapshotToBuckets = (snapshot: any, totalFallback: number): AgingBuckets => {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ...DEFAULT_AGING_BUCKETS, current: Math.max(0, totalFallback || 0) };
  }
  const current = Math.max(0, Number(snapshot.current || 0));
  const bucket30to60 = Math.max(0, Number(snapshot.days1to30 || 0));
  const bucket60to90 = Math.max(0, Number(snapshot.days31to60 || 0));
  const bucket90plus = Math.max(0, Number(snapshot.days61to90 || 0) + Number(snapshot.days90plus || 0));
  const mappedTotal = current + bucket30to60 + bucket60to90 + bucket90plus;
  if (mappedTotal > 0) {
    return { current, bucket30to60, bucket60to90, bucket90plus };
  }
  return { ...DEFAULT_AGING_BUCKETS, current: Math.max(0, totalFallback || 0) };
};
const reconcileAgingBucketsToTotal = (buckets: AgingBuckets, total: number): AgingBuckets => {
  const target = Math.max(0, Number(total) || 0);
  const current = Math.max(0, Number(buckets?.current) || 0);
  const bucket30to60 = Math.max(0, Number(buckets?.bucket30to60) || 0);
  const bucket60to90 = Math.max(0, Number(buckets?.bucket60to90) || 0);
  const bucket90plus = Math.max(0, Number(buckets?.bucket90plus) || 0);
  const mapped = current + bucket30to60 + bucket60to90 + bucket90plus;
  if (target <= 0) return { ...DEFAULT_AGING_BUCKETS };
  if (mapped <= 0) return { ...DEFAULT_AGING_BUCKETS, current: target };
  if (mapped > target) {
    const scale = target / mapped;
    return {
      current: current * scale,
      bucket30to60: bucket30to60 * scale,
      bucket60to90: bucket60to90 * scale,
      bucket90plus: bucket90plus * scale,
    };
  }
  return {
    current: current + (target - mapped),
    bucket30to60,
    bucket60to90,
    bucket90plus,
  };
};
export const normalizeAccrualOpexPaymentTreatmentByKey = (
  raw: any,
  fallback: Record<string, OpexPaymentTreatment>,
): Record<string, OpexPaymentTreatment> => {
  const next: Record<string, OpexPaymentTreatment> = { ...fallback };
  const source = raw && typeof raw === 'object' ? raw : {};
  ACCRUAL_OPEX_LINE_ITEMS.forEach(({ key }) => {
    const value = source[key];
    next[key] = value === 'ap-schedule' ? 'ap-schedule' : 'paid-in-full';
  });
  return next;
};
export const normalizeInputs = (raw: any, fallback: ForecastInputs): ForecastInputs => ({
  inventoryTurns: clampNumber(toRoundedTurns(raw?.inventoryTurns, fallback.inventoryTurns), 0.5, 30),
  minCashBuffer: Math.max(0, toRoundedCurrency(raw?.minCashBuffer, fallback.minCashBuffer)),
  locLimit: Math.max(0, toRoundedCurrency(raw?.locLimit, fallback.locLimit)),
  locAprPct: clampNumber(toRoundedPercent(raw?.locAprPct, fallback.locAprPct), 0, 100),
  creditSalesPct: clampNumber(toRoundedPercent(raw?.creditSalesPct, fallback.creditSalesPct), 0, 100),
  historicalSalesLookbackWeeks: clampNumber(toRoundedInteger(raw?.historicalSalesLookbackWeeks, fallback.historicalSalesLookbackWeeks), 1, 52),
  historicalSalesCollectionLagWeeks: clampNumber(toRoundedInteger(raw?.historicalSalesCollectionLagWeeks, fallback.historicalSalesCollectionLagWeeks), 0, 12),
  arCurrentCollectPct: clampNumber(toRoundedPercent(raw?.arCurrentCollectPct, fallback.arCurrentCollectPct), 0, 100),
  ar30To60CollectPct: clampNumber(toRoundedPercent(raw?.ar30To60CollectPct, fallback.ar30To60CollectPct), 0, 100),
  ar60To90CollectPct: clampNumber(toRoundedPercent(raw?.ar60To90CollectPct, fallback.ar60To90CollectPct), 0, 100),
  ar90PlusCollectPct: clampNumber(toRoundedPercent(raw?.ar90PlusCollectPct, fallback.ar90PlusCollectPct), 0, 100),
  arWeek1WeightPct: clampNumber(toRoundedPercent(raw?.arWeek1WeightPct, fallback.arWeek1WeightPct), 0, 100),
  arWeek2WeightPct: clampNumber(toRoundedPercent(raw?.arWeek2WeightPct, fallback.arWeek2WeightPct), 0, 100),
  arWeek3WeightPct: clampNumber(toRoundedPercent(raw?.arWeek3WeightPct, fallback.arWeek3WeightPct), 0, 100),
  arWeek4WeightPct: clampNumber(toRoundedPercent(raw?.arWeek4WeightPct, fallback.arWeek4WeightPct), 0, 100),
  apCurrentPayPct: clampNumber(toRoundedPercent(raw?.apCurrentPayPct, fallback.apCurrentPayPct), 0, 100),
  ap30To60PayPct: clampNumber(toRoundedPercent(raw?.ap30To60PayPct, fallback.ap30To60PayPct), 0, 100),
  ap60To90PayPct: clampNumber(toRoundedPercent(raw?.ap60To90PayPct, fallback.ap60To90PayPct), 0, 100),
  ap90PlusPayPct: clampNumber(toRoundedPercent(raw?.ap90PlusPayPct, fallback.ap90PlusPayPct), 0, 100),
  apWeek1WeightPct: clampNumber(toRoundedPercent(raw?.apWeek1WeightPct, fallback.apWeek1WeightPct), 0, 100),
  apWeek2WeightPct: clampNumber(toRoundedPercent(raw?.apWeek2WeightPct, fallback.apWeek2WeightPct), 0, 100),
  apWeek3WeightPct: clampNumber(toRoundedPercent(raw?.apWeek3WeightPct, fallback.apWeek3WeightPct), 0, 100),
  apWeek4WeightPct: clampNumber(toRoundedPercent(raw?.apWeek4WeightPct, fallback.apWeek4WeightPct), 0, 100),
});

export type ForecastProjectionInput = {
  basisMode: ForecastBasisMode;
  /**
   * Use historical AP aging-bucket paydown rates for opening AP. Atlantic's
   * payment history replaces manual aging assumptions for its opening balance.
   */
  useHistoricalOpeningApPaydown?: boolean;
  inputs: ForecastInputs;
  startingBalances: StartingBalances;
  startingArBuckets: AgingBuckets;
  startingApBuckets: AgingBuckets;
  weeklyDrivers: WeeklyDriver[];
  flowProfile: HistoricalFlowProfile;
  historicalSalesByWeek: number[];
  accrualOpexAmountByRow: Record<string, number[]>;
  accrualOpexPctByRow: Record<string, number[]>;
  accrualOpexPaymentTreatmentByKey: Record<string, OpexPaymentTreatment>;
  forecastMonthRefs: MonthlyBaseRef[];
  forecastMonthTotals: number[];
  forecastDirectLaborMonthTotals?: number[];
  forecastMaterialCogsMonthTotals?: number[];
  forecastApCogsMonthTotals?: number[];
  historicalApPaymentProfile?: HistoricalApPaymentProfile | null;
  historicalArCollectionProfile?: HistoricalArCollectionProfile | null;
  historicalDebtServiceProfile?: HistoricalDebtServiceProfile | null;
  /** Holds target inventory at a historical balance instead of the COGS/sales formula. */
  inventoryTargetProfile?: InventoryTargetProfile | null;
};

export type InventoryTargetProfile = {
  targetInventory: number;
  monthEnds: Array<{ date: string; inventory: number }>;
};

export type DerivedForecastState = ForecastProjectionInput & {
  historicalAverages: WeeklyDriver;
  monthSeries: MonthRevenueSeries | null;
  hasSavedSettings: boolean;
  lastSavedAt: string | null;
  inventoryBalanceFromImportedData: boolean;
  locBalanceFromImportedData: boolean;
};

/**
 * Turn a `/api/working-capital-forecast/bootstrap` payload (JSON shape) into
 * the forecast state the 13-week page and server alerts both project from.
 */
export function deriveForecastStateFromBootstrap(
  bootstrap: any,
  options: {
    basisMode: ForecastBasisMode;
    storedMonthSeries?: MonthRevenueSeries | null;
    liveMonthSeries?: MonthRevenueSeries | null;
  },
): DerivedForecastState {
  const { basisMode } = options;
  type Frequency = 'daily' | 'weekly' | 'monthly';
  const annualPeriods: Record<Frequency, number> = { daily: 365, weekly: 52, monthly: 12 };

  const savedPayload = bootstrap?.savedSettings || null;
  const financialForecastPayload = bootstrap?.financialForecastInputs || null;
  const loansPayload = bootstrap?.loans || null;
  const dailyFinancial = bootstrap?.operational?.dailyFinancials || null;
  const arResult = bootstrap?.operational?.arAgingResult || null;
  const apResult = bootstrap?.operational?.apAgingResult || null;
  const historicalApPaymentProfile = bootstrap?.operational?.historicalApPaymentProfile || null;
  const historicalArCollectionProfile = bootstrap?.operational?.historicalArCollectionProfile || null;
  const historicalDebtServiceProfile = bootstrap?.operational?.historicalDebtServiceProfile || null;
  const inventoryHistory = bootstrap?.operational?.inventoryHistory || null;
  const productHistory = bootstrap?.operational?.productHistory || null;
  const productMarginHistory = bootstrap?.operational?.productMarginHistory || null;
  const loadedOpexAmountByRow =
    financialForecastPayload?.settings?.opexPctByRow?.__amountByRow &&
    typeof financialForecastPayload.settings.opexPctByRow.__amountByRow === 'object'
      ? financialForecastPayload.settings.opexPctByRow.__amountByRow
      : {};
  const loadedOpexPctByRow =
    financialForecastPayload?.settings?.opexPctByRow &&
    typeof financialForecastPayload.settings.opexPctByRow === 'object'
      ? financialForecastPayload.settings.opexPctByRow
      : {};
  const loadedOpexPaymentTreatmentByKey = normalizeAccrualOpexPaymentTreatmentByKey(
    financialForecastPayload?.settings?.opexPctByRow?.__paymentTreatmentByKey,
    DEFAULT_ACCRUAL_OPEX_PAYMENT_TREATMENT_BY_KEY,
  );
  const savedSettings = savedPayload?.settings || null;
  const loans = Array.isArray(loansPayload?.loans) ? loansPayload.loans : [];
  const locLoanAmount = loans
    .filter((loan: any) => String(loan?.loanType || '').toUpperCase() === 'LINE_OF_CREDIT')
    .filter((loan: any) => {
      const status = String(loan?.status || '').toUpperCase();
      return !status || status === 'ACTIVE' || status === 'MATURING';
    })
    .reduce((sum: number, loan: any) => sum + Math.max(0, Number(loan?.loanAmount || 0)), 0);
  const locLimitFromLoansPage = Boolean(loansPayload?.locFromLoanInstruments);

  const latestDailySnapshot = (() => {
    if (!Array.isArray(dailyFinancial?.records) || dailyFinancial.records.length === 0) return null;
    const previousWeekEnd = previousCompletedWeekEndUtc();
    const asOfRow = pickRecordAtDay(dailyFinancial.records, previousWeekEnd);
    if (!asOfRow) return null;
    return {
      asOfDay: dateKeyUtc(previousWeekEnd),
      cash: Number(asOfRow?.cash || 0),
      ar: Number(asOfRow?.ar || 0),
      ap: Number(asOfRow?.ap || 0),
      inventory: toOptionalRoundedCurrency(asOfRow?.inventory),
      loc: toOptionalRoundedCurrency(asOfRow?.loc),
    };
  })();

  // Starting balances always use the prior closed EST week-end (Friday),
  // never the latest imported snapshot or a saved forecast value.
  const asOfDay = dateKeyUtc(previousCompletedWeekEndUtc());
  const latestCash = Number(latestDailySnapshot?.cash || 0);
  const latestAr = Number(latestDailySnapshot?.ar || 0);
  const latestAp = Number(latestDailySnapshot?.ap || 0);
  let latestInventory = latestDailySnapshot?.inventory ?? null;
  let hasImportedInventoryBalance = latestInventory !== null && latestInventory > 0;
  const latestLocBalance = latestDailySnapshot?.loc ?? null;
  const hasImportedLocBalance = latestLocBalance !== null;
  const asOfDate = asOfDay ? new Date(`${asOfDay}T00:00:00.000Z`) : null;
  const latestArSnapshot =
    asOfDate && Array.isArray(arResult?.data?.records)
      ? pickRecordAtDay(arResult.data.records, asOfDate)
      : null;
  const latestApSnapshot =
    asOfDate && Array.isArray(apResult?.data?.records)
      ? pickRecordAtDay(apResult.data.records, asOfDate)
      : null;
  const derivedArBuckets = mapSnapshotToBuckets(latestArSnapshot, latestAr);
  const derivedApBuckets = mapSnapshotToBuckets(latestApSnapshot, latestAp);

  if ((!hasImportedInventoryBalance || latestInventory === null) && inventoryHistory?.data?.records) {
    const latestInventorySnapshot = inventoryHistory.data.records[0];
    const importedInventory = toOptionalRoundedCurrency(latestInventorySnapshot?.assetValue);
    if (importedInventory !== null && importedInventory > 0) {
      latestInventory = importedInventory;
      hasImportedInventoryBalance = true;
    }
  }
  let suggestedInventoryTurns = 0;
  if (inventoryHistory?.data?.records && productHistory?.data?.records) {
    const inventoryByDate = new Map<string, number>();
    for (const row of inventoryHistory.data.records) {
      const dateKey = String(row?.snapshotDate || '').split('T')[0];
      if (!dateKey) continue;
      inventoryByDate.set(dateKey, (inventoryByDate.get(dateKey) || 0) + Number(row?.assetValue || 0));
    }
    const inventoryValues = Array.from(inventoryByDate.values()).filter((v) => Number.isFinite(v) && v > 0);
    const averageInventory =
      inventoryValues.length > 0
        ? inventoryValues.reduce((sum, value) => sum + value, 0) / inventoryValues.length
        : 0;

    const cogsByDate = new Map<string, number>();
    for (const row of productHistory.data.records) {
      const dateKey = String(row?.snapshotDate || '').split('T')[0];
      if (!dateKey) continue;
      cogsByDate.set(dateKey, (cogsByDate.get(dateKey) || 0) + Number(row?.cogs || 0));
    }
    const cogsValues = Array.from(cogsByDate.values()).filter((v) => Number.isFinite(v) && v >= 0);
    const periods = cogsValues.length;
    const totalCogs = cogsValues.reduce((sum, value) => sum + value, 0);
    const annualizedCogs =
      periods > 0 ? (totalCogs / periods) * annualPeriods[productHistory.frequency as Frequency] : 0;
    suggestedInventoryTurns =
      averageInventory > 0 && annualizedCogs > 0 ? annualizedCogs / averageInventory : 0;
  }

  let avgWeeklySales = DEFAULT_WEEKLY_DRIVER.sales;
  let avgWeeklyGrossMargin = DEFAULT_WEEKLY_DRIVER.grossMarginPct;
  if (productMarginHistory?.data?.records) {
    const totalsByPeriod = new Map<string, { revenue: number; cogs: number }>();
    for (const row of productMarginHistory.data.records) {
      const dateKey = String(row?.snapshotDate || '').split('T')[0];
      if (!dateKey) continue;
      if (!totalsByPeriod.has(dateKey)) totalsByPeriod.set(dateKey, { revenue: 0, cogs: 0 });
      const bucket = totalsByPeriod.get(dateKey)!;
      bucket.revenue += Number(row?.revenue || 0);
      bucket.cogs += Number(row?.cogs || 0);
    }
    const periods = Array.from(totalsByPeriod.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .slice(0, FORECAST_WEEKS)
      .map(([, totals]) => totals);
    if (periods.length > 0) {
      const margins = periods
        .filter((p) => p.revenue > 0)
        .map((p) => ((p.revenue - p.cogs) / p.revenue) * 100);
      if (margins.length > 0) {
        avgWeeklyGrossMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
      }
    }
  }

  let avgWeeklyOpex = DEFAULT_WEEKLY_DRIVER.opex;
  let inventoryToSalesRatio = DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
  let arRunoffRate = DEFAULT_FLOW_PROFILE.arRunoffRate;
  let apRunoffRate = DEFAULT_FLOW_PROFILE.apRunoffRate;
  let recentHistoricalSales: number[] = [];
  let hasImportedDailyFinancialValues = false;
  if (Array.isArray(dailyFinancial?.records) && dailyFinancial.records.length > 0) {
    const weekly = new Map<string, { revenue: number; expense: number; ar: number; ap: number; latestTs: number }>();
    const inventoryRatioSamples: number[] = [];
    for (const row of dailyFinancial.records) {
      if (
        hasAnyPositiveValue([
          row?.cash,
          row?.ar,
          row?.ap,
          row?.inventory,
          row?.loc,
          row?.revenue,
          row?.expense,
        ])
      ) {
        hasImportedDailyFinancialValues = true;
      }
      const snapshot = row?.snapshotDate ? new Date(row.snapshotDate) : null;
      if (!snapshot || Number.isNaN(snapshot.getTime())) continue;
      const day = snapshot.getUTCDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(snapshot);
      monday.setUTCDate(snapshot.getUTCDate() + diffToMonday);
      monday.setUTCHours(0, 0, 0, 0);
      const weekKey = monday.toISOString().split('T')[0];
      if (!weekly.has(weekKey)) weekly.set(weekKey, { revenue: 0, expense: 0, ar: 0, ap: 0, latestTs: 0 });
      const bucket = weekly.get(weekKey)!;
      bucket.revenue += Number(row?.revenue || 0);
      bucket.expense += Number(row?.expense || 0);
      const revenue = Number(row?.revenue || 0);
      const inventory = Number(row?.inventory || 0);
      if (revenue > 0 && inventory >= 0) {
        inventoryRatioSamples.push(inventory / revenue);
      }
      const snapshotTs = snapshot.getTime();
      if (snapshotTs >= bucket.latestTs) {
        bucket.latestTs = snapshotTs;
        bucket.ar = Number(row?.ar || 0);
        bucket.ap = Number(row?.ap || 0);
      }
    }
    const lastWeeks = Array.from(weekly.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .slice(0, FORECAST_WEEKS)
      .map(([, totals]) => totals);
    recentHistoricalSales = Array.from(weekly.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .slice(0, 52)
      .map(([, totals]) => Math.max(0, Math.round(Number(totals.revenue || 0))));
    if (lastWeeks.length > 0) {
      avgWeeklySales = lastWeeks.reduce((sum, value) => sum + value.revenue, 0) / lastWeeks.length;
      avgWeeklyOpex = lastWeeks.reduce((sum, value) => sum + value.expense, 0) / lastWeeks.length;
    }

    const chronoWeeks = Array.from(weekly.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(-FORECAST_WEEKS)
      .map(([, totals]) => totals);
    const arRunoffSamples: number[] = [];
    const apRunoffSamples: number[] = [];
    for (let i = 1; i < chronoWeeks.length; i += 1) {
      const prev = chronoWeeks[i - 1];
      const curr = chronoWeeks[i];
      const prevAr = Number(prev.ar || 0);
      const currAr = Number(curr.ar || 0);
      const prevAp = Number(prev.ap || 0);
      const currAp = Number(curr.ap || 0);
      if (prevAr > 0) {
        arRunoffSamples.push(clampNumber((prevAr - currAr) / prevAr, 0, 1));
      }
      if (prevAp > 0) {
        apRunoffSamples.push(clampNumber((prevAp - currAp) / prevAp, 0, 1));
      }
    }
    if (arRunoffSamples.length > 0) {
      arRunoffRate = clampNumber(
        arRunoffSamples.reduce((sum, value) => sum + value, 0) / arRunoffSamples.length,
        0.01,
        1
      );
    }
    if (apRunoffSamples.length > 0) {
      apRunoffRate = clampNumber(
        apRunoffSamples.reduce((sum, value) => sum + value, 0) / apRunoffSamples.length,
        0.01,
        1
      );
    }
    if (inventoryRatioSamples.length > 0) {
      inventoryToSalesRatio = clampNumber(
        inventoryRatioSamples.reduce((sum, value) => sum + value, 0) / inventoryRatioSamples.length,
        0.05,
        3
      );
    }
  }

  const derivedStartingBalances: StartingBalances = {
    cash: latestCash,
    ar: latestAr,
    ap: latestAp,
    inventory: Math.max(0, Math.round(latestInventory ?? 0)),
    loc: Math.max(0, Math.round(latestLocBalance ?? 0)),
  };
  const derivedInputs: ForecastInputs = {
    ...DEFAULT_INPUTS,
    inventoryTurns:
      suggestedInventoryTurns > 0
        ? Math.max(0.5, Math.min(30, Math.round(suggestedInventoryTurns * 100) / 100))
        : DEFAULT_INPUTS.inventoryTurns,
    minCashBuffer: DEFAULT_INPUTS.minCashBuffer,
    locLimit: locLoanAmount > 0 || locLimitFromLoansPage ? locLoanAmount : DEFAULT_INPUTS.locLimit,
    locAprPct: DEFAULT_INPUTS.locAprPct,
  };
  const resolvedAverages: WeeklyDriver = {
    sales: Math.max(0, Math.round(avgWeeklySales)),
    opex: Math.max(0, Math.round(avgWeeklyOpex)),
    opexAdj: 0,
    grossMarginPct: Math.max(1, Math.min(99, Math.round(avgWeeklyGrossMargin * 100) / 100)),
  };
  let monthSeries: MonthRevenueSeries | null = options.storedMonthSeries ?? null;
  if (!monthSeries) {
    monthSeries = parseMonthRevenueSeries(
      financialForecastPayload?.settings?.revenueGrowthByRow &&
        typeof financialForecastPayload.settings.revenueGrowthByRow === 'object'
        ? (financialForecastPayload.settings.revenueGrowthByRow as { __monthRevenueSeries?: unknown }).__monthRevenueSeries
        : null,
    );
  }
  if (!monthSeries) monthSeries = options.liveMonthSeries ?? null;
  const monthRefsBase = monthSeries?.monthRefs || [];
  const allocatedForecastSales = allocateForecastSalesByWeek(monthSeries);
  const hasAccrualForecastInputs =
    Object.values(loadedOpexAmountByRow).some((values) => Array.isArray(values) && hasAnyPositiveValue(values));
  const hasImportedStartingBalances = hasAnyPositiveValue(Object.values(derivedStartingBalances));
  const hasAgingBalances = hasAnyPositiveValue([
    ...Object.values(derivedArBuckets),
    ...Object.values(derivedApBuckets),
  ]);
  const hasForecastSourceData =
    hasImportedStartingBalances ||
    hasAgingBalances ||
    hasImportedDailyFinancialValues ||
    hasAnyPositiveValue(recentHistoricalSales) ||
    hasAccrualForecastInputs ||
    locLoanAmount > 0 ||
    suggestedInventoryTurns > 0;
  const seedInputs = hasForecastSourceData ? derivedInputs : EMPTY_INPUTS;
  const seedAverages = hasForecastSourceData ? resolvedAverages : EMPTY_WEEKLY_DRIVER;

  const base = {
    basisMode,
    startingArBuckets: derivedArBuckets,
    startingApBuckets: derivedApBuckets,
    flowProfile: { arRunoffRate, apRunoffRate, inventoryToSalesRatio },
    historicalSalesByWeek: recentHistoricalSales,
    accrualOpexAmountByRow: loadedOpexAmountByRow as Record<string, number[]>,
    accrualOpexPctByRow: loadedOpexPctByRow as Record<string, number[]>,
    accrualOpexPaymentTreatmentByKey: loadedOpexPaymentTreatmentByKey,
    forecastMonthRefs: monthRefsBase,
    forecastMonthTotals: monthSeries?.monthTotals || [],
    forecastMaterialCogsMonthTotals: monthSeries?.materialCogsMonthTotals || [],
    forecastApCogsMonthTotals: monthSeries?.apCogsMonthTotals || [],
    historicalApPaymentProfile,
    historicalArCollectionProfile,
    historicalDebtServiceProfile,
    inventoryTargetProfile: (bootstrap?.operational?.inventoryTargetProfile as InventoryTargetProfile | null) || null,
    monthSeries,
    inventoryBalanceFromImportedData: hasImportedInventoryBalance,
    locBalanceFromImportedData: hasImportedLocBalance,
  };

  if (savedSettings) {
    const mergedInputs = normalizeInputs(savedSettings.inputs, seedInputs);
    const resolvedInputs =
      locLoanAmount > 0 || locLimitFromLoansPage
        ? { ...mergedInputs, locLimit: locLoanAmount }
        : mergedInputs;
    const shouldUseImportedWeekEndingBalances = Boolean(asOfDay);
    const savedStartingBalances: StartingBalances = {
      ...derivedStartingBalances,
      ...(savedSettings?.startingBalances && typeof savedSettings.startingBalances === 'object'
        ? {
            cash: shouldUseImportedWeekEndingBalances
              ? derivedStartingBalances.cash
              : Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).cash, derivedStartingBalances.cash)),
            ar: shouldUseImportedWeekEndingBalances
              ? derivedStartingBalances.ar
              : Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).ar, derivedStartingBalances.ar)),
            ap: shouldUseImportedWeekEndingBalances
              ? derivedStartingBalances.ap
              : Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).ap, derivedStartingBalances.ap)),
            inventory: Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).inventory, derivedStartingBalances.inventory)),
            loc: Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).loc, derivedStartingBalances.loc)),
          }
        : {}),
    };
    const resolvedStartingBalances: StartingBalances = {
      ...savedStartingBalances,
      inventory: hasImportedInventoryBalance
        ? Math.max(0, Math.round(latestInventory || 0))
        : savedStartingBalances.inventory,
      loc: hasImportedLocBalance
        ? Math.max(0, Math.round(latestLocBalance || 0))
        : savedStartingBalances.loc,
    };
    const mergedAverages = normalizeWeeklyDriver(savedSettings.historicalAverages, seedAverages);
    const historicalWeeklySales = Math.max(0, Number(mergedAverages.sales || seedAverages.sales || 0));
    const historicalWeeklyOpex = Math.max(0, Number(mergedAverages.opex || seedAverages.opex || 0));
    const mergedWeekly = applyAllocatedSalesToDrivers(
      normalizeWeeklyDriverList(savedSettings.weeklyDrivers, mergedAverages)
        .map((driver) => ({
          ...driver,
          sales: driver.sales > historicalWeeklySales * 0.25 || historicalWeeklySales <= 0 ? driver.sales : historicalWeeklySales,
          opex: driver.opex > 0 || historicalWeeklyOpex <= 0 ? driver.opex : historicalWeeklyOpex,
        })),
      allocatedForecastSales,
    );
    return {
      ...base,
      inputs: resolvedInputs,
      historicalAverages: mergedAverages,
      weeklyDrivers: mergedWeekly,
      startingBalances: resolvedStartingBalances,
      hasSavedSettings: true,
      lastSavedAt: savedSettings.updatedAt ? String(savedSettings.updatedAt) : null,
    };
  }

  return {
    ...base,
    inputs: seedInputs,
    historicalAverages: seedAverages,
    weeklyDrivers: applyAllocatedSalesToDrivers(
      Array.from({ length: FORECAST_WEEKS }, () => ({ ...seedAverages, opexAdj: 0 })),
      allocatedForecastSales,
    ),
    startingBalances: derivedStartingBalances,
    hasSavedSettings: false,
    lastSavedAt: null,
  };
}

export function projectWorkingCapitalForecast(params: ForecastProjectionInput): ForecastRow[] {
  const {
    basisMode,
    useHistoricalOpeningApPaydown = false,
    inputs,
    startingBalances,
    startingArBuckets,
    startingApBuckets,
    weeklyDrivers,
    flowProfile,
    accrualOpexAmountByRow,
    accrualOpexPctByRow,
    accrualOpexPaymentTreatmentByKey,
    forecastMonthRefs,
    forecastMonthTotals,
    forecastDirectLaborMonthTotals = [],
    forecastMaterialCogsMonthTotals = [],
    forecastApCogsMonthTotals = [],
    historicalSalesByWeek = [],
    historicalApPaymentProfile = null,
    historicalArCollectionProfile = null,
    historicalDebtServiceProfile = null,
    inventoryTargetProfile = null,
  } = params;
  const fixedTargetInventory = Math.max(0, Number(inventoryTargetProfile?.targetInventory || 0));
  const result: ForecastRow[] = [];
  const weeks = FORECAST_WEEKS;
  const isAccrualBasis = basisMode === 'accrual';
  const inventoryWeeksOnHand = Math.max(0.25, 52 / Math.max(0.5, inputs.inventoryTurns));
  const historicalInventoryToSales = flowProfile.inventoryToSalesRatio > 0 ? flowProfile.inventoryToSalesRatio : DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
  const creditSalesRate = clampNumber(inputs.creditSalesPct / 100, 0, 1);
  const collectionLagWeeks = clampNumber(Math.round(inputs.historicalSalesCollectionLagWeeks || 0), 0, 12);
  const arCurrentRate = clampNumber(inputs.arCurrentCollectPct / 100, 0, 1);
  const ar30to60Rate = clampNumber(inputs.ar30To60CollectPct / 100, 0, 1);
  const ar60to90Rate = clampNumber(inputs.ar60To90CollectPct / 100, 0, 1);
  const ar90plusRate = clampNumber(inputs.ar90PlusCollectPct / 100, 0, 1);
  const apCurrentRate = clampNumber(inputs.apCurrentPayPct / 100, 0, 1);
  const ap30to60Rate = clampNumber(inputs.ap30To60PayPct / 100, 0, 1);
  const ap60to90Rate = clampNumber(inputs.ap60To90PayPct / 100, 0, 1);
  const ap90plusRate = clampNumber(inputs.ap90PlusPayPct / 100, 0, 1);
  const arWeeklyWeights = toWeeklyWeights(
    inputs.arWeek1WeightPct,
    inputs.arWeek2WeightPct,
    inputs.arWeek3WeightPct,
    inputs.arWeek4WeightPct
  );
  const apWeeklyWeights = toWeeklyWeights(
    inputs.apWeek1WeightPct,
    inputs.apWeek2WeightPct,
    inputs.apWeek3WeightPct,
    inputs.apWeek4WeightPct
  );
  const useHistoricalApPaymentProfile =
    Number(historicalApPaymentProfile?.weeklyPaymentAmount || 0) > 0 &&
    Number(historicalApPaymentProfile?.purchasePaymentLagWeeks || 0) >= 1;
  const useHistoricalArPaymentProfile =
    Number(historicalArCollectionProfile?.weeklyCollectionAmount || 0) > 0;
  const historicalWeeklyApPayment = Math.max(0, Number(historicalApPaymentProfile?.weeklyPaymentAmount || 0));
  const historicalWeeklyArCollection = Math.max(0, Number(historicalArCollectionProfile?.weeklyCollectionAmount || 0));
  // Principal is a balance-sheet repayment; interest already flows through the
  // Income Statement Forecast opex lines, so only principal is deducted here.
  const weeklyDebtPrincipal = Math.max(0, safeNumber(historicalDebtServiceProfile?.weeklyPrincipalAmount, 0));
  const scheduledDebtPrincipalByWeek = Array.isArray(historicalDebtServiceProfile?.scheduledPrincipalByWeek)
    ? historicalDebtServiceProfile.scheduledPrincipalByWeek
    : [];
  const historicalPurchasePaymentLagWeeks = clampNumber(
    Math.round(Number(historicalApPaymentProfile?.purchasePaymentLagWeeks || 0)),
    1,
    FORECAST_WEEKS,
  );
  type Cohort = { remaining: number; ageWeeks: number; scheduledThisWindow?: number; original?: number };
  const getPhaseRate = (
    ageWeeks: number,
    currentRate: number,
    bucket30to60Rate: number,
    bucket60to90Rate: number,
    bucket90plusRate: number
  ) => {
    if (ageWeeks < 4) return currentRate;
    if (ageWeeks < 8) return bucket30to60Rate;
    if (ageWeeks < 12) return bucket60to90Rate;
    return bucket90plusRate;
  };
  const processCohorts = (
    cohorts: Cohort[],
    currentRate: number,
    bucket30to60Rate: number,
    bucket60to90Rate: number,
    bucket90plusRate: number,
    weeklyWeights: number[]
  ): number => {
    let total = 0;
    for (const cohort of cohorts) {
      if (cohort.remaining <= 0) continue;
      const phaseRate = getPhaseRate(
        cohort.ageWeeks,
        currentRate,
        bucket30to60Rate,
        bucket60to90Rate,
        bucket90plusRate
      );
      const weekWeight = weeklyWeights[cohort.ageWeeks % 4] || 0;
      const scheduled = cohort.remaining * phaseRate * weekWeight;
      const realized = Math.min(cohort.remaining, Math.max(0, safeNumber(scheduled, 0)));
      cohort.remaining = Math.max(0, cohort.remaining - realized);
      total += realized;
    }
    return total;
  };
  // AR collection percentages describe the total expected to collect over an
  // aging window. Apply that total once across the four weekly weights, rather
  // than recalculating it from the declining balance every week.
  const processArCollections = (cohorts: Cohort[]): number => {
    let total = 0;
    for (const cohort of cohorts) {
      if (cohort.remaining <= 0 || cohort.ageWeeks < 0) continue;
      if (cohort.ageWeeks % 4 === 0) {
        cohort.scheduledThisWindow = cohort.remaining * getPhaseRate(
          cohort.ageWeeks,
          arCurrentRate,
          ar30to60Rate,
          ar60to90Rate,
          ar90plusRate,
        );
      }
      const scheduled = Math.max(0, Number(cohort.scheduledThisWindow || 0)) *
        (arWeeklyWeights[cohort.ageWeeks % 4] || 0);
      const realized = Math.min(cohort.remaining, scheduled);
      cohort.remaining = Math.max(0, cohort.remaining - realized);
      total += realized;
    }
    return total;
  };
  const processCohortsByAgeShare = (cohorts: Cohort[], shareByAgeWeek: number[]): number => {
    let total = 0;
    for (const cohort of cohorts) {
      if (cohort.remaining <= 0) continue;
      const share = clampNumber(Number(shareByAgeWeek[cohort.ageWeeks] || 0), 0, 1);
      const realized = Math.min(cohort.remaining, Math.max(0, cohort.original ?? cohort.remaining) * share);
      cohort.remaining = Math.max(0, cohort.remaining - realized);
      total += realized;
    }
    return total;
  };
  const processCohortsAtPaymentLag = (cohorts: Cohort[], paymentLagWeeks: number): number => {
    let total = 0;
    for (const cohort of cohorts) {
      if (cohort.remaining <= 0 || cohort.ageWeeks < paymentLagWeeks) continue;
      total += cohort.remaining;
      cohort.remaining = 0;
    }
    return total;
  };
  const arBuckets = reconcileAgingBucketsToTotal(startingArBuckets, startingBalances.ar);
  const apBuckets = reconcileAgingBucketsToTotal(startingApBuckets, startingBalances.ap);
  const openingApPayments = allocateOpeningAgingBalance(
    apBuckets,
    apCurrentRate,
    ap30to60Rate,
    ap60to90Rate,
    ap90plusRate,
    apWeeklyWeights,
  );
  // Seed the opening AR with recent actual sales cohorts. Without these,
  // Week 1 starts with no in-flight sales collections and each later forecast
  // cohort stacks on top of the opening AR schedule, creating a false ramp.
  // The seeded cohorts are part of starting AR, so reduce the aggregate aging
  // balance by their unpaid amount to avoid counting those receivables twice.
  const recentHistoricalSales = useHistoricalArPaymentProfile
    ? []
    : historicalSalesByWeek
        .slice(0, 4)
        .map((value) => Math.max(0, Number(value || 0)));
  const seededArCohorts: Cohort[] = recentHistoricalSales.map((sales, index) => {
    const ageWeeks = index + 1 - collectionLagWeeks;
    const scheduledThisWindow = sales * arCurrentRate;
    const priorWeight = arWeeklyWeights
      .slice(0, Math.max(0, Math.min(4, ageWeeks)))
      .reduce((sum, weight) => sum + weight, 0);
    return {
      remaining: Math.max(0, sales - scheduledThisWindow * priorWeight),
      ageWeeks,
      scheduledThisWindow,
    };
  });
  const seededArOutstanding = seededArCohorts.reduce((sum, cohort) => sum + cohort.remaining, 0);
  const startingAr = Math.max(0, Number(startingBalances.ar || 0));
  // When receipt history is available, estimate a sales-to-cash delay from
  // the current receivable balance and the observed weekly collection cadence.
  // This does not require invoice-to-payment matching and keeps forecast
  // receipts proportional to the projected sales amount.
  const historicalArCollectionLagWeeks = useHistoricalArPaymentProfile
    ? clampNumber(Math.round(startingAr / historicalWeeklyArCollection), 1, FORECAST_WEEKS)
    : collectionLagWeeks;
  if (seededArOutstanding > startingAr && seededArOutstanding > 0) {
    const scale = startingAr / seededArOutstanding;
    seededArCohorts.forEach((cohort) => {
      cohort.remaining *= scale;
      cohort.scheduledThisWindow = Math.max(0, Number(cohort.scheduledThisWindow || 0)) * scale;
    });
  }
  const remainingOpeningAr = Math.max(
    0,
    startingAr - seededArCohorts.reduce((sum, cohort) => sum + cohort.remaining, 0),
  );
  const openingArScale = startingAr > 0 ? remainingOpeningAr / startingAr : 0;
  // Opening AR and forecast sales use distinct AR cohorts. New credit sales
  // wait for the configured collection lag before their first collection.
  const openingArCohorts: Cohort[] = [
    { remaining: Math.max(0, arBuckets.current * openingArScale), ageWeeks: 0 },
    { remaining: Math.max(0, arBuckets.bucket30to60 * openingArScale), ageWeeks: 4 },
    { remaining: Math.max(0, arBuckets.bucket60to90 * openingArScale), ageWeeks: 8 },
    { remaining: Math.max(0, arBuckets.bucket90plus * openingArScale), ageWeeks: 12 },
  ];
  const arCohorts: Cohort[] = seededArCohorts;
  const apCohorts: Cohort[] = [];
  const openingApPaidShareByWeek = useHistoricalOpeningApPaydown
    ? historicalApPaymentProfile?.openingApPaydown?.shareOfOpeningPaidByWeek
    : undefined;
  const applyHistoricalOpeningApPaydown = Array.isArray(openingApPaidShareByWeek) && openingApPaidShareByWeek.length > 0;
  const newApPaidShareByAgeWeek = applyHistoricalOpeningApPaydown
    ? historicalApPaymentProfile?.openingApPaydown?.shareOfNewVoucherPaidByAgeWeek
    : undefined;
  const applyHistoricalNewApPaydown = Array.isArray(newApPaidShareByAgeWeek) && newApPaidShareByAgeWeek.length > 1;
  const startingApTotal = Math.max(0, Number(startingBalances.ap || 0));
  let openingApOutstanding = startingApTotal;

  const allocatedForecastSales = allocateForecastSalesByWeek(
    parseMonthRevenueSeries({ monthRefs: forecastMonthRefs, monthTotals: forecastMonthTotals }),
  );
  const salesByWeek: number[] = Array.from({ length: weeks }, (_, idx) =>
    allocatedForecastSales.some((value) => value > 0)
      ? Math.max(0, allocatedForecastSales[idx] || 0)
      : Math.max(0, weeklyDrivers[idx]?.sales || 0),
  );
  const weekStarts = Array.from({ length: weeks }, (_, idx) => addDays(getWeekendAnchorDate(new Date()), idx * 7));
  const historicalArInvoices = Array.isArray(historicalArCollectionProfile?.openInvoices)
    ? historicalArCollectionProfile.openInvoices
    : [];
  const openingArInvoiceReceipts = Array.from({ length: weeks }, () => 0);
  if (historicalArInvoices.length > 0) {
    const invoiceTotal = historicalArInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amountDueHome || 0)), 0);
    const scale = invoiceTotal > 0 ? Math.max(0, Number(startingBalances.ar || 0)) / invoiceTotal : 0;
    historicalArInvoices.forEach((invoice) => {
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : invoice.invoiceDate ? new Date(invoice.invoiceDate) : weekStarts[0];
      const expectedDate = Number.isNaN(dueDate.getTime())
        ? weekStarts[0]
        : addDays(dueDate, Number(historicalArCollectionProfile?.paymentDaysAfterDue || 0));
      const weekIndex = weekStarts.findIndex((weekStart) => expectedDate <= addDays(weekStart, 6));
      // Keep invoices expected after this horizon in ending AR instead of
      // incorrectly pulling them into Week 13.
      if (weekIndex >= 0) {
        openingArInvoiceReceipts[weekIndex] += Math.max(0, Number(invoice.amountDueHome || 0)) * scale;
      }
    });
  }
  const scheduledOpeningArTotal = openingArInvoiceReceipts.reduce((sum, value) => sum + value, 0);
  const largestScheduledOpeningArWeek = Math.max(0, ...openingArInvoiceReceipts);
  // Some imports stamp nearly every invoice with the same due date. That is
  // not a usable receipt calendar (and creates a single-week cash spike), so
  // use the historical-sales cohort schedule instead.
  const useHistoricalArInvoiceSchedule =
    scheduledOpeningArTotal > 0 &&
    largestScheduledOpeningArWeek / scheduledOpeningArTotal < 0.6;
  const useHistoricalArSeededCadence =
    !useHistoricalArInvoiceSchedule &&
    !useHistoricalArPaymentProfile &&
    seededArCohorts.length >= 4;
  const useHistoricalArPaymentCadence =
    !useHistoricalArInvoiceSchedule &&
    useHistoricalArPaymentProfile;
  const openingArCadenceReceipt = useHistoricalArPaymentCadence
    ? historicalWeeklyArCollection
    : useHistoricalArSeededCadence
      ? remainingOpeningAr / weeks
      : 0;
  if (useHistoricalArInvoiceSchedule) {
    // Invoice timing already represents the opening AR balance, so the
    // historical-sales seed would double count it.
    arCohorts.splice(0, seededArCohorts.length);
  }
  let openingArInvoiceOutstanding = useHistoricalArSeededCadence || useHistoricalArPaymentCadence
    ? remainingOpeningAr
    : Math.max(0, Number(startingBalances.ar || 0));
  // Direct Production Labor is a COGS category, but unlike material COGS it
  // does not reduce inventory or create an inventory purchase. Pay it as a
  // direct weekly cash disbursement from the Income Statement Forecast.
  const directLaborByWeek = allocateMonthlyAmountsToWeeks(
    forecastDirectLaborMonthTotals.map((value) => Math.max(0, Number(value || 0))),
    forecastMonthRefs,
    weekStarts,
    'calendar',
  );
  const materialCogsByWeek = allocateMonthlyAmountsToWeeks(
    forecastMaterialCogsMonthTotals.map((value) => Math.max(0, Number(value || 0))),
    forecastMonthRefs,
    weekStarts,
    'calendar',
  );
  const apCogsByWeek = allocateMonthlyAmountsToWeeks(
    forecastApCogsMonthTotals.map((value) => Math.max(0, Number(value || 0))),
    forecastMonthRefs,
    weekStarts,
    'calendar',
  );
  const hasForecastMaterialCogs = forecastMaterialCogsMonthTotals.length > 0;
  const opexByWeek: number[] = Array.from({ length: weeks }, (_, idx) => Math.max(0, weeklyDrivers[idx]?.opex || 0));
  const opexPaidInFullByWeek = Array.from({ length: weeks }, () => 0);
  const opexViaApByWeek = Array.from({ length: weeks }, () => 0);
  ACCRUAL_OPEX_LINE_ITEMS.forEach(({ key }) => {
    const treatment = accrualOpexPaymentTreatmentByKey?.[key] === 'ap-schedule' ? 'ap-schedule' : 'paid-in-full';
    const amounts = Array.isArray(accrualOpexAmountByRow[key]) ? accrualOpexAmountByRow[key] : [];
    const pcts = Array.isArray(accrualOpexPctByRow[key]) ? accrualOpexPctByRow[key] : [];
    const weeklyExplicitAmounts = amounts.some((value) => Number(value || 0) > 0)
      ? allocateMonthlyAmountsToWeeks(
          amounts.map((value) => Math.max(0, Number(value || 0))),
          forecastMonthRefs,
          weekStarts,
          key === 'payroll' ? 'payroll-semi-monthly' : 'calendar',
        )
      : [];
    for (let i = 0; i < weeks; i += 1) {
      const explicitAmount = Number(weeklyExplicitAmounts[i] || 0);
      const pct = Number(pcts[i] || 0);
      const pctDerivedAmount = Math.max(0, safeNumber(salesByWeek[i] * (pct / 100), 0));
      const amount = Number.isFinite(explicitAmount) && explicitAmount > 0
        ? Math.max(0, explicitAmount)
        : pctDerivedAmount;
      if (treatment === 'ap-schedule') {
        opexViaApByWeek[i] += amount;
      } else {
        opexPaidInFullByWeek[i] += amount;
      }
    }
  });
  const hasAccrualLineAmounts =
    opexPaidInFullByWeek.some((value) => value > 0) || opexViaApByWeek.some((value) => value > 0);
  const grossMarginByWeek: number[] = Array.from({ length: weeks }, (_, idx) =>
    Math.min(0.99, Math.max(0.01, Number(weeklyDrivers[idx]?.grossMarginPct || 0) / 100))
  );
  let cash = Number(startingBalances.cash || 0);
  let ar = Math.max(0, startingBalances.ar);
  let ap = Math.max(0, startingBalances.ap);
  let inventory = Math.max(0, startingBalances.inventory);
  let loc = Math.max(0, startingBalances.loc);

  for (let i = 0; i < weeks; i += 1) {
    const beginningCash = safeNumber(cash, 0);
    const sales = Math.max(0, safeNumber(salesByWeek[i], 0));
    const cogs = Math.max(0, safeNumber(sales * (1 - grossMarginByWeek[i]), 0));
    const directLabor = Math.max(0, safeNumber(directLaborByWeek[i], 0));
    // Prefer the Income Statement Forecast's inventory-bearing material COGS.
    // Fall back for companies that have not yet saved that breakdown.
    const inventoryCogs = hasForecastMaterialCogs
      ? Math.max(0, safeNumber(materialCogsByWeek[i], 0))
      : Math.max(0, safeNumber(cogs - directLabor, 0));
    const nonInventoryApCogs = Math.max(0, safeNumber(apCogsByWeek[i] - inventoryCogs, 0));
    const directLaborPayments = directLabor;
    const directPaidOpex = isAccrualBasis && hasAccrualLineAmounts
      ? Math.max(0, safeNumber(opexPaidInFullByWeek[i], 0))
      : 0;
    const apScheduledOpex = isAccrualBasis && hasAccrualLineAmounts
      ? Math.max(0, safeNumber(opexViaApByWeek[i], 0))
      : 0;
    const cashOpex = isAccrualBasis && hasAccrualLineAmounts
      ? directPaidOpex
      : Math.max(0, safeNumber(opexByWeek[i], 0));
    const opex = isAccrualBasis && hasAccrualLineAmounts
      ? directPaidOpex + apScheduledOpex
      : cashOpex;
    const turnsTargetInventory = safeNumber(inventoryCogs * inventoryWeeksOnHand, 0);
    const historicalTargetInventory = safeNumber(sales * historicalInventoryToSales, 0);
    const targetInventory = fixedTargetInventory > 0
      ? fixedTargetInventory
      : (turnsTargetInventory + historicalTargetInventory) / 2;

    const postSalesInventory = Math.max(0, safeNumber(inventory - inventoryCogs, 0));
    const purchaseForTarget = Math.max(0, safeNumber(targetInventory - postSalesInventory, 0));
    const purchases = safeNumber(purchaseForTarget, 0);
    let cashSalesReceipts = 0;
    if (isAccrualBasis) {
      const creditSales = Math.max(0, safeNumber(sales * creditSalesRate, 0));
      cashSalesReceipts = Math.max(0, safeNumber(sales - creditSales, 0));
      arCohorts.push({
        remaining: creditSales,
        ageWeeks: useHistoricalArPaymentProfile ? 0 : -collectionLagWeeks,
      });
    } else {
      arCohorts.push({
        remaining: Math.max(0, sales),
        ageWeeks: useHistoricalArPaymentProfile ? 0 : -collectionLagWeeks,
      });
    }

    const openingArReceipts = useHistoricalArInvoiceSchedule
      ? Math.min(openingArInvoiceOutstanding, Math.max(0, openingArInvoiceReceipts[i] || 0))
      : useHistoricalArSeededCadence || useHistoricalArPaymentCadence
        ? Math.min(openingArInvoiceOutstanding, Math.max(0, openingArCadenceReceipt))
        : processArCollections(openingArCohorts);
    const scheduledArReceipts = openingArReceipts + (
      useHistoricalArPaymentProfile
        ? processCohortsAtPaymentLag(arCohorts, historicalArCollectionLagWeeks)
        : processArCollections(arCohorts)
    );
    const recurringApPayments = applyHistoricalNewApPaydown
      ? processCohortsByAgeShare(apCohorts, newApPaidShareByAgeWeek as number[])
      : useHistoricalApPaymentProfile
      ? processCohortsAtPaymentLag(apCohorts, historicalPurchasePaymentLagWeeks)
      : processCohorts(
          apCohorts,
          apCurrentRate,
          ap30to60Rate,
          ap60to90Rate,
          ap90plusRate,
          apWeeklyWeights
        );
    const openingApPayment = applyHistoricalOpeningApPaydown
      ? Math.min(openingApOutstanding, startingApTotal * clampNumber(Number(openingApPaidShareByWeek?.[i] || 0), 0, 1))
      : useHistoricalApPaymentProfile
        ? Math.min(openingApOutstanding, Math.max(0, historicalWeeklyApPayment - recurringApPayments))
        : Math.max(0, safeNumber(openingApPayments[i] || 0));
    const apPayments = openingApPayment + recurringApPayments;
    if (useHistoricalArInvoiceSchedule || useHistoricalArSeededCadence || useHistoricalArPaymentCadence) {
      openingArInvoiceOutstanding = Math.max(0, openingArInvoiceOutstanding - openingArReceipts);
    }
    openingApOutstanding = Math.max(
      0,
      openingApOutstanding - openingApPayment,
    );
    // Add this week's new AP after payout processing so newly incurred AP
    // starts paying in following weeks rather than being paid immediately.
    const newAp = Math.max(0, purchases + nonInventoryApCogs + apScheduledOpex);
    apCohorts.push({ remaining: newAp, ageWeeks: 0, original: newAp });
    const receipts = Math.max(0, safeNumber(scheduledArReceipts + cashSalesReceipts, 0));

    const locInterest = safeNumber(loc * (Math.max(0, inputs.locAprPct) / 100) / 52, 0);
    const opexAdj = safeNumber(weeklyDrivers[i]?.opexAdj, 0);
    const debtPrincipal = Math.max(0, safeNumber(scheduledDebtPrincipalByWeek[i], weeklyDebtPrincipal));
    const baseEndingCash = safeNumber(
      beginningCash + receipts - apPayments - directLaborPayments - cashOpex - opexAdj - locInterest - debtPrincipal,
      beginningCash,
    );
    const unleveredEndingCash = baseEndingCash;

    let locDraw = 0;
    let locRepay = 0;
    if (baseEndingCash < Math.max(0, inputs.minCashBuffer)) {
      const gap = Math.max(0, inputs.minCashBuffer - baseEndingCash);
      const availableToDraw = Math.max(0, Math.max(0, inputs.locLimit) - loc);
      locDraw = Math.min(gap, availableToDraw);
    } else if (baseEndingCash > Math.max(0, inputs.minCashBuffer) && loc > 0) {
      const excess = baseEndingCash - Math.max(0, inputs.minCashBuffer);
      locRepay = Math.min(excess, loc);
    }

    const endingCashRaw = safeNumber(baseEndingCash + locDraw - locRepay, beginningCash);
    const endingCash = Number.isFinite(endingCashRaw) ? endingCashRaw : beginningCash;
    const endingLoc = Math.max(0, safeNumber(loc + locDraw - locRepay, loc));
    const endingAr = Math.max(
      0,
      safeNumber(
        (useHistoricalArInvoiceSchedule || useHistoricalArSeededCadence || useHistoricalArPaymentCadence
          ? openingArInvoiceOutstanding
          : openingArCohorts.reduce((sum, cohort) => sum + Math.max(0, cohort.remaining), 0)) +
          arCohorts.reduce((sum, cohort) => sum + Math.max(0, cohort.remaining), 0),
        ar
      )
    );
    const endingAp = Math.max(
      0,
      safeNumber(
        openingApOutstanding +
          apCohorts.reduce((sum, cohort) => sum + Math.max(0, cohort.remaining), 0),
        ap
      )
    );
    const endingInventory = Math.max(0, safeNumber(postSalesInventory + purchases, inventory));

    result.push({
      week: i + 1,
      beginningCash,
      sales,
      receipts,
      cogs,
      inventoryCogs,
      directLabor,
      directLaborPayments,
      targetInventory,
      purchases,
      apPayments,
      opex,
      cashOpex,
      opexAdj,
      locInterest,
      debtPrincipal,
      locDraw,
      locRepay,
      unleveredEndingCash,
      endingCash,
      endingLoc,
      endingAr,
      endingAp,
      endingInventory,
    });

    cash = endingCash;
    loc = endingLoc;
    ar = endingAr;
    ap = endingAp;
    inventory = endingInventory;
    for (const cohort of openingArCohorts) cohort.ageWeeks += 1;
    for (const cohort of arCohorts) cohort.ageWeeks += 1;
    for (const cohort of apCohorts) cohort.ageWeeks += 1;
  }

  return result;
}
