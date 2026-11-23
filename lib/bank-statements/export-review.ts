import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';
import { readDataRoomBlob } from '@/lib/dataroom/blob-storage';
import { scanBankStatements } from '@/lib/cash-proof/statement-scan';
import { runTransactionMatch } from '@/lib/cash-proof/transaction-match-run';
import { BankStatementsAccessError } from './access';
import {
  buildConfirmedImport,
  buildPreview,
  detectMapping,
  headerSignature,
  readTransactionFile,
  type ConfirmedAccount,
  type TransactionFileMapping,
  type TransactionFilePreview,
} from './transaction-file';

export type ExportImportMapping = TransactionFileMapping & {
  headerSignature: string;
  accounts: ConfirmedAccount[];
  fromMonth: string | null;
  toMonth: string | null;
};

export type ExportPreviewResponse = TransactionFilePreview & {
  fileName: string;
  reviewStatus: string | null;
  /** True when the columns came from an earlier confirmed file with the same layout. */
  rememberedLayout: boolean;
  saved: ExportImportMapping | null;
};

type ReviewContext = { userId: string; email: string };

async function loadExport(companyId: string, documentId: string) {
  const doc = await prisma.dataRoomDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      companyId: true,
      originalFileName: true,
      blobUrl: true,
      storageAccess: true,
      statementSource: true,
      reviewStatus: true,
      importMapping: true,
    },
  });
  if (!doc || doc.companyId !== companyId || doc.statementSource !== 'UPLOAD_EXPORT') {
    throw new BankStatementsAccessError('Transaction file not found for this company.', 404);
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  const entry = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>).find(
    (e) => String(e?.documentId || '') === documentId,
  );
  if (String(entry?.scanStatus || '') !== 'clean') {
    throw new BankStatementsAccessError('This file is waiting for the Data Room virus scan to finish.', 409);
  }
  return { doc, userDefinedAllocations: company?.userDefinedAllocations };
}

async function readFile(doc: { originalFileName: string; blobUrl: string; storageAccess: string }, sheet: string | null) {
  const buffer = Buffer.from(await readDataRoomBlob(doc));
  return readTransactionFile(buffer, doc.originalFileName, sheet);
}

/** The most recent confirmed mapping, from any company, for a file with the same header row. */
async function rememberedMapping(signature: string): Promise<ExportImportMapping | null> {
  if (!signature.replace(/\|/g, '')) return null;
  const prior = await prisma.dataRoomDocument.findFirst({
    where: { reviewStatus: 'ACCEPTED', importMapping: { path: ['headerSignature'], equals: signature } },
    orderBy: { reviewedAt: 'desc' },
    select: { importMapping: true },
  });
  return (prior?.importMapping as ExportImportMapping | null) ?? null;
}

export async function previewStatementExport(params: {
  companyId: string;
  documentId: string;
  sheet?: string | null;
  mapping?: TransactionFileMapping | null;
}): Promise<ExportPreviewResponse> {
  const { doc } = await loadExport(params.companyId, params.documentId);
  const saved = (doc.importMapping as ExportImportMapping | null) ?? null;
  const file = await readFile(doc, params.mapping?.sheet ?? params.sheet ?? saved?.sheet ?? null);

  const savedApplies = saved && (!params.sheet || params.sheet === saved.sheet);
  let mapping = params.mapping ?? (savedApplies ? saved : null);
  let rememberedLayout = false;
  if (!mapping) {
    const detected = detectMapping(file);
    const prior = await rememberedMapping(headerSignature(file, detected));
    if (prior) {
      mapping = { ...detected, columns: prior.columns, depositsPositive: prior.depositsPositive };
      rememberedLayout = true;
    } else {
      mapping = detected;
    }
  }
  return {
    ...buildPreview(file, doc.originalFileName, { ...mapping, sheet: file.sheet }),
    fileName: doc.originalFileName,
    reviewStatus: doc.reviewStatus,
    rememberedLayout,
    saved,
  };
}

const LAST4 = /^\d{4}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function recordReview(
  companyId: string,
  userDefinedAllocations: unknown,
  ctx: ReviewContext,
  documentId: string,
  details: Record<string, unknown>,
) {
  const updated = appendDataRoomAuditEvents(upsertDataRoomState(userDefinedAllocations, {}), [
    await buildDataRoomAuditEvent({
      action: 'statement_export_reviewed',
      companyId,
      userId: ctx.userId,
      userEmail: ctx.email,
      folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
      documentId,
      details,
    }),
  ]);
  await prisma.company.update({ where: { id: companyId }, data: { userDefinedAllocations: updated } });
}

const TRANSACTION_BATCH = 1000;

