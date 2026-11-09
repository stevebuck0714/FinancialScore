/**
 * Parses the SLN (S.L. Nusbaum) monthly Excel statements: the Income Statement with
 * Budget Comparison, its Cash Flow Summary block, and the Balance Sheet.
 * Works on sheet rows (`sheet_to_json` with `header: 1, raw: true, cellDates: true`),
 * so the Dropbox import script and the in-app upload read workbooks the same way.
 */

export type SlnStatementKind = 'ACTIVITY' | 'BALANCE';

export function text(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90);
}

export function monthEndDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

/** Period end printed in the report header ("Basis:" row), when present. */
export function periodFromReport(rows: unknown[][]): string | null {
  for (const row of rows.slice(0, 10)) {
    const joined = row.map(text).join(' ');
    if (!/basis:/i.test(joined)) continue;
    const dateCell = row.find((cell) => cell instanceof Date && !Number.isNaN(cell.valueOf()));
    if (dateCell instanceof Date) return dateCell.toISOString().slice(0, 10);
    const monthYear = joined.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)\b/i);
    if (monthYear) {
      const month = new Date(`${monthYear[1]} 1, ${monthYear[2]}`).getMonth() + 1;
      return monthEndDate(Number(monthYear[2]), month);
    }
  }
  return null;
}

export function statementKind(fileName: string, rows: unknown[][]): SlnStatementKind | null {
  const sample = rows.slice(0, 10).flat().map(text).join(' ');
  if (/income[ _-]*statement/i.test(fileName) || /Income Statement with Budget Comparison/i.test(sample)) {
    return statementLayout(rows) ? 'ACTIVITY' : null;
  }
  if (/balance[ _-]*sheet/i.test(fileName) || /\bBalance Sheet\b/i.test(sample)) return 'BALANCE';
  return null;
}

function isAggregate(name: string): boolean {
  return /^(total|net )/i.test(name)
    || /^(assets|liabilities|current assets|current liabilities|property\s*&\s*equipment|partners?\s*equity|equity|other assets)$/i.test(name)
    || /^\*{3,}/.test(name);
}

function statementAccountType(name: string, inExpenseSection: boolean): string {
  if (/debt service|principal reduction|capital expenses|nonrecurring repair/i.test(name)) return 'Expense';
  return inExpenseSection ? 'Expense' : 'Income';
}

type StatementLayout = { header: number; nameCol: number; actualCol: number; budgetCol: number | null };

/**
 * Income statements are usually Actual | Budget | Variance | Name, but some months
 * add a prior-month column, which moves the names and budget to the right.
 */
function statementLayout(rows: unknown[][]): StatementLayout | null {
  const header = rows.findIndex((row) => row.some((cell) => text(cell) === 'Current Period'));
  if (header < 0) return null;
  let nameCol = -1;
  for (const row of rows.slice(header, header + 60)) {
    nameCol = row.findIndex((cell) => /SUMMARY BY CATEGORY/i.test(text(cell)) || text(cell) === 'INCOME');
    if (nameCol >= 0) break;
  }
  if (nameCol <= 0) return null;
  const labels = (rows[header + 1] || []).map(text);
  const budgetCol = labels.findIndex((label, col) => label === 'Budget' && col < nameCol);
  return { header, nameCol, actualCol: 0, budgetCol: budgetCol >= 0 ? budgetCol : null };
}

export function slnCashFlowLines(sheetRows: unknown[][]) {
  const layout = statementLayout(sheetRows);
  if (!layout) return [];
  const start = sheetRows.findIndex((row, index) => index > layout.header && /cash flow summary/i.test(text(row[layout.nameCol])));
  if (start < 0) return [];
  const occurrence = new Map<string, number>();
  const rows: Array<{ lineKey: string; lineName: string; lineOrder: number; actual: number; budget: number | null; row: number }> = [];
  for (let index = start + 1; index < sheetRows.length; index += 1) {
    const row = sheetRows[index];
    const name = text(row[layout.nameCol]);
    if (name === 'INCOME') break;
    const actual = numberValue(row[layout.actualCol]);
    if (!name || actual === null) continue;
    const isEnding = /^(total )?cash end of period$/i.test(name);
    const lineName = isEnding ? 'Cash End of Period' : /^cash beginning of period$/i.test(name) ? 'Cash Beginning of Period' : name;
    const count = (occurrence.get(slug(lineName)) || 0) + 1;
    occurrence.set(slug(lineName), count);
    rows.push({
      lineKey: count === 1 ? slug(lineName) : `${slug(lineName)}_${count}`,
      lineName,
      lineOrder: rows.length,
      actual,
      budget: layout.budgetCol === null ? null : numberValue(row[layout.budgetCol]),
      row: index + 1,
    });
    if (isEnding) break;
  }
  return rows;
}

