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
import { computeTieOut, type CashProofSampleStatus, type TieOutResult } from './tie-out';

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
  revenueReconciliation: RevenueReconciliation | null;
  statementScan: StatementScan | null;
  balanceSheetCash: Record<string, number>;
  completeness: Record<string, { bookTotal: number | null; balanceSheetCash: number | null; difference: number | null }>;
  bankStatementDocuments: Array<{ id: string; originalFileName: string; createdAt: string }>;
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
  const [engagement, latestFinancialMonth, bankStatementDocuments] = await Promise.all([
    latestEngagement(companyId),
    resolveLatestFinancialMonth(companyId),
    loadBankStatementDocuments(companyId),
  ]);

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
  };
  if (!engagement) {
    return {
      engagement: null,
      latestFinancialMonth,
      months: [],
      accounts: [],
      samples: [],
      revenueAdjustments: [],
      revenueReconciliation: null,
      statementScan: null,
      balanceSheetCash: {},
      completeness: {},
      bankStatementDocuments,
      summary: emptySummary,
    };
  }

  const months = monthRange(engagement.periodStartMonth, engagement.periodEndMonth);
  const [balanceSheetCash, revenueBasis] = await Promise.all([
    loadBalanceSheetCashByMonth(companyId, engagement.periodStartMonth, engagement.periodEndMonth),
    loadRevenueBasisByMonth(companyId, shiftMonth(engagement.periodStartMonth, -1), engagement.periodEndMonth),
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
  };

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
  const revenueReconciliation = computeRevenueReconciliation({
    months,
    fiscalYearEndMonth: engagement.fiscalYearEndMonth,
    tolerancePct: engagement.revenueTolerancePct,
    depositsByMonth: Object.fromEntries(
      months.map((m) => [m, includedAccounts.map((a) => a.deposits[m]?.value ?? null)]),
    ),
    adjustments: [
      ...revenueAdjustments.filter((r) => !r.bankAccountId || includedIds.has(r.bankAccountId)),
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
    revenueReconciliation,
    statementScan: (engagement.statementScan as unknown as StatementScan | null) ?? null,
    balanceSheetCash,
    completeness,
    bankStatementDocuments,
    summary,
  };
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

/** Pull mapped cash accounts and their month-end balances from the accounting source. */
async function refreshBookBalances(companyId: string, engagementId: string) {
  const engagement = await prisma.cashProofEngagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { bankAccounts: true },
  });
  const mappings = await listCashAccountMappings(companyId);
  const existingByMapping = new Map(
    engagement.bankAccounts.filter((a) => a.accountMappingId).map((a) => [a.accountMappingId!, a]),
  );
  let sortOrder = engagement.bankAccounts.length;
  for (const mapping of mappings) {
    if (existingByMapping.has(mapping.id)) continue;
    const created = await prisma.cashProofBankAccount.create({
      data: {
        engagementId,
        accountMappingId: mapping.id,
        sourceAccountId: mapping.accountId || mapping.accountCode || null,
        accountName: mapping.accountName,
        sortOrder: sortOrder++,
      },
    });
    existingByMapping.set(mapping.id, created);
  }

  const months = monthRange(engagement.periodStartMonth, engagement.periodEndMonth);
  const { source, balances } = await loadCashBookBalances(companyId, mappings, months);
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
  | { action: 'scan-statements'; engagementId: string }
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
    case 'scan-statements': {
      const engagement = await requireEngagement(companyId, input.engagementId);
      await scanBankStatements(companyId, engagement.id, userId);
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
