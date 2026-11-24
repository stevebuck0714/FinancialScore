import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import {
  defaultCashProofPeriod,
  listCashAccountMappings,
  loadBalanceSheetCashByMonth,
  loadCashBookBalances,
  loadRevenueBasisByMonth,
  monthRange,
  resolveLatestFinancialMonth,
  shiftMonth,
  type BookBalanceSource,
} from './book-balances';
import {
  REVENUE_ADJUSTMENT_CATEGORIES,
  computeRevenueReconciliation,
  type RevenueAdjustmentCategory,
  type RevenueReconciliation,
} from './revenue-reconciliation';
import { selectExpansionMonths, selectSampleMonths, type SampleSelectionReason } from './sampling';
import { scanBankStatements, type StatementScan } from './statement-scan';
import {
  TAX_RETURN_FORMS,
  TAX_RETURN_BASIS_LABELS,
  computeTaxReturnComparison,
  type TaxReturnBasis,
  type TaxReturnComparison,
  type TaxReturnEntry,
  type TaxReturnForm,
} from './tax-return';
import { completeFiscalYearKeys, listTaxFolderDocuments, scanTaxReturns, type TaxReturnScan } from './tax-return-scan';
import type { DetectedStatementAccount } from '@/lib/bank-statements/account-match';
import { loadDetectedStatementAccounts } from '@/lib/bank-statements/detected-accounts';
import { computeTieOut, type CashProofSampleStatus, type TieOutResult } from './tie-out';
import { runTransactionMatch, type TransactionMatchSummary } from './transaction-match-run';
import { loadBookDepositAdjustments, type BookDepositAdjustment } from './book-deposit-classification';
import { bankSuggestionNote, loadBankDepositClassification, type BankDepositSuggestion } from './bank-deposit-classification';
import {
  SEVERITY_ORDER,
  lastDayOfMonth,
  type TransactionExceptionSeverity,
  type TransactionExceptionType,
} from './transaction-match';

export class CashProofError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type CashProofAccountView = {
  id: string;
  accountMappingId: string | null;
  sourceAccountId: string | null;
  accountName: string;
  bankName: string | null;
  accountLast4: string | null;
  accountType: string | null;
  included: boolean;
  exclusionReason: string | null;
  isManual: boolean;
  /** Another row in the cash proof is for the same book account, so this one can be deleted. */
  isDuplicate: boolean;
  depositsCategory: RevenueAdjustmentCategory | null;
  balances: Record<string, { value: number; source: BookBalanceSource }>;
  /** Statement deposits per month; `sample` values live on the sampled statement. */
  deposits: Record<string, { value: number; source: 'sample' | 'entered'; documentId: string | null }>;
};

export type CashProofRevenueAdjustmentView = {
  id: string;
  bankAccountId: string | null;
  month: string;
  category: RevenueAdjustmentCategory;
  amount: number;
  description: string | null;
  createdAt: string;
};

export type CashProofSampleView = {
  id: string;
  bankAccountId: string;
  month: string;
  selectionReason: SampleSelectionReason;
  status: CashProofSampleStatus;
  dataRoomDocumentId: string | null;
  statementBeginning: number | null;
  statementDeposits: number | null;
  statementWithdrawals: number | null;
  statementEnding: number | null;
  reconcilingItems: number | null;
  enteredAt: string | null;
  exceptionNote: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  tieOut: TieOutResult;
};

export type TransactionExceptionStatus = 'OPEN' | 'CLEARED' | 'AUTO_RESOLVED';

export type CashProofTransactionExceptionView = {
  id: string;
  bankAccountId: string | null;
  month: string | null;
  type: TransactionExceptionType;
  severity: TransactionExceptionSeverity;
  amount: number;
  date: string | null;
  description: string;
  status: TransactionExceptionStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
};

export type CashProofTransactionMatchView = {
  id: string;
  rule: string;
  amount: number;
  dayGap: number;
  isReconcilingItem: boolean;
  book: Array<{ key: string; date: string; type: string; num: string; name: string; amount: number }>;
  bank: Array<{ id: string; date: string; description: string; checkNumber: string | null; amount: number }>;
};

export type CashProofState = {
  engagement: {
    id: string;
    periodStartMonth: string;
    periodEndMonth: string;
    fiscalYearEndMonth: number;
    sampleSeed: string | null;
    sampledAt: string | null;
    balanceTolerance: number;
    revenueTolerancePct: number;
    status: 'DRAFT' | 'SAMPLED' | 'LOCKED';
    lockedAt: string | null;
    createdAt: string;
  } | null;
  latestFinancialMonth: string | null;
  months: string[];
  accounts: CashProofAccountView[];
  samples: CashProofSampleView[];
  revenueAdjustments: CashProofRevenueAdjustmentView[];
  /** Non-revenue deposits read from the books; `applied` is false until that account-month has statement deposits. */
  bookDeposits: { supported: boolean; adjustments: Array<BookDepositAdjustment & { applied: boolean }> };
  /**
   * Non-revenue deposits read from the bank transactions, for account-months the books do not cover.
   * Suggestions change nothing until added as a hand entry (`note` is that entry's description).
   */
  bankDeposits: {
    adjustments: Array<BookDepositAdjustment & { applied: boolean }>;
    suggestions: Array<BankDepositSuggestion & { added: boolean; note: string }>;
  };
  revenueReconciliation: RevenueReconciliation | null;
  /** Complete fiscal years compared with the income tax return. */
  taxReturns: TaxReturnComparison[];
  taxReturnScan: TaxReturnScan | null;
  taxReturnDocuments: Array<{ id: string; originalFileName: string; createdAt: string }>;
  statementScan: StatementScan | null;
  transactionMatch: TransactionMatchSummary | null;
  transactionExceptions: CashProofTransactionExceptionView[];
  balanceSheetCash: Record<string, number>;
  completeness: Record<string, { bookTotal: number | null; balanceSheetCash: number | null; difference: number | null }>;
  bankStatementDocuments: Array<{ id: string; originalFileName: string; createdAt: string }>;
  /** Bank accounts the Bank Statements folder has statements for; accounts link to these by bank and last 4. */
  statementAccounts: DetectedStatementAccount[];
  summary: {
    sampledMonths: number;
    accountMonths: number;
    tied: number;
    cleared: number;
    exceptions: number;
    received: number;
    requested: number;
    netDifference: number;
    depositMonthsMissing: number;
    revenuePeriodsOpen: number;
    taxReturnsMissing: number;
    taxReturnPeriodsOpen: number;
    transactionExceptionsOpen: number;
  };
};

