import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { sanitizeTextForPostgres } from '@/lib/company-documents/extract-text';
import { DATAROOM_ALLOWED_CONTENT_TYPES } from '@/lib/dataroom/constants';
import { validateDataRoomFilePolicy } from '@/lib/dataroom/file-policy';
import { ensureCompanyWithinDataRoomQuota } from '@/lib/dataroom/quota';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';

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

        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { userDefinedAllocations: true },
        });
        const capabilities = await resolveDataRoomCapabilities({
          userId: context.userId,
          role: context.role,
          companyId,
          userDefinedAllocations: company?.userDefinedAllocations,
        });
        if (!capabilities.upload && !capabilities.manage) {
          throw new Error('Forbidden: Data Room upload access required');
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
        try {
          const p = tokenPayload ? JSON.parse(tokenPayload) : {};
          const companyId = String(p?.companyId || '').trim();
          const category = asCategory(p?.category);
          const originalFileName = sanitizeTextForPostgres(p?.originalFileName || '').trim();
          const uploadedByUserId = String(p?.uploadedByUserId || '').trim();

          if (!companyId || !category || !originalFileName || !uploadedByUserId) {
            return;
          }

          await prisma.dataRoomDocument.upsert({
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
          });
        } catch (e) {
          console.warn('Data Room onUploadCompleted failed (ignored):', e);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Data Room upload failed' }, { status: 400 });
  }
}
