// @ts-nocheck
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
  'NonOperatingIncome': 'Non-Operating',
  'NonOperatingExpense': 'Non-Operating',
};

// Common Trial Balance exports contain non-QB labels. Normalize them to our canonical types.
const ACCOUNT_TYPE_ALIASES: { [key: string]: string } = {
  income: 'Income',
  revenue: 'Income',
  sales: 'Income',
  'income statement': 'Income',
  'other income': 'Income',

  cogs: 'CostOfGoodsSold',
  'cost of goods sold': 'CostOfGoodsSold',
  'cost of sales': 'CostOfGoodsSold',

  expense: 'Expense',
  expenses: 'Expense',
  'operating expense': 'Expense',
  'operating expenses': 'Expense',
  'non-operating income': 'NonOperatingIncome',
  'non operating income': 'NonOperatingIncome',
  'other expense': 'Expense',
  'other income': 'NonOperatingIncome',
  'non-operating expense': 'NonOperatingExpense',
  'non operating expense': 'NonOperatingExpense',

  bank: 'Bank',
  cash: 'Bank',
  'accounts receivable': 'AccountsReceivable',
  'other current asset': 'OtherCurrentAsset',
  'fixed asset': 'FixedAsset',
  'other asset': 'OtherAsset',

  'accounts payable': 'AccountsPayable',
  'credit card': 'CreditCard',
  'other current liability': 'OtherCurrentLiability',
  'long term liability': 'LongTermLiability',
  liability: 'OtherCurrentLiability',
  liabilities: 'OtherCurrentLiability',

  equity: 'Equity',
};

// Some exports collapse labels (e.g., "Costofgoodssold", "Accountsreceivable").
// Normalize those compact variants explicitly.
const ACCOUNT_TYPE_ALIASES_COMPACT: { [key: string]: string } = {
  income: 'Income',
  revenue: 'Income',
  sales: 'Income',
  incomestatement: 'Income',
  otherincome: 'Income',

  cogs: 'CostOfGoodsSold',
  costofgoodssold: 'CostOfGoodsSold',
  costofsales: 'CostOfGoodsSold',

  expense: 'Expense',
  expenses: 'Expense',
  operatingexpense: 'Expense',
  operatingexpenses: 'Expense',
  nonoperatingincome: 'NonOperatingIncome',
  otherincome: 'NonOperatingIncome',
  otherexpense: 'Expense',
  nonoperatingexpense: 'NonOperatingExpense',

  bank: 'Bank',
  cash: 'Bank',
  accountsreceivable: 'AccountsReceivable',
  othercurrentasset: 'OtherCurrentAsset',
  fixedasset: 'FixedAsset',
  otherasset: 'OtherAsset',

  accountspayable: 'AccountsPayable',
  creditcard: 'CreditCard',
  othercurrentliability: 'OtherCurrentLiability',
  longtermliability: 'LongTermLiability',
  liability: 'OtherCurrentLiability',
  liabilities: 'OtherCurrentLiability',

  equity: 'Equity',
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
  'NonOperatingIncome': 'nonOperatingIncome',
  'NonOperatingExpense': 'nonOperatingExpense',
};

function getAccountCode(acctId: string | undefined): number | null {
  const normalizedId = (acctId || '').trim();
  const codeMatch = normalizedId.match(/^(\d{4,})/);
  const accountCode = codeMatch ? Number(codeMatch[1]) : NaN;
  return Number.isFinite(accountCode) ? accountCode : null;
}

function is9000Series(acctId: string | undefined): boolean {
  const accountCode = getAccountCode(acctId);
  return accountCode !== null && accountCode >= 9000 && accountCode < 10000;
}

function isLikelyNonOperatingIncome(description: string, rawType?: string): boolean {
  const d = (description || '').toLowerCase();
  const t = (rawType || '').toLowerCase();
  return (
    d.includes('non-operating income') ||
    d.includes('non operating income') ||
    d.includes('other income') ||
    d.includes('gain') ||
    d.includes('interest income') ||
    d.includes('dividend income') ||
    d.includes('investment income') ||
    t.includes('income')
  );
}

