import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;

    const doc = await prisma.companyDocument.findUnique({
      where: { id },
      select: { blobUrl: true, companyId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const hasAccess = await validateCompanyAccess(doc.companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: doc.companyId },
      select: { userDefinedAllocations: true },
    });
    const dataRoomIndex =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? (company.userDefinedAllocations as any)?.dataRoom?.documentIndex
        : null;
    if (Array.isArray(dataRoomIndex)) {
      const entry = dataRoomIndex.find((d: any) => String(d?.documentId || '') === String(id));
      const scanStatus = String(entry?.scanStatus || '');
      if (entry && scanStatus !== 'clean') {
        return NextResponse.json(
          { error: `Document is quarantined until malware scan is clean (current status: ${scanStatus || 'pending_scan'}).` },
          { status: 423 },
        );
      }
    }

    // We use a redirect so this URL can be used both as:
    // - a "hyperlink to open the document"
    // - a stable URL for AI citations
    return NextResponse.redirect(doc.blobUrl, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to open document' }, { status: 500 });
  }
}

