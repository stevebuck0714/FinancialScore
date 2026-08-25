import * as XLSX from 'xlsx';
import { estMonthIndex, estYear } from '@/lib/time/eastern';

export const GOAL_SCENARIOS = ['FORECASTED', 'BASELINE', 'GROWTH', 'STRETCH'] as const;
export type GoalScenario = (typeof GOAL_SCENARIOS)[number];
export type PyramidPeriodKey = 'MTD' | 'QTD' | 'YTD';

export type GoalScenarioRow = {
  scenario: GoalScenario;
  annualGoal: number | null;
  ytdActual: number | null;
  goalVsActualYtd: number | null;
  pctYtdVsGoal: number | null;
  quarterGoal: number | null;
  quarterYtd: number | null;
  goalVsActualQtd: number | null;
  pctQtdVsGoal: number | null;
};

export type MonthlyRevenueGoalKey = 'baseline' | 'growth' | 'stretch';

export type MonthlyRevenueGoalMonth = {
  month: number;
  baseline: number | null;
  growth: number | null;
  stretch: number | null;
};

export type GoalUpdateSnapshot = {
  year: number | null;
  quarter: number | null;
  shippingDaysRemainingYtd: number | null;
  shippingDaysRemainingQtd: number | null;
  rows: GoalScenarioRow[];
  monthlyRevenueGoals: MonthlyRevenueGoalMonth[];
};

export type PyramidMetric = {
  actual: number | null;
  currentForecasts: number | null;
  sgpForecast: number | null;
  baselineGoal: number | null;
  growthGoal: number | null;
  stretchGoal: number | null;
  vsCurrentForecasts: number | null;
  vsSgpForecast: number | null;
  vsBaseline: number | null;
  vsGrowth: number | null;
  vsStretch: number | null;
  pctCurrentForecasts: number | null;
  pctSgpForecast: number | null;
  pctBaseline: number | null;
  pctGrowth: number | null;
  pctStretch: number | null;
};

export type PyramidPeriod = {
  period: PyramidPeriodKey;
  quarter: number | null;
  year: number | null;
  shippingDaysRemaining: number | null;
  values: PyramidMetric;
};

export type PyramidBlock = {
  kind: 'revenue' | 'issues';
  monthLabel: string | null;
  mtd: PyramidPeriod | null;
  qtd: PyramidPeriod | null;
  ytd: PyramidPeriod | null;
};

export type PyramidSnapshot = {
  monthLabel: string | null;
  revenue: PyramidBlock | null;
  issues: PyramidBlock | null;
};

type MatrixCell = string | number | Date | boolean | null | undefined;

const GOAL_UPDATE_MAX_ROW = 21;
const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

export const MONTH_GOAL_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function asString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = asString(value).replace(/[$,%\s,]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInteger(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed == null) return null;
  const rounded = Math.round(parsed);
  return Number.isFinite(rounded) ? rounded : null;
}

function sheetToMatrix(sheet: XLSX.WorkSheet | undefined): MatrixCell[][] {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<MatrixCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
}

function findSheetName(workbook: XLSX.WorkBook, exact: string, fuzzy: (name: string) => boolean): string | null {
  const names = workbook.SheetNames || [];
  const match = names.find((name) => name.trim().toLowerCase() === exact.toLowerCase());
  if (match) return match;
  return names.find(fuzzy) || null;
}

function emptyMetric(): PyramidMetric {
  return {
    actual: null,
    currentForecasts: null,
    sgpForecast: null,
    baselineGoal: null,
    growthGoal: null,
    stretchGoal: null,
    vsCurrentForecasts: null,
    vsSgpForecast: null,
    vsBaseline: null,
    vsGrowth: null,
    vsStretch: null,
    pctCurrentForecasts: null,
    pctSgpForecast: null,
    pctBaseline: null,
    pctGrowth: null,
    pctStretch: null,
  };
}

function emptyGoalRow(scenario: GoalScenario): GoalScenarioRow {
  return {
    scenario,
    annualGoal: null,
    ytdActual: null,
    goalVsActualYtd: null,
    pctYtdVsGoal: null,
    quarterGoal: null,
    quarterYtd: null,
    goalVsActualQtd: null,
    pctQtdVsGoal: null,
  };
}

export function emptyMonthlyRevenueGoals(): MonthlyRevenueGoalMonth[] {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    baseline: null,
    growth: null,
    stretch: null,
  }));
}

