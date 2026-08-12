import prisma from '@/lib/prisma';
import {
  DEFAULT_BASE_CURRENCY,
  DEFAULT_LOCALE,
  isSupportedCurrency,
  localeForCurrency,
  normalizeCurrencyCode,
  resolveDisplayCurrency,
} from '@/lib/constants/currencies';

export type CompanyCurrencySettings = {
  baseCurrency: string;
  reportingCurrency: string | null;
  locale: string;
  displayCurrency: string;
};

export async function getCompanyCurrencySettings(
  companyId: string
): Promise<CompanyCurrencySettings> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        baseCurrency: true,
        reportingCurrency: true,
        locale: true,
      },
    });
    const baseCurrency = normalizeCurrencyCode(company?.baseCurrency);
    const reportingCurrency = company?.reportingCurrency
      ? normalizeCurrencyCode(company.reportingCurrency, baseCurrency)
      : null;
    const locale =
      (company?.locale && String(company.locale).trim()) ||
      localeForCurrency(baseCurrency) ||
      DEFAULT_LOCALE;
    return {
      baseCurrency,
      reportingCurrency: reportingCurrency === baseCurrency ? null : reportingCurrency,
      locale,
      displayCurrency: resolveDisplayCurrency({ baseCurrency, reportingCurrency }),
    };
  } catch {
    return {
      baseCurrency: DEFAULT_BASE_CURRENCY,
      reportingCurrency: null,
      locale: DEFAULT_LOCALE,
      displayCurrency: DEFAULT_BASE_CURRENCY,
    };
  }
}

/** Accept company base/reporting or any curated ISO code; reject unknowns. */
export function assertSupportedStatementCurrency(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return DEFAULT_BASE_CURRENCY;
  if (!isSupportedCurrency(normalized)) return null;
  return normalized;
}
