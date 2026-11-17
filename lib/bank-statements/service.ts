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
  isAggregatorSource,
  type BankStatementSource,
} from './providers';

export type CoverageStatus = 'BANK_API' | 'VERIFIED_UPLOAD' | 'SUSPECT_UPLOAD' | 'UPLOAD' | 'MISSING';

export type BankStatementDocumentView = {
  id: string;
  fileName: string;
  source: BankStatementSource;
  institution: string | null;
  accountLast4: string | null;
  month: string | null;
  bankAccountId: string | null;
  retrievedAt: string | null;
  uploadedAt: string;
  uploadedByName: string | null;
  tamperStatus: string | null;
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
  summary: { accountMonths: number; covered: number; bankApi: number; uploads: number; missing: number };
};

const toSource = (value: string | null): BankStatementSource =>
  value === 'PLAID' || value === 'FINICITY' || value === 'YODLEE' ? value : 'UPLOAD';

function documentStatus(doc: Pick<BankStatementDocumentView, 'source' | 'tamperStatus'>): Exclude<CoverageStatus, 'MISSING'> {
  if (isAggregatorSource(doc.source)) return 'BANK_API';
  if (doc.tamperStatus === 'AUTHENTIC') return 'VERIFIED_UPLOAD';
  if (doc.tamperStatus === 'SUSPECT') return 'SUSPECT_UPLOAD';
  return 'UPLOAD';
}

// A suspect upload outranks clean uploads so it is never hidden behind another file for the same month.
const STATUS_RANK: Record<CoverageStatus, number> = { BANK_API: 4, SUSPECT_UPLOAD: 3, VERIFIED_UPLOAD: 2, UPLOAD: 1, MISSING: 0 };

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

  const documents: BankStatementDocumentView[] = rows.map((d) => {
    const base = {
      id: d.id,
      fileName: d.originalFileName,
      source: toSource(d.statementSource),
      institution: d.statementInstitution,
      accountLast4: d.statementAccountLast4,
      month: d.statementMonth,
      retrievedAt: d.statementRetrievedAt ? d.statementRetrievedAt.toISOString() : null,
      uploadedAt: d.createdAt.toISOString(),
      uploadedByName: d.uploadedBy?.name || d.uploadedBy?.email || null,
      tamperStatus: d.tamperStatus,
      scanStatus: scanStatusById.get(d.id) || 'pending_scan',
      isPrivate: isPrivateBlob(d),
    };
    const link = linked.get(d.id);
    if (link) return { ...base, month: base.month || link.month, bankAccountId: link.bankAccountId, unplacedReason: null };
    if (!engagement) {
      return { ...base, bankAccountId: null, unplacedReason: 'Start the Cash Proof to match statements to bank accounts.' };
    }
    if (!d.statementMonth || !d.statementAccountLast4) {
      return { ...base, bankAccountId: null, unplacedReason: 'Not read yet. Run Read Statements on the Cash Proof tab.' };
    }
    const matches = accounts.filter((a) => a.accountLast4 === d.statementAccountLast4);
    if (matches.length !== 1) {
      return {
        ...base,
        bankAccountId: null,
        unplacedReason:
          matches.length === 0
            ? `No Cash Proof account has last 4 ${d.statementAccountLast4}.`
            : `More than one Cash Proof account has last 4 ${d.statementAccountLast4}.`,
      };
    }
    return { ...base, bankAccountId: matches[0].id, unplacedReason: null };
  });

  const coverage: BankStatementsState['coverage'] = {};
  for (const account of accounts) {
    for (const month of months) coverage[`${account.id}|${month}`] = { status: 'MISSING', documentIds: [] };
  }
  for (const doc of documents) {
    if (!doc.bankAccountId || !doc.month) continue;
    if (!monthSet.has(doc.month)) {
      doc.unplacedReason = 'Statement month is outside the 36-month review window.';
      continue;
    }
    const cell = coverage[`${doc.bankAccountId}|${doc.month}`];
    if (!cell) continue;
    cell.documentIds.push(doc.id);
    const status = documentStatus(doc);
    if (STATUS_RANK[status] > STATUS_RANK[cell.status]) cell.status = status;
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
      bankApi: cells.filter((c) => c.status === 'BANK_API').length,
      uploads: cells.filter((c) => c.status !== 'MISSING' && c.status !== 'BANK_API').length,
      missing: cells.filter((c) => c.status === 'MISSING').length,
    },
  };
}
