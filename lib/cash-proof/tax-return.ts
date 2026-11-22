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
  /** Cash-basis returns are judged against customer receipts, accrual-basis returns against book revenue. */
  comparedTo: 'BOOKS' | 'DEPOSITS';
  status: TaxReturnStatus;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (difference: number, base: number) => (base !== 0 ? (difference / Math.abs(base)) * 100 : null);

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
        comparedTo,
        status,
      };
    });
}
