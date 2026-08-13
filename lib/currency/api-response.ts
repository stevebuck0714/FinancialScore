import type { NextRequest } from 'next/server';
import {
  assertSupportedStatementCurrency,
  getCompanyCurrencySettings,
  type CompanyCurrencySettings,
} from '@/lib/currency/company-currency';
import { applyReportingCurrencyIfNeeded } from '@/lib/fx/reporting';
import { formatEstDate } from '@/lib/fx/est-dates';

export type CurrencyResponseMeta = {
  baseCurrency: string;
  reportingCurrency: string | null;
  displayCurrency: string;
  locale: string;
  statementCurrency: string;
  converted: boolean;
  asOfYmd: string;
};

export function readRequestedCurrency(request: NextRequest | URLSearchParams): string | null {
  const params = request instanceof URLSearchParams ? request : request.nextUrl.searchParams;
  const raw = params.get('currency') || params.get('statementCurrency');
  if (!raw || !String(raw).trim()) return null;
  return assertSupportedStatementCurrency(raw);
}

/**
 * Resolve which currency an API should present:
 * - explicit ?currency= wins when supported
 * - else company display currency (reporting if set, else base)
 */
export async function resolveStatementCurrency(opts: {
  companyId: string;
  requestedCurrency?: string | null;
}): Promise<{
  settings: CompanyCurrencySettings;
  statementCurrency: string;
}> {
  const settings = await getCompanyCurrencySettings(opts.companyId);
  const requested = opts.requestedCurrency
    ? assertSupportedStatementCurrency(opts.requestedCurrency)
    : null;
  return {
    settings,
    statementCurrency: requested || settings.displayCurrency,
  };
}

export function buildCurrencyMeta(
  settings: CompanyCurrencySettings,
  statementCurrency: string,
  opts?: { converted?: boolean; asOfYmd?: string }
): CurrencyResponseMeta {
  return {
    baseCurrency: settings.baseCurrency,
    reportingCurrency: settings.reportingCurrency,
    displayCurrency: settings.displayCurrency,
    locale: settings.locale,
    statementCurrency,
    converted: Boolean(opts?.converted),
    asOfYmd: opts?.asOfYmd || formatEstDate(),
  };
}

/**
 * Attach currency metadata and optionally FX-convert money fields when
 * statement currency differs from company base (books) currency.
 */
export async function withCurrencyPresentation<T extends Record<string, unknown>>(
  payload: T,
  opts: {
    companyId: string;
    requestedCurrency?: string | null;
    asOf?: Date;
    /** When false, only attach metadata (no FX). Default true. */
    convert?: boolean;
  }
): Promise<T & { currency: CurrencyResponseMeta; fx?: Record<string, unknown> }> {
  const { settings, statementCurrency } = await resolveStatementCurrency({
    companyId: opts.companyId,
    requestedCurrency: opts.requestedCurrency,
  });
  const asOfYmd = formatEstDate(opts.asOf || new Date());
  const shouldConvert =
    opts.convert !== false && statementCurrency !== settings.baseCurrency;

  if (!shouldConvert) {
    return {
      ...payload,
      currency: buildCurrencyMeta(settings, statementCurrency, {
        converted: false,
        asOfYmd,
      }),
    };
  }

  const converted = await applyReportingCurrencyIfNeeded(payload, {
    companyCurrency: settings,
    requestedCurrency: statementCurrency,
    asOf: opts.asOf,
  });

  return {
    ...converted,
    currency: buildCurrencyMeta(settings, statementCurrency, {
      converted: Boolean(converted.fx) && !converted.fx?.error,
      asOfYmd: String(converted.fx?.asOfYmd || asOfYmd),
    }),
  };
}

/** Convert-on-read helper for financial GET handlers. */
export async function presentCompanyJson<T extends Record<string, unknown>>(
  request: NextRequest,
  companyId: string,
  payload: T,
  opts?: { asOf?: Date; convert?: boolean }
): Promise<T & { currency: CurrencyResponseMeta; fx?: Record<string, unknown> }> {
  return withCurrencyPresentation(payload, {
    companyId,
    requestedCurrency: readRequestedCurrency(request),
    asOf: opts?.asOf,
    convert: opts?.convert !== false,
  });
}
