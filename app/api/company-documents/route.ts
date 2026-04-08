import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { extractTextFromArrayBuffer, sanitizeTextForPostgres } from '@/lib/company-documents/extract-text';
import { indexCompanyDocument } from '@/lib/company-documents/index-document';
import { validateDataRoomFilePolicy } from '@/lib/dataroom/file-policy';
import { ensureCompanyWithinDataRoomQuota } from '@/lib/dataroom/quota';

export const dynamic = 'force-dynamic';

const CATEGORY_VALUES = new Set([
  'LOAN_DOCUMENTS',
  'FINANCING_DOCUMENTS',
  'LEGAL_AND_REGULATORY',
  'TAX_DOCUMENTS',
  'OTHER',
]);

function asCategory(value: unknown): 'LOAN_DOCUMENTS' | 'FINANCING_DOCUMENTS' | 'LEGAL_AND_REGULATORY' | 'TAX_DOCUMENTS' | 'OTHER' | null {
  const s = String(value || '').trim().toUpperCase();
  return CATEGORY_VALUES.has(s) ? (s as any) : null;
}

function isMissingCompanyDocumentsTableError(e: any) {
  const code = String(e?.code || '').trim();
  const msg = String(e?.message || '');
  // Prisma uses P2021 for missing table in many cases; message varies by provider.
  if (code === 'P2021') return true;
  return msg.includes('CompanyDocument') && msg.toLowerCase().includes('does not exist');
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const companyId = String(searchParams.get('companyId') || '').trim();

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const documents = await prisma.companyDocument.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyId: true,
        category: true,
        originalFileName: true,
        blobUrl: true,
        blobPathname: true,
        contentType: true,
        sizeBytes: true,
        extractionStatus: true,
        extractionError: true,
        indexStatus: true,
        indexedAt: true,
        indexError: true,
        createdAt: true,
        uploadedByUserId: true,
      },
    });

    return NextResponse.json({ documents });
  } catch (e: any) {
    if (isMissingCompanyDocumentsTableError(e)) {
      // Deployed code may reach a DB that hasn't had the manual migration applied yet.
      // Return a non-500 response so the UI can show a friendly setup message.
      return NextResponse.json(
        {
          documents: [],
          migrationRequired: true,
          missing: ['CompanyDocument', 'CompanyDocumentChunk'],
          message:
            'Company documents are not available because the database migration has not been applied yet.',
          manualMigrations: [
            'prisma/manual_migrations/20260216_add_company_documents.sql',
            'prisma/manual_migrations/20260216_add_company_document_chunks_pgvector.sql',
          ],
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: e?.message || 'Failed to list documents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await req.json();

    const companyId = String(body?.companyId || '').trim();
    const category = asCategory(body?.category);
    const originalFileName = sanitizeTextForPostgres(body?.originalFileName || '').trim();
    const blob = body?.blob || {};

    const blobUrl = sanitizeTextForPostgres(blob?.url || '').trim();
    const blobPathname = blob?.pathname ? sanitizeTextForPostgres(blob.pathname).trim() : null;
    const contentType = blob?.contentType ? sanitizeTextForPostgres(blob.contentType).trim() : null;
    const sizeBytes = typeof blob?.size === 'number' ? Math.trunc(blob.size) : null;

    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 });
    if (!originalFileName) return NextResponse.json({ error: 'originalFileName is required' }, { status: 400 });
    if (!blobUrl) return NextResponse.json({ error: 'blob.url is required' }, { status: 400 });

    const policy = validateDataRoomFilePolicy({
      fileName: originalFileName,
      contentType,
      sizeBytes,
    });
    if (!policy.valid) {
      return NextResponse.json({ error: policy.error }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const quota = await ensureCompanyWithinDataRoomQuota({
      companyId,
      incomingSizeBytes: Number(sizeBytes || 0),
      incomingBlobUrl: blobUrl,
    });
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: `Storage quota exceeded. Quota: ${Math.round(quota.quotaBytes / (1024 * 1024))} MB, projected usage: ${Math.round(
            quota.projectedUsedBytes / (1024 * 1024),
          )} MB.`,
        },
        { status: 400 },
      );
    }

    const doc = await prisma.companyDocument.upsert({
      where: { blobUrl },
      create: {
        companyId,
        uploadedByUserId: context.userId,
        category,
        originalFileName,
        blobUrl,
        blobPathname,
        contentType,
        sizeBytes,
        extractionStatus: 'PENDING',
      },
      update: {
        category,
        originalFileName,
        blobPathname,
        contentType,
        sizeBytes,
      },
      select: {
        id: true,
        companyId: true,
        category: true,
        originalFileName: true,
        blobUrl: true,
        blobPathname: true,
        contentType: true,
        sizeBytes: true,
        extractionStatus: true,
        extractionError: true,
        createdAt: true,
      },
    });

    // Extract text immediately (MVP). If this becomes slow, move to background later.
    const existing = await prisma.companyDocument.findUnique({
      where: { id: doc.id },
      select: { extractedText: true, extractionStatus: true },
    });

    if (!existing?.extractedText && existing?.extractionStatus !== 'DONE') {
      try {
        const res = await fetch(blobUrl);
        if (!res.ok) throw new Error(`Failed to fetch blob for extraction (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        const extracted = await extractTextFromArrayBuffer({
          arrayBuffer,
          contentType,
          fileName: originalFileName,
        });

        if (extracted.status === 'DONE' || extracted.status === 'NO_TEXT') {
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
        } else {
          await prisma.companyDocument.update({
            where: { id: doc.id },
            data: {
              extractedText: null,
              extractionStatus: 'FAILED',
              extractionError: sanitizeTextForPostgres(extracted.error),
              indexStatus: 'FAILED',
              indexedAt: null,
              indexError: sanitizeTextForPostgres(extracted.error || 'Extraction failed (not indexed)'),
            },
          });
        }

        // Index embeddings/chunks for robust document search (best-effort).
        if (extracted.status === 'DONE') {
          await indexCompanyDocument({ documentId: doc.id });
        }
      } catch (err: any) {
        await prisma.companyDocument.update({
          where: { id: doc.id },
          data: {
            extractedText: null,
            extractionStatus: 'FAILED',
            extractionError: sanitizeTextForPostgres(err?.message || 'Extraction failed'),
            indexStatus: 'FAILED',
            indexedAt: null,
            indexError: sanitizeTextForPostgres(err?.message || 'Extraction failed (not indexed)'),
          },
        });
      }
    }

    const refreshed = await prisma.companyDocument.findUnique({
      where: { id: doc.id },
      select: {
        id: true,
        companyId: true,
        category: true,
        originalFileName: true,
        blobUrl: true,
        contentType: true,
        sizeBytes: true,
        extractionStatus: true,
        extractionError: true,
        indexStatus: true,
        indexedAt: true,
        indexError: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ document: refreshed });
  } catch (e: any) {
    if (isMissingCompanyDocumentsTableError(e)) {
      return NextResponse.json(
        {
          error:
            'Company documents are not available because the database migration has not been applied yet.',
          migrationRequired: true,
          manualMigrations: [
            'prisma/manual_migrations/20260216_add_company_documents.sql',
            'prisma/manual_migrations/20260216_add_company_document_chunks_pgvector.sql',
          ],
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: e?.message || 'Failed to register document' }, { status: 500 });
  }
}

