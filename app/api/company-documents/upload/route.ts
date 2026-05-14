import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { sanitizeTextForPostgres } from '@/lib/company-documents/extract-text';
import { DATAROOM_ALLOWED_CONTENT_TYPES } from '@/lib/dataroom/constants';
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

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Keep message explicit; this is the #1 misconfig in local dev.
      return NextResponse.json(
        { error: 'BLOB_READ_WRITE_TOKEN is not set (required for Vercel Blob uploads)' },
        { status: 500 },
      );
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const context = await requireAuth();

        console.log('📄 Blob upload token request', {
          hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
          clientPayloadType: typeof clientPayload,
        });

        const payload =
          typeof clientPayload === 'string'
            ? (() => {
                try {
                  return JSON.parse(clientPayload);
                } catch {
                  return {};
                }
              })()
            : ((clientPayload || {}) as any);
        const companyId = String(payload.companyId || '').trim();
        const category = asCategory(payload.category);
        const originalFileName = String(payload.originalFileName || '').trim();
        const sizeBytes = typeof payload.sizeBytes === 'number' ? Math.trunc(payload.sizeBytes) : null;

        if (!companyId || !category || !originalFileName) {
          console.warn('❌ Missing upload payload', { companyId, category, originalFileName });
          throw new Error('Missing upload payload (companyId/category/originalFileName)');
        }

        const filePolicy = validateDataRoomFilePolicy({
          fileName: originalFileName,
          sizeBytes,
        });
        if (!filePolicy.valid) {
          throw new Error(filePolicy.error);
        }
        if (!Number.isFinite(Number(sizeBytes)) || Number(sizeBytes) <= 0) {
          throw new Error('File size is required for upload.');
        }

        const hasAccess = await validateCompanyAccess(companyId);
        if (!hasAccess) {
          throw new Error('Forbidden');
        }

        const quota = await ensureCompanyWithinDataRoomQuota({
          companyId,
          incomingSizeBytes: Number(sizeBytes),
        });
        if (!quota.ok) {
          throw new Error(
            `Storage quota exceeded. Quota: ${Math.round(quota.quotaBytes / (1024 * 1024))} MB, projected usage: ${Math.round(
              quota.projectedUsedBytes / (1024 * 1024),
            )} MB.`,
          );
        }

        return {
          allowedContentTypes: [...DATAROOM_ALLOWED_CONTENT_TYPES],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            companyId,
            category,
            originalFileName,
            uploadedByUserId: context.userId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // NOTE: Vercel calls this after upload completes. It won't fire on localhost
        // unless you use ngrok and set VERCEL_BLOB_CALLBACK_URL.
        try {
          const p = tokenPayload ? JSON.parse(tokenPayload) : {};
          const companyId = String(p?.companyId || '').trim();
          const category = asCategory(p?.category);
          const originalFileName = sanitizeTextForPostgres(p?.originalFileName || '').trim();
          const uploadedByUserId = String(p?.uploadedByUserId || '').trim();

          if (!companyId || !category || !originalFileName || !uploadedByUserId) {
            return;
          }

          // Upsert in case the client also registers explicitly (local dev).
          const doc = await prisma.companyDocument.upsert({
            where: { blobUrl: blob.url },
            create: {
              companyId,
              uploadedByUserId,
              category,
              originalFileName,
              blobUrl: blob.url,
              blobPathname: blob.pathname,
              contentType: blob.contentType || null,
              sizeBytes: typeof (blob as any).size === 'number' ? Math.trunc((blob as any).size) : null,
              extractionStatus: 'PENDING',
            },
            update: {
              companyId,
              category,
              originalFileName,
              blobPathname: blob.pathname,
              contentType: blob.contentType || null,
              sizeBytes: typeof (blob as any).size === 'number' ? Math.trunc((blob as any).size) : null,
            },
            select: { id: true },
          });

          // Heavy extraction and embedding indexing run through
          // /api/company-documents/process-pending so upload callbacks stay fast.
          await prisma.companyDocument.update({
            where: { id: doc.id },
            data: { extractionStatus: 'PENDING', extractionError: null, indexStatus: 'PENDING', indexedAt: null, indexError: null },
          });
        } catch (e) {
          console.warn('onUploadCompleted failed (ignored):', e);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error('❌ /api/company-documents/upload failed:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 400 });
  }
}

