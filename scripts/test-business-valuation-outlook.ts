import assert from 'node:assert/strict';
import {
  DEFAULT_OUTLOOK,
  buildOutlookDraft,
  federalReserveDistrict,
  formatIndicatorChange,
  formatIndicatorValue,
  formatObservationDate,
  lausSeriesId,
  normalizeOutlook,
  outlookCitations,
  outlookGaps,
  outlookTextChanged,
  summarizeObservations,
  validateOutlook,
  type EconomicIndicator,
} from '../lib/business-valuation/outlook';

// Latest value on or before the date, compared with the latest value at least a year earlier.
const monthly = Array.from({ length: 30 }, (_, index) => {
  const month = index % 12;
  const year = 2024 + Math.floor(index / 12);
  return { date: `${year}-${String(month + 1).padStart(2, '0')}-01`, value: index };
});
const summary = summarizeObservations(monthly, '2026-03-15');
assert.deepEqual(summary, { value: 26, date: '2026-03-01', priorValue: 14, priorDate: '2025-03-01' });
assert.equal(summarizeObservations(monthly, '2023-01-01'), null);
const annual = summarizeObservations([{ date: '2024-01-01', value: 3 }, { date: '2025-01-01', value: 2.5 }], '2026-06-30');
assert.deepEqual(annual, { value: 2.5, date: '2025-01-01', priorValue: 3, priorDate: '2024-01-01' });

// Regional series ids match the BLS LAUS layout used for Spokane.
assert.equal(lausSeriesId.state('53'), 'LAUST530000000000003');
assert.equal(lausSeriesId.metro('53', '44060'), 'LAUMT534406000000003');
assert.equal(lausSeriesId.county('53063'), 'LAUCN530630000000003');

// Federal Reserve districts, with split states flagged.
assert.deepEqual(federalReserveDistrict('WA'), { number: 12, name: 'San Francisco', split: false });
assert.deepEqual(federalReserveDistrict('fl'), { number: 6, name: 'Atlanta', split: false });
assert.equal(federalReserveDistrict('MO')?.split, true);
assert.equal(federalReserveDistrict('ZZ'), null);

// Display helpers: rates change in points, levels in percent.
assert.equal(formatObservationDate('2026-07-01', 'Q'), 'Q3 2026');
assert.equal(formatObservationDate('2025-01-01', 'A'), '2025');
assert.equal(formatObservationDate('2026-09-01', 'M'), 'Sep 2026');
assert.equal(formatIndicatorChange({ value: 4.7, priorValue: 4.2, unit: 'PERCENT' }), '+0.5 pts');
assert.equal(formatIndicatorChange({ value: 110, priorValue: 100, unit: 'INDEX' }), '+10.0%');
assert.equal(formatIndicatorChange({ value: 110, priorValue: null, unit: 'INDEX' }), '—');

// Normalizing drops malformed indicators and empty published entries.
const indicator = (overrides: Partial<EconomicIndicator>): EconomicIndicator => ({
  key: 'us-unemployment',
  scope: 'NATIONAL',
  area: 'United States',
  label: 'Unemployment rate',
  provider: 'FRED',
  seriesId: 'UNRATE',
  url: 'https://fred.stlouisfed.org/series/UNRATE',
  unit: 'PERCENT',
  frequency: 'M',
  value: 4.3,
  date: '2026-09-01',
  priorValue: 4.1,
  priorDate: '2025-09-01',
  vintage: 'AS_OF_VALUATION_DATE',
  ...overrides,
});
const normalized = normalizeOutlook({
  indicators: [indicator({}), { seriesId: 'BAD', value: 'x' }, indicator({ key: 'county', scope: 'COUNTY', area: 'Spokane County', provider: 'BLS', seriesId: 'LAUCN530630000000003', vintage: 'CURRENT' })],
  published: { SEP: { keyPoints: 'GDP 1.8% in 2027', publishedDate: '2026-09-17' }, SPF: { keyPoints: '   ' }, BOGUS: { keyPoints: 'x' } },
  geography: { source: 'CENSUS_GEOCODER', stateCode: 'WA', stateName: 'Washington', stateFips: '53', countyName: 'Spokane County', countyFips: '53063', metroName: 'Spokane-Spokane Valley, WA Metro Area', cbsa: '44060' },
});
assert.equal(normalized.indicators.length, 2);
assert.deepEqual(Object.keys(normalized.published), ['SEP']);
assert.equal(normalized.geography?.countyName, 'Spokane County');

