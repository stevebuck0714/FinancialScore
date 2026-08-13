'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMoney, formatMoneyCompact, formatSignedMoney } from '@/lib/format/currency';
import {
  DEFAULT_BASE_CURRENCY,
  DEFAULT_LOCALE,
  localeForCurrency,
  resolveDisplayCurrency,
} from '@/lib/constants/currencies';

type CompanyCurrencyState = {
  baseCurrency: string;
  reportingCurrency: string | null;
  locale: string;
};

const cache = new Map<string, CompanyCurrencyState>();

/** Call after saving company currency so UI pickers refetch. */
export function invalidateCompanyMoneyFormatterCache(companyId?: string | null) {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

/**
 * Load company base/reporting currency and return shared money formatters.
 */
export function useCompanyMoneyFormatter(companyId?: string | null) {
  const [currency, setCurrency] = useState<CompanyCurrencyState>(() => {
    if (companyId && cache.has(companyId)) return cache.get(companyId)!;
    return {
      baseCurrency: DEFAULT_BASE_CURRENCY,
      reportingCurrency: null,
      locale: DEFAULT_LOCALE,
    };
  });

  useEffect(() => {
    if (!companyId) return;
    if (cache.has(companyId)) {
      setCurrency(cache.get(companyId)!);
    }
    const controller = new AbortController();
    fetch(`/api/companies?companyId=${encodeURIComponent(companyId)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((data) => {
        const company = Array.isArray(data?.companies) ? data.companies[0] : null;
        const next: CompanyCurrencyState = {
          baseCurrency: String(company?.baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase(),
          reportingCurrency: company?.reportingCurrency
            ? String(company.reportingCurrency).toUpperCase()
            : null,
          locale: String(company?.locale || localeForCurrency(company?.baseCurrency) || DEFAULT_LOCALE),
        };
        cache.set(companyId, next);
        setCurrency(next);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('Failed to load company currency for formatter', err);
        }
      });
    return () => controller.abort();
  }, [companyId]);

  const displayCurrency = resolveDisplayCurrency({
    baseCurrency: currency.baseCurrency,
    reportingCurrency: currency.reportingCurrency,
  });

  return useMemo(
    () => ({
      currency: displayCurrency,
      locale: currency.locale,
      baseCurrency: currency.baseCurrency,
      reportingCurrency: currency.reportingCurrency,
      fmt: (value: number, decimals = 0) =>
        formatMoney(value, { currency: displayCurrency, locale: currency.locale, decimals }),
      fmtCompact: (value: number) =>
        formatMoneyCompact(value, { currency: displayCurrency, locale: currency.locale }),
      fmtSigned: (value: number, decimals = 0) =>
        formatSignedMoney(value, { currency: displayCurrency, locale: currency.locale, decimals }),
    }),
    [displayCurrency, currency.locale, currency.baseCurrency, currency.reportingCurrency]
  );
}