export function emptyGoalUpdateSnapshot(year: number | null = null): GoalUpdateSnapshot {
  return {
    year,
    quarter: null,
    shippingDaysRemainingYtd: null,
    shippingDaysRemainingQtd: null,
    rows: GOAL_SCENARIOS.map((scenario) => emptyGoalRow(scenario)),
    monthlyRevenueGoals: emptyMonthlyRevenueGoals(),
  };
}

export function hasMonthlyRevenueGoals(months: MonthlyRevenueGoalMonth[] | null | undefined): boolean {
  return (months || []).some((row) => row.baseline != null || row.growth != null || row.stretch != null);
}

export function hasGoalUpdateRows(snapshot: GoalUpdateSnapshot | null | undefined): boolean {
  return Boolean(
    snapshot?.rows?.some(
      (row) =>
        row.annualGoal != null ||
        row.ytdActual != null ||
        row.quarterGoal != null ||
        row.quarterYtd != null
    )
  );
}

function isGoalScenario(value: unknown): value is GoalScenario {
  const text = asString(value).toUpperCase();
  return (GOAL_SCENARIOS as readonly string[]).includes(text);
}

function isPeriodKey(value: unknown): value is PyramidPeriodKey {
  const text = asString(value).toUpperCase();
  return text === 'MTD' || text === 'QTD' || text === 'YTD';
}

function monthLabelFromText(value: unknown): string | null {
  const text = asString(value).toUpperCase();
  if (!text) return null;
  const match = MONTH_NAMES.find((name) => text === name || text.startsWith(name.slice(0, 3)));
  return match ? match[0] + match.slice(1).toLowerCase() : null;
}

function looksLikeGoalHeader(row: MatrixCell[] | undefined): boolean {
  const joined = (row || []).map((cell) => asString(cell).toUpperCase()).join(' | ');
  return joined.includes('SGP GOAL') && (joined.includes('YTD') || joined.includes('QTR'));
}

export function parseGoalUpdateSheet(workbook: XLSX.WorkBook): GoalUpdateSnapshot | null {
  const sheetName = findSheetName(
    workbook,
    'Goal Update',
    (name) => name.toLowerCase().includes('goal') && name.toLowerCase().includes('update')
  );
  if (!sheetName) return null;
  const matrix = sheetToMatrix(workbook.Sheets[sheetName]).slice(0, GOAL_UPDATE_MAX_ROW);
  if (!matrix.length) return null;

  let shippingDaysRemainingYtd: number | null = null;
  let shippingDaysRemainingQtd: number | null = null;
  let year: number | null = null;
  let quarter: number | null = null;

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const hasShippingLabel = row.some((cell) => asString(cell).toLowerCase().includes('shipping days remaining'));
    if (!hasShippingLabel) continue;
    const next = matrix[r + 1] || [];
    shippingDaysRemainingYtd = asInteger(next[1]) ?? asInteger(row[1]);
    year = asInteger(next[2]);
    quarter = asInteger(next[6]);
    shippingDaysRemainingQtd = asInteger(next[7]) ?? asInteger(row[7]);
    if (year != null && (year < 2000 || year > 2100)) year = null;
    if (quarter != null && (quarter < 1 || quarter > 4)) quarter = null;
    break;
  }

  const rowsByScenario = new Map<GoalScenario, GoalScenarioRow>();
  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    if (looksLikeGoalHeader(row)) continue;
    const scenarioCell = row.find((cell) => isGoalScenario(cell));
    if (!isGoalScenario(scenarioCell)) continue;
    rowsByScenario.set(scenarioCell.toUpperCase() as GoalScenario, {
      scenario: scenarioCell.toUpperCase() as GoalScenario,
      annualGoal: asNumber(row[1]),
      ytdActual: asNumber(row[2]),
      goalVsActualYtd: asNumber(row[3]),
      pctYtdVsGoal: asNumber(row[4]),
      quarterGoal: asNumber(row[5]),
      quarterYtd: asNumber(row[6]),
      goalVsActualQtd: asNumber(row[7]),
      pctQtdVsGoal: asNumber(row[8]),
    });
  }

  const rows = GOAL_SCENARIOS.map((scenario) => rowsByScenario.get(scenario) || emptyGoalRow(scenario));
  const hasValues = rows.some(
    (row) =>
      row.annualGoal != null ||
      row.ytdActual != null ||
      row.quarterGoal != null ||
      row.quarterYtd != null
  );
  if (!hasValues) return null;

  return {
    year,
    quarter,
    shippingDaysRemainingYtd,
    shippingDaysRemainingQtd,
    rows,
    monthlyRevenueGoals: emptyMonthlyRevenueGoals(),
  };
}

