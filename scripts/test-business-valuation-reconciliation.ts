import assert from 'node:assert/strict';
import { DEFAULT_DEAL_TERMS } from '../lib/business-valuation/deal-terms';
import type { Indications } from '../lib/business-valuation/indications';
import {
  DEFAULT_RECONCILIATION,
  computeReconciliation,
  normalizeReconciliation,
  reconciliationInputsChanged,
  roundToIncrement,
  validateReconciliation,
} from '../lib/business-valuation/reconciliation';

assert.equal(roundToIncrement(973412, 5000), 975000);
assert.equal(roundToIncrement(972499, 5000), 970000);

// Normalizing drops unknown approaches and blank reasons; unsupported rounding falls back.
const normalized = normalizeReconciliation({ weights: { INCOME: '80%', ASSET: 20, BOGUS: 5 }, reasons: { INCOME: 'Earnings drive value', ASSET: ' ' }, roundingIncrement: 7 });
assert.deepEqual(normalized.weights, { INCOME: 80, ASSET: 20 });
assert.deepEqual(normalized.reasons, { INCOME: 'Earnings drive value' });
assert.equal(normalized.roundingIncrement, 5000);
assert.equal(validateReconciliation(DEFAULT_RECONCILIATION), null);
assert.match(validateReconciliation({ ...DEFAULT_RECONCILIATION, weights: { INCOME: 120 } }) || '', /between 0% and 100%/);
assert.equal(reconciliationInputsChanged(normalized, { ...normalized, concludedAt: 'x' }), false);
assert.equal(reconciliationInputsChanged(normalized, { ...normalized, weights: { INCOME: 100 } }), true);

const indications = {
  deal: { ...DEFAULT_DEAL_TERMS, purchasePrice: 950000 },
  appraisals: [],
  earnings: {},
  income: { indicatedValue: 1000000, capRateOutOfRange: false },
  asset: { comparableNetAssets: 300000, comparableBasis: 'Adjusted net assets excluding cash and interest-bearing debt (asset sale)' },
  market: { indicatedValue: null, includedCount: 0, basis: 'Value of the operating assets, cash-free and debt-free' },
} as unknown as Indications;
const context = {
  companyName: 'Acme Resale',
  valuationDateLabel: 'Oct 31, 2026',
  standardOfValue: 'FAIR_MARKET_VALUE',
  premiseOfValue: 'GOING_CONCERN',
  ownershipBasis: 'CONTROL',
  transactionStructure: 'ASSET',
  interestPercent: 100,
  balanceSheet: { inventory: 100000, fixedAssets: 80000 },
  formatMoney: (value: number) => `$${Math.round(value).toLocaleString('en-US')}`,
};

// Weights and reasons are required for every approach, including the market approach given no weight.
const incomplete = computeReconciliation({ ...DEFAULT_RECONCILIATION, weights: { INCOME: 90 } }, indications, context);
assert.equal(incomplete.concludedValue, null);
assert.ok(incomplete.blockers.some((item) => item.includes('total 90%')));
assert.ok(incomplete.blockers.some((item) => item.includes('market approach weight, including why it was given no weight')));
assert.ok(computeReconciliation({ ...DEFAULT_RECONCILIATION, weights: { MARKET: 10, INCOME: 90 } }, indications, context).blockers.some((item) => item.includes('cannot carry weight')));

// 90% income, 10% asset: 930,000, rounded to 930,000; price 950,000 is not supported.
const reasons = { MARKET: 'No licensed comparables', INCOME: 'Earnings-driven business', ASSET: 'Floor value' };
const result = computeReconciliation({ ...DEFAULT_RECONCILIATION, weights: { INCOME: 90, ASSET: 10 }, reasons }, indications, context);
assert.deepEqual(result.blockers, []);
assert.equal(result.weightedValue, 930000);
assert.equal(result.concludedValue, 930000);
assert.equal(result.conclusionStatement, 'The fair market value of 100% of the assets of Acme Resale, on a going concern basis, as of Oct 31, 2026, is $930,000.');
assert.equal(result.priceSupported, false);
assert.equal(result.priceDifference, -20000);
assert.ok(result.warnings.includes('The purchase price exceeds the concluded value.'));
// Breakdown at value: inventory 100,000 + equipment 80,000 tangible; goodwill is the rest.
assert.equal(result.breakdownAtValue?.goodwill, 930000 - 180000);
assert.equal(result.breakdownAtPrice?.goodwill, 950000 - 180000);

// Full income weight supports the price; stock sale states equity; a changed input after concluding is stale.
const supported = computeReconciliation(
  { ...DEFAULT_RECONCILIATION, weights: { INCOME: 100 }, reasons, concludedAt: '2026-11-01T00:00:00Z', concludedValue: 930000 },
  indications,
  { ...context, transactionStructure: 'STOCK' },
);
assert.equal(supported.concludedValue, 1000000);
assert.equal(supported.priceSupported, true);
assert.match(supported.conclusionStatement || '', /100% of the equity/);
assert.equal(supported.stale, true);
assert.ok(supported.warnings.some((item) => item.includes('Conclude again')));

// Cautions: unreliable income rate, minority interest, listing price language.
const cautions = computeReconciliation(
  { ...DEFAULT_RECONCILIATION, weights: { INCOME: 100 }, reasons: { ...reasons, INCOME: 'Supports the listing price' } },
  { ...indications, income: { indicatedValue: 1000000, capRateOutOfRange: true } } as unknown as Indications,
  { ...context, interestPercent: 40 },
);
assert.ok(cautions.warnings.some((item) => item.includes('not reliable')));
assert.ok(cautions.warnings.some((item) => item.includes('discounts for lack of control')));
assert.ok(cautions.warnings.some((item) => item.includes('listing or asking price')));

// A market approach with comparables can carry weight.
const withMarket = computeReconciliation(
  { ...DEFAULT_RECONCILIATION, weights: { MARKET: 50, INCOME: 50 }, reasons },
  { ...indications, market: { indicatedValue: 900000, includedCount: 8, basis: 'Value of the operating assets, cash-free and debt-free' } } as unknown as Indications,
  context,
);
assert.deepEqual(withMarket.blockers, []);
assert.equal(withMarket.concludedValue, 950000);
assert.equal(withMarket.lines.find((line) => line.key === 'MARKET')?.basis, 'Value of the operating assets, cash-free and debt-free');

console.log('business valuation reconciliation tests passed');