const toIso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function latestEngagement(companyId: string) {
  return withPrismaReconnectRetry(
    () =>
      prisma.cashProofEngagement.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        include: {
          bankAccounts: {
            orderBy: [{ sortOrder: 'asc' }, { accountName: 'asc' }],
            include: { bookBalances: true, deposits: true },
          },
          samples: true,
          revenueAdjustments: { orderBy: [{ month: 'asc' }, { createdAt: 'asc' }] },
          transactionExceptions: {
            select: {
              id: true,
              bankAccountId: true,
              month: true,
              type: true,
              severity: true,
              amount: true,
              date: true,
              description: true,
              status: true,
              resolutionNote: true,
              resolvedAt: true,
            },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    'cash-proof.latestEngagement',
  );
}

async function loadBankStatementDocuments(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { userDefinedAllocations: true },
  });
  const state = getDataRoomState(company?.userDefinedAllocations);
  const ids = (state.documentIndex as Array<Record<string, unknown>>)
    .filter((entry) => String(entry?.folderId || '') === DATAROOM_BANK_STATEMENTS_FOLDER_ID)
    .map((entry) => String(entry?.documentId || ''))
    .filter(Boolean);
  if (ids.length === 0) return [];
  const docs = await prisma.dataRoomDocument.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true, originalFileName: true, createdAt: true },
    orderBy: { originalFileName: 'asc' },
  });
  return docs.map((d) => ({ id: d.id, originalFileName: d.originalFileName, createdAt: d.createdAt.toISOString() }));
}

