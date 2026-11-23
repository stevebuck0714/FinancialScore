import prisma from '@/lib/prisma';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { isPrivateBlob, isPrivateBlobStorageConfigured } from '@/lib/dataroom/blob-storage';
import { monthRange, shiftMonth } from '@/lib/cash-proof/book-balances';
import { previousEstMonthKey } from '@/lib/time/eastern';
import { isPlaidConfigured } from './plaid';
import {
  AGGREGATOR_MAX_MONTHS,
  BANK_STATEMENT_PROVIDERS,
  BANK_STATEMENT_REVIEW_MONTHS,
  BANK_STATEMENT_SOURCES,
  isAggregatorSource,
  parseBankActivity,
  type BankStatementSource,
} from './providers';
import { matchStatementAccount } from './account-match';
import type { StatementScan } from '@/lib/cash-proof/statement-scan';

/**
 * BANK_DATA: monthly figures from bank transactions and balances (Plaid asset report), no statement PDF.
 * CONFLICT: two sources for the same account-month report different deposit totals.
 */
export type CoverageStatus = 'CONFLICT' | 'BANK_API' | 'BANK_DATA' | 'VERIFIED_UPLOAD' | 'SUSPECT_UPLOAD' | 'UPLOAD' | 'MISSING';

export type BankStatementDocumentView = {
  id: string;
  fileName: string;
  source: BankStatementSource;
  institution: string | null;
  accountLast4: string | null;
  month: string | null;
  /** First and last month of a bank data report, which covers many months in one file. */
  period: { start: string; end: string } | null;
  /** Last 4 of each account a bank data report covers. */
  coveredLast4s: string[];
  /** Posted transactions saved from a bank data report. */
  transactionCount: number;
  bankAccountId: string | null;
  retrievedAt: string | null;
  uploadedAt: string;
  uploadedByName: string | null;
  tamperStatus: string | null;
  /** CSV / Excel transaction exports only. */
  reviewStatus: string | null;
  reviewNote: string | null;
  scanStatus: string;
  isPrivate: boolean;
  /** Why the statement is not on the coverage grid; null when it is. */
  unplacedReason: string | null;
};

export type BankStatementsState = {
  privateStorage: boolean;
  publicStatementCount: number;
  providers: Array<{ id: string; label: string; coverage: string; available: boolean }>;
  engagementId: string | null;
  months: string[];
  /** Months older than what the aggregators return; these come from client uploads only. */
  uploadOnlyMonths: string[];
  accounts: Array<{ id: string; accountName: string; bankName: string | null; accountLast4: string | null }>;
  coverage: Record<string, { status: CoverageStatus; documentIds: string[] }>;
  documents: BankStatementDocumentView[];
  summary: {
    accountMonths: number;
    covered: number;
    bankApi: number;
    uploads: number;
    conflicts: number;
    missing: number;
    /** Client transaction files waiting for the Corelytics team. */
    pendingReview: number;
  };
};

const toSource = (value: string | null): BankStatementSource =>
  BANK_STATEMENT_SOURCES.includes(value as BankStatementSource) ? (value as BankStatementSource) : 'UPLOAD';

function documentStatus(doc: Pick<BankStatementDocumentView, 'source' | 'tamperStatus'>): Exclude<CoverageStatus, 'MISSING' | 'CONFLICT'> {
  if (doc.source === 'PLAID_ASSETS') return 'BANK_DATA';
  if (isAggregatorSource(doc.source)) return 'BANK_API';
  if (doc.tamperStatus === 'AUTHENTIC') return 'VERIFIED_UPLOAD';
  if (doc.tamperStatus === 'SUSPECT') return 'SUSPECT_UPLOAD';
  return 'UPLOAD';
}

// A suspect upload outranks clean uploads so it is never hidden behind another file for the same month.
const STATUS_RANK: Record<CoverageStatus, number> = {
  CONFLICT: 6,
  BANK_API: 5,
  BANK_DATA: 4,
  SUSPECT_UPLOAD: 3,
  VERIFIED_UPLOAD: 2,
  UPLOAD: 1,
  MISSING: 0,
};

