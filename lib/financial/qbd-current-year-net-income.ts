function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function qbdEquityWithoutNetIncome(row: Record<string, unknown> | null | undefined): number {
  return (
    toNumber(row?.ownersCapital) +
    toNumber(row?.ownersDraw) +
    toNumber(row?.commonStock) +
    toNumber(row?.preferredStock) +
    toNumber(row?.retainedEarnings) +
    toNumber(row?.additionalPaidInCapital) +
    toNumber(row?.treasuryStock)
  );
}

/**
 * QBD retained earnings exclude current-year NI. Current Year Net Income on the
 * balance sheet must be the residual that makes Assets = L&E. Using P&L YTD
 * instead is what throws Data Review out of balance when the income statement
 * is incomplete or mis-mapped.
 */
export function qbdCurrentYearNetIncomeFromBalanceSheet(
  row: Record<string, unknown> | null | undefined,
  pnlYtd = 0,
): number {
  const assets = toNumber(row?.totalAssets);
  const liab = toNumber(row?.totalLiab);
  if (assets === 0 && liab === 0) return pnlYtd;
  return assets - liab - qbdEquityWithoutNetIncome(row);
}
