import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { del } from '@vercel/blob';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;

    const doc = await prisma.companyDocument.findUnique({
      where: { id },
      select: { id: true, companyId: true, blobUrl: true },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const hasAccess = await validateCompanyAccess(doc.companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Best-effort delete from blob store, then remove DB record.
    try {
      await del(doc.blobUrl);
    } catch (e) {
      // Ignore blob deletion errors; still delete DB record.
      console.warn('Blob delete failed (ignored):', e);
    }

    await prisma.companyDocument.delete({ where: { id: doc.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete document' }, { status: 500 });
  }
}

