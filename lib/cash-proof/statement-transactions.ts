import type { ParsedStatement } from './statement-parser';

export type StatementLine = {
  date: string;
  description: string;
  /** + money in, − money out. */
  amount: number;
  checkNumber: string | null;
};

export type StatementTransactionsRead = { ok: true; lines: StatementLine[] } | { ok: false; reason: string };

type Section = 'credit' | 'debit' | 'checks' | 'mixed' | 'stop';
type Draft = { date: string; parts: string[]; candidates: number[]; sign: 1 | -1 | null; balance: number | null; checkNumber: string | null; extra: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAME = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const NUMERIC_DATE = /^\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/;
const NAMED_DATE = new RegExp(`^\\s*${MONTH_NAME}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?=\\s)`, 'i');
const DAY_FIRST_DATE = new RegExp(`^\\s*(\\d{1,2})\\s+${MONTH_NAME}(?:\\s+(\\d{4}))?(?=\\s)`, 'i');
// Cents are required so reference numbers and dates are never read as money; ".45-" is a 45-cent debit.
const MONEY = '\\(?[-−]?\\$?\\s?(?:\\d{1,3}(?:,\\d{3})+|\\d+)?\\.\\d{2}\\)?(?:\\s?-|\\s?CR\\b|\\s?DR\\b)?';
const TRAILING_MONEY = new RegExp(`\\s(${MONEY})\\s*$`, 'i');
const CHECK_ENTRY = new RegExp(
  `(?:(\\d{3,8})\\s*[*^#]?\\s+(\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)|(\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)\\s+(\\d{3,8})\\s*[*^#]?)\\s+(${MONEY})`,
  'gi',
);

const STOP_HEADER = /daily\s+(?:ending\s+)?balance|balance\s+summary|outstanding\s+checks|checks\s+written\s+but\s+not\s+paid|summary\s+of\s+(?:overdraft|fees)|interest\s+summary|year[-\s]to[-\s]date|reconciliation\s+of\s+account/i;
const PAGE_CHROME = /page\s+\d+\s+of\s+\d+|account\s+number|\(continued\)|continued\s+on|^\s*date\s+(?:description|transaction)|enclosures/i;

function toMoney(raw: string): { value: number; negative: boolean | null } {
  const t = raw.trim();
  const value = Math.abs(Number(t.replace(/[^\d.]/g, '')) || 0);
  if (/^\(|\)$|^[-−]|-$|\bDR$/i.test(t)) return { value, negative: true };
  if (/\bCR$/i.test(t)) return { value, negative: false };
  return { value, negative: null };
}

function sectionOf(line: string): Section | null {
  const t = line.trim();
  if (!t || t.length > 90) return null;
  if (STOP_HEADER.test(t)) return 'stop';
  // Summary rows ("31 Deposits/Credits 118,422.58") also name deposits; only bare headings change the section.
  if (new RegExp(MONEY).test(t)) return null;
  const lower = t.toLowerCase();
  const credit = /\b(?:deposits?|credits?|additions)\b/.test(lower);
  const debit = /\b(?:withdrawals?|debits?|subtractions|fees|charges|payments|purchases)\b/.test(lower);
  if (/\bchecks?\b/.test(lower) && !credit) return 'checks';
  if (credit && !debit) return 'credit';
  if (debit && !credit) return 'debit';
  if (/\b(?:activity|transactions?|transaction\s+detail)\b/.test(lower) || (credit && debit)) return 'mixed';
  return null;
}

/** Statement dates usually carry no year; the year comes from the statement period. */
function dateResolver(period: { start?: string; end?: string }, month: string | null) {
  const end = period.end || (month ? `${month}-28` : null);
  if (!end) return null;
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  return (m: number, d: number, y: number | null): string | null => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const year = y === null ? (m > endMonth ? endYear - 1 : endYear) : y < 100 ? 2000 + y : y;
    const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== d ? null : iso;
  };
}

function leadingDate(line: string, resolve: NonNullable<ReturnType<typeof dateResolver>>): { date: string; rest: string } | null {
  let m = line.match(NUMERIC_DATE);
  if (m) {
    const date = resolve(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null);
    return date ? { date, rest: line.slice(m[0].length) } : null;
  }
  m = line.match(NAMED_DATE);
  if (m) {
    const date = resolve(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, Number(m[2]), m[3] ? Number(m[3]) : null);
    return date ? { date, rest: line.slice(m[0].length) } : null;
  }
  m = line.match(DAY_FIRST_DATE);
  if (m) {
    const date = resolve(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, Number(m[1]), m[3] ? Number(m[3]) : null);
    return date ? { date, rest: line.slice(m[0].length) } : null;
  }
  return null;
}

function splitTrailingMoney(rest: string): { text: string; amounts: Array<{ value: number; negative: boolean | null }> } {
  let text = rest;
  const amounts: Array<{ value: number; negative: boolean | null }> = [];
  while (amounts.length < 3) {
    const m = text.match(TRAILING_MONEY);
    if (!m) break;
    amounts.unshift(toMoney(m[1]));
    text = text.slice(0, m.index);
  }
  return { text: text.replace(/\s+/g, ' ').trim(), amounts };
}

function inWindow(date: string, period: { start?: string; end?: string }): boolean {
  const pad = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  if (period.start && date < pad(period.start, -7)) return false;
  if (period.end && date > pad(period.end, 7)) return false;
  return true;
}

/**
 * Reads the transaction lines of a bank statement PDF's text. The result is only accepted when the
 * lines add up to the statement's own totals, so a layout the reader gets wrong is never used.
 */