// Validation.
assert.equal(validateOutlook(DEFAULT_OUTLOOK), null);
assert.match(validateOutlook({ ...DEFAULT_OUTLOOK, national: 'x'.repeat(12001) }) || '', /National economy/);
assert.match(validateOutlook({ ...DEFAULT_OUTLOOK, published: { SEP: { publishedDate: null, url: 'ftp://x', keyPoints: null } } }) || '', /link must start/);

// Text edits withdraw approval; indicator data alone does not count as text.
assert.equal(outlookTextChanged(normalized, { ...normalized, national: 'Edited' }), true);
assert.equal(outlookTextChanged(normalized, { ...normalized, indicators: [] }), false);

// Draft cites each indicator and includes published key points.
const draft = buildOutlookDraft(normalized, { companyName: 'Acme Resale', industryName: 'Used Goods Stores', industryCode: '45331', valuationDate: 'Oct 31, 2026' });
assert.match(draft.national, /Unemployment rate was 4\.3% for Sep 2026, compared with 4\.1% a year earlier \(FRED UNRATE\)/);
assert.match(draft.national, /Summary of Economic Projections published 2026-09-17: GDP 1\.8% in 2027/);
assert.match(draft.regional, /Acme Resale operates in Spokane County, Spokane-Spokane Valley, WA Metro Area, Washington\./);
assert.match(draft.regional, /Unemployment rate in Spokane County was 4\.3%/);
assert.match(draft.industry, /Used Goods Stores industry \(NAICS 45331\)/);
assert.equal(outlookCitations(normalized).length, 3);

// Gaps: stale indicators, revised FRED values, published outlook after the valuation date, missing approval.
const gaps = outlookGaps(
  { ...normalized, indicatorsAsOf: '2026-09-30', indicators: [...normalized.indicators, indicator({ key: 'cpi', seriesId: 'CPIAUCSL', vintage: 'CURRENT' })], published: { SEP: { publishedDate: '2026-12-10', url: null, keyPoints: 'later' } } },
  '2026-10-31',
);
assert.ok(gaps.some((gap) => gap.includes('valuation date is now 2026-10-31')));
assert.ok(gaps.some((gap) => gap.includes('revised values')));
assert.ok(gaps.some((gap) => gap.includes('dated after the valuation date')));
assert.ok(gaps.some((gap) => gap.includes('Survey of Professional Forecasters')));
assert.ok(gaps.some((gap) => gap.includes('Build or write each section')));
const complete = outlookGaps({ ...normalized, indicatorsAsOf: '2026-10-31', national: 'a', regional: 'b', industry: 'c' }, '2026-10-31');
assert.ok(complete.includes('The outlook is not approved.'));
assert.ok(!outlookGaps({ ...normalized, indicatorsAsOf: '2026-10-31', national: 'a', regional: 'b', industry: 'c', approvedAt: '2026-11-01T00:00:00Z' }, '2026-10-31').includes('The outlook is not approved.'));

// Level series show the source's units.
assert.equal(formatIndicatorValue(27302, 'NUMBER', 'Millions of Dollars'), '$27,302 million');
assert.equal(formatIndicatorValue(24611.1, 'NUMBER', 'Billions of Chained 2017 Dollars'), '$24,611.1 billion (chained 2017 dollars)');
assert.equal(formatIndicatorValue(1520, 'NUMBER', 'Thousands of Persons'), '1,520 thousand persons');
assert.equal(formatIndicatorValue(48, 'INDEX', 'Index 1966:Q1=100'), '48 (Index 1966:Q1=100)');
assert.equal(formatIndicatorValue(27302, 'NUMBER', null), '27,302');
assert.equal(formatIndicatorValue(4.3, 'PERCENT', 'Percent'), '4.3%');
assert.equal(normalizeOutlook({ indicators: [{ scope: 'INDUSTRY', seriesId: 'X', value: 1, date: '2026-01-01', unitsLabel: 'Millions of Dollars' }] }).indicators[0].unitsLabel, 'Millions of Dollars');

console.log('business valuation outlook tests passed');
