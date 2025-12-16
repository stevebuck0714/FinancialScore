/**
 * Trial Balance CSV Parser
 * 
 * Parses CSV files in the format:
 * Acct Type, Acct ID, Description, Date1, Date2, Date3, ...
 * 
 * Account types supported (matching QB types):
 * - Bank, AccountsReceivable, OtherCurrentAsset, FixedAsset, OtherAsset
 * - AccountsPayable, CreditCard, OtherCurrentLiability, LongTermLiability
 * - Equity, Income, CostOfGoodsSold, Expense
 */

import { applyLOBAllocations } from './lob-allocator';

export interface TrialBalanceAccount {
  acctType: string;
  acctId: string;
  description: string;
  values: { [date: string]: number };
}

export interface ParsedTrialBalance {
  accounts: TrialBalanceAccount[];
  dates: string[];  // Column headers (dates)
  accountsByType: { [type: string]: TrialBalanceAccount[] };
  syncDate: string;
  _companyId?: string;
  _source: 'csv-trial-balance';
}

// Map CSV account types to our classification categories
export const ACCOUNT_TYPE_CLASSIFICATIONS: { [key: string]: string } = {
  // Assets
  'Bank': 'Asset',
  'AccountsReceivable': 'Asset',
  'OtherCurrentAsset': 'Asset',
  'FixedAsset': 'Asset',
  'OtherAsset': 'Asset',
  
  // Liabilities
  'AccountsPayable': 'Liability',
  'CreditCard': 'Liability',
  'OtherCurrentLiability': 'Liability',
  'LongTermLiability': 'Liability',
  
  // Equity
  'Equity': 'Equity',
  
  // Revenue
  'Income': 'Revenue',
  
  // Expenses
  'CostOfGoodsSold': 'Cost of Goods Sold',
  'Expense': 'Expense',
};

// Map account types to target field categories for auto-mapping
export const ACCOUNT_TYPE_TO_TARGET_FIELD: { [key: string]: string } = {
  'Bank': 'cash',
  'AccountsReceivable': 'ar',
  'OtherCurrentAsset': 'otherCA',
  'FixedAsset': 'fixedAssets',
  'OtherAsset': 'otherAssets',
  'AccountsPayable': 'ap',
  'CreditCard': 'otherCL',
  'OtherCurrentLiability': 'otherCL',
  'LongTermLiability': 'ltd',
  'Equity': 'totalEquity',
  'Income': 'revenue',
  'CostOfGoodsSold': 'cogsTotal',
  'Expense': 'expense',
};

/**
 * Parse a number from a CSV value (handles commas, quotes, negative numbers, accounting parentheses)
 */
function parseNumber(value: string | undefined): number {
  if (!value || value === '' || value === null || value === undefined) return 0;
  
  // Convert to string and remove quotes, dollar signs, and whitespace
  let cleaned = String(value).replace(/["$\s]/g, '').trim();
  
  if (cleaned === '' || cleaned === '0') return 0;
  
  // Check for accounting format negative numbers with parentheses: (1000.00)
  let isNegative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    // Remove parentheses
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove commas
  cleaned = cleaned.replace(/,/g, '');
  
  // Handle explicit negative sign
  if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }
  
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  
  return isNegative ? -num : num;
}

/**
 * Parse a date from column header
 * Supports formats: "12/31/2022", "1/31/2023", "Dec 2022", etc.
 */
function parseColumnDate(header: string): Date | null {
  if (!header) return null;
  
  const trimmed = header.trim();
  
  // Try MM/DD/YYYY format
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // Try YYYY-MM-DD format
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // Try "Mon YYYY" format
  const monthYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const [, monthName, year] = monthYearMatch;
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(parseInt(year), monthIndex, 1);
    }
  }
  
  return null;
}

/**
 * Main parser function for Trial Balance CSV
 */
export function parseTrialBalanceCSV(csvContent: string, companyId?: string): ParsedTrialBalance {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }
  
  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  // Expected format: Acct Type, Acct ID, Description, Date1, Date2, ...
  if (headers.length < 4) {
    throw new Error('CSV must have at least 4 columns: Acct Type, Acct ID, Description, and at least one date column');
  }
  
  // Extract date columns (columns after the first 3)
  const dates = headers.slice(3).map(h => h.trim());
  
  const accounts: TrialBalanceAccount[] = [];
  const accountsByType: { [type: string]: TrialBalanceAccount[] } = {};
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);
    
    // Skip empty rows or rows without account type
    const acctType = values[0]?.trim();
    if (!acctType) continue;
    
    const acctId = values[1]?.trim() || '';
    const description = values[2]?.trim() || '';
    
    // Skip if no description (likely a separator row)
    if (!description) continue;
    
    // Parse values for each date column
    const dateValues: { [date: string]: number } = {};
    for (let j = 0; j < dates.length; j++) {
      const date = dates[j];
      const value = parseNumber(values[j + 3]);
      dateValues[date] = value;
    }
    
    const account: TrialBalanceAccount = {
      acctType,
      acctId,
      description,
      values: dateValues,
    };
    
    accounts.push(account);
    
    // Group by type
    if (!accountsByType[acctType]) {
      accountsByType[acctType] = [];
    }
    accountsByType[acctType].push(account);
  }
  
  return {
    accounts,
    dates,
    accountsByType,
    syncDate: new Date().toISOString(),
    _companyId: companyId,
    _source: 'csv-trial-balance',
  };
}

