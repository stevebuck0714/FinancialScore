import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getDataRoomState, upsertDataRoomState } from '@/lib/dataroom/state';
import { scanDataRoomDocumentWithProvider } from '@/lib/dataroom/scan-provider';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';

const MAX_SCAN_ATTEMPTS = Number(process.env.DATAROOM_SCAN_MAX_ATTEMPTS || 5);
const BASE_RETRY_SECONDS = Number(process.env.DATAROOM_SCAN_BASE_RETRY_SECONDS || 30);

function canRetry(item: any, nowMs: number) {
  const attempts = Number(item?.scanAttempts || 0);
  if (attempts >= MAX_SCAN_ATTEMPTS) return false;
  const nextScanAt = item?.nextScanAt ? new Date(item.nextScanAt).getTime() : 0;
  return Number.isFinite(nextScanAt) ? nextScanAt <= nowMs : true;
}

function nextRetryAt(attempts: number) {
  const backoffSeconds = BASE_RETRY_SECONDS * Math.pow(2, Math.max(0, attempts - 1));
  return new Date(Date.now() + backoffSeconds * 1000).toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const documentId = body?.documentId ? String(body.documentId).trim() : null;
    const force = body?.force === true;

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

    const nowMs = Date.now();
    const targetIds = new Set<string>();
    for (const item of currentIndex) {
      const id = String(item?.documentId || '');
      if (!id) continue;
      if (documentId && id !== documentId) continue;
      const status = String(item?.scanStatus || 'pending_scan').toLowerCase();
      const retryEligible = force || canRetry(item, nowMs);
      if (documentId) {
        if (retryEligible) targetIds.add(id);
        continue;
      }
      const isQueued = status === 'pending_scan' || status === 'scan_failed';
      if (isQueued && retryEligible) targetIds.add(id);
    }

    if (targetIds.size === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        cleanCount: 0,
        blockedCount: 0,
        failedCount: 0,
        message: 'No queued DataRoom scans.',
      });
    }

    const docs = await prisma.dataRoomDocument.findMany({
      where: { companyId, id: { in: Array.from(targetIds) } },
      select: {
        id: true,
        originalFileName: true,
        contentType: true,
        sizeBytes: true,
        blobUrl: true,
      },
    });

    const docMap = new Map(docs.map((d) => [d.id, d]));
    const now = new Date().toISOString();
    let cleanCount = 0;
    let blockedCount = 0;
    let failedCount = 0;

    const nextIndex: any[] = [];
    for (const item of currentIndex) {
      const id = String(item?.documentId || '');
      if (!targetIds.has(id)) {
        nextIndex.push(item);
        continue;
      }

      const attempts = Number(item?.scanAttempts || 0) + 1;
      const doc = docMap.get(id);
      if (!doc) {
        failedCount += 1;
        nextIndex.push({
          ...item,
          scanStatus: 'scan_failed',
          scanReason: item?.scanReason || null,
          scanAttempts: attempts,
          scanLastError: 'Document metadata not found for scan.',
          nextScanAt: attempts >= MAX_SCAN_ATTEMPTS ? null : nextRetryAt(attempts),
          updatedAt: now,
        });
        continue;
      }

      try {
        const result = await scanDataRoomDocumentWithProvider({
          fileUrl: doc.blobUrl || null,
          fileName: doc.originalFileName,
          contentType: doc.contentType,
          sizeBytes: doc.sizeBytes,
        });
        if (result.status === 'clean') cleanCount += 1;
        if (result.status === 'blocked') blockedCount += 1;
        nextIndex.push({
          ...item,
          scanStatus: result.status,
          scanReason: result.reason,
          scannedAt: now,
          scanAttempts: attempts,
          scanProvider: result.provider || 'policy',
          scanLastError: null,
          nextScanAt: null,
          updatedAt: now,
        });
      } catch (error: any) {
        failedCount += 1;
        const message = String(error?.message || 'Scan provider failed');
        nextIndex.push({
          ...item,
          scanStatus: 'scan_failed',
          scanReason: item?.scanReason || null,
          scanAttempts: attempts,
          scanLastError: message,
          nextScanAt: attempts >= MAX_SCAN_ATTEMPTS ? null : nextRetryAt(attempts),
          updatedAt: now,
        });
      }
    }

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
            failedCount,
            mode: documentId ? 'single' : 'batch',
            force,
            maxAttempts: MAX_SCAN_ATTEMPTS,
          },
        }),
      ],
    );
    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA },
    });

    return NextResponse.json({
      success: true,
      scanned: targetIds.size,
      cleanCount,
      blockedCount,
      failedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to scan DataRoom documents' }, { status: 500 });
  }
}

