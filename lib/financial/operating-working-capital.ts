/**
 * Operating working capital excludes cash and financing balances. Liability
 * balances arrive from sources with either debit/credit sign convention, so
 * AP and accrued operating liabilities are normalized before subtraction.
 */
export function calculateOperatingWorkingCapital(values: {
  accountsReceivable?: unknown;
  inventory?: unknown;
  accountsPayable?: unknown;
  accruedOperatingLiabilities?: unknown;
}): number {
  const asNumber = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  return (
    asNumber(values.accountsReceivable) +
    asNumber(values.inventory) -
    Math.abs(asNumber(values.accountsPayable)) -
    Math.abs(asNumber(values.accruedOperatingLiabilities))
  );
}
