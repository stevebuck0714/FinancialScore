import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { del } from '@vercel/blob';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { DATAROOM_DEFAULT_FOLDERS } from '@/lib/dataroom/constants';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';
import { sanitizeTextForPostgres } from '@/lib/company-documents/extract-text';
import { validateDataRoomFilePolicy } from '@/lib/dataroom/file-policy';
import { ensureCompanyWithinDataRoomQuota } from '@/lib/dataroom/quota';

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

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    let documentId = String(body?.documentId || '').trim();
    const folderId = String(body?.folderId || '').trim();
    const category = asCategory(body?.category || 'OTHER');
    const originalFileName = sanitizeTextForPostgres(body?.originalFileName || '').trim();
    const blob = body?.blob || {};
    const blobUrl = sanitizeTextForPostgres(blob?.url || '').trim();
    const blobPathname = blob?.pathname ? sanitizeTextForPostgres(blob.pathname).trim() : null;
    const contentType = blob?.contentType ? sanitizeTextForPostgres(blob.contentType).trim() : null;
    const sizeBytes = typeof blob?.size === 'number' ? Math.trunc(blob.size) : null;

    if (!companyId || !folderId) {
      return NextResponse.json({ error: 'companyId and folderId are required' }, { status: 400 });
    }
    if (!documentId && (!category || !originalFileName || !blobUrl)) {
      return NextResponse.json({ error: 'category, originalFileName, and blob are required for new Data Room documents' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const capabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
      folderId,
      documentId: documentId || null,
    });
    if (!capabilities.upload && !capabilities.manage) {
      return NextResponse.json({ error: 'Forbidden: upload access required' }, { status: 403 });
    }

    const state = getDataRoomState(company.userDefinedAllocations);
    const validFolderIds = new Set((state.folders || DATAROOM_DEFAULT_FOLDERS).map((f: any) => String(f.id)));
    if (!validFolderIds.has(folderId)) {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }

    if (!documentId) {
      const policy = validateDataRoomFilePolicy({
        fileName: originalFileName,
        contentType,
        sizeBytes,
      });
      if (!policy.valid) {
        return NextResponse.json({ error: policy.error }, { status: 400 });
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

      const doc = await prisma.dataRoomDocument.upsert({
        where: { blobUrl },
        create: {
          companyId,
          uploadedByUserId: context.userId,
          category: category || 'OTHER',
          originalFileName,
          blobUrl,
          blobPathname,
          contentType,
          sizeBytes,
          extractionStatus: 'PENDING',
        },
        update: {
          companyId,
          category: category || 'OTHER',
          originalFileName,
          blobPathname,
          contentType,
          sizeBytes,
        },
        select: { id: true },
      });
      documentId = doc.id;
    } else {
      const doc = await prisma.dataRoomDocument.findUnique({
        where: { id: documentId },
        select: { id: true, companyId: true },
      });
      if (!doc || doc.companyId !== companyId) {
        return NextResponse.json({ error: 'Data Room document not found for this company' }, { status: 404 });
      }
    }

    const nowIso = new Date().toISOString();
    const currentIndex = Array.isArray(state.documentIndex) ? state.documentIndex : [];
    const filtered = currentIndex.filter((d: any) => String(d?.documentId || '') !== documentId);
    filtered.push({
      documentId,
      folderId,
      scanStatus: 'pending_scan',
      scanReason: null,
      scanQueuedAt: nowIso,
      scanAttempts: 0,
      nextScanAt: nowIso,
      watermarkOnDownload: true,
      updatedAt: nowIso,
    });

    const updatedUDA = appendDataRoomAuditEvents(
      upsertDataRoomState(company.userDefinedAllocations, { documentIndex: filtered }),
      [
        await buildDataRoomAuditEvent({
          action: 'document_assigned',
          companyId,
          userId: context.userId,
          userEmail: context.email,
          folderId,
          documentId,
          details: { scanStatus: 'pending_scan' },
        }),
      ],
    );
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({ success: true, documentId });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to assign DataRoom document' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const documentId = String(body?.documentId || '').trim();
    const folderId = String(body?.folderId || '').trim();

    if (!companyId || !documentId || !folderId) {
      return NextResponse.json({ error: 'companyId, documentId, and folderId are required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const capabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
      folderId,
      documentId,
    });
    if (!capabilities.manage) {
      return NextResponse.json({ error: 'Forbidden: manage access required' }, { status: 403 });
    }

    const state = getDataRoomState(company.userDefinedAllocations);
    const validFolderIds = new Set((state.folders || DATAROOM_DEFAULT_FOLDERS).map((f: any) => String(f.id)));
    if (!validFolderIds.has(folderId)) {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }

    const currentIndex = Array.isArray(state.documentIndex) ? state.documentIndex : [];
    const nextIndex = currentIndex.map((d: any) =>
      String(d?.documentId || '') === documentId
        ? { ...d, folderId, updatedAt: new Date().toISOString() }
        : d,
    );

    const exists = nextIndex.some((d: any) => String(d?.documentId || '') === documentId);
    if (!exists) {
      return NextResponse.json({ error: 'Document is not currently indexed in DataRoom' }, { status: 404 });
    }

    const updatedUDA = appendDataRoomAuditEvents(
      upsertDataRoomState(company.userDefinedAllocations, { documentIndex: nextIndex }),
      [
        await buildDataRoomAuditEvent({
          action: 'document_moved',
          companyId,
          userId: context.userId,
          userEmail: context.email,
          folderId,
          documentId,
        }),
      ],
    );
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to move DataRoom document' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    const documentId = String(searchParams.get('documentId') || '').trim();

    if (!companyId || !documentId) {
      return NextResponse.json({ error: 'companyId and documentId are required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const capabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
      documentId,
    });
    if (!capabilities.manage) {
      return NextResponse.json({ error: 'Forbidden: manage access required' }, { status: 403 });
    }

    const doc = await prisma.dataRoomDocument.findUnique({
      where: { id: documentId },
      select: { id: true, companyId: true, blobUrl: true },
    });
    if (!doc || doc.companyId !== companyId) {
      return NextResponse.json({ error: 'Data Room document not found for this company' }, { status: 404 });
    }

    const state = getDataRoomState(company.userDefinedAllocations);
    const currentIndex = Array.isArray(state.documentIndex) ? state.documentIndex : [];
    const nextIndex = currentIndex.filter((d: any) => String(d?.documentId || '') !== documentId);

    if (nextIndex.length === currentIndex.length) {
      return NextResponse.json({ error: 'Document is not currently indexed in DataRoom' }, { status: 404 });
    }

    const updatedUDA = appendDataRoomAuditEvents(
      upsertDataRoomState(company.userDefinedAllocations, { documentIndex: nextIndex }),
      [
        await buildDataRoomAuditEvent({
          action: 'document_removed',
          companyId,
          userId: context.userId,
          userEmail: context.email,
          documentId,
        }),
      ],
    );
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    try {
      await del(doc.blobUrl);
    } catch (e) {
      console.warn('Data Room blob delete failed (ignored):', e);
    }
    await prisma.dataRoomDocument.delete({ where: { id: doc.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to remove DataRoom document index' }, { status: 500 });
  }
}

