// QuickBooks Report Parser
// Extracts financial data from QuickBooks P&L and Balance Sheet reports

import { applyLOBAllocations, AccountValue, AccountMapping, CompanyLOB, roundAllBreakdowns, MonthlyLOBData } from './lob-allocator';

type QBColData = { value?: unknown; id?: string };
type QBRow = {
  type?: string;
  Header?: { ColData?: QBColData[] };
  Summary?: { ColData?: QBColData[] };
  Rows?: { Row?: QBRow[] } | QBRow[];
  ColData?: QBColData[];
};
type QBReport = { Rows?: { Row?: QBRow[] } | QBRow[]; Columns?: { Column?: Array<{ ColTitle?: string }> } };

function asQBRows(value: unknown): QBRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === 'object') as QBRow[];
}

function nestedQBRows(row: QBRow): QBRow[] {
  if (Array.isArray(row.Rows)) return asQBRows(row.Rows);
  if (row.Rows && typeof row.Rows === 'object' && Array.isArray((row.Rows as { Row?: unknown }).Row)) {
    return asQBRows((row.Rows as { Row?: unknown }).Row);
  }
  return [];
}

function asQBCols(value: unknown): QBColData[] {
  if (!Array.isArray(value)) return [];
  return value.filter((cell) => cell && typeof cell === 'object') as QBColData[];
}

function isMappableQboSystemSummaryName(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalized === 'netincome' || normalized === 'currentyearearnings';
}

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
  revenueBreakdown?: Record<string, number> | null;
  expenseBreakdown?: Record<string, number> | null;
  cogsBreakdown?: Record<string, number> | null;
  lobBreakdowns?: Record<string, Record<string, number>> | null;
  [key: string]: unknown;
}

/**
 * Extract all account-bearing rows from a QB report recursively.
 *
 * QBO sometimes represents an account with children as a Section whose Header
 * contains the account id/name and whose Summary contains the account balance.
 * Treat that section summary as the parent account value so mapped parent
 * accounts (for example 3100 Capital Investment) are not dropped.
 */
function extractAccountRows(rows: QBRow[]): QBRow[] {
  const accountRows: QBRow[] = [];
  
  if (!rows || !Array.isArray(rows)) {
    return accountRows;
  }
  
  for (const row of rows) {
    if (row.type === 'Data') {
      // This is an account row
      accountRows.push(row);
    } else if (row.type === 'Section') {
      const headerCols = asQBCols(row.Header?.ColData);
      const summaryCols = asQBCols(row.Summary?.ColData);
      const headerName = String(headerCols[0]?.value || '').trim();
      const headerId = String(headerCols[0]?.id || '').trim();
      const summaryName = String(summaryCols[0]?.value || '').trim();
      if (headerName && summaryCols.length > 0 && (headerId || !/^total\b/i.test(headerName))) {
        accountRows.push({
          type: 'Data',
          ColData: [
            {
              value: headerName,
              id: headerId || undefined,
            },
            ...summaryCols.slice(1),
          ],
        });
      } else if (!headerName && summaryCols.length > 0 && isMappableQboSystemSummaryName(summaryName)) {
        // QBO system-calculated summaries (for example Net Income) do not have
        // chart-of-account IDs, but users can explicitly map them by label/path.
        accountRows.push({
          type: 'Data',
          ColData: [
            {
              value: summaryName,
              id: undefined,
            },
            ...summaryCols.slice(1),
          ],
        });
      }
      if (row.Rows) {
      // Recursively extract from nested rows
        const nestedRows = nestedQBRows(row);
        const nestedAccounts = extractAccountRows(nestedRows);
        accountRows.push(...nestedAccounts);
      }
    }
  }
  
  return accountRows;
}

/**
 * Extract account values for a specific month column
 */
