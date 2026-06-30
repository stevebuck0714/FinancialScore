import prisma from '@/lib/prisma';
import { extractTextFromArrayBuffer, sanitizeTextForPostgres } from '@/lib/company-documents/extract-text';
import { indexCompanyDocument } from '@/lib/company-documents/index-document';

type ProcessPendingParams = {
  companyId?: string;
  documentId?: string;
  limit?: number;
};

type ProcessedDocument = {
  id: string;
  status: 'indexed' | 'extracted' | 'no_text' | 'failed';
  error?: string;
};

export async function processPendingCompanyDocuments(params: ProcessPendingParams = {}): Promise<{
  processed: ProcessedDocument[];
}> {
  const limit = Math.min(Math.max(Math.trunc(Number(params.limit || 3)), 1), 10);
  const where: any = {
    ...(params.documentId ? { id: params.documentId } : {}),
    ...(params.companyId ? { companyId: params.companyId } : {}),
    OR: [
      { extractionStatus: 'PENDING' },
      { extractionStatus: 'DONE', indexStatus: 'PENDING' },
    ],
  };

  const docs = await prisma.companyDocument.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      blobUrl: true,
      contentType: true,
      originalFileName: true,
      extractedText: true,
      extractionStatus: true,
      indexStatus: true,
    },
  });

  const processed: ProcessedDocument[] = [];

  for (const doc of docs) {
    let extractionStatus = String(doc.extractionStatus || '').toUpperCase();
    try {
      if (!doc.extractedText && extractionStatus !== 'DONE') {
        const res = await fetch(doc.blobUrl);
        if (!res.ok) throw new Error(`Failed to fetch blob for extraction (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        const extracted = await extractTextFromArrayBuffer({
          arrayBuffer,
          contentType: doc.contentType,
          fileName: doc.originalFileName,
        });

        if (extracted.status === 'DONE' || extracted.status === 'NO_TEXT') {
          extractionStatus = extracted.status;
          await prisma.companyDocument.update({
            where: { id: doc.id },
            data: {
              extractedText: extracted.text || null,
              extractionStatus: extracted.status,
              extractionError: null,
              indexStatus: extracted.status === 'DONE' ? 'PENDING' : 'FAILED',
              indexedAt: null,
              indexError: extracted.status === 'DONE' ? null : 'No text extracted to index',
            },
          });
          if (extracted.status === 'NO_TEXT') {
            processed.push({ id: doc.id, status: 'no_text' });
            continue;
          }
        } else {
          throw new Error(extracted.error || 'Extraction failed');
        }
      }

      if (extractionStatus === 'DONE') {
        const indexed = await indexCompanyDocument({ documentId: doc.id });
        if (!indexed.ok) throw new Error(indexed.error || 'Indexing failed');
        processed.push({ id: doc.id, status: 'indexed' });
      } else {
        processed.push({ id: doc.id, status: 'extracted' });
      }
    } catch (err: any) {
      const message = sanitizeTextForPostgres(err?.message || 'Document processing failed');
      const extractionDone = extractionStatus === 'DONE' || Boolean(doc.extractedText);
      await prisma.companyDocument.update({
        where: { id: doc.id },
        data: {
          extractionStatus: extractionDone ? 'DONE' : 'FAILED',
          extractionError: extractionDone ? null : message,
          indexStatus: 'FAILED',
          indexedAt: null,
          indexError: message,
        },
      });
      processed.push({ id: doc.id, status: 'failed', error: message });
    }
  }

  return { processed };
}
