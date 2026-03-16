import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';
import { scanDataRoomDocument } from '@/lib/dataroom/malware-scan';

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const documentId = body?.documentId ? String(body.documentId).trim() : null;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
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

    const targetIds = new Set<string>();
    for (const item of currentIndex) {
      const id = String(item?.documentId || '');
      if (!id) continue;
      if (documentId && id !== documentId) continue;
      if (!documentId && String(item?.scanStatus || '') !== 'pending_scan') continue;
      targetIds.add(id);
    }

    if (targetIds.size === 0) {
      return NextResponse.json({ success: true, scanned: 0, message: 'No pending DataRoom scans.' });
    }

    const docs = await prisma.companyDocument.findMany({
      where: {
        companyId,
        id: { in: Array.from(targetIds) },
      },
      select: {
        id: true,
        originalFileName: true,
        contentType: true,
        sizeBytes: true,
      },
    });

    const docMap = new Map(docs.map((d) => [d.id, d]));
    const now = new Date().toISOString();
    const nextIndex = currentIndex.map((item: any) => {
      const id = String(item?.documentId || '');
      if (!targetIds.has(id)) return item;

      const doc = docMap.get(id);
      if (!doc) {
        return {
          ...item,
          scanStatus: 'blocked',
          scanReason: 'Document metadata not found for scan.',
          scannedAt: now,
          updatedAt: now,
        };
      }

      const result = scanDataRoomDocument({
        fileName: doc.originalFileName,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
      });

      return {
        ...item,
        scanStatus: result.status,
        scanReason: result.reason,
        scannedAt: now,
        updatedAt: now,
      };
    });

    const updatedUDA = upsertDataRoomState(company.userDefinedAllocations, { documentIndex: nextIndex });
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({ success: true, scanned: targetIds.size });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to scan DataRoom documents' }, { status: 500 });
  }
}

