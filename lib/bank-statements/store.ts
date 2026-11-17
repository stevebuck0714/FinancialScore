import { put } from '@vercel/blob';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { upsertDataRoomState, getDataRoomState } from '@/lib/dataroom/state';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';
import { ensureCompanyWithinDataRoomQuota } from '@/lib/dataroom/quota';
import { privateBlobToken } from '@/lib/dataroom/blob-storage';
import { formatEstDate } from '@/lib/time/eastern';
import type { BankActivityMonth, BankStatementSource } from './providers';

export type FetchedStatement = {
  source: Exclude<BankStatementSource, 'UPLOAD' | 'PLAID_ASSETS'>;
  institution: string | null;
  accountLast4: string | null;
  accountName: string | null;
  month: string; // YYYY-MM
  download: () => Promise<ArrayBuffer>;
};

export type StatementImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  accounts: string[];
  errors: string[];
};

export type BankDataReportResult = { saved: boolean; accounts: string[]; months: number; error: string | null };

type ImportContext = { companyId: string; userId: string; userEmail: string };

const CONCURRENCY = 2;

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'statement';

/** Stores a PDF in the statements Blob store and creates its Data Room document row. */
async function storeStatementPdf(
  ctx: ImportContext,
  fileName: string,
  body: Buffer,
  data: Pick<
    Prisma.DataRoomDocumentUncheckedCreateInput,
    'statementSource' | 'statementInstitution' | 'statementAccountLast4' | 'statementMonth' | 'bankActivity'
  >,
): Promise<string> {
  const privateToken = privateBlobToken();
  const blob = await put(`bank-statements/${ctx.companyId}/${safeName(fileName)}`, body, {
    access: privateToken ? 'private' : 'public',
    token: privateToken || undefined,
    contentType: 'application/pdf',
    addRandomSuffix: true,
  });
  const doc = await prisma.dataRoomDocument.create({
    data: {
      companyId: ctx.companyId,
      uploadedByUserId: ctx.userId,
      category: 'OTHER',
      originalFileName: fileName,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      contentType: 'application/pdf',
      sizeBytes: body.length,
      storageAccess: privateToken ? 'private' : 'public',
      statementRetrievedAt: new Date(),
      extractionStatus: 'PENDING',
      ...data,
    },
    select: { id: true },
  });
  return doc.id;
}

/** Files new documents into the Bank Statements folder (queued for the virus scan) and logs the import. */
async function fileInBankStatementsFolder(ctx: ImportContext, documentIds: string[], details: Record<string, unknown>) {
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { userDefinedAllocations: true } });
  const nowIso = new Date().toISOString();
  const index = getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>;
  const entries = documentIds.map((documentId) => ({
    documentId,
    folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
    scanStatus: 'pending_scan',
    scanReason: null,
    scanQueuedAt: nowIso,
    scanAttempts: 0,
    nextScanAt: nowIso,
    watermarkOnDownload: true,
    updatedAt: nowIso,
  }));
  const updated = appendDataRoomAuditEvents(upsertDataRoomState(company?.userDefinedAllocations, { documentIndex: [...index, ...entries] }), [
    await buildDataRoomAuditEvent({
      action: 'statements_imported',
      companyId: ctx.companyId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
      details,
    }),
  ]);
  await prisma.company.update({ where: { id: ctx.companyId }, data: { userDefinedAllocations: updated } });
}

/**
 * Saves statements pulled from a bank connector into the Data Room Bank Statements
 * folder. A statement already pulled for the same source, account, and month is skipped.
 */
export async function saveFetchedStatements(
  params: ImportContext & {
    statements: FetchedStatement[];
    /** Epoch ms after which no new downloads start, so the caller can still remove the bank connection. */
    deadline?: number;
  },
): Promise<StatementImportResult> {
  const { companyId, statements, deadline } = params;
  const result: StatementImportResult = { imported: 0, skipped: 0, failed: 0, accounts: [], errors: [] };
  result.accounts = [...new Set(statements.map((s) => [s.accountName, s.accountLast4 ? `x${s.accountLast4}` : null].filter(Boolean).join(' ')))];
  if (statements.length === 0) return result;

  const existing = await prisma.dataRoomDocument.findMany({
    where: { companyId, statementSource: { in: [...new Set(statements.map((s) => s.source))] } },
    select: { statementSource: true, statementAccountLast4: true, statementMonth: true, statementInstitution: true },
  });
  const seen = new Set(existing.map((d) => `${d.statementSource}|${d.statementInstitution}|${d.statementAccountLast4}|${d.statementMonth}`));

  const created: string[] = [];
  let next = 0;
  let quotaExceeded = false;
  let timedOut = false;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, statements.length) }, async () => {
      while (next < statements.length) {
        const s = statements[next++];
        const key = `${s.source}|${s.institution}|${s.accountLast4}|${s.month}`;
        if (seen.has(key)) {
          result.skipped += 1;
          continue;
        }
        seen.add(key);
        if (quotaExceeded || timedOut) {
          result.failed += 1;
          continue;
        }
        if (deadline && Date.now() > deadline) {
          timedOut = true;
          result.failed += 1;
          result.errors.unshift('Time limit reached. Connect the bank again to pull the remaining statements; ones already saved are skipped.');
          continue;
        }
        try {
          const body = Buffer.from(await s.download());
          const quota = await ensureCompanyWithinDataRoomQuota({ companyId, incomingSizeBytes: body.length });
          if (!quota.ok) {
            quotaExceeded = true;
            result.failed += 1;
            result.errors.push('Data Room storage quota reached; remaining statements were not saved.');
            continue;
          }
          const fileName = `${safeName(s.institution || s.source)} ${s.accountLast4 ? `x${s.accountLast4} ` : ''}${s.month}.pdf`;
          created.push(
            await storeStatementPdf(params, fileName, body, {
              statementSource: s.source,
              statementInstitution: s.institution,
              statementAccountLast4: s.accountLast4,
              statementMonth: s.month,
            }),
          );
          result.imported += 1;
        } catch (e) {
          result.failed += 1;
          result.errors.push(`${s.institution || s.source} ${s.accountLast4 || ''} ${s.month}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }),
  );

  if (created.length > 0) {
    await fileInBankStatementsFolder(params, created, {
      source: statements[0]?.source,
      imported: created.length,
      skipped: result.skipped,
      failed: result.failed,
    });
  }

  result.errors = result.errors.slice(0, 10);
  return result;
}

/** Saves a Plaid asset report PDF and its monthly figures into the Bank Statements folder. */
export async function saveBankDataReport(
  params: ImportContext & { institution: string | null; pdf: ArrayBuffer; activity: BankActivityMonth[]; accounts: string[] },
): Promise<BankDataReportResult> {
  const { companyId, institution, pdf, activity, accounts } = params;
  const body = Buffer.from(pdf);
  const quota = await ensureCompanyWithinDataRoomQuota({ companyId, incomingSizeBytes: body.length });
  if (!quota.ok) return { saved: false, accounts, months: 0, error: 'Data Room storage quota reached; the bank data report was not saved.' };
  const fileName = `${safeName(institution || 'Bank')} Bank Data Report ${formatEstDate()}.pdf`;
  const documentId = await storeStatementPdf(params, fileName, body, {
    statementSource: 'PLAID_ASSETS',
    statementInstitution: institution,
    bankActivity: activity as unknown as Prisma.InputJsonValue,
  });
  await fileInBankStatementsFolder(params, [documentId], { source: 'PLAID_ASSETS', imported: 1, accountMonths: activity.length });
  return { saved: true, accounts, months: activity.length, error: null };
}