export async function loadBankStatementsState(companyId: string): Promise<BankStatementsState> {
  const [company, engagement] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } }),
    withPrismaReconnectRetry(
      () =>
        prisma.cashProofEngagement.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            periodEndMonth: true,
            statementScan: true,
            bankAccounts: {
              where: { included: true },
              orderBy: [{ sortOrder: 'asc' }, { accountName: 'asc' }],
              select: { id: true, accountName: true, bankName: true, accountLast4: true },
            },
            samples: { select: { bankAccountId: true, month: true, dataRoomDocumentId: true } },
          },
        }),
      'bank-statements.engagement',
    ),
  ]);

  const entries = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>).filter(
    (e) => String(e?.folderId || '') === DATAROOM_BANK_STATEMENTS_FOLDER_ID,
  );
  const scanStatusById = new Map(entries.map((e) => [String(e.documentId || ''), String(e.scanStatus || 'pending_scan')]));
  const rows = scanStatusById.size
    ? await prisma.dataRoomDocument.findMany({
        where: { companyId, id: { in: [...scanStatusById.keys()] } },
        orderBy: [{ statementMonth: 'desc' }, { originalFileName: 'asc' }],
        select: {
          id: true,
          originalFileName: true,
          blobUrl: true,
          storageAccess: true,
          statementSource: true,
          statementInstitution: true,
          statementAccountLast4: true,
          statementMonth: true,
          statementRetrievedAt: true,
          tamperStatus: true,
          bankActivity: true,
          reviewStatus: true,
          reviewNote: true,
          _count: { select: { bankTransactions: true } },
          createdAt: true,
          uploadedBy: { select: { name: true, email: true } },
        },
      })
    : [];

  const accounts = engagement?.bankAccounts ?? [];
  const endMonth = engagement?.periodEndMonth || previousEstMonthKey();
  const months = monthRange(shiftMonth(endMonth, -(BANK_STATEMENT_REVIEW_MONTHS - 1)), endMonth);
  const firstAggregatorMonth = shiftMonth(endMonth, -(AGGREGATOR_MAX_MONTHS - 1));
  const monthSet = new Set(months);

  const deposits = engagement
    ? await prisma.cashProofDeposit.findMany({
        where: { bankAccountId: { in: accounts.map((a) => a.id) }, dataRoomDocumentId: { not: null } },
        select: { bankAccountId: true, month: true, dataRoomDocumentId: true },
      })
    : [];
  const linked = new Map<string, { bankAccountId: string; month: string }>();
  for (const link of [...(engagement?.samples ?? []), ...deposits]) {
    if (link.dataRoomDocumentId) linked.set(link.dataRoomDocumentId, { bankAccountId: link.bankAccountId, month: link.month });
  }

  // The last Read Statements result per file explains why a file is off the grid better than a guess from its fields.
  const scanById = new Map(
    ((engagement?.statementScan as unknown as StatementScan | null)?.results ?? []).map((r) => [r.documentId, r]),
  );
  const notPlaced = (documentId: string, fallback: string) => {
    const r = scanById.get(documentId);
    return r && r.status !== 'APPLIED' && r.status !== 'VERIFIED' ? `Read Statements: ${r.message}` : fallback;
  };

  const activityById = new Map(rows.map((d) => [d.id, parseBankActivity(d.bankActivity)]));
  const documents: BankStatementDocumentView[] = rows.map((d) => {
    const activity = activityById.get(d.id) ?? [];
    const activityMonths = activity.map((a) => a.month).sort();
    const base = {
      id: d.id,
      fileName: d.originalFileName,
      source: toSource(d.statementSource),
      institution: d.statementInstitution,
      accountLast4: d.statementAccountLast4,
      month: d.statementMonth,
      period: activityMonths.length ? { start: activityMonths[0], end: activityMonths[activityMonths.length - 1] } : null,
      coveredLast4s: [...new Set(activity.map((a) => a.last4).filter((v): v is string => !!v))],
      transactionCount: d._count.bankTransactions,
      retrievedAt: d.statementRetrievedAt ? d.statementRetrievedAt.toISOString() : null,
      uploadedAt: d.createdAt.toISOString(),
      uploadedByName: d.uploadedBy?.name || d.uploadedBy?.email || null,
      tamperStatus: d.tamperStatus,
      reviewStatus: d.reviewStatus,
      reviewNote: d.reviewNote,
      scanStatus: scanStatusById.get(d.id) || 'pending_scan',
      isPrivate: isPrivateBlob(d),
    };
    if (base.source === 'UPLOAD_EXPORT' && d.reviewStatus !== 'ACCEPTED') {
      return {
        ...base,
        bankAccountId: null,
        unplacedReason:
          d.reviewStatus === 'REJECTED'
            ? `Returned to the client${d.reviewNote ? `: ${d.reviewNote}` : '.'}`
            : 'Awaiting review by the Corelytics team.',
      };
    }
    if (activity.length > 0) {
      return { ...base, bankAccountId: null, unplacedReason: engagement ? null : 'Start the Cash Proof to match statements to bank accounts.' };
    }
    const link = linked.get(d.id);
    if (link) return { ...base, month: base.month || link.month, bankAccountId: link.bankAccountId, unplacedReason: null };
    if (!engagement) {
      return { ...base, bankAccountId: null, unplacedReason: 'Start the Cash Proof to match statements to bank accounts.' };
    }
    if (base.source === 'PLAID_ASSETS') return { ...base, bankAccountId: null, unplacedReason: null };
    if (!d.statementMonth || !d.statementAccountLast4) {
      return { ...base, bankAccountId: null, unplacedReason: notPlaced(d.id, 'Not read yet. Run Read Statements on the Cash Proof tab.') };
    }
    const { account, candidates } = matchStatementAccount(accounts, d.statementAccountLast4, d.statementInstitution);
    if (!account) {
      return {
        ...base,
        bankAccountId: null,
        unplacedReason:
          candidates.length === 0
            ? `No Cash Proof account has last 4 ${d.statementAccountLast4}.`
            : `More than one Cash Proof account has last 4 ${d.statementAccountLast4}, and the bank name does not tell them apart.`,
      };
    }
    return { ...base, bankAccountId: account.id, unplacedReason: null };
  });

  const coverage: BankStatementsState['coverage'] = {};
  for (const account of accounts) {
    for (const month of months) coverage[`${account.id}|${month}`] = { status: 'MISSING', documentIds: [] };
  }
  const place = (bankAccountId: string, month: string, doc: BankStatementDocumentView) => {
    const cell = coverage[`${bankAccountId}|${month}`];
    if (!cell) return;
    cell.documentIds.push(doc.id);
    const status = documentStatus(doc);
    if (STATUS_RANK[status] > STATUS_RANK[cell.status]) cell.status = status;
  };
  const depositsByCell = new Map<string, Set<string>>();
  for (const doc of documents) {
    const activity = activityById.get(doc.id) ?? [];
    if (engagement && activity.length > 0 && (doc.source !== 'UPLOAD_EXPORT' || doc.reviewStatus === 'ACCEPTED')) {
      let placed = 0;
      for (const entry of activity) {
        const { account } = matchStatementAccount(accounts, entry.last4, entry.bankName ?? doc.institution);
        if (!account || !monthSet.has(entry.month)) continue;
        place(account.id, entry.month, doc);
        const key = `${account.id}|${entry.month}`;
        depositsByCell.set(key, (depositsByCell.get(key) ?? new Set()).add(entry.deposits.toFixed(2)));
        placed += 1;
      }
      if (placed === 0) {
        doc.unplacedReason = `No Cash Proof account matches last 4 ${doc.coveredLast4s.join(', ') || '(none reported)'} within the review window.`;
      }
      continue;
    }
    if (!doc.bankAccountId || !doc.month) continue;
    if (!monthSet.has(doc.month)) {
      doc.unplacedReason = 'Statement month is outside the 36-month review window.';
      continue;
    }
    place(doc.bankAccountId, doc.month, doc);
  }
  for (const [key, totals] of depositsByCell) {
    if (totals.size > 1 && coverage[key]) coverage[key].status = 'CONFLICT';
  }

  const cells = Object.values(coverage);
  return {
    privateStorage: isPrivateBlobStorageConfigured(),
    publicStatementCount: documents.filter((d) => !d.isPrivate).length,
    providers: BANK_STATEMENT_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      coverage: p.coverage,
      available: p.id === 'plaid' && isPlaidConfigured(),
    })),
    engagementId: engagement?.id ?? null,
    months,
    uploadOnlyMonths: months.filter((m) => m < firstAggregatorMonth),
    accounts,
    coverage,
    documents,
    summary: {
      accountMonths: cells.length,
      covered: cells.filter((c) => c.status !== 'MISSING').length,
      bankApi: cells.filter((c) => c.status === 'BANK_API' || c.status === 'BANK_DATA').length,
      uploads: cells.filter((c) => c.status === 'VERIFIED_UPLOAD' || c.status === 'SUSPECT_UPLOAD' || c.status === 'UPLOAD').length,
      conflicts: cells.filter((c) => c.status === 'CONFLICT').length,
      missing: cells.filter((c) => c.status === 'MISSING').length,
      pendingReview: documents.filter((d) => d.source === 'UPLOAD_EXPORT' && d.reviewStatus === 'PENDING').length,
    },
  };
}
