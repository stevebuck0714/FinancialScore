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

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth();
    const { id } = await ctx.params;

    const doc = await prisma.dataRoomDocument.findUnique({
      where: { id },
      select: { blobUrl: true, companyId: true },
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
    if (!caps.download) {
      const nextUDA = appendDataRoomAuditEvents(company?.userDefinedAllocations, [
        await buildDataRoomAuditEvent({
          action: 'document_open_blocked',
          companyId: doc.companyId,
          userId: context.userId,
          userEmail: context.email,
          documentId: id,
          folderId: entry?.folderId ? String(entry.folderId) : null,
          details: { reason: 'download_not_allowed' },
        }),
      ]);
      await prisma.company.update({
        where: { id: doc.companyId },
        data: { userDefinedAllocations: nextUDA as any },
      });
      return NextResponse.json({ error: 'Download is not allowed for this document.' }, { status: 403 });
    }

    const scanStatus = String(entry?.scanStatus || '');
    if (scanStatus !== 'clean') {
      const nextUDA = appendDataRoomAuditEvents(company?.userDefinedAllocations, [
        await buildDataRoomAuditEvent({
          action: 'document_open_blocked',
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

    let watermarkHeaderValue: string | null = null;
    try {
      const latestCompany = await prisma.company.findUnique({
        where: { id: doc.companyId },
        select: { userDefinedAllocations: true },
      });
      const latestRoot = asObject(latestCompany?.userDefinedAllocations);
      const latestDataRoom = asObject(latestRoot.dataRoom);
      const indexArray = Array.isArray(latestDataRoom.documentIndex) ? latestDataRoom.documentIndex : [];
      const downloader = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { name: true, email: true },
      });
      const downloadedAt = new Date().toISOString();
      const downloaderName = String(downloader?.name || downloader?.email || context.email || 'Unknown');
      const updatedIndex = indexArray.map((d: any) =>
        String(d?.documentId || '') === String(id)
          ? {
              ...d,
              lastDownloadedByUserId: context.userId,
              lastDownloadedByName: downloaderName,
              lastDownloadedAt: downloadedAt,
              downloadHistory: [
                {
                  downloadedByUserId: context.userId,
                  downloadedByName: downloaderName,
                  downloadedAt,
                },
                ...(Array.isArray(d?.downloadHistory) ? d.downloadHistory : []),
              ].slice(0, 10),
            }
          : d,
      );
      if (Boolean(entry?.watermarkOnDownload)) {
        watermarkHeaderValue = `Corelytics | ${context.email} | ${downloadedAt}`;
      }
      const updatedUDA = appendDataRoomAuditEvents(
        {
          ...latestRoot,
          dataRoom: {
            ...latestDataRoom,
            documentIndex: updatedIndex,
          },
        },
        [
          await buildDataRoomAuditEvent({
            action: 'document_opened',
            companyId: doc.companyId,
            userId: context.userId,
            userEmail: context.email,
            documentId: id,
            folderId: entry?.folderId ? String(entry.folderId) : null,
            details: {
              watermarkOnDownload: Boolean(entry?.watermarkOnDownload),
              downloadDisabled: Boolean(entry?.downloadDisabled),
            },
          }),
        ],
      );
      await prisma.company.update({
        where: { id: doc.companyId },
        data: { userDefinedAllocations: updatedUDA as any },
      });
    } catch {
      // Ignore audit-write failures; document open should still succeed.
    }

    const response = NextResponse.redirect(doc.blobUrl, { status: 302 });
    if (watermarkHeaderValue) {
      response.headers.set('x-corelytics-watermark', watermarkHeaderValue);
    }
    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to open Data Room document' }, { status: 500 });
  }
}
