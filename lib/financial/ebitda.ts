/**
 * The application-standard EBITDA calculation.
 *
 * `expense` is the P&L expense rollup and includes interest expense and
 * depreciation/amortization. Income-tax accounts must be mapped to their
 * dedicated fields and excluded from that rollup during financial ingestion.
 */
export type EbitdaFinancials = {
  revenue?: number | null;
  cogsTotal?: number | null;
  expense?: number | null;
  interestExpense?: number | null;
  depreciationAmortization?: number | null;
};

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function calculateEbitda(financials: EbitdaFinancials): number {
  return (
    toNumber(financials.revenue) -
    toNumber(financials.cogsTotal) -
    toNumber(financials.expense) +
    toNumber(financials.interestExpense) +
    toNumber(financials.depreciationAmortization)
  );
}

export function calculateEbitdaMargin(financials: EbitdaFinancials): number {
  const revenue = toNumber(financials.revenue);
  return revenue === 0 ? 0 : calculateEbitda(financials) / revenue;
}
