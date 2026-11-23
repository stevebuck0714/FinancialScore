import * as XLSX from 'xlsx';
import type { BankTransactionInput } from './bank-activity';
import type { BankActivityMonth } from './providers';

/** Bank transaction exports (CSV / Excel) uploaded by clients for months the bank connection cannot reach. */

export type ColumnRole = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'checkNumber' | 'account' | 'balance';

export const COLUMN_ROLES: ColumnRole[] = ['date', 'description', 'amount', 'debit', 'credit', 'checkNumber', 'account', 'balance'];

export type TransactionFileMapping = {
  sheet: string | null;
  /** Zero-based row index of the header row. */
  headerRow: number;
  /** Zero-based column index per role. */
  columns: Partial<Record<ColumnRole, number>>;
  /** Single amount column only: true when deposits are positive and withdrawals negative. */
  depositsPositive: boolean;
};

export type TransactionFileSheet = { sheets: string[]; sheet: string | null; rows: string[][] };

export type ParsedFileTransaction = {
  rowIndex: number;
  date: string; // YYYY-MM-DD
  description: string | null;
  /** Positive is money into the account (deposit); negative is money out. */
  amount: number;
  checkNumber: string | null;
  account: string;
  /** Running balance after this transaction, when the file has one. */
  balance: number | null;
};

export type TransactionFileMonth = {
  account: string;
  month: string;
  deposits: number;
  withdrawals: number;
  count: number;
  /** The first or last month of the file, when its dates suggest it is not a full month. */
  partial: boolean;
};

export type TransactionFilePreview = {
  sheets: string[];
  sheet: string | null;
  headers: string[];
  sampleRows: string[][];
  mapping: TransactionFileMapping;
  headerSignature: string;
  detectedLast4: string | null;
  accounts: Array<{ value: string; suggestedLast4: string | null; count: number }>;
  transactions: ParsedFileTransaction[];
  months: TransactionFileMonth[];
  totals: { transactions: number; skippedRows: number; deposits: number; withdrawals: number; firstDate: string | null; lastDate: string | null };
  issues: string[];
};

const MAX_ROWS = 50_000;
const HEADER_SCAN_ROWS = 30;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function readTransactionFile(buffer: Buffer, fileName: string, sheet?: string | null): TransactionFileSheet {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  // raw keeps CSV cells as text so dates and amounts are parsed here, not guessed by the library.
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: isCsv, dense: true, sheetRows: MAX_ROWS + HEADER_SCAN_ROWS });
  const sheets = workbook.SheetNames;
  const chosen = sheet && sheets.includes(sheet) ? sheet : sheets[0] ?? null;
  if (!chosen) return { sheets, sheet: null, rows: [] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[chosen], { header: 1, raw: false, defval: '', blankrows: false });
  return { sheets, sheet: chosen, rows: rows.map((r) => r.map((c) => String(c ?? '').trim())) };
}

const normalizeHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/[:*]+$/g, '')
    .replace(/[_\s]+/g, ' ')
    .trim();

