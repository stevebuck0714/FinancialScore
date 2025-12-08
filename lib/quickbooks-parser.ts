// QuickBooks Report Parser
// Extracts financial data from QuickBooks P&L and Balance Sheet reports

import { applyLOBAllocations, AccountValue, AccountMapping, CompanyLOB, roundAllBreakdowns, MonthlyLOBData } from './lob-allocator';

export interface ParsedFinancialData {
  monthDate: Date;
  revenue: number;
  expense: number;
  cogsTotal: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  otherAssets: number;
  totalAssets: number;
  ap: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  totalLiab: number;
  totalEquity: number;
  totalLAndE: number;
  // LOB breakdowns
  revenueBreakdown?: any;
  expenseBreakdown?: any;
  cogsBreakdown?: any;
  lobBreakdowns?: any;
}

/**
 * Parse QuickBooks Profit & Loss Report
 */
export function parseProfitAndLoss(plData: any): {
  revenue: number;
  cogs: number;
  expense: number;
  netIncome: number;
} {
  try {
    // Handle both array and nested Row structure
    const rows = Array.isArray(plData?.Rows) ? plData.Rows : (plData?.Rows?.Row || []);
    
    let revenue = 0;
    let cogs = 0;
    let expense = 0;
    let netIncome = 0;

    // Recursively find values in the nested structure
    function findValue(rows: any[], targetName: string): number {
      for (const row of rows) {
        if (row.type === 'Section' && row.Header) {
          const headerValue = row.Header.ColData?.[0]?.value || '';
          
          // Check if this section matches what we're looking for
          if (headerValue.toLowerCase().includes(targetName.toLowerCase())) {
            // Get the summary value (usually the last ColData in Summary)
            const summaryRow = row.Summary;
            if (summaryRow && summaryRow.ColData) {
              const valueCol = summaryRow.ColData.find((col: any) => col.value && !isNaN(parseFloat(col.value)));
              if (valueCol) {
                return Math.abs(parseFloat(valueCol.value));
              }
            }
          }
          
          // Recursively search nested rows
          if (row.Rows && row.Rows.Row) {
            const nestedValue = findValue(row.Rows.Row, targetName);
            if (nestedValue > 0) return nestedValue;
          }
        }
      }
      return 0;
    }

    revenue = findValue(rows, 'Income') || findValue(rows, 'Total Income') || findValue(rows, 'Total Revenue') || 0;
    cogs = findValue(rows, 'Cost of Goods Sold') || findValue(rows, 'COGS') || 0;
    expense = findValue(rows, 'Expenses') || findValue(rows, 'Total Expenses') || findValue(rows, 'Operating Expenses') || 0;
    netIncome = findValue(rows, 'Net Income') || (revenue - cogs - expense);

    return { revenue, cogs, expense, netIncome };
  } catch (error) {
    console.error('Error parsing P&L:', error);
    return { revenue: 0, cogs: 0, expense: 0, netIncome: 0 };
  }
}

/**
 * Parse QuickBooks Balance Sheet Report
 */