export function slnActivityLines(sheetRows: unknown[][]) {
  const layout = statementLayout(sheetRows);
  if (!layout) return [];
  const { header, nameCol, actualCol, budgetCol } = layout;
  let detailed = false;
  let expenseSection = false;
  const occurrence = new Map<string, number>();
  const rows: Array<{ accountCode: string; accountName: string; accountType: string; actual: number; budget: number | null; row: number }> = [];
  for (let index = header + 1; index < sheetRows.length; index += 1) {
    const row = sheetRows[index];
    const name = text(row[nameCol]);
    if (detailed && /cash flow summary/i.test(name)) break;
    if (name === 'INCOME') {
      detailed = true;
      expenseSection = false;
      continue;
    }
    if (/operating expenses/i.test(name)) {
      if (detailed) expenseSection = true;
      continue;
    }
    const actual = numberValue(row[actualCol]);
    if (!detailed || !name || actual === null || isAggregate(name)) continue;
    const count = (occurrence.get(slug(name)) || 0) + 1;
    occurrence.set(slug(name), count);
    rows.push({
      accountCode: `sln_${slug(name)}_${count}`,
      accountName: name,
      accountType: statementAccountType(name, expenseSection),
      actual,
      budget: budgetCol === null ? null : numberValue(row[budgetCol]),
      row: index + 1,
    });
  }
  return rows;
}

export function slnBalanceAccountType(name: string): string {
  const value = name.toLowerCase();
  if (/mmi security deposits/i.test(name)) return 'Bank';
  if (/transfer to owner/i.test(name)) return 'Equity';
  if (/partner.?s?\s*equity|^equity\b|retained earnings/i.test(name)) return 'Equity';
  if (/mortgage payable|long.term debt|notes? payable/i.test(name)) return 'Long Term Debt';
  if (/payable|accrued payroll|security dep/i.test(name)) return 'Other Current Liability';
  if (/accounts receivable|a\/r\b/i.test(name)) return 'Accounts Receivable';
  if (/land|capital improvements|development cost|furniture|fixtures|building|equipment/i.test(name)) return 'Fixed Asset';
  if (/prepaid|escrow|deposit|other asset/i.test(name)) return 'Other Current Asset';
  if (/cash|operating acct|money market|petty cash|bank/i.test(name) || value.includes('acct')) return 'Bank';
  return 'Other Asset';
}

export function slnBalanceLines(sheetRows: unknown[][]) {
  const occurrence = new Map<string, number>();
  const rows: Array<{ accountCode: string; accountName: string; accountType: string; amount: number; row: number }> = [];
  for (let index = 0; index < sheetRows.length; index += 1) {
    const row = sheetRows[index];
    const name = text(row[0]);
    const amount = numberValue(row[1]);
    if (!name || amount === null || isAggregate(name)) continue;
    const count = (occurrence.get(slug(name)) || 0) + 1;
    occurrence.set(slug(name), count);
    rows.push({ accountCode: `sln_${slug(name)}_${count}`, accountName: name, accountType: slnBalanceAccountType(name), amount, row: index + 1 });
  }
  return rows;
}

/** The financial source is SLN, but BGAH is the legal borrower for these mortgage obligations. */
export function slnLegalEntity(accountName: string): string | null {
  return /^(LESS DEBT SERVICE|Mortgage Interest #1|Mortgage Pay-VHDA Loan|Principal Reduction #1|Mortgage Payable)$/i.test(accountName) ? 'BGAH' : null;
}