function findActualColumns(row: MatrixCell[]): number[] {
  const indexes: number[] = [];
  row.forEach((cell, index) => {
    if (asString(cell).toUpperCase() === 'ACTUAL') indexes.push(index);
  });
  return indexes;
}

function pickMetric(
  amountRow: MatrixCell[] | undefined,
  vsRow: MatrixCell[] | undefined,
  pctRow: MatrixCell[] | undefined,
  cols: { actual: number; current: number; sgp: number; baseline: number | null; growth: number | null; stretch: number | null }
): PyramidMetric {
  return {
    actual: asNumber(amountRow?.[cols.actual]),
    currentForecasts: asNumber(amountRow?.[cols.current]),
    sgpForecast: asNumber(amountRow?.[cols.sgp]),
    baselineGoal: cols.baseline == null ? null : asNumber(amountRow?.[cols.baseline]),
    growthGoal: cols.growth == null ? null : asNumber(amountRow?.[cols.growth]),
    stretchGoal: cols.stretch == null ? null : asNumber(amountRow?.[cols.stretch]),
    vsCurrentForecasts: asNumber(vsRow?.[cols.current]),
    vsSgpForecast: asNumber(vsRow?.[cols.sgp]),
    vsBaseline: cols.baseline == null ? null : asNumber(vsRow?.[cols.baseline]),
    vsGrowth: cols.growth == null ? null : asNumber(vsRow?.[cols.growth]),
    vsStretch: cols.stretch == null ? null : asNumber(vsRow?.[cols.stretch]),
    pctCurrentForecasts: asNumber(pctRow?.[cols.current]),
    pctSgpForecast: asNumber(pctRow?.[cols.sgp]),
    pctBaseline: cols.baseline == null ? null : asNumber(pctRow?.[cols.baseline]),
    pctGrowth: cols.growth == null ? null : asNumber(pctRow?.[cols.growth]),
    pctStretch: cols.stretch == null ? null : asNumber(pctRow?.[cols.stretch]),
  };
}

function nearbyMeta(matrix: MatrixCell[][], periodRow: number, labelCol: number): {
  quarter: number | null;
  year: number | null;
  shippingDaysRemaining: number | null;
} {
  let quarter: number | null = null;
  let year: number | null = null;
  const vsValue = asNumber(matrix[periodRow + 1]?.[labelCol]);
  const shippingDaysRemaining =
    vsValue != null && vsValue >= 2 && vsValue <= 366 && Number.isInteger(vsValue) ? vsValue : null;

  for (let r = Math.max(0, periodRow - 3); r < periodRow; r += 1) {
    const value = asNumber(matrix[r]?.[labelCol]);
    if (value == null) continue;
    if (value >= 1 && value <= 4 && Number.isInteger(value)) quarter = value;
    if (value >= 2000 && value <= 2100 && Number.isInteger(value)) year = value;
  }
  return { quarter, year, shippingDaysRemaining };
}