export async function acceptStatementExport(params: {
  companyId: string;
  documentId: string;
  mapping: TransactionFileMapping;
  accounts: ConfirmedAccount[];
  fromMonth: string | null;
  toMonth: string | null;
  ctx: ReviewContext;
}): Promise<{ transactions: number; accountMonths: number; readStatements: boolean }> {
  const { companyId, documentId, mapping, ctx } = params;
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;
  const accounts: ConfirmedAccount[] = params.accounts
    .map((a) => ({
      value: String(a.value ?? ''),
      last4: String(a.last4 || '').trim(),
      name: text(a.name, 200),
      bankName: text(a.bankName, 120),
      bankAccountId: text(a.bankAccountId, 60),
    }))
    .filter((a) => a.last4);
  if (accounts.length === 0) throw new BankStatementsAccessError('Enter the bank and the last 4 digits of the bank account.', 400);
  if (accounts.some((a) => !LAST4.test(a.last4))) throw new BankStatementsAccessError('Account last 4 must be four digits.', 400);
  if (accounts.some((a) => !a.bankName)) throw new BankStatementsAccessError('Enter the bank for every account in the file.', 400);
  const fromMonth = params.fromMonth && MONTH.test(params.fromMonth) ? params.fromMonth : null;
  const toMonth = params.toMonth && MONTH.test(params.toMonth) ? params.toMonth : null;

  const engagement = await prisma.cashProofEngagement.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, bankAccounts: { select: { id: true, accountName: true, bankName: true, accountLast4: true } } },
  });
  const accountUpdates: Array<{ id: string; bankName: string | null; accountLast4: string }> = [];
  for (const a of accounts) {
    if (!a.bankAccountId) continue;
    const target = engagement?.bankAccounts.find((b) => b.id === a.bankAccountId);
    if (!target) throw new BankStatementsAccessError('The chosen Cash Proof account was not found.', 404);
    if (target.accountLast4 && target.accountLast4 !== a.last4) {
      throw new BankStatementsAccessError(`${target.accountName} is already set to last 4 ${target.accountLast4}, not ${a.last4}.`, 409);
    }
    if (!target.accountLast4 || !target.bankName) {
      accountUpdates.push({ id: target.id, bankName: target.bankName || a.bankName, accountLast4: a.last4 });
    }
  }
  if (accountUpdates.length > 0 && engagement?.status === 'LOCKED') {
    throw new BankStatementsAccessError('The Cash Proof is locked. Unlock it to link this file to its account.', 409);
  }

  const { doc, userDefinedAllocations } = await loadExport(companyId, documentId);
  const file = await readFile(doc, mapping.sheet);
  const { activity, transactions } = buildConfirmedImport(file, { ...mapping, sheet: file.sheet }, accounts, { fromMonth, toMonth });
  if (transactions.length === 0) throw new BankStatementsAccessError('No transactions match these columns, accounts, and months.', 400);

  const importMapping: ExportImportMapping = {
    ...mapping,
    sheet: file.sheet,
    headerSignature: headerSignature(file, mapping),
    accounts,
    fromMonth,
    toMonth,
  };
  const single = new Set(accounts.map((a) => a.last4)).size === 1 ? accounts[0] : null;
  const banks = new Set(accounts.map((a) => a.bankName));
  await prisma.$transaction(async (tx) => {
    for (const u of accountUpdates) {
      await tx.cashProofBankAccount.update({ where: { id: u.id }, data: { bankName: u.bankName, accountLast4: u.accountLast4 } });
    }
    await tx.bankTransaction.deleteMany({ where: { dataRoomDocumentId: documentId } });
    for (let i = 0; i < transactions.length; i += TRANSACTION_BATCH) {
      await tx.bankTransaction.createMany({
        data: transactions.slice(i, i + TRANSACTION_BATCH).map((t) => ({
          ...t,
          companyId,
          dataRoomDocumentId: documentId,
          source: 'UPLOAD_EXPORT',
          location: t.location ? (t.location as Prisma.InputJsonValue) : undefined,
        })),
        skipDuplicates: true,
      });
    }
    await tx.dataRoomDocument.update({
      where: { id: documentId },
      data: {
        reviewStatus: 'ACCEPTED',
        reviewNote: null,
        reviewedAt: new Date(),
        reviewedByUserId: ctx.userId,
        importMapping: importMapping as unknown as Prisma.InputJsonValue,
        bankActivity: activity as unknown as Prisma.InputJsonValue,
        statementAccountLast4: single?.last4 ?? null,
        statementInstitution: banks.size === 1 ? accounts[0].bankName : null,
        statementMonth: null,
      },
    });
  }, { timeout: 60_000 });
  await recordReview(companyId, userDefinedAllocations, ctx, documentId, {
    result: 'accepted',
    transactions: transactions.length,
    accountMonths: activity.length,
    accounts: accounts.map((a) => `${a.bankName} x${a.last4}`),
  });

  // The accepted file is a bank source for the Cash Proof: fill its months and match its transactions now.
  let readStatements = false;
  if (engagement && engagement.status !== 'LOCKED') {
    await scanBankStatements(companyId, engagement.id, ctx.userId);
    await runTransactionMatch(companyId, engagement.id);
    readStatements = true;
  }
  return { transactions: transactions.length, accountMonths: activity.length, readStatements };
}

export async function rejectStatementExport(params: { companyId: string; documentId: string; note: string; ctx: ReviewContext }) {
  const note = params.note.trim();
  if (!note) throw new BankStatementsAccessError('Tell the client what to upload instead.', 400);
  const { userDefinedAllocations } = await loadExport(params.companyId, params.documentId);
  await prisma.$transaction([
    prisma.bankTransaction.deleteMany({ where: { dataRoomDocumentId: params.documentId } }),
    prisma.dataRoomDocument.update({
      where: { id: params.documentId },
      data: {
        reviewStatus: 'REJECTED',
        reviewNote: note.slice(0, 1000),
        reviewedAt: new Date(),
        reviewedByUserId: params.ctx.userId,
        bankActivity: Prisma.DbNull,
        statementAccountLast4: null,
      },
    }),
  ]);
  await recordReview(params.companyId, userDefinedAllocations, params.ctx, params.documentId, { result: 'rejected', note });
}
