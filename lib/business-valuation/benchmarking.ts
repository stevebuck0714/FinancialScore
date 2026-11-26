import { optionalText } from './deal-terms';
import { completeFiscalYears, type SnapshotEarningsInput } from './earnings-base';
import type { FiscalPeriodSummary } from './fiscal-years';

export const ASSET_SIZE_BANDS = ['<500k', '500k-1m', '1m-5m', '5m-10m', '10m-25m', '25m-50m', '50m-100m', '100m-250m', '250m-500m', '>500m'] as const;
export const ALL_ASSET_SIZES = 'All Asset Sizes';

/** Same bands as the industry benchmark table and the Financial Score page. */
export function assetSizeBand(totalAssets: number): string {
  if (totalAssets < 500000) return '<500k';
  if (totalAssets < 1000000) return '500k-1m';
  if (totalAssets < 5000000) return '1m-5m';
  if (totalAssets < 10000000) return '5m-10m';
  if (totalAssets < 25000000) return '10m-25m';
  if (totalAssets < 50000000) return '25m-50m';
  if (totalAssets < 100000000) return '50m-100m';
  if (totalAssets < 250000000) return '100m-250m';
  if (totalAssets < 500000000) return '250m-500m';
  return '>500m';
}

type Summary = FiscalPeriodSummary;
type MetricUnit = 'PCT' | 'RATIO' | 'DAYS';

const ratio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);
const pctOf = (numerator: number, denominator: number) => (denominator > 0 ? (numerator / denominator) * 100 : null);

export const BENCHMARK_GROUPS = [
  { key: 'INCOME', label: 'Income statement (% of revenue)' },
  { key: 'BALANCE', label: 'Balance sheet (% of total assets)' },
  { key: 'RATIO', label: 'Ratios' },
] as const;

