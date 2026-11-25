import assert from 'node:assert/strict';
import { DEFAULT_EARNINGS_BASE, computeEarningsBase, type SnapshotEarningsInput } from '../lib/business-valuation/earnings-base';
import {
  DEFAULT_INCOME_APPROACH,
  computeIncomeApproach,
  normalizeIncomeApproach,
  validateIncomeApproach,
} from '../lib/business-valuation/income-approach';

const close = (actual: number | null, expected: number, tolerance = 0.01) => {
  assert.ok(actual !== null && Math.abs(actual - expected) < tolerance, `expected ${expected}, got ${actual}`);
};

const snapshot = {
  periods: [],
  periodSummaries: [],
  trailingTwelveMonths: {
    key: 'TTM',
    label: 'TTM',
    monthCount: 12,
    income: { revenue: 1000000, ebitda: 200000, depreciationAmortization: 0 },
    period: { key: 'TTM', label: 'TTM', isComplete: true, missingMonths: [] },
    balanceSheet: { month: '2026-03', cash: 30000, ar: 50000, inventory: 100000, otherCA: 0, ap: 50000, otherCL: 0, loc: 10000, ltd: 40000 },
  },
  qoe: { savedTotals: null },
} as unknown as SnapshotEarningsInput;

// Earnings: book TTM EBITDA 200,000, capex 20,000, normal working capital 8% of revenue.
const earnings = computeEarningsBase({ ...DEFAULT_EARNINGS_BASE, reason: 'TTM', normalCapex: 20000, normalWorkingCapitalPct: 8 }, snapshot);
assert.equal(earnings.ebitdaLessCapex, 180000);
assert.equal(earnings.workingCapital.actual, 100000);
assert.equal(earnings.workingCapital.normal, 80000);
assert.equal(earnings.workingCapital.excess, 20000);

// Never-saved inputs start with the standard risk factors; a saved empty list stays empty.
assert.equal(normalizeIncomeApproach(null).riskFactors.length, 8);
assert.equal(normalizeIncomeApproach({ riskFactors: [] }).riskFactors.length, 0);

const income = normalizeIncomeApproach({
  taxRatePct: '25%',
  riskFreeRatePct: 4.5,
  equityRiskPremiumPct: 5,
  sizePremiumPct: 5.5,
  industryPremiumPct: -0.5,
  longTermGrowthPct: 2.5,
  riskFactors: [
    { label: 'Key person', premiumPct: 3, rationale: 'Owner runs buying' },
    { label: 'Customer concentration', premiumPct: 0 },
  ],
});
assert.equal(income.taxRatePct, 25);

const asset = computeIncomeApproach(income, earnings, { transactionStructure: 'ASSET', balanceSheet: { cash: 30000, loc: 10000, ltd: 40000 }, purchasePrice: 600000 });
assert.equal(asset.taxes, 45000);
assert.equal(asset.netCashFlow, 135000);
assert.equal(asset.companySpecificPct, 3);
close(asset.discountRatePct, 17.5);
close(asset.capRatePct, 15);
close(asset.workingCapitalInvestment, 2000);
close(asset.nextYearCashFlow, 135000 * 1.025 - 2000);
close(asset.operatingValue, (135000 * 1.025 - 2000) / 0.15);
close(asset.indicatedValue, (135000 * 1.025 - 2000) / 0.15 + 20000);
assert.equal(asset.debt, null);
close(asset.priceDifference, 600000 - asset.indicatedValue!);
assert.ok(!asset.warnings.some((w) => w.includes('Explain the premium')));

// Stock sale subtracts interest-bearing debt and adds cash.
const stock = computeIncomeApproach(income, earnings, { transactionStructure: 'STOCK', balanceSheet: { cash: 30000, loc: 10000, ltd: 40000 }, purchasePrice: null });
close(stock.indicatedValue, asset.indicatedValue! - 50000 + 30000);

// Missing build-up inputs give no value; pre-tax and rationale warnings.
const blank = computeIncomeApproach(
  { ...DEFAULT_INCOME_APPROACH, riskFactors: [{ id: 'x', label: 'Lease', premiumPct: 2, rationale: null, qoeBucket: null }] },
  earnings,
  { transactionStructure: 'ASSET', balanceSheet: null, purchasePrice: null },
);
assert.equal(blank.discountRatePct, null);
assert.equal(blank.indicatedValue, null);
assert.ok(blank.warnings.some((w) => w.includes('before tax')));
assert.ok(blank.warnings.some((w) => w.includes('Explain the premium for "Lease"')));

// Growth above the discount rate gives no value.
const negative = computeIncomeApproach({ ...income, longTermGrowthPct: 9, riskFreeRatePct: 0, equityRiskPremiumPct: 2, sizePremiumPct: 2, industryPremiumPct: 0, riskFactors: [] }, earnings, {
  transactionStructure: 'ASSET',
  balanceSheet: null,
  purchasePrice: null,
});
assert.equal(negative.operatingValue, null);
assert.ok(negative.warnings.some((w) => w.includes('zero or negative')));

// A 2% cap rate (7.5% discount less 5.5% growth) is flagged as unreliable; SDE needs a market salary.
const lowCap = computeIncomeApproach({ ...income, riskFreeRatePct: 4, equityRiskPremiumPct: 2, sizePremiumPct: 1.5, industryPremiumPct: 0, riskFactors: [], longTermGrowthPct: 5.5 }, earnings, {
  transactionStructure: 'ASSET',
  balanceSheet: null,
  purchasePrice: null,
});
close(lowCap.capRatePct, 2);
assert.equal(lowCap.capRateOutOfRange, true);
assert.ok(lowCap.warnings.some((w) => w.includes('far below')));
assert.equal(asset.capRateOutOfRange, false);
assert.equal(earnings.sde, null);
assert.equal(asset.impliedSdeMultiple, null);

// Validation.
assert.equal(validateIncomeApproach(DEFAULT_INCOME_APPROACH), null);
assert.match(validateIncomeApproach({ ...DEFAULT_INCOME_APPROACH, taxRatePct: 80 }) || '', /Tax rate/);
assert.match(validateIncomeApproach({ ...DEFAULT_INCOME_APPROACH, riskFactors: [{ id: 'a', label: '', premiumPct: 1, rationale: null, qoeBucket: null }] }) || '', /description/);

console.log('business valuation income approach tests passed');