const HEADER_PATTERNS: Record<ColumnRole, RegExp[]> = {
  date: [/^(post(ing|ed)? )?date$/, /^(transaction|trans|txn|effective|value|book(ing)?|process(ed)?) date$/, /^date (posted|of transaction)$/],
  description: [
    /^(description|desc|memo|details?|narrative|payee|name|particulars|transaction|transaction description|transaction details)$/,
    /description/,
  ],
  amount: [/^(transaction )?amount( \(.*\))?$/, /^amt$/, /^net amount$/],
  debit: [/^(debits?|withdrawals?|payments?|money out|charges?|paid out|(debit|withdrawal) amount|amount debit)$/],
  credit: [/^(credits?|deposits?|money in|receipts?|paid in|(credit|deposit) amount|amount credit)$/],
  checkNumber: [/^(check|cheque|chk)( (#|no\.?|num|number))?$/, /^(check|cheque) ?#$/, /^(check|cheque) or slip( (#|no\.?|number))?$/],
  account: [/^(account|acct)( (#|no\.?|number|name))?$/],
  balance: [/^(running |ledger |account |current )?balance$/, /^balance after( transaction)?$/],
};

function roleForHeader(header: string): ColumnRole | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  for (const role of COLUMN_ROLES) if (HEADER_PATTERNS[role].some((p) => p.test(h))) return role;
  return null;
}

function columnsForHeaderRow(row: string[]): Partial<Record<ColumnRole, number>> {
  const columns: Partial<Record<ColumnRole, number>> = {};
  row.forEach((cell, i) => {
    const role = roleForHeader(cell);
    if (role && columns[role] === undefined) columns[role] = i;
  });
  return columns;
}

export function detectMapping(file: TransactionFileSheet): TransactionFileMapping {
  let best: { headerRow: number; columns: Partial<Record<ColumnRole, number>>; score: number } | null = null;
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, file.rows.length); i++) {
    const columns = columnsForHeaderRow(file.rows[i]);
    const hasAmount = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
    if (columns.date === undefined || !hasAmount) continue;
    const score = Object.keys(columns).length;
    if (!best || score > best.score) best = { headerRow: i, columns, score };
  }
  const headerRow = best?.headerRow ?? 0;
  const columns = best?.columns ?? {};
  if (columns.amount !== undefined && (columns.debit !== undefined || columns.credit !== undefined)) {
    delete columns.debit;
    delete columns.credit;
  }
  return { sheet: file.sheet, headerRow, columns, depositsPositive: true };
}

export function headerSignature(file: TransactionFileSheet, mapping: TransactionFileMapping): string {
  return (file.rows[mapping.headerRow] ?? []).map(normalizeHeader).join('|');
}

export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s || s === '-' || s === '--') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\s*(dr|db)\.?$/i.test(s)) {
    sign = -sign;
    s = s.replace(/\s*(dr|db)\.?$/i, '');
  } else {
    s = s.replace(/\s*cr\.?$/i, '');
  }
  if (s.endsWith('-')) {
    sign = -sign;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$£€,\s]/g, '').replace(/^\+/, '');
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1).replace(/^\$/, '');
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return round2(sign * Number(s));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Dates are read as U.S. month/day order, which is how U.S. banks export them. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return ymd(Number(m[3]), Number(m[1]), Number(m[2]));
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
    return ymd(Number(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]));
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})\b/);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) {
    return ymd(Number(m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]));
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 30000 && serial < 80000) {
      const code = XLSX.SSF.parse_date_code(serial);
      if (code) return ymd(code.y, code.m, code.d);
    }
  }
  return null;
}

export function parseTransactions(
  file: TransactionFileSheet,
  mapping: TransactionFileMapping,
): { transactions: ParsedFileTransaction[]; skippedRows: number } {
  const { columns } = mapping;
  const transactions: ParsedFileTransaction[] = [];
  let skippedRows = 0;
  const cell = (row: string[], role: ColumnRole) => (columns[role] === undefined ? '' : row[columns[role]!] ?? '');
  for (let i = mapping.headerRow + 1; i < file.rows.length && i <= mapping.headerRow + MAX_ROWS; i++) {
    const row = file.rows[i];
    if (row.every((c) => !c)) continue;
    const date = parseDate(cell(row, 'date'));
    let amount: number | null = null;
    if (columns.amount !== undefined) {
      const a = parseAmount(cell(row, 'amount'));
      amount = a === null ? null : mapping.depositsPositive ? a : -a;
    } else {
      const credit = parseAmount(cell(row, 'credit'));
      const debit = parseAmount(cell(row, 'debit'));
      if (credit !== null || debit !== null) amount = round2(Math.abs(credit ?? 0) - Math.abs(debit ?? 0));
    }
    if (!date || amount === null || amount === 0) {
      skippedRows += 1;
      continue;
    }
    transactions.push({
      rowIndex: i,
      date,
      description: cell(row, 'description') || null,
      amount,
      checkNumber: cell(row, 'checkNumber') || null,
      account: cell(row, 'account'),
      balance: columns.balance === undefined ? null : parseAmount(cell(row, 'balance')),
    });
  }
  return { transactions, skippedRows };
}

function lastFourDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Looks for an account number in the rows above the header and in the file name. */
export function detectLast4(file: TransactionFileSheet, mapping: TransactionFileMapping, fileName: string): string | null {
  const top = file.rows.slice(0, mapping.headerRow).flat().join(' ');
  const patterns = [
    /(?:account|acct)[^0-9]{0,25}?(?:x+|\*+|#|ending in\s*|\.{2,})?\s*\d*?(\d{4})\b/i,
    /(?:x{2,}|\*{2,}|ending in\s*)(\d{4})\b/i,
  ];
  for (const p of patterns) {
    const m = top.match(p);
    if (m) return m[1];
  }
  const name = fileName.match(/(?:x|\*|#|acct|account)[\s_-]*(\d{4})(?!\d)/i);
  return name ? name[1] : null;
}

export function monthlyTotals(transactions: ParsedFileTransaction[]): TransactionFileMonth[] {
  const byKey = new Map<string, TransactionFileMonth & { firstDay: number; lastDay: number }>();
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    const key = `${t.account}|${month}`;
    const day = Number(t.date.slice(8));
    const entry = byKey.get(key) ?? { account: t.account, month, deposits: 0, withdrawals: 0, count: 0, partial: false, firstDay: 31, lastDay: 1 };
    if (t.amount > 0) entry.deposits = round2(entry.deposits + t.amount);
    else entry.withdrawals = round2(entry.withdrawals - t.amount);
    entry.count += 1;
    entry.firstDay = Math.min(entry.firstDay, day);
    entry.lastDay = Math.max(entry.lastDay, day);
    byKey.set(key, entry);
  }
  const months = [...byKey.values()].sort((a, b) => a.account.localeCompare(b.account) || a.month.localeCompare(b.month));
  for (const account of new Set(months.map((m) => m.account))) {
    const forAccount = months.filter((m) => m.account === account);
    const first = forAccount[0];
    const last = forAccount[forAccount.length - 1];
    if (first && first.firstDay > 7) first.partial = true;
    if (last && last.lastDay < 21) last.partial = true;
  }
  return months.map(({ firstDay: _f, lastDay: _l, ...m }) => m);
}

export function buildPreview(file: TransactionFileSheet, fileName: string, mapping?: TransactionFileMapping | null): TransactionFilePreview {
  const resolved = mapping ?? detectMapping(file);
  const issues: string[] = [];
  const { columns } = resolved;
  if (columns.date === undefined) issues.push('Choose the date column.');
  if (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined) {
    issues.push('Choose an amount column, or debit and credit columns.');
  }
  const { transactions, skippedRows } = issues.length ? { transactions: [], skippedRows: 0 } : parseTransactions(file, resolved);
  if (!issues.length && transactions.length === 0) issues.push('No transactions could be read with these columns.');
  const accountCounts = new Map<string, number>();
  for (const t of transactions) accountCounts.set(t.account, (accountCounts.get(t.account) ?? 0) + 1);
  const dates = transactions.map((t) => t.date).sort();
  return {
    sheets: file.sheets,
    sheet: file.sheet,
    headers: file.rows[resolved.headerRow] ?? [],
    sampleRows: file.rows.slice(resolved.headerRow + 1, resolved.headerRow + 9),
    mapping: resolved,
    headerSignature: headerSignature(file, resolved),
    detectedLast4: detectLast4(file, resolved, fileName),
    accounts: [...accountCounts.entries()].map(([value, count]) => ({ value, suggestedLast4: lastFourDigits(value), count })),
    transactions: transactions.slice(0, 10),
    months: monthlyTotals(transactions),
    totals: {
      transactions: transactions.length,
      skippedRows,
      deposits: round2(transactions.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0)),
      withdrawals: round2(transactions.reduce((s, t) => (t.amount < 0 ? s - t.amount : s), 0)),
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    },
    issues,
  };
}

export type ConfirmedAccount = {
  value: string;
  last4: string;
  name: string | null;
  bankName: string | null;
  /** The Cash Proof account the reviewer chose; it is given this bank and last 4 when it has none. */
  bankAccountId?: string | null;
};

/**
 * Month-end balances from a running balance column, per account value and month. A month is kept
 * only when its first balance, deposits, withdrawals, and last balance foot, so a file whose
 * same-day rows are out of order loses the balance rather than reporting a wrong one.
 */
function monthBalances(transactions: ParsedFileTransaction[]): Map<string, { beginning: number; ending: number }> {
  const out = new Map<string, { beginning: number; ending: number }>();
  for (const account of new Set(transactions.map((t) => t.account))) {
    const rows = transactions.filter((t) => t.account === account);
    if (rows.length === 0 || rows.some((t) => t.balance === null)) continue;
    // Exports list newest first or oldest first; same-day rows follow the file's direction.
    const newestFirst = rows[0].date > rows[rows.length - 1].date;
    const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || (newestFirst ? b.rowIndex - a.rowIndex : a.rowIndex - b.rowIndex));
    const byMonth = new Map<string, ParsedFileTransaction[]>();
    for (const t of ordered) byMonth.set(t.date.slice(0, 7), [...(byMonth.get(t.date.slice(0, 7)) ?? []), t]);
    for (const [month, list] of byMonth) {
      const first = list[0];
      const last = list[list.length - 1];
      const beginning = round2(first.balance! - first.amount);
      const net = list.reduce((s, t) => s + t.amount, 0);
      if (Math.abs(beginning + net - last.balance!) > 0.01) continue;
      out.set(`${account}|${month}`, { beginning, ending: round2(last.balance!) });
    }
  }
  return out;
}

