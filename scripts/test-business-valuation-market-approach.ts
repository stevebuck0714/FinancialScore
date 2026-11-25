import assert from 'node:assert/strict';
import {
  DEFAULT_MARKET_APPROACH,
  computeMarketApproach,
  importComparablesCsv,
  multipleStats,
  normalizeMarketApproach,
  parseAmount,
  parseSaleDate,
  validateMarketApproach,
  type Comparable,
  type MarketApproach,
} from '../lib/business-valuation/market-approach';

// Amounts and dates as providers export them.
assert.equal(parseAmount('$1,250,000'), 1250000);
assert.equal(parseAmount('(5,000)'), -5000);
assert.equal(parseAmount('1.2M'), 1200000);
assert.equal(parseAmount('450k'), 450000);
assert.equal(parseAmount('N/A'), null);
assert.equal(parseSaleDate('3/15/2024'), '2024-03-15');
assert.equal(parseSaleDate('2023-7'), '2023-07');
assert.equal(parseSaleDate('06/2022'), '2022-06');
assert.equal(parseSaleDate('2021'), '2021');
assert.equal(parseSaleDate('soon'), null);

// Quartiles interpolate between sales.
const stats = multipleStats([2, 4, 3, 1, 5]);
assert.deepEqual(stats && { min: stats.min, q1: stats.q1, median: stats.median, q3: stats.q3, max: stats.max, mean: stats.mean }, { min: 1, q1: 2, median: 3, q3: 4, max: 5, mean: 3 });
assert.equal(multipleStats([]), null);

// CSV import maps columns by name, keeps quoted commas, and skips rows without a price.
const csv = [
  'Sale Date,Business Description,NAICS,State,Annual Gross Sales,"Seller\'s Discretionary Earnings",Sale Price,Days on Market',
  '1/10/2024,"Resale clothing, franchise",459510,ID,"$900,000","$180,000","$450,000",120',
  '2023-05-01,Used clothing store,459510,UT,750000,150000,,90',
].join('\r\n');
const imported = importComparablesCsv(csv);
assert.equal(imported.error, null);
assert.equal(imported.comparables.length, 1);
assert.equal(imported.skippedRows, 1);
assert.deepEqual(imported.ignoredColumns, ['Days on Market']);
const first = imported.comparables[0];
assert.equal(first.description, 'Resale clothing, franchise');
assert.equal(first.saleDate, '2024-01-10');
assert.equal(first.revenue, 900000);
assert.equal(first.sde, 180000);
assert.equal(first.price, 450000);
assert.match(importComparablesCsv('Name,Revenue\nA,100').error || '', /sale price column/);

// Validation.
assert.equal(validateMarketApproach(DEFAULT_MARKET_APPROACH), null);
const sale = (overrides: Partial<Comparable>): Comparable => ({
  id: Math.random().toString(36),
  saleDate: '2024-01-01',
  description: 'Resale store',
  industryCode: '459510',
  location: 'ID',
  revenue: 1000000,
  sde: 200000,
  ebitda: 120000,
  price: 500000,
  included: true,
  exclusionReason: null,
  ...overrides,
});
assert.match(validateMarketApproach({ ...DEFAULT_MARKET_APPROACH, comparables: [sale({ price: 0 })] }) || '', /sale price above zero/);
assert.equal(normalizeMarketApproach({ comparables: [{ price: '450000', saleDate: 'bad' }] }).comparables[0].saleDate, null);

