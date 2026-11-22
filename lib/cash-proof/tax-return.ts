import type { RevenueReconciliationPeriod } from './revenue-reconciliation';

export type TaxReturnForm = '1120S' | '1120' | '1065' | 'SCHEDULE_C' | 'OTHER';
export type TaxReturnBasis = 'CASH' | 'ACCRUAL';

export const TAX_RETURN_FORMS: Record<TaxReturnForm, { label: string; lines: string }> = {
  '1120S': { label: 'Form 1120-S', lines: 'lines 1a, 1b, 1c' },
  '1120': { label: 'Form 1120', lines: 'lines 1a, 1b, 1c' },
  '1065': { label: 'Form 1065', lines: 'lines 1a, 1b, 1c' },
  SCHEDULE_C: { label: 'Schedule C (Form 1040)', lines: 'lines 1, 2, 3' },
  OTHER: { label: 'Other', lines: 'gross receipts less returns and allowances' },
};
export const TAX_RETURN_FORM_ORDER = Object.keys(TAX_RETURN_FORMS) as TaxReturnForm[];

export const TAX_RETURN_BASIS_LABELS: Record<TaxReturnBasis, string> = { CASH: 'Cash', ACCRUAL: 'Accrual' };

/** One fiscal year's income tax return, stored on the engagement keyed by period (FY2024). */
export type TaxReturnEntry = {
  form: TaxReturnForm | null;
  basis: TaxReturnBasis;
  grossReceipts: number | null;
  returnsAllowances: number | null;
  dataRoomDocumentId: string | null;
  source: 'read' | 'entered';
  note: string | null;
  updatedAt: string;
};

export type TaxReturnStatus = 'NOT_PROVIDED' | 'INCOMPLETE' | 'RECONCILED' | 'EXPLAINED' | 'VARIANCE';

export const TAX_RETURN_STATUS_LABELS: Record<TaxReturnStatus, string> = {
  NOT_PROVIDED: 'Not Provided',
  INCOMPLETE: 'Incomplete',
  RECONCILED: 'Reconciled',
  EXPLAINED: 'Explained',
  VARIANCE: 'Variance',
};

