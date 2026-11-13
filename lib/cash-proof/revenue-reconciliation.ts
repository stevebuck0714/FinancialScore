export type RevenueAdjustmentCategory =
  | 'TRANSFER_IN'
  | 'LOAN_PROCEEDS'
  | 'OWNER_CONTRIBUTION'
  | 'CUSTOMER_FUNDS'
  | 'SALES_TAX'
  | 'OTHER_INCOME'
  | 'ASSET_SALE'
  | 'REFUND_REBATE'
  | 'OTHER_NON_REVENUE'
  | 'PROCESSOR_FEES'
  | 'RECEIPTS_OUTSIDE_ACCOUNTS';

/** `sign` is how the amount moves bank deposits toward revenue. */
export const REVENUE_ADJUSTMENT_CATEGORIES: Record<
  RevenueAdjustmentCategory,
  { label: string; sign: -1 | 1; help: string }
> = {
  TRANSFER_IN: { label: 'Transfers between company accounts', sign: -1, help: 'Money moved in from another company bank account.' },
  LOAN_PROCEEDS: { label: 'Loan and line of credit proceeds', sign: -1, help: 'Draws, new loans, PPP/EIDL, merchant cash advances.' },
  OWNER_CONTRIBUTION: { label: 'Owner contributions', sign: -1, help: 'Money the owner or shareholders put into the business.' },
  CUSTOMER_FUNDS: { label: 'Customer funds held (payroll, escrow, trust)', sign: -1, help: 'Client money the business holds and pays out on their behalf.' },
  SALES_TAX: { label: 'Sales tax collected', sign: -1, help: 'Sales tax included in customer deposits but not in revenue.' },
  OTHER_INCOME: { label: 'Interest and other non-operating income', sign: -1, help: 'Interest, dividends, and other income recorded below revenue.' },
  ASSET_SALE: { label: 'Asset sale proceeds', sign: -1, help: 'Equipment, vehicle, or other asset sales.' },
  REFUND_REBATE: { label: 'Vendor refunds, rebates, and insurance proceeds', sign: -1, help: 'Money returned by vendors, insurers, or tax agencies.' },
  OTHER_NON_REVENUE: { label: 'Other non-revenue deposits', sign: -1, help: 'Anything else deposited that is not a customer payment.' },
  PROCESSOR_FEES: { label: 'Card processor fees and chargebacks netted from deposits', sign: 1, help: 'Merchant fees taken before the deposit hit the bank.' },
  RECEIPTS_OUTSIDE_ACCOUNTS: { label: 'Customer receipts outside the tested accounts', sign: 1, help: 'Customer payments kept in PayPal, Stripe, or another account not in this proof.' },
};

export const REVENUE_ADJUSTMENT_CATEGORY_ORDER = Object.keys(REVENUE_ADJUSTMENT_CATEGORIES) as RevenueAdjustmentCategory[];

export type RevenueBasis = {
  revenue: number;
  receivables: number;
  contractAssets: number;
  contractLiabilities: number;
};

export type RevenueReconciliationStatus = 'INCOMPLETE' | 'RECONCILED' | 'EXPLAINED' | 'VARIANCE';

export const REVENUE_STATUS_LABELS: Record<RevenueReconciliationStatus, string> = {
  INCOMPLETE: 'Incomplete',
  RECONCILED: 'Reconciled',
  EXPLAINED: 'Explained',
  VARIANCE: 'Variance',
};

export type RevenueReconciliationLine = {
  bankDeposits: number;
  missingDeposits: number;
  nonRevenueDeposits: number;
  addBacks: number;
  adjustedDeposits: number;
  receivablesChange: number | null;
  contractAssetsChange: number | null;
  contractLiabilitiesChange: number | null;
  impliedRevenue: number | null;
  reportedRevenue: number | null;
  difference: number | null;
  variancePct: number | null;
  byCategory: Partial<Record<RevenueAdjustmentCategory, number>>;
};

export type RevenueReconciliationPeriod = RevenueReconciliationLine & {
  key: string;
  label: string;
  startMonth: string;
  endMonth: string;
  monthCount: number;
  complete: boolean;
  status: RevenueReconciliationStatus;
  note: string | null;
};

