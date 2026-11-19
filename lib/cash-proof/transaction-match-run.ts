import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { parseBankActivity } from '@/lib/bank-statements/providers';
import { linkedStatementAccount, matchStatementAccount, statementAccountLabel } from '@/lib/bank-statements/account-match';
import { loadDetectedStatementAccounts } from '@/lib/bank-statements/detected-accounts';
import { addEstCalendarDays } from '@/lib/time/eastern';
import { shiftMonth } from './book-balances';
import { loadBookBankLines } from './book-lines';
import { computeTieOut } from './tie-out';
import {
  DEFAULT_MATCH_SETTINGS,
  OUTSTANDING_RULE,
  TRANSACTION_EXCEPTION_TYPES,
  computeReconcilingItems,
  lastDayOfMonth,
  matchAccountTransactions,
  totalsTestExceptions,
  type BankLine,
  type ExceptionDraft,
  type MatchSettings,
} from './transaction-match';

export type TransactionMatchAccountSummary = {
  bankAccountId: string;
  bankMonths: string[];
  bookLines: number;
  bankLines: number;
  matchedBankLines: number;
  bankDollars: number;
  matchedBankDollars: number;
  reconcilingItems: number;
  outstandingBookLines: number;
  totalsTestedMonths: number;
};

export type TransactionMatchSummary = {
  runAt: string;
  settings: MatchSettings;
  bookCoverageStart: string | null;
  accounts: TransactionMatchAccountSummary[];
  totals: {
    bankLines: number;
    matchedBankLines: number;
    bankDollars: number;
    matchedBankDollars: number;
    lineLevelAccountMonths: number;
    totalsTestedAccountMonths: number;
    reconcilingItemsFilled: number;
  };
  /** Reconciling items this process wrote, by sample id; a matching value is still ours to update. */
  autoFilledReconcilingItems: Record<string, number>;
};