export type TaxReturnComparison = {
  key: string;
  label: string;
  entry: TaxReturnEntry | null;
  /** Gross receipts less returns and allowances. */
  taxRevenue: number | null;
  reportedRevenue: number | null;
  customerReceipts: number;
  bookDifference: number | null;
  bookVariancePct: number | null;
  depositsDifference: number | null;
  depositsVariancePct: number | null;
  /** Bank statements in the fiscal year with no deposits entered; the deposits test waits for all of them. */
  missingDeposits: number;
  /** Cash-basis returns are judged against customer receipts, accrual-basis returns against book revenue. */
  comparedTo: 'BOOKS' | 'DEPOSITS';
  status: TaxReturnStatus;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (difference: number, base: number) => (base !== 0 ? (difference / Math.abs(base)) * 100 : null);

const joinLabels = (years: TaxReturnComparison[]) => years.map((y) => y.label).join(', ');

/** One-paragraph conclusion on the tax return comparison, shared by the Cash Proof and QoE Summary reports. */
export function taxReturnConclusion(years: TaxReturnComparison[], tolerancePct: number): string {
  if (years.length === 0) return '';
  const provided = years.filter((y) => y.status !== 'NOT_PROVIDED');
  const missing = years.filter((y) => y.status === 'NOT_PROVIDED');
  const missingText = missing.length ? `No income tax return was provided for ${joinLabels(missing)}.` : '';
  if (provided.length === 0) return `Income tax returns were not provided, so revenue was not compared with the returns. ${missingText}`.trim();

  const variances = provided.filter((y) => y.status === 'VARIANCE');
  const explained = provided.filter((y) => y.status === 'EXPLAINED');
  const supported = provided.filter((y) => y.status === 'RECONCILED' || y.status === 'EXPLAINED');
  const incomplete = provided.filter((y) => y.status === 'INCOMPLETE');
  const pendingDeposits = incomplete.filter((y) => y.comparedTo === 'DEPOSITS');
  const booksAgree = pendingDeposits.filter((y) => y.bookVariancePct !== null && Math.abs(y.bookVariancePct) <= tolerancePct);
  const booksDiffer = pendingDeposits.filter((y) => !booksAgree.includes(y));
  const noBooks = incomplete.filter((y) => y.comparedTo === 'BOOKS');

  const parts = [
    variances.length
      ? `Revenue differs from the income tax return by more than ${tolerancePct}% in ${joinLabels(variances)} with no explanation.`
      : '',
    supported.length
      ? `Gross receipts on the income tax return agree with revenue within ${tolerancePct}% for ${joinLabels(supported)}${
          explained.length ? ` (${joinLabels(explained)} after documented explanations)` : ''
        }.`
      : '',
    booksAgree.length
      ? `Gross receipts on the cash-basis return${booksAgree.length === 1 ? '' : 's'} for ${joinLabels(booksAgree)} agree with book revenue within ${tolerancePct}%; the test against bank deposits is pending because deposits have not been entered for every statement.`
      : '',
    booksDiffer.length
      ? `${joinLabels(booksDiffer)} could not be tested against bank deposits because deposits have not been entered for every statement${booksDiffer
          .filter((y) => y.bookVariancePct !== null)
          .map((y) => `; book revenue differs from the ${y.label} return by ${Math.abs(y.bookVariancePct!).toFixed(1)}%`)
          .join('')}.`
      : '',
    noBooks.length ? `${joinLabels(noBooks)} could not be compared because the books have no revenue for the year.` : '',
    missingText,
  ];
  return parts.filter(Boolean).join(' ');
}

/** Tax returns cover whole years, so only complete fiscal years are compared. */
export function computeTaxReturnComparison(
  periods: RevenueReconciliationPeriod[],
  entries: Record<string, TaxReturnEntry>,
  tolerancePct: number,
): TaxReturnComparison[] {
  return periods
    .filter((p) => p.complete)
    .map((p) => {
      const entry = entries[p.key] ?? null;
      const taxRevenue =
        entry && entry.grossReceipts !== null ? round2(entry.grossReceipts - (entry.returnsAllowances ?? 0)) : null;
      const bookDifference =
        taxRevenue !== null && p.reportedRevenue !== null ? round2(p.reportedRevenue - taxRevenue) : null;
      const depositsDifference =
        taxRevenue !== null && p.missingDeposits === 0 ? round2(p.adjustedDeposits - taxRevenue) : null;
      const comparedTo = entry?.basis === 'CASH' ? 'DEPOSITS' : 'BOOKS';
      const primary = comparedTo === 'DEPOSITS' ? depositsDifference : bookDifference;
      const note = String(entry?.note || '').trim();

      let status: TaxReturnStatus;
      if (taxRevenue === null) status = 'NOT_PROVIDED';
      else if (primary === null) status = note ? 'EXPLAINED' : 'INCOMPLETE';
      else if (Math.abs(pct(primary, taxRevenue) ?? (primary === 0 ? 0 : Infinity)) <= tolerancePct) status = 'RECONCILED';
      else status = note ? 'EXPLAINED' : 'VARIANCE';

      return {
        key: p.key,
        label: p.label,
        entry,
        taxRevenue,
        reportedRevenue: p.reportedRevenue,
        customerReceipts: p.adjustedDeposits,
        bookDifference,
        bookVariancePct: bookDifference === null ? null : pct(bookDifference, taxRevenue!),
        depositsDifference,
        depositsVariancePct: depositsDifference === null ? null : pct(depositsDifference, taxRevenue!),
        missingDeposits: p.missingDeposits,
        comparedTo,
        status,
      };
    });
}
