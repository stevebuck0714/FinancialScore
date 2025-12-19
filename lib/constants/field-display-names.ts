/**
 * Centralized mapping of database field names to user-friendly display names.
 * 
 * This is the single source of truth for how account names appear in all financial reports.
 * All income statements, balance sheets, and other reports should use this mapping
 * to ensure consistency across the application.
 * 
 * When adding new accounts:
 * 1. Add the field to the database schema (prisma/schema.prisma)
 * 2. Add the field to the API responses (app/api/master-data/route.ts, etc.)
 * 3. Add the field and display name here
 * 4. All reports will automatically use the correct display name
 */

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  // Revenue
  revenue: 'Total Revenue',
  
  // COGS
  cogsPayroll: 'COGS - Payroll',
  cogsOwnerPay: 'COGS - Owner Pay',
  cogsContractors: 'COGS - Contractors',
  cogsMaterials: 'COGS - Materials',
  cogsCommissions: 'COGS - Commissions',
  cogsOther: 'COGS - Other',
  cogsTotal: 'COGS - Total',
  
  // Calculated fields
  grossProfit: 'GROSS PROFIT',
  
  // Operating Expenses
  payroll: 'Payroll',
  ownerBasePay: 'Owner Base Pay',
  ownersRetirement: "Owner's Retirement",
  benefits: 'Benefits',
  insurance: 'Insurance',
  professionalFees: 'Professional Fees',
  subcontractors: 'Subcontractors',
  rent: 'Rent',
  taxLicense: 'Tax & License',
  phoneComm: 'Phone & Communication',
  infrastructure: 'Infrastructure/Utilities',
  autoTravel: 'Auto & Travel',
  salesExpense: 'Sales & Marketing',
  marketing: 'Marketing',
  trainingCert: 'Training & Certification',
  mealsEntertainment: 'Meals & Entertainment',
  interestExpense: 'Interest Expense',
  depreciationAmortization: 'Depreciation & Amortization',
  otherExpense: 'Other Expense',
  
  // Income Taxes (non-operating)
  stateIncomeTaxes: 'State Income Taxes',
  federalIncomeTaxes: 'Federal Income Taxes',
  
  // Calculated totals
  totalOperatingExpenses: 'Total Operating Expenses',
  incomeBeforeTax: 'INCOME BEFORE TAX',
  netIncome: 'NET INCOME',
  
  // Balance Sheet - Assets
  cash: 'Cash',
  ar: 'Accounts Receivable',
  inventory: 'Inventory',
  otherCA: 'Other Current Assets',
  tca: 'Total Current Assets',
  fixedAssets: 'Fixed Assets',
  otherAssets: 'Other Assets',
  totalAssets: 'TOTAL ASSETS',
  
  // Balance Sheet - Liabilities
  ap: 'Accounts Payable',
  otherCL: 'Other Current Liabilities',
  tcl: 'Total Current Liabilities',
  ltd: 'Long-term Debt',
  totalLiab: 'TOTAL LIABILITIES',
  
  // Balance Sheet - Equity
  ownersCapital: "Owner's Capital",
  ownersDraw: "Owner's Draw",
  commonStock: 'Common Stock',
  preferredStock: 'Preferred Stock',
  retainedEarnings: 'Retained Earnings',
  additionalPaidInCapital: 'Additional Paid-In Capital',
  treasuryStock: 'Treasury Stock',
  totalEquity: 'TOTAL EQUITY',
  totalLiabilitiesAndEquity: 'TOTAL LIABILITIES & EQUITY',
  
  // Section Headers
  costOfGoodsSold: 'COST OF GOODS SOLD',
  operatingExpenses: 'OPERATING EXPENSES',
  currentAssets: 'CURRENT ASSETS',
  currentLiabilities: 'CURRENT LIABILITIES',
  equity: 'EQUITY',
};

/**
 * Get the display name for a field.
 * Returns the field name itself if no mapping exists (for backwards compatibility).
 */
export function getFieldDisplayName(fieldName: string): string {
  return FIELD_DISPLAY_NAMES[fieldName] || fieldName;
}

/**
 * Get display names for multiple fields.
 */
export function getFieldDisplayNames(fieldNames: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  fieldNames.forEach(field => {
    result[field] = getFieldDisplayName(field);
  });
  return result;
}

