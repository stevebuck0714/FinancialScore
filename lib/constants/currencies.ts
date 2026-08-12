/** Curated ISO 4217 currencies for company base / reporting settings. */
export const SUPPORTED_CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar', locale: 'en-US' },
  { value: 'CAD', label: 'CAD - Canadian Dollar', locale: 'en-CA' },
  { value: 'EUR', label: 'EUR - Euro', locale: 'en-IE' },
  { value: 'GBP', label: 'GBP - British Pound', locale: 'en-GB' },
  { value: 'AUD', label: 'AUD - Australian Dollar', locale: 'en-AU' },
  { value: 'MXN', label: 'MXN - Mexican Peso', locale: 'es-MX' },
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['value'];

export const DEFAULT_BASE_CURRENCY = 'USD';
export const DEFAULT_LOCALE = 'en-US';

export function isSupportedCurrency(code: string | null | undefined): boolean {
  if (!code) return false;
  const normalized = code.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.some((c) => c.value === normalized);
}

export function normalizeCurrencyCode(code: string | null | undefined, fallback = DEFAULT_BASE_CURRENCY): string {
  const normalized = String(code || '').trim().toUpperCase();
  return isSupportedCurrency(normalized) ? normalized : fallback;
}

export function localeForCurrency(code: string | null | undefined): string {
  const normalized = normalizeCurrencyCode(code);
  return SUPPORTED_CURRENCIES.find((c) => c.value === normalized)?.locale || DEFAULT_LOCALE;
}

/** Active display currency: reporting when set, otherwise base/home. */
export function resolveDisplayCurrency(opts: {
  baseCurrency?: string | null;
  reportingCurrency?: string | null;
}): string {
  const base = normalizeCurrencyCode(opts.baseCurrency);
  const reporting = opts.reportingCurrency
    ? normalizeCurrencyCode(opts.reportingCurrency, base)
    : null;
  return reporting || base;
}
