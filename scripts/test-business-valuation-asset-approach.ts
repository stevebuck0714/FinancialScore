import assert from 'node:assert/strict';
import { DEFAULT_ASSET_APPROACH, computeAssetApproach, normalizeAssetApproach, validateAssetApproach } from '../lib/business-valuation/asset-approach';
import type { Appraisal } from '../lib/business-valuation/deal-terms';

const bs = {
  month: '2026-03',
  cash: 30000, ar: 50000, inventory: 100000, otherCA: 5000, fixedAssets: 60000, otherAssets: 5000, totalAssets: 250000,
  ap: 40000, loc: 10000, otherCL: 20000, ltd: 80000, totalLiab: 150000, totalEquity: 100000,
};
const appraisal = (assetType: string, value: number): Appraisal => ({ id: assetType, assetType, appraiserFirm: null, effectiveDate: null, value, includedInDeal: true, documentId: null, notes: null });

// Book values only.
const book = computeAssetApproach(DEFAULT_ASSET_APPROACH, bs, [], { transactionStructure: 'ASSET', incomeValue: 400000 });
assert.equal(book.fairAssets, 250000);
assert.equal(book.fairLiabilities, 150000);
assert.equal(book.adjustedNetTangibleAssets, 100000);
assert.equal(book.storedEquityDifference, 0);
// Asset sale comparison excludes cash and interest-bearing debt: 100,000 − 30,000 + 10,000 + 80,000.
assert.equal(book.comparableNetAssets, 160000);
assert.equal(book.impliedUnidentifiedIntangibles, 240000);
assert.equal(book.warnings.length, 0);

// Manual adjustments, equipment appraisal, intangibles; stock sale compares to all net assets.
const adjusted = computeAssetApproach(
  normalizeAssetApproach({
    adjustments: { inventory: { amount: '-15000', note: 'Slow-moving stock' }, ar: { amount: -5000 } },
    intangibles: [{ label: 'Franchise agreement', amount: 20000, note: 'Transfer value' }],
  }),
  bs,
  [appraisal('EQUIPMENT', 75000), appraisal('REAL_ESTATE', 300000)],
  { transactionStructure: 'STOCK', incomeValue: 90000 },
);
const fixed = adjusted.assets.find((row) => row.key === 'fixedAssets')!;
assert.equal(fixed.fairValue, 75000);
assert.equal(fixed.fromAppraisal, true);
assert.equal(adjusted.fairAssets, 250000 - 15000 - 5000 + 15000);
assert.equal(adjusted.adjustedNetTangibleAssets, 95000);
assert.equal(adjusted.indicatedValue, 115000);
assert.equal(adjusted.comparableNetAssets, 115000);
assert.equal(adjusted.impliedUnidentifiedIntangibles, -25000);
assert.ok(adjusted.warnings.some((w) => w.includes('accounts receivable adjustment')));
assert.ok(adjusted.warnings.some((w) => w.includes('worth more liquidated')));

// Real estate counts only when owned by the company.
const owned = computeAssetApproach(normalizeAssetApproach({ realEstateOwnedByCompany: true }), bs, [appraisal('REAL_ESTATE', 300000)], { transactionStructure: 'ASSET', incomeValue: null });
assert.equal(owned.assets.find((row) => row.key === 'fixedAssets')!.fairValue, 300000);
const notOwned = computeAssetApproach(DEFAULT_ASSET_APPROACH, bs, [appraisal('REAL_ESTATE', 300000)], { transactionStructure: 'ASSET', incomeValue: null });
assert.equal(notOwned.assets.find((row) => row.key === 'fixedAssets')!.fairValue, 60000);
assert.ok(notOwned.warnings.some((w) => w.includes('Real estate owned by the company')));

// Stored equity that does not tie is flagged.
const mismatch = computeAssetApproach(DEFAULT_ASSET_APPROACH, { ...bs, totalEquity: 130000 }, [], { transactionStructure: 'ASSET', incomeValue: null });
assert.equal(mismatch.storedEquityDifference, 30000);
assert.ok(mismatch.warnings.some((w) => w.includes('Stored equity differs')));

// No snapshot.
assert.equal(computeAssetApproach(DEFAULT_ASSET_APPROACH, null, [], { transactionStructure: 'ASSET', incomeValue: null }).indicatedValue, null);

// Validation.
assert.equal(validateAssetApproach(DEFAULT_ASSET_APPROACH), null);
assert.match(validateAssetApproach(normalizeAssetApproach({ intangibles: [{ label: '', amount: 1 }] })) || '', /description/);

console.log('business valuation asset approach tests passed');