export function parseBalanceSheet(bsData: any): {
  cash: number;
  ar: number;
  inventory: number;
  currentAssets: number;
  fixedAssets: number;
  totalAssets: number;
  ap: number;
  currentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  equity: number;
} {
  try {
    // Handle both array and nested Row structure
    const rows = Array.isArray(bsData?.Rows) ? bsData.Rows : (bsData?.Rows?.Row || []);

    function findValue(rows: any[], targetName: string): number {
      for (const row of rows) {
        if (row.type === 'Section' && row.Header) {
          const headerValue = row.Header.ColData?.[0]?.value || '';
          
          if (headerValue.toLowerCase().includes(targetName.toLowerCase())) {
            const summaryRow = row.Summary;
            if (summaryRow && summaryRow.ColData) {
              const valueCol = summaryRow.ColData.find((col: any) => col.value && !isNaN(parseFloat(col.value)));
              if (valueCol) {
                return Math.abs(parseFloat(valueCol.value));
              }
            }
          }
          
          if (row.Rows && row.Rows.Row) {
            const nestedValue = findValue(row.Rows.Row, targetName);
            if (nestedValue > 0) return nestedValue;
          }
        }
      }
      return 0;
    }

    const cash = findValue(rows, 'Bank Accounts') || findValue(rows, 'Cash') || findValue(rows, 'Bank') || 0;
    const ar = findValue(rows, 'Accounts Receivable') || findValue(rows, 'A/R') || 0;
    const inventory = findValue(rows, 'Inventory') || 0;
    const currentAssets = findValue(rows, 'Current Assets') || findValue(rows, 'Total Current Assets') || 0;
    const fixedAssets = findValue(rows, 'Fixed Assets') || findValue(rows, 'Property and Equipment') || 0;
    const totalAssets = findValue(rows, 'ASSETS') || findValue(rows, 'Total Assets') || 0;
    const ap = findValue(rows, 'Accounts Payable') || findValue(rows, 'A/P') || 0;
    const currentLiabilities = findValue(rows, 'Current Liabilities') || findValue(rows, 'Total Current Liabilities') || 0;
    const longTermDebt = findValue(rows, 'Long-Term Liabilities') || findValue(rows, 'Long Term Debt') || 0;
    
    // Calculate total liabilities from components to avoid matching parent section
    const totalLiabilities = currentLiabilities + longTermDebt;
    
    // Equity can be calculated from the accounting equation: Assets = Liabilities + Equity
    const equity = totalAssets - totalLiabilities;

    return {
      cash,
      ar,
      inventory,
      currentAssets,
      fixedAssets,
      totalAssets,
      ap,
      currentLiabilities,
      longTermDebt,
      totalLiabilities,
      equity,
    };
  } catch (error) {
    console.error('Error parsing Balance Sheet:', error);
    return {
      cash: 0,
      ar: 0,
      inventory: 0,
      currentAssets: 0,
      fixedAssets: 0,
      totalAssets: 0,
      ap: 0,
      currentLiabilities: 0,
      longTermDebt: 0,
      totalLiabilities: 0,
      equity: 0,
    };
  }
}

/**
 * Extract all Data rows (individual accounts) from a QB report recursively
 */
function extractAccountRows(rows: any[]): any[] {
  const accountRows: any[] = [];
  
  if (!rows || !Array.isArray(rows)) {
    return accountRows;
  }
  
  for (const row of rows) {
    if (row.type === 'Data') {
      // This is an account row
      accountRows.push(row);
    } else if (row.type === 'Section' && row.Rows) {
      // Recursively extract from nested rows
      const nestedRows = Array.isArray(row.Rows) ? row.Rows : (row.Rows.Row || []);
      const nestedAccounts = extractAccountRows(Array.isArray(nestedRows) ? nestedRows : [nestedRows]);
      accountRows.push(...nestedAccounts);
    }
  }
  
  return accountRows;
}

/**
 * Extract account values for a specific month column
 */
function extractAccountValuesForMonth(
  accountRows: any[],
  columnIndex: number
): AccountValue[] {
  const accountValues: AccountValue[] = [];
  
  for (const row of accountRows) {
    if (row.ColData && row.ColData.length > columnIndex) {
      const accountName = row.ColData[0]?.value || '';
      const accountId = row.ColData[0]?.id || '';
      const valueStr = row.ColData[columnIndex]?.value || '';
      
      // Parse the value (could be empty string, number, or formatted string)
      let value = 0;
      if (valueStr && valueStr !== '') {
        value = parseFloat(valueStr.replace(/,/g, ''));
        if (isNaN(value)) {
          value = 0;
        }
      }
      
      if (accountName && value !== 0) {
        accountValues.push({
          accountName,
          accountId,
          value: Math.abs(value) // Use absolute value
        });
      }
    }
  }
  
  return accountValues;
}

/**
 * Combine P&L and Balance Sheet data into monthly financial records
 * Extracts actual monthly column data from QuickBooks reports
 */
