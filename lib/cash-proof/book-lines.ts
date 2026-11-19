import prisma from '@/lib/prisma';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';
import { loadQbdAccountRows, loadQbdGeneralLedgerDetailRows } from '@/lib/quickbooks-desktop/account-books';
import { buildQbdAccountMap, qbdAccountKey } from '@/lib/real-estate/qbd-account-lines';
import { QBO_GL_SOURCE_PLATFORM } from '@/lib/quickbooks-online/general-ledger-sync';
import { utcMidnightForEstDate } from '@/lib/time/eastern';
import type { BookLine } from './transaction-match';

export type BookAccountRef = { id: string; sourceAccountId: string | null; accountName: string };

export type BookLinesResult = {
  linesByAccount: Map<string, BookLine[]>;
  /** First date the General Ledger has any posting for the company; earlier dates are untested. */
  coverageStart: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * General Ledger postings to each cash proof bank account in [startDate, endDate],
 * from the same books the Daily Financials Bank Transactions tab reads.
 * Amounts are + for deposits and − for withdrawals.
 */
export async function loadBookBankLines(
  companyId: string,
  accounts: BookAccountRef[],
  startDate: string,
  endDate: string,
): Promise<BookLinesResult> {
  const linesByAccount = new Map<string, BookLine[]>(accounts.map((a) => [a.id, []]));
  if (accounts.length === 0) return { linesByAccount, coverageStart: null };
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  return isQuickBooksDesktopFamily(company?.accountingSystem)
    ? loadQbd(companyId, accounts, startDate, endDate, linesByAccount)
    : loadGlFacts(companyId, String(company?.accountingSystem || '').toUpperCase() === 'QUICKBOOKS', accounts, startDate, endDate, linesByAccount);
}

async function loadGlFacts(
  companyId: string,
  isQbo: boolean,
  accounts: BookAccountRef[],
  startDate: string,
  endDate: string,
  linesByAccount: Map<string, BookLine[]>,
): Promise<BookLinesResult> {
  const bankAccountIdBySource = new Map<string, string>();
  for (const a of accounts) {
    const source = String(a.sourceAccountId || '').trim();
    if (source && !bankAccountIdBySource.has(source)) bankAccountIdBySource.set(source, a.id);
  }
  const platform = isQbo ? { sourcePlatform: QBO_GL_SOURCE_PLATFORM } : {};
  const [rows, first] = await Promise.all([
    bankAccountIdBySource.size === 0
      ? Promise.resolve([])
      : prisma.gLTransactionFact.findMany({
          where: {
            companyId,
            ...platform,
            accountId: { in: [...bankAccountIdBySource.keys()] },
            transDate: { gte: utcMidnightForEstDate(startDate), lte: utcMidnightForEstDate(endDate) },
          },
          select: { transNum: true, transDate: true, accountId: true, signedAmount: true, ref: true, description: true, sourceTransaction: true },
          orderBy: [{ transDate: 'asc' }, { transNum: 'asc' }],
        }),
    prisma.gLTransactionFact.findFirst({
      where: { companyId, ...platform },
      orderBy: { transDate: 'asc' },
      select: { transDate: true },
    }),
  ]);
  for (const row of rows) {
    const bankAccountId = bankAccountIdBySource.get(row.accountId);
    if (!bankAccountId) continue;
    const type = String(row.sourceTransaction || '').trim();
    const ref = String(row.ref || '').trim();
    // Older QBO syncs stored the internal "Type:Id" key here instead of the document number.
    const num = ref.startsWith(`${type || 'Txn'}:`) ? '' : ref;
    linesByAccount.get(bankAccountId)!.push({
      key: row.transNum,
      date: row.transDate.toISOString().slice(0, 10),
      type,
      num,
      name: String(row.description || '').trim(),
      amount: round2(Number(row.signedAmount) || 0),
    });
  }
  return { linesByAccount, coverageStart: first ? first.transDate.toISOString().slice(0, 10) : null };
}

async function loadQbd(
  companyId: string,
  accounts: BookAccountRef[],
  startDate: string,
  endDate: string,
  linesByAccount: Map<string, BookLine[]>,
): Promise<BookLinesResult> {
  const [accountRows, detailRows] = await Promise.all([
    loadQbdAccountRows(companyId),
    loadQbdGeneralLedgerDetailRows(companyId, startDate, endDate),
  ]);
  const qbdAccounts = [...buildQbdAccountMap(accountRows).values()];
  const bankAccountIdByKey = new Map<string, string>();
  for (const a of accounts) {
    const source = String(a.sourceAccountId || '').trim();
    const match =
      (source && qbdAccounts.find((q) => q.listId === source || q.accountNumber === source)) ||
      qbdAccounts.find((q) => q.key === qbdAccountKey(a.accountName));
    if (match && !bankAccountIdByKey.has(match.key)) bankAccountIdByKey.set(match.key, a.id);
  }

  let coverageStart: string | null = null;
  const occurrences = new Map<string, number>();
  for (const row of detailRows) {
    if (!coverageStart || row.txnDate < coverageStart) coverageStart = row.txnDate;
    const bankAccountId = bankAccountIdByKey.get(qbdAccountKey(row.account));
    if (!bankAccountId) continue;
    const amount = round2(row.amount);
    // QuickBooks Desktop report rows carry no transaction id; identical rows are told apart by order.
    const base = `${bankAccountId}|${row.txnDate}|${row.txnType}|${row.num}|${row.name}|${amount.toFixed(2)}`;
    const n = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, n);
    linesByAccount.get(bankAccountId)!.push({
      key: `${row.txnDate}|${row.txnType}|${row.num}|${row.name}|${amount.toFixed(2)}|${n}`,
      date: row.txnDate,
      type: row.txnType,
      num: row.num,
      name: [row.name, row.memo].filter(Boolean).join(' - '),
      amount,
    });
  }
  return { linesByAccount, coverageStart };
}