export function parsePyramidSheet(workbook: XLSX.WorkBook): PyramidSnapshot | null {
  const sheetName = findSheetName(
    workbook,
    'Pyramid',
    (name) => name.trim().toLowerCase() === 'pyramid' || name.toLowerCase().includes('pyramid')
  );
  if (!sheetName) return null;
  const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
  if (!matrix.length) return null;

  let headerRowIndex = -1;
  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const joined = row.map((cell) => asString(cell).toUpperCase()).join(' | ');
    if (joined.includes('ACTUAL') && joined.includes('CURRENT FORECAST')) {
      headerRowIndex = r;
      break;
    }
  }
  if (headerRowIndex < 0) return null;

  const header = matrix[headerRowIndex] || [];
  const actualCols = findActualColumns(header);
  const revenueStart = actualCols[0];
  const issuesStart = actualCols.find((index) => index >= 10) ?? actualCols[1];
  if (revenueStart == null) return null;

  const revenueMonthLabel = monthLabelFromText(header[revenueStart + 3]);
  const issuesMonthLabel = issuesStart == null ? null : monthLabelFromText(header[issuesStart + 2]);
  const monthLabel = revenueMonthLabel || issuesMonthLabel;

  const revenueCols = {
    actual: revenueStart,
    current: revenueStart + 1,
    sgp: revenueStart + 2,
    baseline: revenueStart + 4,
    growth: revenueStart + 5,
    stretch: revenueStart + 6,
  };
  const issuesCols =
    issuesStart == null
      ? null
      : {
          actual: issuesStart,
          current: issuesStart + 1,
          sgp: issuesStart + 3,
          baseline: null,
          growth: null,
          stretch: null,
        };

  const revenuePeriods: Partial<Record<PyramidPeriodKey, PyramidPeriod>> = {};
  const issuesPeriods: Partial<Record<PyramidPeriodKey, PyramidPeriod>> = {};
  const revenueLabelCol = revenueStart + 3;
  const issuesLabelCol = issuesStart == null ? -1 : issuesStart + 2;

  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const period =
      (isPeriodKey(matrix[r]?.[revenueLabelCol]) && (matrix[r]?.[revenueLabelCol] as string).toString().toUpperCase()) ||
      (issuesLabelCol >= 0 && isPeriodKey(matrix[r]?.[issuesLabelCol])
        ? asString(matrix[r]?.[issuesLabelCol]).toUpperCase()
        : '');
    if (!isPeriodKey(period)) continue;
    const meta = nearbyMeta(matrix, r, revenueLabelCol);
    const amountRow = matrix[r];
    const vsRow = matrix[r + 1];
    const pctRow = matrix[r + 2];
    revenuePeriods[period] = {
      period,
      quarter: period === 'QTD' ? meta.quarter : null,
      year: period === 'YTD' ? meta.year : null,
      shippingDaysRemaining: period === 'MTD' ? null : meta.shippingDaysRemaining,
      values: pickMetric(amountRow, vsRow, pctRow, revenueCols),
    };
    if (issuesCols) {
      issuesPeriods[period] = {
        period,
        quarter: period === 'QTD' ? meta.quarter : null,
        year: period === 'YTD' ? meta.year : null,
        shippingDaysRemaining: period === 'MTD' ? null : meta.shippingDaysRemaining,
        values: pickMetric(amountRow, vsRow, pctRow, issuesCols),
      };
    }
  }

  const hasRevenue = Boolean(revenuePeriods.MTD || revenuePeriods.QTD || revenuePeriods.YTD);
  const hasIssues = Boolean(issuesPeriods.MTD || issuesPeriods.QTD || issuesPeriods.YTD);
  if (!hasRevenue && !hasIssues) return null;

  return {
    monthLabel,
    revenue: hasRevenue
      ? {
          kind: 'revenue',
          monthLabel: revenueMonthLabel || monthLabel,
          mtd: revenuePeriods.MTD || null,
          qtd: revenuePeriods.QTD || null,
          ytd: revenuePeriods.YTD || null,
        }
      : null,
    issues: hasIssues
      ? {
          kind: 'issues',
          monthLabel: issuesMonthLabel || monthLabel,
          mtd: issuesPeriods.MTD || null,
          qtd: issuesPeriods.QTD || null,
          ytd: issuesPeriods.YTD || null,
        }
      : null,
  };
}

export function parseGoalDashboardFromWorkbook(workbook: XLSX.WorkBook): {
  goalUpdate: GoalUpdateSnapshot | null;
  pyramid: PyramidSnapshot | null;
} {
  try {
    return {
      goalUpdate: parseGoalUpdateSheet(workbook),
      pyramid: parsePyramidSheet(workbook),
    };
  } catch {
    return { goalUpdate: null, pyramid: null };
  }
}

function asNullableNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed == null || !Number.isFinite(parsed) ? null : parsed;
}

export function normalizeMonthlyRevenueGoals(raw: unknown): MonthlyRevenueGoalMonth[] {
  const months = emptyMonthlyRevenueGoals();
  const incoming = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { months?: unknown }).months)
      ? (raw as { months: unknown[] }).months
      : [];
  incoming.forEach((row) => {
    const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const month = asInteger(item.month);
    if (month == null || month < 1 || month > 12) return;
    months[month - 1] = {
      month,
      baseline: asNullableNumber(item.baseline),
      growth: asNullableNumber(item.growth),
      stretch: asNullableNumber(item.stretch),
    };
  });
  return months;
}

