/**
 * Frankfurter — free EOD FX (no API key).
 * Docs: https://www.frankfurter.app / https://api.frankfurter.dev
 * Uses ECB reference rates via Frankfurter v1 historical endpoints.
 */

export const FRANKFURTER_PROVIDER = 'frankfurter';
const FRANKFURTER_BASE = process.env.FRANKFURTER_API_BASE || 'https://api.frankfurter.dev/v1';

export type FrankfurterDayRate = {
  date: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
};

async function frankfurterGet(path: string): Promise<any> {
  const url = `${FRANKFURTER_BASE}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Frankfurter ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function quoteTargets(fromCurrency: string, toCurrencies: string[]): string[] {
  const from = fromCurrency.toUpperCase();
  return [...new Set(toCurrencies.map((c) => c.toUpperCase()).filter((c) => c && c !== from))];
}

/** Single-day rates for one base vs many quotes. Weekends/holidays resolve to prior published date. */
export async function fetchFrankfurterRatesForDate(
  fromCurrency: string,
  toCurrencies: string[],
  dateYmd: string
): Promise<FrankfurterDayRate[]> {
  const from = fromCurrency.toUpperCase();
  const targets = quoteTargets(from, toCurrencies);
  if (targets.length === 0) return [];
  const data = await frankfurterGet(
    `/${dateYmd}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(targets.join(','))}`
  );
  const published = String(data.date || dateYmd);
  const quotes = (data.rates || {}) as Record<string, number>;
  return targets.flatMap((to) => {
    const rate = quotes[to];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return [];
    return [{ date: published, fromCurrency: from, toCurrency: to, rate }];
  });
}

/** Single-day rate. Weekends/holidays resolve to nearest prior published date. */
export async function fetchFrankfurterRateForDate(
  fromCurrency: string,
  toCurrency: string,
  dateYmd: string
): Promise<FrankfurterDayRate | null> {
  const rows = await fetchFrankfurterRatesForDate(fromCurrency, [toCurrency], dateYmd);
  return rows[0] || null;
}

/**
 * Historical range. Frankfurter omits weekends/holidays from the map.
 * Returns one entry per published provider date.
 */
export async function fetchFrankfurterHistoricalRange(
  fromCurrency: string,
  toCurrency: string,
  startYmd: string,
  endYmd: string
): Promise<FrankfurterDayRate[]> {
  return fetchFrankfurterHistoricalRangeMany(fromCurrency, [toCurrency], startYmd, endYmd);
}

/** Historical range for one base vs many quote currencies. */
export async function fetchFrankfurterHistoricalRangeMany(
  fromCurrency: string,
  toCurrencies: string[],
  startYmd: string,
  endYmd: string
): Promise<FrankfurterDayRate[]> {
  const from = fromCurrency.toUpperCase();
  const targets = quoteTargets(from, toCurrencies);
  if (targets.length === 0) {
    return [{ date: endYmd, fromCurrency: from, toCurrency: from, rate: 1 }];
  }

  const data = await frankfurterGet(
    `/${startYmd}..${endYmd}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(targets.join(','))}`
  );
  const ratesMap = data?.rates || {};
  const rows: FrankfurterDayRate[] = [];
  for (const [date, quotes] of Object.entries(ratesMap)) {
    const dayQuotes = (quotes || {}) as Record<string, number>;
    for (const to of targets) {
      const rate = dayQuotes[to];
      if (typeof rate === 'number' && Number.isFinite(rate)) {
        rows.push({ date, fromCurrency: from, toCurrency: to, rate });
      }
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.toCurrency.localeCompare(b.toCurrency));
  return rows;
}
