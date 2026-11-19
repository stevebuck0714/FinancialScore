import { resolveDfsColumnsForTargetField, signForDfsColumn } from '@/lib/financial/daily-bs-from-gl';

export type DailyAccountDetailRow = {
  targetField: string;
  accountName: string;
  valuesByDate: Record<string, number>;
};

export type DailyAccountDetail = {
  asOf: string;
  rows: DailyAccountDetailRow[];
};

export function displayAccountName(fullName: string, accountNumber?: string | null) {
  const name = fullName.replace(/&#183;/g, '·').replace(/:/g, ' › ');
  return accountNumber ? `${accountNumber} · ${name}` : name;
}

const PNL_DETAIL_FIELDS = new Set([
  'revenue',
  'cogsTotal',
  'expense',
  'payroll',
  'ownerBasePay',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'taxLicense',
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
  'stateIncomeTaxes',
  'federalIncomeTaxes',
]);

/**
 * The income-statement line an account's activity is listed under, plus the
 * sign that turns debit-positive GL activity into that line's natural sign.
 * Revenue and COGS accounts sit under their totals; operating expense
 * subcategories sit under their own line. Null for balance-sheet targets.
 */
export function incomeDetailLineForTarget(targetField: string): { field: string; sign: number } | null {
  const columns = resolveDfsColumnsForTargetField(targetField);
  if (!columns.length) return null;
  const field = columns.includes('revenue')
    ? 'revenue'
    : columns.includes('cogsTotal')
      ? 'cogsTotal'
      : columns[columns.length - 1];
  if (!PNL_DETAIL_FIELDS.has(field)) return null;
  return { field, sign: signForDfsColumn(field) };
}

export function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
