import prisma from '@/lib/prisma';
import { FRANKFURTER_PROVIDER } from './frankfurter';
import { previousEstBusinessDate, utcMidnightForEstDate } from './est-dates';

export type ConvertResult = {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateDate: string;
  provider: string;
  isFallback: boolean;
  fallbackFromDate?: string | null;
};

type CachedRate = {
  rate: number;
  rateDate: Date;
  provider: string;
  isFallback: boolean;
  fallbackFromDate: Date | null;
};

async function lookupExactRate(
  fromCurrency: string,
  toCurrency: string,
  rateDate: Date
): Promise<CachedRate | null> {
  const row = await prisma.fxRate.findFirst({
    where: {
      fromCurrency,
      toCurrency,
      rateDate,
      rateType: 'daily_eod',
    },
    orderBy: { retrievedAt: 'desc' },
  });
  if (!row) return null;
  return {
    rate: row.rate,
    rateDate: row.rateDate,
    provider: row.provider,
    isFallback: row.isFallback,
    fallbackFromDate: row.fallbackFromDate,
  };
}

/** Most recent EOD rate on or before the requested EST calendar date. */
export async function getRateForDate(
  fromCurrency: string,
  toCurrency: string,
  asOfYmd: string
): Promise<CachedRate | null> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return {
      rate: 1,
      rateDate: utcMidnightForEstDate(asOfYmd),
      provider: 'identity',
      isFallback: false,
      fallbackFromDate: null,
    };
  }

  const exact = await lookupExactRate(from, to, utcMidnightForEstDate(asOfYmd));
  if (exact) return exact;

  // Weekend / holiday: walk back to prior weekday and use <= asOf cached rate
  const businessYmd = previousEstBusinessDate(asOfYmd);
  const prior = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
      rateType: 'daily_eod',
      rateDate: { lte: utcMidnightForEstDate(businessYmd) },
    },
    orderBy: { rateDate: 'desc' },
  });
  if (prior) {
    return {
      rate: prior.rate,
      rateDate: prior.rateDate,
      provider: prior.provider || FRANKFURTER_PROVIDER,
      isFallback: prior.rateDate.toISOString().slice(0, 10) !== asOfYmd,
      fallbackFromDate: prior.rateDate,
    };
  }

  try {
    const { fetchFrankfurterRateForDate } = await import('./frankfurter');
    const { upsertDailyEodRate } = await import('./sync');
    const fetched = await fetchFrankfurterRateForDate(from, to, asOfYmd);
    if (!fetched) return null;
    await upsertDailyEodRate({
      fromCurrency: from,
      toCurrency: to,
      dateYmd: fetched.date,
      rate: fetched.rate,
      requestedYmd: asOfYmd,
    });
    return {
      rate: fetched.rate,
      rateDate: utcMidnightForEstDate(fetched.date),
      provider: FRANKFURTER_PROVIDER,
      isFallback: fetched.date !== asOfYmd,
      fallbackFromDate: fetched.date !== asOfYmd ? utcMidnightForEstDate(fetched.date) : null,
    };
  } catch (error) {
    console.warn(`FX live fetch failed for ${from}->${to} on ${asOfYmd}:`, error);
    return null;
  }
}

export async function convertAmount(
  amount: number,
  opts: { from: string; to: string; asOfYmd: string }
): Promise<ConvertResult> {
  const from = opts.from.toUpperCase();
  const to = opts.to.toUpperCase();
  if (from === to) {
    return {
      amount,
      fromCurrency: from,
      toCurrency: to,
      rate: 1,
      rateDate: opts.asOfYmd,
      provider: 'identity',
      isFallback: false,
    };
  }

  const cached = await getRateForDate(from, to, opts.asOfYmd);
  if (!cached) {
    throw new Error(`No FX rate for ${from}->${to} on or before ${opts.asOfYmd}`);
  }

  return {
    amount: amount * cached.rate,
    fromCurrency: from,
    toCurrency: to,
    rate: cached.rate,
    rateDate: cached.rateDate.toISOString().slice(0, 10),
    provider: cached.provider,
    isFallback: cached.isFallback,
    fallbackFromDate: cached.fallbackFromDate
      ? cached.fallbackFromDate.toISOString().slice(0, 10)
      : null,
  };
}
