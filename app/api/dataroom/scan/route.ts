import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';
import { scanDataRoomDocument } from '@/lib/dataroom/malware-scan';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
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

    const capabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
    });
    if (!capabilities.manage) {
      return NextResponse.json({ error: 'Forbidden: manage access required' }, { status: 403 });
    }

    const state = getDataRoomState(company.userDefinedAllocations);
    const currentIndex = Array.isArray(state.documentIndex) ? state.documentIndex : [];

    const targetIds = new Set<string>();
    for (const item of currentIndex) {
      const id = String(item?.documentId || '');
      if (!id) continue;
      if (documentId && id !== documentId) continue;
      // Treat missing scanStatus as pending_scan for backward compatibility
      // with documents indexed before scanStatus was introduced.
      const currentStatus = String(item?.scanStatus || 'pending_scan');
      if (!documentId && currentStatus !== 'pending_scan') continue;
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

    const blockedCount = nextIndex.filter((d: any) => targetIds.has(String(d?.documentId || '')) && String(d?.scanStatus || '') === 'blocked').length;
    const cleanCount = nextIndex.filter((d: any) => targetIds.has(String(d?.documentId || '')) && String(d?.scanStatus || '') === 'clean').length;
    const updatedUDA = appendDataRoomAuditEvents(
      upsertDataRoomState(company.userDefinedAllocations, { documentIndex: nextIndex }),
      [
        buildDataRoomAuditEvent({
          action: 'scan_completed',
          companyId,
          userId: context.userId,
          userEmail: context.email,
          documentId: documentId || null,
          details: {
            scannedCount: targetIds.size,
            cleanCount,
            blockedCount,
            mode: documentId ? 'single' : 'batch',
          },
        }),
      ],
    );
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({ success: true, scanned: targetIds.size });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to scan DataRoom documents' }, { status: 500 });
  }
}

