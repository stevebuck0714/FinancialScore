type JsonObject = Record<string, unknown> | null;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const MONTHLY_FINANCIAL_NUMERIC_FIELDS = [
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
  'extraordinaryItems',
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

type MonthlyNumericField = (typeof MONTHLY_FINANCIAL_NUMERIC_FIELDS)[number];

export type CanonicalMonthlyFinancial = {
  monthDate: Date;
  revenueBreakdown: JsonObject;
  expenseBreakdown: JsonObject;
  cogsBreakdown: JsonObject;
  lobBreakdowns: JsonObject;
} & Record<MonthlyNumericField, number>;

export function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .replace(/\(([^)]+)\)/, '-$1');
    if (!normalized) return 0;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toJsonValue(value: JsonObject): JsonValue {
  return (value ?? null) as JsonValue;
}

export function toCanonicalMonthlyFinancial(input: {
  monthDate: Date;
  revenueBreakdown?: unknown;
  expenseBreakdown?: unknown;
  cogsBreakdown?: unknown;
  lobBreakdowns?: unknown;
  [key: string]: unknown;
}): CanonicalMonthlyFinancial {
  const numeric = MONTHLY_FINANCIAL_NUMERIC_FIELDS.reduce((acc, field) => {
    acc[field] = toFiniteNumber(input[field]);
    return acc;
  }, {} as Record<MonthlyNumericField, number>);

  return {
    monthDate: input.monthDate,
    revenueBreakdown: toJsonObject(input.revenueBreakdown),
    expenseBreakdown: toJsonObject(input.expenseBreakdown),
    cogsBreakdown: toJsonObject(input.cogsBreakdown),
    lobBreakdowns: toJsonObject(input.lobBreakdowns),
    ...numeric,
  };
}

export function toMonthlyFinancialCreateInput(
  companyId: string,
  financialRecordId: string,
  row: CanonicalMonthlyFinancial,
) {
  return {
    companyId,
    financialRecordId,
    monthDate: row.monthDate,
    revenue: row.revenue,
    revenueBreakdown: toJsonValue(row.revenueBreakdown),
    expense: row.expense,
    expenseBreakdown: toJsonValue(row.expenseBreakdown),
    cogsPayroll: row.cogsPayroll,
    cogsOwnerPay: row.cogsOwnerPay,
    cogsContractors: row.cogsContractors,
    cogsMaterials: row.cogsMaterials,
    cogsCommissions: row.cogsCommissions,
    cogsOther: row.cogsOther,
    cogsTotal: row.cogsTotal,
    cogsBreakdown: toJsonValue(row.cogsBreakdown),
    payroll: row.payroll,
    ownerBasePay: row.ownerBasePay,
    benefits: row.benefits,
    insurance: row.insurance,
    professionalFees: row.professionalFees,
    subcontractors: row.subcontractors,
    rent: row.rent,
    taxLicense: row.taxLicense,
    stateIncomeTaxes: row.stateIncomeTaxes,
    federalIncomeTaxes: row.federalIncomeTaxes,
    phoneComm: row.phoneComm,
    infrastructure: row.infrastructure,
    autoTravel: row.autoTravel,
    salesExpense: row.salesExpense,
    marketing: row.marketing,
    trainingCert: row.trainingCert,
    mealsEntertainment: row.mealsEntertainment,
    interestExpense: row.interestExpense,
    depreciationAmortization: row.depreciationAmortization,
    otherExpense: row.otherExpense,
    nonOperatingIncome: row.nonOperatingIncome,
    extraordinaryItems: row.extraordinaryItems,
    lobBreakdowns: toJsonValue(row.lobBreakdowns),
    cash: row.cash,
    ar: row.ar,
    inventory: row.inventory,
    otherCA: row.otherCA,
    tca: row.tca,
    fixedAssets: row.fixedAssets,
    otherAssets: row.otherAssets,
    totalAssets: row.totalAssets,
    ap: row.ap,
    loc: row.loc,
    otherCL: row.otherCL,
    tcl: row.tcl,
    ltd: row.ltd,
    totalLiab: row.totalLiab,
    ownersCapital: row.ownersCapital,
    ownersDraw: row.ownersDraw,
    commonStock: row.commonStock,
    preferredStock: row.preferredStock,
    retainedEarnings: row.retainedEarnings,
    additionalPaidInCapital: row.additionalPaidInCapital,
    treasuryStock: row.treasuryStock,
    totalEquity: row.totalEquity,
    totalLAndE: row.totalLAndE,
  };
}

export function buildMasterDataRows(rows: CanonicalMonthlyFinancial[]) {
  return rows.map((row) => ({
    date: row.monthDate.toISOString().split('T')[0],
    ...row,
    revenueBreakdown: row.revenueBreakdown,
    expenseBreakdown: row.expenseBreakdown,
    cogsBreakdown: row.cogsBreakdown,
    lobBreakdowns: row.lobBreakdowns,
    ...(row.revenueBreakdown || {}),
    ...(row.cogsBreakdown || {}),
  }));
}

export function findZeroRevenueAnomalies(
  rows: Array<Pick<CanonicalMonthlyFinancial, 'monthDate' | 'revenue' | 'cogsTotal' | 'expense'>>,
) {
  return rows
    .filter((row) => row.revenue === 0 && (row.cogsTotal > 0 || row.expense > 0))
    .map((row) => ({
      month: `${row.monthDate.getFullYear()}-${String(row.monthDate.getMonth() + 1).padStart(2, '0')}`,
      revenue: row.revenue,
      cogsTotal: row.cogsTotal,
      expense: row.expense,
    }));
}
