import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  applyDocumentPolicyOverrides,
  isCompanyAdminForDataRoom,
  resolveDataRoomCapabilities,
} from '@/lib/dataroom/access';
import { getDataRoomState } from '@/lib/dataroom/state';
import { readDataRoomBlobStream } from '@/lib/dataroom/blob-storage';

export const dynamic = 'force-dynamic';

function contentDisposition(kind: 'inline' | 'attachment', fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Streams a Data Room file through the app so private-store files are never
 * exposed by URL. The view and open routes log the access and redirect here.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth();
    const { id } = await ctx.params;
    const download = req.nextUrl.searchParams.get('download') === '1';

    const doc = await prisma.dataRoomDocument.findUnique({
      where: { id },
      select: { blobUrl: true, storageAccess: true, companyId: true, contentType: true, originalFileName: true },
    });
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await validateCompanyAccess(doc.companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: doc.companyId },
      select: { userDefinedAllocations: true },
    });
    const entry = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>).find(
      (d) => String(d?.documentId || '') === id,
    );
    if (!entry) return NextResponse.json({ error: 'Data Room document is not indexed' }, { status: 404 });

    const isCompanyAdmin =
      context.role === 'SITEADMIN' ||
      context.role === 'CONSULTANT' ||
      (await isCompanyAdminForDataRoom(context.userId, doc.companyId));
    const caps = applyDocumentPolicyOverrides(
      await resolveDataRoomCapabilities({
        userId: context.userId,
        role: context.role,
        companyId: doc.companyId,
        userDefinedAllocations: company?.userDefinedAllocations,
        folderId: entry.folderId ? String(entry.folderId) : null,
        documentId: id,
        isCompanyAdmin,
      }),
      entry,
    );
    if (download ? !caps.download : !caps.view) {
      return NextResponse.json({ error: download ? 'Download is not allowed for this document.' : 'View is not allowed for this document.' }, { status: 403 });
    }
    if (String(entry.scanStatus || '') !== 'clean') {
      return NextResponse.json({ error: 'Document is quarantined until malware scan is clean.' }, { status: 423 });
    }

    const file = await readDataRoomBlobStream(doc);
    const headers = new Headers({
      'Content-Type': doc.contentType || file.contentType || 'application/octet-stream',
      'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', doc.originalFileName || 'document'),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (file.size !== null) headers.set('Content-Length', String(file.size));
    return new Response(file.stream, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load Data Room document' }, { status: 500 });
  }
}
