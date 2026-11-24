import { addEstCalendarDays } from '@/lib/time/eastern';
import type { BookDepositAdjustment } from './book-deposit-classification';
import type { RevenueAdjustmentCategory } from './revenue-reconciliation';
import { loadBankLines } from './transaction-match-run';
import type { BankLine } from './transaction-match';

/** A deposit that looks non-revenue but needs a person to confirm it before it is removed. */
export type BankDepositSuggestion = {
  key: string;
  bankAccountId: string;
  month: string;
  date: string;
  category: RevenueAdjustmentCategory;
  amount: number;
  description: string;
  reason: string;
};

export type BankDepositClassification = {
  adjustments: BookDepositAdjustment[];
  suggestions: BankDepositSuggestion[];
};

type Account = { id: string; accountName: string; bankName: string | null; accountLast4: string | null; included: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;
const PAIR_DAYS = 4;
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`;
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const TRANSFER_WORDS = /\b(?:transfer|xfer|trnsfr|tfr|trf)\b/i;
const TRANSFER_FROM_OWN = /\b(?:from|frm)\s+(?:share|savings?|sav|checking|chk|chkg|dda|money\s+market|mm|account|acct)\b/i;
const LOAN = /\b(?:loan\s+(?:proceeds|advance|disbursement|funding|deposit)|line\s+of\s+credit|loc\s+(?:advance|draw)|advance\s+from\s+loc|sba\s+(?:loan|eidl)|eidl|ppp\s+loan|kabbage|ondeck|bluevine|fundbox|square\s+capital|shopify\s+capital|paypal\s+working\s+capital|merchant\s+cash\s+advance|loan\s+draw)\b/i;
const INTEREST = /\b(?:interest\s+(?:paid|earned|credit|deposit|payment)|int\s+earned|dividend\s+(?:paid|earned))\b/i;
const REFUND = /\b(?:refund|rebate|reversal|reversed|returned\s+item|return\s+of\s+(?:funds|payment)|irs\s+treas|tax\s+ref|insurance\s+(?:claim|proceeds)|claim\s+payment)\b/i;
const OWNER = /\b(?:owner|shareholder|member|capital)\s+(?:contribution|deposit|investment|loan)\b|\bcapital\s+contribution\b|\bloan\s+from\s+(?:owner|shareholder|member)\b/i;
/** Description saved on the hand entry when a suggestion is added, so the suggestion shows as added. */
export const bankSuggestionNote = (s: Pick<BankDepositSuggestion, 'date' | 'description'>) =>
  `Bank deposit ${shortDate(s.date)}: ${s.description}`.slice(0, 500);

const UNUSUAL_MIN = 5_000;
const UNUSUAL_MULTIPLE = 4;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mentionsOtherAccount(description: string, own: Account, accounts: Account[]): Account | null {
  if (!TRANSFER_WORDS.test(description)) return null;
  for (const a of accounts) {
    const last4 = String(a.accountLast4 || '').trim();
    if (a.id === own.id || !last4) continue;
    if (new RegExp(`(?:x|\\*|#|ending\\s+in\\s*|\\b)${last4}\\b`, 'i').test(description)) return a;
  }
  return null;
}

/**
 * Non-revenue deposits read from the bank transactions themselves, for any accounting system.
 * Certain cases (a matching withdrawal from another company account, loan proceeds, interest,
 * refunds) are applied; owner money and unusually large deposits are only suggested.
 */