const WINDOW_DAYS = 60;
const BATCH = 500;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Bank transactions from the Data Room Bank Statements folder, assigned to cash proof accounts. */
async function loadBankLines(
  companyId: string,
  accounts: Array<{ id: string; bankName: string | null; accountLast4: string | null }>,
  startDate: string,
  endDate: string,
) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  const ids = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>)
    .filter((e) => String(e?.folderId || '') === DATAROOM_BANK_STATEMENTS_FOLDER_ID)
    .map((e) => String(e?.documentId || ''))
    .filter(Boolean);
  const linesByAccount = new Map<string, BankLine[]>(accounts.map((a) => [a.id, []]));
  const monthsByAccount = new Map<string, Set<string>>(accounts.map((a) => [a.id, new Set()]));
  if (ids.length === 0) return { linesByAccount, monthsByAccount };

  const [docs, rows] = await Promise.all([
    prisma.dataRoomDocument.findMany({
      where: { companyId, id: { in: ids }, bankTransactions: { some: {} } },
      select: { id: true, statementInstitution: true, bankActivity: true },
    }),
    prisma.bankTransaction.findMany({
      where: { companyId, dataRoomDocumentId: { in: ids }, date: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        externalId: true,
        source: true,
        institution: true,
        accountLast4: true,
        date: true,
        amount: true,
        description: true,
        merchantName: true,
        payer: true,
        payee: true,
        checkNumber: true,
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
  ]);

  // Months each account's line-level bank data fully covers, from the files that carry the lines.
  for (const doc of docs) {
    for (const activity of parseBankActivity(doc.bankActivity)) {
      const { account } = matchStatementAccount(accounts, activity.last4, doc.statementInstitution);
      if (account) monthsByAccount.get(account.id)!.add(activity.month);
    }
  }

  // When a bank connection and a transaction file both cover an account-month, the bank connection wins.
  const assigned = rows.flatMap((row) => {
    const { account } = matchStatementAccount(accounts, row.accountLast4, row.institution);
    return account ? [{ accountId: account.id, row }] : [];
  });
  const plaidMonths = new Set(
    assigned.filter((a) => a.row.source === 'PLAID_ASSETS').map((a) => `${a.accountId}|${a.row.date.slice(0, 7)}`),
  );
  for (const { accountId, row } of assigned) {
    if (row.source !== 'PLAID_ASSETS' && plaidMonths.has(`${accountId}|${row.date.slice(0, 7)}`)) continue;
    const description = [row.description || row.merchantName, row.payer || row.payee].filter(Boolean).join(' · ');
    linesByAccount.get(accountId)!.push({
      id: row.id,
      externalId: row.externalId,
      date: row.date,
      description,
      checkNumber: row.checkNumber,
      amount: round2(row.amount),
    });
  }
  return { linesByAccount, monthsByAccount };
}

/**
 * Matches every included account's General Ledger postings to the client's bank
 * transactions, fills blank reconciling items on sampled months, and saves the
 * matches and exceptions. Exceptions keep their resolution across runs by fingerprint.
 */
export async function runTransactionMatch(companyId: string, engagementId: string): Promise<TransactionMatchSummary> {
  const engagement = await prisma.cashProofEngagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { bankAccounts: { include: { deposits: true, bookBalances: true } }, samples: true },
  });
  const settings = DEFAULT_MATCH_SETTINGS;
  const included = engagement.bankAccounts.filter((a) => a.included);
  const periodStart = `${engagement.periodStartMonth}-01`;
  const periodEnd = lastDayOfMonth(engagement.periodEndMonth);
  const windowStart = addEstCalendarDays(periodStart, -WINDOW_DAYS);

  const [{ linesByAccount: bookByAccount, coverageStart }, { linesByAccount: bankByAccount, monthsByAccount }, detected] =
    await Promise.all([
      loadBookBankLines(companyId, included, windowStart, periodEnd),
      loadBankLines(companyId, engagement.bankAccounts, windowStart, addEstCalendarDays(periodEnd, WINDOW_DAYS)),
      loadDetectedStatementAccounts(companyId),
    ]);

  const previous = (engagement.transactionMatch as unknown as TransactionMatchSummary | null)?.autoFilledReconcilingItems || {};
  const autoFilled: Record<string, number> = {};
  const matchRows: Prisma.CashProofTransactionMatchCreateManyInput[] = [];
  const exceptions: ExceptionDraft[] = [];
  const accountSummaries: TransactionMatchAccountSummary[] = [];
  const sampleUpdates: Array<{ id: string; reconcilingItems: number; status: string }> = [];
  const months: string[] = [];
  for (let m = engagement.periodStartMonth; m <= engagement.periodEndMonth; m = shiftMonth(m, 1)) months.push(m);

  for (const account of included) {
    const book = bookByAccount.get(account.id) ?? [];
    const bank = bankByAccount.get(account.id) ?? [];
    const bankMonths = [...(monthsByAccount.get(account.id) ?? [])];
    const result = matchAccountTransactions({
      bankAccountId: account.id,
      accountLabel: account.accountName,
      book,
      bank,
      periodStart,
      periodEnd,
      bookCoverageStart: coverageStart,
      bankMonths,
      settings,
    });
    exceptions.push(...result.exceptions);
    for (const m of result.matches) {
      matchRows.push({
        engagementId,
        bankAccountId: account.id,
        month: m.month,
        rule: m.rule,
        amount: m.amount,
        dayGap: m.dayGap,
        isReconcilingItem: m.isReconcilingItem,
        detail: { book: m.book, bank: m.bank } as unknown as Prisma.InputJsonValue,
      });
    }
    for (const line of result.outstanding) {
      matchRows.push({
        engagementId,
        bankAccountId: account.id,
        month: line.date.slice(0, 7),
        rule: OUTSTANDING_RULE,
        amount: line.amount,
        dayGap: 0,
        isReconcilingItem: true,
        detail: { book: [line], bank: [] } as unknown as Prisma.InputJsonValue,
      });
    }

    // Statement totals for months without line-level bank data.
    const lineLevelMonths = new Set(result.bankMonths);
    const statementTotals = new Map<string, { deposits: number | null; withdrawals: number | null }>();
    for (const d of account.deposits) statementTotals.set(d.month, { deposits: d.totalDeposits, withdrawals: null });
    const accountSamples = engagement.samples.filter((s) => s.bankAccountId === account.id);
    for (const s of accountSamples) {
      if (s.statementDeposits !== null || s.statementWithdrawals !== null) {
        statementTotals.set(s.month, { deposits: s.statementDeposits, withdrawals: s.statementWithdrawals });
      }
    }
    const periodBook = book.filter((l) => l.date >= periodStart && l.date <= periodEnd);
    exceptions.push(
      ...totalsTestExceptions({
        bankAccountId: account.id,
        months,
        book: periodBook,
        statementTotals,
        lineLevelMonths,
        bookCoverageStart: coverageStart,
        tolerance: engagement.balanceTolerance,
      }),
    );

    // Reconciling items on sampled months: fill blanks, flag disagreements.
    for (const sample of accountSamples) {
      if (sample.statementEnding === null) continue;
      const computed = computeReconcilingItems(result, sample.month);
      if (computed === null) continue;
      const ours = sample.id in previous && sample.reconcilingItems !== null && Math.abs(sample.reconcilingItems - previous[sample.id]) < 0.005;
      if (sample.reconcilingItems === null || ours) {
        autoFilled[sample.id] = computed;
        if (sample.reconcilingItems !== null && Math.abs(sample.reconcilingItems - computed) < 0.005) continue;
        const book = account.bookBalances.find((b) => b.month === sample.month)?.endingBalance ?? null;
        const prior = accountSamples.find((s) => s.month === shiftMonth(sample.month, -1));
        const tieOut = computeTieOut({ ...sample, reconcilingItems: computed }, book, prior?.statementEnding ?? null, engagement.balanceTolerance);
        sampleUpdates.push({ id: sample.id, reconcilingItems: computed, status: tieOut.status });
      } else if (Math.abs(sample.reconcilingItems - computed) > engagement.balanceTolerance) {
        const diff = round2(sample.reconcilingItems - computed);
        exceptions.push({
          type: 'RECON_CONFLICT',
          severity: TRANSACTION_EXCEPTION_TYPES.RECON_CONFLICT.severity,
          fingerprint: `RECON_CONFLICT|${account.id}|${sample.month}`,
          bankAccountId: account.id,
          month: sample.month,
          date: lastDayOfMonth(sample.month),
          amount: diff,
          description: `Reconciling items entered as ${fmt(sample.reconcilingItems)}; matching calculates ${fmt(computed)} from uncleared items (difference ${fmt(diff)}).`,
          detail: { entered: sample.reconcilingItems, calculated: computed },
        });
      }
    }

    accountSummaries.push({
      bankAccountId: account.id,
      bankMonths: result.bankMonths.filter((m) => m >= engagement.periodStartMonth && m <= engagement.periodEndMonth),
      ...result.stats,
      totalsTestedMonths: months.filter((m) => !lineLevelMonths.has(m) && statementTotals.has(m)).length,
    });
  }

  // Bank accounts in the Data Room with no account in the books.
  for (const d of detected) {
    if (engagement.bankAccounts.some((a) => linkedStatementAccount(a, [d]))) continue;
    exceptions.push({
      type: 'UNDISCLOSED_BANK_ACCOUNT',
      severity: TRANSACTION_EXCEPTION_TYPES.UNDISCLOSED_BANK_ACCOUNT.severity,
      fingerprint: `UNDISCLOSED_BANK_ACCOUNT|${d.key}`,
      bankAccountId: null,
      month: null,
      date: null,
      amount: 0,
      description: `Bank statements in the Data Room for ${statementAccountLabel(d)} (${d.months} month${d.months === 1 ? '' : 's'}) do not match any account in the books. Ask the client whether this account belongs to the business.`,
      detail: { statementAccount: d },
    });
  }

  const summary: TransactionMatchSummary = {
    runAt: new Date().toISOString(),
    settings,
    bookCoverageStart: coverageStart,
    accounts: accountSummaries,
    totals: {
      bankLines: accountSummaries.reduce((s, a) => s + a.bankLines, 0),
      matchedBankLines: accountSummaries.reduce((s, a) => s + a.matchedBankLines, 0),
      bankDollars: round2(accountSummaries.reduce((s, a) => s + a.bankDollars, 0)),
      matchedBankDollars: round2(accountSummaries.reduce((s, a) => s + a.matchedBankDollars, 0)),
      lineLevelAccountMonths: accountSummaries.reduce((s, a) => s + a.bankMonths.length, 0),
      totalsTestedAccountMonths: accountSummaries.reduce((s, a) => s + a.totalsTestedMonths, 0),
      reconcilingItemsFilled: sampleUpdates.length,
    },
    autoFilledReconcilingItems: autoFilled,
  };

  await persist(engagementId, matchRows, exceptions, sampleUpdates, summary);
  return summary;
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

async function persist(
  engagementId: string,
  matchRows: Prisma.CashProofTransactionMatchCreateManyInput[],
  drafts: ExceptionDraft[],
  sampleUpdates: Array<{ id: string; reconcilingItems: number; status: string }>,
  summary: TransactionMatchSummary,
) {
  await prisma.cashProofTransactionMatch.deleteMany({ where: { engagementId } });
  for (let i = 0; i < matchRows.length; i += BATCH) {
    await prisma.cashProofTransactionMatch.createMany({ data: matchRows.slice(i, i + BATCH) });
  }

  const byFingerprint = new Map<string, ExceptionDraft>();
  for (const d of drafts) if (!byFingerprint.has(d.fingerprint)) byFingerprint.set(d.fingerprint, d);
  const existing = await prisma.cashProofTransactionException.findMany({
    where: { engagementId },
    select: { id: true, fingerprint: true, status: true },
  });
  const existingByFingerprint = new Map(existing.map((e) => [e.fingerprint, e]));
  const now = new Date();

  const fields = (d: ExceptionDraft) => ({
    bankAccountId: d.bankAccountId,
    month: d.month,
    type: d.type,
    severity: d.severity,
    amount: d.amount,
    date: d.date,
    description: d.description,
    detail: d.detail ? (d.detail as Prisma.InputJsonValue) : Prisma.JsonNull,
  });
  const creates = [...byFingerprint.values()].filter((d) => !existingByFingerprint.has(d.fingerprint));
  for (let i = 0; i < creates.length; i += BATCH) {
    await prisma.cashProofTransactionException.createMany({
      data: creates.slice(i, i + BATCH).map((d) => ({ engagementId, fingerprint: d.fingerprint, ...fields(d) })),
      skipDuplicates: true,
    });
  }
  const updates = [...byFingerprint.values()].flatMap((d) => {
    const e = existingByFingerprint.get(d.fingerprint);
    if (!e) return [];
    const reopen = e.status === 'AUTO_RESOLVED';
    return [
      prisma.cashProofTransactionException.update({
        where: { id: e.id },
        data: { ...fields(d), ...(reopen ? { status: 'OPEN', resolutionNote: null, resolvedAt: null, resolvedByUserId: null } : {}) },
      }),
    ];
  });
  for (let i = 0; i < updates.length; i += BATCH) await prisma.$transaction(updates.slice(i, i + BATCH));

  const gone = existing.filter((e) => !byFingerprint.has(e.fingerprint) && e.status !== 'AUTO_RESOLVED');
  const goneOpen = gone.filter((e) => e.status === 'OPEN').map((e) => e.id);
  const goneCleared = gone.filter((e) => e.status !== 'OPEN').map((e) => e.id);
  if (goneOpen.length) {
    await prisma.cashProofTransactionException.updateMany({
      where: { id: { in: goneOpen } },
      data: { status: 'AUTO_RESOLVED', resolvedAt: now, resolvedByUserId: null, resolutionNote: 'No longer found when matching was re-run with the latest data.' },
    });
  }
  if (goneCleared.length) {
    await prisma.cashProofTransactionException.updateMany({ where: { id: { in: goneCleared } }, data: { status: 'AUTO_RESOLVED' } });
  }

  const writes = sampleUpdates.map((u) =>
    prisma.cashProofSample.update({ where: { id: u.id }, data: { reconcilingItems: u.reconcilingItems, status: u.status } }),
  );
  if (writes.length) await prisma.$transaction(writes);
  await prisma.cashProofEngagement.update({
    where: { id: engagementId },
    data: { transactionMatch: summary as unknown as Prisma.InputJsonValue },
  });
}
