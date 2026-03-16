import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { DATAROOM_DEFAULT_FOLDERS } from '@/lib/dataroom/constants';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
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

    const doc = await prisma.companyDocument.findUnique({
      where: { id: documentId },
      select: { id: true, companyId: true },
    });
    if (!doc || doc.companyId !== companyId) {
      return NextResponse.json({ error: 'Document not found for this company' }, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const state = getDataRoomState(company.userDefinedAllocations);
    const validFolderIds = new Set((state.folders || DATAROOM_DEFAULT_FOLDERS).map((f: any) => String(f.id)));
    if (!validFolderIds.has(folderId)) {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }

    const currentIndex = Array.isArray(state.documentIndex) ? state.documentIndex : [];
    const filtered = currentIndex.filter((d: any) => String(d?.documentId || '') !== documentId);
    filtered.push({
      documentId,
      folderId,
      scanStatus: 'pending_scan',
      scanReason: null,
      scanQueuedAt: new Date().toISOString(),
      watermarkOnDownload: true,
      updatedAt: new Date().toISOString(),
    });

    const updatedUDA = upsertDataRoomState(company.userDefinedAllocations, { documentIndex: filtered });
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to assign DataRoom document' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
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

    const updatedUDA = upsertDataRoomState(company.userDefinedAllocations, { documentIndex: nextIndex });
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
    await requireAuth();
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

    const state = getDataRoomState(company.userDefinedAllocations);
    const currentIndex = Array.isArray(state.documentIndex) ? state.documentIndex : [];
    const nextIndex = currentIndex.filter((d: any) => String(d?.documentId || '') !== documentId);

    if (nextIndex.length === currentIndex.length) {
      return NextResponse.json({ error: 'Document is not currently indexed in DataRoom' }, { status: 404 });
    }

    const updatedUDA = upsertDataRoomState(company.userDefinedAllocations, { documentIndex: nextIndex });
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to remove DataRoom document index' }, { status: 500 });
  }
}

