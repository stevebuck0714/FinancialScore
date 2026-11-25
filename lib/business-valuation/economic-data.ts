import { industryFredSeriesFor } from '@/lib/industry-brief/sources';
import { resolveState } from './bls';
import { shiftMonth } from './fiscal-years';
import {
  lausSeriesId,
  summarizeObservations,
  type EconomicIndicator,
  type IndicatorFrequency,
  type IndicatorScope,
  type IndicatorUnit,
  type Observation,
  type OutlookGeography,
} from './outlook';

const FRED_URL = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_SERIES_URL = 'https://api.stlouisfed.org/fred/series';
const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';
const TIMEOUT_MS = 20000;

async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(data?.error_message || `HTTP ${response.status}`));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveCompanyGeography(address: { street: string | null; city: string | null; state: string | null; zip: string | null }): Promise<OutlookGeography | null> {
  const state = resolveState(address.state);
  if (!state) return null;
  const stateOnly: OutlookGeography = {
    source: 'STATE_ONLY',
    stateCode: state.code,
    stateName: state.name,
    stateFips: state.fips,
    countyName: null,
    countyFips: null,
    metroName: null,
    cbsa: null,
    matchedAddress: null,
  };
  if (!address.street || (!address.city && !address.zip)) return stateOnly;
  const params = new URLSearchParams({
    street: address.street,
    city: address.city || '',
    state: state.code,
    zip: address.zip || '',
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'Counties,Metropolitan Statistical Areas',
    format: 'json',
  });
  try {
    const data = await fetchJson(`${CENSUS_URL}?${params.toString()}`);
    const match = data?.result?.addressMatches?.[0];
    const county = match?.geographies?.Counties?.[0];
    const metro = match?.geographies?.['Metropolitan Statistical Areas']?.[0];
    if (!county) return stateOnly;
    return {
      ...stateOnly,
      source: 'CENSUS_GEOCODER',
      countyName: String(county.NAME || '') || null,
      countyFips: String(county.GEOID || '') || null,
      metroName: metro ? String(metro.NAME || '') || null : null,
      cbsa: metro ? String(metro.CBSA || metro.GEOID || '') || null : null,
      matchedAddress: String(match.matchedAddress || '') || null,
    };
  } catch {
    return stateOnly;
  }
}

function inferFrequency(rows: Observation[]): IndicatorFrequency {
  if (rows.length < 2) return 'M';
  const last = Date.parse(rows[rows.length - 1].date);
  const previous = Date.parse(rows[rows.length - 2].date);
  const days = (last - previous) / 86400000;
  if (days <= 8) return 'D';
  if (days <= 45) return 'M';
  if (days <= 120) return 'Q';
  return 'A';
}

type FredDefinition = { key: string; scope: IndicatorScope; area: string; label: string; seriesId: string; unit: IndicatorUnit; units?: 'lin' | 'pc1' };

async function fredObservations(seriesId: string, asOf: string, units: 'lin' | 'pc1', vintage: boolean): Promise<Observation[]> {
  const apiKey = process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
  if (!apiKey) throw new Error('FRED_API_KEY is not configured');
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    units,
    observation_start: `${Number(asOf.slice(0, 4)) - 3}${asOf.slice(4)}`,
    observation_end: asOf,
    sort_order: 'asc',
  });
  if (vintage) {
    params.set('realtime_start', asOf);
    params.set('realtime_end', asOf);
  }
  const data = await fetchJson(`${FRED_URL}?${params.toString()}`);
  return (Array.isArray(data?.observations) ? data.observations : [])
    .filter((row: any) => row?.value !== '.' && Number.isFinite(Number(row?.value)))
    .map((row: any) => ({ date: String(row.date), value: Number(row.value) }));
}

/** FRED's unit description for a series, e.g. "Millions of Dollars". Null when unavailable. */
async function fredUnitsLabel(seriesId: string): Promise<string | null> {
  const apiKey = process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
  if (!apiKey) return null;
  const params = new URLSearchParams({ series_id: seriesId, api_key: apiKey, file_type: 'json' });
  const data = await fetchJson(`${FRED_SERIES_URL}?${params.toString()}`).catch(() => null);
  const units = data?.seriess?.[0]?.units;
  return typeof units === 'string' && units.trim() ? units.trim() : null;
}

