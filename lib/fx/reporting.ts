import { convertAmount } from '@/lib/fx/convert';
import { formatEstDate } from '@/lib/fx/est-dates';
import type { CompanyCurrencySettings } from '@/lib/currency/company-currency';

const MONEY_KEYS = new Set([
  'latestRevenue',
  'latestExpense',
  'latestNet',
  'latestCash',
  'latestAR',
  'latestAP',
  'netChange',
  'revenue',
  'expense',
  'cogsTotal',
  'cash',
  'ar',
  'ap',
  'inventory',
  'netIncome',
  'grossProfit',
  'operatingIncome',
  'ebitda',
  'totalAssets',
  'totalLiab',
  'totalEquity',
  'totalLAndE',
  'tcl',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'retainedEarnings',
  'currentYearNetIncome',
  'payroll',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'marketing',
  'depreciation',
  'interestExpense',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
  'sales',
  'receipts',
  'collections',
  'billings',
  'invoiced',
  'openBalance',
  'current',
  'bucket30',
  'bucket60',
  'bucket90',
  'bucket120',
  'over30',
  'over60',
  'over90',
  'grossProfit',
  'cogs',
  'margin',
  'value',
  'totalCash',
  'ebitda',
  'mtd',
  'ytd',
  'budget',
  'priorYear',
]);

/**
 * Convert numeric money fields from base → target using cached EOD FX.
 * Used when statement/display currency differs from company books currency.
 */
export async function convertMoneyTree(
  value: unknown,
  opts: {
    from: string;
    to: string;
    asOfYmd: string;
  }
): Promise<unknown> {
  if (opts.from.toUpperCase() === opts.to.toUpperCase()) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const converted = await convertAmount(value, {
      from: opts.from,
      to: opts.to,
      asOfYmd: opts.asOfYmd,
    });
    return converted.amount;
  }

  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      out.push(await convertMoneyTree(item, opts));
    }
    return out;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      if (MONEY_KEYS.has(key) || (typeof child === 'number' && /amount|revenue|expense|cash|balance|total/i.test(key))) {
        out[key] = await convertMoneyTree(child, opts);
      } else if (child && typeof child === 'object') {
        out[key] = await convertMoneyTree(child, opts);
      } else {
        out[key] = child;
      }
    }
    return out;
  }

  return value;
}

export async function applyReportingCurrencyIfNeeded<T extends Record<string, unknown>>(
  payload: T,
  opts: {
    companyCurrency: CompanyCurrencySettings;
    requestedCurrency: string;
    asOf?: Date;
  }
): Promise<T & { fx?: Record<string, unknown> }> {
  const from = opts.companyCurrency.baseCurrency;
  const to = opts.requestedCurrency.toUpperCase();
  if (!to || to === from) {
    return payload;
  }

  const asOfYmd = formatEstDate(opts.asOf || new Date());
  try {
    const converted = (await convertMoneyTree(payload, { from, to, asOfYmd })) as T;
    return {
      ...converted,
      fx: {
        fromCurrency: from,
        toCurrency: to,
        asOfYmd,
        note: 'Converted for reporting presentation using daily EOD FX (Frankfurter). Source amounts remain in base currency.',
      },
    };
  } catch (error: any) {
    return {
      ...payload,
      fx: {
        fromCurrency: from,
        toCurrency: to,
        asOfYmd,
        error: error?.message || String(error),
        note: 'FX conversion unavailable; returning base-currency amounts.',
      },
    };
  }
}
