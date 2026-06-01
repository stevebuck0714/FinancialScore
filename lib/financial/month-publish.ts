export const PNL_SUM_FIELDS = [
  'revenue',
  'expense',
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
  'cogsTotal',
  'payroll',
  'ownerBasePay',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'taxLicense',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
  'phoneComm',
  'infrastructure',
  'autoTravel',
  'salesExpense',
  'marketing',
  'trainingCert',
  'mealsEntertainment',
  'interestExpense',
  'depreciationAmortization',
  'otherExpense',
  'nonOperatingIncome',
  'nonOperatingExpense',
  'extraordinaryItems',
] as const;

export const BS_LAST_DAY_FIELDS = [
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalLAndE',
] as const;

export function safeNumber(input: unknown): number {
  const value = Number(input ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * UTC end-of-month for `date`. Always returns the last instant
 * (23:59:59.999) of the UTC calendar month containing `date`.
 *
 * Local-TZ accessors are intentionally NOT used: writers running on
 * Vercel (UTC) and writers running on a developer laptop (PT/MT/CT/ET)
 * must produce the same `monthStart`/`monthEnd` pair so MonthlyFinancial
 * and FinancialMonthPublish never disagree about which calendar month a
 * snapshot belongs to. See lib/date-utils.ts for the broader rule.
 */
export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/**
 * Parse a "YYYY-MM" string into UTC start- and end-of-month Date instants.
 * Output is always UTC midnight on the 1st and 23:59:59.999 UTC on the
 * last day. See `endOfMonth` above for why this must not use local TZ.
 */
export function parseMonthInput(month: string): { monthStart: Date; monthEnd: Date } | null {
  if (!/^\d{4}-\d{2}$/.test((month || '').trim())) return null;
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const monthEnd = endOfMonth(monthStart);
  return { monthStart, monthEnd };
}
