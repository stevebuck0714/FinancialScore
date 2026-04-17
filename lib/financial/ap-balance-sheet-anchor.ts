/**
 * AP balance-sheet anchors for daily AP reconstruction.
 *
 * The AP balance is reconstructed using TWO event sources:
 *   1. APTransactionFact (SLVCHHDRS voucher events) — invoices increase AP, credits decrease
 *   2. GLTransactionFact (APP payment entries on the AP control account) — payments decrease AP
 *
 * Formula:  AP_day = anchor + SUM(voucher normalizedAmount) + SUM(-payment signedAmount)
 *           where payment signedAmount is positive (debit to AP), so -payment = negative = AP decreases.
 */
export type ApBalanceSheetAnchorAccount = {
  accountId: string;
  accountNumber: string;
  accountName: string;
  /** Book AP liability balance (credit balance on TB), stored as a positive number. */
  apBalance: number;
};

export type ApBalanceSheetAnchorConfig = {
  /** ISO calendar date of the closed balance sheet (e.g. year-end). */
  anchorDateIso: string;
  accounts: ApBalanceSheetAnchorAccount[];
};

const INFOR_CSI_AP_ANCHOR_12_31_2023: ApBalanceSheetAnchorConfig = {
  anchorDateIso: '2023-12-31',
  accounts: [
    {
      accountId: '30100',
      accountNumber: '30100',
      accountName: 'Accounts Payable',
      apBalance: 697_929.58,
    },
  ],
};

const AP_BALANCE_SHEET_ANCHORS: Record<string, ApBalanceSheetAnchorConfig> = {
  cmmnwyofv000fqhp4z8lebbny: INFOR_CSI_AP_ANCHOR_12_31_2023,
  cmmcp278j0002kz0439rlixdj: INFOR_CSI_AP_ANCHOR_12_31_2023,
};

export function getApBalanceSheetAnchorConfig(companyId: string): ApBalanceSheetAnchorConfig | null {
  return AP_BALANCE_SHEET_ANCHORS[companyId] ?? null;
}
