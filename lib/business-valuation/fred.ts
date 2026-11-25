const FRED_OBSERVATIONS_URL = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_TIMEOUT_MS = 20000;

export const FRED_RATE_SERIES = {
  riskFree: { seriesId: 'DGS20', title: '20-Year Treasury Constant Maturity Rate' },
  inflation: { seriesId: 'T10YIE', title: '10-Year Breakeven Inflation Rate' },
} as const;

export type FredRateResult = { value: number; date: string; source: string };

/** Latest daily observation on or before the date (markets close on weekends and holidays). */
export async function fredRateOnOrBefore(kind: keyof typeof FRED_RATE_SERIES, date: string): Promise<FredRateResult> {
  const apiKey = process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
  if (!apiKey) throw new Error('FRED_API_KEY is not configured');
  const series = FRED_RATE_SERIES[kind];
  const params = new URLSearchParams({
    series_id: series.seriesId,
    api_key: apiKey,
    file_type: 'json',
    observation_end: date,
    sort_order: 'desc',
    limit: '15',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FRED_TIMEOUT_MS);
  try {
    const response = await fetch(`${FRED_OBSERVATIONS_URL}?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`FRED returned HTTP ${response.status}`);
    const data = await response.json();
    const observations = Array.isArray(data?.observations) ? data.observations : [];
    for (const row of observations) {
      const value = Number(row?.value);
      if (row?.value !== '.' && Number.isFinite(value)) {
        return { value, date: String(row.date), source: `FRED ${series.seriesId}, ${series.title}, ${row.date}` };
      }
    }
    throw new Error(`FRED has no ${series.seriesId} observation on or before ${date}`);
  } finally {
    clearTimeout(timer);
  }
}
