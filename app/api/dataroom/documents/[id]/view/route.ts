import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  applyDocumentPolicyOverrides,
  isCompanyAdminForDataRoom,
  resolveDataRoomCapabilities,
} from '@/lib/dataroom/access';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';

export const dynamic = 'force-dynamic';
const OFFICE_WEB_VIEWER_MAX_BYTES = 25 * 1024 * 1024;

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

async function resolveDocumentSizeBytes(blobUrl: string, knownSizeBytes: number | null): Promise<number | null> {
  if (typeof knownSizeBytes === 'number' && Number.isFinite(knownSizeBytes) && knownSizeBytes >= 0) {
    return knownSizeBytes;
  }
  try {
    const res = await fetch(blobUrl, { method: 'HEAD' });
    if (!res.ok) return null;
    const raw = res.headers.get('content-length');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function isPreviewableDocument(contentType: string | null, fileName: string) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  if (ct === 'application/pdf') return true;
  if (ct.startsWith('text/')) return true;
  const lowerName = String(fileName || '').toLowerCase();
  return lowerName.endsWith('.pdf') || lowerName.endsWith('.txt') || lowerName.endsWith('.csv');
}

function isOfficePreviewable(contentType: string | null, fileName: string) {
  const ct = String(contentType || '').toLowerCase();
  const officeTypes = new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);
  if (officeTypes.has(ct)) return true;
  const lowerName = String(fileName || '').toLowerCase();
  return (
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.ppt') ||
    lowerName.endsWith('.pptx')
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth();
    const { id } = await ctx.params;

    const doc = await prisma.dataRoomDocument.findUnique({
      where: { id },
      select: { blobUrl: true, companyId: true, contentType: true, originalFileName: true, sizeBytes: true },
    });
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const hasAccess = await validateCompanyAccess(doc.companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: doc.companyId },
      select: { userDefinedAllocations: true },
    });
    const root = asObject(company?.userDefinedAllocations);
    const dataRoom = asObject(root.dataRoom);
    const dataRoomIndex = Array.isArray(dataRoom.documentIndex) ? dataRoom.documentIndex : [];
    const entry = dataRoomIndex.find((d: any) => String(d?.documentId || '') === String(id));
    if (!entry) {
      return NextResponse.json({ error: 'Data Room document is not indexed' }, { status: 404 });
    }

    const isCompanyAdmin =
      context.role === 'SITEADMIN' ||
      context.role === 'CONSULTANT' ||
      (await isCompanyAdminForDataRoom(context.userId, doc.companyId));
    const baseCaps = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId: doc.companyId,
      userDefinedAllocations: company?.userDefinedAllocations,
      folderId: entry?.folderId ? String(entry.folderId) : null,
      documentId: id,
      isCompanyAdmin,
    });
    const caps = applyDocumentPolicyOverrides(baseCaps, entry);
    if (!caps.view) {
      const nextUDA = appendDataRoomAuditEvents(company?.userDefinedAllocations, [
        await buildDataRoomAuditEvent({
          action: 'document_view_blocked',
          companyId: doc.companyId,
          userId: context.userId,
          userEmail: context.email,
          documentId: id,
          folderId: entry?.folderId ? String(entry.folderId) : null,
          details: { reason: 'view_not_allowed' },
        }),
      ]);
      await prisma.company.update({
        where: { id: doc.companyId },
        data: { userDefinedAllocations: nextUDA as any },
      });
      return NextResponse.json({ error: 'View is not allowed for this document.' }, { status: 403 });
    }

    const scanStatus = String(entry?.scanStatus || '');
    if (scanStatus !== 'clean') {
      const nextUDA = appendDataRoomAuditEvents(company?.userDefinedAllocations, [
        await buildDataRoomAuditEvent({
          action: 'document_view_blocked',
          companyId: doc.companyId,
          userId: context.userId,
          userEmail: context.email,
          documentId: id,
          folderId: entry?.folderId ? String(entry.folderId) : null,
          details: { reason: 'scan_not_clean', scanStatus: scanStatus || 'pending_scan' },
        }),
      ]);
      await prisma.company.update({
        where: { id: doc.companyId },
        data: { userDefinedAllocations: nextUDA as any },
      });
      return NextResponse.json(
        { error: `Document is quarantined until malware scan is clean (current status: ${scanStatus || 'pending_scan'}).` },
        { status: 423 },
      );
    }

    const canInlinePreview = isPreviewableDocument(doc.contentType, doc.originalFileName);
    const canOfficePreview = isOfficePreviewable(doc.contentType, doc.originalFileName);

    try {
      const latestCompany = await prisma.company.findUnique({
        where: { id: doc.companyId },
        select: { userDefinedAllocations: true },
      });
      const latestRoot = asObject(latestCompany?.userDefinedAllocations);
      const latestDataRoom = asObject(latestRoot.dataRoom);
      const indexArray = Array.isArray(latestDataRoom.documentIndex) ? latestDataRoom.documentIndex : [];
      const viewer = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { name: true, email: true },
      });
      const viewedAt = new Date().toISOString();
      const viewerName = String(viewer?.name || viewer?.email || context.email || 'Unknown');
      const updatedIndex = indexArray.map((d: any) =>
        String(d?.documentId || '') === String(id)
          ? {
              ...d,
              lastViewedByUserId: context.userId,
              lastViewedByName: viewerName,
              lastViewedAt: viewedAt,
              viewHistory: [
                {
                  viewedByUserId: context.userId,
                  viewedByName: viewerName,
                  viewedAt,
                },
                ...(Array.isArray(d?.viewHistory) ? d.viewHistory : []),
              ].slice(0, 10),
            }
          : d,
      );
      const nextUDA = appendDataRoomAuditEvents(
        {
          ...latestRoot,
          dataRoom: {
            ...latestDataRoom,
            documentIndex: updatedIndex,
          },
        },
        [
          await buildDataRoomAuditEvent({
            action: 'document_viewed',
            companyId: doc.companyId,
            userId: context.userId,
            userEmail: context.email,
            documentId: id,
            folderId: entry?.folderId ? String(entry.folderId) : null,
            details: {
              contentType: doc.contentType || null,
              previewOnly: true,
              previewMode: canInlinePreview ? 'inline' : canOfficePreview ? 'office_viewer' : 'unsupported',
            },
          }),
        ],
      );
      await prisma.company.update({
        where: { id: doc.companyId },
        data: { userDefinedAllocations: nextUDA as any },
      });
    } catch {
      // Ignore audit-write failures; preview should still work.
    }

    if (canInlinePreview) {
      const isPdf =
        String(doc.contentType || '').toLowerCase() === 'application/pdf' ||
        String(doc.originalFileName || '').toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const pdfViewerUrl = new URL('/dataroom/pdf-view', req.url);
        pdfViewerUrl.searchParams.set('src', doc.blobUrl);
        pdfViewerUrl.searchParams.set('name', doc.originalFileName || 'Document.pdf');
        return NextResponse.redirect(pdfViewerUrl, { status: 302 });
      }
      return NextResponse.redirect(doc.blobUrl, { status: 302 });
    }
    if (canOfficePreview) {
      const sizeBytes = await resolveDocumentSizeBytes(doc.blobUrl, doc.sizeBytes ?? null);
      if (typeof sizeBytes === 'number' && sizeBytes > OFFICE_WEB_VIEWER_MAX_BYTES) {
        const gviewUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(doc.blobUrl)}`;
        return NextResponse.redirect(gviewUrl, { status: 302 });
      }
      const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(doc.blobUrl)}`;
      return NextResponse.redirect(officeViewerUrl, { status: 302 });
    }
    return NextResponse.json(
      { error: 'This file type cannot be previewed yet. Use Download instead.' },
      { status: 422 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to view Data Room document' }, { status: 500 });
  }
}
