/**
 * Book-to-bank transaction matching for the cash proof. Pure: no database access.
 * Amounts are + for money into the account and − for money out, on both sides.
 */

export type BookLine = { key: string; date: string; type: string; num: string; name: string; amount: number };
export type BankLine = {
  id: string;
  externalId: string;
  date: string;
  description: string;
  checkNumber: string | null;
  amount: number;
  /** Bank connection category path, such as "Transfer > Internal Account Transfer". */
  category?: string | null;
};

export type MatchRule = 'CHECK_NUMBER' | 'EXACT' | 'LATE_CLEARING' | 'BATCHED_DEPOSIT' | 'SPLIT_WITHDRAWAL';

/** Stored rule for a book line that has not cleared the bank yet (a reconciling item with no bank side). */
export const OUTSTANDING_RULE = 'OUTSTANDING';

export const MATCH_RULE_LABELS: Record<MatchRule | typeof OUTSTANDING_RULE, string> = {
  OUTSTANDING: 'Not yet cleared',
  CHECK_NUMBER: 'Check number',
  EXACT: 'Amount and date',
  LATE_CLEARING: 'Cleared late',
  BATCHED_DEPOSIT: 'Batched deposit',
  SPLIT_WITHDRAWAL: 'Split payment',
};

export type TransactionExceptionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TransactionExceptionType =
  | 'BANK_ONLY_DEPOSIT'
  | 'BANK_ONLY_WITHDRAWAL'
  | 'BOOK_ONLY_DEPOSIT'
  | 'STALE_OUTSTANDING_CHECK'
  | 'AMOUNT_MISMATCH'
  | 'TOTALS_MISMATCH'
  | 'UNDISCLOSED_BANK_ACCOUNT'
  | 'SHARED_BOOK_ACCOUNT'
  | 'NO_BOOK_ENTRIES'
  | 'RECON_CONFLICT'
  | 'BANK_FEES_INTEREST';

export const TRANSACTION_EXCEPTION_TYPES: Record<TransactionExceptionType, { label: string; severity: TransactionExceptionSeverity }> = {
  UNDISCLOSED_BANK_ACCOUNT: { label: 'Bank account not in the books', severity: 'CRITICAL' },
  SHARED_BOOK_ACCOUNT: { label: 'Two rows use one book account', severity: 'CRITICAL' },
  NO_BOOK_ENTRIES: { label: 'No book entries for this account', severity: 'CRITICAL' },
  BOOK_ONLY_DEPOSIT: { label: 'Deposit in books, not in bank', severity: 'CRITICAL' },
  BANK_ONLY_DEPOSIT: { label: 'Deposit in bank, not in books', severity: 'HIGH' },
  BANK_ONLY_WITHDRAWAL: { label: 'Withdrawal in bank, not in books', severity: 'HIGH' },
  AMOUNT_MISMATCH: { label: 'Check amount differs', severity: 'HIGH' },
  TOTALS_MISMATCH: { label: 'Monthly totals differ', severity: 'HIGH' },
  STALE_OUTSTANDING_CHECK: { label: 'Stale outstanding payment', severity: 'MEDIUM' },
  RECON_CONFLICT: { label: 'Reconciling items differ', severity: 'MEDIUM' },
  BANK_FEES_INTEREST: { label: 'Bank fees / interest not booked', severity: 'LOW' },
};

/** Exceptions about a whole account rather than one transaction; they carry no amount. */
export const ACCOUNT_LEVEL_EXCEPTIONS = new Set<string>(['UNDISCLOSED_BANK_ACCOUNT', 'SHARED_BOOK_ACCOUNT', 'NO_BOOK_ENTRIES']);

export const SEVERITY_ORDER: TransactionExceptionSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const TRANSACTION_EXCEPTION_ORDER = Object.keys(TRANSACTION_EXCEPTION_TYPES) as TransactionExceptionType[];