export function createMonthlyRecords(
  plData: any,
  bsData: any,
  financialRecordId: string,
  monthsCount: number = 36,
  accountMappings?: AccountMapping[],
  companyLOBs?: CompanyLOB[]
): ParsedFinancialData[] {
  const records: ParsedFinancialData[] = [];
  
  // Extract column headers (dates) from P&L report
  const plColumns = plData?.Columns?.Column || [];
  const bsColumns = bsData?.Columns?.Column || [];
  
  console.log(`📊 QB Parser: P&L has ${plColumns.length} columns, BS has ${bsColumns.length} columns`);
  
  // Skip the first column (account names) and process the rest as monthly data
  const monthlyColumns = plColumns.slice(1); // Skip column 0 (account names)
  
  console.log(`Processing ${monthlyColumns.length} months of QB data`);
  
  // Helper function to extract value from a row by column index
  function getRowValue(rows: any[], sectionName: string, colIndex: number, logMatches: boolean = false): number {
    for (const row of rows) {
      if (row.type === 'Section' && row.Header) {
        const headerValue = row.Header.ColData?.[0]?.value || '';
        
        if (logMatches && colIndex === 1) {
          console.log(`  Checking section: "${headerValue}"`);
        }
        
        if (headerValue.toLowerCase().includes(sectionName.toLowerCase())) {
          const summaryRow = row.Summary;
          if (summaryRow && summaryRow.ColData && summaryRow.ColData[colIndex]) {
            const value = summaryRow.ColData[colIndex].value;
            const numValue = value ? Math.abs(parseFloat(value)) : 0;
            
            if (logMatches && colIndex === 1) {
              console.log(`  ✓ MATCHED "${sectionName}" in "${headerValue}" - Value: ${numValue}`);
            }
            
            return numValue;
          }
        }
        // Recursively search nested rows
        if (row.Rows && row.Rows.Row) {
          const nestedValue = getRowValue(row.Rows.Row, sectionName, colIndex, logMatches);
          if (nestedValue > 0) return nestedValue;
        }
      }
    }
    return 0;
  }
  
  const plRows = Array.isArray(plData?.Rows) ? plData.Rows : (plData?.Rows?.Row || []);
  const bsRows = Array.isArray(bsData?.Rows) ? bsData.Rows : (bsData?.Rows?.Row || []);
  
  // Extract all account-level data rows for LOB allocation
  const plAccountRows = extractAccountRows(plRows);
  const bsAccountRows = extractAccountRows(bsRows);
  
  console.log(`📊 Extracted ${plAccountRows.length} P&L accounts and ${bsAccountRows.length} BS accounts`);
  
  // Process each monthly column
  for (let colIndex = 1; colIndex < monthlyColumns.length + 1; colIndex++) {
    // Parse month date from column header
    const colHeader = plColumns[colIndex]?.ColTitle || '';
    let monthDate = new Date();
    
    // Try to parse the date from the column header
    if (colHeader) {
      // QuickBooks returns dates like "Sep 2024" or "September 2024"
      const parsed = new Date(colHeader + ' 1');
      if (!isNaN(parsed.getTime())) {
        monthDate = parsed;
      }
    }
    
    // Extract P&L data for this month (log sections for first month only)
    const logSections = colIndex === 1;
    
    if (logSections) {
      console.log(`\n🔍 P&L Sections for Month ${colIndex} (${colHeader}):`);
    }
    
    const revenue = getRowValue(plRows, 'Total Income', colIndex, logSections) || 
                    getRowValue(plRows, 'Income', colIndex, logSections) || 
                    getRowValue(plRows, 'Revenue', colIndex, logSections);
    
    const cogs = getRowValue(plRows, 'Total Cost of Goods Sold', colIndex, logSections) || 
                 getRowValue(plRows, 'Cost of Goods Sold', colIndex, logSections) || 
                 getRowValue(plRows, 'COGS', colIndex, logSections);
    
    const expense = getRowValue(plRows, 'Total Expenses', colIndex, logSections) || 
                    getRowValue(plRows, 'Expenses', colIndex, logSections) || 
                    getRowValue(plRows, 'Operating Expenses', colIndex, logSections);
    
    // Extract Balance Sheet data for this month
    const cash = getRowValue(bsRows, 'Cash', colIndex) || getRowValue(bsRows, 'Checking', colIndex);
    const ar = getRowValue(bsRows, 'Accounts Receivable', colIndex) || getRowValue(bsRows, 'A/R', colIndex);
    const inventory = getRowValue(bsRows, 'Inventory', colIndex);
    const currentAssets = getRowValue(bsRows, 'Total Current Assets', colIndex) || getRowValue(bsRows, 'Current Assets', colIndex);
    const fixedAssets = getRowValue(bsRows, 'Fixed Assets', colIndex) || getRowValue(bsRows, 'Property and Equipment', colIndex);
    const totalAssets = getRowValue(bsRows, 'Total Assets', colIndex) || getRowValue(bsRows, 'TOTAL ASSETS', colIndex);
    const ap = getRowValue(bsRows, 'Accounts Payable', colIndex) || getRowValue(bsRows, 'A/P', colIndex);
    const currentLiabilities = getRowValue(bsRows, 'Total Current Liabilities', colIndex) || getRowValue(bsRows, 'Current Liabilities', colIndex);
    const longTermDebt = getRowValue(bsRows, 'Long-Term Liabilities', colIndex) || getRowValue(bsRows, 'Long Term Debt', colIndex);
    const totalLiabilities = getRowValue(bsRows, 'Total Liabilities', colIndex) || getRowValue(bsRows, 'TOTAL LIABILITIES', colIndex);
    const equity = getRowValue(bsRows, 'Equity', colIndex) || getRowValue(bsRows, 'Total Equity', colIndex);
    
    console.log(`Month ${colIndex}: ${colHeader} - Rev: ${revenue}, Exp: ${expense}, Assets: ${totalAssets}`);
    
    // Apply LOB allocations if account mappings are provided
    let lobData: MonthlyLOBData | null = null;
    if (accountMappings && accountMappings.length > 0) {
      // Extract account values for this month from both P&L and Balance Sheet
      const plAccountValues = extractAccountValuesForMonth(plAccountRows, colIndex);
      const bsAccountValues = extractAccountValuesForMonth(bsAccountRows, colIndex);
      const allAccountValues = [...plAccountValues, ...bsAccountValues];
      
      // Apply LOB allocations
      lobData = applyLOBAllocations(allAccountValues, accountMappings, companyLOBs || []);
      
      if (colIndex === 1) {
        console.log(`📊 LOB Allocation sample for first month:`);
        console.log(`  Total accounts processed: ${allAccountValues.length}`);
        console.log(`  Fields with breakdowns: ${Object.keys(lobData.breakdowns).length}`);
        if (lobData.revenueBreakdown) {
          console.log(`  Revenue breakdown:`, lobData.revenueBreakdown);
        }
      }
    }
    
    records.push({
      monthDate,
      revenue,
      expense,
      cogsTotal: cogs,
      cash,
      ar,
      inventory,
      otherCA: Math.max(0, currentAssets - cash - ar - inventory),
      tca: currentAssets,
      fixedAssets,
      otherAssets: Math.max(0, totalAssets - currentAssets - fixedAssets),
      totalAssets,
      ap,
      otherCL: Math.max(0, currentLiabilities - ap),
      tcl: currentLiabilities,
      ltd: longTermDebt,
      totalLiab: totalLiabilities,
      totalEquity: equity,
      totalLAndE: totalAssets, // Should equal totalLiabilities + equity
      // Add LOB breakdowns if available
      revenueBreakdown: lobData?.revenueBreakdown || null,
      expenseBreakdown: lobData?.expenseBreakdown || null,
      cogsBreakdown: lobData?.cogsBreakdown || null,
      lobBreakdowns: lobData ? roundAllBreakdowns(lobData.breakdowns) : null,
    });
  }

  return records;
}

