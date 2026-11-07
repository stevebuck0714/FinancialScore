/**
 * Companies whose Financial Reporting is the consolidated SLN + BGAH entity
 * financials instead of their accounting-system books. For these companies
 * QuickBooks Desktop keeps feeding Daily Financials and the entity account
 * lines, but only the consolidated publish writes MonthlyFinancial.
 */
const CONSOLIDATED_REPORTING_COMPANY_IDS = new Set([
  'cmvzrhzis0000kw08conjfsll', // Benns Grant
]);

export const CONSOLIDATED_FINANCIALS_SOURCE = 'consolidated-entity-financials';

export const isConsolidatedReportingCompany = (companyId: string | null | undefined) =>
  CONSOLIDATED_REPORTING_COMPANY_IDS.has(String(companyId || ''));