/**
 * Turns a reviewed file into saved transactions and monthly figures for the months the reviewer
 * kept. Beginning and ending balances come from a running balance column when the file has one.
 */
export function buildConfirmedImport(
  file: TransactionFileSheet,
  mapping: TransactionFileMapping,
  accounts: ConfirmedAccount[],
  range: { fromMonth: string | null; toMonth: string | null },
): { activity: BankActivityMonth[]; transactions: BankTransactionInput[] } {
  const byValue = new Map(accounts.map((a) => [a.value, a]));
  const all = parseTransactions(file, mapping).transactions.filter((t) => byValue.has(t.account));
  const balances = monthBalances(all);
  const kept = all.filter((t) => {
    const month = t.date.slice(0, 7);
    return (!range.fromMonth || month >= range.fromMonth) && (!range.toMonth || month <= range.toMonth);
  });
  // Several account values in the file can be confirmed as the same bank account; their balances cannot be combined.
  const merged = new Map<string, BankActivityMonth>();
  for (const m of monthlyTotals(kept)) {
    const account = byValue.get(m.account)!;
    const key = `${account.last4}|${m.month}`;
    const prior = merged.get(key);
    const balance = prior ? null : balances.get(`${m.account}|${m.month}`);
    merged.set(key, {
      last4: account.last4,
      accountName: prior?.accountName ?? account.name,
      bankName: prior?.bankName ?? account.bankName,
      month: m.month,
      beginning: prior ? null : balance?.beginning ?? null,
      deposits: round2((prior?.deposits ?? 0) + m.deposits),
      withdrawals: round2((prior?.withdrawals ?? 0) + m.withdrawals),
      ending: prior ? null : balance?.ending ?? null,
    });
  }
  const activity = [...merged.values()];
  const transactions: BankTransactionInput[] = kept.map((t) => {
    const account = byValue.get(t.account)!;
    return {
      externalId: `row-${t.rowIndex}`,
      institution: account.bankName,
      accountLast4: account.last4,
      accountName: account.name,
      date: t.date,
      dateTransacted: null,
      amount: t.amount,
      currency: null,
      description: t.description,
      merchantName: null,
      category: [],
      categoryId: null,
      creditCategoryPrimary: null,
      creditCategoryDetailed: null,
      checkNumber: t.checkNumber,
      transactionType: null,
      payer: null,
      payee: null,
      byOrderOf: null,
      paymentMethod: null,
      paymentProcessor: null,
      referenceNumber: null,
      ppdId: null,
      reason: null,
      location: null,
    };
  });
  return { activity, transactions };
}