export const BENCHMARK_METRICS: Array<{
  key: string;
  label: string;
  group: (typeof BENCHMARK_GROUPS)[number]['key'];
  unit: MetricUnit;
  /** Industry benchmark table line(s); several are summed. */
  tableMetrics: string[];
  higherIsBetter: boolean | null;
  compute: (summary: Summary) => number | null;
}> = [
  { key: 'grossProfit', label: 'Gross profit', group: 'INCOME', unit: 'PCT', tableMetrics: ['Gross Profit'], higherIsBetter: true, compute: (s) => pctOf(s.income.grossProfit, s.income.revenue) },
  { key: 'officerComp', label: 'Officer compensation', group: 'INCOME', unit: 'PCT', tableMetrics: ['Compensation of officers'], higherIsBetter: null, compute: (s) => pctOf(s.income.ownerBasePay, s.income.revenue) },
  { key: 'salaries', label: 'Salaries and wages', group: 'INCOME', unit: 'PCT', tableMetrics: ['Salaries and wages'], higherIsBetter: false, compute: (s) => pctOf(s.income.payroll, s.income.revenue) },
  { key: 'rent', label: 'Rent', group: 'INCOME', unit: 'PCT', tableMetrics: ['Rent paid'], higherIsBetter: false, compute: (s) => pctOf(s.income.rent, s.income.revenue) },
  { key: 'depreciation', label: 'Depreciation and amortization', group: 'INCOME', unit: 'PCT', tableMetrics: ['Depreciation', 'Amortization'], higherIsBetter: null, compute: (s) => pctOf(s.income.depreciationAmortization, s.income.revenue) },
  { key: 'ebit', label: 'EBIT', group: 'INCOME', unit: 'PCT', tableMetrics: ['EBIT/Revenue'], higherIsBetter: true, compute: (s) => pctOf(s.income.operatingIncome + s.income.interestExpense, s.income.revenue) },
  { key: 'ebitda', label: 'EBITDA', group: 'INCOME', unit: 'PCT', tableMetrics: ['EBITDA/Revenue'], higherIsBetter: true, compute: (s) => pctOf(s.income.ebitda, s.income.revenue) },
  { key: 'cash', label: 'Cash', group: 'BALANCE', unit: 'PCT', tableMetrics: ['Cash and Equivalents'], higherIsBetter: null, compute: (s) => (s.balanceSheet ? pctOf(s.balanceSheet.cash, s.balanceSheet.totalAssets) : null) },
  { key: 'receivables', label: 'Accounts receivable', group: 'BALANCE', unit: 'PCT', tableMetrics: ['Notes and accounts receivable'], higherIsBetter: null, compute: (s) => (s.balanceSheet ? pctOf(s.balanceSheet.ar, s.balanceSheet.totalAssets) : null) },
  { key: 'inventory', label: 'Inventory', group: 'BALANCE', unit: 'PCT', tableMetrics: ['Inventories'], higherIsBetter: null, compute: (s) => (s.balanceSheet ? pctOf(s.balanceSheet.inventory, s.balanceSheet.totalAssets) : null) },
  { key: 'fixedAssets', label: 'Fixed assets', group: 'BALANCE', unit: 'PCT', tableMetrics: ['Property, Plant and Equipment'], higherIsBetter: null, compute: (s) => (s.balanceSheet ? pctOf(s.balanceSheet.fixedAssets, s.balanceSheet.totalAssets) : null) },
  { key: 'payables', label: 'Accounts payable', group: 'BALANCE', unit: 'PCT', tableMetrics: ['Accounts payable'], higherIsBetter: null, compute: (s) => (s.balanceSheet ? pctOf(s.balanceSheet.ap, s.balanceSheet.totalAssets) : null) },
  { key: 'currentRatio', label: 'Current ratio', group: 'RATIO', unit: 'RATIO', tableMetrics: ['Current Ratio'], higherIsBetter: true, compute: (s) => (s.balanceSheet ? ratio(s.balanceSheet.tca, s.balanceSheet.tcl) : null) },
  { key: 'quickRatio', label: 'Quick ratio', group: 'RATIO', unit: 'RATIO', tableMetrics: ['Quick Ratio'], higherIsBetter: true, compute: (s) => (s.balanceSheet ? ratio(s.balanceSheet.cash + s.balanceSheet.ar, s.balanceSheet.tcl) : null) },
  { key: 'daysReceivables', label: 'Days receivables', group: 'RATIO', unit: 'DAYS', tableMetrics: ["Days' Receivables"], higherIsBetter: false, compute: (s) => (s.balanceSheet && s.income.revenue > 0 ? (s.balanceSheet.ar / s.income.revenue) * 365 : null) },
  { key: 'daysInventory', label: 'Days inventory', group: 'RATIO', unit: 'DAYS', tableMetrics: ["Days' Inventory"], higherIsBetter: false, compute: (s) => (s.balanceSheet && s.income.cogsTotal > 0 ? (s.balanceSheet.inventory / s.income.cogsTotal) * 365 : null) },
  { key: 'daysPayables', label: 'Days payables', group: 'RATIO', unit: 'DAYS', tableMetrics: ["Days' Payables"], higherIsBetter: null, compute: (s) => (s.balanceSheet && s.income.cogsTotal > 0 ? (s.balanceSheet.ap / s.income.cogsTotal) * 365 : null) },
  { key: 'salesToAssets', label: 'Sales to total assets', group: 'RATIO', unit: 'RATIO', tableMetrics: ['Sales/Total Assets'], higherIsBetter: true, compute: (s) => (s.balanceSheet ? ratio(s.income.revenue, s.balanceSheet.totalAssets) : null) },
  { key: 'debtToNetWorth', label: 'Debt to net worth', group: 'RATIO', unit: 'RATIO', tableMetrics: ['Debt/Net Worth'], higherIsBetter: false, compute: (s) => (s.balanceSheet ? ratio(s.balanceSheet.totalLiab, s.balanceSheet.totalEquity) : null) },
  { key: 'interestCoverage', label: 'Interest coverage', group: 'RATIO', unit: 'RATIO', tableMetrics: ['Interest Coverage'], higherIsBetter: true, compute: (s) => ratio(s.income.operatingIncome + s.income.interestExpense, s.income.interestExpense) },
];
export type BenchmarkMetricKey = string;

export type Benchmarking = {
  /** Overrides the company NAICS code for the industry table. */
  industryCode: string | null;
  /** Overrides the size band derived from the latest fiscal year's total assets. */
  sizeBand: string | null;
  notes: string | null;
};

export const DEFAULT_BENCHMARKING: Benchmarking = {
  industryCode: null,
  sizeBand: null,
  notes: null,
};

export function normalizeBenchmarking(raw: unknown): Benchmarking {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const code = optionalText(source.industryCode);
  const sizeBand = optionalText(source.sizeBand);
  return {
    industryCode: code ? code.replace(/\D/g, '') || null : null,
    sizeBand: sizeBand && ((ASSET_SIZE_BANDS as readonly string[]).includes(sizeBand) || sizeBand === ALL_ASSET_SIZES) ? sizeBand : null,
    notes: optionalText(source.notes),
  };
}

export function validateBenchmarking(benchmarking: Benchmarking): string | null {
  if (benchmarking.industryCode && (benchmarking.industryCode.length < 2 || benchmarking.industryCode.length > 6)) return 'The industry code must be a 2- to 6-digit NAICS code.';
  if ((benchmarking.notes || '').length > 3000) return 'Notes are limited to 3,000 characters.';
  return null;
}

/** NAICS codes to try against the industry table, most specific first. */
export function industryCodeCandidates(code: string | null): string[] {
  const digits = String(code || '').replace(/\D/g, '');
  const candidates: string[] = [];
  for (let length = Math.min(digits.length, 6); length >= 2; length--) candidates.push(digits.slice(0, length));
  return candidates;
}

export type IndustryTableRow = { metricName: string; assetSizeCategory: string; fiveYearValue: number | null };
export type IndustryTable = { industryId: string; industryName: string; sizeBand: string; rows: IndustryTableRow[] } | null;