async function fredIndicator(definition: FredDefinition, asOf: string, today: string): Promise<EconomicIndicator> {
  const units = definition.units || 'lin';
  const unitsLabelPromise = definition.unit === 'NUMBER' || definition.unit === 'INDEX' ? fredUnitsLabel(definition.seriesId) : Promise.resolve(null);
  let vintage: EconomicIndicator['vintage'] = 'CURRENT';
  let rows: Observation[] = [];
  if (asOf < today) {
    rows = await fredObservations(definition.seriesId, asOf, units, true).catch(() => []);
    if (rows.length > 0) vintage = 'AS_OF_VALUATION_DATE';
  }
  if (rows.length === 0) rows = await fredObservations(definition.seriesId, asOf, units, false);
  const summary = summarizeObservations(rows, asOf);
  if (!summary) throw new Error(`no observation on or before ${asOf}`);
  return {
    key: definition.key,
    scope: definition.scope,
    area: definition.area,
    label: definition.label,
    provider: 'FRED',
    seriesId: definition.seriesId,
    url: `https://fred.stlouisfed.org/series/${definition.seriesId}`,
    unit: definition.unit,
    frequency: inferFrequency(rows),
    ...summary,
    vintage,
    unitsLabel: await unitsLabelPromise,
  };
}

/** County and metro rates publish about five weeks after the month ends, so stop two months before the valuation month. */
async function lausIndicators(geography: OutlookGeography, asOf: string): Promise<{ indicators: EconomicIndicator[]; notes: string[] }> {
  const definitions = [
    { key: 'state-unemployment', scope: 'STATE' as const, area: geography.stateName, seriesId: lausSeriesId.state(geography.stateFips) },
    ...(geography.cbsa && geography.metroName
      ? [{ key: 'metro-unemployment', scope: 'METRO' as const, area: geography.metroName, seriesId: lausSeriesId.metro(geography.stateFips, geography.cbsa) }]
      : []),
    ...(geography.countyFips && geography.countyName
      ? [{ key: 'county-unemployment', scope: 'COUNTY' as const, area: geography.countyName, seriesId: lausSeriesId.county(geography.countyFips) }]
      : []),
  ];
  const year = Number(asOf.slice(0, 4));
  const data = await fetchJson(BLS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: definitions.map((item) => item.seriesId), startyear: String(year - 2), endyear: String(year) }),
  });
  if (String(data?.status || '').toUpperCase() !== 'REQUEST_SUCCEEDED') throw new Error('BLS request did not succeed');
  const lastKnownMonth = shiftMonth(asOf.slice(0, 7), -2);
  const series = Array.isArray(data?.Results?.series) ? data.Results.series : [];
  const indicators: EconomicIndicator[] = [];
  const notes: string[] = [];
  for (const definition of definitions) {
    const rows: Observation[] = (series.find((item: any) => item?.seriesID === definition.seriesId)?.data || [])
      .filter((row: any) => /^M(0[1-9]|1[0-2])$/.test(String(row?.period)) && Number.isFinite(Number(row?.value)))
      .map((row: any) => ({ date: `${row.year}-${String(row.period).slice(1)}-01`, value: Number(row.value) }))
      .filter((row: Observation) => row.date.slice(0, 7) <= lastKnownMonth);
    const summary = summarizeObservations(rows, asOf);
    if (!summary) {
      notes.push(`BLS has no unemployment rate for ${definition.area} (${definition.seriesId}).`);
      continue;
    }
    indicators.push({
      key: definition.key,
      scope: definition.scope,
      area: definition.area,
      label: 'Unemployment rate',
      provider: 'BLS',
      seriesId: definition.seriesId,
      url: `https://data.bls.gov/timeseries/${definition.seriesId}`,
      unit: 'PERCENT',
      frequency: 'M',
      ...summary,
      vintage: 'CURRENT',
    });
  }
  return { indicators, notes };
}

