// Xero Report Parser
// Extracts financial data from Xero P&L and Balance Sheet reports

import prisma from './prisma';
import { applyLOBAllocations, CompanyLOB } from './lob-allocator';

export interface XeroAccount {
  code: string;
  name: string;
  type: string;
  balance: number;
}

export interface ParsedXeroFinancialData {
  date: Date;
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
}

/**
 * Parse Xero Profit & Loss Report
 */
export function parseXeroProfitAndLoss(plData: any): {
  revenue: number;
  cogs: number;
  expense: number;
  netIncome: number;
} {
  try {
    const rows = plData?.rows || [];
    
    let revenue = 0;
    let cogs = 0;
    let expense = 0;
    let netIncome = 0;

    // Recursively parse Xero report rows
    function parseRows(rows: any[]): void {
      for (const row of rows) {
        if (!row) continue;
        
        const rowType = row.rowType;
        const title = row.title?.toLowerCase() || '';
        
        // Look for section titles
        if (rowType === 'Section' && row.rows) {
          parseRows(row.rows);
        }
        
        // Look for summary rows with totals
        if (rowType === 'SummaryRow' && row.cells) {
          const cells = row.cells;
          
          // Get the value from the cell (usually last cell)
          let value = 0;
          for (const cell of cells) {
            if (cell && cell.value) {
              const numValue = parseFloat(cell.value.toString().replace(/[^0-9.-]/g, ''));
              if (!isNaN(numValue)) {
                value = Math.abs(numValue);
                break;
              }
            }
          }
          
          // Match based on title
          if (title.includes('revenue') || title.includes('income') || title.includes('sales')) {
            revenue = value;
          } else if (title.includes('cost of') || title.includes('cogs')) {
            cogs = value;
          } else if (title.includes('expense') || title.includes('operating')) {
            expense = value;
          } else if (title.includes('net income') || title.includes('net profit')) {
            netIncome = value;
          }
        }
        
        // Recursively process nested rows
        if (row.rows) {
          parseRows(row.rows);
        }
      }
    }

    parseRows(rows);
    
    // Calculate net income if not found
    if (netIncome === 0) {
      netIncome = revenue - cogs - expense;
    }

    console.log('📊 Parsed Xero P&L:', { revenue, cogs, expense, netIncome });
    return { revenue, cogs, expense, netIncome };
  } catch (error) {
    console.error('Error parsing Xero P&L:', error);
    return { revenue: 0, cogs: 0, expense: 0, netIncome: 0 };
  }
}

/**
 * Parse Xero Balance Sheet Report
 */
export function parseXeroBalanceSheet(bsData: any): {
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
  totalEquity: number;
} {
  try {
    const rows = bsData?.rows || [];
    
    let cash = 0;
    let ar = 0;
    let inventory = 0;
    let currentAssets = 0;
    let fixedAssets = 0;
    let totalAssets = 0;
    let ap = 0;
    let currentLiabilities = 0;
    let longTermDebt = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    // Recursively parse Xero report rows
    function parseRows(rows: any[]): void {
      for (const row of rows) {
        if (!row) continue;
        
        const rowType = row.rowType;
        const title = row.title?.toLowerCase() || '';
        
        // Look for section titles
        if (rowType === 'Section' && row.rows) {
          parseRows(row.rows);
        }
        
        // Look for summary rows with totals
        if (rowType === 'SummaryRow' && row.cells) {
          const cells = row.cells;
          
          // Get the value from the cell
          let value = 0;
          for (const cell of cells) {
            if (cell && cell.value) {
              const numValue = parseFloat(cell.value.toString().replace(/[^0-9.-]/g, ''));
              if (!isNaN(numValue)) {
                value = Math.abs(numValue);
                break;
              }
            }
          }
          
          // Match based on title
          if (title.includes('cash') || title.includes('bank')) {
            cash += value;
          } else if (title.includes('receivable') || title.includes('debtors')) {
            ar += value;
          } else if (title.includes('inventory') || title.includes('stock')) {
            inventory += value;
          } else if (title.includes('current asset')) {
            currentAssets = value;
          } else if (title.includes('fixed asset') || title.includes('non-current asset')) {
            fixedAssets = value;
          } else if (title.includes('total asset')) {
            totalAssets = value;
          } else if (title.includes('payable') || title.includes('creditors')) {
            ap += value;
          } else if (title.includes('current liabilit')) {
            currentLiabilities = value;
          } else if (title.includes('long term') || title.includes('non-current liabilit')) {
            longTermDebt = value;
          } else if (title.includes('total liabilit')) {
            totalLiabilities = value;
          } else if (title.includes('equity') || title.includes('capital')) {
            totalEquity = value;
          }
        }
        
        // Recursively process nested rows
        if (row.rows) {
          parseRows(row.rows);
        }
      }
    }

    parseRows(rows);

    console.log('📊 Parsed Xero Balance Sheet:', {
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
      totalEquity
    });

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
      totalEquity
    };
  } catch (error) {
    console.error('Error parsing Xero Balance Sheet:', error);
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
      totalEquity: 0
    };
  }
}

