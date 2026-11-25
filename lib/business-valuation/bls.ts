import { OWNER_OCCUPATIONS } from './earnings-base';

const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const BLS_TIMEOUT_MS = 20000;

const STATE_FIPS: Record<string, { fips: string; name: string }> = {
  AL: { fips: '01', name: 'Alabama' }, AK: { fips: '02', name: 'Alaska' }, AZ: { fips: '04', name: 'Arizona' },
  AR: { fips: '05', name: 'Arkansas' }, CA: { fips: '06', name: 'California' }, CO: { fips: '08', name: 'Colorado' },
  CT: { fips: '09', name: 'Connecticut' }, DE: { fips: '10', name: 'Delaware' }, DC: { fips: '11', name: 'District of Columbia' },
  FL: { fips: '12', name: 'Florida' }, GA: { fips: '13', name: 'Georgia' }, HI: { fips: '15', name: 'Hawaii' },
  ID: { fips: '16', name: 'Idaho' }, IL: { fips: '17', name: 'Illinois' }, IN: { fips: '18', name: 'Indiana' },
  IA: { fips: '19', name: 'Iowa' }, KS: { fips: '20', name: 'Kansas' }, KY: { fips: '21', name: 'Kentucky' },
  LA: { fips: '22', name: 'Louisiana' }, ME: { fips: '23', name: 'Maine' }, MD: { fips: '24', name: 'Maryland' },
  MA: { fips: '25', name: 'Massachusetts' }, MI: { fips: '26', name: 'Michigan' }, MN: { fips: '27', name: 'Minnesota' },
  MS: { fips: '28', name: 'Mississippi' }, MO: { fips: '29', name: 'Missouri' }, MT: { fips: '30', name: 'Montana' },
  NE: { fips: '31', name: 'Nebraska' }, NV: { fips: '32', name: 'Nevada' }, NH: { fips: '33', name: 'New Hampshire' },
  NJ: { fips: '34', name: 'New Jersey' }, NM: { fips: '35', name: 'New Mexico' }, NY: { fips: '36', name: 'New York' },
  NC: { fips: '37', name: 'North Carolina' }, ND: { fips: '38', name: 'North Dakota' }, OH: { fips: '39', name: 'Ohio' },
  OK: { fips: '40', name: 'Oklahoma' }, OR: { fips: '41', name: 'Oregon' }, PA: { fips: '42', name: 'Pennsylvania' },
  RI: { fips: '44', name: 'Rhode Island' }, SC: { fips: '45', name: 'South Carolina' }, SD: { fips: '46', name: 'South Dakota' },
  TN: { fips: '47', name: 'Tennessee' }, TX: { fips: '48', name: 'Texas' }, UT: { fips: '49', name: 'Utah' },
  VT: { fips: '50', name: 'Vermont' }, VA: { fips: '51', name: 'Virginia' }, WA: { fips: '53', name: 'Washington' },
  WV: { fips: '54', name: 'West Virginia' }, WI: { fips: '55', name: 'Wisconsin' }, WY: { fips: '56', name: 'Wyoming' },
};

const STATE_BY_NAME = Object.fromEntries(Object.entries(STATE_FIPS).map(([code, item]) => [item.name.toLowerCase(), code]));

export function resolveState(value: string | null | undefined): { code: string; fips: string; name: string } | null {
  const raw = String(value || '').trim();
  const code = raw.length === 2 ? raw.toUpperCase() : STATE_BY_NAME[raw.toLowerCase()];
  return code && STATE_FIPS[code] ? { code, ...STATE_FIPS[code] } : null;
}

/** OEWS series: OEU + area type + 7-digit area + 6-digit industry (all) + 6-digit SOC + data type (13 annual median, 04 annual mean). */
export function oewsSeriesId(occupationCode: string, statistic: 'MEDIAN' | 'MEAN', stateFips: string | null) {
  const dataType = statistic === 'MEAN' ? '04' : '13';
  const area = stateFips ? `S${stateFips}00000` : 'N0000000';
  return `OEU${area}000000${occupationCode}${dataType}`;
}

export type MarketSalaryResult = { value: number; year: string; seriesId: string; source: string; fellBackToNational: boolean };

async function fetchSeries(seriesIds: string[]) {
  const year = new Date().getUTCFullYear();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLS_TIMEOUT_MS);
  try {
    const response = await fetch(BLS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesid: seriesIds, startyear: String(year - 3), endyear: String(year) }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`BLS returned HTTP ${response.status}`);
    const data = await response.json();
    if (String(data?.status || '').toUpperCase() !== 'REQUEST_SUCCEEDED') throw new Error('BLS request did not succeed');
    return (Array.isArray(data?.Results?.series) ? data.Results.series : []) as Array<{ seriesID: string; data: Array<{ year: string; value: string }> }>;
  } finally {
    clearTimeout(timer);
  }
}

/** Latest published annual wage; suppressed or top-coded values ("-", "*", "#") count as no data. */
function latestValue(series: { data: Array<{ year: string; value: string }> } | undefined) {
  for (const row of series?.data || []) {
    const value = Number(String(row.value || '').replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) return { value, year: String(row.year) };
  }
  return null;
}

export async function lookupMarketSalary(input: {
  occupationCode: string;
  statistic: 'MEDIAN' | 'MEAN';
  area: 'STATE' | 'NATIONAL';
  companyState: string | null;
}): Promise<MarketSalaryResult> {
  const occupation = OWNER_OCCUPATIONS.find((item) => item.code === input.occupationCode);
  if (!occupation) throw new Error('Select an occupation');
  const state = input.area === 'STATE' ? resolveState(input.companyState) : null;
  const nationalId = oewsSeriesId(occupation.code, input.statistic, null);
  const stateId = state ? oewsSeriesId(occupation.code, input.statistic, state.fips) : null;
  const series = await fetchSeries(stateId ? [stateId, nationalId] : [nationalId]);
  const stateValue = stateId ? latestValue(series.find((item) => item.seriesID === stateId)) : null;
  const nationalValue = latestValue(series.find((item) => item.seriesID === nationalId));
  const chosen = stateValue || nationalValue;
  if (!chosen) throw new Error('BLS has no published wage for this occupation');
  const areaName = stateValue && state ? state.name : 'United States';
  const statisticLabel = input.statistic === 'MEAN' ? 'mean' : 'median';
  return {
    value: chosen.value,
    year: chosen.year,
    seriesId: stateValue ? (stateId as string) : nationalId,
    source: `BLS OEWS May ${chosen.year}, ${occupation.label}, ${areaName}, annual ${statisticLabel} wage`,
    fellBackToNational: input.area === 'STATE' && !stateValue,
  };
}
