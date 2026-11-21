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

/**
 * GAAP amortization of debt issuance costs (ASC 835-30): the costs are carried
 * as a reduction of the loan and amortized into interest expense straight-line
 * through the last month of the loan term.
 */
export type DebtIssuanceTerm = { termEndMonth: string; source: string };
const DEBT_ISSUANCE: Record<string, DebtIssuanceTerm> = {
  // Virginia Housing loan fees: 420 months from January 2024 (2024 Form 4562, Part VI).
  cmvzrhzis0000kw08conjfsll: { termEndMonth: '2058-12', source: '420-month loan term from January 2024 (2024 Form 4562, Part VI)' },
};

export const CONSOLIDATED_FINANCIALS_SOURCE = 'consolidated-entity-financials';

export const isConsolidatedReportingCompany = (companyId: string | null | undefined) =>
  CONSOLIDATED_REPORTING_COMPANY_IDS.has(String(companyId || ''));

export const contributedLand = (companyId: string | null | undefined): ContributedLand | null =>
  CONTRIBUTED_LAND[String(companyId || '')] ?? null;

export const debtIssuanceTerm = (companyId: string | null | undefined): DebtIssuanceTerm | null =>
  DEBT_ISSUANCE[String(companyId || '')] ?? null;
