import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import type { OperationalSystemProvider } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ingestOperationalWorkbook } from '@/lib/operational-data/runner';
import { getOperationalAdapter } from '@/lib/operational-data/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

/**
 * Store an uploaded workbook (already registered as a CompanyDocument) as live data for a
 * spreadsheet source. The file is read from the company's own document record, never from a
 * caller-supplied URL.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const sourceCode = String(body.sourceCode || '').trim();
    const documentId = String(body.documentId || '').trim();
    if (!companyId || !sourceCode || !documentId) {
      return NextResponse.json({ ok: false, error: 'companyId, sourceCode and documentId are required' }, { status: 400 });
    }
    if (!(await validateCompanyAccess(companyId))) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const adapter = getOperationalAdapter(sourceCode);
    if (!adapter?.acceptsWorkbookUpload) {
      return NextResponse.json({ ok: false, error: `${sourceCode} does not accept workbook uploads here` }, { status: 400 });
    }
    const connection = await prisma.operationalSystemConnection.findFirst({
      where: { companyId, sourceCode, provider: adapter.provider as OperationalSystemProvider },
      select: { id: true },
    });
    if (!connection) return NextResponse.json({ ok: false, error: `${adapter.label} is not enabled for this company.` }, { status: 400 });

    const document = await prisma.companyDocument.findFirst({
      where: { id: documentId, companyId },
      select: { blobUrl: true, sizeBytes: true, createdAt: true },
    });
    if (!document) return NextResponse.json({ ok: false, error: 'Document not found for this company' }, { status: 404 });
    if ((document.sizeBytes || 0) > MAX_WORKBOOK_BYTES) {
      return NextResponse.json({ ok: false, error: 'Workbook is larger than 25 MB' }, { status: 413 });
    }

    const response = await fetch(document.blobUrl);
    if (!response.ok) return NextResponse.json({ ok: false, error: `Failed to fetch uploaded workbook (${response.status})` }, { status: 400 });
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer', cellDates: false });

    const result = await ingestOperationalWorkbook({ companyId, sourceCode, workbook, uploadedAt: document.createdAt });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workbook import failed';
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