export function readStatementTransactions(
  rawText: string,
  statement: ParsedStatement,
  period: { start?: string; end?: string },
): StatementTransactionsRead {
  const resolve = dateResolver(period, statement.month);
  if (!resolve) return { ok: false, reason: 'the statement period was not found' };
  if (statement.beginning === null && statement.deposits === null) {
    return { ok: false, reason: 'the statement totals were not read, so the lines could not be checked' };
  }
  const lines = rawText.replace(/\u00a0/g, ' ').split(/\r?\n/);

  const drafts: Draft[] = [];
  let section: Section = 'mixed';
  let last: Draft | null = null;
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/, '');
    if (!line.trim()) continue;
    const heading = leadingDate(line, resolve) ? null : sectionOf(line);
    if (heading) {
      section = heading;
      last = null;
      continue;
    }
    if (section === 'stop') continue;
    if (PAGE_CHROME.test(line)) continue;

    if (section === 'checks') {
      const entries = [...line.matchAll(CHECK_ENTRY)];
      const leftover = line.replace(CHECK_ENTRY, '').trim();
      if (entries.length > 0 && !/[a-z]{3,}/i.test(leftover)) {
        for (const e of entries) {
          const dateText = e[2] || e[3];
          const [mm, dd, yy] = dateText.split(/[/-]/).map(Number);
          const date = resolve(mm, dd, yy ?? null);
          if (!date) continue;
          const money = toMoney(e[5]);
          drafts.push({ date, parts: ['Check'], candidates: [money.value], sign: -1, balance: null, checkNumber: e[1] || e[4], extra: 0 });
        }
        last = null;
        continue;
      }
    }

    const dated = leadingDate(line, resolve);
    if (dated && inWindow(dated.date, period)) {
      const { text, amounts } = splitTrailingMoney(dated.rest);
      if (amounts.length > 0) {
        const balance = amounts.length > 1 ? amounts[amounts.length - 1] : null;
        const money = amounts.length > 1 ? amounts.slice(0, -1) : amounts;
        const marked = money.find((a) => a.negative !== null);
        const sign: 1 | -1 | null =
          marked ? (marked.negative ? -1 : 1) : section === 'credit' ? 1 : section === 'debit' || section === 'checks' ? -1 : null;
        const check = text.match(/\b(?:check|chk|ck)\s*#?\s*(\d{3,8})\b/i) || (section === 'checks' ? text.match(/^#?(\d{3,8})\b/) : null);
        last = {
          date: dated.date,
          parts: [text || (check ? 'Check' : '')],
          candidates: money.map((a) => a.value),
          sign,
          balance: balance ? (balance.negative ? -balance.value : balance.value) : null,
          checkNumber: check ? check[1] : null,
          extra: 0,
        };
        drafts.push(last);
        continue;
      }
    }
    // Wrapped description lines (reference numbers, originator names) belong to the line above.
    if (last && last.extra < 3 && !TRAILING_MONEY.test(line)) {
      last.parts.push(line.trim());
      last.extra += 1;
    }
  }
  if (drafts.length === 0) return { ok: false, reason: 'no transaction lines were found' };

  // Running balances settle the sign (and which column is the amount) wherever the statement prints them.
  let running = statement.beginning;
  let pending: Draft[] = [];
  let chained = 0;
  let chainBreaks = 0;
  const settle = (d: Draft, signedTarget: number) => {
    for (const c of d.candidates) {
      for (const s of [1, -1] as const) {
        if (Math.abs(s * c - signedTarget) <= 0.01) {
          d.candidates = [c];
          d.sign = s;
          return true;
        }
      }
    }
    return false;
  };
  for (const d of drafts) {
    if (d.balance === null) {
      pending.push(d);
      continue;
    }
    if (running !== null) {
      const known = pending.reduce((s, p) => (p.sign === null ? s : s + p.sign * p.candidates[0]), 0);
      const unknown = pending.filter((p) => p.sign === null);
      const target = round2(d.balance - running - known);
      if (unknown.length === 0 && settle(d, target)) chained += 1;
      else chainBreaks += 1;
    }
    running = d.balance;
    pending = [];
  }

  const lineCount = (n: number) => `${n} line${n === 1 ? '' : 's'}`;
  const unsigned = drafts.filter((d) => d.sign === null || d.candidates.length !== 1).length;
  if (unsigned > 0) {
    return {
      ok: false,
      reason:
        chainBreaks > 0
          ? `the running balance does not carry through ${lineCount(chainBreaks)}, so a line was missed or misread`
          : `could not tell deposits from withdrawals on ${lineCount(unsigned)}`,
    };
  }

  const result: StatementLine[] = drafts.map((d) => ({
    date: d.date,
    description: d.parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 300),
    amount: round2(d.sign! * d.candidates[0]),
    checkNumber: d.checkNumber,
  }));
  const credits = round2(result.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const debits = round2(result.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0));
  const totalsTie =
    statement.deposits !== null &&
    statement.withdrawals !== null &&
    Math.abs(credits - statement.deposits) <= 0.01 &&
    Math.abs(debits - statement.withdrawals) <= 0.01;
  const netTies =
    statement.beginning !== null && statement.ending !== null && Math.abs(statement.beginning + credits - debits - statement.ending) <= 0.01;
  if (totalsTie || (netTies && chained > 0 && chainBreaks === 0)) return { ok: true, lines: result };
  if (statement.deposits !== null && statement.withdrawals !== null) {
    return {
      ok: false,
      reason: `the ${result.length} lines read total ${fmt(credits)} in and ${fmt(debits)} out, but the statement shows ${fmt(statement.deposits)} and ${fmt(statement.withdrawals)}`,
    };
  }
  return { ok: false, reason: 'the statement totals were not read, so the lines could not be checked' };
}
