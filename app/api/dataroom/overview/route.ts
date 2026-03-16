import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { DATAROOM_DEFAULT_FOLDERS } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import {
  applyDocumentPolicyOverrides,
  isCompanyAdminForDataRoom,
  resolveDataRoomCapabilities,
} from '@/lib/dataroom/access';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';

function getDisplayName(name: string | null | undefined, email: string | null | undefined) {
  const trimmedName = String(name || '').trim();
  if (trimmedName) return trimmedName;
  const trimmedEmail = String(email || '').trim();
  if (trimmedEmail) {
    const beforeAt = trimmedEmail.split('@')[0]?.trim();
    if (beforeAt) return beforeAt;
    return trimmedEmail;
  }
  return 'Unknown';
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const docs = await prisma.companyDocument.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalFileName: true,
        contentType: true,
        sizeBytes: true,
        createdAt: true,
        extractionStatus: true,
        uploadedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const state = getDataRoomState(company.userDefinedAllocations);
    const isCompanyAdmin =
      context.role === 'SITEADMIN' ||
      context.role === 'CONSULTANT' ||
      (await isCompanyAdminForDataRoom(context.userId, companyId));
    const baseCapabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
      isCompanyAdmin,
    });
    if (!baseCapabilities.view) {
      return NextResponse.json({ error: 'Forbidden: DataRoom view access required' }, { status: 403 });
    }

    const folders = state.folders;
    if (!Array.isArray(folders) || folders.length === 0) {
      return NextResponse.json(
        { error: 'DataRoom folders are not configured for this company. Re-enable DataRoom to initialize defaults.' },
        { status: 409 },
      );
    }
    const indexMap = new Map<string, any>();
    for (const item of state.documentIndex) {
      if (item?.documentId) indexMap.set(String(item.documentId), item);
    }

    const folderIds = new Set(folders.map((f: any) => String(f.id)));
    const fallbackFolderId = String(DATAROOM_DEFAULT_FOLDERS[0].id);
    const grouped = folders.map((f: any) => ({ ...f, documents: [] as any[] }));
    const groupedById = new Map<string, any>(grouped.map((f: any) => [String(f.id), f]));

    for (const doc of docs) {
      const idx = indexMap.get(doc.id);
      if (!idx) continue;
      const folderIdRaw = String(idx?.folderId || '');
      const folderId = folderIds.has(folderIdRaw) ? folderIdRaw : fallbackFolderId;
      const perDocBaseCaps = await resolveDataRoomCapabilities({
        userId: context.userId,
        role: context.role,
        companyId,
        userDefinedAllocations: company.userDefinedAllocations,
        folderId,
        documentId: doc.id,
        isCompanyAdmin,
      });
      const perDocCaps = applyDocumentPolicyOverrides(perDocBaseCaps, idx);
      if (!perDocCaps.view) continue;
      const target = groupedById.get(folderId);
      if (!target) continue;
      const history = Array.isArray(idx?.downloadHistory)
        ? idx.downloadHistory
            .map((h: any) => ({
              downloadedByName: h?.downloadedByName ? String(h.downloadedByName) : null,
              downloadedAt: h?.downloadedAt ? String(h.downloadedAt) : null,
            }))
            .filter((h: any) => h.downloadedByName || h.downloadedAt)
        : [];
      target.documents.push({
        id: doc.id,
        folderId,
        originalFileName: doc.originalFileName,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt,
        extractionStatus: doc.extractionStatus,
        scanStatus: String(idx?.scanStatus || 'pending_scan'),
        uploadedByName: getDisplayName(doc.uploadedBy?.name, doc.uploadedBy?.email),
        lastDownloadedByName: idx?.lastDownloadedByName ? String(idx.lastDownloadedByName) : null,
        lastDownloadedAt: idx?.lastDownloadedAt ? String(idx.lastDownloadedAt) : null,
        downloadHistory: history,
        canDownload: perDocCaps.download,
        canManage: perDocCaps.manage,
      });
    }

    // Keep each folder list in chronological order (oldest -> newest).
    for (const folder of grouped) {
      folder.documents.sort(
        (a: any, b: any) =>
          new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
      );
    }

    try {
      const updatedUDA = appendDataRoomAuditEvents(company.userDefinedAllocations, [
        buildDataRoomAuditEvent({
          action: 'overview_viewed',
          companyId,
          userId: context.userId,
          userEmail: context.email,
          details: {
            visibleFolderCount: grouped.length,
            visibleDocumentCount: grouped.reduce((sum: number, f: any) => sum + (Array.isArray(f.documents) ? f.documents.length : 0), 0),
          },
        }),
      ]);
      await prisma.company.update({
        where: { id: companyId },
        data: { userDefinedAllocations: updatedUDA as any },
      });
    } catch {
      // Best-effort audit write.
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      enabledByAdmin: Boolean(state.dataRoom.enabledByAdmin),
      subscription: state.subscription,
      capabilities: baseCapabilities,
      folders: grouped,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load DataRoom overview' }, { status: 500 });
  }
}

