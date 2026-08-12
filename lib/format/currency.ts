import { DEFAULT_BASE_CURRENCY, DEFAULT_LOCALE, localeForCurrency } from '@/lib/constants/currencies';

const formatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Dollar currencies render as bare "$" in their home locales (CAD+en-CA, AUD+en-AU),
 * which is indistinguishable from USD. Prefer a locale that prefixes the symbol (CA$, A$).
 */
function resolveCurrencyFormatLocale(currency: string, locale?: string | null): string {
  const requested =
    (locale && String(locale).trim()) || localeForCurrency(currency) || DEFAULT_LOCALE;
  if (currency === 'CAD' && requested.toLowerCase().startsWith('en-ca')) return 'en-US';
  if (currency === 'AUD' && requested.toLowerCase().startsWith('en-au')) return 'en-US';
  return requested;
}

function getFormatter(locale: string, currency: string, decimals?: number): Intl.NumberFormat {
  const fraction = decimals ?? 0;
  const key = `${locale}|${currency}|${fraction}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatMoney(
  value: number,
  opts?: {
    currency?: string | null;
    locale?: string | null;
    decimals?: number;
  }
): string {
  const currency = (opts?.currency || DEFAULT_BASE_CURRENCY).toUpperCase();
  const locale = resolveCurrencyFormatLocale(currency, opts?.locale);
  const amount = Number.isFinite(value) ? value : 0;
  return getFormatter(locale, currency, opts?.decimals ?? 0).format(amount);
}

/** Compact axis/label money: CA$12k / $1.2M style using Intl currency symbol. */
export function formatMoneyCompact(
  value: number,
  opts?: {
    currency?: string | null;
    locale?: string | null;
  }
): string {
  const currency = (opts?.currency || DEFAULT_BASE_CURRENCY).toUpperCase();
  const locale = resolveCurrencyFormatLocale(currency, opts?.locale);
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const parts = getFormatter(locale, currency, 0).formatToParts(0);
  const symbol = parts.find((p) => p.type === 'currency')?.value || currency;
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`;
  return formatMoney(n, { currency, locale, decimals: 0 });
}
