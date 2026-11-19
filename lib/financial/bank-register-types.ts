export const ALL_BANK_ACCOUNTS = '__ALL__';

export type BankRegisterAccount = { key: string; name: string };

export type BankRegisterLine = {
  date: string;
  accountName: string;
  type: string;
  num: string;
  description: string;
  amount: number;
};

export type BankRegisterTransaction = BankRegisterLine & { balance: number };

export type BankRegister = {
  accounts: BankRegisterAccount[];
  accountKey: string;
  startDate: string;
  endDate: string;
  beginningBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  endingBalance: number;
  /** Balance on endDate computed independently from the books; differs from endingBalance only when the books have a gap. */
  ledgerEndingBalance: number | null;
  transactions: BankRegisterTransaction[];
  /** "YYYY-MM" months with any posting to the selected account(s), newest first. */
  activityMonths: string[];
};