export type MatchSettings = {
  exactWindowDays: number;
  lateClearingDays: number;
  staleCheckDays: number;
  feeGroupMax: number;
  batchWindowDays: number;
  depositClearingDays: number;
};

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  exactWindowDays: 5,
  lateClearingDays: 60,
  staleCheckDays: 90,
  feeGroupMax: 50,
  batchWindowDays: 3,
  depositClearingDays: 5,
};

export type MatchGroup = {
  rule: MatchRule;
  book: BookLine[];
  bank: BankLine[];
  amount: number;
  dayGap: number;
  month: string;
  isReconcilingItem: boolean;
};

export type ExceptionDraft = {
  type: TransactionExceptionType;
  severity: TransactionExceptionSeverity;
  fingerprint: string;
  bankAccountId: string | null;
  month: string | null;
  date: string | null;
  amount: number;
  description: string;
  detail: Record<string, unknown> | null;
};

export type AccountMatchResult = {
  matches: MatchGroup[];
  exceptions: ExceptionDraft[];
  /** Book lines in the period that have not cleared the bank and are not (yet) exceptions. */
  outstanding: BookLine[];
  /** Book date → date it cleared the bank (null when it has not). */
  bookCleared: Array<{ line: BookLine; clearedDate: string | null }>;
  /** Bank date → date it was booked (null when it was not). */
  bankBooked: Array<{ line: BankLine; bookedDate: string | null }>;
  bankMonths: string[];
  stats: {
    bookLines: number;
    bankLines: number;
    matchedBankLines: number;
    bankDollars: number;
    matchedBankDollars: number;
    reconcilingItems: number;
    outstandingBookLines: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);
const dayNumber = (date: string) => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000);
const dateFromDay = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7);
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const displayDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}/${date.slice(0, 4)}`;
const monthLabel = (month: string) =>
  new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const nextMonth = (month: string) => shiftMonthKey(month, 1);
const previousMonth = (month: string) => shiftMonthKey(month, -1);

const normalizeCheckNumber = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 3 && digits.length <= 10 ? digits : '';
};

function bankCheckNumber(line: BankLine): string {
  return (
    normalizeCheckNumber(line.checkNumber) ||
    normalizeCheckNumber(/\b(?:check|chk|ck)\s*(?:no\.?|#)?\s*(\d{3,10})\b/i.exec(line.description)?.[1])
  );
}

const STOP_WORDS = new Set(['the', 'and', 'inc', 'llc', 'co', 'from', 'to', 'payment', 'deposit', 'des', 'id', 'ach', 'web', 'ppd', 'ccd']);
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)),
  );
function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

const FEE_RE = /\b(fee|fees|charge|chg|interest|int|service|svc|maint|maintenance|overdraft|od|nsf|analysis|dividend)\b/i;

type BookItem = { line: BookLine; day: number; cents: number; matched: boolean };
type BankItem = { line: BankLine; day: number; cents: number; matched: boolean; check: string };

/** Subset of `values` (all positive cents) summing to `target`, size within [minSize, maxSize]. */
function findSubset(target: number, values: number[], minSize: number, maxSize: number, nodeLimit = 20000): number[] | null {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const suffix = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + order[i].v;
  let nodes = 0;
  const picked: number[] = [];
  const dfs = (start: number, remaining: number): boolean => {
    if (remaining === 0) return picked.length >= minSize;
    if (picked.length >= maxSize || ++nodes > nodeLimit) return false;
    for (let k = start; k < order.length; k++) {
      if (suffix[k] < remaining) return false;
      if (order[k].v > remaining) continue;
      picked.push(order[k].i);
      if (dfs(k + 1, remaining - order[k].v)) return true;
      picked.pop();
    }
    return false;
  };
  return dfs(0, target) ? [...picked] : null;
}

export function matchAccountTransactions(input: {
  bankAccountId: string;
  accountLabel: string;
  book: BookLine[];
  bank: BankLine[];
  periodStart: string;
  periodEnd: string;
  bookCoverageStart: string | null;
  /** Months the client's bank data fully covers (YYYY-MM). */
  bankMonths: string[];
  settings?: MatchSettings;
}): AccountMatchResult {
  const settings = input.settings ?? DEFAULT_MATCH_SETTINGS;
  const book: BookItem[] = input.book
    .filter((l) => toCents(l.amount) !== 0)
    .map((line) => ({ line, day: dayNumber(line.date), cents: toCents(line.amount), matched: false }));
  const bank: BankItem[] = input.bank
    .filter((l) => toCents(l.amount) !== 0)
    .map((line) => ({ line, day: dayNumber(line.date), cents: toCents(line.amount), matched: false, check: bankCheckNumber(line) }));
  const matches: MatchGroup[] = [];

  const record = (rule: MatchRule, bookItems: BookItem[], bankItems: BankItem[]) => {
    for (const b of bookItems) b.matched = true;
    for (const b of bankItems) b.matched = true;
    const bookDays = bookItems.map((b) => b.day);
    const bankDays = bankItems.map((b) => b.day);
    const firstBook = dateFromDay(Math.min(...bookDays));
    const lastBank = dateFromDay(Math.max(...bankDays));
    const firstBank = dateFromDay(Math.min(...bankDays));
    matches.push({
      rule,
      book: bookItems.map((b) => b.line),
      bank: bankItems.map((b) => b.line),
      amount: round2(bankItems.reduce((s, b) => s + b.cents, 0) / 100),
      dayGap: Math.max(Math.abs(Math.max(...bankDays) - Math.min(...bookDays)), Math.abs(Math.min(...bankDays) - Math.max(...bookDays))),
      month: monthOf(firstBook),
      isReconcilingItem: monthOf(lastBank) !== monthOf(firstBook) || monthOf(firstBank) !== monthOf(firstBook),
    });
  };

  const pairUp = (
    rule: MatchRule,
    bookFilter: (b: BookItem) => boolean,
    accept: (b: BookItem, k: BankItem) => boolean,
  ) => {
    const bankByCents = new Map<number, BankItem[]>();
    for (const k of bank) {
      if (k.matched) continue;
      const list = bankByCents.get(k.cents) ?? [];
      list.push(k);
      bankByCents.set(k.cents, list);
    }
    const pairs: Array<{ b: BookItem; k: BankItem; gap: number; sim: number }> = [];
    for (const b of book) {
      if (b.matched || !bookFilter(b)) continue;
      for (const k of bankByCents.get(b.cents) ?? []) {
        if (!accept(b, k)) continue;
        pairs.push({ b, k, gap: k.day - b.day, sim: similarity(b.line.name, k.line.description) });
      }
    }
    pairs.sort((x, y) => Math.abs(x.gap) - Math.abs(y.gap) || Number(x.gap < 0) - Number(y.gap < 0) || y.sim - x.sim);
    for (const { b, k } of pairs) {
      if (b.matched || k.matched) continue;
      record(rule, [b], [k]);
    }
  };

  // 1. Same check number and amount.
  pairUp(
    'CHECK_NUMBER',
    (b) => b.cents < 0 && normalizeCheckNumber(b.line.num) !== '',
    (b, k) => k.check !== '' && k.check === normalizeCheckNumber(b.line.num) && k.day >= b.day - 3,
  );
  // 2. Same amount within a few days.
  pairUp('EXACT', () => true, (b, k) => Math.abs(k.day - b.day) <= settings.exactWindowDays);
  // 3. Payments that clear late.
  pairUp(
    'LATE_CLEARING',
    (b) => b.cents < 0,
    (b, k) => k.day - b.day > settings.exactWindowDays && k.day - b.day <= settings.lateClearingDays,
  );
  // 4. One bank deposit made up of several book receipts.
  for (const k of [...bank].sort((a, b) => a.day - b.day)) {
    if (k.matched || k.cents <= 0) continue;
    const candidates = book
      .filter((b) => !b.matched && b.cents > 0 && b.cents < k.cents && Math.abs(b.day - k.day) <= settings.batchWindowDays)
      .sort((a, b) => Math.abs(a.day - k.day) - Math.abs(b.day - k.day))
      .slice(0, 30);
    if (candidates.length < 2) continue;
    const subset = findSubset(k.cents, candidates.map((c) => c.cents), 2, 15);
    if (subset) record('BATCHED_DEPOSIT', subset.map((i) => candidates[i]), [k]);
  }
  // 5. One book payment split across several bank debits.
  for (const b of [...book].sort((x, y) => x.day - y.day)) {
    if (b.matched || b.cents >= 0) continue;
    const candidates = bank
      .filter((k) => !k.matched && k.cents < 0 && k.cents > b.cents && Math.abs(k.day - b.day) <= settings.batchWindowDays)
      .sort((x, y) => Math.abs(x.day - b.day) - Math.abs(y.day - b.day))
      .slice(0, 30);
    if (candidates.length < 2) continue;
    const subset = findSubset(-b.cents, candidates.map((c) => -c.cents), 2, 5);
    if (subset) record('SPLIT_WITHDRAWAL', [b], subset.map((i) => candidates[i]));
  }

  // Exceptions.
  const periodStartDay = dayNumber(input.periodStart);
  const periodEndDay = dayNumber(input.periodEnd);
  const inPeriod = (day: number) => day >= periodStartDay && day <= periodEndDay;
  const bookCoverageDay = input.bookCoverageStart ? dayNumber(input.bookCoverageStart) : null;
  const bankMonths = new Set(input.bankMonths);
  const sortedBankMonths = [...bankMonths].sort();
  const lastCoveredDay = sortedBankMonths.length ? dayNumber(lastDayOfMonth(sortedBankMonths[sortedBankMonths.length - 1])) : null;
  const covered = (day: number) => bankMonths.has(monthOf(dateFromDay(day)));
  const exceptions: ExceptionDraft[] = [];
  const add = (
    type: TransactionExceptionType,
    fingerprint: string,
    date: string | null,
    amount: number,
    description: string,
    detail: Record<string, unknown> | null,
  ) =>
    exceptions.push({
      type,
      severity: TRANSACTION_EXCEPTION_TYPES[type].severity,
      fingerprint: `${type}|${input.bankAccountId}|${fingerprint}`,
      bankAccountId: input.bankAccountId,
      month: date ? monthOf(date) : null,
      date,
      amount: round2(amount),
      description,
      detail,
    });

  // Same check number, different amount.
  const bankByCheck = new Map<string, BankItem[]>();
  for (const k of bank) {
    if (k.matched || !k.check) continue;
    bankByCheck.set(k.check, [...(bankByCheck.get(k.check) ?? []), k]);
  }
  for (const b of book) {
    const check = normalizeCheckNumber(b.line.num);
    if (b.matched || b.cents >= 0 || !check || !inPeriod(b.day)) continue;
    const k = (bankByCheck.get(check) ?? []).find((c) => !c.matched && c.cents < 0 && c.day >= b.day - 3 && c.day - b.day <= settings.lateClearingDays);
    if (!k) continue;
    b.matched = true;
    k.matched = true;
    add(
      'AMOUNT_MISMATCH',
      `${check}|${b.line.key}`,
      b.line.date,
      (k.cents - b.cents) / 100,
      `Check ${check} is booked at ${money(-b.line.amount)} on ${displayDate(b.line.date)} but cleared the bank at ${money(-k.line.amount)} on ${displayDate(k.line.date)}.`,
      { book: [b.line], bank: [k.line] },
    );
  }

  // Bank activity with no book entry.
  const feesByMonth = new Map<string, BankLine[]>();
  for (const k of bank) {
    if (k.matched || !inPeriod(k.day) || bookCoverageDay === null || k.day < bookCoverageDay) continue;
    const line = k.line;
    if (Math.abs(line.amount) <= settings.feeGroupMax && FEE_RE.test(line.description)) {
      const month = monthOf(line.date);
      feesByMonth.set(month, [...(feesByMonth.get(month) ?? []), line]);
      continue;
    }
    const isDeposit = k.cents > 0;
    add(
      isDeposit ? 'BANK_ONLY_DEPOSIT' : 'BANK_ONLY_WITHDRAWAL',
      line.externalId || line.id,
      line.date,
      line.amount,
      `${isDeposit ? 'Deposit' : 'Withdrawal'} of ${money(Math.abs(line.amount))} on ${displayDate(line.date)} is on the bank statement but not recorded in the books${line.description ? ` (${line.description})` : ''}.`,
      { bank: [line] },
    );
  }
  for (const [month, lines] of feesByMonth) {
    const net = lines.reduce((s, l) => s + l.amount, 0);
    add(
      'BANK_FEES_INTEREST',
      month,
      lastDayOfMonth(month),
      net,
      `${lines.length} small bank fee or interest item${lines.length === 1 ? '' : 's'} (net ${money(net)}) not recorded in the books in ${monthLabel(month)}.`,
      { bank: lines },
    );
  }

  // Book entries that never reached the bank.
  const outstanding: BookLine[] = [];
  for (const b of book) {
    if (b.matched || !inPeriod(b.day)) continue;
    const line = b.line;
    if (b.cents > 0) {
      if (!covered(b.day) || !covered(b.day + settings.depositClearingDays)) {
        outstanding.push(line);
        continue;
      }
      add(
        'BOOK_ONLY_DEPOSIT',
        line.key,
        line.date,
        line.amount,
        `Deposit of ${money(line.amount)} booked on ${displayDate(line.date)} never appears on the bank statement${line.name ? ` (${line.name})` : ''}.`,
        { book: [line] },
      );
    } else if (covered(b.day) && lastCoveredDay !== null && lastCoveredDay - b.day >= settings.staleCheckDays) {
      add(
        'STALE_OUTSTANDING_CHECK',
        line.key,
        line.date,
        line.amount,
        `${line.num ? `Check ${line.num}` : 'Payment'} of ${money(-line.amount)} booked on ${displayDate(line.date)} has not cleared the bank after ${settings.staleCheckDays} days${line.name ? ` (${line.name})` : ''}.`,
        { book: [line] },
      );
    } else {
      outstanding.push(line);
    }
  }

  const clearedByKey = new Map<string, string>();
  const bookedById = new Map<string, string>();
  for (const m of matches) {
    const lastBank = m.bank.reduce((max, l) => (l.date > max ? l.date : max), m.bank[0].date);
    const firstBook = m.book.reduce((min, l) => (l.date < min ? l.date : min), m.book[0].date);
    for (const l of m.book) clearedByKey.set(l.key, lastBank);
    for (const l of m.bank) bookedById.set(l.id, firstBook);
  }
  const periodBank = bank.filter((k) => inPeriod(k.day));
  const matchedPeriodBank = periodBank.filter((k) => bookedById.has(k.line.id));
  return {
    matches,
    exceptions,
    outstanding,
    bookCleared: book.map((b) => ({ line: b.line, clearedDate: clearedByKey.get(b.line.key) ?? null })),
    bankBooked: bank.map((k) => ({ line: k.line, bookedDate: bookedById.get(k.line.id) ?? null })),
    bankMonths: sortedBankMonths,
    stats: {
      bookLines: book.filter((b) => inPeriod(b.day)).length,
      bankLines: periodBank.length,
      matchedBankLines: matchedPeriodBank.length,
      bankDollars: round2(periodBank.reduce((s, k) => s + Math.abs(k.line.amount), 0)),
      matchedBankDollars: round2(matchedPeriodBank.reduce((s, k) => s + Math.abs(k.line.amount), 0)),
      reconcilingItems: matches.filter((m) => m.isReconcilingItem && inPeriod(dayNumber(m.book[0].date))).length,
      outstandingBookLines: outstanding.length,
    },
  };
}

/**
 * Reconciling items at a month-end, signed the way the tie-out uses them
 * (adjusted bank = statement ending + reconciling items):
 *   + book entries not yet in the bank (deposits in transit, less outstanding payments)
 *   − bank entries not yet in the books
 * Null when the client's bank data does not cover the month.
 */
export function computeReconcilingItems(result: AccountMatchResult, month: string): number | null {
  if (!result.bankMonths.includes(month)) return null;
  const covered = new Set(result.bankMonths);
  const end = lastDayOfMonth(month);
  let total = 0;
  for (const { line, clearedDate } of result.bookCleared) {
    if (line.date > end || !covered.has(monthOf(line.date))) continue;
    if (clearedDate === null || clearedDate > end) total += line.amount;
  }
  for (const { line, bookedDate } of result.bankBooked) {
    if (line.date > end || !covered.has(monthOf(line.date))) continue;
    if (bookedDate === null || bookedDate > end) total -= line.amount;
  }
  return round2(total);
}

/**
 * Book deposits and withdrawals per month against statement totals, for months
 * without line-level bank data. A difference that reverses the next month is
 * timing, not an exception.
 */
export function totalsTestExceptions(input: {
  bankAccountId: string;
  months: string[];
  book: BookLine[];
  statementTotals: Map<string, { deposits: number | null; withdrawals: number | null }>;
  lineLevelMonths: Set<string>;
  bookCoverageStart: string | null;
  tolerance: number;
}): ExceptionDraft[] {
  if (!input.bookCoverageStart) return [];
  const bookTotals = new Map<string, { deposits: number; withdrawals: number }>();
  for (const line of input.book) {
    const month = monthOf(line.date);
    const t = bookTotals.get(month) ?? { deposits: 0, withdrawals: 0 };
    if (line.amount > 0) t.deposits += line.amount;
    else t.withdrawals -= line.amount;
    bookTotals.set(month, t);
  }
  const difference = (month: string, field: 'deposits' | 'withdrawals') => {
    if (input.lineLevelMonths.has(month) || `${month}-01` < input.bookCoverageStart!) return null;
    const statement = input.statementTotals.get(month)?.[field];
    if (statement === null || statement === undefined) return null;
    return round2((bookTotals.get(month)?.[field] ?? 0) - statement);
  };
  const out: ExceptionDraft[] = [];
  for (const month of input.months) {
    for (const field of ['deposits', 'withdrawals'] as const) {
      const diff = difference(month, field);
      if (diff === null || Math.abs(diff) <= input.tolerance) continue;
      const following = difference(nextMonth(month), field);
      if (following !== null && Math.abs(diff + following) <= input.tolerance) continue;
      const previous = difference(previousMonth(month), field);
      if (previous !== null && Math.abs(diff + previous) <= input.tolerance) continue;
      const bookValue = round2(bookTotals.get(month)?.[field] ?? 0);
      out.push({
        type: 'TOTALS_MISMATCH',
        severity: TRANSACTION_EXCEPTION_TYPES.TOTALS_MISMATCH.severity,
        fingerprint: `TOTALS_MISMATCH|${input.bankAccountId}|${month}|${field}`,
        bankAccountId: input.bankAccountId,
        month,
        date: lastDayOfMonth(month),
        amount: diff,
        description: `Books show ${money(bookValue)} of ${field} in ${monthLabel(month)}; the bank statement shows ${money(round2(bookValue - diff))} (difference ${money(diff)}).`,
        detail: { field, book: bookValue, statement: round2(bookValue - diff) },
      });
    }
  }
  return out;
}