export type RevenueReconciliation = {
  months: Record<string, RevenueReconciliationLine>;
  periods: RevenueReconciliationPeriod[];
  total: RevenueReconciliationPeriod;
  tolerancePct: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

/** Calendar year in which the fiscal year containing `month` ends. */
export function fiscalYearOf(month: string, fiscalYearEndMonth: number): number {
  const [y, m] = month.split('-').map(Number);
  return m > fiscalYearEndMonth ? y + 1 : y;
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function emptyLine(): RevenueReconciliationLine {
  return {
    bankDeposits: 0,
    missingDeposits: 0,
    nonRevenueDeposits: 0,
    addBacks: 0,
    adjustedDeposits: 0,
    receivablesChange: 0,
    contractAssetsChange: 0,
    contractLiabilitiesChange: 0,
    impliedRevenue: 0,
    reportedRevenue: 0,
    difference: null,
    variancePct: null,
    byCategory: {},
  };
}

function finishLine(line: RevenueReconciliationLine): RevenueReconciliationLine {
  line.bankDeposits = round2(line.bankDeposits);
  line.nonRevenueDeposits = round2(line.nonRevenueDeposits);
  line.addBacks = round2(line.addBacks);
  line.adjustedDeposits = round2(line.bankDeposits - line.nonRevenueDeposits + line.addBacks);
  const changes = [line.receivablesChange, line.contractAssetsChange, line.contractLiabilitiesChange];
  if (changes.some((c) => c === null)) {
    line.impliedRevenue = null;
  } else {
    line.receivablesChange = round2(line.receivablesChange!);
    line.contractAssetsChange = round2(line.contractAssetsChange!);
    line.contractLiabilitiesChange = round2(line.contractLiabilitiesChange!);
    line.impliedRevenue = round2(
      line.adjustedDeposits + line.receivablesChange + line.contractAssetsChange - line.contractLiabilitiesChange,
    );
  }
  if (line.reportedRevenue !== null) line.reportedRevenue = round2(line.reportedRevenue);
  if (line.impliedRevenue !== null && line.reportedRevenue !== null) {
    line.difference = round2(line.reportedRevenue - line.impliedRevenue);
    line.variancePct = line.reportedRevenue !== 0 ? (line.difference / Math.abs(line.reportedRevenue)) * 100 : null;
  }
  for (const k of Object.keys(line.byCategory) as RevenueAdjustmentCategory[]) {
    line.byCategory[k] = round2(line.byCategory[k]!);
  }
  return line;
}

/**
 * Deposits-to-revenue proof:
 *   bank deposits − non-revenue deposits + add-backs = customer receipts
 *   customer receipts + Δ receivables + Δ contract assets − Δ contract liabilities = implied revenue
 * compared with revenue reported in the books, by month and by fiscal year.
 */
export function computeRevenueReconciliation(input: {
  months: string[];
  fiscalYearEndMonth: number;
  tolerancePct: number;
  /** Included accounts only: month → per-account deposit totals, null where the statement figure is missing. */
  depositsByMonth: Record<string, Array<number | null>>;
  adjustments: Array<{ month: string; category: string; amount: number }>;
  /** Must include the month before the period for the opening balances. */
  basisByMonth: Record<string, RevenueBasis>;
  periodNotes: Record<string, string>;
}): RevenueReconciliation {
  const { months, fiscalYearEndMonth, tolerancePct, basisByMonth, periodNotes } = input;
  const monthLines: Record<string, RevenueReconciliationLine> = {};

  for (const month of months) {
    const line = emptyLine();
    for (const value of input.depositsByMonth[month] || []) {
      if (value === null) line.missingDeposits += 1;
      else line.bankDeposits += value;
    }
    for (const adj of input.adjustments) {
      if (adj.month !== month) continue;
      const def = REVENUE_ADJUSTMENT_CATEGORIES[adj.category as RevenueAdjustmentCategory];
      if (!def) continue;
      if (def.sign < 0) line.nonRevenueDeposits += adj.amount;
      else line.addBacks += adj.amount;
      const key = adj.category as RevenueAdjustmentCategory;
      line.byCategory[key] = (line.byCategory[key] || 0) + adj.amount;
    }
    const current = basisByMonth[month];
    const prior = basisByMonth[prevMonth(month)];
    line.reportedRevenue = current ? current.revenue : null;
    if (current && prior) {
      line.receivablesChange = current.receivables - prior.receivables;
      line.contractAssetsChange = current.contractAssets - prior.contractAssets;
      line.contractLiabilitiesChange = current.contractLiabilities - prior.contractLiabilities;
    } else {
      line.receivablesChange = null;
      line.contractAssetsChange = null;
      line.contractLiabilitiesChange = null;
    }
    monthLines[month] = finishLine(line);
  }

  const rollUp = (key: string, label: string, groupMonths: string[], complete: boolean): RevenueReconciliationPeriod => {
    const line = emptyLine();
    let reportedMissing = false;
    for (const month of groupMonths) {
      const m = monthLines[month];
      line.bankDeposits += m.bankDeposits;
      line.missingDeposits += m.missingDeposits;
      line.nonRevenueDeposits += m.nonRevenueDeposits;
      line.addBacks += m.addBacks;
      for (const [cat, amt] of Object.entries(m.byCategory) as Array<[RevenueAdjustmentCategory, number]>) {
        line.byCategory[cat] = (line.byCategory[cat] || 0) + amt;
      }
      if (m.reportedRevenue === null) reportedMissing = true;
      else line.reportedRevenue! += m.reportedRevenue;
    }
    // Period working-capital change is closing minus opening, so a gap in the
    // middle of the period does not matter, only the two ends.
    const opening = basisByMonth[prevMonth(groupMonths[0])];
    const closing = basisByMonth[groupMonths[groupMonths.length - 1]];
    if (opening && closing) {
      line.receivablesChange = closing.receivables - opening.receivables;
      line.contractAssetsChange = closing.contractAssets - opening.contractAssets;
      line.contractLiabilitiesChange = closing.contractLiabilities - opening.contractLiabilities;
    } else {
      line.receivablesChange = null;
      line.contractAssetsChange = null;
      line.contractLiabilitiesChange = null;
    }
    if (reportedMissing) line.reportedRevenue = null;
    const finished = finishLine(line);
    const note = String(periodNotes[key] || '').trim() || null;
    let status: RevenueReconciliationStatus;
    if (finished.missingDeposits > 0) status = 'INCOMPLETE';
    else if (finished.difference === null) status = note ? 'EXPLAINED' : 'INCOMPLETE';
    else if (finished.variancePct !== null && Math.abs(finished.variancePct) <= tolerancePct) status = 'RECONCILED';
    else status = note ? 'EXPLAINED' : 'VARIANCE';
    return {
      ...finished,
      key,
      label,
      startMonth: groupMonths[0],
      endMonth: groupMonths[groupMonths.length - 1],
      monthCount: groupMonths.length,
      complete,
      status,
      note,
    };
  };

  const groups = new Map<number, string[]>();
  for (const month of months) {
    const fy = fiscalYearOf(month, fiscalYearEndMonth);
    if (!groups.has(fy)) groups.set(fy, []);
    groups.get(fy)!.push(month);
  }
  const periods: RevenueReconciliationPeriod[] = [];
  const fyKeys = [...groups.keys()].sort((a, b) => a - b);
  fyKeys.forEach((fy, idx) => {
    const groupMonths = groups.get(fy)!;
    const complete = groupMonths.length === 12;
    const range = `${monthShort(groupMonths[0])} – ${monthShort(groupMonths[groupMonths.length - 1])}`;
    let label = `FY${fy}`;
    if (!complete) label = idx === fyKeys.length - 1 ? `FY${fy} YTD (${range})` : `FY${fy} partial (${range})`;
    periods.push(rollUp(`FY${fy}`, label, groupMonths, complete));
  });
  const total = rollUp('TOTAL', 'Review Period Total', months, true);

  return { months: monthLines, periods, total, tolerancePct };
}