/**
 * Parse Xero Trial Balance to extract accounts
 */
export function parseXeroTrialBalance(trialBalance: any): XeroAccount[] {
  const accounts: XeroAccount[] = [];
  
  if (!trialBalance.rows) return accounts;
  
  function parseRows(rows: any[]) {
    rows.forEach((row) => {
      if (row.rowType === 'Row' && row.cells) {
        const cells = row.cells;
        if (cells.length >= 3) {
          const code = cells[0]?.value || '';
          const name = cells[1]?.value || '';
          const debit = parseFloat(cells[2]?.value || '0');
          const credit = parseFloat(cells[3]?.value || '0');
          
          if (code && name) {
            accounts.push({
              code,
              name,
              type: determineAccountType(name, code),
              balance: debit - credit,
            });
          }
        }
      }
      
      if (row.rows) {
        parseRows(row.rows);
      }
    });
  }
  
  parseRows(trialBalance.rows);
  return accounts;
}

/**
 * Determine account type from name and code
 */
function determineAccountType(name: string, code: string): string {
  const nameLower = name.toLowerCase();
  const codeNum = parseInt(code);
  
  // Xero standard account code ranges
  if (codeNum >= 200 && codeNum < 300) return 'Asset';
  if (codeNum >= 300 && codeNum < 400) return 'Liability';
  if (codeNum >= 400 && codeNum < 500) return 'Revenue';
  if (codeNum >= 500 && codeNum < 700) return 'Expense';
  if (codeNum >= 800 && codeNum < 900) return 'Equity';
  
  // Fallback to name matching
  if (nameLower.includes('revenue') || nameLower.includes('sales') || nameLower.includes('income')) return 'Revenue';
  if (nameLower.includes('expense') || nameLower.includes('cost')) return 'Expense';
  if (nameLower.includes('asset') || nameLower.includes('cash') || nameLower.includes('inventory')) return 'Asset';
  if (nameLower.includes('liability') || nameLower.includes('payable')) return 'Liability';
  if (nameLower.includes('equity') || nameLower.includes('retained')) return 'Equity';
  
  return 'Other';
}

/**
 * Parse monthly P&L data from Xero and create financial records
 * Returns array of MonthlyFinancial data (not saved yet)
 */
