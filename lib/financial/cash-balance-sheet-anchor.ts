/**
 * Optional balance-sheet anchors for daily cash reconstruction (GL movement roll-forward).
 * Keys must match Company.id. Amounts are book (debit-normal) cash balances.
 */
export type CashBalanceSheetAnchorAccount = {
  /** GL account id/code — should match sourceAccountId on mapped GL lines for stable keys. */
  accountId: string;
  accountNumber: string;
  accountName: string;
  cashBalance: number;
};

export type CashBalanceSheetAnchorConfig = {
  /** ISO calendar date of the closed balance sheet (e.g. year-end). */
  anchorDateIso: string;
  accounts: CashBalanceSheetAnchorAccount[];
};

const INFOR_CSI_CASH_ANCHOR_12_31_2023: CashBalanceSheetAnchorConfig = {
  anchorDateIso: '2023-12-31',
  accounts: [
    { accountId: '10100', accountNumber: '10100', accountName: 'Cash - American National Bank', cashBalance: 11486.31 },
    { accountId: '10150', accountNumber: '10150', accountName: 'Cash - FCB', cashBalance: 50000 },
    { accountId: '10200', accountNumber: '10200', accountName: 'Money Market Account', cashBalance: 145530.52 },
    { accountId: '10400', accountNumber: '10400', accountName: 'Checking - Flex Spending', cashBalance: 204.78 },
    { accountId: '10450', accountNumber: '10450', accountName: 'Flex Spending - FCB', cashBalance: 2816.22 },
  ],
};

const CASH_BALANCE_SHEET_ANCHORS: Record<string, CashBalanceSheetAnchorConfig> = {
  // Infor CSI — prod
  cmmcp278j0002kz0439rlixdj: INFOR_CSI_CASH_ANCHOR_12_31_2023,
  // Infor CSI — dev
  cmmnwyofv000fqhp4z8lebbny: INFOR_CSI_CASH_ANCHOR_12_31_2023,
};

export function getCashBalanceSheetAnchorConfig(companyId: string): CashBalanceSheetAnchorConfig | null {
  return CASH_BALANCE_SHEET_ANCHORS[companyId] ?? null;
}
