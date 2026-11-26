import assert from 'node:assert/strict';
import {
  ALL_ASSET_SIZES,
  DEFAULT_BENCHMARKING,
  assetSizeBand,
  computeBenchmarks,
  formatBenchmarkDifference,
  formatBenchmarkValue,
  industryCodeCandidates,
  industryTableValue,
  normalizeBenchmarking,
  validateBenchmarking,
  type IndustryTable,
} from '../lib/business-valuation/benchmarking';
import type { FiscalPeriod, FiscalPeriodSummary } from '../lib/business-valuation/fiscal-years';

assert.equal(assetSizeBand(226704), '<500k');
assert.equal(assetSizeBand(2500000), '1m-5m');
assert.deepEqual(industryCodeCandidates('453310'), ['453310', '45331', '4533', '453', '45']);
assert.deepEqual(industryCodeCandidates(null), []);

// Normalizing strips non-digits from the code and drops fields no longer used, such as RMA figures.
const normalized = normalizeBenchmarking({ industryCode: 'NAICS 45331', sizeBand: 'huge', rmaEdition: '2025', rmaValues: { grossProfit: 65.5 } });
assert.deepEqual(normalized, { industryCode: '45331', sizeBand: null, notes: null });
assert.equal(validateBenchmarking(DEFAULT_BENCHMARKING), null);
assert.match(validateBenchmarking({ ...DEFAULT_BENCHMARKING, industryCode: '1' }) || '', /2- to 6-digit/);

const table: IndustryTable = {
  industryId: '45331',
  industryName: 'Used Goods Stores',
  sizeBand: '<500k',
  rows: [
    { metricName: 'Gross Profit', assetSizeCategory: '<500k', fiveYearValue: 71.2 },
    { metricName: 'Depreciation', assetSizeCategory: '<500k', fiveYearValue: 1 },
    { metricName: 'Amortization', assetSizeCategory: '<500k', fiveYearValue: 0.2 },
    { metricName: 'Current Ratio', assetSizeCategory: '<500k', fiveYearValue: null },
    { metricName: 'Current Ratio', assetSizeCategory: ALL_ASSET_SIZES, fiveYearValue: 1.8 },
    { metricName: "Days' Inventory", assetSizeCategory: '<500k', fiveYearValue: 167.1 },
    { metricName: 'Cash\u00a0and Equivalents', assetSizeCategory: '<500k', fiveYearValue: 21.3 },
  ],
};
assert.deepEqual(industryTableValue(table, ['Cash and Equivalents']), { value: 21.3, usedAllSizes: false });
assert.deepEqual(industryTableValue(table, ['Gross Profit']), { value: 71.2, usedAllSizes: false });
assert.deepEqual(industryTableValue(table, ['Depreciation', 'Amortization']), { value: 1.2, usedAllSizes: false });
assert.deepEqual(industryTableValue(table, ['Current Ratio']), { value: 1.8, usedAllSizes: true });
assert.equal(industryTableValue(table, ['Quick Ratio']), null);

const period = (key: string, isYearToDate = false): FiscalPeriod => ({
  key,
  label: key,
  fiscalYear: 2025,
  isYearToDate,
  startMonth: '2025-01',
  endMonth: '2025-12',
  months: [],
  storedMonths: [],
  missingMonths: [],
  isComplete: true,
});
const summary = (key: string, revenue: number, cogs: number): FiscalPeriodSummary => ({
  key,
  label: key,
  monthCount: 12,
  income: {
    revenue,
    cogsTotal: cogs,
    expense: 300000,
    payroll: 90000,
    ownerBasePay: 0,
    rent: 40000,
    interestExpense: 5000,
    depreciationAmortization: 10000,
    nonOperatingIncome: 0,
    nonOperatingExpense: 0,
    stateIncomeTaxes: 0,
    federalIncomeTaxes: 0,
    grossProfit: revenue - cogs,
    operatingIncome: revenue - cogs - 300000,
    ebitda: revenue - cogs - 300000 + 15000,
  },
  balanceSheet: {
    month: '2025-12',
    cash: 50000, ar: 10000, inventory: 60000, otherCA: 0, tca: 120000, fixedAssets: 80000, otherAssets: 0, totalAssets: 200000,
    ap: 20000, loc: 0, otherCL: 10000, tcl: 30000, ltd: 50000, totalLiab: 80000, totalEquity: 120000,
  },
});
const snapshot = {
  periods: [period('FY2026-YTD', true), period('FY2025'), period('FY2024')],
  periodSummaries: [summary('FY2026-YTD', 100, 50), summary('FY2025', 500000, 150000), summary('FY2024', 400000, 140000)],
};

const result = computeBenchmarks(snapshot, table);
assert.deepEqual(result.years.map((year) => year.key), ['FY2025', 'FY2024']);
const row = (key: string) => result.rows.find((item) => item.key === key)!;
// Gross profit 70% vs table 71.2%: within 10% of the benchmark, so in line.
assert.equal(row('grossProfit').company[0], 70);
assert.equal(row('grossProfit').benchmarkSource, 'TABLE');
assert.equal(row('grossProfit').assessment, 'In line');
// Current ratio 4.0 vs all-sizes 1.8: better.
assert.equal(row('currentRatio').company[0], 4);
assert.equal(row('currentRatio').tableUsedAllSizes, true);
assert.equal(row('currentRatio').assessment, 'Better');
// Days inventory 60000 / 150000 × 365 = 146 vs table 167.1; fewer days is better.
assert.equal(Math.round(row('daysInventory').company[0]!), 146);
assert.equal(row('daysInventory').benchmark, 167.1);
assert.equal(row('daysInventory').benchmarkSource, 'TABLE');
assert.equal(row('daysInventory').assessment, 'Better');
// No direction for inventory share of assets; no benchmark for quick ratio.
assert.equal(row('inventory').assessment, null);
assert.equal(row('quickRatio').benchmark, null);
assert.equal(row('debtToNetWorth').company[0], 80000 / 120000);
assert.ok(result.warnings.some((warning) => warning.includes('Only 2 complete fiscal years')));
assert.ok(!result.warnings.some((warning) => warning.includes('RMA')));
assert.ok(result.warnings.some((warning) => warning.includes('all asset sizes')));
assert.ok(result.warnings.some((warning) => warning.includes('No officer compensation')));
assert.ok(computeBenchmarks(null, null).warnings.some((warning) => warning.includes('No industry table match')));

assert.equal(formatBenchmarkValue(70, 'PCT'), '70.0%');
assert.equal(formatBenchmarkValue(146.2, 'DAYS'), '146');
assert.equal(formatBenchmarkValue(4, 'RATIO'), '4.00');
assert.equal(formatBenchmarkDifference(-1.2, 'PCT'), '−1.2 pts');
assert.equal(formatBenchmarkDifference(26, 'DAYS'), '+26');

console.log('business valuation benchmarking tests passed');
