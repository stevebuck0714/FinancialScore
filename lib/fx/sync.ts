import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { normalizeCurrencyCode } from '@/lib/constants/currencies';
import {
  fetchFrankfurterHistoricalRange,
  fetchFrankfurterRateForDate,
  FRANKFURTER_PROVIDER,
} from './frankfurter';
import {
  formatEstDate,
  previousEstCalendarDate,
  utcMidnightForEstDate,
  yearsAgoEstDate,
} from './est-dates';

export type CurrencyPair = { fromCurrency: string; toCurrency: string };

async function upsertRate(row: {
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

/** Distinct base→reporting pairs currently configured on companies. */
export async function listActiveCurrencyPairs(): Promise<CurrencyPair[]> {
  const companies = await prisma.company.findMany({
    where: {
      reportingCurrency: { not: null },
    },
    select: {
      baseCurrency: true,
      reportingCurrency: true,
    },
  });

  const seen = new Set<string>();
  const pairs: CurrencyPair[] = [];
  for (const company of companies) {
    const from = normalizeCurrencyCode(company.baseCurrency);
    const to = company.reportingCurrency
      ? normalizeCurrencyCode(company.reportingCurrency, from)
      : null;
    if (!to || from === to) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ fromCurrency: from, toCurrency: to });
  }
  return pairs;
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
  let stored = 0;
  // Chunk upserts to avoid huge transactions
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((row) =>
        upsertRate({
          fromCurrency: from,
          toCurrency: to,
          dateYmd: row.date,
          rate: row.rate,
        }).then(() => {
          stored += 1;
        })
      )
    );
  }

  return { stored, fromCurrency: from, toCurrency: to, startYmd, endYmd };
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
 * for every active company base→reporting pair.
 */
export async function syncLatestEstEodRates(now: Date = new Date()): Promise<{
  targetEstDate: string;
  pairs: number;
  stored: number;
  errors: Array<{ pair: string; error: string }>;
}> {
  const targetEstDate = previousEstCalendarDate(now);
  const pairs = await listActiveCurrencyPairs();
  let stored = 0;
  const errors: Array<{ pair: string; error: string }> = [];

  for (const pair of pairs) {
    const label = `${pair.fromCurrency}->${pair.toCurrency}`;
    try {
      const fetched = await fetchFrankfurterRateForDate(
        pair.fromCurrency,
        pair.toCurrency,
        targetEstDate
      );
      if (!fetched) {
        errors.push({ pair: label, error: `No rate returned for ${targetEstDate}` });
        continue;
      }
      await upsertRate({
        fromCurrency: pair.fromCurrency,
        toCurrency: pair.toCurrency,
        dateYmd: fetched.date,
        rate: fetched.rate,
        requestedYmd: targetEstDate,
      });
      stored += 1;
    } catch (error: any) {
      errors.push({ pair: label, error: error?.message || String(error) });
    }
  }

  return {
    targetEstDate,
    pairs: pairs.length,
    stored,
    errors,
  };
}