function isLikelyNonOperatingExpense(description: string): boolean {
  const d = (description || '').toLowerCase();
  if (
    d.includes('non-operating expense') ||
    d.includes('non operating expense') ||
    d.includes('below the line expense') ||
    d.includes('other non-operating')
  ) {
    return true;
  }

  return false;
}

function normalizeAccountType(rawType: string | undefined, description: string, acctId?: string): string {
  const trimmed = (rawType || '').trim();

  // Company convention: 9000-series is reserved for non-operating items.
  // Split income vs expense deterministically using labels/type.
  // Cross-platform convention: 8010 is reserved for Non-Operating Income.
  const accountCode = getAccountCode(acctId);
  if (accountCode === 8010) {
    return 'NonOperatingIncome';
  }
  if (is9000Series(acctId)) {
    return isLikelyNonOperatingIncome(description, rawType) ? 'NonOperatingIncome' : 'NonOperatingExpense';
  }
  if (isLikelyNonOperatingIncome(description, rawType)) return 'NonOperatingIncome';
  if (isLikelyNonOperatingExpense(description)) return 'NonOperatingExpense';
  if (!trimmed) return inferAccountTypeFromDescription(description);

  // Keep canonical types untouched.
  if (ACCOUNT_TYPE_CLASSIFICATIONS[trimmed]) return trimmed;

  const normalizedKey = trimmed.toLowerCase().replace(/[_\s-]+/g, ' ');
  if (ACCOUNT_TYPE_ALIASES[normalizedKey]) {
    return ACCOUNT_TYPE_ALIASES[normalizedKey];
  }
  const compactKey = normalizedKey.replace(/[^a-z0-9]/g, '');
  if (ACCOUNT_TYPE_ALIASES_COMPACT[compactKey]) {
    return ACCOUNT_TYPE_ALIASES_COMPACT[compactKey];
  }

  // Heuristic fallback if CSV type is a verbose label.
  if (normalizedKey.includes('income') || normalizedKey.includes('revenue') || normalizedKey.includes('sales')) return 'Income';
  if (
    normalizedKey.includes('cost of goods') ||
    normalizedKey === 'cogs' ||
    normalizedKey.includes('cost of sales') ||
    compactKey.includes('costofgoods') ||
    compactKey === 'cogs'
  ) return 'CostOfGoodsSold';
  if (normalizedKey.includes('non operating expense') || compactKey.includes('nonoperatingexpense')) return 'NonOperatingExpense';
  if (normalizedKey.includes('expense')) return 'Expense';
  if (normalizedKey.includes('asset')) return 'OtherAsset';
  if (normalizedKey.includes('liabil')) return 'OtherCurrentLiability';
  if (normalizedKey.includes('equity') || normalizedKey.includes('capital')) return 'Equity';

  // Some exports place account names in Acct Type; infer from description instead of creating unknown pseudo-types.
  return inferAccountTypeFromDescription(description);
}

function inferAccountTypeFromDescription(description: string): string {
  const d = (description || '').toLowerCase();
  if (
    d.includes('non-operating income') ||
    d.includes('non operating income') ||
    d.includes('other income') ||
    d.includes('gain') ||
    d.includes('interest income') ||
    d.includes('dividend income') ||
    d.includes('investment income')
  ) return 'NonOperatingIncome';
  if (
    d.includes('non-operating expense') ||
    d.includes('non operating expense') ||
    d.includes('below the line expense') ||
    d.includes('other non-operating')
  ) return 'NonOperatingExpense';
  if (d.includes('income') || d.includes('revenue') || d.includes('sales')) return 'Income';
  if (d.includes('cost of goods') || d.includes('cogs') || d.includes('job material')) return 'CostOfGoodsSold';
  if (d.includes('accounts receivable')) return 'AccountsReceivable';
  if (d.includes('accounts payable')) return 'AccountsPayable';
  if (d.includes('cash') || d.includes('checking') || d.includes('savings')) return 'Bank';
  if (d.includes('equity') || d.includes('retained earnings') || d.includes('owner')) return 'Equity';
  if (d.includes('asset')) return 'OtherAsset';
  if (d.includes('liabil')) return 'OtherCurrentLiability';
  return 'Expense';
}

