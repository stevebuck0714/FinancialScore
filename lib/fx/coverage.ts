import prisma from '@/lib/prisma';
import { normalizeCurrencyCode } from '@/lib/constants/currencies';
import { getCompanyCurrencySettings } from '@/lib/currency/company-currency';
import { formatEstDate, previousEstCalendarDate, yearsAgoEstDate } from '@/lib/fx/est-dates';
import { FRANKFURTER_PROVIDER } from '@/lib/fx/frankfurter';

export type FxCoverageSummary = {
  companyId: string;
  baseCurrency: string;
  reportingCurrency: string | null;
  pairActive: boolean;
  fromCurrency: string | null;
  toCurrency: string | null;
  expectedStartYmd: string;
  expectedEndYmd: string;
  storedCount: number;
  earliestRateDate: string | null;
  latestRateDate: string | null;
  latestIsFallback: boolean;
  coveragePct: number | null;
  gaps: {
    missingLatestEstDay: boolean;
    sparseHistory: boolean;
  };
  provider: string;
};

/** Estimate business days between two YMD dates (Mon–Fri). */
function estimateBusinessDays(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00.000Z`);
  const end = new Date(`${endYmd}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * FX rate coverage for a company's base→reporting pair (admin diagnostics).
 */
export async function getCompanyFxCoverage(companyId: string): Promise<FxCoverageSummary> {
  const settings = await getCompanyCurrencySettings(companyId);
  const expectedEndYmd = previousEstCalendarDate();
  const expectedStartYmd = yearsAgoEstDate(3);
  const base = {
    companyId,
    baseCurrency: settings.baseCurrency,
    reportingCurrency: settings.reportingCurrency,
    pairActive: false,
    fromCurrency: null as string | null,
    toCurrency: null as string | null,
    expectedStartYmd,
    expectedEndYmd,
    storedCount: 0,
    earliestRateDate: null as string | null,
    latestRateDate: null as string | null,
    latestIsFallback: false,
    coveragePct: null as number | null,
    gaps: {
      missingLatestEstDay: false,
      sparseHistory: false,
    },
    provider: FRANKFURTER_PROVIDER,
  };

  if (!settings.reportingCurrency) {
    return base;
  }

  const fromCurrency = normalizeCurrencyCode(settings.baseCurrency);
  const toCurrency = normalizeCurrencyCode(settings.reportingCurrency, fromCurrency);
  if (fromCurrency === toCurrency) {
    return { ...base, pairActive: false, fromCurrency, toCurrency };
  }

  const [agg, latest] = await Promise.all([
    prisma.fxRate.aggregate({
      where: {
        fromCurrency,
        toCurrency,
        rateType: 'daily_eod',
        rateDate: {
          gte: new Date(`${expectedStartYmd}T00:00:00.000Z`),
          lte: new Date(`${expectedEndYmd}T00:00:00.000Z`),
        },
      },
      _count: { _all: true },
      _min: { rateDate: true },
      _max: { rateDate: true },
    }),
    prisma.fxRate.findFirst({
      where: {
        fromCurrency,
        toCurrency,
        rateType: 'daily_eod',
      },
      orderBy: { rateDate: 'desc' },
      select: { rateDate: true, isFallback: true },
    }),
  ]);

  const storedCount = Number(agg._count?._all || 0);
  const earliestRateDate = agg._min.rateDate
    ? formatEstDate(agg._min.rateDate)
    : null;
  const latestRateDate = latest?.rateDate ? formatEstDate(latest.rateDate) : null;
  const expectedBusinessDays = estimateBusinessDays(expectedStartYmd, expectedEndYmd);
  const coveragePct =
    expectedBusinessDays > 0
      ? Math.min(100, Math.round((storedCount / expectedBusinessDays) * 1000) / 10)
      : null;

  const missingLatestEstDay = !latestRateDate || latestRateDate < expectedEndYmd;
  const sparseHistory = coveragePct != null && coveragePct < 80;

  return {
    ...base,
    pairActive: true,
    fromCurrency,
    toCurrency,
    storedCount,
    earliestRateDate,
    latestRateDate,
    latestIsFallback: Boolean(latest?.isFallback),
    coveragePct,
    gaps: {
      missingLatestEstDay,
      sparseHistory,
    },
  };
}