function extractAccountValuesForMonth(
  accountRows: QBRow[],
  columnIndex: number
): AccountValue[] {
  const accountValues: AccountValue[] = [];
  
  for (const row of accountRows) {
    const colData = asQBCols(row.ColData);
    if (colData.length > columnIndex) {
      const accountName = String(colData[0]?.value || '');
      const accountId = String(colData[0]?.id || '');
      const valueStr = String(colData[columnIndex]?.value || '');
      
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
 * Sum a balance-sheet target from the accounts explicitly mapped to it.
 *
 * Report section summaries are useful presentation values, but they are not a
 * reliable cash total: QBO can place bank accounts beside a "Cash on Hand"
 * section rather than beneath it. Resolve actual account rows by ListID first
 * (then by name for legacy mappings) so every mapped bank account contributes
 * exactly once. This also prevents duplicate saved mappings from making the
 * same report row count twice.
 */
function getMappedBalanceSheetTotal(
  accountValues: AccountValue[],
  accountMappings: AccountMapping[] | undefined,
  targetField: string,
): number | null {
  if (!accountMappings?.length) return null;

  const normalizedTarget = targetField.trim().toLowerCase();
  const mappingsById = new Map<string, AccountMapping>();
  const mappingsByName = new Map<string, AccountMapping>();
  for (const mapping of accountMappings) {
    if (String(mapping.targetField || '').trim().toLowerCase() !== normalizedTarget) continue;
    const accountId = String(mapping.accountId || '').trim();
    const accountName = String(mapping.accountName || '').trim().toLowerCase();
    if (accountId) mappingsById.set(accountId, mapping);
    if (accountName) mappingsByName.set(accountName, mapping);
  }

  let total = 0;
  let matchedAccounts = 0;
  const seenSourceAccounts = new Set<string>();
  for (const account of accountValues) {
    const accountId = String(account.accountId || '').trim();
    const accountName = String(account.accountName || '').trim().toLowerCase();
    const mapping =
      (accountId ? mappingsById.get(accountId) : undefined) ||
      (accountName ? mappingsByName.get(accountName) : undefined);
    if (!mapping) continue;

    const sourceKey = accountId || `name:${accountName}`;
    if (!sourceKey || seenSourceAccounts.has(sourceKey)) continue;
    seenSourceAccounts.add(sourceKey);
    total += Number(account.value || 0);
    matchedAccounts += 1;
  }

  return matchedAccounts > 0 ? total : null;
}

/**
 * Combine P&L and Balance Sheet data into monthly financial records
 * Extracts actual monthly column data from QuickBooks reports
 */
export function createMonthlyRecords(
  plData: unknown,
  bsData: unknown,
  accountMappings?: AccountMapping[],
  companyLOBs?: CompanyLOB[]
): ParsedFinancialData[] {
  const records: ParsedFinancialData[] = [];
  
  const parseQbNumber = (raw: unknown): number => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    if (typeof raw !== 'string') return 0;
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const normalized = trimmed
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .replace(/\(([^)]+)\)/, '-$1');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  
  // Extract column headers (dates) from P&L report
  const plColumns = (((plData || {}) as QBReport).Columns?.Column || []);
  // Skip the first column (account names) and process the rest as monthly data
  const monthlyColumns = plColumns.slice(1); // Skip column 0 (account names)
  
  
  // Helper function to extract value from a row by column index
  function collectDataRowSum(inputRows: QBRow[], colIndex: number): number {
    let total = 0;
    const rowsToWalk = Array.isArray(inputRows) ? inputRows : [];
    for (const row of rowsToWalk) {
      if (!row || typeof row !== 'object') continue;
      if (row.type === 'Data' && Array.isArray(row.ColData) && row.ColData[colIndex]) {
        total += Math.abs(parseQbNumber(row.ColData[colIndex].value));
      }
      const nested = nestedQBRows(row);
      if (nested.length > 0) {
        total += collectDataRowSum(nested, colIndex);
      }
    }
    return total;
  }

  function getSectionAmount(sectionRow: QBRow, colIndex: number): number {
    const summaryValue =
      sectionRow?.Summary?.ColData && sectionRow.Summary.ColData[colIndex]
        ? Math.abs(parseQbNumber(sectionRow.Summary.ColData[colIndex].value))
        : 0;
    const nestedRows = nestedQBRows(sectionRow);
    const detailSum = collectDataRowSum(nestedRows, colIndex);
    // Prefer explicit summary if present; otherwise use rolled-up detail rows.
    return summaryValue > 0 ? summaryValue : detailSum;
  }

  function getRowValue(rows: QBRow[], sectionName: string, colIndex: number): number {
    let bestValue = 0;
    for (const row of rows) {
      if (row?.type === 'Data' && Array.isArray(row.ColData)) {
          const rowLabel = String(asQBCols(row.ColData)[0]?.value || '');
        if (rowLabel.toLowerCase().includes(sectionName.toLowerCase())) {
          const raw = asQBCols(row.ColData)[colIndex]?.value;
          const dataValue = Math.abs(parseQbNumber(raw));
          if (dataValue > bestValue) {
            bestValue = dataValue;
          }
        }
      }

      if (row.type === 'Section' && row.Header) {
        const headerValue = String(row.Header.ColData?.[0]?.value || '');
        
        if (headerValue.toLowerCase().includes(sectionName.toLowerCase())) {
          const numValue = getSectionAmount(row, colIndex);
          if (numValue > bestValue) {
            bestValue = numValue;
          }
        }
        // Recursively search nested rows
        const nested = nestedQBRows(row);
        if (nested.length > 0) {
          const nestedValue = getRowValue(nested, sectionName, colIndex);
          if (nestedValue > bestValue) bestValue = nestedValue;
        }
      }
    }
    return bestValue;
  }

  function getSystemSummaryValue(rows: QBRow[], summaryNames: string[], colIndex: number): number {
    const normalizedNames = new Set(
      summaryNames.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '')),
    );
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      if (row.type === 'Section') {
        const summaryCols = asQBCols(row.Summary?.ColData);
        const summaryName = String(summaryCols[0]?.value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '');
        if (summaryName && normalizedNames.has(summaryName)) {
          return parseQbNumber(summaryCols[colIndex]?.value);
        }
        const nestedValue = getSystemSummaryValue(nestedQBRows(row), summaryNames, colIndex);
        if (nestedValue !== 0) return nestedValue;
      }
    }
    return 0;
  }
  
  const plReport = (plData || {}) as QBReport;
  const bsReport = (bsData || {}) as QBReport;
  const plRows = Array.isArray(plReport.Rows) ? asQBRows(plReport.Rows) : asQBRows(plReport.Rows?.Row);
  const bsRows = Array.isArray(bsReport.Rows) ? asQBRows(bsReport.Rows) : asQBRows(bsReport.Rows?.Row);
  
  // Extract all account-level data rows for LOB allocation
  const plAccountRows = extractAccountRows(plRows);
  const bsAccountRows = extractAccountRows(bsRows);
  
  
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
    
    // Extract P&L data for this month
    let revenue = getRowValue(plRows, 'Total Income', colIndex) ||
                  getRowValue(plRows, 'Income', colIndex) ||
                  getRowValue(plRows, 'Revenue', colIndex) ||
                  getRowValue(plRows, 'Sales', colIndex);

    let cogs = getRowValue(plRows, 'Total Cost of Goods Sold', colIndex) ||
               getRowValue(plRows, 'Cost of Goods Sold', colIndex) ||
               getRowValue(plRows, 'COGS', colIndex);

    let expense = getRowValue(plRows, 'Total Expenses', colIndex) ||
                  getRowValue(plRows, 'Expenses', colIndex) ||
                  getRowValue(plRows, 'Operating Expenses', colIndex);
    
    const bsAccountValues = extractAccountValuesForMonth(bsAccountRows, colIndex);

    // Extract Balance Sheet data for this month
    const mappedCash = getMappedBalanceSheetTotal(bsAccountValues, accountMappings, 'cash');
    const cash =
      mappedCash ??
      (getRowValue(bsRows, 'Cash', colIndex) ||
        getRowValue(bsRows, 'Checking', colIndex));
    const ar = getRowValue(bsRows, 'Accounts Receivable', colIndex) || getRowValue(bsRows, 'A/R', colIndex);
    const inventory = getRowValue(bsRows, 'Inventory', colIndex);
    const currentAssets = getRowValue(bsRows, 'Total Current Assets', colIndex) || getRowValue(bsRows, 'Current Assets', colIndex);
    const fixedAssets = getRowValue(bsRows, 'Fixed Assets', colIndex) || getRowValue(bsRows, 'Property and Equipment', colIndex);
    const otherAssets = getRowValue(bsRows, 'Other Assets', colIndex);
    const totalAssets = getRowValue(bsRows, 'Total Assets', colIndex) || getRowValue(bsRows, 'TOTAL ASSETS', colIndex);
    const ap = getRowValue(bsRows, 'Accounts Payable', colIndex) || getRowValue(bsRows, 'A/P', colIndex);
    const currentLiabilities = getRowValue(bsRows, 'Total Current Liabilities', colIndex) || getRowValue(bsRows, 'Current Liabilities', colIndex);
    const longTermDebt = getRowValue(bsRows, 'Long-Term Liabilities', colIndex) || getRowValue(bsRows, 'Long Term Debt', colIndex);
    const totalLiabilities = getRowValue(bsRows, 'Total Liabilities', colIndex) || getRowValue(bsRows, 'TOTAL LIABILITIES', colIndex);
    const equity = getRowValue(bsRows, 'Equity', colIndex) || getRowValue(bsRows, 'Total Equity', colIndex);
    // QBO calculates current-year earnings as a report summary, separate from
    // its Retained Earnings account, which usually updates only at year-end.
    const currentYearNetIncome = getSystemSummaryValue(
      bsRows,
      ['Net Income', 'Current Year Earnings'],
      colIndex,
    );
    
    // Apply LOB allocations if account mappings are provided
    let lobData: MonthlyLOBData | null = null;
    if (accountMappings && accountMappings.length > 0) {
      // Extract account values for this month from both P&L and Balance Sheet
      const plAccountValues = extractAccountValuesForMonth(plAccountRows, colIndex);
      const allAccountValues = [...plAccountValues, ...bsAccountValues];
      
      // Apply LOB allocations
      lobData = applyLOBAllocations(allAccountValues, accountMappings, companyLOBs || []);
      
    }

    const RESERVED_BALANCE_SHEET_FIELDS = new Set([
      'cash',
      'ar',
      'inventory',
      'otherCA',
      'tca',
      'fixedAssets',
      'otherAssets',
      'totalAssets',
      'ap',
      'otherCL',
      'tcl',
      'ltd',
      'totalLiab',
      'totalEquity',
      'totalLAndE',
    ]);

    const mappedFieldTotals =
      lobData?.totals && typeof lobData.totals === 'object'
        ? Object.entries(lobData.totals).reduce((acc, [field, value]) => {
            // Keep report-level totals as source of truth; only populate category fields from mappings.
            if (['revenue', 'expense', 'cogsTotal'].includes(field)) return acc;
            // Prevent account-mapping totals from clobbering balance-sheet rollups.
            if (RESERVED_BALANCE_SHEET_FIELDS.has(field)) return acc;
            const numeric = Number(value || 0);
            if (!Number.isFinite(numeric)) {
              acc[field] = 0;
              return acc;
            }
            acc[field] = field === 'ownersDraw' ? -Math.abs(numeric) : Math.abs(numeric);
            return acc;
          }, {} as Record<string, number>)
        : {};

    const record: ParsedFinancialData = {
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
      otherAssets: otherAssets || Math.max(0, totalAssets - currentAssets - fixedAssets),
      totalAssets,
      ap,
      otherCL: Math.max(0, currentLiabilities - ap),
      tcl: currentLiabilities,
      ltd: longTermDebt,
      totalLiab: totalLiabilities,
      totalEquity: equity,
      totalLAndE: totalAssets, // Should equal totalLiabilities + equity
      currentYearNetIncome,
      // Add LOB breakdowns if available
      revenueBreakdown: lobData?.revenueBreakdown || null,
      expenseBreakdown: lobData?.expenseBreakdown || null,
      cogsBreakdown: lobData?.cogsBreakdown || null,
      lobBreakdowns: lobData ? roundAllBreakdowns(lobData.breakdowns) : null,
      ...mappedFieldTotals,
    };

    // Final guardrail: keep totals coherent even when source labels differ by tenant.
    const normalizedTca = Math.max(
      0,
      Number(record.tca || 0) || Number(record.cash || 0) + Number(record.ar || 0) + Number(record.inventory || 0) + Number(record.otherCA || 0)
    );
    const normalizedTcl = Math.max(
      0,
      Number(record.tcl || 0) || Number(record.ap || 0) + Number(record.otherCL || 0)
    );
    const normalizedTotalAssets = Math.max(
      0,
      Number(record.totalAssets || 0) || normalizedTca + Number(record.fixedAssets || 0) + Number(record.otherAssets || 0)
    );
    const normalizedTotalLiab = Math.max(
      0,
      Number(record.totalLiab || 0) || normalizedTcl + Number(record.ltd || 0)
    );
    const normalizedTotalEquity = Number(record.totalEquity || 0) || (normalizedTotalAssets - normalizedTotalLiab);
    const normalizedTotalLAndE = Number(record.totalLAndE || 0) || (normalizedTotalLiab + normalizedTotalEquity);

    record.tca = normalizedTca;
    record.tcl = normalizedTcl;
    record.totalAssets = normalizedTotalAssets;
    record.totalLiab = normalizedTotalLiab;
    record.totalEquity = normalizedTotalEquity;
    record.totalLAndE = normalizedTotalLAndE;

    records.push(record);
  }

  return records;
}

