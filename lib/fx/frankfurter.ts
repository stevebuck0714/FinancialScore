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

/** Single-day rate. Weekends/holidays resolve to nearest prior published date. */
export async function fetchFrankfurterRateForDate(
  fromCurrency: string,
  toCurrency: string,
  dateYmd: string
): Promise<FrankfurterDayRate | null> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return { date: dateYmd, fromCurrency: from, toCurrency: to, rate: 1 };
  }

  const data = await frankfurterGet(`/${dateYmd}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const rate = data?.rates?.[to];
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  return {
    date: String(data.date || dateYmd),
    fromCurrency: from,
    toCurrency: to,
    rate,
  };
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
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return [{ date: endYmd, fromCurrency: from, toCurrency: to, rate: 1 }];
  }

  const data = await frankfurterGet(
    `/${startYmd}..${endYmd}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  const ratesMap = data?.rates || {};
  const rows: FrankfurterDayRate[] = [];
  for (const [date, quotes] of Object.entries(ratesMap)) {
    const rate = (quotes as Record<string, number>)?.[to];
    if (typeof rate === 'number' && Number.isFinite(rate)) {
      rows.push({ date, fromCurrency: from, toCurrency: to, rate });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