export async function loadCashProofState(companyId: string): Promise<CashProofState> {
  const [engagement, latestFinancialMonth, bankStatementDocuments, statementAccounts, taxDocs] = await Promise.all([
    latestEngagement(companyId),
    resolveLatestFinancialMonth(companyId),
    loadBankStatementDocuments(companyId),
    loadDetectedStatementAccounts(companyId),
    listTaxFolderDocuments(companyId),
  ]);
  const taxReturnDocuments = taxDocs.map((d) => ({
    id: d.id,
    originalFileName: d.originalFileName,
    createdAt: d.createdAt.toISOString(),
  }));

  const emptySummary = {
    sampledMonths: 0,
    accountMonths: 0,
    tied: 0,
    cleared: 0,
    exceptions: 0,
    received: 0,
    requested: 0,
    netDifference: 0,
    depositMonthsMissing: 0,
    revenuePeriodsOpen: 0,
    taxReturnsMissing: 0,
    taxReturnPeriodsOpen: 0,
    transactionExceptionsOpen: 0,
  };
  if (!engagement) {
    return {
      engagement: null,
      latestFinancialMonth,
      months: [],
      accounts: [],
      samples: [],
      revenueAdjustments: [],
      bookDeposits: { supported: false, adjustments: [] },
      bankDeposits: { adjustments: [], suggestions: [] },
      revenueReconciliation: null,
      taxReturns: [],
      taxReturnScan: null,
      taxReturnDocuments,
      statementScan: null,
      transactionMatch: null,
      transactionExceptions: [],
      balanceSheetCash: {},
      completeness: {},
      bankStatementDocuments,
      statementAccounts,
      summary: emptySummary,
    };
  }

  const months = monthRange(engagement.periodStartMonth, engagement.periodEndMonth);
  const [balanceSheetCash, revenueBasis, bookDepositResult, bankDepositResult] = await Promise.all([
    loadBalanceSheetCashByMonth(companyId, engagement.periodStartMonth, engagement.periodEndMonth),
    loadRevenueBasisByMonth(companyId, shiftMonth(engagement.periodStartMonth, -1), engagement.periodEndMonth),
    loadBookDepositAdjustments(
      companyId,
      engagement.bankAccounts.filter((a) => a.included),
      `${engagement.periodStartMonth}-01`,
      lastDayOfMonth(engagement.periodEndMonth),
    ).catch((e) => {
      console.error('Cash proof book deposit classification failed:', e);
      return { supported: false, adjustments: [] as BookDepositAdjustment[], covered: [] as string[] };
    }),
    loadBankDepositClassification(
      companyId,
      engagement.bankAccounts,
      `${engagement.periodStartMonth}-01`,
      lastDayOfMonth(engagement.periodEndMonth),
    ).catch((e) => {
      console.error('Cash proof bank deposit classification failed:', e);
      return { adjustments: [] as BookDepositAdjustment[], suggestions: [] as BankDepositSuggestion[] };
    }),
  ]);

  const sampleDeposits = new Map<string, { value: number | null; documentId: string | null }>();
  for (const s of engagement.samples) {
    sampleDeposits.set(`${s.bankAccountId}|${s.month}`, { value: s.statementDeposits, documentId: s.dataRoomDocumentId });
  }

  const accounts: CashProofAccountView[] = engagement.bankAccounts.map((a) => ({
    id: a.id,
    accountMappingId: a.accountMappingId,
    sourceAccountId: a.sourceAccountId,
    accountName: a.accountName,
    bankName: a.bankName,
    accountLast4: a.accountLast4,
    accountType: a.accountType,
    included: a.included,
    exclusionReason: a.exclusionReason,
    isManual: a.isManual,
    isDuplicate: engagement.bankAccounts.some((o) => sameBookAccount(a, o)),
    depositsCategory: (a.depositsCategory as RevenueAdjustmentCategory | null) ?? null,
    balances: Object.fromEntries(
      a.bookBalances.map((b) => [b.month, { value: b.endingBalance, source: b.source as BookBalanceSource }]),
    ),
    deposits: (() => {
      const out: CashProofAccountView['deposits'] = {};
      for (const d of a.deposits) {
        if (!sampleDeposits.has(`${a.id}|${d.month}`)) {
          out[d.month] = { value: d.totalDeposits, source: 'entered', documentId: d.dataRoomDocumentId };
        }
      }
      for (const month of months) {
        const s = sampleDeposits.get(`${a.id}|${month}`);
        if (s && s.value !== null) out[month] = { value: s.value, source: 'sample', documentId: s.documentId };
      }
      return out;
    })(),
  }));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const completeness: CashProofState['completeness'] = {};
  for (const month of months) {
    const included = accounts.filter((a) => a.included);
    const values = included.map((a) => a.balances[month]?.value);
    const bookTotal = values.some((v) => v !== undefined)
      ? values.reduce<number>((s, v) => s + (v ?? 0), 0)
      : null;
    const bsCash = month in balanceSheetCash ? balanceSheetCash[month] : null;
    completeness[month] = {
      bookTotal,
      balanceSheetCash: bsCash,
      difference: bookTotal !== null && bsCash !== null ? Math.round((bookTotal - bsCash) * 100) / 100 : null,
    };
  }

  const sampleKey = (accountId: string, month: string) => `${accountId}|${month}`;
  const samplesByKey = new Map(engagement.samples.map((s) => [sampleKey(s.bankAccountId, s.month), s]));
  const samples: CashProofSampleView[] = engagement.samples
    .map((s) => {
      const book = accountById.get(s.bankAccountId)?.balances[s.month]?.value ?? null;
      const prior = samplesByKey.get(sampleKey(s.bankAccountId, shiftMonth(s.month, -1)));
      const tieOut = computeTieOut(s, book, prior?.statementEnding ?? null, engagement.balanceTolerance);
      return {
        id: s.id,
        bankAccountId: s.bankAccountId,
        month: s.month,
        selectionReason: s.selectionReason as SampleSelectionReason,
        status: tieOut.status,
        dataRoomDocumentId: s.dataRoomDocumentId,
        statementBeginning: s.statementBeginning,
        statementDeposits: s.statementDeposits,
        statementWithdrawals: s.statementWithdrawals,
        statementEnding: s.statementEnding,
        reconcilingItems: s.reconcilingItems,
        enteredAt: toIso(s.enteredAt),
        exceptionNote: s.exceptionNote,
        resolutionNote: s.resolutionNote,
        resolvedAt: toIso(s.resolvedAt),
        tieOut,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const includedIds = new Set(accounts.filter((a) => a.included).map((a) => a.id));
  const counted = samples.filter((s) => includedIds.has(s.bankAccountId));
  const summary = {
    sampledMonths: new Set(counted.map((s) => s.month)).size,
    accountMonths: counted.length,
    tied: counted.filter((s) => s.status === 'TIED').length,
    cleared: counted.filter((s) => s.status === 'CLEARED').length,
    exceptions: counted.filter((s) => s.status === 'EXCEPTION').length,
    received: counted.filter((s) => s.status === 'RECEIVED').length,
    requested: counted.filter((s) => s.status === 'REQUESTED').length,
    netDifference:
      Math.round(counted.reduce((sum, s) => sum + (s.tieOut.difference ?? 0), 0) * 100) / 100,
    depositMonthsMissing: 0,
    revenuePeriodsOpen: 0,
    taxReturnsMissing: 0,
    taxReturnPeriodsOpen: 0,
    transactionExceptionsOpen: 0,
  };

  const transactionExceptions: CashProofTransactionExceptionView[] = engagement.transactionExceptions
    .filter((e) => !e.bankAccountId || includedIds.has(e.bankAccountId))
    .map((e) => ({
      id: e.id,
      bankAccountId: e.bankAccountId,
      month: e.month,
      type: e.type as TransactionExceptionType,
      severity: e.severity as TransactionExceptionSeverity,
      amount: e.amount,
      date: e.date,
      description: e.description,
      status: e.status as TransactionExceptionStatus,
      resolutionNote: e.resolutionNote,
      resolvedAt: toIso(e.resolvedAt),
    }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        String(a.date || '').localeCompare(String(b.date || '')),
    );
  summary.transactionExceptionsOpen = transactionExceptions.filter((e) => e.status === 'OPEN').length;

  const includedAccounts = accounts.filter((a) => a.included);
  const revenueAdjustments: CashProofRevenueAdjustmentView[] = engagement.revenueAdjustments.map((r) => ({
    id: r.id,
    bankAccountId: r.bankAccountId,
    month: r.month,
    category: r.category as RevenueAdjustmentCategory,
    amount: r.amount,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
  }));
  const appliesTo = (adj: BookDepositAdjustment) => {
    const account = accountById.get(adj.bankAccountId);
    return Boolean(account && !account.depositsCategory && account.deposits[adj.month]);
  };
  const bookDeposits: CashProofState['bookDeposits'] = {
    supported: bookDepositResult.supported,
    adjustments: bookDepositResult.adjustments.map((adj) => ({ ...adj, applied: appliesTo(adj) })),
  };
  // The books win wherever they show the account-month's deposits.
  const bookCovered = new Set(bookDepositResult.supported ? bookDepositResult.covered : []);
  const notInBooks = (a: { bankAccountId: string; month: string }) => !bookCovered.has(`${a.bankAccountId}|${a.month}`);
  const bankDeposits: CashProofState['bankDeposits'] = {
    adjustments: bankDepositResult.adjustments.filter(notInBooks).map((adj) => ({ ...adj, applied: appliesTo(adj) })),
    suggestions: bankDepositResult.suggestions
      .filter((s) => notInBooks(s) && accountById.get(s.bankAccountId)?.included && !accountById.get(s.bankAccountId)?.depositsCategory)
      .map((s) => {
        const note = bankSuggestionNote(s);
        const added = revenueAdjustments.some(
          (r) => r.bankAccountId === s.bankAccountId && r.month === s.month && r.description === note && Math.abs(r.amount - s.amount) < 0.005,
        );
        return { ...s, note, added };
      }),
  };
  const revenueReconciliation = computeRevenueReconciliation({
    months,
    fiscalYearEndMonth: engagement.fiscalYearEndMonth,
    tolerancePct: engagement.revenueTolerancePct,
    depositsByMonth: Object.fromEntries(
      months.map((m) => [m, includedAccounts.map((a) => a.deposits[m]?.value ?? null)]),
    ),
    adjustments: [
      ...revenueAdjustments.filter((r) => !r.bankAccountId || includedIds.has(r.bankAccountId)),
      ...bookDeposits.adjustments.filter((a) => a.applied),
      ...bankDeposits.adjustments.filter((a) => a.applied),
      ...includedAccounts
        .filter((a) => a.depositsCategory && REVENUE_ADJUSTMENT_CATEGORIES[a.depositsCategory]?.sign === -1)
        .flatMap((a) =>
          Object.entries(a.deposits).map(([month, d]) => ({ month, category: a.depositsCategory!, amount: d.value })),
        ),
    ],
    basisByMonth: revenueBasis,
    periodNotes: (engagement.revenuePeriodNotes as Record<string, string> | null) || {},
  });
  summary.depositMonthsMissing = revenueReconciliation.total.missingDeposits;
  summary.revenuePeriodsOpen = revenueReconciliation.periods.filter(
    (p) => p.status === 'VARIANCE' || p.status === 'INCOMPLETE',
  ).length;
  const taxReturns = computeTaxReturnComparison(
    revenueReconciliation.periods,
    (engagement.taxReturns as Record<string, TaxReturnEntry> | null) || {},
    engagement.revenueTolerancePct,
  );
  summary.taxReturnsMissing = taxReturns.filter((t) => t.status === 'NOT_PROVIDED').length;
  summary.taxReturnPeriodsOpen = taxReturns.filter((t) => t.status === 'VARIANCE').length;

  return {
    engagement: {
      id: engagement.id,
      periodStartMonth: engagement.periodStartMonth,
      periodEndMonth: engagement.periodEndMonth,
      fiscalYearEndMonth: engagement.fiscalYearEndMonth,
      sampleSeed: engagement.sampleSeed,
      sampledAt: toIso(engagement.sampledAt),
      balanceTolerance: engagement.balanceTolerance,
      revenueTolerancePct: engagement.revenueTolerancePct,
      status: engagement.status as 'DRAFT' | 'SAMPLED' | 'LOCKED',
      lockedAt: toIso(engagement.lockedAt),
      createdAt: engagement.createdAt.toISOString(),
    },
    latestFinancialMonth,
    months,
    accounts,
    samples,
    revenueAdjustments,
    bookDeposits,
    bankDeposits,
    revenueReconciliation,
    taxReturns,
    taxReturnScan: (engagement.taxReturnScan as unknown as TaxReturnScan | null) ?? null,
    taxReturnDocuments,
    statementScan: (engagement.statementScan as unknown as StatementScan | null) ?? null,
    transactionMatch: (engagement.transactionMatch as unknown as TransactionMatchSummary | null) ?? null,
    transactionExceptions,
    balanceSheetCash,
    completeness,
    bankStatementDocuments,
    statementAccounts,
    summary,
  };
}

/** Matches, uncleared items, and exceptions for one account-month of the latest engagement. */
export async function loadTransactionMatchDetail(companyId: string, bankAccountId: string, month: string) {
  if (!MONTH_RE.test(month)) throw new CashProofError('Choose a month');
  const engagement = await prisma.cashProofEngagement.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!engagement) throw new CashProofError('Cash proof engagement not found', 404);
  await requireBankAccount(engagement.id, bankAccountId);
  const rows = await prisma.cashProofTransactionMatch.findMany({
    where: { engagementId: engagement.id, bankAccountId, month },
    orderBy: [{ createdAt: 'asc' }],
  });
  const matches: CashProofTransactionMatchView[] = rows
    .map((r) => {
      const detail = (r.detail || {}) as { book?: CashProofTransactionMatchView['book']; bank?: CashProofTransactionMatchView['bank'] };
      return {
        id: r.id,
        rule: r.rule,
        amount: r.amount,
        dayGap: r.dayGap,
        isReconcilingItem: r.isReconcilingItem,
        book: detail.book || [],
        bank: detail.bank || [],
      };
    })
    .sort((a, b) => String(a.book[0]?.date || '').localeCompare(String(b.book[0]?.date || '')));
  return { bankAccountId, month, matches };
}

async function requireEngagement(companyId: string, engagementId: string, allowLocked = false) {
  const engagement = await prisma.cashProofEngagement.findFirst({ where: { id: engagementId, companyId } });
  if (!engagement) throw new CashProofError('Cash proof engagement not found', 404);
  if (!allowLocked && engagement.status === 'LOCKED') {
    throw new CashProofError('This cash proof is locked. Unlock it to make changes.', 409);
  }
  return engagement;
}

async function requireBankAccount(engagementId: string, bankAccountId: string) {
  const account = await prisma.cashProofBankAccount.findFirst({ where: { id: bankAccountId, engagementId } });
  if (!account) throw new CashProofError('Bank account not found', 404);
  return account;
}

type BookAccountKeys = {
  id: string;
  accountMappingId: string | null;
  sourceAccountId: string | null;
  accountName: string;
  bookBalances: MonthBalance[];
};

type MonthBalance = { month: string; endingBalance: number };

const accountNameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** The same month-end balance in every month, with at least one month not zero. */
function sameBalances(a: MonthBalance[], b: MonthBalance[]) {
  if (a.length === 0 || a.length !== b.length || a.every((x) => Math.abs(x.endingBalance) < 0.005)) return false;
  const other = new Map(b.map((x) => [x.month, x.endingBalance]));
  return a.every((x) => other.has(x.month) && Math.abs(other.get(x.month)! - x.endingBalance) < 0.005);
}

/**
 * Two cash proof rows for the same book account: the same mapping, the same account in the
 * accounting system, or the same account name with the same balance in every month (a second
 * Cash mapping that found its balances by name).
 */
function sameBookAccount(a: BookAccountKeys, b: BookAccountKeys) {
  if (a.id === b.id) return false;
  if (a.accountMappingId && a.accountMappingId === b.accountMappingId) return true;
  const source = String(a.sourceAccountId || '').trim();
  if (source && source === String(b.sourceAccountId || '').trim()) return true;
  return accountNameKey(a.accountName) === accountNameKey(b.accountName) && sameBalances(a.bookBalances, b.bookBalances);
}

/** Pull mapped cash accounts and their month-end balances from the accounting source. */
async function refreshBookBalances(companyId: string, engagementId: string) {
  const engagement = await prisma.cashProofEngagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { bankAccounts: { include: { bookBalances: { select: { month: true, endingBalance: true } } } } },
  });
  const mappings = await listCashAccountMappings(companyId);
  const mappingIds = new Set(mappings.map((m) => m.id));
  const months = monthRange(engagement.periodStartMonth, engagement.periodEndMonth);
  const { source, balances } = await loadCashBookBalances(companyId, mappings, months);
  const existingByMapping = new Map<string, { id: string }>(
    engagement.bankAccounts.filter((a) => a.accountMappingId).map((a) => [a.accountMappingId!, a]),
  );
  let sortOrder = engagement.bankAccounts.length;
  for (const mapping of mappings) {
    if (existingByMapping.has(mapping.id)) continue;
    // A second Cash mapping for a book account already in the cash proof must not add a duplicate row.
    const candidate: BookAccountKeys = {
      id: '',
      accountMappingId: mapping.id,
      sourceAccountId: mapping.accountId || mapping.accountCode || null,
      accountName: mapping.accountName,
      bookBalances: [...(balances.get(mapping.id) ?? new Map<string, number>())].map(([month, endingBalance]) => ({ month, endingBalance })),
    };
    const same = engagement.bankAccounts.find((a) => sameBookAccount(candidate, a));
    if (same) {
      if (!same.accountMappingId || !mappingIds.has(same.accountMappingId)) existingByMapping.set(mapping.id, same);
      continue;
    }
    const created = await prisma.cashProofBankAccount.create({
      data: {
        engagementId,
        accountMappingId: mapping.id,
        sourceAccountId: candidate.sourceAccountId,
        accountName: mapping.accountName,
        sortOrder: sortOrder++,
      },
    });
    existingByMapping.set(mapping.id, created);
  }

  if (source === 'manual') return;

  const accountIds = [...existingByMapping.values()].map((a) => a.id);
  const manualKeys = new Set(
    (
      await prisma.cashProofBookBalance.findMany({
        where: { bankAccountId: { in: accountIds }, source: 'manual' },
        select: { bankAccountId: true, month: true },
      })
    ).map((b) => `${b.bankAccountId}|${b.month}`),
  );

  const writes = [];
  for (const mapping of mappings) {
    const account = existingByMapping.get(mapping.id);
    const monthMap = balances.get(mapping.id);
    if (!account || !monthMap) continue;
    for (const month of months) {
      const value = monthMap.get(month);
      if (value === undefined || manualKeys.has(`${account.id}|${month}`)) continue;
      writes.push(
        prisma.cashProofBookBalance.upsert({
          where: { bankAccountId_month: { bankAccountId: account.id, month } },
          create: { bankAccountId: account.id, month, endingBalance: value, source },
          update: { endingBalance: value, source },
        }),
      );
    }
  }
  if (writes.length > 0) await prisma.$transaction(writes);
}

export type CashProofAction =
  | { action: 'create'; fiscalYearEndMonth?: number; periodStartMonth?: string; periodEndMonth?: string }
  | { action: 'refresh-book-balances'; engagementId: string }
  | {
      action: 'update-account';
      engagementId: string;
      bankAccountId: string;
      bankName?: string | null;
      accountLast4?: string | null;
      accountType?: string | null;
      included?: boolean;
      exclusionReason?: string | null;
      depositsCategory?: RevenueAdjustmentCategory | null;
    }
  | { action: 'add-manual-account'; engagementId: string; accountName: string; bankName?: string | null; accountLast4?: string | null }
  | { action: 'delete-account'; engagementId: string; bankAccountId: string }
  | { action: 'set-book-balance'; engagementId: string; bankAccountId: string; month: string; endingBalance: number | null }
  | { action: 'generate-sample'; engagementId: string; regenerate?: boolean }
  | { action: 'expand-sample'; engagementId: string }
  | { action: 'add-sample-month'; engagementId: string; month: string }
  | {
      action: 'update-sample';
      engagementId: string;
      sampleId: string;
      dataRoomDocumentId?: string | null;
      statementBeginning?: number | null;
      statementDeposits?: number | null;
      statementWithdrawals?: number | null;
      statementEnding?: number | null;
      reconcilingItems?: number | null;
      exceptionNote?: string | null;
      resolutionNote?: string | null;
      clear?: boolean;
    }
  | { action: 'set-deposit'; engagementId: string; bankAccountId: string; month: string; totalDeposits: number | null }
  | {
      action: 'add-revenue-adjustment';
      engagementId: string;
      month: string;
      category: RevenueAdjustmentCategory;
      amount: number;
      bankAccountId?: string | null;
      description?: string | null;
    }
  | { action: 'delete-revenue-adjustment'; engagementId: string; adjustmentId: string }
  | { action: 'set-revenue-period-note'; engagementId: string; periodKey: string; note: string | null }
  | {
      action: 'set-tax-return';
      engagementId: string;
      periodKey: string;
      form?: TaxReturnForm | null;
      basis?: TaxReturnBasis;
      grossReceipts?: number | string | null;
      returnsAllowances?: number | string | null;
      dataRoomDocumentId?: string | null;
      note?: string | null;
      /** Clears the year's form, figures, linked return, and explanation so Read Tax Returns can fill it again. */
      reset?: boolean;
    }
  | { action: 'scan-tax-returns'; engagementId: string }
  | { action: 'scan-statements'; engagementId: string }
  | { action: 'match-transactions'; engagementId: string }
  | { action: 'update-transaction-exception'; engagementId: string; exceptionId: string; resolutionNote?: string | null; clear?: boolean }
  | { action: 'clear-transaction-exceptions'; engagementId: string; exceptionIds: string[]; resolutionNote: string }
  | { action: 'lock'; engagementId: string }
  | { action: 'unlock'; engagementId: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function optionalText(value: unknown, max = 500): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new CashProofError('Amounts must be numbers');
  return Math.round(n * 100) / 100;
}

async function createSampleRows(
  engagementId: string,
  accountIds: string[],
  picks: Array<{ month: string; reason: SampleSelectionReason }>,
) {
  if (accountIds.length === 0 || picks.length === 0) return;
  // Deposits already keyed for a newly sampled month move onto the sample.
  const months = picks.map((p) => p.month);
  const carried = await prisma.cashProofDeposit.findMany({
    where: { bankAccountId: { in: accountIds }, month: { in: months } },
  });
  const carriedByKey = new Map(carried.map((d) => [`${d.bankAccountId}|${d.month}`, d.totalDeposits]));
  await prisma.$transaction([
    prisma.cashProofSample.createMany({
      data: accountIds.flatMap((bankAccountId) =>
        picks.map((p) => ({
          engagementId,
          bankAccountId,
          month: p.month,
          selectionReason: p.reason,
          statementDeposits: carriedByKey.get(`${bankAccountId}|${p.month}`) ?? null,
        })),
      ),
      skipDuplicates: true,
    }),
    prisma.cashProofDeposit.deleteMany({ where: { id: { in: carried.map((d) => d.id) } } }),
  ]);
}

export async function runCashProofAction(companyId: string, userId: string, input: CashProofAction) {
  switch (input.action) {
    case 'create': {
      const fiscalYearEndMonth = Math.min(12, Math.max(1, Math.round(Number(input.fiscalYearEndMonth) || 12)));
      const latest = await resolveLatestFinancialMonth(companyId);
      if (!latest && !(input.periodStartMonth && input.periodEndMonth)) {
        throw new CashProofError('No monthly financials found. Sync the accounting system first.');
      }
      const defaults = latest ? defaultCashProofPeriod(latest, fiscalYearEndMonth) : null;
      const periodStartMonth = MONTH_RE.test(String(input.periodStartMonth || ''))
        ? String(input.periodStartMonth)
        : defaults!.periodStartMonth;
      const periodEndMonth = MONTH_RE.test(String(input.periodEndMonth || ''))
        ? String(input.periodEndMonth)
        : defaults!.periodEndMonth;
      if (periodStartMonth > periodEndMonth) throw new CashProofError('Period start must be before period end');
      const engagement = await prisma.cashProofEngagement.create({
        data: { companyId, periodStartMonth, periodEndMonth, fiscalYearEndMonth, createdByUserId: userId },
      });
      await refreshBookBalances(companyId, engagement.id);
      return;
    }
    case 'refresh-book-balances': {
      await requireEngagement(companyId, input.engagementId);
      await refreshBookBalances(companyId, input.engagementId);
      return;
    }
    case 'update-account': {
      await requireEngagement(companyId, input.engagementId);
      await requireBankAccount(input.engagementId, input.bankAccountId);
      const data: Record<string, unknown> = {};
      if ('bankName' in input) data.bankName = optionalText(input.bankName, 120);
      if ('accountLast4' in input) {
        const digits = String(input.accountLast4 ?? '').replace(/\D/g, '').slice(-4);
        data.accountLast4 = digits || null;
      }
      if ('accountType' in input) data.accountType = optionalText(input.accountType, 60);
      if (typeof input.included === 'boolean') data.included = input.included;
      if ('exclusionReason' in input) data.exclusionReason = optionalText(input.exclusionReason);
      if ('depositsCategory' in input) {
        const category = optionalText(input.depositsCategory, 60);
        if (category && REVENUE_ADJUSTMENT_CATEGORIES[category as RevenueAdjustmentCategory]?.sign !== -1) {
          throw new CashProofError('Choose a non-revenue category');
        }
        data.depositsCategory = category;
      }
      if (data.included === false && !data.exclusionReason) {
        const current = await prisma.cashProofBankAccount.findUnique({
          where: { id: input.bankAccountId },
          select: { exclusionReason: true },
        });
        if (!current?.exclusionReason) throw new CashProofError('Give a reason for excluding this account');
      }
      await prisma.cashProofBankAccount.update({ where: { id: input.bankAccountId }, data });
      return;
    }
    case 'add-manual-account': {
      await requireEngagement(companyId, input.engagementId);
      const accountName = optionalText(input.accountName, 200);
      if (!accountName) throw new CashProofError('Account name is required');
      const count = await prisma.cashProofBankAccount.count({ where: { engagementId: input.engagementId } });
      await prisma.cashProofBankAccount.create({
        data: {
          engagementId: input.engagementId,
          accountName,
          bankName: optionalText(input.bankName, 120),
          accountLast4: String(input.accountLast4 ?? '').replace(/\D/g, '').slice(-4) || null,
          isManual: true,
          sortOrder: count,
        },
      });
      return;
    }
    case 'delete-account': {
      await requireEngagement(companyId, input.engagementId);
      await requireBankAccount(input.engagementId, input.bankAccountId);
      const rows = await prisma.cashProofBankAccount.findMany({
        where: { engagementId: input.engagementId },
        include: { bookBalances: { select: { month: true, endingBalance: true } } },
        orderBy: { sortOrder: 'asc' },
      });
      const account = rows.find((r) => r.id === input.bankAccountId)!;
      const duplicates = rows.filter((s) => sameBookAccount(account, s));
      if (duplicates.length === 0) {
        throw new CashProofError('Only a duplicate of another account in the cash proof can be deleted. Untick Include to leave an account out.', 409);
      }
      const kept = duplicates.find((d) => d.included) ?? duplicates[0];
      // Only cash proof rows change; the account mappings and the books are left as they are.
      await prisma.$transaction([
        prisma.cashProofRevenueAdjustment.updateMany({ where: { bankAccountId: account.id }, data: { bankAccountId: kept.id } }),
        // The statement link (bank and last 4) moves to the row that stays when it has none.
        ...(!kept.accountLast4 && account.accountLast4
          ? [
              prisma.cashProofBankAccount.update({
                where: { id: kept.id },
                data: { bankName: kept.bankName || account.bankName, accountLast4: account.accountLast4 },
              }),
            ]
          : []),
        prisma.cashProofBankAccount.delete({ where: { id: account.id } }),
      ]);
      return;
    }
    case 'set-book-balance': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      await requireBankAccount(input.engagementId, input.bankAccountId);
      if (!MONTH_RE.test(input.month) || input.month < engagement.periodStartMonth || input.month > engagement.periodEndMonth) {
        throw new CashProofError('Month is outside the cash proof period');
      }
      const value = optionalNumber(input.endingBalance);
      const where = { bankAccountId_month: { bankAccountId: input.bankAccountId, month: input.month } };
      if (value === null) {
        await prisma.cashProofBookBalance.deleteMany({ where: { bankAccountId: input.bankAccountId, month: input.month } });
      } else {
        await prisma.cashProofBookBalance.upsert({
          where,
          create: { bankAccountId: input.bankAccountId, month: input.month, endingBalance: value, source: 'manual' },
          update: { endingBalance: value, source: 'manual' },
        });
      }
      return;
    }
    case 'generate-sample': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const existing = await prisma.cashProofSample.findMany({ where: { engagementId: engagement.id } });
      const worked = existing.filter(
        (s) => s.statementEnding !== null || s.statementDeposits !== null || s.dataRoomDocumentId,
      );
      if (existing.length > 0 && !input.regenerate) {
        throw new CashProofError('A sample already exists. Use Expand Sample to add months.', 409);
      }
      if (worked.length > 0) {
        throw new CashProofError('Statements have already been entered against this sample, so it cannot be regenerated.', 409);
      }
      const accounts = await prisma.cashProofBankAccount.findMany({
        where: { engagementId: engagement.id, included: true },
        include: { bookBalances: true },
      });
      if (accounts.length === 0) throw new CashProofError('Add or include at least one bank account first');
      const months = monthRange(engagement.periodStartMonth, engagement.periodEndMonth);
      const seed = randomUUID();
      const picks = selectSampleMonths({
        months,
        fiscalYearEndMonth: engagement.fiscalYearEndMonth,
        balancesByAccount: accounts.map((a) => new Map(a.bookBalances.map((b) => [b.month, b.endingBalance]))),
        seed,
      });
      await prisma.$transaction([
        prisma.cashProofSample.deleteMany({ where: { engagementId: engagement.id } }),
        prisma.cashProofEngagement.update({
          where: { id: engagement.id },
          data: { sampleSeed: seed, sampledAt: new Date(), status: 'SAMPLED' },
        }),
      ]);
      await createSampleRows(engagement.id, accounts.map((a) => a.id), picks);
      return;
    }
    case 'expand-sample': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const [accounts, existing] = await Promise.all([
        prisma.cashProofBankAccount.findMany({ where: { engagementId: engagement.id, included: true }, select: { id: true } }),
        prisma.cashProofSample.findMany({ where: { engagementId: engagement.id }, select: { month: true } }),
      ]);
      if (existing.length === 0) throw new CashProofError('Generate a sample first');
      const months = monthRange(engagement.periodStartMonth, engagement.periodEndMonth);
      const added = selectExpansionMonths(months, new Set(existing.map((s) => s.month)), engagement.sampleSeed || engagement.id);
      if (added.length === 0) throw new CashProofError('Every month in the period is already sampled');
      await createSampleRows(engagement.id, accounts.map((a) => a.id), added.map((month) => ({ month, reason: 'EXPANSION' })));
      return;
    }
    case 'add-sample-month': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      if (!MONTH_RE.test(input.month) || input.month < engagement.periodStartMonth || input.month > engagement.periodEndMonth) {
        throw new CashProofError('Month is outside the cash proof period');
      }
      const accounts = await prisma.cashProofBankAccount.findMany({
        where: { engagementId: engagement.id, included: true },
        select: { id: true },
      });
      await createSampleRows(engagement.id, accounts.map((a) => a.id), [{ month: input.month, reason: 'MANUAL' }]);
      if (engagement.status === 'DRAFT') {
        await prisma.cashProofEngagement.update({ where: { id: engagement.id }, data: { status: 'SAMPLED', sampledAt: new Date() } });
      }
      return;
    }
    case 'update-sample': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const sample = await prisma.cashProofSample.findFirst({ where: { id: input.sampleId, engagementId: engagement.id } });
      if (!sample) throw new CashProofError('Sample not found', 404);

      const data: Record<string, unknown> = {};
      const amountFields = [
        'statementBeginning',
        'statementDeposits',
        'statementWithdrawals',
        'statementEnding',
        'reconcilingItems',
      ] as const;
      let amountsChanged = false;
      for (const field of amountFields) {
        if (field in input) {
          data[field] = optionalNumber(input[field]);
          amountsChanged = true;
        }
      }
      if (amountsChanged) {
        data.enteredByUserId = userId;
        data.enteredAt = new Date();
      }
      if ('dataRoomDocumentId' in input) {
        const docId = optionalText(input.dataRoomDocumentId, 100);
        if (docId) {
          const doc = await prisma.dataRoomDocument.findFirst({ where: { id: docId, companyId }, select: { id: true } });
          if (!doc) throw new CashProofError('Document not found in this company Data Room');
        }
        data.dataRoomDocumentId = docId;
      }
      if ('exceptionNote' in input) data.exceptionNote = optionalText(input.exceptionNote, 2000);
      if ('resolutionNote' in input) data.resolutionNote = optionalText(input.resolutionNote, 2000);

      const merged = { ...sample, ...data } as typeof sample;
      if (input.clear) {
        if (!String(merged.resolutionNote || '').trim()) {
          throw new CashProofError('Add a resolution note before clearing an exception');
        }
        merged.status = 'CLEARED';
        data.resolvedByUserId = userId;
        data.resolvedAt = new Date();
      } else if (input.clear === false) {
        merged.status = 'EXCEPTION';
        data.resolvedByUserId = null;
        data.resolvedAt = null;
      }

      const [book, prior] = await Promise.all([
        prisma.cashProofBookBalance.findUnique({
          where: { bankAccountId_month: { bankAccountId: sample.bankAccountId, month: sample.month } },
        }),
        prisma.cashProofSample.findUnique({
          where: {
            engagementId_bankAccountId_month: {
              engagementId: engagement.id,
              bankAccountId: sample.bankAccountId,
              month: shiftMonth(sample.month, -1),
            },
          },
          select: { statementEnding: true },
        }),
      ]);
      const tieOut = computeTieOut(merged, book?.endingBalance ?? null, prior?.statementEnding ?? null, engagement.balanceTolerance);
      data.status = tieOut.status;
      await prisma.cashProofSample.update({ where: { id: sample.id }, data });
      return;
    }
    case 'set-deposit': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      await requireBankAccount(engagement.id, input.bankAccountId);
      if (!MONTH_RE.test(input.month) || input.month < engagement.periodStartMonth || input.month > engagement.periodEndMonth) {
        throw new CashProofError('Month is outside the cash proof period');
      }
      const sampled = await prisma.cashProofSample.findUnique({
        where: {
          engagementId_bankAccountId_month: { engagementId: engagement.id, bankAccountId: input.bankAccountId, month: input.month },
        },
        select: { id: true },
      });
      if (sampled) {
        throw new CashProofError('This month is in the balance sample. Enter its deposits on the sampled statement.', 409);
      }
      const value = optionalNumber(input.totalDeposits);
      if (value !== null && value < 0) throw new CashProofError('Deposits cannot be negative');
      if (value === null) {
        await prisma.cashProofDeposit.deleteMany({ where: { bankAccountId: input.bankAccountId, month: input.month } });
      } else {
        await prisma.cashProofDeposit.upsert({
          where: { bankAccountId_month: { bankAccountId: input.bankAccountId, month: input.month } },
          create: { bankAccountId: input.bankAccountId, month: input.month, totalDeposits: value, enteredByUserId: userId },
          update: { totalDeposits: value, enteredByUserId: userId, enteredAt: new Date() },
        });
      }
      return;
    }
    case 'add-revenue-adjustment': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      if (!MONTH_RE.test(input.month) || input.month < engagement.periodStartMonth || input.month > engagement.periodEndMonth) {
        throw new CashProofError('Month is outside the cash proof period');
      }
      if (!(input.category in REVENUE_ADJUSTMENT_CATEGORIES)) throw new CashProofError('Choose a category');
      const amount = optionalNumber(input.amount);
      if (amount === null || amount <= 0) throw new CashProofError('Amount must be greater than zero');
      const bankAccountId = optionalText(input.bankAccountId, 100);
      if (bankAccountId) await requireBankAccount(engagement.id, bankAccountId);
      await prisma.cashProofRevenueAdjustment.create({
        data: {
          engagementId: engagement.id,
          bankAccountId,
          month: input.month,
          category: input.category,
          amount,
          description: optionalText(input.description, 500),
          createdByUserId: userId,
        },
      });
      return;
    }
    case 'delete-revenue-adjustment': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const { count } = await prisma.cashProofRevenueAdjustment.deleteMany({
        where: { id: input.adjustmentId, engagementId: engagement.id },
      });
      if (count === 0) throw new CashProofError('Adjustment not found', 404);
      return;
    }
    case 'set-revenue-period-note': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const key = String(input.periodKey || '');
      if (!/^FY\d{4}$/.test(key)) throw new CashProofError('Unknown period');
      const notes = { ...((engagement.revenuePeriodNotes as Record<string, string> | null) || {}) };
      const note = optionalText(input.note, 2000);
      if (note) notes[key] = note;
      else delete notes[key];
      await prisma.cashProofEngagement.update({ where: { id: engagement.id }, data: { revenuePeriodNotes: notes } });
      return;
    }
    case 'set-tax-return': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const key = String(input.periodKey || '');
      if (!completeFiscalYearKeys(engagement.periodStartMonth, engagement.periodEndMonth, engagement.fiscalYearEndMonth).has(key)) {
        throw new CashProofError('Tax returns can only be entered for complete fiscal years in the review period');
      }
      const entries = { ...((engagement.taxReturns as Record<string, TaxReturnEntry> | null) || {}) };
      const current: TaxReturnEntry = entries[key] ?? {
        form: null,
        basis: 'ACCRUAL',
        grossReceipts: null,
        returnsAllowances: null,
        dataRoomDocumentId: null,
        source: 'entered',
        note: null,
        updatedAt: new Date().toISOString(),
      };
      if (input.reset) {
        // The accounting method is not read from the return, so it survives a reset.
        if (current.basis === 'ACCRUAL') delete entries[key];
        else {
          entries[key] = {
            form: null,
            basis: current.basis,
            grossReceipts: null,
            returnsAllowances: null,
            dataRoomDocumentId: null,
            source: 'entered',
            note: null,
            updatedAt: new Date().toISOString(),
          };
        }
        await prisma.cashProofEngagement.update({ where: { id: engagement.id }, data: { taxReturns: entries } });
        return;
      }
      const next: TaxReturnEntry = { ...current, updatedAt: new Date().toISOString() };
      if ('form' in input) {
        const form = optionalText(input.form, 20);
        if (form && !(form in TAX_RETURN_FORMS)) throw new CashProofError('Choose a tax form');
        next.form = (form as TaxReturnForm | null) ?? null;
      }
      if ('basis' in input) {
        if (!(String(input.basis) in TAX_RETURN_BASIS_LABELS)) throw new CashProofError('Choose cash or accrual');
        next.basis = input.basis as TaxReturnBasis;
      }
      for (const field of ['grossReceipts', 'returnsAllowances'] as const) {
        if (!(field in input)) continue;
        const value = optionalNumber(input[field]);
        if (value !== null && value < 0) throw new CashProofError('Tax return amounts cannot be negative');
        next[field] = value;
        next.source = 'entered';
      }
      if ('dataRoomDocumentId' in input) {
        const docId = optionalText(input.dataRoomDocumentId, 100);
        if (docId) {
          const doc = await prisma.dataRoomDocument.findFirst({ where: { id: docId, companyId }, select: { id: true } });
          if (!doc) throw new CashProofError('Document not found in this company Data Room');
        }
        next.dataRoomDocumentId = docId;
      }
      if ('note' in input) next.note = optionalText(input.note, 2000);
      const empty =
        next.grossReceipts === null && next.returnsAllowances === null && !next.form && !next.dataRoomDocumentId && !next.note;
      if (empty) delete entries[key];
      else entries[key] = next;
      await prisma.cashProofEngagement.update({ where: { id: engagement.id }, data: { taxReturns: entries } });
      return;
    }
    case 'scan-tax-returns': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      await scanTaxReturns(companyId, engagement.id);
      return;
    }
    case 'scan-statements': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      await scanBankStatements(companyId, engagement.id, userId);
      await runTransactionMatch(companyId, engagement.id);
      return;
    }
    case 'match-transactions': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      await runTransactionMatch(companyId, engagement.id);
      return;
    }
    case 'update-transaction-exception': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const exception = await prisma.cashProofTransactionException.findFirst({
        where: { id: input.exceptionId, engagementId: engagement.id },
      });
      if (!exception) throw new CashProofError('Exception not found', 404);
      if (exception.status === 'AUTO_RESOLVED') throw new CashProofError('This exception no longer occurs in the latest matching run', 409);
      const data: Record<string, unknown> = {};
      if ('resolutionNote' in input) data.resolutionNote = optionalText(input.resolutionNote, 2000);
      const note = 'resolutionNote' in data ? data.resolutionNote : exception.resolutionNote;
      if (input.clear) {
        if (!String(note || '').trim()) throw new CashProofError('Add a resolution note before clearing an exception');
        Object.assign(data, { status: 'CLEARED', resolvedByUserId: userId, resolvedAt: new Date() });
      } else if (input.clear === false) {
        Object.assign(data, { status: 'OPEN', resolvedByUserId: null, resolvedAt: null });
      }
      await prisma.cashProofTransactionException.update({ where: { id: exception.id }, data });
      return;
    }
    case 'clear-transaction-exceptions': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const note = optionalText(input.resolutionNote, 2000);
      if (!note) throw new CashProofError('Add a resolution note before clearing exceptions');
      const ids = Array.isArray(input.exceptionIds) ? input.exceptionIds.map(String).slice(0, 5000) : [];
      if (ids.length === 0) throw new CashProofError('Select at least one exception');
      await prisma.cashProofTransactionException.updateMany({
        where: { id: { in: ids }, engagementId: engagement.id, status: 'OPEN' },
        data: { status: 'CLEARED', resolutionNote: note, resolvedByUserId: userId, resolvedAt: new Date() },
      });
      return;
    }
    case 'lock': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      const open = await prisma.cashProofSample.count({
        where: { engagementId: engagement.id, status: { in: ['REQUESTED', 'RECEIVED', 'EXCEPTION'] }, bankAccount: { included: true } },
      });
      if (open > 0) {
        throw new CashProofError(`${open} sampled account-month(s) are not yet tied or cleared`, 409);
      }
      const openTransactions = await prisma.cashProofTransactionException.count({
        where: {
          engagementId: engagement.id,
          status: 'OPEN',
          OR: [{ bankAccountId: null }, { bankAccount: { included: true } }],
        },
      });
      if (openTransactions > 0) {
        throw new CashProofError(`${openTransactions} transaction exception(s) from book-to-bank matching are still open`, 409);
      }
      const { summary } = await loadCashProofState(companyId);
      if (summary.depositMonthsMissing > 0) {
        throw new CashProofError(`${summary.depositMonthsMissing} account-month(s) are missing statement deposits`, 409);
      }
      if (summary.revenuePeriodsOpen > 0) {
        throw new CashProofError(
          `${summary.revenuePeriodsOpen} fiscal period(s) in Deposits to Revenue are not reconciled or explained`,
          409,
        );
      }
      if (summary.taxReturnPeriodsOpen > 0) {
        throw new CashProofError(
          `${summary.taxReturnPeriodsOpen} fiscal year(s) differ from the tax return with no explanation`,
          409,
        );
      }
      await prisma.cashProofEngagement.update({
        where: { id: engagement.id },
        data: { status: 'LOCKED', lockedAt: new Date(), lockedByUserId: userId },
      });
      return;
    }
    case 'unlock': {
      const engagement = await requireEngagement(companyId, input.engagementId, true);
      await prisma.cashProofEngagement.update({
        where: { id: engagement.id },
        data: { status: engagement.sampleSeed || engagement.sampledAt ? 'SAMPLED' : 'DRAFT', lockedAt: null, lockedByUserId: null },
      });
      return;
    }
    default:
      throw new CashProofError('Unknown action');
  }
}