/**
 * Parse a single CSV line, handling quoted values with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Don't forget the last field
  result.push(current.trim());
  
  return result;
}

/**
 * Convert parsed trial balance to format compatible with Data Mapping UI
 * Returns accounts array suitable for AI mapping
 */
export function getAccountsForMapping(parsedData: ParsedTrialBalance): Array<{ name: string; classification: string; acctType: string; acctId: string }> {
  const accountsForMapping: Array<{ name: string; classification: string; acctType: string; acctId: string }> = [];
  
  for (const account of parsedData.accounts) {
    const classification = ACCOUNT_TYPE_CLASSIFICATIONS[account.acctType] || 'Unknown';
    
    accountsForMapping.push({
      name: account.description,
      classification,
      acctType: account.acctType,
      acctId: account.acctId,
    });
  }
  
  return accountsForMapping;
}

/**
 * Process mapped trial balance data into monthly financial records
 */
export function processTrialBalanceToMonthly(
  parsedData: ParsedTrialBalance,
  accountMappings: Array<{ qbAccount: string; targetField: string; lobAllocations?: any }>
): any[] {
  const monthlyRecords: any[] = [];
  
  // Normalize account names for better matching (trim, lowercase, normalize whitespace)
  const normalizeAccountName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Count mappings with LOB allocations for validation
  const mappingsWithLOB = accountMappings.filter(m => 
    m.lobAllocations && typeof m.lobAllocations === 'object' && Object.keys(m.lobAllocations).length > 0
  );
  
  // Create a mapping lookup with normalized keys for better matching
  const mappingLookup: { [accountName: string]: { targetField: string; lobAllocations?: any } } = {};
  
  for (const mapping of accountMappings) {
    const normalizedKey = normalizeAccountName(mapping.qbAccount);
    mappingLookup[normalizedKey] = {
      targetField: mapping.targetField,
      lobAllocations: mapping.lobAllocations,
    };
    // Also keep the original key for backwards compatibility
    mappingLookup[mapping.qbAccount] = {
      targetField: mapping.targetField,
      lobAllocations: mapping.lobAllocations,
    };
  }
  
  console.log('📋 Mapping lookup keys:', Object.keys(mappingLookup));
  
  // Process each date column
  for (const dateStr of parsedData.dates) {
    const parsedDate = parseColumnDate(dateStr);
    if (!parsedDate) continue;
    
    // Initialize monthly record with all fields at 0
    // Must include ALL fields that users can map to in the UI
    const monthlyRecord: any = {
      monthDate: parsedDate.toISOString(), // ISO string for JSON serialization
      date: parsedDate,
      month: parsedDate.toISOString().substring(0, 7), // YYYY-MM format
      
      // Income Statement - Revenue
      revenue: 0,
      
      // COGS fields
      cogsPayroll: 0,
      cogsOwnerPay: 0,
      cogsContractors: 0,
      cogsMaterials: 0,
      cogsCommissions: 0,
      cogsOther: 0,
      cogsTotal: 0,
      
      // Operating Expenses - use database field names
      payroll: 0,
      ownerBasePay: 0,
      benefits: 0,
      insurance: 0,
      professionalFees: 0,
      subcontractors: 0,
      rent: 0,
      taxLicense: 0,
      phoneComm: 0,
      infrastructure: 0,
      autoTravel: 0,
      salesExpense: 0,
      marketing: 0,
      trainingCert: 0,
      mealsEntertainment: 0,
      interestExpense: 0,
      depreciationAmortization: 0,
      otherExpense: 0,
      expense: 0,           // catch-all for unmapped expenses
      
      // Other Income/Expense
      nonOperatingIncome: 0,
      extraordinaryItems: 0,
      
      // Balance Sheet - Assets
      cash: 0,
      ar: 0,
      inventory: 0,
      otherCA: 0,
      tca: 0,
      fixedAssets: 0,
      otherAssets: 0,
      totalAssets: 0,
      
      // Balance Sheet - Liabilities
      ap: 0,
      otherCL: 0,
      tcl: 0,
      ltd: 0,
      totalLiab: 0,
      
      // Balance Sheet - Equity (detailed fields)
      ownersCapital: 0,
      ownersDraw: 0,
      commonStock: 0,
      preferredStock: 0,
      retainedEarnings: 0,
      additionalPaidInCapital: 0,
      treasuryStock: 0,
      totalEquity: 0,
      totalLAndE: 0,
    };
    
    // Build account values for LOB allocation processing
    const accountValues: Array<{ accountName: string; accountId: string; value: number }> = [];
    
    // Sum up values based on mappings AND collect account values for LOB processing
    for (const account of parsedData.accounts) {
      // Try exact match first, then normalized match
      let mapping = mappingLookup[account.description];
      if (!mapping) {
        const normalizedName = normalizeAccountName(account.description);
        mapping = mappingLookup[normalizedName];
        if (mapping) {
          console.log(`✅ Mapped via normalized key: "${account.description}" → "${normalizedName}" → ${mapping.targetField}`);
        }
      }
      
      const value = account.values[dateStr] || 0;

      if (mapping && mapping.targetField && value !== 0) {
        // Add to the target field
        if (monthlyRecord[mapping.targetField] !== undefined) {
          monthlyRecord[mapping.targetField] += value;
          if (mapping.targetField === 'additionalPaidInCapital') {
            console.log(`💰 Added ${value} to additionalPaidInCapital for ${dateStr}`);
          }
        }

        // Collect account value for LOB allocation
        accountValues.push({
          accountName: account.description,
          accountId: account.acctId,
          value: value
        });
      } else if (!mapping) {
        // Use default mapping based on account type
        const defaultField = ACCOUNT_TYPE_TO_TARGET_FIELD[account.acctType];
        if (defaultField && monthlyRecord[defaultField] !== undefined) {
          monthlyRecord[defaultField] += value;
        }
      } else if (mapping && value === 0) {
        // Log when we have a mapping but the value is zero
        if (mapping.targetField === 'additionalPaidInCapital') {
          console.log(`⚠️ Skipping "${account.description}" → additionalPaidInCapital because value is 0 for ${dateStr}`);
        }
      }
    }
    
    // Calculate totals
    // COGS total (only add cogsTotal if it wasn't directly mapped)
    const cogsFromComponents = monthlyRecord.cogsPayroll + monthlyRecord.cogsOwnerPay +
      monthlyRecord.cogsContractors + monthlyRecord.cogsMaterials +
      monthlyRecord.cogsCommissions + monthlyRecord.cogsOther;
    if (cogsFromComponents > 0) {
      monthlyRecord.cogsTotal = cogsFromComponents;
    }
    
    // Current Assets total
    monthlyRecord.tca = monthlyRecord.cash + monthlyRecord.ar + monthlyRecord.inventory + monthlyRecord.otherCA;
    monthlyRecord.totalAssets = monthlyRecord.tca + monthlyRecord.fixedAssets + monthlyRecord.otherAssets;
    
    // Liabilities total
    monthlyRecord.tcl = monthlyRecord.ap + monthlyRecord.otherCL;
    monthlyRecord.totalLiab = monthlyRecord.tcl + monthlyRecord.ltd;
    
    // Equity total (sum of detailed equity fields if not directly mapped)
    const equityFromComponents = monthlyRecord.ownersCapital + monthlyRecord.commonStock + 
      monthlyRecord.preferredStock + monthlyRecord.retainedEarnings + 
      monthlyRecord.additionalPaidInCapital - monthlyRecord.treasuryStock - monthlyRecord.ownersDraw;
    if (equityFromComponents !== 0 && monthlyRecord.totalEquity === 0) {
      monthlyRecord.totalEquity = equityFromComponents;
    }
    
    monthlyRecord.totalLAndE = monthlyRecord.totalLiab + monthlyRecord.totalEquity;
    
    // Apply LOB allocations if we have account mappings with LOB data
    if (accountValues.length > 0 && accountMappings.length > 0) {
      // For trial balance imports, we don't have company context yet
      // TODO: Pass company context when available
      const lobData = applyLOBAllocations(accountValues, accountMappings);
      
      // Store LOB breakdowns in the monthly record
      monthlyRecord.lobBreakdowns = lobData.breakdowns || null;
      monthlyRecord.revenueBreakdown = lobData.revenueBreakdown || null;
      monthlyRecord.expenseBreakdown = lobData.expenseBreakdown || null;
      monthlyRecord.cogsBreakdown = lobData.cogsBreakdown || null;
    }
    
    monthlyRecords.push(monthlyRecord);
  }
  
  // Sort by date
  monthlyRecords.sort((a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime());
  
  return monthlyRecords;
}