export async function loadBankDepositClassification(
  companyId: string,
  accounts: Account[],
  startDate: string,
  endDate: string,
): Promise<BankDepositClassification> {
  if (!accounts.some((a) => a.included)) return { adjustments: [], suggestions: [] };
  const { linesByAccount } = await loadBankLines(
    companyId,
    accounts,
    addEstCalendarDays(startDate, -PAIR_DAYS),
    addEstCalendarDays(endDate, PAIR_DAYS),
  );
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.accountName ?? 'another company account';

  const withdrawals = [...linesByAccount.entries()].flatMap(([accountId, lines]) =>
    lines.filter((l) => l.amount < 0).map((l) => ({ accountId, line: l, used: false })),
  );
  const findPair = (accountId: string, line: BankLine) => {
    const lo = addEstCalendarDays(line.date, -PAIR_DAYS);
    const hi = addEstCalendarDays(line.date, PAIR_DAYS);
    // A same-amount pair is only a transfer when it is round or either side says so; card payouts have cents.
    const roundAmount = line.amount >= 100 && Math.abs(line.amount - Math.round(line.amount)) < 0.005;
    const candidates = withdrawals.filter(
      (w) =>
        !w.used &&
        w.accountId !== accountId &&
        Math.abs(w.line.amount + line.amount) < 0.005 &&
        w.line.date >= lo &&
        w.line.date <= hi &&
        (roundAmount || TRANSFER_WORDS.test(line.description) || TRANSFER_WORDS.test(w.line.description)),
    );
    candidates.sort(
      (a, b) => Math.abs(Date.parse(a.line.date) - Date.parse(line.date)) - Math.abs(Date.parse(b.line.date) - Date.parse(line.date)),
    );
    return candidates[0] ?? null;
  };

  const byKey = new Map<string, BookDepositAdjustment>();
  const suggestions: BankDepositSuggestion[] = [];
  const apply = (accountId: string, line: BankLine, category: RevenueAdjustmentCategory, reason: string) => {
    const month = line.date.slice(0, 7);
    const key = `${accountId}|${month}|${category}`;
    const adj = byKey.get(key) ?? { bankAccountId: accountId, month, category, amount: 0, transactions: [] };
    adj.amount = round2(adj.amount + line.amount);
    adj.transactions.push({ date: line.date, type: 'Bank', description: line.description, offsetAccount: reason, amount: line.amount });
    byKey.set(key, adj);
  };

  for (const account of accounts.filter((a) => a.included)) {
    const deposits = (linesByAccount.get(account.id) ?? []).filter((l) => l.amount > 0 && l.date >= startDate && l.date <= endDate);
    const typical = median(deposits.map((d) => d.amount));
    for (const line of deposits) {
      const text = line.description || '';
      const category = String(line.category || '');
      const pair = findPair(account.id, line);
      if (pair) {
        pair.used = true;
        apply(account.id, line, 'TRANSFER_IN', `Matches the ${fmt(-pair.line.amount)} withdrawal from ${nameOf(pair.accountId)} on ${shortDate(pair.line.date)}`);
        continue;
      }
      const named = mentionsOtherAccount(text, account, accounts);
      if (named) {
        apply(account.id, line, 'TRANSFER_IN', `Transfer from ${named.accountName}`);
        continue;
      }
      if (/internal account transfer/i.test(category) || (TRANSFER_WORDS.test(text) && TRANSFER_FROM_OWN.test(text))) {
        apply(account.id, line, 'TRANSFER_IN', 'Transfer from another account at the bank');
        continue;
      }
      if (LOAN.test(text)) {
        apply(account.id, line, 'LOAN_PROCEEDS', 'Described as loan or credit line money');
        continue;
      }
      if (/interest earned/i.test(category) || INTEREST.test(text)) {
        apply(account.id, line, 'OTHER_INCOME', 'Interest paid by the bank');
        continue;
      }
      if (REFUND.test(text)) {
        apply(account.id, line, 'REFUND_REBATE', 'Described as a refund, reversal, or returned item');
        continue;
      }
      const base = { bankAccountId: account.id, month: line.date.slice(0, 7), date: line.date, amount: line.amount, description: text };
      if (OWNER.test(text)) {
        suggestions.push({ ...base, key: line.id, category: 'OWNER_CONTRIBUTION', reason: 'Described as owner or shareholder money' });
      } else if (deposits.length >= 6 && line.amount >= UNUSUAL_MIN && line.amount >= typical * UNUSUAL_MULTIPLE) {
        suggestions.push({
          ...base,
          key: line.id,
          category: 'OTHER_NON_REVENUE',
          reason: `${Math.round(line.amount / typical)}× this account's typical deposit of ${fmt(typical)}`,
        });
      }
    }
  }

  const adjustments = [...byKey.values()]
    .map((a) => ({ ...a, transactions: a.transactions.sort((x, y) => x.date.localeCompare(y.date)) }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.bankAccountId.localeCompare(b.bankAccountId) || a.category.localeCompare(b.category));
  suggestions.sort((a, b) => a.date.localeCompare(b.date));
  return { adjustments, suggestions };
}
