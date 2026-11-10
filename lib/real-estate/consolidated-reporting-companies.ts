/**
 * Companies whose Financial Reporting is the consolidated SLN + BGAH entity
 * financials instead of their accounting-system books. For these companies
 * QuickBooks Desktop keeps feeding Daily Financials and the entity account
 * lines, but only the consolidated publish writes MonthlyFinancial.
 */
const CONSOLIDATED_REPORTING_COMPANY_IDS = new Set([
  'cmvzrhzis0000kw08conjfsll', // Benns Grant
]);

/**
 * GAAP book value of land contributed by members, from the month the deeds
 * transferred. QuickBooks carries it at the contributors' tax carryover basis
 * (and may record it later); the consolidated book statements carry it at the
 * Operating Agreement's agreed value, with the same increase to contributed
 * capital.
 */
export type ContributedLand = { bookValue: number; fromMonth: string };
const CONTRIBUTED_LAND: Record<string, ContributedLand> = {
  // Morgan and Turner, $1.8M each (Exhibit A); deeds transferred at the June 2022 loan closing.
  cmvzrhzis0000kw08conjfsll: { bookValue: 3_600_000, fromMonth: '2022-06' },
};

export const CONSOLIDATED_FINANCIALS_SOURCE = 'consolidated-entity-financials';

export const isConsolidatedReportingCompany = (companyId: string | null | undefined) =>
  CONSOLIDATED_REPORTING_COMPANY_IDS.has(String(companyId || ''));

export const contributedLand = (companyId: string | null | undefined): ContributedLand | null =>
  CONTRIBUTED_LAND[String(companyId || '')] ?? null;
