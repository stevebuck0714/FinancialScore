/**
 * AR balance-sheet anchors for the daily AR aging-rule helper.
 *
 * The AR balance is reconstructed directly from ARTransactionFact events
 * (I/P/C/D types) scoped to invoices created within the last `agingDays` days.
 * Sign convention in ARTransactionFact normalizedAmount:
 *   I, D -> positive (increases AR)
 *   P, C -> negative (reduces AR)
 *
 * Per-invoice net is capped at >= 0 by the read-side helper to prevent
 * over-payment / sign-quirk credits from creating negative AR that
 * incorrectly nets out other invoices.
 */
export type ArBalanceSheetAnchorAccount = {
  accountId: string;
  accountNumber: string;
  accountName: string;
  /** Book AR balance (debit balance on TB), stored as a positive number. */
  arBalance: number;
};

export type ArBalanceSheetAnchorConfig = {
  /** ISO calendar date of the closed balance sheet (e.g. year-end). */
  anchorDateIso: string;
  /** Aging window in days used by the read-side helper. AR has a longer
   *  payment tail than AP so we use 180 days. Validated against 4 customer
   *  TB anchors:
   *    12/31/2023: +0.3% drift
   *    1/31/2026:  -2.6% drift
   *    2/28/2026:  -8.8% drift
   *    3/31/2026:  +2.1% drift
   */
  agingDays: number;
  accounts: ArBalanceSheetAnchorAccount[];
};

const INFOR_CSI_AR_ANCHOR: ArBalanceSheetAnchorConfig = {
  anchorDateIso: '2023-12-31',
  agingDays: 180,
  accounts: [
    {
      accountId: '11100',
      accountNumber: '11100',
      accountName: 'Accounts Receivable',
      arBalance: 1_179_854.70,
    },
  ],
};

const AR_BALANCE_SHEET_ANCHORS: Record<string, ArBalanceSheetAnchorConfig> = {
  cmmnwyofv000fqhp4z8lebbny: INFOR_CSI_AR_ANCHOR,
  cmmcp278j0002kz0439rlixdj: INFOR_CSI_AR_ANCHOR,
};

export function getArBalanceSheetAnchorConfig(companyId: string): ArBalanceSheetAnchorConfig | null {
  return AR_BALANCE_SHEET_ANCHORS[companyId] ?? null;
}