// Price to SDE of 2.0 to 3.0 across five sales; select 2.5 times SDE of 300,000 = 750,000, plus 120,000 inventory.
const comparables = [400000, 450000, 500000, 550000, 600000].map((price) => sale({ price }));
const market: MarketApproach = {
  ...DEFAULT_MARKET_APPROACH,
  dataSource: 'BIZCOMPS',
  dataEdition: '2026',
  comparables: [...comparables, sale({ price: 2000000, included: false, exclusionReason: 'Multi-unit operator' })],
  selections: { PRICE_TO_SDE: { multiple: 2.5, weight: null, reason: 'Median of comparable resale franchises' } },
};
const earnings = { sde: 300000, normalizedEbitda: 200000, workingCapital: { revenue: 1500000 } } as never;
const balanceSheet = { cash: 50000, inventory: 120000, loc: 20000, ltd: 80000 };
const asset = computeMarketApproach(market, earnings, balanceSheet, { transactionStructure: 'ASSET', valuationDate: '2026-10-31' });
assert.equal(asset.includedCount, 5);
const sdeLine = asset.lines.find((line) => line.key === 'PRICE_TO_SDE')!;
assert.equal(sdeLine.stats?.median, 2.5);
assert.equal(sdeLine.weight, 100);
assert.equal(asset.operatingValue, 750000);
assert.equal(asset.inventory, 120000);
assert.equal(asset.indicatedValue, 870000);
assert.deepEqual(asset.warnings, []);

// A stock sale subtracts debt and adds cash.
const stock = computeMarketApproach(market, earnings, balanceSheet, { transactionStructure: 'STOCK', valuationDate: '2026-10-31' });
assert.equal(stock.indicatedValue, 870000 - 100000 + 50000);

// Two multiples must be weighted to 100%.
const twoSelected: MarketApproach = {
  ...market,
  selections: { ...market.selections, PRICE_TO_REVENUE: { multiple: 0.5, weight: 40, reason: 'Revenue cross-check' } },
};
const unweighted = computeMarketApproach(twoSelected, earnings, balanceSheet, { transactionStructure: 'ASSET', valuationDate: '2026-10-31' });
assert.equal(unweighted.indicatedValue, null);
assert.ok(unweighted.warnings.some((item) => item.includes('total 40%')));
const weighted = computeMarketApproach(
  { ...twoSelected, selections: { ...twoSelected.selections, PRICE_TO_SDE: { ...twoSelected.selections.PRICE_TO_SDE!, weight: 60 } } },
  earnings,
  balanceSheet,
  { transactionStructure: 'ASSET', valuationDate: '2026-10-31' },
);
assert.equal(weighted.operatingValue, 750000 * 0.6 + 750000 * 0.4);

// Cautions: few sales, a sale after the valuation date, no source, an unexplained outlier multiple, listing language.
const cautions = computeMarketApproach(
  {
    ...DEFAULT_MARKET_APPROACH,
    comparables: [sale({ saleDate: '2026-12' }), sale({}), sale({ included: false })],
    selections: { PRICE_TO_SDE: { multiple: 4, weight: null, reason: 'Matches the asking price' } },
    notes: null,
  },
  earnings,
  balanceSheet,
  { transactionStructure: 'ASSET', valuationDate: '2026-10-31' },
);
assert.ok(cautions.warnings.some((item) => item.includes('Only 2 comparable sales')));
assert.ok(cautions.warnings.some((item) => item.includes('after the valuation date')));
assert.ok(cautions.warnings.some((item) => item.includes('data source')));
assert.ok(cautions.warnings.some((item) => item.includes('reason for each excluded sale')));
assert.ok(cautions.warnings.some((item) => item.includes('listing or asking price')));
const outlier = computeMarketApproach({ ...market, selections: { PRICE_TO_SDE: { multiple: 4, weight: null, reason: 'Superior location' } } }, earnings, balanceSheet, {
  transactionStructure: 'ASSET',
  valuationDate: '2026-10-31',
});
assert.ok(outlier.warnings.some((item) => item.includes('outside the middle half')));

// No company SDE means the selected multiple gives no indication.
const noSde = computeMarketApproach(market, { sde: null, normalizedEbitda: 200000, workingCapital: { revenue: 1500000 } } as never, balanceSheet, {
  transactionStructure: 'ASSET',
  valuationDate: null,
});
assert.equal(noSde.indicatedValue, null);
assert.ok(noSde.warnings.some((item) => item.includes('needs a positive company')));

console.log('business valuation market approach tests passed');