function shouldSkipAccountRow(acctType: string, acctId: string, description: string): boolean {
  const type = (acctType || '').trim().toLowerCase();
  const id = (acctId || '').trim().toLowerCase();
  const desc = (description || '').trim().toLowerCase();

  if (!desc) return true;

  // Ignore summary/subtotal rows that should not be mapped.
  if (
    desc.startsWith('total ') ||
    desc === 'total' ||
    desc === 'gross profit' ||
    desc === 'net income' ||
    desc === 'net profit' ||
    desc === 'ordinary income/expense'
  ) {
    return true;
  }

  // Skip rows where Acct ID is a known header/summary token.
  if (id === 'summary' || id === 'header' || id === 'subtotal') {
    return true;
  }

  // Skip non-account section rows occasionally exported as data lines.
  if (
    type === 'income statement' ||
    type === 'balance sheet' ||
    type === 'profit and loss' ||
    type === 'assets' ||
    type === 'liabilities'
  ) {
    return true;
  }

  return false;
}

function isLikelyNumericText(value: string | undefined): boolean {
  const v = (value || '').trim();
  if (!v) return false;
  const cleaned = v.replace(/[$,\s]/g, '');
  return /^-?\(?\d+(\.\d+)?\)?$/.test(cleaned);
}

function hasCreditMarker(value: string | undefined): boolean {
  const raw = (value || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  // Ignore generic "credit" wording and only detect accounting credit markers
  // attached to numeric amounts, e.g. "35,966.13 (CR)" or "35,966.13 CR".
  if (!/\d/.test(upper)) return false;
  return /\(\s*CR\s*\)/.test(upper) || /\bCR\b/.test(upper);
}

function rowHasCreditMarker(values: string[], dateColumnIndexes: number[]): boolean {
  for (const idx of dateColumnIndexes) {
    if (hasCreditMarker(values[idx])) return true;
  }
  return false;
}

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

  // Try MM/DD/YY format
  const mdyShortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShortMatch) {
    const [, month, day, year2] = mdyShortMatch;
    const year = parseInt(year2) + (parseInt(year2) >= 70 ? 1900 : 2000);
    return new Date(year, parseInt(month) - 1, parseInt(day));
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

  // Try "Mon-YY" / "Mon YYYY" / "Mon-YYYY" variants
  const monthDashYearMatch = trimmed.match(/^([A-Za-z]{3,9})[-\s](\d{2}|\d{4})$/);
  if (monthDashYearMatch) {
    const [, monthName, yearToken] = monthDashYearMatch;
    const year = yearToken.length === 2
      ? parseInt(yearToken) + (parseInt(yearToken) >= 70 ? 1900 : 2000)
      : parseInt(yearToken);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(year, monthIndex, 1);
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
  
  // Find the real header row (some exports include title rows above headers).
  const detectedHeaderIndex = lines.findIndex((line) => {
    const cols = parseCSVLine(line);
    const dateLikeCount = cols.filter((c) => parseColumnDate((c || '').trim()) !== null).length;
    return cols.length >= 3 && dateLikeCount >= 1;
  });
  const headerIndex = detectedHeaderIndex >= 0 ? detectedHeaderIndex : 0;
  const headerLine = lines[headerIndex];
  const headers = parseCSVLine(headerLine);

  const normalizeHeader = (header: string) =>
    (header || '')
      .toLowerCase()
      .trim()
      .replace(/["']/g, '')
      .replace(/[\s_-]+/g, ' ');

  const normalizedHeaders = headers.map(normalizeHeader);
  const findHeaderIndex = (predicates: Array<(header: string) => boolean>): number =>
    normalizedHeaders.findIndex((header) => predicates.some((predicate) => predicate(header)));

  const acctTypeIndex = findHeaderIndex([
    (h) => h === 'acct type',
    (h) => h === 'account type',
    (h) => h === 'type',
  ]);
  const acctIdIndex = findHeaderIndex([
    (h) => h === 'acct id',
    (h) => h === 'account id',
    (h) => h === 'account number',
    (h) => h === 'account no',
    (h) => h === 'account #',
    (h) => h === 'code',
  ]);
  const descriptionIndex = findHeaderIndex([
    (h) => h === 'description',
    (h) => h === 'account',
    (h) => h === 'account name',
    (h) => h === 'name',
  ]);

  // Detect date columns by parseable date headers instead of fixed positions.
  const dateColumnIndexes = headers
    .map((header, idx) => ({ header: header.trim(), idx }))
    .filter(({ header }) => parseColumnDate(header) !== null)
    .map(({ idx }) => idx);

  if (dateColumnIndexes.length === 0) {
    throw new Error('CSV must include at least one date column (e.g., 12/31/2022 or 2024-01-31)');
  }

  const dates = dateColumnIndexes.map((idx) => headers[idx].trim());
  const nonDateColumnIndexes = headers.map((_, idx) => idx).filter((idx) => !dateColumnIndexes.includes(idx));
  const fallbackDescriptionIndex = descriptionIndex !== -1
    ? descriptionIndex
    : (nonDateColumnIndexes.find((idx) => idx !== acctTypeIndex && idx !== acctIdIndex) ?? nonDateColumnIndexes[0] ?? 0);
  const isStructuredTrialBalance = acctTypeIndex !== -1;
  
  const accounts: TrialBalanceAccount[] = [];
  const accountsByType: { [type: string]: TrialBalanceAccount[] } = {};
  let currentSectionType = '';
  
  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);
    // Per mapping rules, drop any row explicitly tagged as credit in amount cells.
    if (rowHasCreditMarker(values, dateColumnIndexes)) continue;

    let rawAcctType = '';
    let acctId = '';
    let description = '';

    if (isStructuredTrialBalance) {
      rawAcctType = values[acctTypeIndex]?.trim() || '';
      acctId = acctIdIndex >= 0 ? (values[acctIdIndex]?.trim() || '') : '';
      description = values[fallbackDescriptionIndex]?.trim() || '';
      if (!description || isLikelyNumericText(description)) {
        const candidateDescription = nonDateColumnIndexes
          .filter((idx) => idx !== acctTypeIndex && idx !== acctIdIndex)
          .map((idx) => values[idx]?.trim() || '')
          .find((val) => val && !isLikelyNumericText(val));
        description = candidateDescription || '';
      }
    } else {
      // Alternate layout support:
      // First column contains section headers (Income/Expenses/...) and account names.
      // Remaining columns are date amounts.
      const firstNonDateColumnIndex = headers.findIndex((_, idx) => !dateColumnIndexes.includes(idx));
      const descriptionIdx = firstNonDateColumnIndex >= 0 ? firstNonDateColumnIndex : 0;
      description = values[descriptionIdx]?.trim() || '';
      if (!description) continue;

      const rowHasNonZeroAmount = dateColumnIndexes.some((idx) => parseNumber(values[idx]) !== 0);
      const isLikelySectionRow = !rowHasNonZeroAmount;
      if (isLikelySectionRow) {
        currentSectionType = normalizeAccountType(description, description);
        continue;
      }

      rawAcctType = currentSectionType || inferAccountTypeFromDescription(description);
      acctId = '';
    }

    // Skip separator/subtotal rows and malformed lines.
    if (shouldSkipAccountRow(rawAcctType, acctId, description)) continue;

    const acctType = normalizeAccountType(rawAcctType, description, acctId);
    
    // Parse values for each date column
    const dateValues: { [date: string]: number } = {};
    for (let j = 0; j < dateColumnIndexes.length; j++) {
      const date = dates[j];
      const sourceIndex = dateColumnIndexes[j];
      const value = parseNumber(values[sourceIndex]);
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
    const classification = ACCOUNT_TYPE_CLASSIFICATIONS[account.acctType] || ACCOUNT_TYPE_CLASSIFICATIONS[normalizeAccountType(account.acctType, account.description, account.acctId)] || 'Expense';
    
    accountsForMapping.push({
      name: account.description,
      classification,
      acctType: account.acctType,
      acctId: account.acctId,
    });
  }
  
  return accountsForMapping;
}

function normalizeMappingTargetField(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'nonopertingincome') return 'nonOperatingIncome';
  if (normalized === 'nonopertingexpense') return 'nonOperatingExpense';
  return raw;
}

/**
 * Process mapped trial balance data into monthly financial records
 */
export function processTrialBalanceToMonthly(
  parsedData: ParsedTrialBalance,
  accountMappings: Array<{ accountName: string; targetField: string; lobAllocations?: unknown }>
): Array<Record<string, unknown>> {
  const monthlyRecords: Array<Record<string, unknown>> = [];
  
  // Normalize account names for better matching (trim, lowercase, normalize whitespace)
  const normalizeAccountName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Create a mapping lookup with normalized keys for better matching
  const mappingLookup: { [accountName: string]: { targetField: string; lobAllocations?: unknown } } = {};

  const addNumericField = (record: Record<string, unknown>, field: string, amount: number): boolean => {
    const current = record[field];
    if (typeof current !== 'number') return false;
    record[field] = current + amount;
    return true;
  };
  
  for (const mapping of accountMappings) {
    const normalizedTargetField = normalizeMappingTargetField(mapping.targetField);
    const normalizedKey = normalizeAccountName(mapping.accountName);
    mappingLookup[normalizedKey] = {
      targetField: normalizedTargetField,
      lobAllocations: mapping.lobAllocations,
    };
    // Also keep the original key for backwards compatibility
    mappingLookup[mapping.accountName] = {
      targetField: normalizedTargetField,
      lobAllocations: mapping.lobAllocations,
    };
  }
  
  // Process each date column
  for (const dateStr of parsedData.dates) {
    const parsedDate = parseColumnDate(dateStr);
    if (!parsedDate) continue;
    
    // Initialize monthly record with all fields at 0
    // Must include ALL fields that users can map to in the UI
    const monthlyRecord: Record<string, unknown> = {
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
      // Income taxes (NOT operating expenses)
      stateIncomeTaxes: 0,
      federalIncomeTaxes: 0,
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
      nonOperatingExpense: 0,
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
    const sectorRevenueBreakdown: Record<string, number> = {};
    const sectorCogsBreakdown: Record<string, number> = {};
    
    // Build account values for LOB allocation processing
    const accountValues: Array<{ accountName: string; accountId: string; value: number }> = [];
    
    // Sum up values based on mappings AND collect account values for LOB processing
    for (const account of parsedData.accounts) {
      // Try exact match first, then normalized match
      let mapping = mappingLookup[account.description];
      if (!mapping) {
        const normalizedName = normalizeAccountName(account.description);
        mapping = mappingLookup[normalizedName];
      }
      
      const value = account.values[dateStr] || 0;

      if (mapping && mapping.targetField && value !== 0) {
        // Add to mapped target field. Sector-specific rev_/cogs_ mappings roll up to report totals.
        if (addNumericField(monthlyRecord, mapping.targetField, value)) {
        } else if (mapping.targetField.startsWith('rev_')) {
          monthlyRecord.revenue += value;
          sectorRevenueBreakdown[mapping.targetField] = (sectorRevenueBreakdown[mapping.targetField] || 0) + value;
        } else if (mapping.targetField.startsWith('cogs_')) {
          monthlyRecord.cogsTotal += value;
          sectorCogsBreakdown[mapping.targetField] = (sectorCogsBreakdown[mapping.targetField] || 0) + value;
        } else if (mapping.targetField === 'nonOperatingExpense') {
          monthlyRecord.nonOperatingExpense += value;
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
        if (defaultField) {
          addNumericField(monthlyRecord, defaultField, value);
        }
      }
    }
    
    // Calculate totals
    // Keep sector cogs_* as authoritative when they are present.
    const cogsFromComponents = Number(monthlyRecord.cogsPayroll || 0) + Number(monthlyRecord.cogsOwnerPay || 0) +
      Number(monthlyRecord.cogsContractors || 0) + Number(monthlyRecord.cogsMaterials || 0) +
      Number(monthlyRecord.cogsCommissions || 0) + Number(monthlyRecord.cogsOther || 0);
    if (Object.keys(sectorCogsBreakdown).length === 0 && cogsFromComponents > 0) {
      monthlyRecord.cogsTotal = cogsFromComponents;
    }
    
    // Current Assets total
    monthlyRecord.tca = Number(monthlyRecord.cash || 0) + Number(monthlyRecord.ar || 0) + Number(monthlyRecord.inventory || 0) + Number(monthlyRecord.otherCA || 0);
    monthlyRecord.totalAssets = Number(monthlyRecord.tca || 0) + Number(monthlyRecord.fixedAssets || 0) + Number(monthlyRecord.otherAssets || 0);
    
    // Liabilities total
    monthlyRecord.tcl = Number(monthlyRecord.ap || 0) + Number(monthlyRecord.otherCL || 0);
    monthlyRecord.totalLiab = Number(monthlyRecord.tcl || 0) + Number(monthlyRecord.ltd || 0);
    
    // Equity total (sum of detailed equity fields if not directly mapped)
    const equityFromComponents = Number(monthlyRecord.ownersCapital || 0) + Number(monthlyRecord.commonStock || 0) +
      Number(monthlyRecord.preferredStock || 0) + Number(monthlyRecord.retainedEarnings || 0) +
      Number(monthlyRecord.additionalPaidInCapital || 0) - Number(monthlyRecord.treasuryStock || 0) - Number(monthlyRecord.ownersDraw || 0);
    if (equityFromComponents !== 0 && Number(monthlyRecord.totalEquity || 0) === 0) {
      monthlyRecord.totalEquity = equityFromComponents;
    }
    
    monthlyRecord.totalLAndE = Number(monthlyRecord.totalLiab || 0) + Number(monthlyRecord.totalEquity || 0);
    
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
    if (Object.keys(sectorRevenueBreakdown).length > 0) {
      monthlyRecord.revenueBreakdown = {
        ...(monthlyRecord.revenueBreakdown || {}),
        ...sectorRevenueBreakdown,
      };
    }
    if (Object.keys(sectorCogsBreakdown).length > 0) {
      monthlyRecord.cogsBreakdown = {
        ...(monthlyRecord.cogsBreakdown || {}),
        ...sectorCogsBreakdown,
      };
    }
    if ((monthlyRecord.nonOperatingExpense || 0) !== 0) {
      monthlyRecord.expenseBreakdown = {
        ...(monthlyRecord.expenseBreakdown || {}),
        nonOperatingExpense: Number(monthlyRecord.nonOperatingExpense) || 0,
      };
    }
    
    monthlyRecords.push(monthlyRecord);
  }
  
  // Sort by date
  monthlyRecords.sort((a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime());
  
  return monthlyRecords;
}

export function processTrialBalanceToDailySnapshotsAndLines(
  parsedData: ParsedTrialBalance,
  accountMappings: Array<{ accountName: string; targetField: string; lobAllocations?: unknown }>
): {
  dailySnapshots: Array<Record<string, unknown>>;
  mappedLines: Array<{
    snapshotDate: string;
    frequency: 'daily';
    sourceAccountName: string;
    sourceAccountId: string;
    sourceAccountType: string;
    targetField: string;
    amount: number;
  }>;
} {
  const dailySnapshots: Array<Record<string, unknown>> = [];
  const mappedLines: Array<{
    snapshotDate: string;
    frequency: 'daily';
    sourceAccountName: string;
    sourceAccountId: string;
    sourceAccountType: string;
    targetField: string;
    amount: number;
  }> = [];

  const normalizeAccountName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
  const mappingLookup: { [accountName: string]: { targetField: string; lobAllocations?: unknown } } = {};

  const addNumericField = (record: Record<string, unknown>, field: string, amount: number): boolean => {
    const current = record[field];
    if (typeof current !== 'number') return false;
    record[field] = current + amount;
    return true;
  };

  for (const mapping of accountMappings) {
    const normalizedTargetField = normalizeMappingTargetField(mapping.targetField);
    const normalizedKey = normalizeAccountName(mapping.accountName);
    mappingLookup[normalizedKey] = { targetField: normalizedTargetField, lobAllocations: mapping.lobAllocations };
    mappingLookup[mapping.accountName] = { targetField: normalizedTargetField, lobAllocations: mapping.lobAllocations };
  }

  for (const dateStr of parsedData.dates) {
    const parsedDate = parseColumnDate(dateStr);
    if (!parsedDate) continue;
    const snapshotDate = parsedDate.toISOString();

    const dailyRecord: Record<string, unknown> = {
      snapshotDate,
      frequency: 'daily',
      revenue: 0,
      expense: 0,
      cogsPayroll: 0,
      cogsOwnerPay: 0,
      cogsContractors: 0,
      cogsMaterials: 0,
      cogsCommissions: 0,
      cogsOther: 0,
      cogsTotal: 0,
      payroll: 0,
      ownerBasePay: 0,
      benefits: 0,
      insurance: 0,
      professionalFees: 0,
      subcontractors: 0,
      rent: 0,
      taxLicense: 0,
      stateIncomeTaxes: 0,
      federalIncomeTaxes: 0,
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
      nonOperatingIncome: 0,
      nonOperatingExpense: 0,
      extraordinaryItems: 0,
      cash: 0,
      ar: 0,
      inventory: 0,
      otherCA: 0,
      tca: 0,
      fixedAssets: 0,
      otherAssets: 0,
      totalAssets: 0,
      ap: 0,
      otherCL: 0,
      tcl: 0,
      ltd: 0,
      totalLiab: 0,
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
    let hasSectorCogsMapping = false;

    for (const account of parsedData.accounts) {
      let mapping = mappingLookup[account.description];
      if (!mapping) {
        const normalizedName = normalizeAccountName(account.description);
        mapping = mappingLookup[normalizedName];
      }

      const value = account.values[dateStr] || 0;
      if (value === 0) continue;

      let targetField: string | null = null;
      if (mapping?.targetField) {
        targetField = mapping.targetField;
      } else {
        targetField = ACCOUNT_TYPE_TO_TARGET_FIELD[account.acctType] || null;
      }
      if (!targetField) continue;

      if (addNumericField(dailyRecord, targetField, value)) {
      } else if (targetField.startsWith('rev_')) {
        dailyRecord.revenue = Number(dailyRecord.revenue || 0) + value;
      } else if (targetField.startsWith('cogs_')) {
        dailyRecord.cogsTotal = Number(dailyRecord.cogsTotal || 0) + value;
        hasSectorCogsMapping = true;
      }

      mappedLines.push({
        snapshotDate,
        frequency: 'daily',
        sourceAccountName: account.description,
        sourceAccountId: account.acctId,
        sourceAccountType: account.acctType,
        targetField,
        amount: value,
      });
    }

    const cogsFromComponents = Number(dailyRecord.cogsPayroll || 0) + Number(dailyRecord.cogsOwnerPay || 0) +
      Number(dailyRecord.cogsContractors || 0) + Number(dailyRecord.cogsMaterials || 0) +
      Number(dailyRecord.cogsCommissions || 0) + Number(dailyRecord.cogsOther || 0);
    if (!hasSectorCogsMapping && cogsFromComponents > 0) dailyRecord.cogsTotal = cogsFromComponents;

    dailyRecord.tca = Number(dailyRecord.cash || 0) + Number(dailyRecord.ar || 0) + Number(dailyRecord.inventory || 0) + Number(dailyRecord.otherCA || 0);
    dailyRecord.totalAssets = Number(dailyRecord.tca || 0) + Number(dailyRecord.fixedAssets || 0) + Number(dailyRecord.otherAssets || 0);
    dailyRecord.tcl = Number(dailyRecord.ap || 0) + Number(dailyRecord.otherCL || 0);
    dailyRecord.totalLiab = Number(dailyRecord.tcl || 0) + Number(dailyRecord.ltd || 0);
    const equityFromComponents = Number(dailyRecord.ownersCapital || 0) + Number(dailyRecord.commonStock || 0) +
      Number(dailyRecord.preferredStock || 0) + Number(dailyRecord.retainedEarnings || 0) +
      Number(dailyRecord.additionalPaidInCapital || 0) - Number(dailyRecord.treasuryStock || 0) - Number(dailyRecord.ownersDraw || 0);
    if (equityFromComponents !== 0 && Number(dailyRecord.totalEquity || 0) === 0) {
      dailyRecord.totalEquity = equityFromComponents;
    }
    dailyRecord.totalLAndE = Number(dailyRecord.totalLiab || 0) + Number(dailyRecord.totalEquity || 0);

    dailySnapshots.push(dailyRecord);
  }

  dailySnapshots.sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());
  return { dailySnapshots, mappedLines };
}

