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
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
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

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function parseMonthInput(month: string): { monthStart: Date; monthEnd: Date } | null {
  if (!/^\d{4}-\d{2}$/.test((month || '').trim())) return null;
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = endOfMonth(monthStart);
  return { monthStart, monthEnd };
}
