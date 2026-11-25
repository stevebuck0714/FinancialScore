import assert from 'node:assert/strict';
import {
  DEFAULT_DEAL_TERMS,
  computeDealBreakdown,
  normalizeDealTerms,
  validateDealTerms,
  type Appraisal,
} from '../lib/business-valuation/deal-terms';

const bs = { month: '2026-03', cash: 40000, ar: 25000, inventory: 60000, otherCA: 5000, fixedAssets: 80000, otherAssets: 0 };

// Normalizing strips currency formatting and keeps defaults for missing keys.
const terms = normalizeDealTerms({ purchasePrice: '$500,000', included: { cash: 'yes' }, sellerNoteRatePct: '6' });
assert.equal(terms.purchasePrice, 500000);
assert.equal(terms.sellerNoteRatePct, 6);
assert.equal(terms.included.cash, false);
assert.equal(terms.included.inventory, true);
assert.equal(normalizeDealTerms(null).purchasePrice, null);
assert.equal(normalizeDealTerms({ dealDocumentType: 'BOGUS' }).dealDocumentType, null);

// Validation.
assert.equal(validateDealTerms(terms), null);
assert.match(validateDealTerms({ ...terms, sellerNoteAmount: 600000 }) || '', /cannot exceed/);
assert.match(validateDealTerms({ ...terms, purchasePrice: -1 }) || '', /negative/);
assert.match(validateDealTerms({ ...terms, sellerNoteTermMonths: 1.5 }) || '', /whole number/);

// Default asset sale: inventory and equipment at book, goodwill is the remainder.
const basic = computeDealBreakdown(terms, bs, []);
const amount = (key: string) => basic.lines.find((line) => line.key === key)?.amount;
assert.equal(amount('inventory'), 60000);
assert.equal(amount('equipment'), 80000);
assert.equal(amount('workingCapital'), 0);
assert.equal(basic.tangibleTotal, 140000);
assert.equal(basic.goodwill, 360000);
assert.equal(basic.netAssetsReceived, 140000);

// Appraisals replace book values; real estate without an appraisal is flagged.
const appraisals: Appraisal[] = [
  { id: 'a', assetType: 'EQUIPMENT', appraiserFirm: null, effectiveDate: null, value: 95000, includedInDeal: true, documentId: null, notes: null },
  { id: 'b', assetType: 'REAL_ESTATE', appraiserFirm: null, effectiveDate: null, value: 300000, includedInDeal: false, documentId: null, notes: null },
];
const withRealEstate = computeDealBreakdown({ ...terms, purchasePrice: 900000, included: { ...terms.included, realEstate: true } }, bs, appraisals);
assert.equal(withRealEstate.lines.find((line) => line.key === 'equipment')?.amount, 95000);
assert.equal(withRealEstate.lines.find((line) => line.key === 'realEstate')?.amount, 0);
assert.ok(withRealEstate.warnings.some((w) => w.includes('no real estate appraisal')));

// Working capital delivered and assumed liabilities; deal inventory overrides book.
const stock = computeDealBreakdown(
  { ...DEFAULT_DEAL_TERMS, purchasePrice: 200000, inventoryAmount: 50000, assumedLiabilities: 15000, included: { ...DEFAULT_DEAL_TERMS.included, cash: true, accountsReceivable: true } },
  bs,
  [],
);
assert.equal(stock.lines.find((line) => line.key === 'inventory')?.amount, 50000);
assert.equal(stock.lines.find((line) => line.key === 'workingCapital')?.amount, 50000);
assert.equal(stock.goodwill, 200000 - (80000 + 50000 + 50000));

// Price below tangible assets gives negative goodwill and a warning.
const low = computeDealBreakdown({ ...terms, purchasePrice: 100000 }, bs, []);
assert.equal(low.goodwill, -40000);
assert.ok(low.warnings.some((w) => w.includes('negative')));

// No snapshot yet.
assert.ok(computeDealBreakdown(terms, null, []).warnings.some((w) => w.includes('Freeze data')));

console.log('business valuation deal terms tests passed');
