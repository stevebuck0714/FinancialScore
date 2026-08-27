import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { indexCompanyDocument } from '@/lib/company-documents/index-document';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const id = String((await context?.params)?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const doc = await prisma.companyDocument.findUnique({
      where: { id },
      select: { id: true, companyId: true, extractionStatus: true },
    });
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const hasAccess = await validateCompanyAccess(doc.companyId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const extractionStatus = String(doc.extractionStatus || '').toUpperCase();
    if (extractionStatus !== 'DONE') {
      return NextResponse.json({ error: `Extraction not ready (${extractionStatus})` }, { status: 422 });
    }

    const result = await indexCompanyDocument({ documentId: doc.id, force: true });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || 'Indexing failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to reindex' }, { status: 500 });
  }
}