/** Stored line names can contain non-breaking spaces. */
const sameMetricName = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/** Table value for a metric in the chosen size band, falling back to all asset sizes. */
export function industryTableValue(table: IndustryTable, tableMetrics: string[]): { value: number; usedAllSizes: boolean } | null {
  if (!table) return null;
  const pick = (band: string) => {
    let total = 0;
    for (const name of tableMetrics) {
      const row = table.rows.find((item) => item.assetSizeCategory === band && sameMetricName(item.metricName, name));
      if (!row || row.fiveYearValue === null || !Number.isFinite(row.fiveYearValue)) return null;
      total += row.fiveYearValue;
    }
    return total;
  };
  const inBand = pick(table.sizeBand);
  if (inBand !== null) return { value: inBand, usedAllSizes: false };
  const all = table.sizeBand === ALL_ASSET_SIZES ? null : pick(ALL_ASSET_SIZES);
  return all !== null ? { value: all, usedAllSizes: true } : null;
}

export type BenchmarkRow = {
  key: string;
  label: string;
  group: (typeof BENCHMARK_GROUPS)[number]['key'];
  unit: MetricUnit;
  company: Array<number | null>;
  table: number | null;
  tableUsedAllSizes: boolean;
  benchmark: number | null;
  benchmarkSource: 'TABLE' | null;
  difference: number | null;
  assessment: 'Better' | 'Worse' | 'In line' | null;
};

export type BenchmarkResult = {
  years: Array<{ key: string; label: string }>;
  rows: BenchmarkRow[];
  warnings: string[];
};

/** Within this share of the benchmark, a metric counts as in line. */
const IN_LINE_TOLERANCE = 0.1;

export function computeBenchmarks(snapshot: SnapshotEarningsInput, table: IndustryTable): BenchmarkResult {
  const years = completeFiscalYears(snapshot).slice(0, 3);
  const rows: BenchmarkRow[] = BENCHMARK_METRICS.map((metric) => {
    const company = years.map((year) => {
      const value = metric.compute(year.summary);
      return value !== null && Number.isFinite(value) ? value : null;
    });
    const tableValue = industryTableValue(table, metric.tableMetrics);
    const benchmark = tableValue?.value ?? null;
    const latest = company[0] ?? null;
    const difference = latest !== null && benchmark !== null ? latest - benchmark : null;
    let assessment: BenchmarkRow['assessment'] = null;
    if (difference !== null && benchmark !== null && metric.higherIsBetter !== null) {
      const tolerance = Math.max(Math.abs(benchmark) * IN_LINE_TOLERANCE, metric.unit === 'PCT' ? 0.5 : 0.05);
      if (Math.abs(difference) <= tolerance) assessment = 'In line';
      else assessment = (difference > 0) === metric.higherIsBetter ? 'Better' : 'Worse';
    }
    return {
      key: metric.key,
      label: metric.label,
      group: metric.group,
      unit: metric.unit,
      company,
      table: tableValue?.value ?? null,
      tableUsedAllSizes: tableValue?.usedAllSizes ?? false,
      benchmark,
      benchmarkSource: tableValue ? 'TABLE' : null,
      difference,
      assessment,
    };
  });

  const warnings: string[] = [];
  if (years.length === 0) warnings.push('No complete fiscal years in the snapshot; freeze data that covers at least one full fiscal year.');
  else if (years.length < 3) warnings.push(`Only ${years.length} complete fiscal year${years.length === 1 ? '' : 's'} in the snapshot; three are expected.`);
  if (!table) warnings.push('No industry table match for the company NAICS code; enter an industry code.');
  if (rows.some((row) => row.tableUsedAllSizes && row.benchmarkSource === 'TABLE')) warnings.push('Some industry table figures use all asset sizes because the size band has no value.');
  const latest = years[0]?.summary;
  if (latest?.balanceSheet && latest.balanceSheet.totalEquity <= 0) warnings.push('Net worth is zero or negative in the latest fiscal year, so debt to net worth is not meaningful.');
  if (latest && latest.income.ownerBasePay === 0) warnings.push('No officer compensation is recorded; the officer compensation comparison is not meaningful.');
  return { years: years.map((year) => ({ key: year.period.key, label: year.period.label })), rows, warnings };
}

export function formatBenchmarkValue(value: number | null, unit: MetricUnit): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === 'PCT') return `${value.toFixed(1)}%`;
  if (unit === 'DAYS') return value.toFixed(0);
  return value.toFixed(2);
}

export function formatBenchmarkDifference(value: number | null, unit: MetricUnit): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const magnitude = Math.abs(value);
  if (unit === 'PCT') return `${sign}${magnitude.toFixed(1)} pts`;
  if (unit === 'DAYS') return `${sign}${magnitude.toFixed(0)}`;
  return `${sign}${magnitude.toFixed(2)}`;
}
