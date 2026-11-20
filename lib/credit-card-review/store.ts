import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { privateBlobToken } from '@/lib/dataroom/blob-storage';
import { DATAROOM_CREDIT_CARD_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';
import { ensureCompanyWithinDataRoomQuota } from '@/lib/dataroom/quota';
import type { CreditCardTransactionInput } from '@/lib/bank-statements/bank-activity';

type ImportContext = { companyId: string; userId: string; userEmail: string };

const safeFilePart = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'plaid';
const csvField = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function activityCsv(institution: string | null, transactions: CreditCardTransactionInput[]) {
  const header = ['Institution', 'Card', 'Last 4', 'Posted Date', 'Transaction Date', 'Amount', 'Currency', 'Merchant', 'Description', 'Plaid Category', 'Detailed Category'];
  const rows = transactions.map((transaction) => [
    institution || '',
    transaction.accountName || '',
    transaction.accountLast4 || '',
    transaction.date,
    transaction.dateTransacted || '',
    transaction.amount,
    transaction.currency || '',
    transaction.merchantName || '',
    transaction.description || '',
    transaction.category.join(' > '),
    transaction.creditCategoryDetailed || transaction.creditCategoryPrimary || '',
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}

/**
 * Persists a transient Plaid credit-card pull as a private Data Room CSV plus
 * structured review records. The CSV is system-generated and therefore enters
 * the Data Room as clean; borrower-provided monthly PDFs remain separately scanned.
 */
export async function savePlaidCreditCardImport(
  params: ImportContext & {
    institution: string | null;
    accounts: string[];
    transactions: CreditCardTransactionInput[];
    coverageStart: string | null;
    coverageEnd: string | null;
  },
) {
  const csv = Buffer.from(activityCsv(params.institution, params.transactions), 'utf8');
  const quota = await ensureCompanyWithinDataRoomQuota({ companyId: params.companyId, incomingSizeBytes: csv.length });
  if (!quota.ok) throw new Error('Data Room storage quota reached; credit-card activity was not saved.');

  const privateToken = privateBlobToken();
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${safeFilePart(params.institution || 'Plaid')} Credit Card Transactions ${stamp}.csv`;
  const blob = await put(`credit-card-statements/${params.companyId}/${safeFilePart(fileName)}`, csv, {
    access: privateToken ? 'private' : 'public',
    token: privateToken || undefined,
    contentType: 'text/csv',
    addRandomSuffix: true,
  });

  const document = await prisma.dataRoomDocument.create({
    data: {
      companyId: params.companyId,
      uploadedByUserId: params.userId,
      category: 'OTHER',
      originalFileName: fileName,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      contentType: 'text/csv',
      sizeBytes: csv.length,
      storageAccess: privateToken ? 'private' : 'public',
      statementSource: 'PLAID_CREDIT_CARD',
      statementInstitution: params.institution,
      statementRetrievedAt: new Date(),
      extractionStatus: 'DONE',
    },
    select: { id: true },
  });

  const imported = await prisma.$transaction(async (tx) => {
    const creditCardImport = await tx.creditCardImport.create({
      data: {
        companyId: params.companyId,
        importedByUserId: params.userId,
        dataRoomDocumentId: document.id,
        institution: params.institution,
        requestedDays: 730,
        coverageStart: params.coverageStart,
        coverageEnd: params.coverageEnd,
        accountCount: params.accounts.length,
        transactionCount: params.transactions.length,
      },
    });
    const batchSize = 1000;
    for (let index = 0; index < params.transactions.length; index += batchSize) {
      await tx.creditCardTransaction.createMany({
        data: params.transactions.slice(index, index + batchSize).map((transaction) => ({
          creditCardImportId: creditCardImport.id,
          companyId: params.companyId,
          externalId: transaction.externalId,
          accountLast4: transaction.accountLast4,
          accountName: transaction.accountName,
          date: transaction.date,
          dateTransacted: transaction.dateTransacted,
          amount: transaction.amount,
          currency: transaction.currency,
          description: transaction.description,
          merchantName: transaction.merchantName,
          category: transaction.category,
          categoryId: transaction.categoryId,
          creditCategoryPrimary: transaction.creditCategoryPrimary,
          creditCategoryDetailed: transaction.creditCategoryDetailed,
        })),
      });
    }
    return creditCardImport;
  });

  const company = await prisma.company.findUnique({ where: { id: params.companyId }, select: { userDefinedAllocations: true } });
  const currentIndex = getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  const next = appendDataRoomAuditEvents(
    upsertDataRoomState(company?.userDefinedAllocations, {
      documentIndex: [
        ...currentIndex,
        {
          documentId: document.id,
          folderId: DATAROOM_CREDIT_CARD_STATEMENTS_FOLDER_ID,
          scanStatus: 'clean',
          scanReason: 'System-generated from Plaid Asset Report',
          scanQueuedAt: null,
          scanAttempts: 0,
          nextScanAt: null,
          watermarkOnDownload: true,
          updatedAt: now,
        },
      ],
    }),
    [
      await buildDataRoomAuditEvent({
        action: 'credit_card_activity_imported',
        companyId: params.companyId,
        userId: params.userId,
        userEmail: params.userEmail,
        folderId: DATAROOM_CREDIT_CARD_STATEMENTS_FOLDER_ID,
        documentId: document.id,
        details: {
          source: 'PLAID_ASSETS',
          institution: params.institution,
          accounts: params.accounts,
          transactions: params.transactions.length,
          coverageStart: params.coverageStart,
          coverageEnd: params.coverageEnd,
          plaidItemRemoved: true,
        },
      }),
    ],
  );
  await prisma.company.update({ where: { id: params.companyId }, data: { userDefinedAllocations: next } });

  return { id: imported.id, documentId: document.id, fileName, transactionCount: params.transactions.length };
}