function normalizeScenarioRow(raw: unknown, fallback: GoalScenario): GoalScenarioRow {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scenario = isGoalScenario(row.scenario) ? (asString(row.scenario).toUpperCase() as GoalScenario) : fallback;
  return {
    scenario,
    annualGoal: asNullableNumber(row.annualGoal),
    ytdActual: asNullableNumber(row.ytdActual),
    goalVsActualYtd: asNullableNumber(row.goalVsActualYtd),
    pctYtdVsGoal: asNullableNumber(row.pctYtdVsGoal),
    quarterGoal: asNullableNumber(row.quarterGoal),
    quarterYtd: asNullableNumber(row.quarterYtd),
    goalVsActualQtd: asNullableNumber(row.goalVsActualQtd),
    pctQtdVsGoal: asNullableNumber(row.pctQtdVsGoal),
  };
}

export function normalizeGoalUpdateSnapshot(raw: unknown): GoalUpdateSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const incoming = Array.isArray(value.rows) ? value.rows : [];
  const byScenario = new Map<GoalScenario, GoalScenarioRow>();
  incoming.forEach((row) => {
    const parsed = normalizeScenarioRow(row, 'FORECASTED');
    byScenario.set(parsed.scenario, parsed);
  });
  const rows = GOAL_SCENARIOS.map((scenario) => byScenario.get(scenario) || emptyGoalRow(scenario));
  const monthlyRevenueGoals = normalizeMonthlyRevenueGoals(value.monthlyRevenueGoals);
  const hasValues = rows.some(
    (row) => row.annualGoal != null || row.ytdActual != null || row.quarterGoal != null || row.quarterYtd != null
  );
  if (!hasValues && value.year == null && value.quarter == null && !hasMonthlyRevenueGoals(monthlyRevenueGoals)) {
    return null;
  }
  return {
    year: asInteger(value.year),
    quarter: asInteger(value.quarter),
    shippingDaysRemainingYtd: asInteger(value.shippingDaysRemainingYtd),
    shippingDaysRemainingQtd: asInteger(value.shippingDaysRemainingQtd),
    rows,
    monthlyRevenueGoals,
  };
}

function normalizeMetric(raw: unknown): PyramidMetric {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    actual: asNullableNumber(value.actual),
    currentForecasts: asNullableNumber(value.currentForecasts),
    sgpForecast: asNullableNumber(value.sgpForecast),
    baselineGoal: asNullableNumber(value.baselineGoal),
    growthGoal: asNullableNumber(value.growthGoal),
    stretchGoal: asNullableNumber(value.stretchGoal),
    vsCurrentForecasts: asNullableNumber(value.vsCurrentForecasts),
    vsSgpForecast: asNullableNumber(value.vsSgpForecast),
    vsBaseline: asNullableNumber(value.vsBaseline),
    vsGrowth: asNullableNumber(value.vsGrowth),
    vsStretch: asNullableNumber(value.vsStretch),
    pctCurrentForecasts: asNullableNumber(value.pctCurrentForecasts),
    pctSgpForecast: asNullableNumber(value.pctSgpForecast),
    pctBaseline: asNullableNumber(value.pctBaseline),
    pctGrowth: asNullableNumber(value.pctGrowth),
    pctStretch: asNullableNumber(value.pctStretch),
  };
}

function normalizePeriod(raw: unknown, fallback: PyramidPeriodKey): PyramidPeriod | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const period = isPeriodKey(value.period) ? (asString(value.period).toUpperCase() as PyramidPeriodKey) : fallback;
  return {
    period,
    quarter: asInteger(value.quarter),
    year: asInteger(value.year),
    shippingDaysRemaining: asInteger(value.shippingDaysRemaining),
    values: normalizeMetric(value.values),
  };
}

function normalizeBlock(raw: unknown, kind: 'revenue' | 'issues'): PyramidBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const mtd = normalizePeriod(value.mtd, 'MTD');
  const qtd = normalizePeriod(value.qtd, 'QTD');
  const ytd = normalizePeriod(value.ytd, 'YTD');
  if (!mtd && !qtd && !ytd) return null;
  return {
    kind,
    monthLabel: monthLabelFromText(value.monthLabel) || asString(value.monthLabel) || null,
    mtd,
    qtd,
    ytd,
  };
}

