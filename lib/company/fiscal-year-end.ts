export const FISCAL_YEAR_END_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** The company's fiscal year-end month (1–12); December when not set. */
export function companyFiscalYearEndMonth(value: unknown): number {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 12;
}

export function fiscalYearEndLabel(value: unknown): string {
  return FISCAL_YEAR_END_MONTHS[companyFiscalYearEndMonth(value) - 1];
}
