'use client';

import { SUPPORTED_CURRENCIES, normalizeCurrencyCode } from '@/lib/constants/currencies';
import { getCurrencySymbol } from '@/lib/format/currency';

type Props = {
  currency?: string | null;
  locale?: string | null;
  /** When reporting currency differs from books. */
  baseCurrency?: string | null;
};

/**
 * Page-level currency chip. Amounts on the page use the narrow symbol only
 * ($ € £); this badge is where the ISO code lives.
 */
export default function PageCurrencyBadge({ currency, locale, baseCurrency }: Props) {
  const code = normalizeCurrencyCode(currency);
  const symbol = getCurrencySymbol(code, locale);
  const meta = SUPPORTED_CURRENCIES.find((c) => c.value === code);
  const name = meta?.label.split(' - ')[1] || code;
  const books = baseCurrency ? normalizeCurrencyCode(baseCurrency) : null;
  const title =
    books && books !== code
      ? `Amounts in ${name} (${code}). Books are kept in ${books}.`
      : `Amounts in ${name} (${code})`;

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        color: '#334155',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {code}
      <span style={{ fontWeight: 600, color: '#64748b' }}>{symbol}</span>
    </span>
  );
}
