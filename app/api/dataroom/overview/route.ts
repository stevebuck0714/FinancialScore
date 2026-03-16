import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { DATAROOM_DEFAULT_FOLDERS } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
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
      },
    });

    const state = getDataRoomState(company.userDefinedAllocations);
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
      const target = groupedById.get(folderId);
      if (!target) continue;
      target.documents.push({
        id: doc.id,
        folderId,
        originalFileName: doc.originalFileName,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt,
        extractionStatus: doc.extractionStatus,
        scanStatus: String(idx?.scanStatus || 'pending_scan'),
      });
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      enabledByAdmin: Boolean(state.dataRoom.enabledByAdmin),
      subscription: state.subscription,
      folders: grouped,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load DataRoom overview' }, { status: 500 });
  }
}

