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
  cogsPayroll: 'Payroll',
  cogsOwnerPay: 'Owner Pay',
  cogsContractors: 'Contractors',
  cogsMaterials: 'Materials',
  cogsCommissions: 'Commissions',
  cogsOther: 'Other',
  cogsTotal: 'Total COGS',
  
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
  nonOperatingExpense: 'Non-Operating Expense',
  
  // Income Taxes (non-operating)
  stateIncomeTaxes: 'State Income Taxes',
  federalIncomeTaxes: 'Federal Income Taxes',
  nonOperatingIncome: 'Non-Operating Income',
  
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
  loc: 'Line of Credit',
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
  const mapped = FIELD_DISPLAY_NAMES[fieldName];
  if (mapped) return mapped;

  if (fieldName.startsWith('rev_')) {
    return fieldName
      .replace(/^rev_/, '')
      .split('_')
      .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' ');
  }

  if (fieldName.startsWith('cogs_')) {
    const label = fieldName
      .replace(/^cogs_/, '')
      .split('_')
      .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' ');
    return label;
  }

  return fieldName;
}

