'use client';

import { useMemo } from 'react';
import { formatMoney } from '@/lib/format/currency';
import {
  DEFAULT_BASE_CURRENCY,
  DEFAULT_LOCALE,
  localeForCurrency,
  resolveDisplayCurrency,
} from '@/lib/constants/currencies';

type CurrencySource = {
  baseCurrency?: string | null;
  reportingCurrency?: string | null;
  locale?: string | null;
} | null | undefined;

/**
 * Format money using the company's base/reporting currency settings.
 * Pass the selected company object (or currency fields) from page state.
 */
export function useCurrencyFormatter(company?: CurrencySource) {
  const displayCurrency = resolveDisplayCurrency({
    baseCurrency: company?.baseCurrency,
    reportingCurrency: company?.reportingCurrency,
  });
  const locale =
    (company?.locale && String(company.locale).trim()) ||
    localeForCurrency(displayCurrency) ||
    DEFAULT_LOCALE;

  return useMemo(
    () => ({
      currency: displayCurrency || DEFAULT_BASE_CURRENCY,
      locale,
      baseCurrency: company?.baseCurrency || DEFAULT_BASE_CURRENCY,
      reportingCurrency: company?.reportingCurrency || null,
      fmt: (value: number, decimals?: number) =>
        formatMoney(value, { currency: displayCurrency, locale, decimals }),
      fmtCompact: (value: number) =>
        formatMoney(value, { currency: displayCurrency, locale, decimals: 0 }),
    }),
    [displayCurrency, locale, company?.baseCurrency, company?.reportingCurrency]
  );
}