export function normalizePyramidSnapshot(raw: unknown): PyramidSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const revenue = normalizeBlock(value.revenue, 'revenue');
  const issues = normalizeBlock(value.issues, 'issues');
  if (!revenue && !issues) return null;
  return {
    monthLabel: monthLabelFromText(value.monthLabel) || asString(value.monthLabel) || null,
    revenue,
    issues,
  };
}

export function hasGoalDashboardData(
  goalUpdate: GoalUpdateSnapshot | null | undefined,
  pyramid: PyramidSnapshot | null | undefined
): boolean {
  return Boolean(
    pyramid ||
    hasGoalUpdateRows(goalUpdate) ||
    hasMonthlyRevenueGoals(goalUpdate?.monthlyRevenueGoals)
  );
}

export function monthNumberFromLabel(value: unknown): number | null {
  const text = asString(value).toUpperCase();
  if (!text) return null;
  const index = MONTH_NAMES.findIndex((name) => text === name || text.startsWith(name.slice(0, 3)));
  return index >= 0 ? index + 1 : null;
}

export function quarterMonths(quarter: number): number[] {
  if (quarter < 1 || quarter > 4) return [];
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function sumMonthlyGoal(
  months: MonthlyRevenueGoalMonth[],
  monthNumbers: number[],
  key: MonthlyRevenueGoalKey
): number | null {
  let total = 0;
  let any = false;
  for (const month of monthNumbers) {
    const value = months[month - 1]?.[key];
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    any = true;
  }
  return any ? total : null;
}

export function resolveGoalMonthNumber(params: {
  monthLabel?: string | null;
  dataThru?: string | null;
  year: number;
}): number | null {
  const fromLabel = monthNumberFromLabel(params.monthLabel);
  if (fromLabel) return fromLabel;
  const thru = String(params.dataThru || '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})/.exec(thru);
  if (match) {
    const thruYear = Number(match[1]);
    const thruMonth = Number(match[2]);
    if (thruYear === params.year && thruMonth >= 1 && thruMonth <= 12) return thruMonth;
  }
  if (estYear() === params.year) return estMonthIndex() + 1;
  return null;
}

function vsPlan(actual: number | null, goal: number | null): number | null {
  if (actual == null || goal == null) return null;
  return actual - goal;
}

function pctPlan(actual: number | null, goal: number | null): number | null {
  if (actual == null || goal == null || goal === 0) return null;
  return actual / goal;
}

function overlayPyramidMetric(metric: PyramidMetric, goals: Record<MonthlyRevenueGoalKey, number | null>, useMonthly: boolean): PyramidMetric {
  if (!useMonthly) return metric;
  return {
    ...metric,
    baselineGoal: goals.baseline,
    growthGoal: goals.growth,
    stretchGoal: goals.stretch,
    vsBaseline: vsPlan(metric.actual, goals.baseline),
    vsGrowth: vsPlan(metric.actual, goals.growth),
    vsStretch: vsPlan(metric.actual, goals.stretch),
    pctBaseline: pctPlan(metric.actual, goals.baseline),
    pctGrowth: pctPlan(metric.actual, goals.growth),
    pctStretch: pctPlan(metric.actual, goals.stretch),
  };
}

function overlayPyramidPeriod(
  period: PyramidPeriod | null,
  goals: Record<MonthlyRevenueGoalKey, number | null>,
  useMonthly: boolean
): PyramidPeriod | null {
  if (!period) return null;
  return { ...period, values: overlayPyramidMetric(period.values, goals, useMonthly) };
}

function overlayPyramidBlock(
  block: PyramidBlock | null,
  months: MonthlyRevenueGoalMonth[],
  monthNumber: number | null,
  useMonthly: boolean
): PyramidBlock | null {
  if (!block || block.kind !== 'revenue') return block;
  const quarter = monthNumber ? Math.ceil(monthNumber / 3) : null;
  const monthGoals: Record<MonthlyRevenueGoalKey, number | null> = {
    baseline: monthNumber ? months[monthNumber - 1]?.baseline ?? null : null,
    growth: monthNumber ? months[monthNumber - 1]?.growth ?? null : null,
    stretch: monthNumber ? months[monthNumber - 1]?.stretch ?? null : null,
  };
  const quarterGoals: Record<MonthlyRevenueGoalKey, number | null> = {
    baseline: quarter ? sumMonthlyGoal(months, quarterMonths(quarter), 'baseline') : null,
    growth: quarter ? sumMonthlyGoal(months, quarterMonths(quarter), 'growth') : null,
    stretch: quarter ? sumMonthlyGoal(months, quarterMonths(quarter), 'stretch') : null,
  };
  const annualGoals: Record<MonthlyRevenueGoalKey, number | null> = {
    baseline: sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'baseline'),
    growth: sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'growth'),
    stretch: sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'stretch'),
  };
  return {
    ...block,
    mtd: overlayPyramidPeriod(block.mtd, monthGoals, useMonthly),
    qtd: overlayPyramidPeriod(block.qtd, quarterGoals, useMonthly),
    ytd: overlayPyramidPeriod(block.ytd, annualGoals, useMonthly),
  };
}

