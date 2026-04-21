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

/**
 * Per-company allowlist of GL accounts that should be treated as cash on the
 * Operational Performance → Cash → Cash Position chart and bank-account table.
 *
 * For tenants whose `CashSnapshot` table contains non-cash GL accounts (e.g.
 * Other Current Assets, prepaids, contra-assets that got tagged as cash by
 * the source mapping), this allowlist filters the API output so only the
 * actual operating-cash accounts contribute to the displayed totals.
 *
 * Matching is by exact accountId or accountNumber. Account names are
 * informational only; renames in the source ERP do not break matching.
 */
export type CashAccountAllowlist = {
  /** GL account numbers/ids that ARE cash for the cash position chart. */
  accountNumbers: string[];
};

const ATLANTIC_PRECISION_CASH_ALLOWLIST: CashAccountAllowlist = {
  accountNumbers: [
    '10100', // Cash - Atlantic Union Bank
    '10150', // Cash - National Bank
    '10200', // Money Market Account
    '10250', // Money Market Account - NB
    '10400', // Checking - Flex Spending
    '10450', // Flex Spending - FCB
  ],
};

const CASH_ACCOUNT_ALLOWLISTS: Record<string, CashAccountAllowlist> = {
  // Infor CSI — prod (Atlantic Precision Resource)
  cmmcp278j0002kz0439rlixdj: ATLANTIC_PRECISION_CASH_ALLOWLIST,
  // Infor CSI — dev
  cmmnwyofv000fqhp4z8lebbny: ATLANTIC_PRECISION_CASH_ALLOWLIST,
};

export function getCashAccountAllowlist(companyId: string): CashAccountAllowlist | null {
  return CASH_ACCOUNT_ALLOWLISTS[companyId] ?? null;
}

/**
 * Returns a Set of normalized allowlist tokens (trimmed, non-empty)
 * for fast membership tests, or null when the company has no allowlist.
 */
export function getCashAccountAllowlistSet(companyId: string): Set<string> | null {
  const cfg = getCashAccountAllowlist(companyId);
  if (!cfg) return null;
  const set = new Set<string>();
  for (const raw of cfg.accountNumbers) {
    const v = String(raw || '').trim();
    if (v) set.add(v);
  }
  return set.size > 0 ? set : null;
}

/**
 * True when the given snapshot/movement row matches the company's cash
 * account allowlist. When no allowlist is provided, returns true (no-op).
 */
export function isAllowedCashAccount(
  record: {
    accountId?: string | null;
    accountNumber?: string | null;
    sourceAccountId?: string | null;
  },
  allowlist: Set<string> | null
): boolean {
  if (!allowlist) return true;
  const candidates = [record.accountId, record.accountNumber, record.sourceAccountId];
  for (const c of candidates) {
    if (c == null) continue;
    const v = String(c).trim();
    if (v && allowlist.has(v)) return true;
  }
  return false;
}
