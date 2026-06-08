import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';
const OFFICE_WEB_VIEWER_MAX_BYTES = 25 * 1024 * 1024;

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
    await requireAuth();
    const { id } = await ctx.params;

    const doc = await prisma.companyDocument.findUnique({
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

    const canInlinePreview = isPreviewableDocument(doc.contentType, doc.originalFileName);
    const canOfficePreview = isOfficePreviewable(doc.contentType, doc.originalFileName);

    if (canInlinePreview) {
      const isPdf =
        String(doc.contentType || '').toLowerCase() === 'application/pdf' ||
        String(doc.originalFileName || '').toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const pdfViewerUrl = new URL('/documents/pdf-view', req.url);
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
    return NextResponse.json({ error: e?.message || 'Failed to view document' }, { status: 500 });
  }
}

