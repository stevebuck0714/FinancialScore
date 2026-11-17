import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { upsertDataRoomState, getDataRoomState } from '@/lib/dataroom/state';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';
import { ensureCompanyWithinDataRoomQuota } from '@/lib/dataroom/quota';
import { privateBlobToken } from '@/lib/dataroom/blob-storage';
import type { BankStatementSource } from './providers';

export type FetchedStatement = {
  source: Exclude<BankStatementSource, 'UPLOAD'>;
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

const CONCURRENCY = 4;

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'statement';

/**
 * Saves statements pulled from a bank connector into the Data Room Bank Statements
 * folder. A statement already pulled for the same source, account, and month is skipped.
 */
export async function saveFetchedStatements(params: {
  companyId: string;
  userId: string;
  userEmail: string;
  statements: FetchedStatement[];
}): Promise<StatementImportResult> {
  const { companyId, userId, userEmail, statements } = params;
  const privateToken = privateBlobToken();
  const result: StatementImportResult = { imported: 0, skipped: 0, failed: 0, accounts: [], errors: [] };
  result.accounts = [...new Set(statements.map((s) => [s.accountName, s.accountLast4 ? `x${s.accountLast4}` : null].filter(Boolean).join(' ')))];

  const existing = await prisma.dataRoomDocument.findMany({
    where: { companyId, statementSource: { in: [...new Set(statements.map((s) => s.source))] } },
    select: { statementSource: true, statementAccountLast4: true, statementMonth: true, statementInstitution: true },
  });
  const seen = new Set(existing.map((d) => `${d.statementSource}|${d.statementInstitution}|${d.statementAccountLast4}|${d.statementMonth}`));

  const created: string[] = [];
  let next = 0;
  let quotaExceeded = false;
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
        if (quotaExceeded) {
          result.failed += 1;
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
          const blob = await put(`bank-statements/${companyId}/${safeName(fileName)}`, body, {
            access: privateToken ? 'private' : 'public',
            token: privateToken || undefined,
            contentType: 'application/pdf',
            addRandomSuffix: true,
          });
          const doc = await prisma.dataRoomDocument.create({
            data: {
              companyId,
              uploadedByUserId: userId,
              category: 'OTHER',
              originalFileName: fileName,
              blobUrl: blob.url,
              blobPathname: blob.pathname,
              contentType: 'application/pdf',
              sizeBytes: body.length,
              storageAccess: privateToken ? 'private' : 'public',
              statementSource: s.source,
              statementInstitution: s.institution,
              statementAccountLast4: s.accountLast4,
              statementMonth: s.month,
              statementRetrievedAt: new Date(),
              extractionStatus: 'PENDING',
            },
            select: { id: true },
          });
          created.push(doc.id);
          result.imported += 1;
        } catch (e) {
          result.failed += 1;
          result.errors.push(`${s.institution || s.source} ${s.accountLast4 || ''} ${s.month}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }),
  );

  if (created.length > 0) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
    const nowIso = new Date().toISOString();
    const index = getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>;
    const entries = created.map((documentId) => ({
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
        companyId,
        userId,
        userEmail,
        folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
        details: { source: statements[0]?.source, imported: created.length, skipped: result.skipped, failed: result.failed },
      }),
    ]);
    await prisma.company.update({ where: { id: companyId }, data: { userDefinedAllocations: updated } });
  }

  result.errors = result.errors.slice(0, 10);
  return result;
}