function overlayGoalRow(row: GoalScenarioRow, annual: number | null, quarter: number | null, useMonthly: boolean): GoalScenarioRow {
  if (!useMonthly || row.scenario === 'FORECASTED') return row;
  const annualGoal = annual;
  const quarterGoal = quarter;
  return {
    ...row,
    annualGoal,
    quarterGoal,
    goalVsActualYtd: vsPlan(row.ytdActual, annualGoal),
    pctYtdVsGoal: pctPlan(row.ytdActual, annualGoal),
    goalVsActualQtd: vsPlan(row.quarterYtd, quarterGoal),
    pctQtdVsGoal: pctPlan(row.quarterYtd, quarterGoal),
  };
}

export function mergeGoalUpdateSnapshots(
  incoming: GoalUpdateSnapshot | null,
  existing: GoalUpdateSnapshot | null
): GoalUpdateSnapshot | null {
  const monthly = hasMonthlyRevenueGoals(existing?.monthlyRevenueGoals)
    ? existing?.monthlyRevenueGoals || emptyMonthlyRevenueGoals()
    : incoming?.monthlyRevenueGoals || existing?.monthlyRevenueGoals || emptyMonthlyRevenueGoals();
  if (incoming) return { ...incoming, monthlyRevenueGoals: monthly };
  if (existing) return { ...existing, monthlyRevenueGoals: monthly };
  if (!hasMonthlyRevenueGoals(monthly)) return null;
  return { ...emptyGoalUpdateSnapshot(), monthlyRevenueGoals: monthly };
}

export function applyMonthlyRevenueGoals(params: {
  goalUpdate: GoalUpdateSnapshot | null;
  pyramid: PyramidSnapshot | null;
  year: number;
  dataThru?: string | null;
}): { goalUpdate: GoalUpdateSnapshot | null; pyramid: PyramidSnapshot | null } {
  const months = params.goalUpdate?.monthlyRevenueGoals || emptyMonthlyRevenueGoals();
  const useMonthly = hasMonthlyRevenueGoals(months);
  const monthNumber = resolveGoalMonthNumber({
    monthLabel: params.pyramid?.monthLabel || params.pyramid?.revenue?.monthLabel || null,
    dataThru: params.dataThru || null,
    year: params.year,
  });
  const quarter = monthNumber ? Math.ceil(monthNumber / 3) : params.goalUpdate?.quarter || null;
  const pyramid = params.pyramid
    ? {
        ...params.pyramid,
        revenue: overlayPyramidBlock(params.pyramid.revenue, months, monthNumber, useMonthly),
        issues: params.pyramid.issues,
      }
    : null;

  if (!params.goalUpdate && !useMonthly) {
    return { goalUpdate: null, pyramid };
  }

  const base = params.goalUpdate || emptyGoalUpdateSnapshot(params.year);
  const goalUpdate: GoalUpdateSnapshot = {
    ...base,
    year: base.year || params.year,
    quarter: base.quarter || quarter,
    monthlyRevenueGoals: months,
    rows: base.rows.map((row) => {
      if (row.scenario === 'FORECASTED') return row;
      const key: MonthlyRevenueGoalKey =
        row.scenario === 'BASELINE' ? 'baseline' : row.scenario === 'GROWTH' ? 'growth' : 'stretch';
      return overlayGoalRow(
        row,
        sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], key),
        quarter ? sumMonthlyGoal(months, quarterMonths(quarter), key) : null,
        useMonthly
      );
    }),
  };
  return { goalUpdate, pyramid };
}

export function fmtGoalDollars(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fmtGoalUnits(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US');
}

export function fmtGoalPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function fmtGoalDays(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}
