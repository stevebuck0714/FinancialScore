import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { SUPPORTED_CURRENCIES, normalizeCurrencyCode } from '@/lib/constants/currencies';
import {
  fetchFrankfurterHistoricalRange,
  fetchFrankfurterHistoricalRangeMany,
  fetchFrankfurterRatesForDate,
  FRANKFURTER_PROVIDER,
  type FrankfurterDayRate,
} from './frankfurter';
import {
  formatEstDate,
  previousEstCalendarDate,
  utcMidnightForEstDate,
  yearsAgoEstDate,
} from './est-dates';

export type CurrencyPair = { fromCurrency: string; toCurrency: string };

const SUPPORTED_CODES = SUPPORTED_CURRENCIES.map((c) => c.value);

export async function upsertDailyEodRate(row: {
  fromCurrency: string;
  toCurrency: string;
  dateYmd: string;
  rate: number;
  requestedYmd?: string;
}): Promise<void> {
  const rateDate = utcMidnightForEstDate(row.dateYmd);
  const isFallback = Boolean(row.requestedYmd && row.requestedYmd !== row.dateYmd);
  await prisma.fxRate.upsert({
    where: {
      provider_fromCurrency_toCurrency_rateDate_rateType: {
        provider: FRANKFURTER_PROVIDER,
        fromCurrency: row.fromCurrency,
        toCurrency: row.toCurrency,
        rateDate,
        rateType: 'daily_eod',
      },
    },
    create: {
      id: randomUUID(),
      provider: FRANKFURTER_PROVIDER,
      fromCurrency: row.fromCurrency,
      toCurrency: row.toCurrency,
      rateDate,
      rate: row.rate,
      rateType: 'daily_eod',
      isFallback,
      fallbackFromDate: isFallback && row.requestedYmd
        ? utcMidnightForEstDate(row.requestedYmd)
        : null,
      retrievedAt: new Date(),
    },
    update: {
      rate: row.rate,
      isFallback,
      fallbackFromDate: isFallback && row.requestedYmd
        ? utcMidnightForEstDate(row.requestedYmd)
        : null,
      retrievedAt: new Date(),
    },
  });
}

/** Every directed pair among supported currencies (USD, CAD, EUR, GBP, AUD, MXN). */
export function listSupportedCurrencyPairs(): CurrencyPair[] {
  const pairs: CurrencyPair[] = [];
  for (const from of SUPPORTED_CODES) {
    for (const to of SUPPORTED_CODES) {
      if (from === to) continue;
      pairs.push({ fromCurrency: from, toCurrency: to });
    }
  }
  return pairs;
}

/** Supported pairs plus any extra company base→reporting pairs. */
export async function listActiveCurrencyPairs(): Promise<CurrencyPair[]> {
  const seen = new Set<string>();
  const pairs: CurrencyPair[] = [];
  const add = (fromCurrency: string, toCurrency: string) => {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return;
    const key = `${fromCurrency}->${toCurrency}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ fromCurrency, toCurrency });
  };

  for (const pair of listSupportedCurrencyPairs()) {
    add(pair.fromCurrency, pair.toCurrency);
  }

  const companies = await prisma.company.findMany({
    where: { reportingCurrency: { not: null } },
    select: { baseCurrency: true, reportingCurrency: true },
  });
  for (const company of companies) {
    const from = normalizeCurrencyCode(company.baseCurrency);
    const to = company.reportingCurrency
      ? normalizeCurrencyCode(company.reportingCurrency, from)
      : null;
    if (to) add(from, to);
  }
  return pairs;
}

async function storeRateRows(rows: FrankfurterDayRate[], requestedYmd?: string): Promise<number> {
  let stored = 0;
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((row) =>
        upsertDailyEodRate({
          fromCurrency: row.fromCurrency,
          toCurrency: row.toCurrency,
          dateYmd: row.date,
          rate: row.rate,
          requestedYmd,
        }).then(() => {
          stored += 1;
        })
      )
    );
  }
  return stored;
}

export async function backfillCurrencyPair(
  fromCurrency: string,
  toCurrency: string,
  opts?: { startYmd?: string; endYmd?: string }
): Promise<{ stored: number; fromCurrency: string; toCurrency: string; startYmd: string; endYmd: string }> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  const endYmd = opts?.endYmd || formatEstDate();
  const startYmd = opts?.startYmd || yearsAgoEstDate(3);

  if (from === to) {
    return { stored: 0, fromCurrency: from, toCurrency: to, startYmd, endYmd };
  }

  const rows = await fetchFrankfurterHistoricalRange(from, to, startYmd, endYmd);
  const stored = await storeRateRows(rows);
  return { stored, fromCurrency: from, toCurrency: to, startYmd, endYmd };
}

/** Load ~3 years of daily EOD rates for every supported currency pair. */
export async function backfillAllSupportedRates(opts?: {
  startYmd?: string;
  endYmd?: string;
}): Promise<{
  stored: number;
  bases: number;
  startYmd: string;
  endYmd: string;
  errors: Array<{ fromCurrency: string; error: string }>;
}> {
  const endYmd = opts?.endYmd || formatEstDate();
  const startYmd = opts?.startYmd || yearsAgoEstDate(3);
  let stored = 0;
  const errors: Array<{ fromCurrency: string; error: string }> = [];

  for (const from of SUPPORTED_CODES) {
    const toCurrencies = SUPPORTED_CODES.filter((code) => code !== from);
    try {
      const rows = await fetchFrankfurterHistoricalRangeMany(from, toCurrencies, startYmd, endYmd);
      stored += await storeRateRows(rows);
    } catch (error: any) {
      errors.push({ fromCurrency: from, error: error?.message || String(error) });
    }
  }

  return {
    stored,
    bases: SUPPORTED_CODES.length,
    startYmd,
    endYmd,
    errors,
  };
}

export async function ensureCompanyReportingRates(companyId: string): Promise<{
  backfilled: boolean;
  pair?: CurrencyPair;
  result?: Awaited<ReturnType<typeof backfillCurrencyPair>>;
}> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, reportingCurrency: true },
  });
  if (!company?.reportingCurrency) {
    return { backfilled: false };
  }
  const from = normalizeCurrencyCode(company.baseCurrency);
  const to = normalizeCurrencyCode(company.reportingCurrency, from);
  if (from === to) return { backfilled: false };

  const result = await backfillCurrencyPair(from, to);
  return {
    backfilled: true,
    pair: { fromCurrency: from, toCurrency: to },
    result,
  };
}

/**
 * Daily EST EOD sync: load rates for the prior EST calendar day
 * for every supported currency pair.
 */
export async function syncLatestEstEodRates(now: Date = new Date()): Promise<{
  targetEstDate: string;
  pairs: number;
  stored: number;
  errors: Array<{ pair: string; error: string }>;
}> {
  const targetEstDate = previousEstCalendarDate(now);
  let stored = 0;
  const errors: Array<{ pair: string; error: string }> = [];

  for (const from of SUPPORTED_CODES) {
    const toCurrencies = SUPPORTED_CODES.filter((code) => code !== from);
    try {
      const fetched = await fetchFrankfurterRatesForDate(from, toCurrencies, targetEstDate);
      if (fetched.length === 0) {
        errors.push({ pair: `${from}->*`, error: `No rates returned for ${targetEstDate}` });
        continue;
      }
      stored += await storeRateRows(fetched, targetEstDate);
    } catch (error: any) {
      errors.push({ pair: `${from}->*`, error: error?.message || String(error) });
    }
  }

  return {
    targetEstDate,
    pairs: listSupportedCurrencyPairs().length,
    stored,
    errors,
  };
}
