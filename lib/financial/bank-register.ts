import { roundCents } from '@/lib/financial/daily-account-detail';
import {
  ALL_BANK_ACCOUNTS,
  type BankRegister,
  type BankRegisterAccount,
  type BankRegisterLine,
} from '@/lib/financial/bank-register-types';

export { ALL_BANK_ACCOUNTS };
export type { BankRegister, BankRegisterAccount, BankRegisterLine };

/**
 * Bank register for a cash proof: beginning balance, every posting in the
 * period with a running balance, totals, and the ending balance. Amounts are
 * debit-positive (deposits positive, withdrawals negative).
 */
export function buildBankRegister(input: {
  accounts: BankRegisterAccount[];
  accountKey: string;
  startDate: string;
  endDate: string;
  beginningBalance: number;
  ledgerEndingBalance: number | null;
  lines: BankRegisterLine[];
  activityMonths: string[];
}): BankRegister {
  const lines = input.lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.date.localeCompare(b.line.date) || a.index - b.index)
    .map(({ line }) => line);
  let balance = input.beginningBalance;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  const transactions = lines.map((line) => {
    balance += line.amount;
    if (line.amount >= 0) totalDeposits += line.amount;
    else totalWithdrawals += -line.amount;
    return { ...line, amount: roundCents(line.amount), balance: roundCents(balance) };
  });
  return {
    accounts: input.accounts,
    accountKey: input.accountKey,
    startDate: input.startDate,
    endDate: input.endDate,
    beginningBalance: roundCents(input.beginningBalance),
    totalDeposits: roundCents(totalDeposits),
    totalWithdrawals: roundCents(totalWithdrawals),
    endingBalance: roundCents(balance),
    ledgerEndingBalance: input.ledgerEndingBalance == null ? null : roundCents(input.ledgerEndingBalance),
    transactions,
    activityMonths: Array.from(new Set(input.activityMonths.filter((month) => /^\d{4}-\d{2}$/.test(month)))).sort().reverse(),
  };
}

export function resolveBankRegisterSelection(accounts: BankRegisterAccount[], requestedKey: string | null | undefined) {
  const key = String(requestedKey || '').trim();
  if (key && key !== ALL_BANK_ACCOUNTS && accounts.some((account) => account.key === key)) {
    return { accountKey: key, keys: [key] };
  }
  return { accountKey: ALL_BANK_ACCOUNTS, keys: accounts.map((account) => account.key) };
}
