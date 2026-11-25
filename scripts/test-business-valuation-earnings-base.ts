import assert from 'node:assert/strict';
import {
  DEFAULT_EARNINGS_BASE,
  WEIGHTED_PERIOD,
  computeEarningsBase,
  defaultWeights,
  normalizeEarningsBase,
  validateEarningsBase,
  type SnapshotEarningsInput,
} from '../lib/business-valuation/earnings-base';
import { oewsSeriesId, resolveState } from '../lib/business-valuation/bls';

const period = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  label: key,
  fiscalYear: Number(key.slice(2)) || 2026,
  isYearToDate: false,
  startMonth: '',
  endMonth: '',
  months: [],
  storedMonths: [],
  missingMonths: [],
  isComplete: true,
  ...overrides,
});
const summary = (key: string, revenue: number, ebitda: number, da = 0) => ({
  key,
  label: key,
  monthCount: 12,
  income: { revenue, ebitda, depreciationAmortization: da } as never,
  balanceSheet: null,
});

const snapshot = {
  periods: [period('YTD', { isYearToDate: true, isComplete: false }), period('FY2025'), period('FY2024'), period('FY2023')],
  periodSummaries: [summary('YTD', 300000, 30000), summary('FY2025', 1000000, 150000, 12000), summary('FY2024', 900000, 120000, 8000), summary('FY2023', 0, 0, 0)],
  trailingTwelveMonths: {
    ...summary('TTM', 1100000, 160000),
    period: period('TTM'),
    balanceSheet: { month: '2026-03', ar: 50000, inventory: 120000, otherCA: 10000, ap: 40000, otherCL: 30000 } as never,
  },
  qoe: { savedTotals: { qualityOfEarnings: 175000 } },
} as unknown as SnapshotEarningsInput;

// Automatic source uses the Quality of Earnings total when one is saved.
const auto = computeEarningsBase(DEFAULT_EARNINGS_BASE, snapshot);
assert.equal(auto.source, 'QOE_ADJUSTED');
assert.equal(auto.startingEarnings, 175000);
assert.equal(auto.period, 'TTM');

// Without Quality of Earnings, book TTM EBITDA is used and flagged.
const noQoe = computeEarningsBase(DEFAULT_EARNINGS_BASE, { ...snapshot, qoe: { savedTotals: null } } as SnapshotEarningsInput);
assert.equal(noQoe.source, 'BOOK_EBITDA');
assert.equal(noQoe.startingEarnings, 160000);
assert.ok(noQoe.warnings.some((w) => w.includes('No Quality of Earnings')));

// Weighted average uses complete fiscal years only, newest weighted 3-2-1.
assert.deepEqual(defaultWeights(snapshot), { FY2025: 3, FY2024: 2, FY2023: 1 });
const weighted = computeEarningsBase({ ...DEFAULT_EARNINGS_BASE, source: 'BOOK_EBITDA', period: WEIGHTED_PERIOD, weights: { FY2025: 2, FY2024: 1 } }, snapshot);
assert.equal(weighted.startingEarnings, (150000 * 2 + 120000) / 3);
assert.equal(weighted.weightedLines.length, 2);
const withZeroYear = computeEarningsBase({ ...DEFAULT_EARNINGS_BASE, source: 'BOOK_EBITDA', period: WEIGHTED_PERIOD }, snapshot);
assert.ok(withZeroYear.warnings.some((w) => w.includes('FY2023 shows no revenue')));

// Owner pay, normalizations, capex, SDE.
const full = computeEarningsBase(
  normalizeEarningsBase({
    source: 'BOOK_EBITDA',
    period: 'FY2025',
    reason: 'Latest full year',
    ownerActualComp: '$150,000',
    ownerMarketSalary: '100000',
    normalizations: [{ label: 'One-time legal fees', amount: '20000' }, { label: 'Below-market rent', amount: -12000 }],
  }),
  snapshot,
);
assert.equal(full.startingEarnings, 150000);
assert.equal(full.ownerCompAdjustment, 50000);
assert.equal(full.normalizationTotal, 8000);
assert.equal(full.normalizedEbitda, 208000);
assert.equal(full.capexSuggestion, 10000);
assert.equal(full.ebitdaLessCapex, 198000);
assert.equal(full.sde, 308000);
assert.ok(!full.warnings.some((w) => w.includes('Record why')));

// Owner pay with QoE warns about double counting.
const qoeOwner = computeEarningsBase({ ...DEFAULT_EARNINGS_BASE, ownerActualComp: 90000, ownerMarketSalary: 100000 }, snapshot);
assert.equal(qoeOwner.normalizedEbitda, 165000);
assert.ok(qoeOwner.warnings.some((w) => w.includes('counted twice')));

// Working capital: AR + inventory + other CA − AP − other CL.
assert.equal(full.workingCapital.actual, 110000);
assert.equal(full.workingCapital.revenue, 1100000);
assert.equal(full.workingCapital.actualPct, 10);
const wc = computeEarningsBase({ ...DEFAULT_EARNINGS_BASE, normalWorkingCapitalPct: 8 }, snapshot).workingCapital;
assert.equal(wc.normal, 88000);
assert.equal(wc.excess, 22000);

// Zero capital spending and financials far behind the valuation date are flagged.
const stale = computeEarningsBase(DEFAULT_EARNINGS_BASE, { ...snapshot, valuationDate: '2026-11-25', asOfMonth: '2026-03', periods: [], periodSummaries: [] } as SnapshotEarningsInput);
assert.ok(stale.warnings.some((w) => w.startsWith('Normal capital spending is zero')));
assert.ok(stale.warnings.some((w) => w.includes('end 8 months before')));
const current = computeEarningsBase(DEFAULT_EARNINGS_BASE, { ...snapshot, valuationDate: '2026-04-15', asOfMonth: '2026-03' } as SnapshotEarningsInput);
assert.ok(!current.warnings.some((w) => w.startsWith('The financials end')));
assert.ok(!current.warnings.some((w) => w.startsWith('Normal capital spending is zero')));

// Validation.
assert.equal(validateEarningsBase(normalizeEarningsBase({ normalizations: [{ label: '', amount: 1 }] })), 'Every normalization needs a description.');
assert.match(validateEarningsBase({ ...DEFAULT_EARNINGS_BASE, ownerMarketSalary: -1 }) || '', /negative/);
assert.equal(validateEarningsBase(DEFAULT_EARNINGS_BASE), null);
assert.equal(normalizeEarningsBase({ source: 'BOGUS', ownerOccupationCode: '999999' }).source, null);
assert.equal(normalizeEarningsBase({ ownerOccupationCode: '999999' }).ownerOccupationCode, '111021');

// BLS OEWS series identifiers.
assert.equal(oewsSeriesId('111021', 'MEDIAN', null), 'OEUN000000000000011102113');
assert.equal(oewsSeriesId('111021', 'MEAN', null), 'OEUN000000000000011102104');
assert.equal(oewsSeriesId('111021', 'MEDIAN', '12'), 'OEUS120000000000011102113');
assert.equal(resolveState('fl')?.fips, '12');
assert.equal(resolveState('Florida')?.code, 'FL');
assert.equal(resolveState('XX'), null);

console.log('business valuation earnings base tests passed');