export async function parseXeroMonthlyData(
  companyId: string,
  userId: string,
  plData: any,
  bsData: any,
  startDate: Date,
  endDate: Date,
  companyLOBs: CompanyLOB[]
): Promise<any[]> {
  const monthlyDataArray: any[] = [];
  
  try {
    // Xero P&L with periods returns columns for each month
    const rows = plData?.rows || [];
    
    // Extract month headers from the report
    let monthColumns: { date: Date; index: number }[] = [];
    
    // Find the header row with dates
    function findHeaders(rows: any[], depth: number = 0): void {
      const indent = '  '.repeat(depth);
      console.log(`${indent}🔍 Searching ${rows.length} rows at depth ${depth}...`);
      
      for (const row of rows) {
        console.log(`${indent}  Row type: ${row.rowType}, Title: ${row.title || 'none'}, Cells: ${row.cells?.length || 0}`);
        
        if (row.rowType === 'Header' && row.cells) {
          console.log(`${indent}  🔎 Found Header row with ${row.cells.length} cells`);
          console.log(`${indent}     Cell values:`, row.cells.map((c: any) => c?.value || 'empty').slice(0, 10));
          
          // Skip first 1-2 cells (account name/code)
          for (let i = 1; i < row.cells.length; i++) {
            const cell = row.cells[i];
            if (cell && cell.value) {
              const dateStr = cell.value.toString();
              console.log(`${indent}     Trying to parse: "${dateStr}"`);
              const parsedDate = parseXeroDate(dateStr);
              if (parsedDate) {
                monthColumns.push({ date: parsedDate, index: i });
                console.log(`${indent}    ✅ Parsed date column ${i}: "${dateStr}" -> ${parsedDate.toISOString().split('T')[0]}`);
              } else {
                console.log(`${indent}    ⚠️  Could not parse date from cell ${i}: "${dateStr}"`);
              }
            }
          }
          return; // Found headers, stop searching
        }
        if (row.rows) {
          findHeaders(row.rows, depth + 1);
        }
      }
    }
    
    findHeaders(rows);
    
    console.log(`  🔍 Found ${monthColumns.length} month columns in Xero report`);
    if (monthColumns.length > 0) {
      console.log(`  📅 Date range: ${monthColumns[0].date.toISOString().split('T')[0]} to ${monthColumns[monthColumns.length - 1].date.toISOString().split('T')[0]}`);
    }
    
    // If no month columns found, try to create single period
    if (monthColumns.length === 0) {
      console.log('⚠️  No monthly columns found in P&L report, parsing as single period');
      const pl = parseXeroProfitAndLoss(plData);
      const bs = parseXeroBalanceSheet(bsData);
      
      const otherCA = Math.max(0, bs.currentAssets - bs.cash - bs.ar - bs.inventory);
      const otherAssets = Math.max(0, bs.totalAssets - bs.currentAssets - bs.fixedAssets);
      const otherCL = Math.max(0, bs.currentLiabilities - bs.ap);
      const totalLAndE = bs.totalLiabilities + bs.totalEquity;
      
      monthlyDataArray.push({
        companyId,
        monthDate: endDate,
        revenue: pl.revenue,
        expense: pl.expense,
        cogsTotal: pl.cogs,
        cash: bs.cash,
        ar: bs.ar,
        inventory: bs.inventory,
        otherCA,
        tca: bs.currentAssets,
        fixedAssets: bs.fixedAssets,
        otherAssets,
        totalAssets: bs.totalAssets,
        ap: bs.ap,
        otherCL,
        tcl: bs.currentLiabilities,
        ltd: bs.longTermDebt,
        totalLiab: bs.totalLiabilities,
        totalEquity: bs.totalEquity,
        totalLAndE,
      });
      
      return monthlyDataArray;
    }
    
    console.log(`📅 Found ${monthColumns.length} monthly periods in P&L report`);
    
    // Parse balance sheet (for end-of-period values)
    const bs = parseXeroBalanceSheet(bsData);
    
    // Extract monthly P&L data for each column
    for (const month of monthColumns) {
      const monthData = extractMonthColumn(rows, month.index);
      
      // For balance sheet values, use the final BS values for all months
      // (In reality, we'd need monthly BS snapshots but Xero doesn't provide that easily)
      const otherCA = Math.max(0, bs.currentAssets - bs.cash - bs.ar - bs.inventory);
      const otherAssets = Math.max(0, bs.totalAssets - bs.currentAssets - bs.fixedAssets);
      const otherCL = Math.max(0, bs.currentLiabilities - bs.ap);
      const totalLAndE = bs.totalLiabilities + bs.totalEquity;
      
      monthlyDataArray.push({
        companyId,
        monthDate: month.date,
        revenue: monthData.revenue,
        expense: monthData.expense,
        cogsTotal: monthData.cogs,
        cash: bs.cash,
        ar: bs.ar,
        inventory: bs.inventory,
        otherCA,
        tca: bs.currentAssets,
        fixedAssets: bs.fixedAssets,
        otherAssets,
        totalAssets: bs.totalAssets,
        ap: bs.ap,
        otherCL,
        tcl: bs.currentLiabilities,
        ltd: bs.longTermDebt,
        totalLiab: bs.totalLiabilities,
        totalEquity: bs.totalEquity,
        totalLAndE,
      });
      
      console.log(`✅ Parsed month ${month.date.toISOString().split('T')[0]}: Rev $${monthData.revenue.toFixed(0)}, COGS $${monthData.cogs.toFixed(0)}, Exp $${monthData.expense.toFixed(0)}`);
    }
    
  } catch (error) {
    console.error('Error parsing monthly Xero data:', error);
    throw error;
  }
  
  return monthlyDataArray;
}

/**
 * Extract data from a specific month column in Xero P&L report
 */
function extractMonthColumn(rows: any[], columnIndex: number): {
  revenue: number;
  cogs: number;
  expense: number;
} {
  let revenue = 0;
  let cogs = 0;
  let expense = 0;
  
  function parseRows(rows: any[]): void {
    for (const row of rows) {
      if (!row) continue;
      
      const rowType = row.rowType;
      const title = row.title?.toLowerCase() || '';
      
      // Look for summary rows with totals
      if (rowType === 'SummaryRow' && row.cells) {
        const cell = row.cells[columnIndex];
        
        if (cell && cell.value) {
          const value = Math.abs(parseFloat(cell.value.toString().replace(/[^0-9.-]/g, '')) || 0);
          
          // Match based on title
          if (title.includes('revenue') || title.includes('income') || title.includes('sales')) {
            if (value > revenue) revenue = value;
          } else if (title.includes('cost of') || title.includes('cogs')) {
            if (value > cogs) cogs = value;
          } else if (title.includes('expense') || title.includes('operating')) {
            if (value > expense) expense = value;
          }
        }
      }
      
      // Recursively process nested rows
      if (row.rows) {
        parseRows(row.rows);
      }
    }
  }
  
  parseRows(rows);
  return { revenue, cogs, expense };
}

/**
 * Parse Xero date string (e.g., "Jan 2024" or "January 2024")
 */
function parseXeroDate(dateStr: string): Date | null {
  try {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const parts = dateStr.toLowerCase().trim().split(/[\s-]+/);
    
    if (parts.length < 2) return null;
    
    const monthStr = parts[0].substring(0, 3);
    const month = months.indexOf(monthStr);
    const year = parseInt(parts[parts.length - 1]);
    
    if (month === -1 || isNaN(year)) return null;
    
    // Return last day of month
    return new Date(year, month + 1, 0);
  } catch (error) {
    return null;
  }
}


