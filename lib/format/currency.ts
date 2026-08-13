import { DEFAULT_BASE_CURRENCY, DEFAULT_LOCALE, localeForCurrency } from '@/lib/constants/currencies';

const formatterCache = new Map<string, Intl.NumberFormat>();

function resolveFormatLocale(currency: string, locale?: string | null): string {
  return (locale && String(locale).trim()) || localeForCurrency(currency) || DEFAULT_LOCALE;
}

function getFormatter(locale: string, currency: string, decimals?: number): Intl.NumberFormat {
  const fraction = decimals ?? 0;
  const key = `${locale}|${currency}|${fraction}|narrow`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/** Narrow symbol only ($ € £), not CAD$ / EUR. Page headers show the ISO code. */
export function getCurrencySymbol(currency?: string | null, locale?: string | null): string {
  const code = (currency || DEFAULT_BASE_CURRENCY).toUpperCase();
  const loc = resolveFormatLocale(code, locale);
  const parts = getFormatter(loc, code, 0).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value || code;
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
  const locale = resolveFormatLocale(currency, opts?.locale);
  const amount = Number.isFinite(value) ? value : 0;
  return getFormatter(locale, currency, opts?.decimals ?? 0).format(amount);
}

/** Compact axis/label money: $12k / €1.2M using the narrow currency symbol. */
export function formatMoneyCompact(
  value: number,
  opts?: {
    currency?: string | null;
    locale?: string | null;
  }
): string {
  const currency = (opts?.currency || DEFAULT_BASE_CURRENCY).toUpperCase();
  const locale = resolveFormatLocale(currency, opts?.locale);
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const symbol = getCurrencySymbol(currency, locale);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`;
  return formatMoney(n, { currency, locale, decimals: 0 });
}

/** Accounting-style negatives: (€1,234) instead of -€1,234. */
export function formatSignedMoney(
  value: number,
  opts?: {
    currency?: string | null;
    locale?: string | null;
    decimals?: number;
  }
): string {
  const n = Number.isFinite(value) ? Number(value) : 0;
  const formatted = formatMoney(Math.abs(n), opts);
  return n < 0 ? `(${formatted})` : formatted;
}