const NATIONAL_SERIES: FredDefinition[] = [
  { key: 'us-gdp', scope: 'NATIONAL', area: 'United States', label: 'Real GDP growth, year over year', seriesId: 'GDPC1', unit: 'PERCENT', units: 'pc1' },
  { key: 'us-unemployment', scope: 'NATIONAL', area: 'United States', label: 'Unemployment rate', seriesId: 'UNRATE', unit: 'PERCENT' },
  { key: 'us-cpi', scope: 'NATIONAL', area: 'United States', label: 'Consumer price inflation (CPI), year over year', seriesId: 'CPIAUCSL', unit: 'PERCENT', units: 'pc1' },
  { key: 'us-fed-funds', scope: 'NATIONAL', area: 'United States', label: 'Federal funds rate', seriesId: 'FEDFUNDS', unit: 'PERCENT' },
  { key: 'us-10y', scope: 'NATIONAL', area: 'United States', label: '10-year Treasury yield', seriesId: 'DGS10', unit: 'PERCENT' },
  { key: 'us-sentiment', scope: 'NATIONAL', area: 'United States', label: 'Consumer sentiment (University of Michigan)', seriesId: 'UMCSENT', unit: 'INDEX' },
];

function stateSeries(geography: OutlookGeography): FredDefinition[] {
  const code = geography.stateCode;
  const area = geography.stateName;
  return [
    { key: 'state-gdp', scope: 'STATE', area, label: 'Real GDP growth', seriesId: `${code}RGSP`, unit: 'PERCENT', units: 'pc1' },
    { key: 'state-jobs', scope: 'STATE', area, label: 'Nonfarm job growth, year over year', seriesId: `${code}NA`, unit: 'PERCENT', units: 'pc1' },
    { key: 'state-income', scope: 'STATE', area, label: 'Per capita personal income', seriesId: `${code}PCPI`, unit: 'DOLLARS' },
  ];
}

export async function collectEconomicIndicators(input: {
  geography: OutlookGeography | null;
  asOf: string;
  today: string;
  companyName: string;
  industryName: string | null;
  industrySectorCategory: string | null;
  location: string;
}): Promise<{ indicators: EconomicIndicator[]; notes: string[] }> {
  const industrySeries = industryFredSeriesFor({
    name: input.companyName,
    industry: input.industryName || '',
    segment: '',
    location: input.location,
    sectorKey: input.industrySectorCategory,
    industryGroupName: input.industryName,
  }).map((series): FredDefinition => ({ key: `industry-${series.seriesId}`, scope: 'INDUSTRY', area: 'United States', label: series.title, seriesId: series.seriesId, unit: 'NUMBER' }));
  const fredDefinitions = [...NATIONAL_SERIES, ...(input.geography ? stateSeries(input.geography) : []), ...industrySeries];

  const notes: string[] = [];
  const [fredResults, laus] = await Promise.all([
    Promise.allSettled(fredDefinitions.map((definition) => fredIndicator(definition, input.asOf, input.today))),
    input.geography
      ? lausIndicators(input.geography, input.asOf).catch((error) => ({ indicators: [], notes: [`BLS unemployment lookup failed: ${String(error?.message || error)}`] }))
      : Promise.resolve({ indicators: [], notes: ['The company has no state on file, so no regional data was pulled.'] }),
  ]);
  const indicators: EconomicIndicator[] = [];
  const fredFailures: string[] = [];
  fredResults.forEach((result, index) => {
    if (result.status === 'fulfilled') indicators.push(result.value);
    else fredFailures.push(`${fredDefinitions[index].seriesId}: ${String((result.reason as Error)?.message || result.reason)}`);
  });
  if (fredFailures.length === fredDefinitions.length && fredFailures.every((failure) => failure.includes('FRED_API_KEY'))) {
    notes.push('FRED data was not pulled because FRED_API_KEY is not configured on this server.');
  } else if (fredFailures.length > 0) {
    notes.push(`FRED series not available: ${fredFailures.join('; ')}`);
  }
  notes.push(...laus.notes);
  const scopeOrder: IndicatorScope[] = ['NATIONAL', 'STATE', 'METRO', 'COUNTY', 'INDUSTRY'];
  const all = [...indicators, ...laus.indicators].sort((a, b) => scopeOrder.indexOf(a.scope) - scopeOrder.indexOf(b.scope));
  return { indicators: all, notes };
}
