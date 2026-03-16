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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth();
    const { id } = await ctx.params;

    const doc = await prisma.companyDocument.findUnique({
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
    let watermarkHeaderValue: string | null = null;
    const dataRoomIndex =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? (company.userDefinedAllocations as any)?.dataRoom?.documentIndex
        : null;
    if (Array.isArray(dataRoomIndex)) {
      const entry = dataRoomIndex.find((d: any) => String(d?.documentId || '') === String(id));
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
        try {
          const nextUDA = appendDataRoomAuditEvents(company?.userDefinedAllocations, [
            buildDataRoomAuditEvent({
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
        } catch {
          // Ignore audit-write failures.
        }
        return NextResponse.json({ error: 'Download is not allowed for this document.' }, { status: 403 });
      }

      const scanStatus = String(entry?.scanStatus || '');
      if (entry && scanStatus !== 'clean') {
        try {
          const nextUDA = appendDataRoomAuditEvents(company?.userDefinedAllocations, [
            buildDataRoomAuditEvent({
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
        } catch {
          // Ignore audit-write failures.
        }
        return NextResponse.json(
          { error: `Document is quarantined until malware scan is clean (current status: ${scanStatus || 'pending_scan'}).` },
          { status: 423 },
        );
      }

      // Best-effort audit trail in DataRoom index for last downloader.
      // This powers lightweight "Downloaded by" display in DataRoom rows.
      try {
        const root =
          company?.userDefinedAllocations &&
          typeof company.userDefinedAllocations === 'object' &&
          !Array.isArray(company.userDefinedAllocations)
            ? (company.userDefinedAllocations as any)
            : {};
        const dataRoom =
          root?.dataRoom && typeof root.dataRoom === 'object' && !Array.isArray(root.dataRoom)
            ? root.dataRoom
            : {};
        const indexArray = Array.isArray(dataRoom.documentIndex) ? dataRoom.documentIndex : [];
        const downloader = await prisma.user.findUnique({
          where: { id: context.userId },
          select: { name: true, email: true },
        });
        const downloadedAt = new Date().toISOString();
        const downloaderName = String(downloader?.name || downloader?.email || context.email || 'Unknown');
        const updatedIndex = indexArray.map((d: any) =>
          String(d?.documentId || '') === String(id)
            ? (() => {
                const historyRaw = Array.isArray(d?.downloadHistory) ? d.downloadHistory : [];
                const nextHistory = [
                  {
                    downloadedByUserId: context.userId,
                    downloadedByName: downloaderName,
                    downloadedAt,
                  },
                  ...historyRaw,
                ].slice(0, 10);
                return {
                  ...d,
                  lastDownloadedByUserId: context.userId,
                  lastDownloadedByName: downloaderName,
                  lastDownloadedAt: downloadedAt,
                  downloadHistory: nextHistory,
                };
              })()
            : d
        );
        if (Boolean(entry?.watermarkOnDownload)) {
          watermarkHeaderValue = `Corelytics | ${context.email} | ${downloadedAt}`;
        }
        const updatedUDA = appendDataRoomAuditEvents(
          {
            ...root,
            dataRoom: {
              ...dataRoom,
              documentIndex: updatedIndex,
            },
          },
          [
            buildDataRoomAuditEvent({
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
          data: {
            userDefinedAllocations: updatedUDA as any,
          },
        });
      } catch {
        // Ignore audit-write failures; document open should still succeed.
      }
    }

    // We use a redirect so this URL can be used both as:
    // - a "hyperlink to open the document"
    // - a stable URL for AI citations
    const response = NextResponse.redirect(doc.blobUrl, { status: 302 });
    if (watermarkHeaderValue) {
      // For clients/services that can consume this marker and apply visual watermarking.
      response.headers.set('x-corelytics-watermark', watermarkHeaderValue);
    }
    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to open document' }, { status: 500 });
  }
}

