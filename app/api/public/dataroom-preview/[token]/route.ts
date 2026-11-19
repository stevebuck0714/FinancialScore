import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDataRoomState } from '@/lib/dataroom/state';
import { readDataRoomBlobStream } from '@/lib/dataroom/blob-storage';
import { verifyDataRoomPreviewToken } from '@/lib/dataroom/preview-link';

export const dynamic = 'force-dynamic';

/**
 * Serves a private Data Room file to the Microsoft/Google web viewers, which
 * fetch from their own servers without the user's session. Access was checked
 * and logged by the view route that minted the short-lived signed token.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const id = verifyDataRoomPreviewToken(token);
    if (!id) return NextResponse.json({ error: 'Preview link expired' }, { status: 410 });

    const doc = await prisma.dataRoomDocument.findUnique({
      where: { id },
      select: { blobUrl: true, storageAccess: true, companyId: true, contentType: true, originalFileName: true },
    });
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const company = await prisma.company.findUnique({
      where: { id: doc.companyId },
      select: { userDefinedAllocations: true },
    });
    const entry = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>).find(
      (d) => String(d?.documentId || '') === id,
    );
    if (!entry || String(entry.scanStatus || '') !== 'clean') {
      return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    const file = await readDataRoomBlobStream(doc);
    const fileName = (doc.originalFileName || 'document').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    const headers = new Headers({
      'Content-Type': doc.contentType || file.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    if (file.size !== null) headers.set('Content-Length', String(file.size));
    return new Response(file.stream, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to load preview' }, { status: 500 });
  }
}
