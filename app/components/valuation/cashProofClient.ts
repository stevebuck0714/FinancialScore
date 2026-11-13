import type { CashProofState } from '@/lib/cash-proof/service';
import type { CashProofSampleStatus } from '@/lib/cash-proof/tie-out';
import type { RevenueReconciliationLine, RevenueReconciliationStatus } from '@/lib/cash-proof/revenue-reconciliation';
import type { StatementScanStatus } from '@/lib/cash-proof/statement-scan';

export type CashProofResponse = CashProofState & {
  companyId: string;
  canEdit: boolean;
  currency?: { baseCurrency?: string; locale?: string };
  error?: string;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM` is a calendar month, not an instant; format it without any timezone shift. */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function makeMoneyFormatter(data: Pick<CashProofResponse, 'currency'> | null) {
  const fmt = new Intl.NumberFormat(data?.currency?.locale || 'en-US', {
    style: 'currency',
    currency: data?.currency?.baseCurrency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (value: number | null | undefined) => (value === null || value === undefined ? '—' : fmt.format(value));
}

export const STATUS_COLORS: Record<CashProofSampleStatus, { bg: string; fg: string; border: string }> = {
  REQUESTED: { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
  RECEIVED: { bg: '#eff6ff', fg: '#1d4ed8', border: '#93c5fd' },
  TIED: { bg: '#ecfdf5', fg: '#047857', border: '#6ee7b7' },
  EXCEPTION: { bg: '#fef2f2', fg: '#b91c1c', border: '#fca5a5' },
  CLEARED: { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
};

export const REVENUE_STATUS_COLORS: Record<RevenueReconciliationStatus, { bg: string; fg: string; border: string }> = {
  INCOMPLETE: STATUS_COLORS.REQUESTED,
  RECONCILED: STATUS_COLORS.TIED,
  EXPLAINED: STATUS_COLORS.CLEARED,
  VARIANCE: STATUS_COLORS.EXCEPTION,
};

export const SCAN_STATUS: Record<StatementScanStatus, { label: string; colors: { bg: string; fg: string; border: string } }> = {
  APPLIED: { label: 'Filled In', colors: STATUS_COLORS.TIED },
  VERIFIED: { label: 'Matches', colors: STATUS_COLORS.TIED },
  CONFLICT: { label: 'Conflict', colors: STATUS_COLORS.EXCEPTION },
  NEEDS_REVIEW: { label: 'Needs Review', colors: STATUS_COLORS.CLEARED },
  UNMATCHED: { label: 'No Match', colors: STATUS_COLORS.CLEARED },
  NO_TEXT: { label: 'Scanned Image', colors: STATUS_COLORS.REQUESTED },
  FAILED: { label: 'Failed', colors: STATUS_COLORS.EXCEPTION },
  PENDING_SCAN: { label: 'Awaiting Virus Scan', colors: STATUS_COLORS.REQUESTED },
};

export type ReconciliationRow = {
  key: string;
  label: string;
  value: (line: RevenueReconciliationLine) => number | null;
  emphasis?: boolean;
  topBorder?: boolean;
};

/** Deposits-to-revenue lines; contract rows only appear when the company has contract balances. */
export function reconciliationRows(lines: RevenueReconciliationLine[]): ReconciliationRow[] {
  const hasContractAssets = lines.some((l) => (l.contractAssetsChange ?? 0) !== 0);
  const hasContractLiabilities = lines.some((l) => (l.contractLiabilitiesChange ?? 0) !== 0);
  const rows: Array<ReconciliationRow | null> = [
    { key: 'bankDeposits', label: 'Total Bank Deposits', value: (l) => l.bankDeposits, topBorder: true },
    { key: 'nonRevenue', label: 'Less: Non-Revenue Deposits', value: (l) => -l.nonRevenueDeposits },
    { key: 'addBacks', label: 'Add: Fees Netted and Outside Receipts', value: (l) => l.addBacks },
    { key: 'adjusted', label: 'Customer Receipts', value: (l) => l.adjustedDeposits, emphasis: true },
    { key: 'receivables', label: 'Change in Receivables', value: (l) => l.receivablesChange },
    hasContractAssets ? { key: 'contractAssets', label: 'Change in Contract Assets', value: (l) => l.contractAssetsChange } : null,
    hasContractLiabilities
      ? {
          key: 'contractLiabilities',
          label: 'Less: Change in Deferred Revenue',
          value: (l) => (l.contractLiabilitiesChange === null ? null : -l.contractLiabilitiesChange),
        }
      : null,
    { key: 'implied', label: 'Implied Revenue', value: (l) => l.impliedRevenue, emphasis: true, topBorder: true },
    { key: 'reported', label: 'Reported Revenue', value: (l) => l.reportedRevenue },
    { key: 'difference', label: 'Difference (Reported − Implied)', value: (l) => l.difference, emphasis: true },
  ];
  return rows.filter((r): r is ReconciliationRow => r !== null);
}

export function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;
}

export async function fetchCashProof(companyId: string): Promise<CashProofResponse> {
  const res = await fetch(`/api/cash-proof?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as CashProofResponse;
  if (!res.ok) throw new Error(json?.error || `Failed to load cash proof (${res.status})`);
  return json;
}

export async function postCashProof(companyId: string, body: Record<string, unknown>): Promise<CashProofResponse> {
  const res = await fetch('/api/cash-proof', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as CashProofResponse;
  if (!res.ok) throw new Error(json?.error || `Cash proof update failed (${res.status})`);
  return json;
}
